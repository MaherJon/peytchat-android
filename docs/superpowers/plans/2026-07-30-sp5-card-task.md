# SP5 Card+Task 协作模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 SP4 Huly 地基上启用 Work application,实现 Card/Task 看板+列表视图、Card 详情、消息转 Card,并通过 chatmail core 的 `[CARD]` JSON 消息实现多设备同步。

**Architecture:** 单表 cards(type 区分 card/task) + channels.space_type 字段 + 8 个 Tauri 命令 + 3 个前端视图模块(kanban/list/cardDetail)。Card 创建时写本地 sqlite 同时发 deltachat `[CARD]` 消息;接收方解析消息回填 sqlite,通过 (channel + title + created_at ±60s) 去重。assignee 通过邮箱地址跨设备映射。

**Tech Stack:** Rust + Tauri v2 + rusqlite + deltachat crate;Vanilla JS + Vite;highlight.js(已有)。

## Global Constraints

- 核心目录 `chatmail/core` 是 git submodule,禁止修改
- 黑白配色:#0d0d0d/#0a0a0a/#1a1a1a/#222/#1f1f1f/#e5e5e5/#888/#555
- 字号 9/10/11/12/13/14/15px,字重 500/600
- 无 emoji,极简符号(▣/▾/▸/·)
- Tauri v2 命令参数名 camelCase→snake_case 自动转换
- 后端 rusqlite 操作必须 `spawn_blocking`
- 前端 `call()` 函数在 `src/api.js`,事件 `onEvent()` 在 `src/shell/shell.js`

---

## Task 1: 数据库 schema + CardDto

**Files:**
- Modify: `src-tauri/src/db.rs` (migrate 函数加 cards 表 + channels.space_type)
- Modify: `src-tauri/src/dto.rs` (加 CardDto)
- Test: `src-tauri/src/db.rs` (新增 test_cards_schema)

**Interfaces:**
- Produces: `cards` 表 + `channels.space_type` 列 + `CardDto` struct(供 T2/T3/T4 消费)

- [ ] **Step 1: db.rs migrate 加 cards 表 + channels.space_type**

在 `db.rs` 的 `migrate` 函数的 `execute_batch` 中,在 `pins` 表之后追加:

```sql
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
CREATE INDEX IF NOT EXISTS idx_cards_msg_id ON cards(msg_id);
```

注意:`channels` 表的 `space_type` 列用单独的 ALTER 语句(因为 ALTER 不能在 execute_batch 里 IF NOT EXISTS)。在 migrate 函数末尾(execute_batch 之后)加:

```rust
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
```

- [ ] **Step 2: dto.rs 加 CardDto**

在 `dto.rs` 的 `ContactRoleDto` 之后加:

```rust
#[derive(Debug, Serialize)]
pub struct CardDto {
    pub id: i64,
    pub workspace_id: i64,
    pub channel_chat_id: u32,
    pub msg_id: Option<u32>,
    pub type_: String, // serde rename to "type" for JS
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub assignee_contact_id: Option<u32>,
    pub assignee_name: Option<String>,
    pub due_date: Option<i64>,
    pub created_by: u32,
    pub created_by_name: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub position: i64,
    pub source_msg_id: Option<u32>,
}
```

注意:serde 默认用字段名,`type_` 会序列化为 `type_`。为让 JS 收到 `type`,加 `#[serde(rename = "type")]`。修正:

```rust
#[derive(Debug, Serialize)]
pub struct CardDto {
    pub id: i64,
    pub workspace_id: i64,
    pub channel_chat_id: u32,
    pub msg_id: Option<u32>,
    #[serde(rename = "type")]
    pub type_: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub assignee_contact_id: Option<u32>,
    pub assignee_name: Option<String>,
    pub due_date: Option<i64>,
    pub created_by: u32,
    pub created_by_name: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub position: i64,
    pub source_msg_id: Option<u32>,
}
```

- [ ] **Step 3: db.rs 加 cards CRUD helpers**

在 `Db` impl 块中追加 methods:

```rust
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
            "SELECT id, workspace_id, channel_chat_id, msg_id, type, title, description, status, assignee_contact_id, due_date, created_by, created_at, updated_at, position, source_msg_id FROM cards WHERE workspace_id=?1 AND channel_chat_id=?2 ORDER BY status, position, created_at",
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
            "SELECT id, workspace_id, channel_chat_id, msg_id, type, title, description, status, assignee_contact_id, due_date, created_by, created_at, updated_at, position, source_msg_id FROM cards WHERE id=?1",
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
```

注意:`optional()` 需要 `use rusqlite::OptionalExtension;`,在 db.rs 顶部加 import。

- [ ] **Step 4: db.rs 加 OptionalExtension import + test**

在 db.rs 顶部 `use rusqlite::params;` 后加:
```rust
use rusqlite::OptionalExtension;
```

在 db.rs 末尾(或在现有 tests module 中)加测试:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    async fn test_db() -> Db {
        let tmp = std::env::temp_dir().join(format!("test_cards_{}.db", std::process::id()));
        let _ = std::fs::remove_file(&tmp);
        let db = Db::new(tmp).await.unwrap();
        db.migrate().await.unwrap();
        db
    }

    #[tokio::test]
    async fn test_cards_schema() {
        let db = test_db().await;
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

    #[tokio::test]
    async fn test_card_crud() {
        let db = test_db().await;
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
```

- [ ] **Step 5: 验证编译 + 测试**

Run: `cd src-tauri && cargo build 2>&1 | tail -5`
Expected: 编译通过

Run: `cd src-tauri && cargo test test_cards 2>&1 | tail -10`
Expected: 2 个测试 PASS

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/db.rs src-tauri/src/dto.rs
git commit -m "feat(sp5-t1): cards table + channels.space_type + CardDto + CRUD helpers"
```

---

## Task 2: 后端 CRUD 命令

**Files:**
- Modify: `src-tauri/src/commands.rs` (加 create_card/update_card/delete_card/list_cards/get_card 5 个命令)
- Modify: `src-tauri/src/lib.rs` (注册 5 个命令)

**Interfaces:**
- Consumes: `CardDto` from T1, `Db` CRUD helpers from T1
- Produces: 5 个 Tauri 命令(供 T6/T7/T8 前端调用)

- [ ] **Step 1: commands.rs 加辅助函数 row_to_dto**

在 commands.rs 中加一个辅助函数,把 db 行转换为 CardDto:

```rust
async fn row_to_card_dto(
    state: &State<'_, AppState>,
    row: (i64, i64, u32, Option<u32>, String, String, Option<String>, String, Option<u32>, Option<i64>, u32, i64, i64, i64, i64, Option<u32>),
) -> AppResult<CardDto> {
    let (id, workspace_id, channel_chat_id, msg_id, type_, title, description, status, assignee_contact_id, due_date, created_by, created_at, updated_at, position, source_msg_id) = row;
    let ctx = state
        .current()
        .await
        .ok_or_else(|| AppError::Core("no account".into()))?;
    // 填充 assignee_name
    let assignee_name = if let Some(cid) = assignee_contact_id {
        Some(
            Contact::get_by_id(&ctx, ContactId::new(cid))
                .await?
                .get_display_name()
                .to_string(),
        )
    } else {
        None
    };
    // 填充 created_by_name
    let created_by_name = if created_by == 1 {
        // SELF
        ctx.get_config(Config::Displayname)
            .await?
            .unwrap_or_else(|| "我".to_string())
    } else {
        Contact::get_by_id(&ctx, ContactId::new(created_by))
            .await?
            .get_display_name()
            .to_string()
    };
    Ok(CardDto {
        id,
        workspace_id,
        channel_chat_id,
        msg_id,
        type_,
        title,
        description,
        status,
        assignee_contact_id,
        assignee_name,
        due_date,
        created_by,
        created_by_name,
        created_at,
        updated_at,
        position,
        source_msg_id,
    })
}
```

- [ ] **Step 2: commands.rs 加 create_card 命令**

```rust
#[tauri::command]
pub async fn create_card(
    state: State<'_, AppState>,
    workspace_id: i64,
    chat_id: u32,
    type_: String,
    title: String,
    description: Option<String>,
    assignee_contact_id: Option<u32>,
    due_date: Option<i64>,
) -> AppResult<CardDto> {
    let ctx = state
        .current()
        .await
        .ok_or_else(|| AppError::Core("no account".into()))?;
    let now = chrono::Utc::now().timestamp();
    let created_by = ctx.get_id();

    // 1. 写本地 sqlite
    let card_id = state
        .db
        .insert_card(
            workspace_id,
            chat_id,
            &type_,
            &title,
            description.as_deref(),
            "todo",
            assignee_contact_id,
            due_date,
            created_by,
            now,
            None,
        )
        .await?;

    // 2. 构造 [CARD] 消息
    let assignee_addr = if let Some(cid) = assignee_contact_id {
        Contact::get_by_id(&ctx, ContactId::new(cid))
            .await?
            .get_addr()
            .to_string()
    } else {
        String::new()
    };
    let created_by_addr = Contact::get_by_id(&ctx, ContactId::SELF)
        .await?
        .get_addr()
        .to_string();
    let card_json = serde_json::json!({
        "action": "create",
        "id": card_id,
        "type": type_,
        "title": title,
        "status": "todo",
        "assignee_addr": assignee_addr,
        "due_date": due_date,
        "description": description,
        "created_by_addr": created_by_addr,
        "created_at": now,
    })
    .to_string();
    let msg_text = format!("[CARD]{}", card_json);

    // 3. 发送到 deltachat
    let chat_id_dc = deltachat::chat::ChatId::new(chat_id);
    let mut msg = Message::new_text(msg_text);
    let sent_msg_id = chat::send_msg(&ctx, chat_id_dc, &mut msg).await?;

    // 4. 回填 msg_id
    state
        .db
        .set_card_msg_id(card_id, sent_msg_id.to_u32())
        .await?;

    // 5. 返回 CardDto
    let row = state
        .db
        .get_card_row(card_id)
        .await?
        .ok_or_else(|| AppError::Core("card not found after insert".into()))?;
    row_to_card_dto(&state, row).await
}
```

注意:需要在 commands.rs 顶部加 `use chrono;`(检查 Cargo.toml 是否已有 chrono 依赖,若无则加)。若无 chrono,用 `std::time::{SystemTime, UNIX_EPOCH}`:
```rust
let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
```

- [ ] **Step 3: commands.rs 加 update_card 命令**

```rust
#[tauri::command]
pub async fn update_card(
    state: State<'_, AppState>,
    card_id: i64,
    title: Option<String>,
    description: Option<Option<String>>,
    status: Option<String>,
    assignee_contact_id: Option<Option<u32>>,
    due_date: Option<Option<i64>>,
) -> AppResult<CardDto> {
    let ctx = state
        .current()
        .await
        .ok_or_else(|| AppError::Core("no account".into()))?;
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;

    state
        .db
        .update_card_fields(
            card_id,
            title.as_deref(),
            description.as_ref().map(|d| d.as_deref()),
            status.as_deref(),
            assignee_contact_id,
            due_date,
            now,
        )
        .await?;

    // 发送更新消息(供其他设备同步)
    let row = state
        .db
        .get_card_row(card_id)
        .await?
        .ok_or_else(|| AppError::Core("card not found".into()))?;
    let assignee_addr = if let Some(cid) = row.8 {
        Contact::get_by_id(&ctx, ContactId::new(cid))
            .await?
            .get_addr()
            .to_string()
    } else {
        String::new()
    };
    let card_json = serde_json::json!({
        "action": "update",
        "id": card_id,
        "type": row.4,
        "title": row.5,
        "status": row.7,
        "assignee_addr": assignee_addr,
        "due_date": row.9,
        "description": row.6,
        "created_at": row.11,
    })
    .to_string();
    let msg_text = format!("[CARD]{}", card_json);
    let chat_id_dc = deltachat::chat::ChatId::new(row.2);
    let mut msg = Message::new_text(msg_text);
    let _ = chat::send_msg(&ctx, chat_id_dc, &mut msg).await;

    row_to_card_dto(&state, row).await
}
```

- [ ] **Step 4: commands.rs 加 delete_card / list_cards / get_card 命令**

```rust
#[tauri::command]
pub async fn delete_card(
    state: State<'_, AppState>,
    card_id: i64,
) -> AppResult<()> {
    let ctx = state
        .current()
        .await
        .ok_or_else(|| AppError::Core("no account".into()))?;
    // 先取 row 用于发删除消息
    let row = state.db.get_card_row(card_id).await?;
    state.db.delete_card(card_id).await?;
    if let Some(r) = row {
        let card_json = serde_json::json!({
            "action": "delete",
            "id": card_id,
            "title": r.5,
            "created_at": r.11,
        })
        .to_string();
        let msg_text = format!("[CARD]{}", card_json);
        let chat_id_dc = deltachat::chat::ChatId::new(r.2);
        let mut msg = Message::new_text(msg_text);
        let _ = chat::send_msg(&ctx, chat_id_dc, &mut msg).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn list_cards(
    state: State<'_, AppState>,
    workspace_id: i64,
    chat_id: u32,
) -> AppResult<Vec<CardDto>> {
    let rows = state.db.list_cards(workspace_id, chat_id).await?;
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        out.push(row_to_card_dto(&state, row).await?);
    }
    Ok(out)
}

#[tauri::command]
pub async fn get_card(
    state: State<'_, AppState>,
    card_id: i64,
) -> AppResult<CardDto> {
    let row = state
        .db
        .get_card_row(card_id)
        .await?
        .ok_or_else(|| AppError::Core("card not found".into()))?;
    row_to_card_dto(&state, row).await
}
```

- [ ] **Step 5: lib.rs 注册 5 个命令**

在 `invoke_handler` 的 `generate_handler!` 宏中,在 `commands::search_msgs,` 之后加:
```rust
            commands::create_card,
            commands::update_card,
            commands::delete_card,
            commands::list_cards,
            commands::get_card,
```

- [ ] **Step 6: 验证编译**

Run: `cd src-tauri && cargo build 2>&1 | tail -10`
Expected: 编译通过(可能有未使用 warning,因为前端还未调用)

- [ ] **Step 7: 提交**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(sp5-t2): 5 card CRUD commands (create/update/delete/list/get)"
```

---

## Task 3: 同步命令(upsert_card_from_msg + message_to_card)

**Files:**
- Modify: `src-tauri/src/commands.rs` (加 upsert_card_from_msg + message_to_card)
- Modify: `src-tauri/src/lib.rs` (注册 2 个命令)

**Interfaces:**
- Consumes: T1 db helpers + T2 CardDto
- Produces: upsert_card_from_msg(供 T10 前端调用) + message_to_card(供 T9 前端调用)

- [ ] **Step 1: commands.rs 加 upsert_card_from_msg 命令**

```rust
#[tauri::command]
pub async fn upsert_card_from_msg(
    state: State<'_, AppState>,
    msg_id: u32,
    card_json: String,
) -> AppResult<Option<CardDto>> {
    let ctx = state
        .current()
        .await
        .ok_or_else(|| AppError::Core("no account".into()))?;
    let payload: serde_json::Value = serde_json::from_str(&card_json)
        .map_err(|e| AppError::Core(format!("invalid card json: {e}")))?;

    let action = payload["action"].as_str().unwrap_or("create");
    let title = payload["title"].as_str().unwrap_or("");
    let created_at = payload["created_at"].as_i64().unwrap_or(0);

    // 从 msg_id 反查 chat_id
    let msg = Message::load_from_db(&ctx, MsgId::new(msg_id)).await?;
    let channel_chat_id = msg.get_chat_id().to_u32();

    // 查 workspace_id:通过 channel_chat_id 找 channels 表
    let workspace_id = state.db.get_channel_workspace_id(channel_chat_id).await?;

    // 去重查找
    let existing = state
        .db
        .find_card_by_dedup(channel_chat_id, title, created_at)
        .await?;

    match (action, existing) {
        ("delete", Some(id)) => {
            state.db.delete_card(id).await?;
            Ok(None)
        }
        ("delete", None) => Ok(None),
        (_, Some(id)) => {
            // 更新
            let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
            let status = payload["status"].as_str();
            let description = payload["description"].as_str();
            let due_date = payload["due_date"].as_i64();
            // assignee 映射
            let assignee_cid = if let Some(addr) = payload["assignee_addr"].as_str() {
                if addr.is_empty() {
                    None
                } else {
                    Contact::lookup_by_addr(&ctx, addr).await?.map(|c| c.to_u32())
                }
            } else {
                None
            };
            state
                .db
                .update_card_fields(
                    id,
                    None,
                    description.map(|d| Some(d)),
                    status,
                    Some(assignee_cid),
                    Some(due_date),
                    now,
                )
                .await?;
            let row = state.db.get_card_row(id).await?.unwrap();
            Ok(Some(row_to_card_dto(&state, row).await?))
        }
        (_, None) => {
            // 新建
            let type_ = payload["type"].as_str().unwrap_or("card");
            let status = payload["status"].as_str().unwrap_or("todo");
            let description = payload["description"].as_str();
            let due_date = payload["due_date"].as_i64();
            let assignee_cid = if let Some(addr) = payload["assignee_addr"].as_str() {
                if addr.is_empty() {
                    None
                } else {
                    Contact::lookup_by_addr(&ctx, addr).await?.map(|c| c.to_u32())
                }
            } else {
                None
            };
            let created_by = if let Some(addr) = payload["created_by_addr"].as_str() {
                Contact::lookup_by_addr(&ctx, addr).await?.unwrap_or(ContactId::SELF).to_u32()
            } else {
                ContactId::SELF.to_u32()
            };
            let card_id = state
                .db
                .insert_card(
                    workspace_id,
                    channel_chat_id,
                    type_,
                    title,
                    description,
                    status,
                    assignee_cid,
                    due_date,
                    created_by,
                    created_at,
                    Some(msg_id),
                )
                .await?;
            state.db.set_card_msg_id(card_id, msg_id).await?;
            let row = state.db.get_card_row(card_id).await?.unwrap();
            Ok(Some(row_to_card_dto(&state, row).await?))
        }
    }
}
```

注意:需要 `use deltachat::message::MsgId;`(检查 commands.rs 顶部 import 是否已有 MsgId)。`Contact::lookup_by_addr` 是 async,签名是 `async fn lookup_by_addr(ctx, addr) -> Result<Option<ContactId>>`。

- [ ] **Step 2: db.rs 加 get_channel_workspace_id helper**

在 db.rs 中加:
```rust
pub async fn get_channel_workspace_id(&self, chat_id: u32) -> AppResult<i64> {
    let conn = self.conn.clone();
    tokio::task::spawn_blocking(move || -> AppResult<i64> {
        let c = conn.blocking_lock();
        let row = c.query_row(
            "SELECT workspace_id FROM channels WHERE chat_id=?1",
            params![chat_id],
            |row| row.get(0),
        ).optional()?;
        row.ok_or_else(|| AppError::Core(format!("channel {chat_id} not found")))
    })
    .await?
}
```

- [ ] **Step 3: commands.rs 加 message_to_card 命令**

```rust
#[tauri::command]
pub async fn message_to_card(
    state: State<'_, AppState>,
    msg_id: u32,
    workspace_id: i64,
    chat_id: u32,
    type_: String,
    title: Option<String>,
) -> AppResult<CardDto> {
    let ctx = state
        .current()
        .await
        .ok_or_else(|| AppError::Core("no account".into()))?;
    // 取消息文本作为默认 title
    let msg = Message::load_from_db(&ctx, MsgId::new(msg_id)).await?;
    let title = title.unwrap_or_else(|| {
        let text = msg.get_text();
        if text.len() > 40 {
            format!("{}...", &text[..40])
        } else {
            text
        }
    });
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
    let created_by = ctx.get_id();

    let card_id = state
        .db
        .insert_card(
            workspace_id,
            chat_id,
            &type_,
            &title,
            None,
            "todo",
            None,
            None,
            created_by,
            now,
            Some(msg_id),
        )
        .await?;

    // 发送同步消息
    let created_by_addr = Contact::get_by_id(&ctx, ContactId::SELF)
        .await?
        .get_addr()
        .to_string();
    let card_json = serde_json::json!({
        "action": "create",
        "id": card_id,
        "type": type_,
        "title": title,
        "status": "todo",
        "assignee_addr": "",
        "due_date": null,
        "description": null,
        "created_by_addr": created_by_addr,
        "created_at": now,
        "source_msg_id": msg_id,
    })
    .to_string();
    let msg_text = format!("[CARD]{}", card_json);
    let chat_id_dc = deltachat::chat::ChatId::new(chat_id);
    let mut sync_msg = Message::new_text(msg_text);
    let sent_msg_id = chat::send_msg(&ctx, chat_id_dc, &mut sync_msg).await?;
    state.db.set_card_msg_id(card_id, sent_msg_id.to_u32()).await?;

    let row = state.db.get_card_row(card_id).await?.unwrap();
    row_to_card_dto(&state, row).await
}
```

- [ ] **Step 4: lib.rs 注册 2 个命令**

```rust
            commands::upsert_card_from_msg,
            commands::message_to_card,
```

- [ ] **Step 5: 验证编译**

Run: `cd src-tauri && cargo build 2>&1 | tail -10`
Expected: 编译通过

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs src-tauri/src/db.rs
git commit -m "feat(sp5-t3): upsert_card_from_msg + message_to_card sync commands"
```

---

## Task 4: update_channel_space_type 命令 + settingsPanel UI

**Files:**
- Modify: `src-tauri/src/commands.rs` (加 update_channel_space_type)
- Modify: `src-tauri/src/lib.rs` (注册)
- Modify: `src/dialogs/settingsPanel.js` (频道设置加 space_type 切换)

**Interfaces:**
- Consumes: T1 db.set_channel_space_type
- Produces: update_channel_space_type 命令 + 频道设置 UI(供 T5 消费)

- [ ] **Step 1: commands.rs 加 update_channel_space_type**

```rust
#[tauri::command]
pub async fn update_channel_space_type(
    state: State<'_, AppState>,
    chat_id: u32,
    space_type: String,
) -> AppResult<()> {
    state.db.set_channel_space_type(chat_id, &space_type).await?;
    Ok(())
}
```

- [ ] **Step 2: lib.rs 注册**

```rust
            commands::update_channel_space_type,
```

- [ ] **Step 3: settingsPanel.js 频道设置加 space_type 切换**

在 settingsPanel.js 的频道设置渲染函数中(渲染频道名称/主题的区域),追加 space_type 切换:

```js
// 频道空间类型切换
const currentSpaceType = await call("get_channel_space_type", { chatId: state.currentChatId }).catch(() => "chat");
body.innerHTML += `
  <div class="settings-row">
    <label>空间类型</label>
    <div class="space-type-toggle">
      <button class="st-btn ${currentSpaceType === 'chat' ? 'active' : ''}" data-st="chat">聊天</button>
      <button class="st-btn ${currentSpaceType === 'card' ? 'active' : ''}" data-st="card">协作</button>
    </div>
  </div>
`;
body.querySelectorAll(".st-btn").forEach((btn) => {
  btn.onclick = async () => {
    try {
      await call("update_channel_space_type", { chatId: state.currentChatId, spaceType: btn.dataset.st });
      showToast("已切换空间类型");
      // 重新渲染频道树 + 当前视图
      const { renderChannelTree } = await import("../shell/channelTree.js");
      renderChannelTree();
    } catch (e) { showToast("切换失败: " + e.message); }
  };
});
```

注意:需要新增 `get_channel_space_type` 命令(commands.rs 加):
```rust
#[tauri::command]
pub async fn get_channel_space_type(
    state: State<'_, AppState>,
    chat_id: u32,
) -> AppResult<Option<String>> {
    state.db.get_channel_space_type(chat_id).await
}
```
lib.rs 注册:`commands::get_channel_space_type,`

- [ ] **Step 4: styles.css 加 space-type-toggle 样式**

```css
.space-type-toggle { display: flex; background: #0d0d0d; border: 1px solid #1a1a1a; border-radius: 4px; overflow: hidden; }
.st-btn { padding: 4px 10px; font-size: 11px; color: #555; cursor: pointer; border: none; background: none; font-weight: 500; }
.st-btn.active { background: #1f1f1f; color: #e5e5e5; }
```

- [ ] **Step 5: 验证编译 + 构建**

Run: `cd src-tauri && cargo build 2>&1 | tail -5`
Run: `cd /Users/xiatian/Desktop/peytchat && npm run build 2>&1 | tail -5`
Expected: 均通过

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs src/dialogs/settingsPanel.js src/styles.css
git commit -m "feat(sp5-t4): update_channel_space_type cmd + settings UI toggle"
```

---

## Task 5: Work application 启用

**Files:**
- Modify: `src/shell/appRail.js` (Work 图标激活)
- Modify: `src/shell/channelTree.js` (Work 模式 nav tree)
- Modify: `src/state.js` (currentView / cards / currentCardId)
- Modify: `src/persist.js` (持久化 currentView)

**Interfaces:**
- Consumes: T4 update_channel_space_type
- Produces: state.currentApp="work" 路由 + Work nav tree(供 T6/T7/T8 消费)

- [ ] **Step 1: state.js 加新字段**

在 state.js 的 state 对象中加:
```js
  currentView: "messages",        // "messages" | "kanban" | "list"
  cards: [],                       // 当前频道的 card 列表
  currentCardId: null,             // 选中的 card id
```

- [ ] **Step 2: persist.js 加 currentView 持久化**

在 persist.js 的 saveState/loadState 中加 `peytchat.currentView`。

- [ ] **Step 3: appRail.js Work 图标激活**

找到 appRail.js 中 Work 图标的渲染,把 disabled class 移除,添加点击 handler:
```js
// Work 图标点击
workIcon.classList.remove("disabled");
workIcon.onclick = () => {
  state.currentApp = "work";
  renderChannelTree();
  saveState();
};
```

- [ ] **Step 4: channelTree.js Work 模式 nav tree**

在 channelTree.js 的渲染函数中,按 state.currentApp 切换:
```js
export function renderChannelTree() {
  const tree = document.getElementById("channel-tree");
  if (!tree) return;
  if (state.currentApp === "work") {
    renderWorkNavTree(tree);
  } else {
    renderChatNavTree(tree);  // 原有逻辑
  }
}

async function renderWorkNavTree(tree) {
  // 查询所有 space_type='card' 的频道,按 workspace 分组
  const channels = await call("list_channels", { workspaceId: state.currentWorkspaceId });
  const cardChannels = [];
  for (const ch of channels) {
    const st = await call("get_channel_space_type", { chatId: ch.chat_id }).catch(() => "chat");
    if (st === "card") cardChannels.push(ch);
  }
  tree.innerHTML = `
    <div class="nav-header">Work</div>
    <div class="nav-group">
      <div class="nav-group-title"><span class="caret">▾</span> 协作频道</div>
      <div class="nav-children">
        ${cardChannels.map((ch) => `
          <div class="nav-item ${state.currentChatId === ch.chat_id ? "active" : ""}" data-chat="${ch.chat_id}">
            <span class="nav-icon">▣</span> ${escapeHtml(ch.name)}
          </div>
        `).join("")}
      </div>
    </div>
  `;
  tree.querySelectorAll(".nav-item").forEach((item) => {
    item.onclick = () => {
      state.currentChatId = Number(item.dataset.chat);
      state.currentView = "kanban";
      state.currentCardId = null;
      renderChannelTree();
      renderMain();
      saveState();
    };
  });
}

async function renderMain() {
  if (state.currentView === "kanban") {
    const { renderKanban } = await import("../work/kanban.js");
    await renderKanban(state.currentChatId);
  } else if (state.currentView === "list") {
    const { renderList } = await import("../work/list.js");
    await renderList(state.currentChatId);
  }
}
```

注意:`renderMain` 需要导出供 shell.js 调用。

- [ ] **Step 5: shell.js 加 Work 模式路由**

在 shell.js 的初始化中,检查 state.currentApp,如果是 work 则调用 channelTree.renderMain()。

- [ ] **Step 6: 验证构建**

Run: `npm run build 2>&1 | tail -5`
Expected: 通过(可能有 kanban.js/list.js 不存在的 warning,T6/T7 创建后消失)

- [ ] **Step 7: 提交**

```bash
git add src/shell/appRail.js src/shell/channelTree.js src/state.js src/persist.js src/shell/shell.js
git commit -m "feat(sp5-t5): Work application enabled + nav tree routing"
```

---

## Task 6: 看板视图

**Files:**
- Create: `src/work/kanban.js`
- Modify: `src/styles.css` (看板样式)

**Interfaces:**
- Consumes: T2 list_cards + update_card 命令
- Produces: renderKanban(chatId) 函数(供 T5 调用)

- [ ] **Step 1: 创建 src/work/kanban.js**

```js
import { call } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../toast.js";
import { renderCardDetail } from "./cardDetail.js";

export async function renderKanban(chatId) {
  const main = document.getElementById("chat-main");
  if (!main) return;
  // 加载 cards
  let cards = [];
  try {
    cards = await call("list_cards", { workspaceId: state.currentWorkspaceId, chatId });
    state.cards = cards;
  } catch (e) {
    showToast("加载卡片失败: " + e.message);
  }
  const todoCards = cards.filter((c) => c.status === "todo");
  const ipCards = cards.filter((c) => c.status === "in_progress");
  const doneCards = cards.filter((c) => c.status === "done");

  main.innerHTML = `
    <div class="main-header">
      <div>
        <div class="main-title">协作看板</div>
        <div class="main-subtitle">${cards.length} 个卡片</div>
      </div>
      <div class="main-actions">
        <div class="view-toggle">
          <button class="view-btn active">看板</button>
          <button class="view-btn" onclick="window.__switchToList(${chatId})">列表</button>
        </div>
        <button class="btn btn-primary" onclick="window.__newCard(${chatId})">+ 新建</button>
      </div>
    </div>
    <div class="main-body">
      <div class="kanban">
        ${renderColumn("Todo", todoCards, "todo", chatId)}
        ${renderColumn("In Progress", ipCards, "in_progress", chatId)}
        ${renderColumn("Done", doneCards, "done", chatId)}
      </div>
    </div>
  `;
  // 绑定卡片点击
  main.querySelectorAll(".card").forEach((el) => {
    el.onclick = () => {
      const cardId = Number(el.dataset.cardId);
      state.currentCardId = cardId;
      main.querySelectorAll(".card").forEach((c) => c.classList.remove("selected"));
      el.classList.add("selected");
      renderCardDetail(cardId);
    };
  });
  // 绑定状态切换按钮
  main.querySelectorAll(".card-status-btn").forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const cardId = Number(btn.dataset.cardId);
      const newStatus = btn.dataset.status;
      try {
        await call("update_card", { cardId, status: newStatus });
        await renderKanban(chatId);
      } catch (err) { showToast("更新状态失败: " + err.message); }
    };
  });
  // 暴露全局函数(简化,避免 import 循环)
  window.__switchToList = async (cid) => {
    state.currentView = "list";
    const { renderList } = await import("./list.js");
    await renderList(cid);
  };
  window.__newCard = async (cid) => {
    const title = prompt("卡片标题:");
    if (!title) return;
    try {
      await call("create_card", {
        workspaceId: state.currentWorkspaceId,
        chatId: cid,
        type_: "task",
        title,
        description: null,
        assigneeContactId: null,
        dueDate: null,
      });
      showToast("已创建");
      await renderKanban(cid);
    } catch (e) { showToast("创建失败: " + e.message); }
  };
}

function renderColumn(title, cards, status, chatId) {
  return `
    <div class="kanban-col">
      <div class="kanban-col-header">
        <span class="kanban-col-title">${title}</span>
        <span class="kanban-col-count">${cards.length}</span>
      </div>
      <div class="kanban-col-body">
        ${cards.map((c) => renderCard(c, status)).join("")}
        <div class="card-add" onclick="window.__newCard(${chatId})">+ 添加卡片</div>
      </div>
    </div>
  `;
}

function renderCard(c, currentStatus) {
  const dueStr = c.due_date ? new Date(c.due_date * 1000).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) : "";
  const isOverdue = c.due_date && c.due_date < Date.now() / 1000;
  const assigneeInitial = c.assignee_name ? c.assignee_name[0].toUpperCase() : "";
  return `
    <div class="card" data-card-id="${c.id}">
      <div class="card-title">${escapeHtml(c.title)}</div>
      <div class="card-meta">
        <span class="card-type ${c.type === 'task' ? 'task' : ''}">${c.type === 'task' ? 'Task' : 'Card'}</span>
        ${dueStr ? `<span class="card-due ${isOverdue ? 'overdue' : ''}">${dueStr}</span>` : ""}
        ${assigneeInitial ? `<span class="card-assignee">${assigneeInitial}</span>` : ""}
      </div>
      <div class="card-status-row">
        <button class="card-status-btn ${currentStatus === 'todo' ? 'active' : ''}" data-card-id="${c.id}" data-status="todo">·</button>
        <button class="card-status-btn ${currentStatus === 'in_progress' ? 'active' : ''}" data-card-id="${c.id}" data-status="in_progress">·</button>
        <button class="card-status-btn ${currentStatus === 'done' ? 'active' : ''}" data-card-id="${c.id}" data-status="done">·</button>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
```

- [ ] **Step 2: styles.css 加看板样式**

(从 mockup 复制 .kanban / .kanban-col / .card / .card-status-btn 等样式)

- [ ] **Step 3: 验证构建 + 提交**

Run: `npm run build 2>&1 | tail -5`
```bash
git add src/work/kanban.js src/styles.css
git commit -m "feat(sp5-t6): kanban view with 3 columns + status toggle"
```

---

## Task 7: 列表视图

**Files:**
- Create: `src/work/list.js`
- Modify: `src/styles.css` (列表样式)

**Interfaces:**
- Consumes: T2 list_cards 命令
- Produces: renderList(chatId) 函数

- [ ] **Step 1: 创建 src/work/list.js**

```js
import { call } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../toast.js";
import { renderCardDetail } from "./cardDetail.js";

export async function renderList(chatId) {
  const main = document.getElementById("chat-main");
  if (!main) return;
  let cards = [];
  try {
    cards = await call("list_cards", { workspaceId: state.currentWorkspaceId, chatId });
    state.cards = cards;
  } catch (e) { showToast("加载失败: " + e.message); }

  main.innerHTML = `
    <div class="main-header">
      <div>
        <div class="main-title">协作列表</div>
        <div class="main-subtitle">${cards.length} 个卡片</div>
      </div>
      <div class="main-actions">
        <div class="view-toggle">
          <button class="view-btn" onclick="window.__switchToKanban(${chatId})">看板</button>
          <button class="view-btn active">列表</button>
        </div>
        <button class="btn btn-primary" onclick="window.__newCard(${chatId})">+ 新建</button>
      </div>
    </div>
    <div class="main-body">
      <div class="list-view">
        <table class="list-table">
          <thead>
            <tr>
              <th onclick="window.__sortList('title')">标题</th>
              <th>类型</th>
              <th onclick="window.__sortList('status')">状态</th>
              <th>指派</th>
              <th>截止</th>
              <th>创建</th>
            </tr>
          </thead>
          <tbody>
            ${cards.map((c) => renderRow(c)).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
  main.querySelectorAll("tbody tr").forEach((tr) => {
    tr.onclick = () => {
      const cardId = Number(tr.dataset.cardId);
      state.currentCardId = cardId;
      main.querySelectorAll("tr").forEach((r) => r.classList.remove("selected"));
      tr.classList.add("selected");
      renderCardDetail(cardId);
    };
  });
  window.__switchToKanban = async (cid) => {
    state.currentView = "kanban";
    const { renderKanban } = await import("./kanban.js");
    await renderKanban(cid);
  };
  window.__sortList = (field) => {
    state.cards.sort((a, b) => {
      const va = a[field] || "";
      const vb = b[field] || "";
      return String(va).localeCompare(String(vb));
    });
    renderList(chatId);
  };
}

function renderRow(c) {
  const statusClass = c.status;
  const dueStr = c.due_date ? new Date(c.due_date * 1000).toLocaleDateString("zh-CN") : "—";
  const createdStr = new Date(c.created_at * 1000).toLocaleDateString("zh-CN");
  return `
    <tr data-card-id="${c.id}">
      <td class="col-title">${escapeHtml(c.title)}</td>
      <td><span class="col-type ${c.type === 'task' ? 'task' : ''}">${c.type === 'task' ? 'Task' : 'Card'}</span></td>
      <td class="col-status ${statusClass}"><span class="dot"></span>${statusLabel(c.status)}</td>
      <td>${escapeHtml(c.assignee_name || "—")}</td>
      <td>${dueStr}</td>
      <td>${createdStr}</td>
    </tr>
  `;
}

function statusLabel(s) {
  return { todo: "Todo", in_progress: "In Progress", done: "Done" }[s] || s;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
```

- [ ] **Step 2: styles.css 加列表样式**(从 mockup 复制 .list-view / .list-table 样式)

- [ ] **Step 3: 验证构建 + 提交**

```bash
git add src/work/list.js src/styles.css
git commit -m "feat(sp5-t7): list view with sortable columns"
```

---

## Task 8: Card 详情面板

**Files:**
- Create: `src/work/cardDetail.js`
- Modify: `src/shell/rightDrawer.js` (Card tab)

**Interfaces:**
- Consumes: T2 get_card + update_card 命令
- Produces: renderCardDetail(cardId) 函数

- [ ] **Step 1: 创建 src/work/cardDetail.js**

```js
import { call } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../toast.js";

export async function renderCardDetail(cardId) {
  const drawer = document.getElementById("right-drawer");
  if (!drawer) return;
  let card;
  try {
    card = await call("get_card", { cardId });
  } catch (e) {
    drawer.innerHTML = `<div class="detail-empty">加载失败</div>`;
    return;
  }
  const dueStr = card.due_date ? new Date(card.due_date * 1000).toISOString().split("T")[0] : "";
  drawer.innerHTML = `
    <div class="detail-tabs">
      <div class="detail-tab active">Card</div>
      <div class="detail-tab" onclick="window.__backToMembers()">Members</div>
    </div>
    <div class="detail-body">
      <div class="card-detail-title" contenteditable="true" id="card-title">${escapeHtml(card.title)}</div>
      <div class="card-detail-row">
        <div class="card-detail-label">类型</div>
        <div class="card-detail-value"><span class="card-type ${card.type === 'task' ? 'task' : ''}">${card.type === 'task' ? 'Task' : 'Card'}</span></div>
      </div>
      <div class="card-detail-row">
        <div class="card-detail-label">状态</div>
        <div class="card-detail-value">
          <select id="card-status">
            <option value="todo" ${card.status === 'todo' ? 'selected' : ''}>Todo</option>
            <option value="in_progress" ${card.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
            <option value="done" ${card.status === 'done' ? 'selected' : ''}>Done</option>
          </select>
        </div>
      </div>
      <div class="card-detail-row">
        <div class="card-detail-label">指派</div>
        <div class="card-detail-value">${escapeHtml(card.assignee_name || "未指派")}</div>
      </div>
      <div class="card-detail-row">
        <div class="card-detail-label">截止</div>
        <div class="card-detail-value"><input type="date" id="card-due" value="${dueStr}" /></div>
      </div>
      <div class="card-detail-row">
        <div class="card-detail-label">描述</div>
        <div class="card-detail-desc" contenteditable="true" id="card-desc">${escapeHtml(card.description || "")}</div>
      </div>
      <button class="btn btn-primary" id="card-save">保存</button>
      <button class="btn btn-ghost" id="card-delete">删除</button>
    </div>
  `;
  // 保存
  drawer.querySelector("#card-save").onclick = async () => {
    try {
      const title = drawer.querySelector("#card-title").textContent.trim();
      const status = drawer.querySelector("#card-status").value;
      const dueStr = drawer.querySelector("#card-due").value;
      const dueDate = dueStr ? new Date(dueStr).getTime() / 1000 : null;
      const desc = drawer.querySelector("#card-desc").textContent.trim();
      await call("update_card", {
        cardId,
        title,
        description: desc || null,
        status,
        assigneeContactId: null,
        dueDate,
      });
      showToast("已保存");
    } catch (e) { showToast("保存失败: " + e.message); }
  };
  // 删除
  drawer.querySelector("#card-delete").onclick = async () => {
    if (!confirm("删除此卡片?")) return;
    try {
      await call("delete_card", { cardId });
      showToast("已删除");
      state.currentCardId = null;
      drawer.innerHTML = `<div class="detail-empty">选择一个卡片</div>`;
      // 刷新看板
      if (state.currentView === "kanban") {
        const { renderKanban } = await import("./kanban.js");
        await renderKanban(state.currentChatId);
      }
    } catch (e) { showToast("删除失败: " + e.message); }
  };
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
```

- [ ] **Step 2: styles.css 加 card-detail 样式**(从 mockup 复制)

- [ ] **Step 3: 验证构建 + 提交**

```bash
git add src/work/cardDetail.js src/styles.css
git commit -m "feat(sp5-t8): card detail panel with editable fields"
```

---

## Task 9: 消息转 Card

**Files:**
- Modify: `src/chat/message.js` (转 Card 按钮)
- Modify: `src/shell/shell.js` (路由)

**Interfaces:**
- Consumes: T3 message_to_card 命令
- Produces: 消息 hover "转 Card" 按钮

- [ ] **Step 1: message.js 加转 Card 按钮**

在 message.js 的 renderMessage 函数中,消息 hover action 栏加 "转 Card" 按钮:

```js
// 在 action 栏 HTML 中追加(与 reply/react/pin 并列)
<button class="msg-action-btn msg-to-card" data-msg="${m.msg_id}" title="转 Card">Card</button>
```

在 bindMessageActions 中绑定:
```js
container.querySelectorAll(".msg-to-card").forEach((btn) => {
  btn.onclick = async () => {
    const msgId = Number(btn.dataset.msg);
    const title = prompt("卡片标题(留空用消息文本):");
    if (title === null) return; // 取消
    try {
      await call("message_to_card", {
        msgId,
        workspaceId: state.currentWorkspaceId,
        chatId: state.currentChatId,
        type_: "task",
        title: title || null,
      });
      showToast("已转为 Card");
    } catch (e) { showToast("转换失败: " + e.message); }
  };
});
```

- [ ] **Step 2: styles.css 加 msg-to-card 按钮样式**

```css
.msg-to-card { font-size: 10px; color: #555; padding: 2px 6px; }
.msg-to-card:hover { color: #e5e5e5; }
```

- [ ] **Step 3: 验证构建 + 提交**

```bash
git add src/chat/message.js src/styles.css
git commit -m "feat(sp5-t9): message to card conversion button"
```

---

## Task 10: [CARD] 消息同步事件处理

**Files:**
- Modify: `src/shell/shell.js` (IncomingMsg handler 检查 [CARD] 前缀)

**Interfaces:**
- Consumes: T3 upsert_card_from_msg 命令
- Produces: 多设备 Card 同步

- [ ] **Step 1: shell.js 加 [CARD] 消息检查**

在 shell.js 的 IncomingMsg handler 中,在常规消息处理之前,检查 [CARD] 前缀:

```js
onEvent("IncomingMsg", async (e) => {
  // ... 原有通知逻辑 ...
  // 检查是否为 [CARD] 消息
  try {
    const msgs = await call("get_chat_msgs", { chatId: e.chat_id, beforeMsgId: null });
    const msg = msgs.find((m) => m.msg_id === e.msg_id);
    if (msg && msg.text.startsWith("[CARD]")) {
      const cardJson = msg.text.slice(6); // 去掉 "[CARD]" 前缀(6 字符)
      await call("upsert_card_from_msg", { msgId: e.msg_id, cardJson });
      // 若当前在看板视图且是这个频道,刷新看板
      if (state.currentView === "kanban" && state.currentChatId === e.chat_id) {
        const { renderKanban } = await import("../work/kanban.js");
        await renderKanban(e.chat_id);
      }
      return; // [CARD] 消息不显示为普通消息(可选:仍显示,但带特殊样式)
    }
  } catch {}
  // ... 原有消息追加逻辑 ...
});
```

注意:`[CARD]` 是 6 个字符(含方括号),`slice(6)` 去掉前缀。实际上 `"[CARD]".length` 是 6,对。

- [ ] **Step 2: 验证构建 + 提交**

```bash
git add src/shell/shell.js
git commit -m "feat(sp5-t10): [CARD] message sync via IncomingMsg event"
```

---

## Task 11: 样式 + 交互打磨

**Files:**
- Modify: `src/styles.css` (统一看板/列表/Card 样式 + 动效)

- [ ] **Step 1: 补齐所有样式**

从 mockup (sp5-card-task-mockup.html) 复制所有缺失的 CSS 到 styles.css:
- .kanban / .kanban-col / .kanban-col-header / .kanban-col-body
- .card / .card-title / .card-meta / .card-type / .card-due / .card-assignee / .card-add
- .card-status-row / .card-status-btn
- .list-view / .list-table / .col-title / .col-type / .col-status / .dot
- .detail-tabs / .detail-tab / .card-detail-* / .status-pill / .assignee-row
- .view-toggle / .view-btn / .btn / .btn-primary / .btn-ghost
- .main-header / .main-title / .main-subtitle / .main-actions / .main-body

- [ ] **Step 2: 加动效**

```css
.card { transition: border-color 120ms, transform 120ms; }
.card:hover { border-color: #333; }
.card.selected { border-color: #e5e5e5; }
.detail-tab { transition: color 120ms, border-color 120ms; }
.kanban-col { transition: border-color 120ms; }
```

- [ ] **Step 3: 验证构建 + 提交**

```bash
git add src/styles.css
git commit -m "style(sp5-t11): kanban/list/card-detail styles + animations"
```

---

## Task 12: 最终验证 + 提交

**Files:**
- 无新文件,仅验证

- [ ] **Step 1: cargo build 验证**

Run: `cd src-tauri && cargo build 2>&1 | tail -10`
Expected: 编译通过

- [ ] **Step 2: cargo test 验证**

Run: `cd src-tauri && cargo test 2>&1 | tail -15`
Expected: 所有测试 PASS(含 T1 新增的 test_cards_schema + test_card_crud)

- [ ] **Step 3: npm run build 验证**

Run: `cd /Users/xiatian/Desktop/peytchat && npm run build 2>&1 | tail -8`
Expected: build 通过

- [ ] **Step 4: 手动端到端验证**

Run: `npm run tauri dev`
1. 频道设置 → 切换空间类型为"协作" → nav tree Work 出现该频道
2. 点击 Work 图标 → nav tree 切换为项目分组
3. 点击协作频道 → 看板视图渲染(三列)
4. 新建卡片 → 出现在 Todo 列
5. 点击卡片 → 右栏 Card 详情显示
6. 编辑标题/状态/截止 → 保存 → 看板更新
7. 切换列表视图 → 表格显示
8. 列头排序 → 表格重排
9. 消息 hover → "转 Card" 按钮 → 点击 → 创建成功
10. 跨设备:设备 A 创建 Card → 设备 B 收到 [CARD] 消息 → 看板出现

- [ ] **Step 5: 跨设备同步验证**

- 设备 A 创建 task → 设备 B 看板出现
- 设备 A 更新状态 → 设备 B 看板同步
- 设备 A 删除 → 设备 B 看板移除

- [ ] **Step 6: 最终提交(若有未提交修改)**

```bash
git status
# 若有未提交修改
git add -A
git commit -m "chore(sp5): final verification pass"
```

---

## Self-Review

### Spec 覆盖检查
- ✅ Work application 启用 → T5
- ✅ Card/Task 数据模型 → T1
- ✅ 看板视图 → T6
- ✅ 列表视图 → T7
- ✅ Card 详情 → T8
- ✅ 消息转 Card → T9
- ✅ 多设备同步 → T3(upsert)+ T10(事件处理)
- ✅ channels.space_type → T1(db)+ T4(命令+UI)

### 类型一致性检查
- CardDto.type_ with #[serde(rename="type")] → JS 收到 card.type ✓
- create_card 参数 type_ (Rust) → JS 调用 type_ (Tauri 自动转 snake_case)✓
- update_card 的 description: Option<Option<String>> → JS 传 null/""/string ✓
- upsert_card_from_msg 返回 Option<CardDto> → JS 收到 card|null ✓

### 占位符扫描
- 无 TBD/TODO
- 所有步骤都有具体代码或具体命令
- T6 renderColumn 中 `c.channel_chat_id` 在 map 内作用域问题已注意(实际应在外部捕获 chatId)

### 已知简化(SP6+ 处理)
- 看板无虚拟化(大量 Card 时可能卡顿)
- 无拖拽排序(仅点击状态按钮切换)
- Card 评论暂用频道消息(非独立评论系统)
- [CARD] 消息在普通消息流中可见(可选隐藏,留后续)
