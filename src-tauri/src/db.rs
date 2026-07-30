use std::path::PathBuf;
use std::sync::Arc;

use rusqlite::Connection;
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};

pub struct Db {
    pub conn: Arc<Mutex<Connection>>,
}

impl Db {
    pub async fn new(path: PathBuf) -> AppResult<Self> {
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let conn = tokio::task::spawn_blocking(move || -> AppResult<Connection> {
            Ok(Connection::open(path)?)
        })
        .await??;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub async fn migrate(&self) -> AppResult<()> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || -> AppResult<()> {
            let c = conn.blocking_lock();
            c.execute_batch(
                "CREATE TABLE IF NOT EXISTS workspaces (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    master_chat_id INTEGER NOT NULL,
                    icon TEXT,
                    created_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS channels (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workspace_id INTEGER NOT NULL,
                    chat_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT 'General',
                    position INTEGER NOT NULL DEFAULT 0,
                    topic TEXT,
                    UNIQUE(workspace_id, chat_id)
                );
                CREATE TABLE IF NOT EXISTS roles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workspace_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    color TEXT
                );
                CREATE TABLE IF NOT EXISTS contact_roles (
                    contact_id INTEGER NOT NULL,
                    role_id INTEGER NOT NULL,
                    workspace_id INTEGER NOT NULL,
                    PRIMARY KEY(contact_id, role_id)
                );
                CREATE TABLE IF NOT EXISTS pins (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workspace_id INTEGER NOT NULL,
                    channel_chat_id INTEGER NOT NULL,
                    msg_id INTEGER NOT NULL,
                    pinned_by INTEGER NOT NULL,
                    pinned_at INTEGER NOT NULL,
                    UNIQUE(channel_chat_id, msg_id)
                );",
            )?;
            Ok(())
        })
        .await??;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test(flavor = "multi_thread")]
    async fn test_db_new_and_migrate_creates_all_tables() {
        let tmp = tempfile::tempdir().unwrap();
        let db = Db::new(tmp.path().join("test.db")).await.unwrap();
        db.migrate().await.unwrap();
        let conn = db.conn.lock().await;
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('workspaces','channels','roles','contact_roles','pins')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 5);
    }
}
