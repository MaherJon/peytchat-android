use std::path::PathBuf;
use std::sync::Arc;

use rusqlite::Connection;
use tokio::sync::Mutex;

use crate::dto::{ChannelDto, WorkspaceDto};
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

    pub async fn list_workspaces(&self) -> AppResult<Vec<WorkspaceDto>> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || -> AppResult<Vec<WorkspaceDto>> {
            let c = conn.blocking_lock();
            let mut stmt = c.prepare("SELECT id, name, master_chat_id, icon, created_at FROM workspaces ORDER BY id")?;
            let rows = stmt.query_map([], |r| {
                Ok(WorkspaceDto {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    master_chat_id: r.get::<_, i64>(2)? as u32,
                    icon: r.get(3)?,
                    created_at: r.get(4)?,
                })
            })?;
            Ok(rows.filter_map(|x| x.ok()).collect())
        })
        .await?
    }

    pub async fn insert_workspace(&self, name: &str, master_chat_id: u32, icon: Option<&str>) -> AppResult<i64> {
        let conn = self.conn.clone();
        let name = name.to_string();
        let icon = icon.map(|s| s.to_string());
        let now = chrono::Utc::now().timestamp();
        tokio::task::spawn_blocking(move || -> AppResult<i64> {
            let c = conn.blocking_lock();
            c.execute(
                "INSERT INTO workspaces (name, master_chat_id, icon, created_at) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![name, master_chat_id as i64, icon, now],
            )?;
            Ok(c.last_insert_rowid())
        })
        .await?
    }

    pub async fn list_channels(&self, workspace_id: i64) -> AppResult<Vec<ChannelDto>> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || -> AppResult<Vec<ChannelDto>> {
            let c = conn.blocking_lock();
            let mut stmt = c.prepare("SELECT id, workspace_id, chat_id, name, category, position, topic FROM channels WHERE workspace_id = ?1 ORDER BY category, position, id")?;
            let rows = stmt.query_map(rusqlite::params![workspace_id], |r| {
                Ok(ChannelDto {
                    id: r.get(0)?,
                    workspace_id: r.get(1)?,
                    chat_id: r.get::<_, i64>(2)? as u32,
                    name: r.get(3)?,
                    category: r.get(4)?,
                    position: r.get(5)?,
                    topic: r.get(6)?,
                })
            })?;
            Ok(rows.filter_map(|x| x.ok()).collect())
        })
        .await?
    }

    pub async fn insert_channel(&self, workspace_id: i64, chat_id: u32, name: &str, category: &str, position: i64) -> AppResult<i64> {
        let conn = self.conn.clone();
        let name = name.to_string();
        let category = category.to_string();
        tokio::task::spawn_blocking(move || -> AppResult<i64> {
            let c = conn.blocking_lock();
            c.execute(
                "INSERT INTO channels (workspace_id, chat_id, name, category, position) VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![workspace_id, chat_id as i64, name, category, position],
            )?;
            Ok(c.last_insert_rowid())
        })
        .await?
    }

    pub async fn find_workspace_by_master_chat(&self, master_chat_id: u32) -> AppResult<Option<WorkspaceDto>> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || -> AppResult<Option<WorkspaceDto>> {
            let c = conn.blocking_lock();
            let mut stmt = c.prepare("SELECT id, name, master_chat_id, icon, created_at FROM workspaces WHERE master_chat_id = ?1")?;
            let mut rows = stmt.query_map(rusqlite::params![master_chat_id as i64], |r| {
                Ok(WorkspaceDto {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    master_chat_id: r.get::<_, i64>(2)? as u32,
                    icon: r.get(3)?,
                    created_at: r.get(4)?,
                })
            })?;
            Ok(rows.next().transpose()?)
        })
        .await?
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

    #[tokio::test(flavor = "multi_thread")]
    async fn test_workspace_insert_and_list() {
        let tmp = tempfile::tempdir().unwrap();
        let db = Db::new(tmp.path().join("test.db")).await.unwrap();
        db.migrate().await.unwrap();
        let id = db.insert_workspace("前端组", 100, Some("FE")).await.unwrap();
        assert!(id > 0);
        let ws = db.list_workspaces().await.unwrap();
        assert_eq!(ws.len(), 1);
        assert_eq!(ws[0].name, "前端组");
        assert_eq!(ws[0].master_chat_id, 100);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_channel_insert_and_list() {
        let tmp = tempfile::tempdir().unwrap();
        let db = Db::new(tmp.path().join("test.db")).await.unwrap();
        db.migrate().await.unwrap();
        let ws_id = db.insert_workspace("FE", 100, None).await.unwrap();
        let ch_id = db.insert_channel(ws_id, 200, "general", "General", 0).await.unwrap();
        assert!(ch_id > 0);
        let chans = db.list_channels(ws_id).await.unwrap();
        assert_eq!(chans.len(), 1);
        assert_eq!(chans[0].name, "general");
        assert_eq!(chans[0].category, "General");
    }
}
