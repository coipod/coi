//! A task is eligible only after explicit closure. New edits, unknown metadata,
//! excluded files and unfinished journals fail closed. No original is touched.
use super::*;
use std::time::{SystemTime, UNIX_EPOCH};

const RETENTION_SECONDS: u64 = 30 * 24 * 60 * 60;
pub(super) fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Closure {
    version: u32,
    closed_at: u64,
    expires_at: u64,
    work_hash: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetentionStatus {
    pub state: String,
    pub expires_at: Option<u64>,
    pub reason: Option<String>,
}
#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupReport {
    pub removed_task_ids: Vec<String>,
    pub protected_count: usize,
}
#[derive(Serialize, Deserialize)]
struct Retirement {
    task_id: String,
    change_ids: Vec<String>,
    journal_ids: Vec<String>,
}
fn remove_if_present(path: &Path) -> Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
impl Workspace {
    fn closure_path(&self, id: &str) -> PathBuf {
        self.data.join("tasks").join(id).join("retention.json")
    }
    // Unlike the project scanner, this sees ignored/hidden files too. A file we
    // cannot inspect is a reason to keep the copy, never a reason to delete it.
    fn retention_snapshot(&self, id: &str) -> Result<BTreeMap<String, String>> {
        let root = self.data.join("tasks").join(id).join("work");
        let dir = root_dir(&root)?;
        let mut hashes = BTreeMap::new();
        let mut total = 0;
        for entry in ignore::WalkBuilder::new(&root)
            .standard_filters(false)
            .follow_links(false)
            .build()
        {
            let entry =
                entry.map_err(|_| crate::i18n::text("사본 내용을 확인할 수 없어 보존해요."))?;
            let relative = entry
                .path()
                .strip_prefix(&root)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            if relative.is_empty() {
                continue;
            }
            safe_path(&dir, &relative)?;
            if entry.file_type().is_some_and(|f| f.is_dir()) {
                continue;
            }
            let bytes = current(&dir, &relative)?
                .ok_or(crate::i18n::text("사본이 변경 중이라 보존해요."))?;
            total += bytes.len() as u64;
            if total > MAX_TOTAL || hashes.len() >= MAX_FILES {
                return Err(crate::i18n::text("확인 범위를 초과해 사본을 보존해요.").into());
            }
            hashes.insert(relative, hash(&bytes));
        }
        Ok(hashes)
    }
    fn closable_hash(&self, id: &str) -> Result<String> {
        let task = self.task(id)?;
        let (_, journals) = self.task_records(id)?;
        if journals
            .iter()
            .any(|j| !matches!(j.state.as_str(), "applied" | "reverted"))
        {
            return Err(crate::i18n::text("미완료 거래의 복구 백업을 보존해요.").into());
        }
        let snapshot = self.retention_snapshot(id)?;
        for path in task
            .baseline
            .keys()
            .chain(snapshot.keys())
            .collect::<BTreeSet<_>>()
        {
            if task.baseline.get(path) != snapshot.get(path)
                && !journals.iter().any(|j| {
                    j.state == "applied"
                        && j.files
                            .iter()
                            .any(|f| &f.path == path && f.after_hash.as_ref() == snapshot.get(path))
                })
            {
                return Err(
                    crate::i18n::text("미적용 변경이 있어 자동 정리를 예약할 수 없어요.").into(),
                );
            }
        }
        Ok(hash(
            &serde_json::to_vec(&snapshot).map_err(|e| e.to_string())?,
        ))
    }
    pub fn close_task(&self, id: &str) -> Result<()> {
        self.close_task_at(id, now())
    }
    fn close_task_at(&self, id: &str, timestamp: u64) -> Result<()> {
        let work_hash = self.closable_hash(id)?;
        if self.closure_path(id).exists() {
            return Err(crate::i18n::text(
                "이미 정리가 예약돼 있어요. 계속 보관하려면 예약을 해제해 주세요.",
            )
            .into());
        }
        write_json(
            &self.closure_path(id),
            &Closure {
                version: 1,
                closed_at: timestamp,
                expires_at: timestamp.saturating_add(RETENTION_SECONDS),
                work_hash,
            },
        )
    }
    pub fn reopen_task(&self, id: &str) -> Result<()> {
        self.task(id)?;
        remove_if_present(&self.closure_path(id))
    }
    pub fn retention_status(&self, id: &str, timestamp: u64) -> Result<RetentionStatus> {
        self.task(id)?;
        let path = self.closure_path(id);
        if !path.exists() {
            return Ok(RetentionStatus {
                state: "open".into(),
                expires_at: None,
                reason: None,
            });
        }
        let closure: Closure = match load_json(&path) {
            Ok(c) => c,
            Err(_) => {
                return Ok(RetentionStatus {
                    state: "protected".into(),
                    expires_at: None,
                    reason: Some(
                        crate::i18n::text("보존 기록을 확인할 수 없어 자동 정리를 중단했어요.")
                            .into(),
                    ),
                })
            }
        };
        let check = if closure.version != 1
            || closure.expires_at != closure.closed_at.saturating_add(RETENTION_SECONDS)
        {
            Err(crate::i18n::text("지원하지 않는 보존 기록이라 사본을 보호해요.").into())
        } else {
            self.closable_hash(id).and_then(|hash| {
                if hash == closure.work_hash {
                    Ok(())
                } else {
                    Err(crate::i18n::text("예약 후 사본이 바뀌어 자동 정리를 중단했어요.").into())
                }
            })
        };
        Ok(RetentionStatus {
            state: if check.is_err() {
                "protected"
            } else if timestamp >= closure.expires_at {
                "expired"
            } else {
                "scheduled"
            }
            .into(),
            expires_at: Some(closure.expires_at),
            reason: check.err(),
        })
    }
    // Atomically detach the copy before deleting its related records. The
    // durable recipe lives inside the detached folder and is resumed on restart.
    fn retire_task(&self, id: &str) -> Result<()> {
        let (changes, journals) = self.task_records(id)?;
        let recipe = Retirement {
            task_id: id.into(),
            change_ids: changes.into_iter().map(|c| c.id).collect(),
            journal_ids: journals.into_iter().map(|j| j.id).collect(),
        };
        let from = self.data.join("tasks").join(id);
        write_json(&from.join("retirement.json"), &recipe)?;
        fs::rename(&from, self.data.join("retired").join(id)).map_err(|e| e.to_string())?;
        sync_dir(&self.data.join("tasks"))?;
        sync_dir(&self.data.join("retired"))?;
        self.finish_retired(id)
    }
    fn finish_retired(&self, id: &str) -> Result<()> {
        validate_id(id)?;
        let root = self.data.join("retired").join(id);
        let recipe: Retirement = load_json(&root.join("retirement.json"))?;
        if recipe.task_id != id {
            return Err(crate::i18n::text("정리 기록의 작업 ID가 달라 중단했어요.").into());
        }
        for id in &recipe.journal_ids {
            validate_id(id)?;
        }
        for id in &recipe.change_ids {
            validate_id(id)?;
        }
        for id in &recipe.journal_ids {
            remove_if_present(&self.journal_path(id))?;
        }
        for id in &recipe.change_ids {
            remove_if_present(&self.data.join("changes").join(format!("{id}.json")))?;
        }
        fs::remove_dir_all(root).map_err(|e| e.to_string())
    }
    pub fn cleanup_expired(&self) -> Result<CleanupReport> {
        self.cleanup_at(now())
    }
    fn cleanup_at(&self, timestamp: u64) -> Result<CleanupReport> {
        let mut report = CleanupReport::default();
        for entry in fs::read_dir(self.data.join("retired")).map_err(|e| e.to_string())? {
            let id = entry
                .map_err(|e| e.to_string())?
                .file_name()
                .to_string_lossy()
                .to_string();
            self.finish_retired(&id)?;
            report.removed_task_ids.push(id);
        }
        for entry in fs::read_dir(self.data.join("tasks")).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if !entry.path().join("manifest.json").is_file() {
                continue;
            }
            let id = entry.file_name().to_string_lossy().to_string();
            match self.retention_status(&id, timestamp)?.state.as_str() {
                "expired" => {
                    self.retire_task(&id)?;
                    report.removed_task_ids.push(id);
                }
                "protected" => report.protected_count += 1,
                _ => {}
            }
        }
        Ok(report)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, Workspace, TaskCopy, PathBuf) {
        let t = tempfile::tempdir().unwrap();
        let original = t.path().join("original");
        fs::create_dir(&original).unwrap();
        fs::write(original.join("a.txt"), "baseline").unwrap();
        let w = Workspace::new(t.path().join("coi")).unwrap();
        let task = w
            .prepare(&Project {
                id: uuid::Uuid::new_v4().to_string(),
                name: "test".into(),
                root: original.to_string_lossy().into(),
            })
            .unwrap();
        (t, w, task, original)
    }
    #[test]
    fn explicit_closure_expires_without_changing_original() {
        let (_t, w, task, original) = fixture();
        assert!(w.cleanup_at(u64::MAX).unwrap().removed_task_ids.is_empty());
        w.close_task_at(&task.id, 100).unwrap();
        assert!(w
            .cleanup_at(100 + RETENTION_SECONDS - 1)
            .unwrap()
            .removed_task_ids
            .is_empty());
        assert_eq!(
            w.cleanup_at(100 + RETENTION_SECONDS)
                .unwrap()
                .removed_task_ids,
            [task.id]
        );
        assert_eq!(
            fs::read_to_string(original.join("a.txt")).unwrap(),
            "baseline"
        );
    }
    #[test]
    fn unapplied_edits_and_new_ignored_files_are_protected() {
        let (_t, w, task, _) = fixture();
        let work = w.data.join("tasks").join(&task.id).join("work");
        fs::write(work.join("a.txt"), "unapplied").unwrap();
        assert!(w.close_task_at(&task.id, 100).is_err());
        fs::write(work.join("a.txt"), "baseline").unwrap();
        w.close_task_at(&task.id, 100).unwrap();
        fs::write(work.join(".env.local"), "keep this").unwrap();
        let r = w.cleanup_at(u64::MAX).unwrap();
        assert_eq!(r.protected_count, 1);
        assert!(r.removed_task_ids.is_empty());
        assert!(work.join(".env.local").exists());
    }
    #[test]
    fn applied_backups_expire_but_partial_transactions_never_do() {
        let (_t, w, task, original) = fixture();
        fs::write(
            w.data.join("tasks").join(&task.id).join("work/a.txt"),
            "applied",
        )
        .unwrap();
        let c = w.collect(&task.id).unwrap();
        let application = w.apply(&c.id).unwrap();
        w.close_task_at(&task.id, 100).unwrap();
        let mut journal: Journal = load_json(&w.journal_path(&application)).unwrap();
        journal.state = "recovery_required".into();
        write_json(&w.journal_path(&application), &journal).unwrap();
        assert_eq!(w.cleanup_at(u64::MAX).unwrap().protected_count, 1);
        journal.state = "applied".into();
        write_json(&w.journal_path(&application), &journal).unwrap();
        assert_eq!(w.cleanup_at(u64::MAX).unwrap().removed_task_ids.len(), 1);
        assert!(w.journals().unwrap().is_empty());
        assert_eq!(
            fs::read_to_string(original.join("a.txt")).unwrap(),
            "applied"
        );
    }
    #[test]
    fn reopen_and_unknown_retention_metadata_keep_copies() {
        let (_t, w, task, _) = fixture();
        w.close_task_at(&task.id, 100).unwrap();
        w.reopen_task(&task.id).unwrap();
        assert!(w.cleanup_at(u64::MAX).unwrap().removed_task_ids.is_empty());
        fs::write(w.closure_path(&task.id), r#"{"version":99}"#).unwrap();
        assert_eq!(w.cleanup_at(u64::MAX).unwrap().protected_count, 1);
    }
    #[test]
    fn interrupted_retirement_resumes_idempotently() {
        let (_t, w, task, original) = fixture();
        let root = w.data.join("tasks").join(&task.id);
        write_json(
            &root.join("retirement.json"),
            &Retirement {
                task_id: task.id.clone(),
                change_ids: vec![],
                journal_ids: vec![],
            },
        )
        .unwrap();
        fs::rename(root, w.data.join("retired").join(&task.id)).unwrap();
        assert_eq!(w.cleanup_at(100).unwrap().removed_task_ids, [task.id]);
        assert!(w.cleanup_at(100).unwrap().removed_task_ids.is_empty());
        assert!(original.join("a.txt").is_file());
    }
}
