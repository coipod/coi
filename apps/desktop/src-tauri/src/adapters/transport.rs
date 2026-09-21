//! Owned, bounded stdio transport. No raw stdout/stderr persistence.
use crate::Result;
use serde_json::Value;
use std::{
    io::{Read, Write},
    path::Path,
    process::{Child, Command, Stdio},
    sync::mpsc::{self, Receiver, RecvTimeoutError, SyncSender},
    thread,
    time::Duration,
};
pub struct StdioTransport {
    child: Child,
    reaped: bool,
    pub(crate) exit_success: Option<bool>,
    input: SyncSender<(Vec<u8>, SyncSender<Result<()>>)>,
    output: Receiver<Result<Vec<u8>>>,
    #[cfg(windows)]
    job: WindowsJob,
}
impl StdioTransport {
    // Internal transport: callers must enforce the capability gate before invoking.
    #[cfg_attr(not(test), allow(dead_code))]
    pub(crate) fn spawn(executable: &Path, args: &[&str], cwd: &Path) -> Result<Self> {
        let mut cmd = Command::new(executable);
        cmd.env("AGY_CLI_DISABLE_AUTO_UPDATE", "true")
            .env("DISABLE_AUTOUPDATER", "1")
            .args(args)
            .current_dir(cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }
        let mut child = cmd.spawn().map_err(|e| e.to_string())?;
        #[cfg(windows)]
        let job = match WindowsJob::attach(&child) {
            Ok(job) => job,
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(e);
            }
        };
        let mut stdin = child.stdin.take().ok_or("missing stdin")?;
        let (input, writes) = mpsc::sync_channel::<(Vec<u8>, SyncSender<Result<()>>)>(2);
        thread::spawn(move || {
            while let Ok((bytes, ack)) = writes.recv() {
                let result = stdin
                    .write_all(&bytes)
                    .and_then(|_| stdin.flush())
                    .map_err(|_| "provider_write_error".to_string());
                let failed = result.is_err();
                let _ = ack.send(result);
                if failed {
                    break;
                }
            }
        });
        let mut stdout = child.stdout.take().ok_or("missing stdout")?;
        let (tx, output) = mpsc::sync_channel(64);
        thread::spawn(move || {
            let mut buffer = [0u8; 8192];
            loop {
                match stdout.read(&mut buffer) {
                    Ok(0) => {
                        let _ = tx.send(Err("provider_exited".into()));
                        break;
                    }
                    Ok(n) => {
                        if tx.send(Ok(buffer[..n].to_vec())).is_err() {
                            break;
                        }
                    }
                    Err(_) => {
                        let _ = tx.send(Err("provider_read_error".into()));
                        break;
                    }
                }
            }
        });
        Ok(Self {
            child,
            reaped: false,
            exit_success: None,
            input,
            output,
            #[cfg(windows)]
            job,
        })
    }
    pub fn send(&mut self, value: &Value) -> Result<()> {
        let mut bytes = serde_json::to_vec(value).map_err(|e| e.to_string())?;
        if bytes.len() > 1024 * 1024 {
            return Err("request too large".into());
        }
        bytes.push(b'\n');
        let (ack, received) = mpsc::sync_channel(1);
        self.input
            .try_send((bytes, ack))
            .map_err(|_| "provider_write_queue_unavailable".to_string())?;
        // A provider that stops reading cannot block Stop or app shutdown.
        // The caller must terminate after a timeout: wire delivery is uncertain.
        received
            .recv_timeout(Duration::from_millis(500))
            .map_err(|_| "provider_write_timeout".to_string())?
    }
    pub fn receive(&self, timeout: Duration) -> Result<Vec<u8>> {
        self.output.recv_timeout(timeout).map_err(|e| match e {
            RecvTimeoutError::Timeout => "provider_timeout".to_string(),
            RecvTimeoutError::Disconnected => "provider_exited".to_string(),
        })?
    }
    pub fn cancel(&mut self, interrupt: Option<&Value>) -> Result<()> {
        if let Some(v) = interrupt {
            let _ = self.send(v);
        }
        // Keep the parent unreaped until its group has been killed. Otherwise a
        // graceful parent exit can leave grandchildren alive or free its PID.
        #[cfg(unix)]
        {
            let until = std::time::Instant::now() + Duration::from_secs(5);
            while std::time::Instant::now() < until {
                let mut info: libc::siginfo_t = unsafe { std::mem::zeroed() };
                let rc = unsafe {
                    libc::waitid(
                        libc::P_PID,
                        self.child.id(),
                        &mut info,
                        libc::WEXITED | libc::WNOHANG | libc::WNOWAIT,
                    )
                };
                if rc != 0 || unsafe { info.si_pid() } != 0 {
                    break;
                }
                thread::sleep(Duration::from_millis(20));
            }
        }
        #[cfg(windows)]
        {
            use wait_timeout::ChildExt;
            let _ = self.child.wait_timeout(Duration::from_secs(5));
        }
        self.terminate()
    }
    pub(crate) fn terminate(&mut self) -> Result<()> {
        if self.reaped {
            return Ok(());
        }
        #[cfg(unix)]
        {
            // This PID belongs to this live Child handle; persisted PIDs are never killed.
            unsafe {
                libc::killpg(self.child.id() as i32, libc::SIGKILL);
            }
        }
        #[cfg(windows)]
        {
            self.job.terminate();
        }
        let _ = self.child.kill();
        let result = self
            .child
            .wait()
            .map(|status| {
                self.exit_success = Some(status.success());
            })
            .map_err(|e| e.to_string());
        if result.is_ok() {
            self.reaped = true;
        }
        result
    }
}
impl Drop for StdioTransport {
    fn drop(&mut self) {
        let _ = self.terminate();
    }
}
#[cfg(windows)]
struct WindowsJob(windows_sys::Win32::Foundation::HANDLE);
// Owned kernel Job handles may move between threads. There is one owner, no
// duplicated handle, and termination/close are serialized by that owner.
#[cfg(windows)]
unsafe impl Send for WindowsJob {}
#[cfg(windows)]
impl WindowsJob {
    fn attach(child: &Child) -> Result<Self> {
        use std::{
            mem::{size_of, zeroed},
            os::windows::io::AsRawHandle,
            ptr,
        };
        use windows_sys::Win32::{Foundation::CloseHandle, System::JobObjects::*};
        unsafe {
            let job = CreateJobObjectW(ptr::null(), ptr::null());
            if job.is_null() {
                return Err("Could not create owned process Job".into());
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                (&info as *const _) as *const _,
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            ) == 0
                || AssignProcessToJobObject(job, child.as_raw_handle()) == 0
            {
                CloseHandle(job);
                return Err("Could not attach process to Job; execution blocked".into());
            }
            Ok(Self(job))
        }
    }
    fn terminate(&self) {
        unsafe {
            windows_sys::Win32::System::JobObjects::TerminateJobObject(self.0, 1);
        }
    }
}
#[cfg(windows)]
impl Drop for WindowsJob {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::codex::{Protocol, Signal};
    #[cfg(unix)]
    #[test]
    fn graceful_parent_exit_does_not_leave_descendant_running() {
        let node = which::which("node").unwrap();
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../..")
            .canonicalize()
            .unwrap();
        let script = root.join("tests/fixtures/cli/orphan-parent.cjs");
        let mut t = StdioTransport::spawn(&node, &[script.to_str().unwrap()], &root).unwrap();
        let frame = t.receive(Duration::from_secs(3)).unwrap();
        let descendant = serde_json::from_slice::<Value>(&frame).unwrap()["descendant"]
            .as_i64()
            .unwrap() as i32;
        t.cancel(Some(&serde_json::json!({"method":"exit"})))
            .unwrap();
        assert!(t.reaped);
        let until = std::time::Instant::now() + Duration::from_secs(3);
        loop {
            let alive = unsafe { libc::kill(descendant, 0) } == 0;
            if !alive {
                break;
            }
            // A terminated orphan can briefly remain as a zombie pending OS reaping.
            let status = Command::new("ps")
                .args(["-p", &descendant.to_string(), "-o", "stat="])
                .output()
                .unwrap();
            if String::from_utf8_lossy(&status.stdout)
                .trim_start()
                .starts_with('Z')
            {
                break;
            }
            assert!(
                std::time::Instant::now() < until,
                "owned descendant remains running"
            );
            thread::sleep(Duration::from_millis(20));
        }
    }
    #[test]
    fn non_reading_provider_cannot_block_write_or_termination() {
        let node = which::which("node").unwrap();
        let cwd = std::env::temp_dir();
        let mut t = StdioTransport::spawn(
            &node,
            &[
                "-e",
                "process.stdout.write('ready\\n');setInterval(()=>{},1000)",
            ],
            &cwd,
        )
        .unwrap();
        t.receive(Duration::from_secs(3)).unwrap();
        let before = std::time::Instant::now();
        let result = t.send(&serde_json::json!({"text":"x".repeat(900_000)}));
        assert_eq!(result.unwrap_err(), "provider_write_timeout");
        t.terminate().unwrap();
        assert!(before.elapsed() < Duration::from_secs(3));
        assert!(t.reaped);
    }
    #[test]
    fn fixture_handshake_stream_approval_and_cancellation() {
        let node = which::which("node").expect("Node required for fixture test");
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../..")
            .canonicalize()
            .unwrap();
        let script = root.join("tests/fixtures/cli/fake-app-server.cjs");
        let mut t = StdioTransport::spawn(&node, &[script.to_str().unwrap()], &root).unwrap();
        let mut protocol = Protocol::default();
        t.send(&Protocol::initialize()).unwrap();
        let mut signals = vec![];
        while signals.is_empty() {
            signals.extend(
                protocol
                    .feed(&t.receive(Duration::from_secs(3)).unwrap())
                    .unwrap(),
            );
        }
        assert!(matches!(signals[0], Signal::Response(1, _)));
        t.send(&serde_json::json!({"method":"initialized"}))
            .unwrap();
        // These minimal messages are fixture inputs, not an execution policy.
        t.send(&serde_json::json!({"id":2,"method":"thread/start","params":{"cwd":"/task-copy"}}))
            .unwrap();
        let mut has_thread = false;
        while !has_thread {
            protocol
                .push(&t.receive(Duration::from_secs(3)).unwrap())
                .unwrap();
            while let Some(signals) = protocol.next_frame().unwrap() {
                for s in signals {
                    if let Signal::Response(2, v) = s {
                        protocol.thread = v["thread"]["id"].as_str().map(String::from);
                        has_thread = true;
                    }
                }
            }
        }
        t.send(&serde_json::json!({"id":3,"method":"turn/start","params":{"threadId":"fixture-thread","input":[{"type":"text","text":"hello"}]}})).unwrap();
        let key = loop {
            let mut key = None;
            for s in protocol
                .feed(&t.receive(Duration::from_secs(3)).unwrap())
                .unwrap()
            {
                if let Signal::Approval(k) = s {
                    key = Some(k)
                }
            }
            if let Some(k) = key {
                break k;
            }
        };
        let response = protocol
            .decide(&key, "fixture-thread", "fixture-turn", "deny")
            .unwrap();
        t.send(&response).unwrap();
        loop {
            let signals = protocol
                .feed(&t.receive(Duration::from_secs(3)).unwrap())
                .unwrap();
            if signals.iter().any(|s| matches!(s, Signal::Finished(_))) {
                break;
            }
        }
        assert!(protocol.terminal);
        t.cancel(None).unwrap();
        assert!(t.child.try_wait().unwrap().is_some());
    }
}
