//! Read-only libgit2 inspection. No git executable, hooks, external filters,
//! transport, credential callbacks, index writes, commits or network requests.
use super::*;
use git2::{DiffFormat, DiffOptions, Repository, StatusOptions};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub repository: bool,
    pub branch: Option<String>,
    pub files: Vec<GitFile>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFile {
    pub path: String,
    pub index: String,
    pub worktree: String,
    pub conflicted: bool,
}
fn repository(root: &Path) -> Result<Option<Repository>> {
    let metadata = match fs::symlink_metadata(root.join(".git")) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(crate::i18n::text("Git 저장소 정보를 읽을 수 없어요.").into()),
    };
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(crate::i18n::text("현재 Git 조회는 .git 폴더가 있는 저장소 루트만 지원해요. 연결된 worktree와 하위 폴더는 지원 예정이에요.").into());
    }
    let repo =
        Repository::open(root).map_err(|_| crate::i18n::text("Git 저장소를 열 수 없어요."))?;
    if repo.is_bare()
        || repo.workdir().and_then(|p| p.canonicalize().ok()) != root.canonicalize().ok()
    {
        return Err(crate::i18n::text("선택한 프로젝트의 Git 저장소만 조회할 수 있어요.").into());
    }
    Ok(Some(repo))
}
impl Workspace {
    fn git_paths(&self, repo: &Repository, root: &Path) -> Result<BTreeSet<String>> {
        let mut paths: BTreeSet<_> = self.scan(root)?.0.into_iter().map(|f| f.path).collect();
        let dir = root_dir(root)?;
        let index = repo
            .index()
            .map_err(|_| crate::i18n::text("Git 인덱스를 읽을 수 없어요."))?;
        for entry in index.iter() {
            let Ok(path) = String::from_utf8(entry.path) else {
                continue;
            };
            if safe_path(&dir, &path).is_ok() {
                paths.insert(path);
            }
            if paths.len() > MAX_FILES {
                return Err(
                    crate::i18n::text("Git 조회의 10,000개 파일 한도를 초과했어요.").into(),
                );
            }
        }
        Ok(paths)
    }
    pub fn git_status(&self, root: &Path) -> Result<GitStatus> {
        let Some(repo) = repository(root)? else {
            return Ok(GitStatus {
                repository: false,
                branch: None,
                files: vec![],
            });
        };
        let branch = repo.head().ok().and_then(|h| {
            h.shorthand()
                .ok()
                .map(|s| crate::storage::redact(s).chars().take(120).collect())
        });
        let paths = self.git_paths(&repo, root)?;
        if paths.is_empty() {
            return Ok(GitStatus {
                repository: true,
                branch,
                files: vec![],
            });
        }
        let mut options = StatusOptions::new();
        options
            .include_untracked(true)
            .include_ignored(false)
            .exclude_submodules(true)
            .recurse_untracked_dirs(true)
            .renames_head_to_index(false)
            .renames_index_to_workdir(false)
            .update_index(false)
            .disable_pathspec_match(true);
        for path in paths {
            options.pathspec(path);
        }
        let statuses = repo.statuses(Some(&mut options)).map_err(|_| {
            crate::i18n::text(
                "Git 상태를 읽을 수 없어요. 외부 필터가 필요한 저장소는 지원하지 않아요.",
            )
        })?;
        let files = statuses
            .iter()
            .filter_map(|entry| {
                let path = entry.path().ok()?;
                if blocked(path) || validate_relative(path).is_err() {
                    return None;
                }
                let status = entry.status();
                Some(GitFile {
                    path: path.into(),
                    index: if status.is_index_new() {
                        "A"
                    } else if status.is_index_deleted() {
                        "D"
                    } else if status.is_index_modified() {
                        "M"
                    } else if status.is_index_typechange() {
                        "T"
                    } else {
                        " "
                    }
                    .into(),
                    worktree: if status.is_wt_new() {
                        "?"
                    } else if status.is_wt_deleted() {
                        "D"
                    } else if status.is_wt_modified() {
                        "M"
                    } else if status.is_wt_typechange() {
                        "T"
                    } else {
                        " "
                    }
                    .into(),
                    conflicted: status.is_conflicted(),
                })
            })
            .collect();
        Ok(GitStatus {
            repository: true,
            branch,
            files,
        })
    }
    pub fn git_diff(&self, root: &Path, path: &str, staged: bool) -> Result<String> {
        let dir = root_dir(root)?;
        safe_path(&dir, path)?;
        let repo = repository(root)?.ok_or(crate::i18n::text("Git 저장소가 아니에요."))?;
        if !self.git_paths(&repo, root)?.contains(path) {
            return Err(crate::i18n::text("조회 범위에 없는 파일이에요.").into());
        }
        let mut options = DiffOptions::new();
        options
            .pathspec(path)
            .disable_pathspec_match(true)
            .context_lines(3)
            .ignore_submodules(true)
            .max_size(1024 * 1024)
            .include_untracked(true)
            .show_untracked_content(true);
        let diff = if staged {
            let tree = match repo.head() {
                Ok(head) => Some(
                    head.peel_to_tree()
                        .map_err(|_| crate::i18n::text("Git 기준 tree를 읽을 수 없어요."))?,
                ),
                Err(e)
                    if matches!(
                        e.code(),
                        git2::ErrorCode::UnbornBranch | git2::ErrorCode::NotFound
                    ) =>
                {
                    None
                }
                Err(_) => return Err(crate::i18n::text("Git HEAD를 읽을 수 없어요.").into()),
            };
            repo.diff_tree_to_index(tree.as_ref(), None, Some(&mut options))
        } else {
            repo.diff_index_to_workdir(None, Some(&mut options))
        }
        .map_err(|_| crate::i18n::text("Git diff를 읽을 수 없어요."))?;
        let mut output = Vec::new();
        let mut clipped = false;
        let result = diff.print(DiffFormat::Patch, |_, _, line| {
            if output.len() + line.content().len() + 1 > 512 * 1024 {
                clipped = true;
                return false;
            }
            if matches!(line.origin(), '+' | '-' | ' ') {
                output.push(line.origin() as u8);
            }
            output.extend_from_slice(line.content());
            true
        });
        if clipped {
            return Err(crate::i18n::text("diff가 512 KiB 표시 한도를 초과했어요.").into());
        }
        result.map_err(|_| crate::i18n::text("Git diff를 표시할 수 없어요."))?;
        Ok(crate::storage::redact(&String::from_utf8_lossy(&output)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn status_and_diffs_preserve_index_and_worktree() {
        let t = tempfile::tempdir().unwrap();
        let root = t.path().join("project");
        fs::create_dir(&root).unwrap();
        let repo = Repository::init(&root).unwrap();
        fs::write(root.join("README.md"), "first\n").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("README.md")).unwrap();
        index.write().unwrap();
        let oid = index.write_tree().unwrap();
        let tree = repo.find_tree(oid).unwrap();
        let signature = git2::Signature::now("COI fixture", "fixture@example.invalid").unwrap();
        repo.commit(Some("HEAD"), &signature, &signature, "fixture", &tree, &[])
            .unwrap();
        fs::write(root.join("README.md"), "staged\n").unwrap();
        index.add_path(Path::new("README.md")).unwrap();
        index.write().unwrap();
        fs::write(root.join("README.md"), "unstaged\n").unwrap();
        fs::write(root.join(".env"), "secret=fixture-only").unwrap();
        fs::write(root.join("new file.txt"), "new\n").unwrap();
        let before_index = fs::read(root.join(".git/index")).unwrap();
        let before_work = fs::read(root.join("README.md")).unwrap();
        let w = Workspace::new(t.path().join("coi")).unwrap();
        let status = w.git_status(&root).unwrap();
        let readme = status.files.iter().find(|f| f.path == "README.md").unwrap();
        assert_eq!((&*readme.index, &*readme.worktree), ("M", "M"));
        assert!(!status.files.iter().any(|f| f.path == ".env"));
        assert!(w
            .git_diff(&root, "README.md", true)
            .unwrap()
            .contains("+staged"));
        assert!(w
            .git_diff(&root, "README.md", false)
            .unwrap()
            .contains("+unstaged"));
        assert!(w
            .git_diff(&root, "new file.txt", false)
            .unwrap()
            .contains("+new"));
        assert!(w.git_diff(&root, ".env", false).is_err());
        assert!(w.git_diff(&root, "../outside", false).is_err());
        assert_eq!(before_index, fs::read(root.join(".git/index")).unwrap());
        assert_eq!(before_work, fs::read(root.join("README.md")).unwrap());
    }
    #[test]
    fn repository_filter_command_is_not_executed() {
        let t = tempfile::tempdir().unwrap();
        let root = t.path().join("project");
        fs::create_dir(&root).unwrap();
        let repo = Repository::init(&root).unwrap();
        fs::write(root.join("a.txt"), "before").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("a.txt")).unwrap();
        index.write().unwrap();
        fs::write(root.join(".gitattributes"), "*.txt filter=coi-test\n").unwrap();
        repo.config()
            .unwrap()
            .set_str(
                "filter.coi-test.clean",
                &format!(
                    "echo executed > \"{}\"",
                    root.join("COI-FILTER-MUST-NOT-RUN").display()
                ),
            )
            .unwrap();
        fs::write(root.join("a.txt"), "after").unwrap();
        let w = Workspace::new(t.path().join("coi")).unwrap();
        w.git_status(&root).unwrap();
        w.git_diff(&root, "a.txt", false).unwrap();
        assert!(!root.join("COI-FILTER-MUST-NOT-RUN").exists());
        assert!(!w.git_status(t.path()).unwrap().repository);
    }
}
