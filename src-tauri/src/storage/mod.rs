use crate::error::{AppError, Result};
use rusqlite::Connection;
use serde::Serialize;
use std::{path::Path, time::Duration};

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub always_on_top: bool,
}

pub struct Storage {
    connection: Connection,
}
impl Storage {
    pub fn open(directory: &Path) -> Result<Self> {
        std::fs::create_dir_all(directory)?;
        let mut connection = Connection::open(directory.join("core.sqlite3"))?;
        connection.busy_timeout(Duration::from_secs(5))?;
        let version: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
        if version > 1 {
            return Err(AppError::Schema(version));
        }
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        if version == 0 {
            let transaction = connection.transaction()?;
            transaction.execute_batch(
                "CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                always_on_top INTEGER NOT NULL CHECK (always_on_top IN (0, 1))
             );
             INSERT OR IGNORE INTO settings (id, always_on_top) VALUES (1, 1);
             PRAGMA user_version = 1;",
            )?;
            transaction.commit()?;
        }
        Ok(Self { connection })
    }
    pub fn settings(&self) -> Result<Settings> {
        Ok(self.connection.query_row(
            "SELECT always_on_top FROM settings WHERE id = 1",
            [],
            |row| {
                Ok(Settings {
                    always_on_top: row.get(0)?,
                })
            },
        )?)
    }
    #[cfg(test)]
    pub fn set_always_on_top(&self, enabled: bool) -> Result<Settings> {
        self.connection.execute(
            "UPDATE settings SET always_on_top = ?1 WHERE id = 1",
            [enabled],
        )?;
        self.settings()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn settings_survive_reopen_and_initialization_is_idempotent() {
        let directory = tempfile::tempdir().unwrap();
        let storage = Storage::open(directory.path()).unwrap();
        assert!(storage.settings().unwrap().always_on_top);
        storage.set_always_on_top(false).unwrap();
        drop(storage);
        let reopened = Storage::open(directory.path()).unwrap();
        assert!(!reopened.settings().unwrap().always_on_top);
    }
    #[test]
    fn corrupt_database_is_reported_without_overwriting() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("core.sqlite3");
        std::fs::write(&file, b"not a database").unwrap();
        assert!(Storage::open(directory.path()).is_err());
        assert_eq!(std::fs::read(file).unwrap(), b"not a database");
    }
    #[test]
    fn newer_schema_is_not_downgraded() {
        let directory = tempfile::tempdir().unwrap();
        let connection = Connection::open(directory.path().join("core.sqlite3")).unwrap();
        connection.pragma_update(None, "user_version", 2).unwrap();
        assert!(matches!(
            Storage::open(directory.path()),
            Err(AppError::Schema(2))
        ));
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 2);
    }
}
