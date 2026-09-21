use crate::{storage::Project, Result};
mod git;
mod retention;
use cap_std::{ambient_authority, fs::Dir};
pub use git::GitStatus;
pub use retention::{CleanupReport, RetentionStatus};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
};
const MAX_FILES: usize = 10_000;
const MAX_TOTAL: u64 = 200 * 1024 * 1024;
const MAX_FILE: u64 = 20 * 1024 * 1024;
pub fn hash(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}
pub fn validate_relative(path: &str) -> Result<()> {
    if path.is_empty()
        || path.contains('\\')
        || path.contains(':')
        || path.contains('\0')
        || Path::new(path)
            .components()
            .any(|p| !matches!(p, Component::Normal(_)))
    {
        return Err(crate::i18n::text("작업 공간 밖의 경로는 열 수 없어요.").into());
    }
    Ok(())
}
fn blocked(path: &str) -> bool {
    path.split('/').any(|s| {
        let s = s.to_lowercase();
        matches!(
            s.as_str(),
            ".git"
                | "node_modules"
                | "target"
                | "dist"
                | "build"
                | ".codex"
                | ".claude"
                | ".gemini"
                | ".agents"
                | ".ssh"
                | ".aws"
                | ".azure"
                | ".npmrc"
                | ".pypirc"
                | ".netrc"
                | "credentials"
                | "auth.json"
                | "id_rsa"
                | "id_ed25519"
                | ".ds_store"
        ) || s.starts_with(".env")
            || s.ends_with(".pem")
            || s.ends_with(".key")
    })
}
fn safe_path(dir: &Dir, path: &str) -> Result<()> {
    validate_relative(path)?;
    if blocked(path) {
        return Err(crate::i18n::text("인증·설정·제외 경로는 접근하지 않아요.").into());
    }
    let mut acc = PathBuf::new();
    for p in Path::new(path).components() {
        acc.push(p);
        match dir.symlink_metadata(&acc) {
            Ok(m) => {
                if m.file_type().is_symlink() {
                    return Err(
                        crate::i18n::text("심볼릭 링크와 junction은 지원하지 않아요.").into(),
                    );
                }
                #[cfg(windows)]
                {
                    use cap_std::fs::MetadataExt;
                    if m.file_attributes() & 0x400 != 0 {
                        return Err(crate::i18n::text("Reparse point는 지원하지 않아요.").into());
                    }
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}
fn root_dir(root: &Path) -> Result<Dir> {
    Dir::open_ambient_dir(root, ambient_authority()).map_err(|e| e.to_string())
}
fn current(dir: &Dir, path: &str) -> Result<Option<Vec<u8>>> {
    safe_path(dir, path)?;
    match dir.metadata(path) {
        Ok(m) => {
            if !m.is_file() || m.len() > MAX_FILE {
                return Err(crate::localized_format!(
                    "파일 종류 또는 크기가 지원되지 않아요: {path}",
                    "Unsupported file type or size: {path}",
                    "未対応のファイル形式またはサイズ：{path}"
                ));
            }
            dir.read(path).map(Some).map_err(|e| e.to_string())
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub path: String,
    pub size: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskCopy {
    pub id: String,
    pub project_id: String,
    pub file_count: usize,
    pub total_bytes: u64,
    pub omitted: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project: Option<Project>,
    #[serde(default)]
    pub baseline: BTreeMap<String, String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeFile {
    pub path: String,
    pub before: Option<String>,
    pub after: Option<String>,
    pub before_hash: Option<String>,
    pub after_hash: Option<String>,
    pub supported: bool,
    pub reason: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeSet {
    pub id: String,
    pub task_copy_id: String,
    pub files: Vec<ChangeFile>,
    pub status: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Journal {
    pub id: String,
    pub project_name: String,
    pub state: String,
    pub root: String,
    pub changeset_id: String,
    pub files: Vec<ChangeFile>,
    pub written: Vec<String>,
}
#[derive(Clone)]
pub struct Workspace {
    pub data: PathBuf,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskSummary {
    pub id: String,
    pub project_name: String,
    pub file_count: usize,
    pub total_bytes: u64,
    pub can_discard: bool,
    pub retention: RetentionStatus,
}
fn write_json(path: &Path, value: &impl Serialize) -> Result<()> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("tmp");
    let mut f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
    f.write_all(&bytes)
        .and_then(|_| f.sync_all())
        .map_err(|e| e.to_string())?;
    replace_file(&tmp, path)?;
    if let Some(p) = path.parent() {
        sync_dir(p)?
    }
    Ok(())
}
#[cfg(not(windows))]
fn replace_file(from: &Path, to: &Path) -> Result<()> {
    fs::rename(from, to).map_err(|e| e.to_string())
}
#[cfg(windows)]
fn replace_file(from: &Path, to: &Path) -> Result<()> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(a: *const u16, b: *const u16, flags: u32) -> i32;
    }
    let a: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let b: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    if unsafe { MoveFileExW(a.as_ptr(), b.as_ptr(), 0x1 | 0x8) } == 0 {
        Err(std::io::Error::last_os_error().to_string())
    } else {
        Ok(())
    }
}
fn sync_dir(path: &Path) -> Result<()> {
    #[cfg(not(unix))]
    let _ = path;
    #[cfg(unix)]
    fs::File::open(path)
        .and_then(|d| d.sync_all())
        .map_err(|e| e.to_string())?;
    Ok(())
}
fn load_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}
fn validate_id(id: &str) -> Result<()> {
    uuid::Uuid::parse_str(id)
        .map(|_| ())
        .map_err(|_| crate::i18n::text("유효하지 않은 작업 ID").into())
}
impl Workspace {
    pub fn new(data: PathBuf) -> Result<Self> {
        for part in ["tasks", "changes", "applications", "retired"] {
            fs::create_dir_all(data.join(part)).map_err(|e| e.to_string())?
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&data, fs::Permissions::from_mode(0o700))
                .map_err(|e| e.to_string())?;
        }
        Ok(Self { data })
    }
    pub fn scan(&self, root: &Path) -> Result<(Vec<FileEntry>, Vec<String>)> {
        let mut entries = vec![];
        let mut omitted = vec![];
        let mut total = 0;
        let root = root.canonicalize().map_err(|e| e.to_string())?;
        let filter_root = root.clone();
        let walker = ignore::WalkBuilder::new(&root)
            .hidden(false)
            .follow_links(false)
            .require_git(false)
            .filter_entry(move |e| {
                let rel = e
                    .path()
                    .strip_prefix(&filter_root)
                    .unwrap_or(e.path())
                    .to_string_lossy()
                    .replace('\\', "/");
                rel.is_empty() || !blocked(&rel)
            })
            .build();
        for entry in walker {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry
                .path()
                .strip_prefix(&root)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            if path.is_empty() {
                continue;
            }
            if entry.file_type().is_some_and(|x| x.is_symlink()) {
                omitted.push(crate::localized_format!(
                    "{path} (심볼릭 링크)",
                    "{path} (symbolic link)",
                    "{path}（シンボリックリンク）"
                ));
                continue;
            }
            if !entry.file_type().is_some_and(|x| x.is_file()) {
                continue;
            }
            let size = entry.metadata().map_err(|e| e.to_string())?.len();
            if size > MAX_FILE {
                return Err(crate::localized_format!(
                    "파일당 20 MiB 제한 초과: {path}",
                    "File exceeds 20 MiB limit: {path}",
                    "ファイル単位の20 MiB制限を超過：{path}"
                ));
            }
            total += size;
            if entries.len() >= MAX_FILES || total > MAX_TOTAL {
                return Err(crate::i18n::text(
                    "10,000개 파일 또는 200 MiB 제한을 초과했어요. 더 작은 폴더를 선택해 주세요.",
                )
                .into());
            }
            entries.push(FileEntry { path, size });
        }
        entries.sort_by(|a, b| a.path.cmp(&b.path));
        omitted.insert(0,crate::i18n::text("기본 제외: .git, .env*, 인증 파일, 공급자 설정, node_modules, 빌드 결과, .gitignore 항목").into());
        Ok((entries, omitted))
    }
    pub fn read(&self, root: &Path, path: &str) -> Result<String> {
        let dir = root_dir(root)?;
        let bytes = current(&dir, path)?.ok_or(crate::i18n::text("파일을 찾을 수 없어요."))?;
        if bytes.len() > 1024 * 1024 {
            return Err(
                crate::i18n::text("미리보기는 1 MiB 이하의 텍스트 파일을 지원해요.").into(),
            );
        }
        String::from_utf8(bytes)
            .map_err(|_| crate::i18n::text("이 파일은 텍스트 미리보기를 지원하지 않아요.").into())
    }
    pub fn prepare(&self, project: &Project) -> Result<TaskCopy> {
        self.ensure_idle(&project.root)?;
        let root = Path::new(&project.root);
        if self.data.starts_with(root) {
            return Err(crate::i18n::text(
                "COI 데이터 폴더를 포함하는 상위 폴더는 작업 공간으로 사용할 수 없어요.",
            )
            .into());
        }
        let (files, omitted) = self.scan(root)?;
        let dir = root_dir(root)?;
        let id = uuid::Uuid::new_v4().to_string();
        let task_root = self.data.join("tasks").join(&id);
        fs::create_dir_all(task_root.join("work")).map_err(|e| e.to_string())?;
        fs::create_dir_all(task_root.join("baseline")).map_err(|e| e.to_string())?;
        let mut task = TaskCopy {
            id,
            project_id: project.id.clone(),
            file_count: files.len(),
            total_bytes: 0,
            omitted,
            project: Some(project.clone()),
            baseline: BTreeMap::new(),
        };
        for f in files {
            let bytes =
                current(&dir, &f.path)?.ok_or(crate::i18n::text("복사 중 파일이 사라졌어요."))?;
            task.total_bytes += bytes.len() as u64;
            if task.total_bytes > MAX_TOTAL {
                return Err(crate::i18n::text("복사 중 파일 크기가 제한을 초과했어요.").into());
            }
            task.baseline.insert(f.path.clone(), hash(&bytes));
            for kind in ["work", "baseline"] {
                let dest = task_root.join(kind).join(&f.path);
                fs::create_dir_all(dest.parent().unwrap()).map_err(|e| e.to_string())?;
                fs::write(dest, &bytes).map_err(|e| e.to_string())?;
            }
        }
        write_json(&task_root.join("manifest.json"), &task)?;
        Ok(task)
    }
    pub fn read_image(&self, root: &Path, path: &str) -> Result<String> {
        use base64::Engine;
        let dir = root_dir(root)?;
        let bytes = current(&dir, path)?.ok_or(crate::i18n::text("이미지를 찾을 수 없어요."))?;
        if bytes.len() > 8 * 1024 * 1024 {
            return Err(crate::i18n::text("이미지 미리보기는 8 MiB 이하만 지원해요.").into());
        }
        let format = image::guess_format(&bytes)
            .map_err(|_| crate::i18n::text("PNG·JPEG·WebP 이미지만 지원해요."))?;
        if !matches!(
            format,
            image::ImageFormat::Png | image::ImageFormat::Jpeg | image::ImageFormat::WebP
        ) {
            return Err(crate::i18n::text("PNG·JPEG·WebP 이미지만 지원해요.").into());
        }
        let mut reader = image::ImageReader::with_format(std::io::Cursor::new(bytes), format);
        let mut limits = image::Limits::default();
        limits.max_image_width = Some(8192);
        limits.max_image_height = Some(8192);
        limits.max_alloc = Some(64 * 1024 * 1024);
        reader.limits(limits);
        let decoded = reader
            .decode()
            .map_err(|_| crate::i18n::text("이미지가 손상됐거나 디코딩 제한을 초과했어요."))?;
        let thumbnail = decoded.thumbnail(1600, 1600);
        let mut png = std::io::Cursor::new(Vec::new());
        thumbnail
            .write_to(&mut png, image::ImageFormat::Png)
            .map_err(|_| crate::i18n::text("이미지 변환 실패"))?;
        if png.get_ref().len() > 8 * 1024 * 1024 {
            return Err(crate::i18n::text("이미지 미리보기 결과가 너무 커요.").into());
        }
        Ok(format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(png.into_inner())
        ))
    }
    pub(crate) fn work_path(&self, id: &str, project_id: &str) -> Result<PathBuf> {
        let task = self.task(id)?;
        if task.project_id != project_id {
            return Err("foreign task project".into());
        }
        let path = self.data.join("tasks").join(id).join("work");
        root_dir(&path)?;
        path.canonicalize().map_err(|e| e.to_string())
    }
    pub fn task(&self, id: &str) -> Result<TaskCopy> {
        validate_id(id)?;
        load_json(&self.data.join("tasks").join(id).join("manifest.json"))
    }
    fn task_records(&self, id: &str) -> Result<(Vec<ChangeSet>, Vec<Journal>)> {
        self.task(id)?;
        let mut changes = vec![];
        for entry in fs::read_dir(self.data.join("changes")).map_err(|e| e.to_string())? {
            let path = entry.map_err(|e| e.to_string())?.path();
            if path.extension().is_some_and(|e| e == "json") {
                let c: ChangeSet = load_json(&path)?;
                if c.task_copy_id == id {
                    changes.push(c);
                }
            }
        }
        let journals = self
            .journals()?
            .into_iter()
            .filter(|j| changes.iter().any(|c| c.id == j.changeset_id))
            .collect();
        Ok((changes, journals))
    }
    pub fn task_summaries(&self) -> Result<Vec<TaskSummary>> {
        let mut tasks = vec![];
        for entry in fs::read_dir(self.data.join("tasks")).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let id = entry.file_name().to_string_lossy().to_string();
            if !entry.path().join("manifest.json").is_file() {
                continue;
            }
            let task = self.task(&id)?;
            let (_, journals) = self.task_records(&id)?;
            tasks.push(TaskSummary {
                retention: self.retention_status(&id, retention::now())?,
                id,
                project_name: task.project.map(|p| p.name).unwrap_or_default(),
                file_count: task.file_count,
                total_bytes: task.total_bytes,
                can_discard: journals.iter().all(|j| j.state == "reverted"),
            });
        }
        Ok(tasks)
    }
    /// Explicit user discard only; never an automatic retention sweep. Applied
    /// backups and unfinished transactions must remain recoverable.
    pub fn discard_task(&self, id: &str) -> Result<()> {
        let (changes, journals) = self.task_records(id)?;
        if journals.iter().any(|j| j.state != "reverted") {
            return Err(crate::i18n::text(
                "적용된 변경이나 미완료 거래가 있어요. 먼저 복구한 뒤 사본을 삭제해 주세요.",
            )
            .into());
        }
        for j in journals {
            fs::remove_file(self.journal_path(&j.id)).map_err(|e| e.to_string())?;
        }
        for c in changes {
            fs::remove_file(self.data.join("changes").join(format!("{}.json", c.id)))
                .map_err(|e| e.to_string())?;
        }
        fs::remove_dir_all(self.data.join("tasks").join(id)).map_err(|e| e.to_string())
    }
    pub fn collect(&self, id: &str) -> Result<ChangeSet> {
        self.reopen_task(id)?;
        let task = self.task(id)?;
        let task_root = self.data.join("tasks").join(id);
        let work = root_dir(&task_root.join("work"))?;
        let baseline = root_dir(&task_root.join("baseline"))?;
        let (entries, _) = self.scan(&task_root.join("work"))?;
        let paths: BTreeSet<String> = task
            .baseline
            .keys()
            .cloned()
            .chain(entries.into_iter().map(|f| f.path))
            .collect();
        let mut files = vec![];
        for path in paths {
            let before = current(&baseline, &path)?;
            let after = current(&work, &path)?;
            let bh = before.as_ref().map(|b| hash(b));
            if task.baseline.get(&path) != bh.as_ref() {
                return Err(crate::i18n::text("기준 사본이 변경되어 검토를 중단했어요.").into());
            }
            let ah = after.as_ref().map(|b| hash(b));
            if bh == ah {
                continue;
            }
            let text = |b: Option<Vec<u8>>| {
                b.and_then(|v| {
                    if v.contains(&0) {
                        None
                    } else {
                        String::from_utf8(v).ok()
                    }
                })
            };
            let b = text(before);
            let a = text(after);
            let supported = a.is_some() && (bh.is_none() || b.is_some());
            let reason = if supported {
                None
            } else {
                Some(
                    crate::i18n::text("삭제·이름 변경·바이너리는 알파에서 자동 적용하지 않아요.")
                        .into(),
                )
            };
            files.push(ChangeFile {
                path,
                before: b,
                after: a,
                before_hash: bh,
                after_hash: ah,
                supported,
                reason,
            });
        }
        let changes = ChangeSet {
            id: uuid::Uuid::new_v4().to_string(),
            task_copy_id: id.into(),
            files,
            status: "pending".into(),
        };
        write_json(
            &self
                .data
                .join("changes")
                .join(format!("{}.json", changes.id)),
            &changes,
        )?;
        Ok(changes)
    }
    fn journal_path(&self, id: &str) -> PathBuf {
        self.data.join("applications").join(format!("{id}.json"))
    }
    pub fn journals(&self) -> Result<Vec<Journal>> {
        let mut result = vec![];
        for p in fs::read_dir(self.data.join("applications")).map_err(|e| e.to_string())? {
            let p = p.map_err(|e| e.to_string())?.path();
            if p.extension().is_some_and(|e| e == "json") {
                result.push(load_json(&p)?);
            }
        }
        Ok(result)
    }
    fn ensure_idle(&self, root: &str) -> Result<()> {
        if self.journals()?.iter().any(|j| {
            j.root == root
                && matches!(
                    j.state.as_str(),
                    "applying" | "recovery_required" | "reverting"
                )
        }) {
            Err(crate::i18n::text("먼저 미완료 적용 거래를 복구해 주세요.").into())
        } else {
            Ok(())
        }
    }
    pub fn apply(&self, id: &str) -> Result<String> {
        self.apply_with_failure(id, None)
    }
    fn apply_with_failure(&self, id: &str, fail_after: Option<usize>) -> Result<String> {
        validate_id(id)?;
        let path = self.data.join("changes").join(format!("{id}.json"));
        let mut changes: ChangeSet = load_json(&path)?;
        self.reopen_task(&changes.task_copy_id)?;
        if changes.status != "pending"
            || changes.files.is_empty()
            || changes.files.iter().any(|f| !f.supported)
        {
            return Err(crate::i18n::text("적용 가능한 대기 중 텍스트 변경이 아니에요.").into());
        }
        let task = self.task(&changes.task_copy_id)?;
        let project = task
            .project
            .ok_or(crate::i18n::text("프로젝트 정보 없음"))?;
        self.ensure_idle(&project.root)?;
        let dir = root_dir(Path::new(&project.root))?;
        // Preflight every file before any mutation. The stored ChangeSet is the immutable proposal.
        for f in &changes.files {
            if current(&dir, &f.path)?.as_ref().map(|v| hash(v)) != f.before_hash {
                return Err(crate::localized_format!(
                    "충돌: {} 원본이 바뀌었어요. 아무 파일도 적용하지 않았어요.",
                    "Conflict: original {} changed. No files were applied.",
                    "競合：元の{}が変更されました。ファイルは適用していません。",
                    f.path
                ));
            }
            if f.after.as_ref().map(|s| hash(s.as_bytes())) != f.after_hash {
                return Err(crate::i18n::text("변경안 무결성 검사 실패").into());
            }
        }
        let mut j = Journal {
            id: uuid::Uuid::new_v4().to_string(),
            project_name: project.name,
            state: "applying".into(),
            root: project.root,
            changeset_id: id.into(),
            files: changes.files.clone(),
            written: vec![],
        };
        write_json(&self.journal_path(&j.id), &j)?;
        for (i, f) in changes.files.iter().enumerate() {
            if fail_after == Some(i) {
                j.state = "recovery_required".into();
                write_json(&self.journal_path(&j.id), &j)?;
                return Err(format!("recovery_required:{}", j.id));
            }
            let result = (|| {
                if current(&dir, &f.path)?.as_ref().map(|v| hash(v)) != f.before_hash {
                    return Err(crate::i18n::text("적용 도중 원본이 바뀌었어요.").into());
                }
                atomic_write(&dir, &f.path, f.after.as_ref().unwrap().as_bytes())
            })();
            if let Err(e) = result {
                j.state = "recovery_required".into();
                write_json(&self.journal_path(&j.id), &j)?;
                return Err(format!("recovery_required:{}: {e}", j.id));
            }
            j.written.push(f.path.clone());
            write_json(&self.journal_path(&j.id), &j)?;
        }
        j.state = "applied".into();
        write_json(&self.journal_path(&j.id), &j)?;
        changes.status = "applied".into();
        write_json(&path, &changes)?;
        Ok(j.id)
    }
    pub fn undo(&self, id: &str, recovery: bool) -> Result<()> {
        validate_id(id)?;
        let mut j: Journal = load_json(&self.journal_path(id))?;
        let changes: ChangeSet = load_json(
            &self
                .data
                .join("changes")
                .join(format!("{}.json", j.changeset_id)),
        )?;
        self.reopen_task(&changes.task_copy_id)?;
        if j.state != "applied"
            && !(recovery
                && matches!(
                    j.state.as_str(),
                    "applying" | "recovery_required" | "reverting"
                ))
        {
            return Err(crate::i18n::text("되돌릴 수 있는 적용 기록이 아니에요.").into());
        }
        let dir = root_dir(Path::new(&j.root))?;
        let mut restore = vec![];
        for f in &j.files {
            let now = current(&dir, &f.path)?.as_ref().map(|v| hash(v));
            if now == f.after_hash {
                restore.push(f.clone())
            } else if recovery && now == f.before_hash {
            } else {
                return Err(crate::localized_format!(
                    "복구 충돌: {}에 후속 편집이 있어 자동 복구를 중단했어요.",
                    "Recovery conflict: {} has later edits. Automatic recovery stopped.",
                    "復元の競合：{}に追加の編集があるため、自動復元を停止しました。",
                    f.path
                ));
            }
        }
        j.state = "reverting".into();
        write_json(&self.journal_path(id), &j)?;
        for f in restore {
            let result = (|| {
                if current(&dir, &f.path)?.as_ref().map(|v| hash(v)) != f.after_hash {
                    return Err(crate::i18n::text("복구 도중 후속 편집이 발생했어요.").into());
                }
                if let Some(before) = &f.before {
                    atomic_write(&dir, &f.path, before.as_bytes())
                } else {
                    safe_path(&dir, &f.path)?;
                    dir.remove_file(&f.path).map_err(|e| e.to_string())
                }
            })();
            if let Err(e) = result {
                j.state = "recovery_required".into();
                write_json(&self.journal_path(id), &j)?;
                return Err(e);
            }
        }
        j.state = "reverted".into();
        write_json(&self.journal_path(id), &j)?;
        Ok(())
    }
}
fn atomic_write(dir: &Dir, path: &str, bytes: &[u8]) -> Result<()> {
    safe_path(dir, path)?;
    let p = Path::new(path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            dir.create_dir_all(parent).map_err(|e| e.to_string())?
        }
    }
    safe_path(dir, path)?;
    let temp = p.with_file_name(format!(".coi-{}.tmp", uuid::Uuid::new_v4()));
    let mut options = cap_std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    let mut f = dir.open_with(&temp, &options).map_err(|e| e.to_string())?;
    f.write_all(bytes)
        .and_then(|_| f.sync_all())
        .map_err(|e| e.to_string())?;
    if let Ok(m) = dir.metadata(path) {
        f.set_permissions(m.permissions())
            .map_err(|e| e.to_string())?
    }
    drop(f);
    safe_path(dir, path)?;
    dir.rename(&temp, dir, path).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        dir.open_dir(
            p.parent()
                .filter(|p| !p.as_os_str().is_empty())
                .unwrap_or(Path::new(".")),
        )
        .and_then(|d| d.into_std_file().sync_all())
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, Workspace, Project) {
        let t = tempfile::tempdir().unwrap();
        let root = t.path().join("project");
        fs::create_dir(&root).unwrap();
        fs::write(root.join("a.txt"), "user's uncommitted work\n").unwrap();
        fs::write(root.join("b.txt"), "original b\n").unwrap();
        let w = Workspace::new(t.path().join("data")).unwrap();
        let p = Project {
            id: "p".into(),
            name: "Project".into(),
            root: root.to_string_lossy().into(),
        };
        (t, w, p)
    }
    fn edit(w: &Workspace, t: &TaskCopy, name: &str, content: &str) {
        fs::write(
            w.data.join("tasks").join(&t.id).join("work").join(name),
            content,
        )
        .unwrap()
    }
    #[test]
    fn copy_preserves_original_and_restores_dirty_baseline() {
        let (_tmp, w, p) = fixture();
        let t = w.prepare(&p).unwrap();
        edit(&w, &t, "a.txt", "new a\n");
        assert_eq!(
            fs::read_to_string(Path::new(&p.root).join("a.txt")).unwrap(),
            "user's uncommitted work\n"
        );
        let c = w.collect(&t.id).unwrap();
        let app = w.apply(&c.id).unwrap();
        assert_eq!(
            fs::read_to_string(Path::new(&p.root).join("a.txt")).unwrap(),
            "new a\n"
        );
        w.undo(&app, false).unwrap();
        assert_eq!(
            fs::read_to_string(Path::new(&p.root).join("a.txt")).unwrap(),
            "user's uncommitted work\n"
        );
    }
    #[test]
    fn conflict_applies_zero_files() {
        let (_tmp, w, p) = fixture();
        let t = w.prepare(&p).unwrap();
        edit(&w, &t, "a.txt", "new a");
        edit(&w, &t, "b.txt", "new b");
        let c = w.collect(&t.id).unwrap();
        fs::write(Path::new(&p.root).join("b.txt"), "user edit").unwrap();
        assert!(w.apply(&c.id).unwrap_err().contains("Conflict:"));
        assert_eq!(
            fs::read_to_string(Path::new(&p.root).join("a.txt")).unwrap(),
            "user's uncommitted work\n"
        );
    }
    #[test]
    fn undo_preserves_post_apply_user_edits() {
        let (_tmp, w, p) = fixture();
        let t = w.prepare(&p).unwrap();
        edit(&w, &t, "a.txt", "new a");
        edit(&w, &t, "b.txt", "new b");
        let c = w.collect(&t.id).unwrap();
        let app = w.apply(&c.id).unwrap();
        fs::write(Path::new(&p.root).join("b.txt"), "later user edit").unwrap();
        assert!(w.undo(&app, false).is_err());
        assert_eq!(
            fs::read_to_string(Path::new(&p.root).join("a.txt")).unwrap(),
            "new a"
        );
        assert_eq!(
            fs::read_to_string(Path::new(&p.root).join("b.txt")).unwrap(),
            "later user edit"
        );
    }
    #[test]
    fn partial_transaction_survives_restart() {
        let (tmp, w, p) = fixture();
        let t = w.prepare(&p).unwrap();
        edit(&w, &t, "a.txt", "new a");
        edit(&w, &t, "b.txt", "new b");
        let c = w.collect(&t.id).unwrap();
        assert!(w.apply_with_failure(&c.id, Some(1)).is_err());
        drop(w);
        let w = Workspace::new(tmp.path().join("data")).unwrap();
        let j = w.journals().unwrap().pop().unwrap();
        assert_eq!(j.state, "recovery_required");
        assert!(w.prepare(&p).is_err());
        w.undo(&j.id, true).unwrap();
        assert_eq!(
            fs::read_to_string(Path::new(&p.root).join("a.txt")).unwrap(),
            "user's uncommitted work\n"
        );
        assert_eq!(
            fs::read_to_string(Path::new(&p.root).join("b.txt")).unwrap(),
            "original b\n"
        );
    }
    #[test]
    fn deletion_and_binary_never_auto_apply() {
        let (_tmp, w, p) = fixture();
        let t = w.prepare(&p).unwrap();
        fs::remove_file(w.data.join("tasks").join(&t.id).join("work/a.txt")).unwrap();
        let c = w.collect(&t.id).unwrap();
        assert!(!c.files[0].supported);
        assert!(w.apply(&c.id).is_err());
        assert!(Path::new(&p.root).join("a.txt").exists());
    }
    #[test]
    fn safe_create_and_revert() {
        let (_tmp, w, p) = fixture();
        let t = w.prepare(&p).unwrap();
        edit(&w, &t, "new.txt", "created");
        let c = w.collect(&t.id).unwrap();
        let app = w.apply(&c.id).unwrap();
        assert!(Path::new(&p.root).join("new.txt").exists());
        w.undo(&app, false).unwrap();
        assert!(!Path::new(&p.root).join("new.txt").exists());
    }
    #[test]
    fn path_guards() {
        for path in [
            "../outside",
            "/etc/passwd",
            "a/../b",
            "C:/secret",
            "a\\b",
            "",
            ".env",
            ".git/config",
        ] {
            let (_tmp, w, p) = fixture();
            assert!(w.read(Path::new(&p.root), path).is_err(), "{path}");
        }
    }
    #[cfg(unix)]
    #[test]
    fn symlink_cannot_escape_or_apply() {
        let (tmp, w, p) = fixture();
        let outside = tmp.path().join("outside");
        fs::write(&outside, "private").unwrap();
        std::os::unix::fs::symlink(&outside, Path::new(&p.root).join("link")).unwrap();
        assert!(w.read(Path::new(&p.root), "link").is_err());
        let t = w.prepare(&p).unwrap();
        assert!(!t.baseline.contains_key("link"));
        edit(&w, &t, "a.txt", "new");
        let c = w.collect(&t.id).unwrap();
        fs::remove_file(Path::new(&p.root).join("a.txt")).unwrap();
        std::os::unix::fs::symlink(&outside, Path::new(&p.root).join("a.txt")).unwrap();
        assert!(w.apply(&c.id).is_err());
        assert_eq!(fs::read_to_string(outside).unwrap(), "private");
    }
    #[test]
    fn excludes_secrets_and_provider_configuration() {
        let (_tmp, w, p) = fixture();
        let root = Path::new(&p.root);
        fs::write(root.join(".env.local"), "secret").unwrap();
        fs::create_dir(root.join(".codex")).unwrap();
        fs::write(root.join(".codex/config.toml"), "bad").unwrap();
        let t = w.prepare(&p).unwrap();
        assert_eq!(t.file_count, 2);
    }
    #[test]
    fn explicit_discard_preserves_original_and_requires_recovery() {
        let (_tmp, w, p) = fixture();
        let task = w.prepare(&p).unwrap();
        edit(&w, &task, "a.txt", "draft");
        let changes = w.collect(&task.id).unwrap();
        let application = w.apply(&changes.id).unwrap();
        assert!(!w.task_summaries().unwrap()[0].can_discard);
        assert!(w.discard_task(&task.id).is_err());
        w.undo(&application, false).unwrap();
        assert!(w.task_summaries().unwrap()[0].can_discard);
        w.discard_task(&task.id).unwrap();
        assert!(w.task_summaries().unwrap().is_empty());
        assert!(w.journals().unwrap().is_empty());
        assert_eq!(
            fs::read_to_string(Path::new(&p.root).join("a.txt")).unwrap(),
            "user's uncommitted work\n"
        );
    }
    #[test]
    fn partial_failure_backup_cannot_be_discarded() {
        let (_tmp, w, p) = fixture();
        let task = w.prepare(&p).unwrap();
        edit(&w, &task, "a.txt", "a");
        edit(&w, &task, "b.txt", "b");
        let changes = w.collect(&task.id).unwrap();
        assert!(w.apply_with_failure(&changes.id, Some(1)).is_err());
        assert!(w.discard_task(&task.id).is_err());
        assert!(w.task(&task.id).is_ok());
    }
    #[test]
    fn image_preview_decodes_and_reencodes_but_rejects_svg_and_corruption() {
        let (_tmp, w, p) = fixture();
        let root = Path::new(&p.root);
        let image = image::RgbaImage::from_pixel(2, 2, image::Rgba([12, 34, 56, 255]));
        image.save(root.join("valid.png")).unwrap();
        assert!(w
            .read_image(root, "valid.png")
            .unwrap()
            .starts_with("data:image/png;base64,"));
        fs::write(root.join("untrusted.svg"), r#"<svg onload="alert(1)"/>"#).unwrap();
        assert!(w.read_image(root, "untrusted.svg").is_err());
        fs::write(root.join("bad.png"), b"\x89PNG\r\n\x1a\ninvalid").unwrap();
        assert!(w.read_image(root, "bad.png").is_err());
        assert!(w.read_image(root, "../outside.png").is_err());
    }
}
