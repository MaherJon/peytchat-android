# Peytchat MVP 设计

- 日期: 2026-07-29
- 状态: 已确认，待实现计划
- 范围: MVP（邮箱登录 + 私聊/群聊文本 + 用户渲染）

## 1. 目标与非目标

### 目标
基于 chatmail/core（即 Delta Chat 核心，Rust 实现）与 Tauri v2 构建一个跨平台桌面应用，通过邮箱登录实现私聊与群组聊天（文本）。UI 为最简单可跑通的单页前端，作为后续大改 UI 的底座。

### 非目标
- 多账号支持（MVP 仅单账号，后续再加）
- 语音/视频/文件传输/附件
- 端到端加密的 UI 暴露（核心默认开启，不在 MVP UI 中呈现）
- 富文本/Markdown 渲染
- 移动端适配
- 前端测试框架（MVP 仅手动验证清单）

## 2. 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 核心 | chatmail/core（Delta Chat） | Rust crate，IMAP/SMTP 传输，内置 E2EE 与 sqlite 存储 |
| 后端 | Rust + Tauri v2 | 直接 `use deltachat::*`，无子进程 |
| 前端 | Vanilla HTML/CSS/JS + Vite | 无框架，模块级状态 |
| 事件 | Tauri events（`emit`/`listen`） | 核心事件由 Rust 转发为单一 `dc-event` |
| 源码引入 | `core/` 子目录 + Cargo path 依赖 | 本地可读/可调试 |

## 3. 仓库布局

```
peytchat/
├── core/                     # git clone chatmail/core（不修改，path 依赖）
├── src-tauri/                # Tauri Rust 后端（独立 workspace 根，不并入 core 的 workspace）
│   ├── Cargo.toml            # deltachat = { path = "../core" }
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs           # Builder：注册 commands + setup 启动事件循环
│       ├── state.rs          # AppState：Accounts + 当前账号 id
│       ├── commands.rs       # #[tauri::command]：MVP 所需命令
│       ├── events.rs         # tokio task 轮询 EventEmitter → emit
│       └── error.rs          # AppError 实现 Serialize
├── src/                      # 前端 Vanilla + Vite
│   ├── index.html            # 单页：登录视图 / 主视图
│   ├── main.js               # 入口：路由切换 + 事件监听
│   ├── api.js                # invoke/listen 薄封装
│   ├── state.js              # 模块级状态
│   ├── views/
│   │   ├── login.js          # 登录表单 + 高级设置折叠
│   │   ├── chatList.js       # 左栏会话列表
│   │   ├── chatView.js       # 右栏聊天面板
│   │   └── group.js          # 创建群组 / 成员管理弹层
│   └── styles.css            # 黑白极简
├── package.json              # vite + @tauri-apps/cli
├── vite.config.js
└── docs/superpowers/specs/
```

### 约束说明
- `src-tauri` 是独立 workspace 根，不加入 `core/` 自身的 Cargo workspace，避免成员冲突。
- Delta Chat sqlite 数据库存放于 Tauri `app_data_dir/accounts/`，由核心全权管理。
- `core/` 保持上游原样，不做本地修改；如需修改，另开 fork 分支。

## 4. 后端（Rust）模块设计

### 4.1 `state.rs` — `AppState`
- 持有 `Accounts`（核心多账号管理器，`Arc` 共享）与 `current_account_id: Option<u32>`。
- 由 `Accounts::new(app_data_dir/accounts)` 初始化，放入 `tauri::State`。
- MVP 单账号：登录后 `current_account_id` 设为该账号；启动时若 `accounts.len() > 0` 则取第一个为当前账号。

### 4.2 `commands.rs` — Tauri 命令
仅暴露 MVP 必要项，非全量 API。

| 命令 | 入参 | 返回 | 说明 |
|---|---|---|---|
| `is_configured` | — | `bool` | 启动时判断是否已有账号 |
| `login` | `email, password, advanced?: {imap_host, imap_port, imap_security, imap_user, smtp_host, smtp_port, smtp_security, smtp_user, smtp_password}` | `account_id` | 新建账号 → 写配置 → `configure()`（autoconfig，高级字段非空则覆盖）→ `start_io()`。`*_security` 取字符串：`"ssl"`/`"tls"`/`"plain"`（对应核心 `SocketSecurity`） |
| `get_self_profile` | — | `{id, name, addr, avatar?}` | 渲染当前用户。`avatar` 为 base64 data URL 字符串，无头像时为 `null` |
| `get_chatlist` | — | `[{chat_id, name, avatar?, last_msg?, last_ts?, unread}]` | 会话列表。`avatar` 同上 |
| `get_chat_msgs` | `chat_id` | `[{msg_id, from_id, from_name, text, ts, is_out, state}]` | 单个会话消息。`state` 为 `"pending"`/`"failed"`/`"delivered"`/`"read"` |
| `send_text` | `chat_id, text` | `msg_id` | `Message::new_text` → `send_msg` |
| `get_contacts` | — | `[{id, name, addr, avatar?}]` | 联系人列表（渲染与加群用）。`avatar` 同上 |
| `create_group` | `name, member_emails[]` | `chat_id` | `create_group_chat` + 逐个 `add_or_lookup` + `add_contact_to_chat` |
| `add_group_member` | `chat_id, email` | `contact_id` | lookup + add |

返回结构体均 `#[derive(Serialize)]`，字段名 `snake_case`，前端直接消费。`is_out` 表示是否自己发出。`avatar` 字段统一为 base64 data URL 或 `null`；`state` 字段取值见表格。

### 4.3 `events.rs` — 事件转发
- `setup` 中 spawn tokio task：`accounts.get_event_emitter()` → 循环 `recv().await`。
- 收到事件后 `app.emit("dc-event", payload)`，payload 为 `{ typ: String, chat_id?: u32, msg_id?: u32, contact_id?: u32 }`。
- `typ` 取核心 `EventType` 的 variant 名（如 `IncomingMsg` / `MsgsChanged` / `ContactsChanged` / `ConfigureProgress`）。
- `recv()` 返回 `None`（账号关闭）时 task 优雅退出，不 panic。
- emit 使用 `app.handle()` 克隆的句柄，避免借用 `App` 本身。

### 4.4 `error.rs`
- `AppError`：`#[derive(thiserror::Error, Serialize)]`。
- 变体：`AuthFailed` / `Network` / `AutoconfigNotFound` / `Core(String)` / `Io(String)`。
- 前端按变体名映射文案。

## 5. 前端（Vanilla）设计

### 5.1 入口与路由（`main.js`）
- 启动 `invoke('is_configured')`：有账号 → 主视图；无 → 登录视图。
- 视图切换通过替换 `#app` 内容，每次调用对应 view 模块的 `render(ctx)`。
- 事件分派集中注册一次（见 5.4）。

### 5.2 API 封装（`api.js`）
- `invoke(cmd, args)` 包 `try/catch`，错误统一走 `showError(err)`。
- `onEvent(typ, cb)` = `listen('dc-event', e => e.payload.typ === typ && cb(e.payload))`。

### 5.3 状态（`state.js`）
- `state = { self, chatlist: [], currentChatId, messages: [] }`。
- 视图直接读 `state`，变更后调用对应 view 的 `render()` 重绘（朴素重绘，无 diff）。

### 5.4 视图模块
- **`views/login.js`**：邮箱 + 密码两栏；"高级设置"折叠（IMAP/SMTP host/port/security/user/pass）。提交调 `login()`，成功切主视图。失败在表单下方显示错误文案。登录中显示"登录中…"（可订阅 `ConfigureProgress` 显示进度，MVP 可选）。
- **`views/chatList.js`**：左栏 280px 固定宽；每项头像占位（首字母黑底白字圆）、名称、最后消息预览、未读红点。点击 → `selectChat(id)` → 拉消息 + 渲染右栏。顶部"新建群组"按钮。
- **`views/chatView.js`**：右栏上方 header（会话名 + 群成员入口）、消息流（`is_out` 右对齐/左对齐）、底部输入框 + 回车发送。发送失败消息标记"发送失败"。
- **`views/group.js`**：创建群组弹层（名称 + 多邮箱输入，逗号分隔）；群成员管理弹层（列表 + 添加成员输入）。

### 5.5 事件分派（main.js 注册一次）
- `IncomingMsg` / `MsgsChanged`：若属当前会话则 `get_chat_msgs` 重拉；同时 `get_chatlist` 刷新左栏。
- `ContactsChanged`：刷新联系人/群成员。
- `ConfigureProgress`：登录中进度（可选）。

### 5.6 样式（`styles.css`）
- 仅黑白：背景 `#fff`、文字 `#000`、边框/分隔 `#e5e5e5`、未读点 `#000`。
- 双栏布局 `100vh`，左栏 280px 固定，右栏弹性。
- 无过度圆角与阴影，极简桌面审美（贴合 Apple Message + Discord 的双栏骨架，仅黑白）。

## 6. 数据流

```
[Delta Chat 核心] --(EventEmitter)--> [Rust 事件 task] --(emit "dc-event")--> [前端 listen]
                                                                              │
                                                                              ↓
                                                                         分派刷新视图

[前端] --(invoke command)--> [Tauri command] --(deltachat API)--> [核心] --(返回)--> [前端]
```

## 7. 错误处理

### 登录
- 核心 `configure()` 失败时返回结构化错误：
  - `AuthFailed` → "邮箱或密码错误"
  - `Network` → "无法连接服务器，请检查网络或高级设置"
  - `AutoconfigNotFound` → "未找到自动配置，请手动填写 IMAP/SMTP"
- 前端在登录表单下方显示对应文案。

### 收发
- 发送失败（离线/IO 未就绪）：输入框下方提示，消息标记"发送失败"（核心 `MessageState::Failed`），不阻塞 UI。
- 网络恢复后核心自动重试发送（核心行为，无需前端处理）。

### 事件循环
- `EventEmitter.recv()` 返回 `None` 时 task 优雅退出，不 panic。
- 应用退出时 `shutdown` 关闭账号，确保 sqlite 落盘。

## 8. 测试

### Rust 单测（`src-tauri`）
- `commands`：用临时账号目录测试 `login` 流程（离线，靠核心测试设施），断言账号创建与配置写入。
- `events`：用 fake emitter 验证 payload 序列化与 emit 调用。

### 前端
- MVP 不引入测试框架。

### 手动验证清单
1. 用任意 IMAP/SMTP 邮箱登录成功（默认 autoconfig）。
2. autoconfig 失败时展开高级设置手动填写，登录成功。
3. 收到一封邮件 → 显示为会话项。
4. 选中会话 → 发送文本 → 对方收到。
5. 对方回复 → 实时出现在消息流。
6. 创建群组 → 邀请 2 人 → 群内收发文本。
7. 断网发送 → 消息标记"发送失败"；恢复后核心自动重试。
8. 重启应用 → 已登录态保留，会话与消息恢复。

## 9. 实现顺序（高层，详细计划由 writing-plans 产出）

1. clone `core/` + 初始化 `src-tauri`（Tauri v2）+ 前端 Vite 骨架。
2. 后端 `state` + `login` + `is_configured` + `get_self_profile`。
3. 前端登录视图 → 跑通登录。
4. 后端 `get_chatlist` + `get_chat_msgs` + `send_text` + 事件转发。
5. 前端主视图双栏 + 会话列表 + 聊天面板 → 跑通私聊。
6. 后端 `create_group` + `add_group_member` + `get_contacts`。
7. 前端群组弹层 → 跑通群聊。
8. 错误处理打磨 + 手动验证清单全过。

## 10. 风险与缓解

| 风险 | 缓解 |
|---|---|
| chatmail/core 体积大、首次编译慢 | 接受首次编译耗时；后续增量编译快 |
| 核心 API 变动（main 分支） | pin 到具体 commit，非跟随 main |
| Tauri v2 与 deltachat 的 tokio runtime 整合 | 使用 Tauri 的 `async_runtime`，不自行 spawn runtime |
| 任意 IMAP/SMTP 服务商兼容性 | 依赖核心 autoconfig + 高级设置兜底；验证清单覆盖主流服务商 |
