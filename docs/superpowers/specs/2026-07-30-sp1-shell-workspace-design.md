# Sub-project 1：外壳 + Workspace 模型 设计

- 日期: 2026-07-30
- 状态: 已确认，待实现计划
- 范围: 将 MVP 升级为 Discord/Slack 式多 workspace 开发者社区外壳，建立 workspace↔频道↔deltachat 群组的本地映射模型，并完成基础聊天升级
- 前置: MVP（2026-07-29-peytchat-mvp-design.md）已完成
-必须完全对齐/Users/xiatian/Desktop/peytchat/.superpowers/brainstorm/29054-1785381683/content/sp1-dark-refined.html 的设计

## 1. 目标与非目标

### 目标
在不动 `chatmail/core` 的前提下，把现有单页双栏 MVP 升级为支持多 workspace（子团队）同时在线、频道按 category 分组、暗色主题的现代开发者社区外壳。建立 workspace/频道/roles/pin 的本地 Tauri sqlite 元数据层，把 deltachat 群组重新组织为「总群 + 频道子群」结构。同时完成开发者社区所需的基础聊天升级（代码块高亮、reactions、pin、@mention 高亮、回复 quote）。

### 非目标（拆到后续子项目）
- GitHub 集成（repo 绑定、事件轮询、结构化卡片）→ SP2
- 文件管理 + git GUI → SP2
- Bot 层 → SP3
- 频道自动邀请（成员进总群后自动邀请进所有频道）→ SP2
- threads（deltachat 无原生支持，回复 quote 仅模拟单层引用）
- 语音/视频
- 权限强制（roles 仅作显示标签，不阻止任何操作）
- 移动端适配
- 亮色主题切换（SP1 仅暗色）
- 真正的服务端成员同步（频道成员是总群成员的子集，SP1 不强制一致，手动加减）

## 2. 核心范式决策

| 维度 | 决策 |
|---|---|
| 社区范式 | A+B：频道流为骨架（Discord 式），GitHub 事件作为结构化卡片注入频道（SP2 实现，SP1 仅预留渲染接口） |
| 组织结构 | 总团队 → 身份组 + 项目 → 子团队(workspace) → 频道(category 分组) |
| workspace 语义 | workspace = 子团队；一个 deltachat 总群 + 多个频道子群 |
| 多 workspace | 同时在线，远左图标栏切换 |
| 导航层级 | 三层：workspace → 频道 → 聊天 |
| 频道树组织 | Category 分组（可折叠），category 元数据存本地 sqlite |
| DM 与额外群 | workspace 图标栏顶部「主页」图标，进入看所有私聊 + 非 workspace 群 |
| 整体布局 | 四栏：56px workspace 图标栏 + 220px 频道树 + 弹性聊天主区 + 200px 可抽拉右栏（成员/Pin/搜索 tab） |
| 色彩 | 暗色主题为主 |
| roles | SP1 存本地元数据，仅显示标签，不强制权限 |
| workspace 创建/加入 | 图标栏底部「+」按钮 → 弹层向导（创建/加入两个 tab） |

## 3. 视觉规范（暗色，完全对齐 mockup）

### 3.1 色板

| 用途 | 色值 |
|---|---|
| 应用底色 | `#0d0d0d` |
| 面板/输入框/代码块底 | `#0a0a0a` |
| 边框（细） | `#1a1a1a` |
| 边框（明显） | `#222` |
| 悬停/active 背景 | `#1f1f1f` |
| reactions 胶囊底 | `#161616` |
| 主文字 | `#e5e5e5` |
| 消息正文 | `#d4d4d4` |
| 次文字 | `#888` |
| 弱文字 | `#555` |
| 极弱文字 | `#444` |
| 未读计数 | `#e5e5e5` 底 / `#0a0a0a` 字 |
| active workspace 图标 | `#e5e5e5` 底 / `#0a0a0a` 字 |
| 非 active workspace 图标 | `#161616` 底 / `#888` 字 / `#222` 边 |

### 3.2 字体与字号

- 系统栈：`-apple-system, 'SF Pro Display', 'Inter', sans-serif`
- 代码栈：`'SF Mono', Menlo, monospace`
- 字号：正文 11px / 标题 13px / 标签 9px / 副标题 9px
- 字重：常规 500 / 强调 600
- letter-spacing：标题 -0.2px / 大写标签 +0.5px

### 3.3 通用质感

去除 emoji，用极简符号（· + ▾ ↩）或首字母。大留白。细边框 1px。圆角 4-8px。无阴影。行高：消息正文 1.5，代码块 1.6。

### 3.4 四栏布局尺寸（从左到右）

1. **workspace 图标栏**：宽 56px，底色 `#0a0a0a`，右边框 1px `#1a1a1a`，padding 10px 0，子项 gap 8px，子项居中
2. **频道树**：宽 220px，底色 `#0d0d0d`，右边框 1px `#1a1a1a`
3. **聊天主区**：flex 1，底色 `#0d0d0d`
4. **右侧抽拉栏**：宽 200px，底色 `#0d0d0d`，左边框 1px `#1a1a1a`，可收起

### 3.5 workspace 图标栏组件

- **主页图标**：36×36px，border 1px `#333`，border-radius 8px，color `#888`，内容为 `·` 符号
- **分隔线**：宽 24px，高 1px，色 `#1f1f1f`，上下 margin 2px
- **workspace 图标**：36×36px，border-radius 8px，font 12px weight 600，显示首字母
  - active：`#e5e5e5` 底 / `#0a0a0a` 字
  - 非 active：`#161616` 底 / `#888` 字 / border 1px `#222`
- **底部「+」按钮**：36×36px，border 1px dashed `#333`，border-radius 8px，color `#555`，font 16px
- 顶部主页图标后接分隔线，中部 workspace 图标纵向排列，底部「+」按钮靠底（flex 1 撑开）

### 3.6 频道树组件

- **header**：padding 14px 16px 12px，下边框 1px `#1a1a1a`
  - workspace 名：font 13px weight 600 letter-spacing -0.2px
  - 副标题（如 "Frontend · 12 members"）：font 9px color `#555` margin-top 2px
- **category 标题**：padding 8px 16px 2px，color `#555`，font 9px weight 600 letter-spacing 0.5px uppercase；右侧可附 `▾`/`▸` 折叠符号 color `#333`
- **频道项**：padding 5px 16px 5px 24px（左缩进 24px）
  - active：背景 `#1f1f1f`，font-weight 500，color `#e5e5e5`，border-radius 0 4px 4px 0，margin-right 8px（右侧留白不填满）
  - 非 active：color `#888`
- **未读计数**：`#e5e5e5` 底 / `#0a0a0a` 字，border-radius 8px，padding 0 6px，font 9px weight 600，紧贴频道名右侧
- **底部用户条**：padding 10px 16px，上边框 1px `#1a1a1a`，flex align-center gap 8px
  - 头像：24×24px，`#222` 底，border-radius 50%，font 10px weight 600 居中
  - 用户名：font 11px weight 500
  - role 副标签：font 9px color `#555`

### 3.7 聊天主区组件

- **header**：padding 14px 20px，下边框 1px `#1a1a1a`，flex space-between align-center
  - 频道名：font 13px weight 600
  - 频道副标题（topic）：font 11px color `#555` margin-left 8px
  - 右侧操作（pin/search/info）：color `#666` font 11px，gap 14px，格式如 "pin · 2"
- **消息流**：padding 16px 20px，flex column gap 14px
- **单条消息**：
  - meta 行：font 11px，margin-bottom 3px
    - 发送者名：weight 600
    - 时间：color `#555` margin-left 8px
    - role 标签：border 1px `#222` padding 0 5px border-radius 3px font 9px color `#555` margin-left 6px
    - 回复标记：color `#444` margin-left 8px，格式 "↩ reply to {name}"
  - 正文：color `#d4d4d4` line-height 1.5
  - 代码块：`#0a0a0a` 底，border 1px `#1a1a1a`，border-radius 4px，padding 10px 12px，font 10px line-height 1.6；注释 color `#555`；关键字 color `#888`
  - reactions 胶囊行：margin-top 6px，flex gap 8px；每个胶囊 `#161616` 底 / border 1px `#222` / border-radius 10px / padding 1px 8px / font 10px color `#555`，格式 "↑ 2" 或 "+ 1"
  - quote 引用块：border-left 2px `#333` padding-left 8px color `#555` font 10px margin-bottom 3px
- **composer**：padding 12px 20px，上边框 1px `#1a1a1a`
  - input：width 100%，padding 8px 12px，`#0a0a0a` 底，border 1px `#222`，border-radius 4px，color `#e5e5e5` font 11px

### 3.8 右侧抽拉栏组件

- **tab 栏**：padding 12px 16px，下边框 1px `#1a1a1a`，font 10px gap 14px
  - active tab：weight 600 color `#e5e5e5` border-bottom 1px `#e5e5e5` padding-bottom 6px
  - 非 active tab：color `#555`
  - 三个 tab：members / pin / search
- **成员分组标题**：color `#555` font 9px weight 600 letter-spacing 0.5px uppercase，margin 8px 0 4px（组间 12px 0 4px），格式 "Core · 2"
- **成员项**：padding 4px 0，flex align-center gap 8px
  - 头像：20×20px `#222` 底 border-radius 50% font 9px 居中
  - 名字：font 11px；非本组核心成员用 color `#888`

## 4. 架构与数据模型

### 4.1 前端模块组织（重写 `src/`）

前端分为四组模块：

**根级**：`main.js`（入口，路由 login/app）、`api.js`（invoke/listen 封装，保留现有）、`state.js`（全局状态）、`styles.css`（暗色主题 CSS 变量 + 组件样式）。

**shell 组**（四栏外壳）：`shell.js`（四栏容器）、`wsRail.js`（56px workspace 图标栏）、`channelTree.js`（220px 频道树 + category）、`rightDrawer.js`（200px 可抽拉右栏，成员/Pin/搜索 tab）。

**chat 组**（聊天主区）：`chatView.js`（聊天主区）、`message.js`（单条消息渲染，含代码块/reactions/quote/@mention）、`composer.js`（输入框，@mention/回复）。

**dialogs 组**：`wsWizard.js`（创建/加入 workspace 向导）、`channelCreate.js`（新建频道）、`homeView.js`（主页区，DM + 非 ws 群）。

### 4.2 本地 Tauri sqlite（`app_data_dir/peytchat.db`）

所有 workspace/频道/roles/pin 元数据本地存，deltachat 群组本身保持原样（core 不改）。数据库由 Tauri 后端管理，选用 `rusqlite`（同步、轻量，避免引入 sqlx 的异步复杂性），通过 Tauri 命令暴露 CRUD。`db.rs` 持有 `Mutex<rusqlite::Connection>`，所有访问在 Tauri command 的异步 runtime 中通过 `blocking_lock` 或 `spawn_blocking` 调用。启动时自动建表（`CREATE TABLE IF NOT EXISTS`）。

表结构如下（文字描述）：

**workspaces 表**：workspace = 子团队，绑定一个 deltachat 总群。字段：`id`（自增主键）、`name`（workspace 名）、`master_chat_id`（deltachat 总群 chat_id，唯一标识）、`icon`（显示用首字母或符号）、`created_at`（创建时间戳）。

**channels 表**：channel = deltachat 子群，归属 workspace + category。字段：`id`（自增主键）、`workspace_id`（外键到 workspaces）、`chat_id`（deltachat 子群 chat_id）、`name`（频道名）、`category`（所属 category，默认 'General'）、`position`（同 category 内排序，默认 0）、`topic`（频道主题）。约束：`(workspace_id, chat_id)` 唯一。

**roles 表**：本地元数据，仅显示标签，不强制权限。字段：`id`（自增主键）、`workspace_id`（外键）、`name`（role 名，如 core/ops）、`color`（预留，SP1 不渲染颜色）。

**contact_roles 表**：成员与 role 的多对多关系。字段：`contact_id`、`role_id`、`workspace_id`。主键：`(contact_id, role_id)`。

**pins 表**：频道级置顶消息。字段：`id`（自增主键）、`workspace_id`、`channel_chat_id`、`msg_id`、`pinned_by`（操作者 contact_id）、`pinned_at`。约束：`(channel_chat_id, msg_id)` 唯一。

## 5. Workspace/频道生命周期

### 5.1 创建 workspace
1. 用户点 workspace 图标栏底部「+」→ 弹层向导
2. 输入 workspace 名 → 后端 `create_workspace`：
   - `chat::create_group` 建总群
   - 写 `workspaces` 表
   - 自动建 `general` `announcements` 两个默认频道（子群），写 `channels` 表（category = 'General'）
   - 默认创建 `core` role，把创建者加入
3. 返回 workspace_id，前端切到该 workspace
4. 总群 SecureJoin QR 可在 workspace 设置中查看，用于分享邀请（SP1 手动分享，SP2 做自动邀请）

### 5.2 加入 workspace
1. 向导切到「加入」tab → 粘贴总群 SecureJoin QR 链接
2. 后端 `join_workspace`：`securejoin::join_securejoin` 加入总群 → 写 `workspaces` 表（master_chat_id = 总群）
3. 加入后频道需手动加入（SP1 不做自动邀请）：频道树显示该 ws 下所有频道，每个频道旁有「加入」按钮，点击后调用 `get_securejoin_qr(chat_id)` 运行时获取该频道 QR，再 `secure_join` 加入
   - 不存频道 QR 到表（避免冗余与失效），始终运行时获取

### 5.3 创建频道
1. 频道树 category 行右键「新建频道」→ 弹层输入名 + 选 category
2. 后端 `create_channel`：`chat::create_group` 建子群 → 写 `channels` 表
3. 频道成员手动加减（SP1 不与总群同步）

### 5.4 主页区
- workspace 图标栏顶部「主页」图标 → 进入主页视图
- 主页显示：所有私聊（deltachat 1:1 chat）+ 非 workspace 群（不在 `channels` 表里的群组）
- 复用 MVP 的 chatList/chatView 逻辑，仅样式适配暗色

## 6. 后端命令扩展（`src-tauri/src/commands.rs`）

在现有 17 个命令基础上新增：

| 命令 | 入参 | 返回 | 说明 |
|---|---|---|---|
| `list_workspaces` | — | `Vec<WorkspaceDto>` | 读 sqlite 返回所有 workspace |
| `create_workspace` | `name` | `WorkspaceDto` | 建总群 + 默认频道 + 写表 + 默认 core role |
| `join_workspace` | `qr` | `WorkspaceDto` | secure_join 总群 + 写表 |
| `list_channels` | `ws_id` | `Vec<ChannelDto>` | 读 sqlite 返回该 ws 下频道（按 category 分组） |
| `create_channel` | `ws_id, name, category` | `ChannelDto` | 建子群 + 写表 |
| `get_channel_pins` | `chat_id` | `Vec<PinDto>` | 读 sqlite 返回 pin 列表 |
| `toggle_pin` | `chat_id, msg_id` | `bool` | pin/unpin 消息，返回新状态 |
| `send_reaction` | `chat_id, msg_id, emoji` | `()` | 包装 core `send_reaction` |
| `get_reactions` | `msg_id` | `Vec<ReactionDto>` | 返回某消息所有 reactions（聚合 emoji→count+senders） |
| `list_roles` | `ws_id` | `Vec<RoleDto>` | 读 sqlite 返回该 ws 的 roles |
| `set_contact_role` | `ws_id, contact_id, role_id` | `()` | 设置成员 role（仅元数据） |
| `send_reply` | `chat_id, text, quote_msg_id` | `msg_id` | 发送带 quote 的消息（core `Message::set_quote`） |
| `get_channel_topic` | `chat_id` | `String?` | 读频道 topic（本地 sqlite） |
| `set_channel_topic` | `chat_id, topic` | `()` | 写频道 topic |

新增 DTO：`WorkspaceDto`、`ChannelDto`、`PinDto`、`ReactionDto`、`RoleDto`。字段名 snake_case，前端直接消费。

**sqlite 访问层**：新增 `src-tauri/src/db.rs`，持有 `Mutex<Connection>`，提供上述 CRUD 函数。数据库路径 `app_data_dir/peytchat.db`，启动时自动建表（`CREATE TABLE IF NOT EXISTS`）。

## 7. 聊天升级实现

### 7.1 代码块语法高亮
- 前端引入 `highlight.js`（npm 依赖）
- `message.js` 渲染时解析 ```` ```lang ```` 块，调用 highlight.js 渲染
- 暗色主题用 `github-dark` 或自定义配色

### 7.2 Reactions
- core 已有 `send_reaction` API
- `message.js` 在消息下方聚合显示 reactions 胶囊（emoji + count）
- 点击胶囊 = toggle 自己的 reaction
- 悬停胶囊显示 senders 列表（title 属性即可，SP1 不做浮层）

### 7.3 Pin 消息
- 频道 header 显示「pin · N」，点击展开右栏 Pin tab
- 右栏 Pin tab 列出该频道所有 pin 消息（发送者 + 内容摘要 + 时间）
- 消息右键菜单「pin/unpin」→ `toggle_pin`

### 7.4 @mention 高亮
- 解析消息文本中的 `@name` 和 `@role`
- 匹配当前用户名或所属 role 时，渲染为高亮胶囊（`#1f1f1f` 底 + `#e5e5e5` 字）
- SP1 仅视觉高亮，不触发通知/未读

### 7.5 回复 quote
- 消息右键「回复」→ composer 进入回复模式，顶部显示 quote 预览
- 发送时调 `send_reply(chat_id, text, quote_msg_id)`
- 渲染时消息顶部显示 quote 引用块（左边竖线 + 原作者 + 内容摘要）

## 8. 前端状态（`state.js`）

全局状态对象 `state` 持有以下字段：

- `self`：当前账号 profile（id/name/addr），登录后填充
- `workspaces`：数组，所有 workspace（来自 `list_workspaces`）
- `currentWsId`：当前选中 workspace 的 id；为 null 时表示在主页区
- `channels`：数组，当前 ws 的频道（来自 `list_channels`），前端按 `category` 字段分组渲染
- `currentChatId`：当前打开的频道或私聊的 chat_id
- `messages`：数组，当前频道的消息（来自 `get_chat_msgs`）
- `pins`：数组，当前频道的 pin 消息（来自 `get_channel_pins`）
- `rightDrawerTab`：右栏当前 tab，取值 `members` / `pin` / `search`
- `rightDrawerOpen`：布尔，右栏是否展开
- `homeMode`：布尔，是否在主页区（true 时频道树显示 DM + 非 ws 群，而非 workspace 频道）

## 9. 事件转发（沿用 + 扩展）

现有 `dc-event` 转发保留，新增监听：
- `MsgsChanged` / `IncomingMsg` / `ChatlistItemChanged` / `ChatModified` / `ContactsChanged`：刷新对应 workspace/频道/消息
- Reactions 刷新：SP1 不依赖独立的 `ReactionsChanged` 事件（core 不保证有），而是在收到 `MsgsChanged` 时对该 msg_id 调 `get_reactions` 重拉并更新前端聚合显示。代价是每次消息变化都重拉 reactions，但 SP1 消息量小可接受。

## 10. 不做项与边界（SP1）

- ❌ GitHub 集成（SP2）
- ❌ 文件/git GUI（SP2）
- ❌ Bot 层（SP3）
- ❌ 频道自动邀请（SP2）
- ❌ threads（仅单层 quote）
- ❌ 语音/视频
- ❌ 权限强制（roles 仅显示）
- ❌ 移动端
- ❌ 亮色主题
- ❌ 频道成员与总群自动同步（手动加减）
- ❌ @mention 通知触发（仅视觉）
- ❌ 消息搜索（右栏搜索 tab 占位，SP1 不实现搜索逻辑）

## 11. 测试与验证

### Rust 单测
- `db.rs`：用临时 db 测试 workspace/channel/role/pin 的 CRUD
- `commands.rs`：测试 `create_workspace` / `create_channel` 的群组创建 + 表写入一致性

### 前端
- SP1 不引入测试框架，手动验证

### 手动验证清单
1. 登录后看到暗色四栏外壳，workspace 图标栏含「主页」+「+」
2. 点「+」创建 workspace → 自动建总群 + general/announcements 频道 → 频道树显示
3. 在 workspace 设置查看总群 QR，另一客户端加入 → 双方频道树可见
4. 创建频道（指定 category）→ 频道树按 category 分组显示
5. 切换 workspace 图标 → 频道树切换
6. 主页图标 → 显示所有私聊 + 非 ws 群
7. 发送 ```` ```rust ```` 代码块 → 正确高亮
8. 点消息右键 → 添加 reaction → 胶囊显示，对方可见
9. pin 消息 → header 计数 +1，右栏 Pin tab 可见
10. @alice 发消息 → alice 端高亮
11. 回复消息 → 双方都看到 quote 引用块
12. 重启应用 → workspace/频道/pin 元数据保留（本地 sqlite），deltachat 群组保留（core sqlite）

## 12. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 本地 sqlite 与 core sqlite 双库一致性（如频道被 core 侧删除） | 启动时校验 `channels` 表里的 chat_id 是否仍存在于 core，失效项标记或清除 |
| SecureJoin 频道邀请流程繁琐（SP1 手动逐个加） | 接受 SP1 的手动性，SP2 做自动邀请 |
| highlight.js 增加前端体积 | 按需引入语言包，仅加载常用语言（rust/ts/js/python/go/bash/sql/json） |
| 暗色主题与 deltachat desktop 风格差异 | 接受差异，本应用独立设计 |
| roles 仅显示不强制，成员可能误以为有权限 | UI 上 roles 标签设计为「弱视觉」，不暗示权限 |

## 13. 实现顺序（高层，详细计划由 writing-plans 产出）

1. 后端 `db.rs` sqlite 层 + 建表迁移
2. 后端 workspace/channel/role/pin 命令 + DTO
3. 后端 reaction/reply/pin 命令包装 core API
4. 前端暗色主题样式系统（CSS 变量 + 基础组件）
5. 前端四栏外壳 + workspace 图标栏 + 频道树
6. 前端 workspace 创建/加入向导
7. 前端聊天主区 + 代码块高亮 + reactions + pin + @mention + 回复 quote
8. 前端右栏抽拉（成员/Pin/search tab）
9. 前端主页区（DM + 非 ws 群）
10. 手动验证清单全过
