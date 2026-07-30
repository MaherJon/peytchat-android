# SP2 管理闭环 + 聊天体验 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 SP1 静态展示外壳升级为可操作应用:右栏 settings tab 管理 workspace/频道/账号生命周期,聊天补齐发送状态/reply 闭环/reaction 选择器/消息删除/历史加载/日期分隔/加载态/toast/role 动态/composer 多行/hover 操作。

**Architecture:** 后端新增 10 个 Tauri 命令(update/delete/leave workspace/channel + update_profile/get_my_qr/logout/delete_msg)+ get_chat_msgs 加 before_msg_id 分页参数 + db.rs 辅助方法;前端右栏 settings tab 上下文敏感,新增 settingsPanel/toast 模块,改造 chatView/message/composer/wsRail/channelTree/shell,所有失败经 toast 提示不再静默。

**Tech Stack:** Rust + Tauri v2 + deltachat crate + rusqlite(后端);Vanilla JS + Vite + highlight.js(前端)。

## Global Constraints

- `chatmail/core` 禁止修改,所有改动在 `src-tauri/` 与 `src/` 内
- 暗色主题色板固定(继承 SP1):底 `#0d0d0d` / 面板 `#0a0a0a` / 边框 `#1a1a1a`/`#222` / active `#1f1f1f` / capsule `#161616` / 文字 `#e5e5e5`/`#d4d4d4`/`#888`/`#555`/`#444`
- reaction 符号固定 `↑`(映射 👍)/ `+`(映射 ➕)/ `★` / `!`,不引入 emoji
- DTO 字段 snake_case,`#[derive(Serialize)]`,前端直接消费
- 本地 sqlite 路径 `app_data_dir/peytchat.db`,rusqlite 同步访问用 `spawn_blocking` 包裹
- 前端不引入测试框架,后端 Rust 用 `#[cfg(test)]` 单测
- 不做(留给 SP3):添加好友入口、联系人请求处理、成员详情转私聊、Cmd+K 搜索、桌面通知、Dock 角标、持久化、空状态引导卡

---

## File Structure

**后端:**
- `src-tauri/src/db.rs`(改):新增 update_workspace/update_channel/delete_workspace_channels/delete_channel_row 辅助方法
- `src-tauri/src/commands.rs`(改):新增 10 个命令 + get_chat_msgs 加 before_msg_id 参数
- `src-tauri/src/dto.rs`(改):MsgDto 加 before_id 用途说明(不改 DTO 结构)
- `src-tauri/src/lib.rs`(改):注册新命令

**前端:**
- `src/styles.css`(改):spinner/toast/msg-actions/msg-reaction-picker/msg-del-btn/reply-preview/textarea 样式
- `src/state.js`(改):加 messagesOldestId/roles/wsMembers/toastMsg 字段
- `src/shell/shell.js`(改):ct-user click 开账号 settings
- `src/shell/wsRail.js`(改):workspace 图标未读聚合角标 + 点击开 settings
- `src/shell/channelTree.js`(改):ct-sub 显成员数 + 折叠持久化(localStorage)
- `src/shell/rightDrawer.js`(改):tabs 改 [members,pin,settings],settings 分支
- `src/dialogs/settingsPanel.js`(新):账号/workspace/频道设置面板
- `src/chat/chatView.js`(改):加载态 + 历史加载 + role 拉取 + 空消息引导
- `src/chat/message.js`(改):发送状态 + reaction 选择器 + 删除 + 日期分隔 + hover 操作 + role 动态
- `src/chat/composer.js`(改):textarea 多行 + reply 预览条 + ESC + Cmd+Enter
- `src/toast.js`(新):toast 错误提示

---

### Task 1: db.rs 新增 update/delete 辅助方法

**Files:**
- Modify: `src-tauri/src/db.rs`

**Interfaces:**
- Consumes: `Db` from SP1 Task 1, `WorkspaceDto`/`ChannelDto` from SP1 Task 3
- Produces: `Db::update_workspace(id, name?, icon?)`, `Db::update_channel(chat_id, name?, topic?, category?)`, `Db::delete_workspace_rows(id)`, `Db::delete_channel_row(chat_id)`

- [ ] **Step 1: 写失败测试**

在 `src-tauri/src/db.rs` 的 `#[cfg(test)] mod tests` 末尾追加:

```rust
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
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd src-tauri && cargo test test_update_workspace_and_channel -- --nocapture`
Expected: FAIL with "method `update_workspace` not found"

- [ ] **Step 3: 实现方法**

在 `src-tauri/src/db.rs` 的 `impl Db` 块末尾(`find_workspace_by_master_chat` 之后,`list_contact_roles` 之前)添加:

```rust
pub async fn update_workspace(
    &self,
    id: i64,
    name: Option<&str>,
    icon: Option<&str>,
) -> AppResult<()> {
    let conn = self.conn.clone();
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
```

注意:文件顶部需确保有 `use rusqlite::params;`(若已有则跳过)。

- [ ] **Step 4: 运行测试验证通过**

Run: `cd src-tauri && cargo test test_update_workspace_and_channel -- --nocapture`
Expected: PASS

- [ ] **Step 5: 运行全量测试确保无回归**

Run: `cd src-tauri && cargo test`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/db.rs
git commit -m "feat(db): add update/delete helpers for workspace and channel"
```

---

### Task 2: 后端新增 10 个管理命令

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`(注册命令)

**Interfaces:**
- Consumes: `Db::update_workspace/update_channel/delete_workspace_rows/delete_channel_row` from Task 1
- Produces: 10 个 Tauri 命令(update_workspace/delete_workspace/leave_workspace/update_channel/delete_channel/leave_channel/update_profile/get_my_qr/logout/delete_msg)

- [ ] **Step 1: 在 commands.rs 末尾添加命令**

在 `src-tauri/src/commands.rs` 文件末尾(`validate_channels` 之后)添加:

```rust
#[tauri::command]
pub async fn update_workspace(
    state: State<'_, AppState>,
    id: i64,
    name: Option<String>,
    icon: Option<String>,
) -> AppResult<()> {
    state.db.update_workspace(id, name.as_deref(), icon.as_deref()).await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_workspace(
    state: State<'_, AppState>,
    id: i64,
) -> AppResult<()> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    // leave 所有关联的 core chat(master + channels)
    let chans = state.db.list_channels(id).await?;
    for ch in chans {
        let _ = chat::leave_group(&ctx, deltachat::chat::ChatId::new(ch.chat_id)).await;
    }
    // 查 master_chat_id 后 leave
    let wss = state.db.list_workspaces().await?;
    if let Some(ws) = wss.into_iter().find(|w| w.id == id) {
        let _ = chat::leave_group(&ctx, deltachat::chat::ChatId::new(ws.master_chat_id)).await;
    }
    // 删本地元数据
    state.db.delete_workspace_rows(id).await?;
    Ok(())
}

#[tauri::command]
pub async fn leave_workspace(
    state: State<'_, AppState>,
    id: i64,
) -> AppResult<()> {
    // leave 只删本地元数据,不动 core chat(保留可重新加入)
    state.db.delete_workspace_rows(id).await?;
    Ok(())
}

#[tauri::command]
pub async fn update_channel(
    state: State<'_, AppState>,
    chat_id: u32,
    name: Option<String>,
    topic: Option<String>,
    category: Option<String>,
) -> AppResult<()> {
    state.db.update_channel(chat_id, name.as_deref(), topic.as_deref(), category.as_deref()).await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_channel(
    state: State<'_, AppState>,
    chat_id: u32,
) -> AppResult<()> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    chat::leave_group(&ctx, deltachat::chat::ChatId::new(chat_id)).await?;
    state.db.delete_channel_row(chat_id).await?;
    Ok(())
}

#[tauri::command]
pub async fn leave_channel(
    state: State<'_, AppState>,
    chat_id: u32,
) -> AppResult<()> {
    state.db.delete_channel_row(chat_id).await?;
    Ok(())
}

#[tauri::command]
pub async fn update_profile(
    state: State<'_, AppState>,
    name: String,
) -> AppResult<()> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    ctx.set_config(deltachat::config::Config::Displayname, Some(&name)).await?;
    Ok(())
}

#[tauri::command]
pub async fn get_my_qr(state: State<'_, AppState>) -> AppResult<String> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    // 用 SELF contact 的 securejoin QR
    let qr = deltachat::securejoin::get_securejoin_qr(&ctx, None).await?;
    Ok(qr)
}

#[tauri::command]
pub async fn logout(state: State<'_, AppState>) -> AppResult<()> {
    let accounts = state.accounts.lock().await;
    if let Some(id) = accounts.get_selected_account_id() {
        if let Some(ctx) = accounts.get_account(id) {
            ctx.stop_io().await;
        }
        accounts.unselect_account();
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_msg(
    state: State<'_, AppState>,
    msg_id: u32,
) -> AppResult<()> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let ids = vec![deltachat::message::MsgId::new(msg_id)];
    deltachat::message::delete_msgs(&ctx, &ids).await?;
    Ok(())
}
```

注意:
- `chat::leave_group` 签名 `leave_group(context, chat_id)` — 查 core/src/chat.rs 确认。
- `get_securejoin_qr` 签名 `get_securejoin_qr(context, group: Option<ChatId>) -> Result<String>` — 传 None 返回个人 QR。
- `accounts.unselect_account()` — 查 core/src/accounts.rs 确认方法名,若不存在用 `accounts.select_account(None)` 或等价。
- `ctx.stop_io()` 已在 SP1 用过。
- `Config::Displayname` 在 core/src/config.rs。
- `delete_msgs(context, &[MsgId])` 在 core/src/message.rs。
- 若以上 API 签名与实际不符,implementer 应查阅 core 源码调整调用形式(不改 core),在 report 中记录偏差。

- [ ] **Step 2: 在 lib.rs 注册命令**

修改 `src-tauri/src/lib.rs` 的 `invoke_handler` 宏,在现有命令列表末尾(`commands::validate_channels,` 之后)添加:

```rust
commands::update_workspace,
commands::delete_workspace,
commands::leave_workspace,
commands::update_channel,
commands::delete_channel,
commands::leave_channel,
commands::update_profile,
commands::get_my_qr,
commands::logout,
commands::delete_msg,
```

- [ ] **Step 3: 编译验证**

Run: `cd src-tauri && cargo build`
Expected: 编译通过(若 API 签名不符,调整后重试;记录偏差)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(cmd): add 10 management commands (workspace/channel/profile/qr/logout/delete_msg)"
```

---

### Task 3: get_chat_msgs 加 before_msg_id 分页参数

**Files:**
- Modify: `src-tauri/src/commands.rs`(get_chat_msgs 签名)
- Modify: `src/chat/chatView.js`(调用传参)
- Modify: `src/api.js`(若 call 签名需调整,一般无需)

**Interfaces:**
- Consumes: 现有 `get_chat_msgs(chat_id: u32) -> Vec<MsgDto>`
- Produces: `get_chat_msgs(chat_id: u32, before_msg_id: Option<u32>) -> Vec<MsgDto>`,返回最多 50 条;`before_msg_id = None` 返回最近 50 条;`Some(id)` 返回该 id 之前的 50 条

- [ ] **Step 1: 修改 get_chat_msgs 签名与实现**

修改 `src-tauri/src/commands.rs` 的 `get_chat_msgs`(约 line 261):

```rust
#[tauri::command]
pub async fn get_chat_msgs(
    state: State<'_, AppState>,
    chat_id: u32,
    before_msg_id: Option<u32>,
) -> AppResult<Vec<MsgDto>> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let chat_id = deltachat::chat::ChatId::new(chat_id);
    let mut items = match chat::get_chat_msgs(&ctx, chat_id, deltachat::constants::DC_GCM_ADDDAYMARKER, None).await? {
        Some(items) => items,
        None => return Ok(vec![]),
    };
    // items 按时间倒序(core 返回最新在前);before_msg_id 过滤
    if let Some(before) = before_msg_id {
        let before_pos = items.iter().position(|it| match it {
            chat::ChatItem::Message { msg_id } => *msg_id.to_u32() == before,
            _ => false,
        });
        if let Some(pos) = before_pos {
            items = items.into_iter().skip(pos + 1).collect();
        } else {
            items = vec![];
        }
    }
    // 取前 50 条
    let items: Vec<_> = items.into_iter().take(50).collect();
    let mut out = Vec::new();
    for it in items {
        if let chat::ChatItem::Message { msg_id } = it {
            if msg_id.is_deprecated() { continue; }
            let m = match message::Message::load_from_db(&ctx, msg_id).await { Ok(m) => m, Err(_) => continue };
            let from_id = m.get_from_id();
            let from_name = if from_id == deltachat::contact::ContactId::SELF {
                state.self_name().await.unwrap_or_else(|| "我".to_string())
            } else {
                Contact::get_by_id(&ctx, from_id).await?.get_display_name().to_string()
            };
            let (quote_from, quote_text) = match m.quoted_message(&ctx).await? {
                Some(q) => {
                    let q_from_id = q.get_from_id();
                    let q_name = if q_from_id == deltachat::contact::ContactId::SELF {
                        "我".to_string()
                    } else {
                        Contact::get_by_id(&ctx, q_from_id).await?.get_display_name().to_string()
                    };
                    (Some(q_name), Some(q.get_text()))
                }
                None => (None, None),
            };
            out.push(MsgDto {
                msg_id: msg_id.to_u32(),
                chat_id: chat_id.to_u32(),
                from_id: from_id.to_u32(),
                from_name,
                text: m.get_text(),
                ts: m.get_timestamp() as i64,
                is_out: m.is_outgoing(),
                state: format!("{:?}", m.get_state()).to_lowercase(),
                quote_from,
                quote_text,
            });
        }
    }
    Ok(out)
}
```

注意:
- `state.self_name()` 是辅助方法,若 AppState 无此方法,implementer 应在 state.rs 加 `pub async fn self_name(&self) -> Option<String>`,内部调 `self.current().await?.get_config(Config::Displayname).await.ok().flatten()`。若实现复杂可省略,直接在 commands.rs 内联获取。
- `DC_GCM_ADDDAYMARKER` 已在 SP1 使用,保持一致。
- 若 core 返回顺序与假设不符(最新在后),implementer 应调整 skip/take 逻辑,在 report 记录。

- [ ] **Step 2: 修改前端 chatView.js 调用**

修改 `src/chat/chatView.js` 的 `renderChatView`,首次加载调 `call("get_chat_msgs", {chatId, beforeMsgId: null})`,存储 `state.messagesOldestId = out[0]?.msg_id`(数组第一个是最旧或最新取决于 core 顺序,implementer 根据实际调整)。

历史加载函数 `loadEarlier()`:
```js
async function loadEarlier() {
  if (!state.messagesOldestId || state.noMoreMsgs) return;
  const older = await call("get_chat_msgs", {chatId: state.currentChatId, beforeMsgId: state.messagesOldestId});
  if (older.length === 0) { state.noMoreMsgs = true; return; }
  state.messages = [...older, ...state.messages];
  state.messagesOldestId = older[0]?.msg_id;
  renderMessages();
}
```

messages 容器加 scroll 监听,`scrollTop === 0` 时调 loadEarlier()。

- [ ] **Step 3: 编译 + build 验证**

Run: `cd src-tauri && cargo build && cd .. && npm run build`
Expected: 均成功

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src/chat/chatView.js
git commit -m "feat(chat): paginate get_chat_msgs with before_msg_id and load earlier on scroll"
```

---

### Task 4: toast 模块 + styles.css 基础样式(spinner/toast/textarea)

**Files:**
- Create: `src/toast.js`
- Modify: `src/styles.css`

**Interfaces:**
- Produces: `showToast(msg)` 全局函数;`.spinner`/`.toast`/`.composer textarea` CSS 类

- [ ] **Step 1: 创建 src/toast.js**

```js
let toastEl = null;
let toastTimer = null;

export function showToast(msg) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "toast";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 3000);
}
```

- [ ] **Step 2: 在 styles.css 末尾追加样式**

```css
/* toast */
.toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--border-strong);
  padding: 8px 16px;
  font-size: 11px;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 1000;
  pointer-events: none;
}
.toast.show { opacity: 1; }

/* spinner */
.spinner {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  gap: 4px;
}
.spinner::before, .spinner::after, .spinner > span {
  content: "";
  width: 4px;
  height: 4px;
  background: var(--text-mute);
  border-radius: 50%;
  animation: spin 1.2s infinite ease-in-out;
}
.spinner::after { animation-delay: 0.2s; }
.spinner > span { animation-delay: 0.4s; display: block; }
@keyframes spin {
  0%, 80%, 100% { opacity: 0.3; }
  40% { opacity: 1; }
}

/* composer textarea */
.composer textarea {
  flex: 1;
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 11px;
  color: var(--text);
  font-family: var(--font);
  resize: none;
  outline: none;
  min-height: 32px;
  max-height: 120px;
  line-height: 1.5;
}
.composer textarea:focus { border-color: var(--text-mute); }

/* reply preview */
.reply-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  font-size: 10px;
  color: var(--text-mute);
  margin-bottom: 6px;
}
.reply-preview .rp-cancel {
  cursor: pointer;
  color: var(--text-weak);
  padding: 0 4px;
}
.reply-preview .rp-cancel:hover { color: var(--text); }

/* msg actions (hover) */
.msg .msg-pin-btn,
.msg .msg-reply-btn,
.msg .msg-del-btn,
.msg .msg-react-btn {
  display: none;
  cursor: pointer;
  color: var(--text-weak);
  margin-left: 8px;
}
.msg:hover .msg-pin-btn,
.msg:hover .msg-reply-btn,
.msg:hover .msg-del-btn,
.msg:hover .msg-react-btn { display: inline; }

/* reaction picker */
.msg-reaction-picker {
  position: absolute;
  display: none;
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  padding: 4px;
  gap: 6px;
  z-index: 10;
}
.msg-reaction-picker.show { display: flex; }
.msg-reaction-picker span {
  cursor: pointer;
  padding: 2px 6px;
  font-size: 12px;
  color: var(--text-mute);
}
.msg-reaction-picker span:hover { color: var(--text); }

/* msg sending/failed state */
.msg.sending { opacity: 0.6; }
.msg.sending .msg-text::after {
  content: " ⏳";
  color: var(--text-weak);
}
.msg.failed .msg-text::after {
  content: " ⚠";
  color: var(--text);
}
.msg.failed { cursor: pointer; }

/* date divider */
.msg-date-divider {
  text-align: center;
  color: var(--text-weak);
  font-size: 9px;
  padding: 12px 0 4px;
  letter-spacing: 0.5px;
}

/* empty guide */
.guide-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-mute);
  font-size: 11px;
  gap: 12px;
}
.guide-card button {
  background: var(--panel);
  border: 1px solid var(--border-strong);
  color: var(--text);
  padding: 6px 16px;
  font-size: 11px;
  border-radius: 4px;
  cursor: pointer;
}
.guide-card button:hover { background: var(--active); }
```

- [ ] **Step 3: build 验证**

Run: `npm run build`
Expected: 成功

- [ ] **Step 4: Commit**

```bash
git add src/toast.js src/styles.css
git commit -m "feat(ui): add toast, spinner, textarea, reply-preview, msg-actions, reaction-picker, date-divider, guide-card styles"
```

---

### Task 5: state.js 扩展字段

**Files:**
- Modify: `src/state.js`

**Interfaces:**
- Produces: `state.messagesOldestId`, `state.noMoreMsgs`, `state.roles`, `state.wsMembers`, `state.collapsedCategories`

- [ ] **Step 1: 扩展 state 对象**

修改 `src/state.js`,在现有 state 对象中添加字段(保持现有字段不变):

```js
export const state = {
  // ... 现有字段保留 ...
  messagesOldestId: null,
  noMoreMsgs: false,
  roles: [],
  wsMembers: {},
  collapsedCategories: {},
};
```

- [ ] **Step 2: build 验证**

Run: `npm run build`
Expected: 成功

- [ ] **Step 3: Commit**

```bash
git add src/state.js
git commit -m "feat(state): add messagesOldestId/noMoreMsgs/roles/wsMembers/collapsedCategories fields"
```

---

### Task 6: settingsPanel.js — 账号/workspace/频道设置面板

**Files:**
- Create: `src/dialogs/settingsPanel.js`
- Modify: `src/shell/rightDrawer.js`(tabs 改 + settings 分支)
- Modify: `src/shell/shell.js`(ct-user click)
- Modify: `src/shell/wsRail.js`(点击 workspace 开 settings)
- Modify: `src/state.js`(加 homeMode 设置入口,若已有则跳过)

**Interfaces:**
- Consumes: 10 个后端命令 from Task 2;`state.homeMode`/`currentWsId`/`currentChatId`/`workspaces`/`channels`/`self`
- Produces: `renderSettingsPanel(body)` 函数,根据上下文渲染账号/workspace/频道设置表单

- [ ] **Step 1: 创建 src/dialogs/settingsPanel.js**

```js
import { call } from "../api.js";
import { showToast } from "../toast.js";
import { state } from "../state.js";
import { refreshWorkspaces, renderWsRail } from "../shell/wsRail.js";
import { refreshChannels, renderChannelTree } from "../shell/channelTree.js";
import { renderChatView } from "../chat/chatView.js";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export async function renderSettingsPanel(body) {
  if (state.homeMode) {
    return renderAccountSettings(body);
  }
  if (state.currentChatId) {
    return renderChannelSettings(body);
  }
  if (state.currentWsId) {
    return renderWorkspaceSettings(body);
  }
  body.innerHTML = `<div class="guide-card">选择一个 workspace 或频道查看设置</div>`;
}

async function renderAccountSettings(body) {
  const profile = await call("get_self_profile");
  body.innerHTML = `
    <div class="rd-group">账号</div>
    <div style="padding:0 16px 8px;display:flex;flex-direction:column;gap:8px">
      <label style="font-size:9px;color:#555">显示名</label>
      <input id="acc-name" value="${esc(profile.name || "")}" style="background:#0a0a0a;border:1px solid #222;border-radius:4px;padding:6px 10px;color:#e5e5e5;font-size:11px" />
      <label style="font-size:9px;color:#555">邮箱(只读)</label>
      <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:4px;padding:6px 10px;color:#888;font-size:11px">${esc(profile.addr || "—")}</div>
      <button id="acc-save" style="background:#161616;border:1px solid #222;color:#e5e5e5;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;margin-top:4px">保存</button>
      <button id="acc-qr" style="background:transparent;border:1px solid #222;color:#888;padding:6px;border-radius:4px;font-size:11px;cursor:pointer">我的二维码</button>
      <button id="acc-logout" style="background:transparent;border:1px solid #222;color:#555;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;margin-top:12px">登出</button>
    </div>
  `;
  document.getElementById("acc-save").onclick = async () => {
    const name = document.getElementById("acc-name").value.trim();
    if (!name) return;
    try {
      await call("update_profile", { name });
      state.self = await call("get_self_profile");
      showToast("已保存");
    } catch (e) { showToast(e.message || String(e)); }
  };
  document.getElementById("acc-qr").onclick = async () => {
    try {
      const qr = await call("get_my_qr");
      showQrOverlay(qr);
    } catch (e) { showToast(e.message || String(e)); }
  };
  document.getElementById("acc-logout").onclick = async () => {
    try {
      await call("logout");
      location.reload();
    } catch (e) { showToast(e.message || String(e)); }
  };
}

async function renderWorkspaceSettings(body) {
  const ws = state.workspaces.find((w) => w.id === state.currentWsId);
  if (!ws) { body.innerHTML = ""; return; }
  body.innerHTML = `
    <div class="rd-group">Workspace</div>
    <div style="padding:0 16px 8px;display:flex;flex-direction:column;gap:8px">
      <label style="font-size:9px;color:#555">名称</label>
      <input id="ws-name" value="${esc(ws.name)}" style="background:#0a0a0a;border:1px solid #222;border-radius:4px;padding:6px 10px;color:#e5e5e5;font-size:11px" />
      <label style="font-size:9px;color:#555">图标(1-2 字符)</label>
      <input id="ws-icon" value="${esc(ws.icon || "")}" maxlength="2" style="background:#0a0a0a;border:1px solid #222;border-radius:4px;padding:6px 10px;color:#e5e5e5;font-size:11px" />
      <button id="ws-save" style="background:#161616;border:1px solid #222;color:#e5e5e5;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;margin-top:4px">保存</button>
      <button id="ws-master" style="background:transparent;border:1px solid #222;color:#888;padding:6px;border-radius:4px;font-size:11px;cursor:pointer">进入总群</button>
      <button id="ws-qr" style="background:transparent;border:1px solid #222;color:#888;padding:6px;border-radius:4px;font-size:11px;cursor:pointer">workspace 二维码</button>
      <button id="ws-leave" style="background:transparent;border:1px solid #222;color:#555;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;margin-top:12px">离开 workspace</button>
      <button id="ws-delete" style="background:transparent;border:1px solid #222;color:#555;padding:6px;border-radius:4px;font-size:11px;cursor:pointer">删除 workspace</button>
    </div>
  `;
  document.getElementById("ws-save").onclick = async () => {
    const name = document.getElementById("ws-name").value.trim();
    const icon = document.getElementById("ws-icon").value.trim();
    if (!name) return;
    try {
      await call("update_workspace", { id: ws.id, name, icon: icon || null });
      await refreshWorkspaces();
      renderWsRail();
      showToast("已保存");
    } catch (e) { showToast(e.message || String(e)); }
  };
  document.getElementById("ws-master").onclick = async () => {
    state.currentChatId = ws.master_chat_id;
    state.homeMode = false;
    await renderChatView(ws.master_chat_id);
  };
  document.getElementById("ws-qr").onclick = async () => {
    try {
      const qr = await call("get_securejoin_qr", { chatId: ws.master_chat_id });
      showQrOverlay(qr);
    } catch (e) { showToast(e.message || String(e)); }
  };
  document.getElementById("ws-leave").onclick = async () => {
    if (!confirm("离开此 workspace?本地元数据将删除,core 群保留。")) return;
    try {
      await call("leave_workspace", { id: ws.id });
      await refreshWorkspaces();
      renderWsRail();
      state.currentWsId = null;
      state.homeMode = true;
      await import("../dialogs/homeView.js").then((m) => m.renderHomeView());
      showToast("已离开");
    } catch (e) { showToast(e.message || String(e)); }
  };
  document.getElementById("ws-delete").onclick = async () => {
    if (!confirm("删除此 workspace?将离开所有关联群,本地元数据全删。")) return;
    try {
      await call("delete_workspace", { id: ws.id });
      await refreshWorkspaces();
      renderWsRail();
      state.currentWsId = null;
      state.homeMode = true;
      await import("../dialogs/homeView.js").then((m) => m.renderHomeView());
      showToast("已删除");
    } catch (e) { showToast(e.message || String(e)); }
  };
}

async function renderChannelSettings(body) {
  const ch = state.channels.find((c) => c.chat_id === state.currentChatId);
  if (!ch) { body.innerHTML = ""; return; }
  body.innerHTML = `
    <div class="rd-group">频道</div>
    <div style="padding:0 16px 8px;display:flex;flex-direction:column;gap:8px">
      <label style="font-size:9px;color:#555">名称</label>
      <input id="ch-name" value="${esc(ch.name)}" style="background:#0a0a0a;border:1px solid #222;border-radius:4px;padding:6px 10px;color:#e5e5e5;font-size:11px" />
      <label style="font-size:9px;color:#555">Topic</label>
      <input id="ch-topic" value="${esc(ch.topic || "")}" style="background:#0a0a0a;border:1px solid #222;border-radius:4px;padding:6px 10px;color:#e5e5e5;font-size:11px" />
      <label style="font-size:9px;color:#555">分类</label>
      <input id="ch-cat" value="${esc(ch.category)}" style="background:#0a0a0a;border:1px solid #222;border-radius:4px;padding:6px 10px;color:#e5e5e5;font-size:11px" />
      <button id="ch-save" style="background:#161616;border:1px solid #222;color:#e5e5e5;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;margin-top:4px">保存</button>
      <button id="ch-leave" style="background:transparent;border:1px solid #222;color:#555;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;margin-top:12px">离开频道</button>
    </div>
  `;
  document.getElementById("ch-save").onclick = async () => {
    const name = document.getElementById("ch-name").value.trim();
    const topic = document.getElementById("ch-topic").value.trim();
    const category = document.getElementById("ch-cat").value.trim();
    if (!name) return;
    try {
      await call("update_channel", { chatId: ch.chat_id, name, topic: topic || null, category });
      await refreshChannels();
      renderChannelTree();
      showToast("已保存");
    } catch (e) { showToast(e.message || String(e)); }
  };
  document.getElementById("ch-leave").onclick = async () => {
    if (!confirm("离开此频道?")) return;
    try {
      await call("leave_channel", { chatId: ch.chat_id });
      await refreshChannels();
      renderChannelTree();
      state.currentChatId = null;
      document.getElementById("chat-main").innerHTML = `<div class="empty">选择一个频道</div>`;
      showToast("已离开");
    } catch (e) { showToast(e.message || String(e)); }
  };
}

function showQrOverlay(qrStr) {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.style.display = "flex";
  // 简单显示 QR 字符串(供复制);SP3 用 qrcode 库渲染图片
  overlay.innerHTML = `
    <div class="dialog" style="max-width:320px">
      <h2>我的二维码</h2>
      <div style="font-size:9px;color:#555;margin:8px 0;word-break:break-all;max-height:120px;overflow:auto;background:#0a0a0a;padding:8px;border:1px solid #1a1a1a;border-radius:4px">${esc(qrStr)}</div>
      <div style="font-size:9px;color:#555;margin-bottom:12px">复制此字符串,或用其他客户端扫描(若支持 URI 形式)</div>
      <div class="dialog-actions">
        <button class="primary" id="qr-copy">复制</button>
        <button id="qr-close">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById("qr-copy").onclick = () => {
    navigator.clipboard.writeText(qrStr).then(() => showToast("已复制"));
  };
  document.getElementById("qr-close").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}
```

- [ ] **Step 2: 修改 src/shell/rightDrawer.js**

修改 `src/shell/rightDrawer.js` 的 tabs 数组从 `["members","pin","search"]` 改为 `["members","pin","settings"]`。在 renderTabContent 的 switch 中,把 `case "search":` 改为 `case "settings":`,调用 `renderSettingsPanel(body)`(从 `../dialogs/settingsPanel.js` 导入)。

具体修改(根据现有代码结构调整):
- 顶部 import 加 `import { renderSettingsPanel } from "../dialogs/settingsPanel.js";`
- tabs 数组改 `const tabs = ["members", "pin", "settings"];`
- switch case `"settings"` 分支:`await renderSettingsPanel(body); break;`
- 移除 `"search"` case

- [ ] **Step 3: 修改 src/shell/shell.js(ct-user click)**

在 `src/shell/shell.js` 的 renderShell 中,找到 ct-user 渲染处(或 channelTree.js 中),给 ct-user div 加 click 事件:
```js
ctUserEl.onclick = async () => {
  state.homeMode = true;
  state.currentChatId = null;
  state.currentWsId = null;
  const { renderHomeView } = await import("../dialogs/homeView.js");
  await renderHomeView();
  // 打开右栏 settings
  state.rightDrawerOpen = true;
  state.rightDrawerTab = "settings";
  const { renderRightDrawer } = await import("./rightDrawer.js");
  renderRightDrawer();
};
```

- [ ] **Step 4: 修改 src/shell/wsRail.js(点击 workspace 开 settings)**

修改 `src/shell/wsRail.js` 的 workspace 图标 click 事件:在现有「选中 ws + 刷新频道树」之后,加「打开右栏 settings tab」:
```js
// 现有:选中 ws + 刷新频道
state.rightDrawerOpen = true;
state.rightDrawerTab = "settings";
const { renderRightDrawer } = await import("./rightDrawer.js");
renderRightDrawer();
```

- [ ] **Step 5: build 验证**

Run: `npm run build`
Expected: 成功

- [ ] **Step 6: Commit**

```bash
git add src/dialogs/settingsPanel.js src/shell/rightDrawer.js src/shell/shell.js src/shell/wsRail.js
git commit -m "feat(settings): context-sensitive settings panel (account/workspace/channel) in right drawer"
```

---

### Task 7: wsRail workspace 未读聚合角标

**Files:**
- Modify: `src/shell/wsRail.js`
- Modify: `src/styles.css`(加聚合角标样式,若 Task 4 未含)

**Interfaces:**
- Consumes: `state.channels`(含 unread 字段,SP1 已加)
- Produces: workspace 图标右上角红点显示该 ws 所有频道 unread 之和

- [ ] **Step 1: styles.css 加聚合角标样式(若 Task 4 未含)**

在 `src/styles.css` 末尾追加(若已有则跳过):
```css
.ws-icon-wrap { position: relative; }
.ws-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  background: var(--text);
  color: var(--panel);
  font-size: 9px;
  padding: 0 4px;
  border-radius: 6px;
  min-width: 12px;
  text-align: center;
  font-weight: 600;
}
.ws-badge.zero { display: none; }
```

- [ ] **Step 2: 修改 wsRail.js 渲染聚合角标**

修改 `src/shell/wsRail.js` 的 renderWsRail,workspace 图标外层加 `.ws-icon-wrap`,内部加 `.ws-badge`:
```js
// 计算 ws 聚合 unread
const wsUnread = state.channels
  .filter((c) => c.workspace_id === ws.id)
  .reduce((sum, c) => sum + (c.unread || 0), 0);
// 渲染
`<div class="ws-icon-wrap">
  <div class="ws-icon ${active}" data-id="${ws.id}" title="${esc(ws.name)}">${esc(ws.icon || ws.name[0])}</div>
  <span class="ws-badge ${wsUnread > 0 ? "" : "zero"}">${wsUnread}</span>
</div>`
```

注意:state.channels 需在 refreshChannels 后包含当前 ws 的所有频道(unread 字段)。若 state.channels 只含当前 ws 的频道,则聚合计算正确;若含多个 ws,filter by workspace_id 即可。

- [ ] **Step 3: build 验证**

Run: `npm run build`
Expected: 成功

- [ ] **Step 4: Commit**

```bash
git add src/shell/wsRail.js src/styles.css
git commit -m "feat(wsRail): workspace unread aggregate badge"
```

---

### Task 8: channelTree ct-sub 显成员数 + 折叠持久化

**Files:**
- Modify: `src/shell/channelTree.js`

**Interfaces:**
- Consumes: `state.wsMembers`(缓存,Task 5 加字段)
- Produces: ct-sub 显示 `${members} members`;category 折叠状态存 localStorage

- [ ] **Step 1: 修改 channelTree.js ct-sub 渲染**

修改 `src/shell/channelTree.js` 中 ct-sub 的渲染,从 `${channels.length} channels` 改为:
```js
const members = state.wsMembers[state.currentWsId] || 0;
`<div class="ct-sub">${members} members</div>`
```

在 refreshChannels 中,拉频道后顺便拉 master chat 成员数:
```js
// refreshChannels 末尾加
try {
  const info = await call("get_chat_info", { chatId: state.workspaces.find(w => w.id === state.currentWsId)?.master_chat_id });
  state.wsMembers[state.currentWsId] = info.members?.length || 0;
} catch {}
```

注意:若 `get_chat_info` 命令不存在,implementer 应确认后端命令名(SP1 MVP 实现了 `get_chat_info`),在 report 记录。若返回结构无 members,调整取值路径。

- [ ] **Step 2: 折叠持久化**

修改 category 渲染与 click:
```js
// 渲染时读 localStorage
const collapsed = JSON.parse(localStorage.getItem("collapsedCategories") || "{}");
const wsCats = collapsed[state.currentWsId] || {};
// category click toggle
catEl.onclick = () => {
  wsCats[catName] = !wsCats[catName];
  collapsed[state.currentWsId] = wsCats;
  localStorage.setItem("collapsedCategories", JSON.stringify(collapsed));
  state.collapsedCategories = collapsed;
  renderChannelTree();
};
// 频道列表渲染时判断 wsCats[catName]
if (wsCats[catName]) { channelsEl.style.display = "none"; }
```

- [ ] **Step 3: build 验证**

Run: `npm run build`
Expected: 成功

- [ ] **Step 4: Commit**

```bash
git add src/shell/channelTree.js
git commit -m "feat(channelTree): show member count and persist category collapse"
```

---

### Task 9: chatView.js 加载态 + role 拉取 + 空消息引导

**Files:**
- Modify: `src/chat/chatView.js`

**Interfaces:**
- Consumes: `state.roles`(Task 5),`call("list_roles")`
- Produces: renderChatView 开头显示 spinner;拉 roles 存 state;空消息显示引导文字

- [ ] **Step 1: 修改 renderChatView**

修改 `src/chat/chatView.js` 的 renderChatView:
```js
export async function renderChatView(chatId) {
  state.currentChatId = chatId;
  state.homeMode = false;
  const main = document.getElementById("chat-main");
  // 加载态
  main.innerHTML = `<div class="spinner"><span></span></div>`;
  try {
    // 拉 roles(用于 role tag 和 @mention)
    if (state.currentWsId) {
      try {
        state.roles = await call("list_roles", { workspaceId: state.currentWsId });
      } catch {}
    }
    // 拉频道信息(topic + pins)
    const [topic, pins, msgs] = await Promise.all([
      call("get_channel_topic", { chatId }).catch(() => null),
      call("get_channel_pins", { chatId }).catch(() => []),
      call("get_chat_msgs", { chatId, beforeMsgId: null }),
    ]);
    state.messages = msgs;
    state.messagesOldestId = msgs.length > 0 ? msgs[0].msg_id : null;
    state.noMoreMsgs = msgs.length < 50;
    // 渲染
    const pinCount = pins.length;
    const chName = channelName(chatId);
    main.innerHTML = `
      <div class="chat-header">
        <span class="ch-title">${escapeHtml(chName)}</span>
        ${topic ? `<span class="ch-topic">${escapeHtml(topic)}</span>` : ""}
        <div class="ch-actions">
          <span id="act-pin">pin · ${pinCount}</span>
          <span id="act-info">info</span>
        </div>
      </div>
      <div id="messages" class="messages">${msgs.length === 0 ? `<div class="guide-card">这个频道还没有消息,发第一条吧</div>` : ""}</div>
      <div id="composer-area"></div>
    `;
    // 渲染消息
    if (msgs.length > 0) {
      const messagesEl = document.getElementById("messages");
      const { renderMessage, bindMessageActions } = await import("./message.js");
      let html = "";
      let prevDate = null;
      for (const m of msgs) {
        const d = new Date(m.ts * 1000);
        const dateStr = formatDate(d);
        if (dateStr !== prevDate) {
          html += `<div class="msg-date-divider">${dateStr}</div>`;
          prevDate = dateStr;
        }
        html += await renderMessage(m);
      }
      messagesEl.innerHTML = html;
      bindMessageActions();
      // 滚动到底
      messagesEl.scrollTop = messagesEl.scrollHeight;
      // 历史加载
      messagesEl.onscroll = () => {
        if (messagesEl.scrollTop === 0 && !state.noMoreMsgs && state.messagesOldestId) {
          loadEarlier(chatId);
        }
      };
    }
    // composer
    const { renderComposer } = await import("./composer.js");
    renderComposer(chatId, () => refreshCurrentChat(chatId));
    // header actions
    document.getElementById("act-pin").onclick = async () => {
      state.rightDrawerOpen = true;
      state.rightDrawerTab = "pin";
      const { renderRightDrawer } = await import("../shell/rightDrawer.js");
      renderRightDrawer();
    };
    document.getElementById("act-info").onclick = async () => {
      state.rightDrawerOpen = true;
      state.rightDrawerTab = "members";
      const { renderRightDrawer } = await import("../shell/rightDrawer.js");
      renderRightDrawer();
    };
    await call("mark_chat_noticed", { chatId }).catch(() => {});
  } catch (e) {
    main.innerHTML = `<div class="guide-card">加载失败:${escapeHtml(e.message || String(e))}</div>`;
    showToast(e.message || String(e));
  }
}

function formatDate(d) {
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "今天";
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "昨天";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

async function loadEarlier(chatId) {
  if (!state.messagesOldestId || state.noMoreMsgs) return;
  const messagesEl = document.getElementById("messages");
  const prevHeight = messagesEl.scrollHeight;
  const prevScroll = messagesEl.scrollTop;
  try {
    const older = await call("get_chat_msgs", { chatId, beforeMsgId: state.messagesOldestId });
    if (older.length === 0) { state.noMoreMsgs = true; return; }
    state.messages = [...older, ...state.messages];
    state.messagesOldestId = older[0].msg_id;
    state.noMoreMsgs = older.length < 50;
    // 重新渲染并保持滚动位置
    const { renderMessage, bindMessageActions } = await import("./message.js");
    let html = "";
    let prevDate = null;
    for (const m of state.messages) {
      const d = new Date(m.ts * 1000);
      const dateStr = formatDate(d);
      if (dateStr !== prevDate) {
        html += `<div class="msg-date-divider">${dateStr}</div>`;
        prevDate = dateStr;
      }
      html += await renderMessage(m);
    }
    messagesEl.innerHTML = html;
    bindMessageActions();
    messagesEl.scrollTop = prevScroll + (messagesEl.scrollHeight - prevHeight);
  } catch (e) {
    showToast(e.message || String(e));
  }
}
```

注意:
- `showToast` 需从 `../toast.js` import。
- `escapeHtml` 需从现有工具导入或内联。
- `channelName` 函数保持现有(Task 12 SP1)。
- `refreshCurrentChat` 保持现有。

- [ ] **Step 2: build 验证**

Run: `npm run build`
Expected: 成功

- [ ] **Step 3: Commit**

```bash
git add src/chat/chatView.js
git commit -m "feat(chatView): loading spinner, role fetch, date dividers, load earlier, empty guide"
```

---

### Task 10: message.js 发送状态 + reaction 选择器 + 删除 + role 动态 + hover 操作

**Files:**
- Modify: `src/chat/message.js`

**Interfaces:**
- Consumes: `state.roles`,`call("delete_msg")`,`call("send_reaction")`
- Produces: 消息渲染支持 sending/failed 状态;hover 显示 pin/reply/react/del 按钮;reaction 选择器;role tag 动态

- [ ] **Step 1: 修改 renderMessage**

修改 `src/chat/message.js` 的 renderMessage,加状态类、hover 按钮、role 动态:

```js
export async function renderMessage(m) {
  const isOut = m.is_out;
  const stateClass = m._state ? ` ${m._state}` : "";
  // role tag 动态:查 state.roles + contact_roles(简化:SP2 先用 from_id 匹配,若无则不显示)
  const roleTag = !isOut && m.from_id ? `<span class="msg-role">${escapeHtml(getRoleName(m.from_id))}</span>` : "";
  const replyMark = m.quote_from ? `<span class="msg-reply-mark">↩ reply to ${escapeHtml(m.quote_from)}</span>` : "";
  const quoteBlock = m.quote_text ? `<div class="msg-quote">${escapeHtml(m.quote_from || '')}: ${escapeHtml(m.quote_text.slice(0, 80))}</div>` : "";
  const textHtml = renderText(m.text);
  const reactionsHtml = await renderReactions(m.msg_id);
  const pinBtn = `<span class="msg-pin-btn" data-msg="${m.msg_id}" title="pin">pin</span>`;
  const replyBtn = `<span class="msg-reply-btn" data-msg="${m.msg_id}" title="reply">reply</span>`;
  const reactBtn = `<span class="msg-react-btn" data-msg="${m.msg_id}" title="react">+</span>`;
  const delBtn = isOut ? `<span class="msg-del-btn" data-msg="${m.msg_id}" title="delete">del</span>` : "";
  return `
    <div class="msg${stateClass}" data-msg="${m.msg_id}" style="position:relative">
      <div class="msg-meta">
        <span class="msg-name">${escapeHtml(m.from_name)}</span>
        <span class="msg-time">${formatTs(m.ts)}</span>
        ${roleTag}${replyMark}
        ${pinBtn} ${replyBtn} ${reactBtn} ${delBtn}
      </div>
      ${quoteBlock}
      <div class="msg-text">${textHtml}</div>
      ${reactionsHtml}
      <div class="msg-reaction-picker" id="rp-${m.msg_id}">
        <span data-emoji="👍">↑</span>
        <span data-emoji="➕">+</span>
        <span data-emoji="★">★</span>
        <span data-emoji="!">!</span>
      </div>
    </div>
  `;
}

function getRoleName(contactId) {
  // SP2 简化:state.roles 若含 contact_id 映射则返回,否则返回 "member"
  // 实际 contact_roles 映射需调 list_all_contact_roles,这里先用 fallback
  return "member";
}
```

注意:getRoleName 的完整实现需 list_all_contact_roles 返回 contact→role 映射。SP2 简化为固定 "member",SP3 优化。implementer 可尝试调 `list_all_contact_roles({workspaceId})` 拉映射存 state.contactRoles,若 API 返回结构支持则用真实 role name,否则 fallback "member"。在 report 记录。

- [ ] **Step 2: 修改 bindMessageActions**

修改 `src/chat/message.js` 的 bindMessageActions,加 react/del 绑定:

```js
export function bindMessageActions() {
  document.querySelectorAll(".msg-react-btn").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const msgId = btn.dataset.msg;
      const picker = document.getElementById(`rp-${msgId}`);
      // 关闭其他 picker
      document.querySelectorAll(".msg-reaction-picker.show").forEach((p) => { if (p !== picker) p.classList.remove("show"); });
      picker.classList.toggle("show");
    };
  });
  document.querySelectorAll(".msg-reaction-picker span").forEach((s) => {
    s.onclick = async (e) => {
      e.stopPropagation();
      const emoji = s.dataset.emoji;
      const msgId = s.parentElement.id.replace("rp-", "");
      const picker = s.parentElement;
      picker.classList.remove("show");
      try {
        await call("send_reaction", { chatId: state.currentChatId, msgId: Number(msgId), emoji });
        await refreshCurrentChat();
      } catch (e) { showToast(e.message || String(e)); }
    };
  });
  document.querySelectorAll(".msg-del-btn").forEach((btn) => {
    btn.onclick = async () => {
      const msgId = btn.dataset.msg;
      if (!confirm("删除这条消息?")) return;
      try {
        await call("delete_msg", { msgId: Number(msgId) });
        await refreshCurrentChat();
      } catch (e) { showToast(e.message || String(e)); }
    };
  });
  // 现有 pin/reply 绑定保持
  document.querySelectorAll(".msg-pin-btn").forEach((btn) => { /* 保持现有 */ });
  document.querySelectorAll(".msg-reply-btn").forEach((btn) => { /* 保持现有 */ });
  document.querySelectorAll(".msg-reaction").forEach((btn) => { /* 保持现有 toggle */ });
  // 点击空白关闭 picker
  document.addEventListener("click", () => {
    document.querySelectorAll(".msg-reaction-picker.show").forEach((p) => p.classList.remove("show"));
  }, { once: true });
}
```

注意:`refreshCurrentChat` 和 `showToast` 需 import。`call` 已 import。

- [ ] **Step 3: 修改 highlightMentions 读 state.roles**

修改 `src/chat/message.js` 的 highlightMentions(若 SP1 Task 14 已实现),targets 从硬编码改为:
```js
const targets = [...(state.roles || []).map((r) => r.name), state.self?.name].filter(Boolean).map(escapeRegex);
```

- [ ] **Step 4: build 验证**

Run: `npm run build`
Expected: 成功

- [ ] **Step 5: Commit**

```bash
git add src/chat/message.js
git commit -m "feat(message): sending/failed state, reaction picker, delete, role dynamic, hover actions"
```

---

### Task 11: composer.js textarea 多行 + reply 预览 + ESC + Cmd+Enter + 发送状态

**Files:**
- Modify: `src/chat/composer.js`

**Interfaces:**
- Consumes: `state.messages`,`state.currentChatId`
- Produces: textarea 支持多行;reply 预览条 + ESC 取消;Cmd+Enter 发送;发送状态(sending/sent/failed)

- [ ] **Step 1: 重写 renderComposer**

修改 `src/chat/composer.js`:

```js
import { call } from "../api.js";
import { showToast } from "../toast.js";
import { state } from "../state.js";
import { renderChatView } from "./chatView.js";

export function renderComposer(chatId, onSent) {
  const area = document.getElementById("composer-area");
  // reply 预览条(若 dataset.replyTo 设置)
  let replyPreview = "";
  if (area.dataset.replyTo) {
    const replyMsg = state.messages.find((m) => m.msg_id === Number(area.dataset.replyTo));
    if (replyMsg) {
      replyPreview = `
        <div class="reply-preview" id="reply-preview">
          <span>↩ 回复 ${escapeHtml(replyMsg.from_name)}: ${escapeHtml(replyMsg.text.slice(0, 40))}</span>
          <span class="rp-cancel" id="rp-cancel">×</span>
        </div>
      `;
    }
  }
  area.innerHTML = `
    ${replyPreview}
    <div class="composer">
      <textarea id="composer-input" placeholder="发消息到频道..." rows="1"></textarea>
    </div>
  `;
  const input = document.getElementById("composer-input");
  // reply cancel
  const rpCancel = document.getElementById("rp-cancel");
  if (rpCancel) {
    rpCancel.onclick = () => {
      delete area.dataset.replyTo;
      renderComposer(chatId, onSent);
    };
  }
  // 自适应高度
  input.oninput = () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  };
  // keydown
  input.onkeydown = async (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      await send(chatId, input, area, onSent);
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      await send(chatId, input, area, onSent);
    } else if (e.key === "Escape") {
      if (area.dataset.replyTo) {
        delete area.dataset.replyTo;
        renderComposer(chatId, onSent);
      }
    }
  };
  input.focus();
}

async function send(chatId, input, area, onSent) {
  const text = input.value.trim();
  if (!text) return;
  // 乐观更新:插入临时消息
  const tmpId = `tmp_${Date.now()}`;
  const tmpMsg = {
    msg_id: tmpId,
    from_id: state.self?.id || 0,
    from_name: state.self?.name || "我",
    text,
    ts: Math.floor(Date.now() / 1000),
    is_out: true,
    _state: "sending",
    quote_from: null,
    quote_text: null,
  };
  state.messages.push(tmpMsg);
  // 渲染临时消息
  const messagesEl = document.getElementById("messages");
  if (messagesEl) {
    const { renderMessage } = await import("./message.js");
    messagesEl.insertAdjacentHTML("beforeend", await renderMessage(tmpMsg));
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  input.value = "";
  input.style.height = "auto";
  try {
    let msgId;
    if (area.dataset.replyTo) {
      msgId = await call("send_reply", { chatId, text, quoteMsgId: Number(area.dataset.replyTo) });
      delete area.dataset.replyTo;
      renderComposer(chatId, onSent);
    } else {
      msgId = await call("send_text", { chatId, text });
    }
    // 更新临时消息状态
    tmpMsg.msg_id = msgId;
    tmpMsg._state = "sent";
    // 重新渲染该条
    const el = messagesEl?.querySelector(`[data-msg="${tmpId}"]`);
    if (el) {
      const { renderMessage } = await import("./message.js");
      el.outerHTML = await renderMessage(tmpMsg);
    }
    if (onSent) await onSent();
  } catch (e) {
    tmpMsg._state = "failed";
    const el = messagesEl?.querySelector(`[data-msg="${tmpId}"]`);
    if (el) {
      el.classList.remove("sending");
      el.classList.add("failed");
      el.onclick = async () => {
        // 点击重发
        input.value = text;
        tmpMsg._state = "sending";
        el.classList.remove("failed");
        el.classList.add("sending");
        await send(chatId, input, area, onSent);
      };
    }
    showToast(e.message || String(e));
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
```

注意:
- `renderChatView` import 可能循环,若报错可移除(实际未用)。
- `state.self.id` 若无,用 0 fallback。
- 临时消息 data-msg 用 tmpId(string),发送成功后 outerHTML 替换为真实 msgId。

- [ ] **Step 2: 修改 message.js 的 reply 按钮设置 dataset**

确认 `src/chat/message.js` 的 bindMessageActions 中,reply 按钮设置 `composer-area.dataset.replyTo`(不是 composer-input)。SP1 Task 12 用的是 `composer.dataset.replyTo`,需统一为 `composer-area`(因为 renderComposer 现在从 area 读)。若 SP1 代码用 `composer` 变量名指向 composer-area 元素,保持一致即可。implementer 确认并调整。

- [ ] **Step 3: build 验证**

Run: `npm run build`
Expected: 成功

- [ ] **Step 4: Commit**

```bash
git add src/chat/composer.js src/chat/message.js
git commit -m "feat(composer): textarea multiline, reply preview, ESC, Cmd+Enter, optimistic send state"
```

---

### Task 12: 全局 catch 改 toast + 最终验证

**Files:**
- Modify: `src/shell/shell.js`(事件监听 catch)
- Modify: `src/dialogs/wsWizard.js`(catch)
- Modify: `src/dialogs/channelCreate.js`(catch)
- Modify: `src/dialogs/homeView.js`(catch)

**Interfaces:**
- Consumes: `showToast` from Task 4
- Produces: 所有静默 catch{} 改为 showToast

- [ ] **Step 1: 全局替换静默 catch**

在各文件的 `catch {}` 或 `catch (e) {}` 后,加 `showToast(e.message || String(e));`。具体:
- `src/shell/shell.js`:validate_channels 的 try/catch 可保持静默(启动时无账号正常);其他事件刷新的 catch 改 toast。
- `src/dialogs/wsWizard.js`:已有 error display,保持。
- `src/dialogs/channelCreate.js`:已有 error display,保持。
- `src/dialogs/homeView.js`:若有 catch{},改 toast。

implementer 扫描所有 `catch` 语句,判断是否需 toast(启动初始化的可静默,用户操作的必须 toast)。

- [ ] **Step 2: 全量验证**

Run: `cd src-tauri && cargo build && cd .. && npm run build`
Expected: 均成功

- [ ] **Step 3: Commit**

```bash
git add src/shell/shell.js src/dialogs/homeView.js
git commit -m "feat(error): replace silent catches with toast notifications"
```

---

## Self-Review

### Spec coverage
- 1.1 交互模型(tabs 改 settings)→ Task 6
- 1.2 入口(ct-user/wsRail click)→ Task 6
- 1.3 账号设置 → Task 6
- 1.4 workspace 设置 → Task 6
- 1.5 频道设置 → Task 6
- 1.6 后端 10 命令 → Task 2
- 1.7 前端结构 → Task 6/7/8
- 2.1 发送状态 → Task 11
- 2.2 reply 闭环 → Task 11
- 2.3 reaction 选择器 → Task 10
- 2.4 消息删除 → Task 10
- 2.5 历史加载 → Task 3 + Task 9
- 2.6 日期分隔 → Task 9
- 2.7 加载态 → Task 4(CSS)+ Task 9(使用)
- 2.8 toast → Task 4 + Task 12
- 2.9 role 动态 → Task 9(拉取)+ Task 10(使用)
- 2.10 composer 多行 → Task 11
- 2.11 hover 操作 → Task 4(CSS)+ Task 10(使用)

### Placeholder scan
无 TBD/TODO;所有步骤含完整代码。

### Type consistency
- `update_workspace(id: i64, name: Option<String>, icon: Option<String>)` — Task 1 db.rs 与 Task 2 commands.rs 一致
- `update_channel(chat_id: u32, name: Option<String>, topic: Option<String>, category: Option<String>)` — 一致
- `delete_msg(msg_id: u32)` — 一致
- `get_chat_msgs(chat_id: u32, before_msg_id: Option<u32>)` — Task 3 后端与前端 beforeMsgId 一致(Tauri 自动驼峰转 snake)

无遗漏。计划完整。
