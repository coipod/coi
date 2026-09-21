pub mod ownership;
pub mod runs;
use crate::Result;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub root: String,
}
pub struct Store {
    conn: Connection,
}
impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
        migrate(&mut conn)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| e.to_string())?;
        Ok(Self { conn })
    }
    pub fn snapshot(&self) -> Result<Option<String>> {
        self.conn
            .query_row("SELECT value FROM settings WHERE key='snapshot'", [], |r| {
                r.get(0)
            })
            .optional()
            .map_err(|e| e.to_string())
    }
    pub fn save(&mut self, data: &str) -> Result<()> {
        if data.len() > 16 * 1024 * 1024 {
            return Err(crate::i18n::text("저장 데이터가 16 MiB를 초과했어요.").into());
        }
        let mut value: serde_json::Value = serde_json::from_str(data).map_err(|e| e.to_string())?;
        sanitize_value(&mut value);
        let clean = serde_json::to_string(&value).map_err(|e| e.to_string())?;
        let tx = self.conn.transaction().map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO settings VALUES('snapshot',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[clean]).map_err(|e|e.to_string())?;
        if let Some(sessions) = value["sessions"].as_array() {
            tx.execute("DELETE FROM sessions", [])
                .map_err(|e| e.to_string())?;
            for s in sessions {
                let id = s["id"].as_str().ok_or(crate::i18n::text("세션 ID 없음"))?;
                tx.execute("INSERT INTO sessions VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",params![id,s.to_string()]).map_err(|e|e.to_string())?;
            }
        }
        tx.commit().map_err(|e| e.to_string())
    }
    pub fn register(&self, path: &Path) -> Result<Project> {
        let root = path.canonicalize().map_err(|e| e.to_string())?;
        if !root.is_dir() {
            return Err(crate::i18n::text("폴더를 선택해 주세요.").into());
        }
        let root = root.to_string_lossy().to_string();
        let existing = self
            .conn
            .query_row(
                "SELECT id,name,root FROM projects WHERE root=?1",
                [&root],
                |r| {
                    Ok(Project {
                        id: r.get(0)?,
                        name: r.get(1)?,
                        root: r.get(2)?,
                    })
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if let Some(p) = existing {
            return Ok(p);
        }
        let p = Project {
            id: uuid::Uuid::new_v4().to_string(),
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            root,
        };
        self.conn
            .execute(
                "INSERT INTO projects VALUES(?1,?2,?3)",
                params![p.id, p.name, p.root],
            )
            .map_err(|e| e.to_string())?;
        Ok(p)
    }
    pub fn project(&self, id: &str) -> Result<Project> {
        self.conn
            .query_row("SELECT id,name,root FROM projects WHERE id=?1", [id], |r| {
                Ok(Project {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    root: r.get(2)?,
                })
            })
            .map_err(|_| crate::i18n::text("프로젝트를 다시 열어 주세요.").into())
    }
    pub fn session_count(&self) -> usize {
        self.conn
            .query_row("SELECT count(*) FROM sessions", [], |r| r.get(0))
            .unwrap_or(0)
    }
}
// Migrations run together or roll back together. Check the existing version
// before journal-mode changes so an older app never rewrites a newer database.
fn migrate(conn: &mut Connection) -> Result<()> {
    const MIGRATIONS: &[&str] = &[
        "CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,root TEXT UNIQUE NOT NULL);
         CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,seq INTEGER NOT NULL,payload TEXT NOT NULL,UNIQUE(run_id,seq));",
        "CREATE TABLE native_runs(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,project_id TEXT NOT NULL,task_copy_id TEXT NOT NULL,mode TEXT NOT NULL,status TEXT NOT NULL,seq INTEGER NOT NULL,thread_id TEXT,turn_id TEXT);
         CREATE UNIQUE INDEX native_active_project ON native_runs(project_id) WHERE status NOT IN ('completed','failed','cancelled');
         CREATE INDEX native_session ON native_runs(session_id);",
        "ALTER TABLE native_runs ADD COLUMN provider TEXT NOT NULL DEFAULT 'codex';
         ALTER TABLE native_runs ADD COLUMN model TEXT;
         ALTER TABLE native_runs ADD COLUMN effort TEXT;
         ALTER TABLE native_runs ADD COLUMN request_message_id TEXT;
         ALTER TABLE native_runs ADD COLUMN conversation_key TEXT;",
    ];
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='migrations')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let version: i64 = if exists {
        conn.query_row("SELECT COALESCE(MAX(version),0) FROM migrations", [], |r| {
            r.get(0)
        })
        .map_err(|e| e.to_string())?
    } else {
        0
    };
    if version < 0 || version as usize > MIGRATIONS.len() {
        return Err(crate::i18n::text(
            "이 앱보다 새로운 데이터베이스 버전이에요. 파일을 보존했으니 최신 COI로 열어 주세요.",
        )
        .into());
    }
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute_batch("CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY)")
        .map_err(|e| e.to_string())?;
    for (index, sql) in MIGRATIONS.iter().enumerate().skip(version as usize) {
        tx.execute_batch(sql).map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO migrations(version) VALUES(?1)",
            [index as i64 + 1],
        )
        .map_err(|e| e.to_string())?;
    }
    // IF NOT EXISTS alone would silently accept incompatible legacy tables or
    // views. Verify the columns while the migration is still reversible.
    for sql in [
        "SELECT key,value FROM settings LIMIT 0",
        "SELECT id,name,root FROM projects LIMIT 0",
        "SELECT id,payload FROM sessions LIMIT 0",
        "SELECT id,run_id,seq,payload FROM events LIMIT 0",
        "SELECT id,session_id,project_id,task_copy_id,mode,status,seq,thread_id,turn_id FROM native_runs LIMIT 0",
    ] {
        tx.prepare(sql).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}
pub fn redact(text: &str) -> String {
    let mut s = text.to_string();
    for (pattern, replacement) in [
        (r"\x1b\[[0-?]*[ -/]*[@-~]", ""),
        (
            r"\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,}|AIza[A-Za-z0-9_-]{20,})\b",
            "[REDACTED]",
        ),
        (
            r"(?i)((?:api[_-]?key|access[_-]?token|authorization|password|secret)\s*[=:]\s*)(?:Bearer\s+)?[^\s,;]+",
            "${1}[REDACTED]",
        ),
        (
            r"(?i)([?&](?:token|key|code|secret)=)[^&#\s]+",
            "${1}[REDACTED]",
        ),
    ] {
        s = regex::Regex::new(pattern)
            .unwrap()
            .replace_all(&s, replacement)
            .to_string()
    }
    s
}
fn sanitize_value(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::String(s) => *s = redact(s),
        serde_json::Value::Array(a) => a.iter_mut().for_each(sanitize_value),
        serde_json::Value::Object(o) => o.values_mut().for_each(sanitize_value),
        _ => {}
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn persistence_and_secret_filter() {
        let t = tempfile::tempdir().unwrap();
        let p = t.path().join("db");
        {
            let mut s = Store::open(&p).unwrap();
            s.save(r#"{"sessions":[],"message":"api_key=super-secret-value sk-1234567890123"}"#)
                .unwrap();
        }
        let s = Store::open(&p).unwrap();
        let data = s.snapshot().unwrap().unwrap();
        assert!(!data.contains("super-secret-value"));
        assert!(!data.contains("sk-123"));
        assert!(data.contains("REDACTED"));
    }
    #[test]
    fn migrations_preserve_existing_data_and_reject_newer_versions() {
        let t = tempfile::tempdir().unwrap();
        let p = t.path().join("db");
        let mut old = Connection::open(&p).unwrap();
        old.execute_batch("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO settings VALUES('snapshot','preserve-me');").unwrap();
        migrate(&mut old).unwrap();
        migrate(&mut old).unwrap();
        assert_eq!(
            old.query_row("SELECT count(*) FROM migrations", [], |r| r
                .get::<_, usize>(0))
                .unwrap(),
            3
        );
        assert_eq!(
            old.query_row("SELECT value FROM settings", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "preserve-me"
        );
        old.execute("INSERT INTO migrations VALUES(99)", [])
            .unwrap();
        drop(old);
        let before = std::fs::read(&p).unwrap();
        assert!(Store::open(&p).is_err());
        assert_eq!(before, std::fs::read(&p).unwrap());
    }
    #[test]
    fn failed_migration_rolls_back_its_schema_changes() {
        let mut conn = Connection::open_in_memory().unwrap();
        // A legacy view collision makes the migration fail after its first DDL.
        conn.execute_batch("CREATE VIEW projects AS SELECT 1 AS id")
            .unwrap();
        assert!(migrate(&mut conn).is_err());
        assert_eq!(
            conn.query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table'",
                [],
                |r| r.get::<_, usize>(0)
            )
            .unwrap(),
            0
        );
    }
}
