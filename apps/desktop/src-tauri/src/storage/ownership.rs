//! A live OS lock, not a PID file. Another app instance must never recover the
//! first instance's running journal or mutate its workspace transactions.
use crate::Result;
use std::{
    fs::{File, OpenOptions},
    path::Path,
};
pub struct AppLock {
    _file: File,
}
impl AppLock {
    pub fn acquire(data: &Path) -> Result<Self> {
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true).truncate(false);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
        }
        let file = options
            .open(data.join("coi.lock"))
            .map_err(|_| crate::i18n::text("앱 데이터 잠금을 열 수 없어요."))?;
        #[cfg(unix)]
        {
            use std::os::fd::AsRawFd;
            if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
                return Err(crate::i18n::text(
                    "COI가 이미 실행 중이거나 앱 데이터 잠금을 사용할 수 없어요.",
                )
                .into());
            }
        }
        #[cfg(windows)]
        {
            use std::os::windows::io::AsRawHandle;
            use windows_sys::Win32::{
                Storage::FileSystem::{
                    LockFileEx, LOCKFILE_EXCLUSIVE_LOCK, LOCKFILE_FAIL_IMMEDIATELY,
                },
                System::IO::OVERLAPPED,
            };
            let mut overlapped: OVERLAPPED = unsafe { std::mem::zeroed() };
            if unsafe {
                LockFileEx(
                    file.as_raw_handle(),
                    LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY,
                    0,
                    1,
                    0,
                    &mut overlapped,
                )
            } == 0
            {
                return Err(crate::i18n::text(
                    "COI가 이미 실행 중이거나 앱 데이터 잠금을 사용할 수 없어요.",
                )
                .into());
            }
        }
        Ok(Self { _file: file })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn second_instance_is_rejected_and_os_releases_ownership() {
        let temp = tempfile::tempdir().unwrap();
        let first = AppLock::acquire(temp.path()).unwrap();
        assert!(AppLock::acquire(temp.path()).is_err());
        drop(first);
        assert!(AppLock::acquire(temp.path()).is_ok());
    }
}
