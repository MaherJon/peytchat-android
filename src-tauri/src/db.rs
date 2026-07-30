use std::path::PathBuf;
use std::sync::Arc;

use rusqlite::Connection;
use rusqlite::params;
use rusqlite::OptionalExtension;
use tokio::sync::Mutex;

use crate::dto::{ChannelDto, PinDto, RoleDto, WorkspaceDto};
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
                );
                CREATE TABLE IF NOT EXISTS cards (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workspace_id INTEGER NOT NULL,
                    channel_chat_id INTEGER NOT NULL,
                    msg_id INTEGER,
                    type TEXT NOT NULL DEFAULT 'card',
                    title TEXT NOT NULL,
                    description TEXT,
                    status TEXT NOT NULL DEFAULT 'todo',
                    assignee_contact_id INTEGER,
                    due_date INTEGER,
                    created_by INTEGER NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    position INTEGER NOT NULL DEFAULT 0,
                    source_msg_id INTEGER
                );
                CREATE INDEX IF NOT EXISTS idx_cards_workspace_channel ON cards(workspace_id, channel_chat_id);
                CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);
                CREATE INDEX IF NOT EXISTS idx_cards_assignee ON cards(assignee_contact_id);
                CREATE INDEX IF NOT EXISTS idx_cards_msg_id ON cards(msg_id);",
            )?;
            Ok(())
        })
        .await??;
        // channels 表加 space_type 列(若不存在)。SQLite 不支持 ADD COLUMN IF NOT EXISTS,
        // 用 PRAGMA 检查列是否存在。
        let conn2 = self.conn.clone();
        tokio::task::spawn_blocking(move || -> AppResult<()> {
            let c = conn2.blocking_lock();
            let has_col: bool = c
                .query_row(
                    "SELECT COUNT(*) > 0 FROM pragma_table_info('channels') WHERE name='space_type'",
                    [],
                    |row| row.get(0),
                )?;
            if !has_col {
                c.execute(
                    "ALTER TABLE channels ADD COLUMN space_type TEXT NOT NULL DEFAULT 'chat'",
                    [],
                )?;
            }
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
                    unread: 0,
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

    pub async fn list_roles(&self, workspace_id: i64) -> AppResult<Vec<RoleDto>> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || -> AppResult<Vec<RoleDto>> {
            let c = conn.blocking_lock();
            let mut stmt = c.prepare("SELECT id, workspace_id, name, color FROM roles WHERE workspace_id = ?1 ORDER BY id")?;
            let rows = stmt.query_map(rusqlite::params![workspace_id], |r| {
                Ok(RoleDto {
                    id: r.get(0)?,
                    workspace_id: r.get(1)?,
                    name: r.get(2)?,
                    color: r.get(3)?,
                })
            })?;
            Ok(rows.filter_map(|x| x.ok()).collect())
        })
        .await?
    }

    pub async fn insert_role(&self, workspace_id: i64, name: &str, color: Option<&str>) -> AppResult<i64> {
        let conn = self.conn.clone();
        let name = name.to_string();
        let color = color.map(|s| s.to_string());
        tokio::task::spawn_blocking(move || -> AppResult<i64> {
            let c = conn.blocking_lock();
            c.execute(
                "INSERT INTO roles (workspace_id, name, color) VALUES (?1, ?2, ?3)",
                rusqlite::params![workspace_id, name, color],
            )?;
            Ok(c.last_insert_rowid())
        })
        .await?
    }

    pub async fn set_contact_role(&self, workspace_id: i64, contact_id: u32, role_id: i64) -> AppResult<()> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || -> AppResult<()> {
            let c = conn.blocking_lock();
            c.execute(
                "INSERT OR IGNORE INTO contact_roles (contact_id, role_id, workspace_id) VALUES (?1, ?2, ?3)",
                rusqlite::params![contact_id as i64, role_id, workspace_id],
            )?;
            Ok(())
        })
        .await?
    }

    pub async fn list_contact_roles(&self, workspace_id: i64, contact_id: u32) -> AppResult<Vec<i64>> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || -> AppResult<Vec<i64>> {
            let c = conn.blocking_lock();
            let mut stmt = c.prepare("SELECT role_id FROM contact_roles WHERE workspace_id = ?1 AND contact_id = ?2")?;
            let rows = stmt.query_map(rusqlite::params![workspace_id, contact_id as i64], |r| r.get::<_, i64>(0))?;
            Ok(rows.filter_map(|x| x.ok()).collect())
        })
        .await?
    }

    pub async fn list_all_contact_roles(&self, workspace_id: i64) -> AppResult<Vec<(u32, i64, String, Option<String>)>> {
        // 返回 (contact_id, role_id, role_name, role_color) 联表查询，供右栏按 role 分组使用
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || -> AppResult<Vec<(u32, i64, String, Option<String>)>> {
            let c = conn.blocking_lock();
            let mut stmt = c.prepare(
                "SELECT cr.contact_id, cr.role_id, r.name, r.color
                 FROM contact_roles cr
                 JOIN roles r ON cr.role_id = r.id
                 WHERE cr.workspace_id = ?1
                 ORDER BY r.id, cr.contact_id",
            )?;
            let rows = stmt.query_map(rusqlite::params![workspace_id], |r| {
                Ok((
                    r.get::<_, i64>(0)? as u32,
                    r.get::<_, i64>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, Option<String>>(3)?,
                ))
            })?;
            Ok(rows.filter_map(|x| x.ok()).collect())
        })
        .await?
    }

    pub async fn list_pins(&self, channel_chat_id: u32) -> AppResult<Vec<PinDto>> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || -> AppResult<Vec<PinDto>> {
            let c = conn.blocking_lock();
            let mut stmt = c.prepare("SELECT id, workspace_id, channel_chat_id, msg_id, pinned_by, pinned_at FROM pins WHERE channel_chat_id = ?1 ORDER BY pinned_at DESC")?;
            let rows = stmt.query_map(rusqlite::params![channel_chat_id as i64], |r| {
                Ok(PinDto {
                    id: r.get(0)?,
                    workspace_id: r.get(1)?,
                    channel_chat_id: r.get::<_, i64>(2)? as u32,
                    msg_id: r.get::<_, i64>(3)? as u32,
                    pinned_by: r.get::<_, i64>(4)? as u32,
                    pinned_at: r.get(5)?,
                })
            })?;
            Ok(rows.filter_map(|x| x.ok()).collect())
        })
        .await?
    }

    pub async fn toggle_pin(&self, workspace_id: i64, channel_chat_id: u32, msg_id: u32, pinned_by: u32) -> AppResult<bool> {
        let conn = self.conn.clone();
        let now = chrono::Utc::now().timestamp();
        tokio::task::spawn_blocking(move || -> AppResult<bool> {
            let c = conn.blocking_lock();
            let exists: i64 = c.query_row(
                "SELECT COUNT(*) FROM pins WHERE channel_chat_id = ?1 AND msg_id = ?2",
                rusqlite::params![channel_chat_id as i64, msg_id as i64],
                |r| r.get(0),
            )?;
            if exists > 0 {
                c.execute(
                    "DELETE FROM pins WHERE channel_chat_id = ?1 AND msg_id = ?2",
                    rusqlite::params![channel_chat_id as i64, msg_id as i64],
                )?;
                Ok(false)
            } else {
                c.execute(
                    "INSERT INTO pins (workspace_id, channel_chat_id, msg_id, pinned_by, pinned_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                    rusqlite::params![workspace_id, channel_chat_id as i64, msg_id as i64, pinned_by as i64, now],
                )?;
                Ok(true)
            }
        })
        .await?
    }

    pub async fn update_workspace(
        &self,
        id: i64,
        name: Option<&str>,
        icon: Option<&str>,
    ) -> AppResult<()> {
        let conn = self.conn.clone();
        let name = name.map(|s| s.to_string());
        let icon = icon.map(|s| s.to_string());
        tokio::task::spawn_blocking(move || -> AppResult<()> {
            let c = conn.blocking_lock();
            if let Some(n) = name {
                c.execute("UPDATE workspaces SET name = ?1 WHERE id = ?2", params![n, id])?;
            }
            if let Some(ic) = icon {
                c.execute("UPDATE workspaces SET icon = ?1 WHERE id = ?2", params![ic, id])?;
            }
            Ok(())
        })
        .await??;
        Ok(())
    }

    pub async fn update_channel(
        &self,
        chat_id: u32,
        name: Option<&str>,
        topic: Option<&str>,
        category: Option<&str>,
    ) -> AppResult<()> {
        let conn = self.conn.clone();
        let name = name.map(|s| s.to_string());
        let topic = topic.map(|s| s.to_string());
        let category = category.map(|s| s.to_string());
        tokio::task::spawn_blocking(move || -> AppResult<()> {
            let c = conn.blocking_lock();
            if let Some(n) = name {
                c.execute("UPDATE channels SET name = ?1 WHERE chat_id = ?2", params![n, chat_id])?;
            }
            if let Some(t) = topic {
                c.execute("UPDATE channels SET topic = ?1 WHERE chat_id = ?2", params![t, chat_id])?;
            }
            if let Some(cat) = category {
                c.execute("UPDATE channels SET category = ?1 WHERE chat_id = ?2", params![cat, chat_id])?;
            }
            Ok(())
        })
        .await??;
        Ok(())
    }

    pub async fn delete_workspace_rows(&self, id: i64) -> AppResult<()> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || -> AppResult<()> {
            let c = conn.blocking_lock();
            c.execute("DELETE FROM pins WHERE workspace_id = ?1", params![id])?;
            c.execute("DELETE FROM contact_roles WHERE workspace_id = ?1", params![id])?;
            c.execute("DELETE FROM roles WHERE workspace_id = ?1", params![id])?;
            c.execute("DELETE FROM channels WHERE workspace_id = ?1", params![id])?;
            c.execute("DELETE FROM workspaces WHERE id = ?1", params![id])?;
            Ok(())
        })
        .await??;
        Ok(())
    }

    pub async fn delete_channel_row(&self, chat_id: u32) -> AppResult<()> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || -> AppResult<()> {
            let c = conn.blocking_lock();
            c.execute("DELETE FROM channels WHERE chat_id = ?1", params![chat_id])?;
            Ok(())
        })
        .await??;
        Ok(())
    }

    pub async fn insert_card(
        &self,
        workspace_id: i64,
        channel_chat_id: u32,
        type_: &str,
        title: &str,
        description: Option<&str>,
        status: &str,
        assignee_contact_id: Option<u32>,
        due_date: Option<i64>,
        created_by: u32,
        created_at: i64,
        source_msg_id: Option<u32>,
    ) -> AppResult<i64> {
        let conn = self.conn.clone();
        let type_ = type_.to_string();
        let title = title.to_string();
        let description = description.map(|s| s.to_string());
        let status = status.to_string();
        tokio::task::spawn_blocking(move || -> AppResult<i64> {
            let c = conn.blocking_lock();
            c.execute(
                "INSERT INTO cards (workspace_id, channel_chat_id, type, title, description, status, assignee_contact_id, due_date, created_by, created_at, updated_at, position, source_msg_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10, 0, ?11)",
                params![workspace_id, channel_chat_id, type_, title, description, status, assignee_contact_id, due_date, created_by, created_at, source_msg_id],
            )?;
            Ok(c.last_insert_rowid())
        })
        .await?
    }

    pub async fn update_card_fields(
        &self,
        card_id: i64,
        title: Option<&str>,
        description: Option<Option<&str>>,
        status: Option<&str>,
        assignee_contact_id: Option<Option<u32>>,
        due_date: Option<Option<i64>>,
        updated_at: i64,
    ) -> AppResult<()> {
        let conn = self.conn.clone();
        let title = title.map(|s| s.to_string());
        let description = description.map(|s| s.map(|s| s.to_string()));
        let status = status.map(|s| s.to_string());
        tokio::task::spawn_blocking(move || -> AppResult<()> {
            let c = conn.blocking_lock();
            if let Some(t) = title {
                c.execute("UPDATE cards SET title=?1, updated_at=?2 WHERE id=?3", params![t, updated_at, card_id])?;
            }
            if let Some(d) = description {
                c.execute("UPDATE cards SET description=?1, updated_at=?2 WHERE id=?3", params![d, updated_at, card_id])?;
            }
            if let Some(s) = status {
                c.execute("UPDATE cards SET status=?1, updated_at=?2 WHERE id=?3", params![s, updated_at, card_id])?;
            }
            if let Some(a) = assignee_contact_id {
                c.execute("UPDATE cards SET assignee_contact_id=?1, updated_at=?2 WHERE id=?3", params![a, updated_at, card_id])?;
            }
            if let Some(d) = due_date {
                c.execute("UPDATE cards SET due_date=?1, updated_at=?2 WHERE id=?3", params![d, updated_at, card_id])?;
            }
            Ok(())
        })
        .await?
    }

    pub async fn delete_card(&self, card_id: i64) -> AppResult<()> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || -> AppResult<()> {
            let c = conn.blocking_lock();
            c.execute("DELETE FROM cards WHERE id=?1", params![card_id])?;
            Ok(())
        })
        .await?
    }

    pub async fn list_cards(&self, workspace_id: i64, channel_chat_id: u32) -> AppResult<Vec<(i64, i64, u32, Option<u32>, String, String, Option<String>, String, Option<u32>, Option<i64>, u32, i64, i64, i64, i64, Option<u32>)>> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || -> AppResult<Vec<_>> {
            let c = conn.blocking_lock();
            let mut stmt = c.prepare(
                "SELECT id, workspace_id, channel_chat_id, msg_id, type, title, description, status, assignee_contact_id, due_date, created_by, created_at, updated_at, position, 0, source_msg_id FROM cards WHERE workspace_id=?1 AND channel_chat_id=?2 ORDER BY status, position, created_at",
            )?;
            let rows = stmt.query_map(params![workspace_id, channel_chat_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?, row.get(10)?, row.get(11)?, row.get(12)?, row.get(13)?, row.get(14)?, row.get(15)?))
            })?;
            let mut out = Vec::new();
            for r in rows { out.push(r?); }
            Ok(out)
        })
        .await?
    }

    pub async fn get_card_row(&self, card_id: i64) -> AppResult<Option<(i64, i64, u32, Option<u32>, String, String, Option<String>, String, Option<u32>, Option<i64>, u32, i64, i64, i64, i64, Option<u32>)>> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || -> AppResult<Option<_>> {
            let c = conn.blocking_lock();
            let row = c.query_row(
                "SELECT id, workspace_id, channel_chat_id, msg_id, type, title, description, status, assignee_contact_id, due_date, created_by, created_at, updated_at, position, 0, source_msg_id FROM cards WHERE id=?1",
                params![card_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?, row.get(10)?, row.get(11)?, row.get(12)?, row.get(13)?, row.get(14)?, row.get(15)?)),
            ).optional()?;
            Ok(row)
        })
        .await?
    }

    pub async fn find_card_by_dedup(&self, channel_chat_id: u32, title: &str, created_at: i64) -> AppResult<Option<i64>> {
        let conn = self.conn.clone();
        let title = title.to_string();
        tokio::task::spawn_blocking(move || -> AppResult<Option<i64>> {
            let c = conn.blocking_lock();
            let row = c.query_row(
                "SELECT id FROM cards WHERE channel_chat_id=?1 AND title=?2 AND ABS(created_at - ?3) < 60",
                params![channel_chat_id, title, created_at],
                |row| row.get(0),
            ).optional()?;
            Ok(row)
        })
        .await?
    }

    pub async fn set_card_msg_id(&self, card_id: i64, msg_id: u32) -> AppResult<()> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || -> AppResult<()> {
            let c = conn.blocking_lock();
            c.execute("UPDATE cards SET msg_id=?1 WHERE id=?2", params![msg_id, card_id])?;
            Ok(())
        })
        .await?
    }

    pub async fn set_channel_space_type(&self, chat_id: u32, space_type: &str) -> AppResult<()> {
        let conn = self.conn.clone();
        let space_type = space_type.to_string();
        tokio::task::spawn_blocking(move || -> AppResult<()> {
            let c = conn.blocking_lock();
            c.execute("UPDATE channels SET space_type=?1 WHERE chat_id=?2", params![space_type, chat_id])?;
            Ok(())
        })
        .await?
    }

    pub async fn get_channel_space_type(&self, chat_id: u32) -> AppResult<Option<String>> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || -> AppResult<Option<String>> {
            let c = conn.blocking_lock();
            let row = c.query_row(
                "SELECT space_type FROM channels WHERE chat_id=?1",
                params![chat_id],
                |row| row.get(0),
            ).optional()?;
            Ok(row)
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

    #[tokio::test(flavor = "multi_thread")]
    async fn test_role_insert_list_and_assign() {
        let tmp = tempfile::tempdir().unwrap();
        let db = Db::new(tmp.path().join("test.db")).await.unwrap();
        db.migrate().await.unwrap();
        let ws_id = db.insert_workspace("FE", 100, None).await.unwrap();
        let role_id = db.insert_role(ws_id, "core", None).await.unwrap();
        db.set_contact_role(ws_id, 42, role_id).await.unwrap();
        let roles = db.list_roles(ws_id).await.unwrap();
        assert_eq!(roles.len(), 1);
        assert_eq!(roles[0].name, "core");
        let my_roles = db.list_contact_roles(ws_id, 42).await.unwrap();
        assert_eq!(my_roles.len(), 1);
        assert_eq!(my_roles[0], role_id);
        // 验证联表查询 list_all_contact_roles
        let all = db.list_all_contact_roles(ws_id).await.unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].0, 42); // contact_id
        assert_eq!(all[0].1, role_id); // role_id
        assert_eq!(all[0].2, "core"); // role_name
        assert_eq!(all[0].3, None); // role_color
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_pin_toggle() {
        let tmp = tempfile::tempdir().unwrap();
        let db = Db::new(tmp.path().join("test.db")).await.unwrap();
        db.migrate().await.unwrap();
        let ws_id = db.insert_workspace("FE", 100, None).await.unwrap();
        // pin
        let pinned = db.toggle_pin(ws_id, 200, 999, 1).await.unwrap();
        assert!(pinned);
        let pins = db.list_pins(200).await.unwrap();
        assert_eq!(pins.len(), 1);
        assert_eq!(pins[0].msg_id, 999);
        // unpin
        let pinned2 = db.toggle_pin(ws_id, 200, 999, 1).await.unwrap();
        assert!(!pinned2);
        let pins2 = db.list_pins(200).await.unwrap();
        assert_eq!(pins2.len(), 0);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_update_workspace_and_channel() {
        let tmp = tempfile::tempdir().unwrap();
        let db = Db::new(tmp.path().join("test.db")).await.unwrap();
        db.migrate().await.unwrap();
        let ws_id = db.insert_workspace("Old", 100, Some("O")).await.unwrap();
        let ch_id = db.insert_channel(ws_id, 200, "old-name", "General", 0).await.unwrap();
        // update workspace
        db.update_workspace(ws_id, Some("New"), Some("N")).await.unwrap();
        let ws = db.list_workspaces().await.unwrap().into_iter().find(|w| w.id == ws_id).unwrap();
        assert_eq!(ws.name, "New");
        assert_eq!(ws.icon.as_deref(), Some("N"));
        // update channel (by chat_id)
        db.update_channel(200, Some("new-name"), Some("topic-x"), Some("Events")).await.unwrap();
        let ch = db.list_channels(ws_id).await.unwrap().into_iter().find(|c| c.chat_id == 200).unwrap();
        assert_eq!(ch.name, "new-name");
        assert_eq!(ch.topic.as_deref(), Some("topic-x"));
        assert_eq!(ch.category, "Events");
        // delete channel row
        db.delete_channel_row(200).await.unwrap();
        assert!(db.list_channels(ws_id).await.unwrap().is_empty());
        // delete workspace rows (cascades channels)
        db.insert_channel(ws_id, 300, "c2", "General", 1).await.unwrap();
        db.delete_workspace_rows(ws_id).await.unwrap();
        assert!(db.list_workspaces().await.unwrap().is_empty());
        assert!(db.list_channels(ws_id).await.unwrap().is_empty());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_cards_schema() {
        let tmp = tempfile::tempdir().unwrap();
        let db = Db::new(tmp.path().join("test.db")).await.unwrap();
        db.migrate().await.unwrap();
        // channels.space_type 列存在
        let st = db.get_channel_space_type(999).await.unwrap();
        assert_eq!(st, None); // 不存在的频道返回 None
        // 插入一个 channel 再测
        let conn = db.conn.clone();
        tokio::task::spawn_blocking(move || -> AppResult<()> {
            let c = conn.blocking_lock();
            c.execute("INSERT INTO channels (workspace_id, chat_id, name, category, position) VALUES (1, 100, 'test', 'General', 0)", [])?;
            Ok(())
        }).await.unwrap();
        let st = db.get_channel_space_type(100).await.unwrap();
        assert_eq!(st, Some("chat".to_string())); // 默认 chat
        // 改为 card
        db.set_channel_space_type(100, "card").await.unwrap();
        let st = db.get_channel_space_type(100).await.unwrap();
        assert_eq!(st, Some("card".to_string()));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_card_crud() {
        let tmp = tempfile::tempdir().unwrap();
        let db = Db::new(tmp.path().join("test.db")).await.unwrap();
        db.migrate().await.unwrap();
        let now = 1234567890;
        let id = db.insert_card(1, 100, "task", "测试任务", Some("描述"), "todo", Some(5), Some(now + 86400), 1, now, None).await.unwrap();
        assert!(id > 0);
        // 查找
        let found = db.find_card_by_dedup(100, "测试任务", now).await.unwrap();
        assert_eq!(found, Some(id));
        // 更新状态
        db.update_card_fields(id, None, None, Some("in_progress"), None, None, now + 1).await.unwrap();
        let row = db.get_card_row(id).await.unwrap().unwrap();
        assert_eq!(row.7, "in_progress"); // status 字段(index 7)
        // 列表
        let list = db.list_cards(1, 100).await.unwrap();
        assert_eq!(list.len(), 1);
        // 删除
        db.delete_card(id).await.unwrap();
        let row = db.get_card_row(id).await.unwrap();
        assert!(row.is_none());
    }
}
