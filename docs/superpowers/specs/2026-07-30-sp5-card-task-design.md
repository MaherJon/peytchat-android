# SP5 Card+Task 协作模式 设计文档

> **Sprint 定位**:SP5 = 协作模式核心 sprint。在 SP4 Huly 化地基上,落地 Card/Task 双模式核心——启用 Work application,实现看板/列表视图、Card 详情、消息转 Card,并通过 chatmail core 基础设施实现多设备同步。
>
> **前置决策**(brainstorming 5 轮问答 + mockup 确认):
> - Card/Task 数据模型:单表 + type 区分(card/task),task 额外字段(assignee/status/due_date)可空
> - Task 状态流:三状态(Todo / In Progress / Done)
> - 主视图:看板 + 列表(看板默认,右上角 toggle 切换)
> - 双重存储同步:立即同步(创建时先写本地 sqlite,同时发 deltachat 消息)
> - Card 详情:detail panel(复用 SP4 右栏,新增 Card tab)
> - Work nav tree:项目分组列表(workspace → 项目组 → card 频道)
> - Card 创建入口:看板"+ 新建" + 消息 hover"转 Card"
> - 同步机制:利用现有 chatmail core 基础设施,通过 `[CARD]` 前缀 JSON 消息实现多设备同步

## 1. 目标与范围

### 1.1 目标
1. **Work application 启用**:app-rail 的 Work 图标从 disabled 改为激活,nav-tree 按 Work 模式显示项目分组
2. **Card/Task 数据模型**:cards 表(单表 + type 区分),channels 表加 space_type 字段
3. **看板视图**:三列(Todo/In Progress/Done),卡片显示标题/类型/截止/指派人,支持状态切换
4. **列表视图**:表格(标题/类型/状态/指派/截止/创建),支持点击列头排序
5. **Card 详情**:detail panel 新增 Card tab,显示标题/描述/状态/指派/截止/评论
6. **消息转 Card**:消息 hover 显示"转 Card"按钮,点击后创建 Card 引用原消息
7. **多设备同步**:通过 chatmail core 的消息收发实现 Card 的多设备同步

### 1.2 不做(留后续 sprint)
- Inbox 统一通知 + Activity 活动流(SP6)
- 命令面板 + Viewlet 视图切换(SP7)
- Card 附件上传(消息附件已有,Card 暂不重复)
- Card 子任务/依赖关系(YAGNI)
- 拖拽排序(简化为点击状态按钮切换,拖拽留后续)
- Card 模板(YAGNI)

## 2. 数据模型

### 2.1 cards 表(单表,type 区分 card/task)

```sql
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  channel_chat_id INTEGER NOT NULL,       -- 所属频道(space_type='card' 的频道)
  msg_id INTEGER,                          -- 对应的 deltachat 消息 ID(双重存储,首次创建时为 NULL,消息发出后回填)
  type TEXT NOT NULL DEFAULT 'card',       -- "card" | "task"
  title TEXT NOT NULL,
  description TEXT,                        -- 可空
  status TEXT NOT NULL DEFAULT 'todo',     -- "todo" | "in_progress" | "done"(仅 task 用,card 始终 'todo')
  assignee_contact_id INTEGER,             -- 指派人 contact_id(仅 task,可空)
  due_date INTEGER,                        -- 截止时间戳(仅 task,可空)
  created_by INTEGER NOT NULL,             -- 创建者 contact_id
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,     -- 看板内排序(同状态内)
  source_msg_id INTEGER,                   -- 消息转 Card 时,源消息 ID(可空)
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (channel_chat_id) REFERENCES channels(chat_id)
);
CREATE INDEX IF NOT EXISTS idx_cards_workspace_channel ON cards(workspace_id, channel_chat_id);
CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);
CREATE INDEX IF NOT EXISTS idx_cards_assignee ON cards(assignee_contact_id);
CREATE INDEX IF NOT EXISTS idx_cards_msg_id ON cards(msg_id);
```

### 2.2 channels 表扩展

```sql
-- SP4 的 channels 表加 space_type 字段
ALTER TABLE channels ADD COLUMN space_type TEXT NOT NULL DEFAULT 'chat';
-- "chat" | "card"  (card 频道进入看板/列表视图)
```

### 2.3 CardDto

```rust
#[derive(Debug, Serialize)]
pub struct CardDto {
    pub id: i64,
    pub workspace_id: i64,
    pub channel_chat_id: u32,
    pub msg_id: Option<u32>,           // 对应 deltachat 消息 ID
    pub type_: String,                  // "card" | "task" (避免 Rust 关键字 type)
    pub title: String,
    pub description: Option<String>,
    pub status: String,                 // "todo" | "in_progress" | "done"
    pub assignee_contact_id: Option<u32>,
    pub assignee_name: Option<String>,  // 前端显示用,后端 JOIN contacts 填充
    pub due_date: Option<i64>,
    pub created_by: u32,
    pub created_by_name: String,        // 前端显示用
    pub created_at: i64,
    pub updated_at: i64,
    pub position: i64,
    pub source_msg_id: Option<u32>,
}
```

## 3. 多设备同步机制(基于 chatmail core)

### 3.1 同步原理

利用 deltachat 的消息收发实现 Card 多设备同步,**无需额外服务器**:

1. **创建 Card**:前端调 `create_card` 命令 → 后端写本地 sqlite + 调 `deltachat::chat::send_text(chat_id, "[CARD]" + JSON)` 发送消息 → 返回前端
2. **其他设备接收**:deltachat 收到消息 → `IncomingMsg` 事件 → 前端检查 `[CARD]` 前缀 → 解析 JSON → 调 `upsert_card_from_msg` 命令回填本地 sqlite → 刷新看板
3. **更新 Card**:前端调 `update_card` 命令 → 后端更新本地 sqlite + 调 `send_text` 发送更新消息 → 其他设备收到后更新

### 3.2 Card 消息格式

```
[CARD]{"action":"create","id":123,"type":"task","title":"设计登录页","status":"todo","assignee_addr":"alice@example.com","due_date":1234567890,"description":"...","source_msg_id":456,"created_by_addr":"bob@example.com","created_at":1234567890}
```

- 前缀:`[CARD]` (5 字节,便于前端快速检查)
- JSON payload 字段:
  - `action`: "create" | "update" | "delete"
  - `id`: 本地 sqlite 的 card id(仅用于本地,跨设备通过 title+channel+created_at 去重)
  - `type`/`title`/`status`/`due_date`/`description`: Card 字段
  - `assignee_addr`/`created_by_addr`: 邮箱地址(跨设备通过 Contact::lookup_by_addr 映射到本地 contact_id)
  - `source_msg_id`: 消息转 Card 时的源消息 ID(可空)
  - `created_at`: 创建时间戳(跨设备去重用)

### 3.3 去重策略

由于不同设备的 sqlite card id 不同,跨设备去重依靠:
- **channel_chat_id + title + created_at**:同一频道下,相同 title 且创建时间相同(±60s)的 Card 视为同一个
- `upsert_card_from_msg` 命令先按此三元组查询,存在则更新,不存在则新建

### 3.4 assignee 跨设备映射

`assignee_contact_id` 是本地 deltachat contact_id,不同设备可能不同。同步时:
- Card 消息中额外携带 `assignee_addr`(邮箱地址)
- 接收方通过 `Contact::lookup_by_addr` 映射到本地 contact_id
- 若本地无此联系人,`assignee_contact_id` 置空,前端显示"未知"

更新后的 Card 消息格式:
```
[CARD]{"action":"create","id":123,"type":"task","title":"...","status":"todo","assignee_addr":"alice@example.com","due_date":1234567890,"description":"...","source_msg_id":456,"created_by_addr":"bob@example.com","created_at":1234567890}
```

## 4. 后端 API(Tauri 命令)

| 命令 | 参数 | 返回 | 功能 |
|---|---|---|---|
| `create_card` | workspace_id, chat_id, type, title, description?, assignee_contact_id?, due_date? | CardDto | 创建 card(sqlite + 发送 deltachat 消息) |
| `update_card` | card_id, title?, description?, status?, assignee_contact_id?, due_date? | CardDto | 更新 card(sqlite + 发送更新消息) |
| `delete_card` | card_id | () | 删除 card(sqlite + 发送删除消息) |
| `list_cards` | workspace_id, chat_id | Vec<CardDto> | 列出频道下所有 card |
| `get_card` | card_id | CardDto | 获取 card 详情 |
| `update_channel_space_type` | chat_id, space_type | () | 设置频道空间类型 |
| `message_to_card` | msg_id, workspace_id, chat_id, type, title? | CardDto | 消息转 card(自动填充 title 为消息文本前 40 字) |
| `upsert_card_from_msg` | msg_id, card_json | CardDto | 从 deltachat 消息回填/更新 card(多设备同步用) |

### 4.1 create_card 实现伪代码

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
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let now = now_ts();
    let created_by = ctx.get_id();

    // 1. 写本地 sqlite
    let card_id = state.db.lock().unwrap().execute(
        "INSERT INTO cards (workspace_id, channel_chat_id, type, title, description, status, assignee_contact_id, due_date, created_by, created_at, updated_at, position) VALUES (?1, ?2, ?3, ?4, ?5, 'todo', ?6, ?7, ?8, ?9, ?9, 0)",
        params![workspace_id, chat_id, type_, title, description, assignee_contact_id, due_date, created_by, now],
    )?;

    // 2. 构造 Card 消息 JSON
    let assignee_addr = if let Some(cid) = assignee_contact_id {
        Contact::get_by_id(&ctx, ContactId::new(cid)).await?.get_addr().to_string()
    } else { String::new() };
    let created_by_addr = Contact::get_by_id(&ctx, ContactId::SELF).await?.get_addr().to_string();
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
    }).to_string();
    let msg_text = format!("[CARD]{}", card_json);

    // 3. 发送到 deltachat(异步,不阻塞返回)
    let chat_id = deltachat::chat::ChatId::new(chat_id);
    let mut msg = Message::new_text(msg_text);
    msg.set_viewtype(Viewtype::Text); // 确保是文本消息
    let sent_msg_id = chat::send_msg(&ctx, chat_id, &mut msg).await?;

    // 4. 回填 msg_id 到 sqlite
    state.db.lock().unwrap().execute(
        "UPDATE cards SET msg_id = ?1 WHERE id = ?2",
        params![sent_msg_id.to_u32(), card_id],
    )?;

    // 5. 返回 CardDto
    get_card_dto(&state, card_id)
}
```

### 4.2 upsert_card_from_msg 实现(接收方)

```rust
#[tauri::command]
pub async fn upsert_card_from_msg(
    state: State<'_, AppState>,
    msg_id: u32,
    card_json: String,
) -> AppResult<CardDto> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let payload: serde_json::Value = serde_json::from_str(&card_json)?;

    // 1. 解析字段
    let title = payload["title"].as_str().ok_or("missing title")?;
    let created_at = payload["created_at"].as_i64().ok_or("missing created_at")?;
    let action = payload["action"].as_str().unwrap_or("create");
    // 从 msg_id 反查 chat_id(通过 Message::load_from_db)
    let msg = Message::load_from_db(&ctx, MsgId::new(msg_id)).await?;
    let channel_chat_id = msg.get_chat_id().to_u32();

    // 2. 去重:channel_chat_id + title + created_at(±60s)
    let existing = state.db.lock().unwrap().query_row(
        "SELECT id FROM cards WHERE channel_chat_id = ?1 AND title = ?2 AND ABS(created_at - ?3) < 60",
        params![channel_chat_id, title, created_at],
        |row| row.get::<_, i64>(0),
    ).optional()?;

    match (action, existing) {
        ("create", Some(id)) | ("update", Some(id)) => {
            // 更新现有 card
            update_card_from_payload(&state, id, &payload, msg_id)?;
            get_card_dto(&state, id)
        }
        ("create", None) => {
            // 新建 card
            let card_id = insert_card_from_payload(&state, &payload, msg_id, channel_chat_id)?;
            get_card_dto(&state, card_id)
        }
        ("delete", Some(id)) => {
            state.db.lock().unwrap().execute("DELETE FROM cards WHERE id = ?1", params![id])?;
            // 返回一个空 dto(或特殊标记)
            get_card_dto(&state, id) // 已删除,返回旧值
        }
        ("delete", None) => {
            // 不存在,忽略
            Err(AppError::Core("card not found for delete".into()))
        }
        ("update", None) => {
            // 更新不存在的 card,当作 create 处理
            let card_id = insert_card_from_payload(&state, &payload, msg_id, channel_chat_id)?;
            get_card_dto(&state, card_id)
        }
        _ => Err(AppError::Core("invalid action".into())),
    }
}
```

## 5. 前端结构

### 5.1 Work application 启用

**appRail.js**:
- Work 图标从 `disabled` 改为正常状态
- 点击 Work 切换 `state.currentApp = "work"`
- 触发 nav-tree 切换为 Work 模式

**channelTree.js**:
- 按 `state.currentApp` 切换 nav-tree 内容
- Chat 模式:显示频道树(workspace → category → channel)
- Work 模式:显示项目分组(workspace → 项目组 → space_type='card' 的频道)
- 点击 card 频道 → 设置 `state.currentChatId` + `state.currentView = "kanban"` → 渲染看板

### 5.2 看板视图(`src/work/kanban.js`)

```
renderKanban(chatId)
  ├── main-header: 频道名 + 看板/列表 toggle + 筛选 + 新建按钮
  └── kanban-body: 三列(Todo / In Progress / Done)
       └── 每列: 卡片列表(标题 + 类型 + 截止 + 指派人)
            └── 卡片点击 → 选中 + 加载详情到 detail panel
            └── 卡片状态按钮 → 切换状态(调 update_card)
```

- 卡片显示:title / type(Task 标签) / due_date(红色 if overdue) / assignee(首字母头像)
- 选中卡片 → border 变亮 + detail panel 显示 Card 详情
- 状态切换:卡片底部三个小圆点(Todo/In Progress/Done),点击切换

### 5.3 列表视图(`src/work/list.js`)

```
renderList(chatId)
  └── list-table: 标题 / 类型 / 状态 / 指派 / 截止 / 创建
       └── 行点击 → 选中 + 加载详情到 detail panel
       └── 列头点击 → 排序(前端 sort)
```

- 状态列:圆点 + 文字(Todo 灰 / In Progress 浅灰 / Done 白)
- 列头 hover 变亮,点击排序

### 5.4 Card 详情(detail panel)

**rightDrawer.js 扩展**:
- 新增 "Card" tab(当 `state.currentApp === "work"` 且有选中 card 时显示)
- 原有 Members/Settings tabs 在 Work 模式下隐藏(或降级)

Card 详情内容:
- 标题(可编辑,点击变 input)
- 类型(Task/Card 标签)
- 状态(status-pill,点击切换)
- 指派人(头像 + 名字,点击弹出 member 选择)
- 截止日期(日期,点击变 date input)
- 描述(多行文本,点击变 textarea)
- 评论区(显示该 card 所在频道的最近 N 条消息作为评论)

### 5.5 消息转 Card

**message.js 扩展**:
- 消息 hover 时,action 栏新增"转 Card"按钮(与 reply/react/pin 并列)
- 点击 → 弹出简短确认(标题默认为消息文本前 40 字,可编辑)
- 确认 → 调 `message_to_card` 命令
- 创建成功 → toast 提示 + 跳转到该 card(可选)

### 5.6 `[CARD]` 消息事件处理

**shell.js 扩展**:
- `IncomingMsg` / `MsgsChanged` 事件 handler 中,检查消息文本是否以 `[CARD]` 开头
- 若是,解析 JSON,调 `upsert_card_from_msg` 命令
- 若当前在看板视图,刷新看板
- 普通消息正常显示(其他客户端看到的是 JSON 文本,可读)

## 6. state.js 新增字段

```js
state.currentApp = "chat" | "work" | "inbox"  // SP4 已有,SP5 启用 work
state.currentView = "messages" | "kanban" | "list"  // 当前主区视图
state.cards = []                                 // 当前频道的 card 列表
state.currentCardId = null                       // 选中的 card id
state.cardDetailOpen = true                      // Card 详情面板是否展开
```

## 7. 文件清单

### 7.1 新增文件
- `src/work/kanban.js` — 看板视图渲染
- `src/work/list.js` — 列表视图渲染
- `src/work/cardDetail.js` — Card 详情面板渲染(供 rightDrawer.js 调用)

### 7.2 修改文件
- `src-tauri/src/db.rs` — cards 表 + channels.space_type 字段 + CRUD helpers
- `src-tauri/src/dto.rs` — CardDto
- `src-tauri/src/commands.rs` — 8 个新命令(create_card/update_card/delete_card/list_cards/get_card/update_channel_space_type/message_to_card/upsert_card_from_msg)
- `src-tauri/src/lib.rs` — 注册 8 个新命令
- `src/shell/appRail.js` — Work 图标激活
- `src/shell/channelTree.js` — Work 模式 nav tree(项目分组)
- `src/shell/rightDrawer.js` — Card tab + Work 模式下 tabs 切换
- `src/chat/message.js` — 转 Card 按钮
- `src/shell/shell.js` — `[CARD]` 消息事件处理 + Work 模式路由
- `src/state.js` — currentView / cards / currentCardId
- `src/persist.js` — 持久化 currentView / currentCardId
- `src/styles.css` — 看板/列表/Card 详情样式
- `src/dialogs/settingsPanel.js` — 频道设置加 space_type 切换

## 8. 任务分解(预估 12 个 SDD 任务)

| # | 任务 | 范围 | 依赖 |
|---|---|---|---|
| T1 | 数据库 schema | db.rs: cards 表 + channels.space_type + CardDto | 无 |
| T2 | 后端 CRUD 命令 | commands.rs: create/update/delete/list/get_card + lib.rs 注册 | T1 |
| T3 | 同步命令 | commands.rs: upsert_card_from_msg + message_to_card | T2 |
| T4 | update_channel_space_type | commands.rs + settingsPanel.js 频道设置加 space_type 切换 | T1 |
| T5 | Work application 启用 | appRail.js Work 激活 + channelTree.js Work 模式 nav tree | T4 |
| T6 | 看板视图 | kanban.js: 三列 + 卡片 + 状态切换 + 新建按钮 | T2, T5 |
| T7 | 列表视图 | list.js: 表格 + 排序 + 行点击 | T2, T5 |
| T8 | Card 详情面板 | cardDetail.js + rightDrawer.js Card tab | T2, T5 |
| T9 | 消息转 Card | message.js 转 Card 按钮 + shell.js 路由 | T3 |
| T10 | [CARD] 消息同步 | shell.js 事件处理 + upsert_card_from_msg 调用 | T3 |
| T11 | 样式 + 交互打磨 | styles.css 看板/列表/Card 样式 + 动效 | T6, T7, T8 |
| T12 | 最终验证 + 提交 | cargo build/test + npm build + 手动验证 | 全部 |

### 依赖关系图
```
T1 ── T2 ── T3 ──┬── T9
                 ├── T10
          ┌──────┘
T4 ── T5 ──┬── T6 ──┐
           ├── T7 ──┼── T11 ── T12
           ├── T8 ──┘
           └── T9
```

## 9. 测试策略

### 9.1 后端测试(cargo test)
- T1:cards 表 CRUD + channels.space_type ALTER
- T2:create_card 返回正确 CardDto + msg_id 回填
- T3:upsert_card_from_msg 去重逻辑(同 title+created_at 视为同一个)

### 9.2 前端测试(手动)
- T5:Work 图标激活,nav tree 切换
- T6:看板三列渲染,卡片状态切换
- T7:列表表格渲染,列头排序
- T8:Card 详情显示,字段编辑
- T9:消息转 Card,创建成功 toast
- T10:多设备同步(设备 A 创建 Card → 设备 B 收到消息 → 看板刷新)

### 9.3 跨设备同步验证
- 设备 A 创建 task → 设备 B 看板出现该 task
- 设备 A 更新状态 → 设备 B 看板状态同步
- 设备 A 删除 → 设备 B 看板移除
- 设备 A 消息转 Card → 设备 B 收到 Card 消息 + 看板出现

## 10. 风险与缓解

| 风险 | 缓解 |
|---|---|
| `[CARD]` 消息在 deltachat desktop 显示为 JSON 文本 | 可接受(用户已确认),其他客户端可读;后续可考虑 webxdc 格式 |
| 跨设备 assignee 映射失败(本地无此联系人) | assignee 置空,前端显示"未知",不阻塞同步 |
| 去重逻辑误判(title 相同的不同 Card) | created_at ±60s 容差 + 频道维度,实际冲突概率低;冲突时更新而非新建 |
| Card 消息丢失(IMAP 同步失败) | 本地 sqlite 仍有 Card,只是其他设备收不到;不影响单设备使用 |
| 看板性能(大量 Card) | 虚拟化(类似消息列表);SP5 先不做,留后续优化 |
| 拖拽排序复杂度高 | 简化为点击状态按钮切换,拖拽留后续 |

## 11. 后续 sprint 预告

- **SP6**:Inbox 统一通知 + Activity 活动流(notifications 表 + Inbox application 启用 + 系统活动消息混排)
- **SP7**:命令面板 + Viewlet 视图切换(Cmd+K 扩展为命令模式 + viewlets 表 + 消息流/卡片网格/看板切换)

## 12. 关键文件索引

### 现有文件(需修改)
- [src-tauri/src/db.rs](file:///Users/xiatian/Desktop/peytchat/src-tauri/src/db.rs) — T1
- [src-tauri/src/dto.rs](file:///Users/xiatian/Desktop/peytchat/src-tauri/src/dto.rs) — T1
- [src-tauri/src/commands.rs](file:///Users/xiatian/Desktop/peytchat/src-tauri/src/commands.rs) — T2/T3/T4
- [src-tauri/src/lib.rs](file:///Users/xiatian/Desktop/peytchat/src-tauri/src/lib.rs) — T2/T3/T4
- [src/shell/appRail.js](file:///Users/xiatian/Desktop/peytchat/src/shell/appRail.js) — T5
- [src/shell/channelTree.js](file:///Users/xiatian/Desktop/peytchat/src/shell/channelTree.js) — T5
- [src/shell/rightDrawer.js](file:///Users/xiatian/Desktop/peytchat/src/shell/rightDrawer.js) — T8
- [src/chat/message.js](file:///Users/xiatian/Desktop/peytchat/src/chat/message.js) — T9
- [src/shell/shell.js](file:///Users/xiatian/Desktop/peytchat/src/shell/shell.js) — T9/T10
- [src/state.js](file:///Users/xiatian/Desktop/peytchat/src/state.js) — T5
- [src/persist.js](file:///Users/xiatian/Desktop/peytchat/src/persist.js) — T5
- [src/styles.css](file:///Users/xiatian/Desktop/peytchat/src/styles.css) — T11
- [src/dialogs/settingsPanel.js](file:///Users/xiatian/Desktop/peytchat/src/dialogs/settingsPanel.js) — T4

### 新增文件
- `src/work/kanban.js` — T6
- `src/work/list.js` — T7
- `src/work/cardDetail.js` — T8

### 参考
- [SP5 mockup](file:///Users/xiatian/Desktop/peytchat/.superpowers/brainstorm/sp5-card-task-mockup.html)
- [SP4 设计文档](file:///Users/xiatian/Desktop/peytchat/docs/superpowers/specs/2026-07-30-sp4-huly-layout-foundation-design.md)
- [Huly platform 调研](https://github.com/hcengineering/platform)
