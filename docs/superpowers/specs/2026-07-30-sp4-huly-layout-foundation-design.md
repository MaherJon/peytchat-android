# SP4 Huly 化布局 + 地基修复 设计文档

> **Sprint 定位**：SP4 = 地基 sprint。为 SP5+ 的 Card/Task/Inbox 协作功能铺垫地基——重设计为 Huly 风格布局，修复阻塞性 P0（含收发消息根因）和关键 P1 体验问题，扩展 profile 头像。**不做** Card/Task/Inbox/Activity/命令面板/Viewlet（留 SP5-SP7）。
>
> **前置决策**（brainstorming 7 轮问答确认）：
> - 合并形态：双模式可切（聊天/协作按频道 space_type 切换）
> - 切换粒度：频道级（每个频道独立声明 space_type）
> - 空间类型：中等集（chat + card + task），SP4 仅落地 chat，card/task 留 SP5
> - 地基修复时机：边做边修（SP4 内同步修相关 P0/P1）
> - Card 与消息关系：双重存储（本地 sqlite + deltachat 卡片消息），留 SP5
> - 协作增强：Inbox + Activity + 命令面板 + Viewlet 全做，分 sprint 落地
> - 布局方向：Huly 化重设计（application 切换栏 + 内容树 + 主区 + 加宽详情面板）
> - 分解方案：C 分 sprint 全做（SP4 地基 / SP5 Card+Task / SP6 Inbox+Activity / SP7 命令面板+Viewlet）

## 1. 目标与范围

### 1.1 目标
1. **布局 Huly 化**：从四栏（ws-rail/channel-tree/chat-main/right-drawer）升级为 application 切换模型（app-rail/nav-tree/main/detail-panel），为 SP5+ 协作功能预留入口
2. **收发消息根因修复**：修复 `create_chatmail_account` 未调用 `start_io` 导致 chatmail 账号无法收发的阻塞性 bug
3. **P0 附件渲染**：前端消费 MsgDto 的 9 个附件字段，支持图片/文件/音频/视频显示
4. **P1 体验补齐**：13 种事件 handler、增量刷新、跨频道搜索、消息虚拟化、动效、未读分隔线、members 搜索、pin 改造、wsRail 未读聚合
5. **Profile 头像**：参考 Plzdelta，扩展 ProfileDto 加 avatar/color，支持头像上传与显示

### 1.2 不做（留后续 sprint）
- Card/Task 双模式核心（SP5）
- Inbox 统一通知 + Activity 活动流（SP6）
- 命令面板 + Viewlet 视图切换（SP7）
- typing 指示 / 在线状态点（deltachat 邮箱异步模型不支持）
- Doc 协作富文本（需 OT/CRDT，core 不支持）

## 2. Huly 化布局设计

### 2.1 布局结构

从现有四栏升级为 application 切换模型：

```
┌─────┬──────────┬─────────────────────┬──────────┐
│ app │  nav     │      main           │ detail   │
│ rail│  tree    │                      │ panel    │
│ 56px│  240px   │      flex            │ 300px    │
├─────┴──────────┴─────────────────────┴──────────┤
│ app rail: 顶部 [Chat][Work][Inbox] + ws 分隔     │
│            底部 [设置][头像]                      │
│ nav tree:  按 application 切换内容                │
│   - Chat:  workspace → category → channel        │
│   - Work:  占位（SP5 启用）                       │
│   - Inbox: 占位（SP6 启用）                       │
│ main:      消息流 / Card 列表 / 看板 (按 app)     │
│ detail:    members/pin/settings (可折叠)          │
└──────────────────────────────────────────────────┘
```

### 2.2 各栏规格

| 栏 | 宽度 | 变化 | 内容 |
|---|---|---|---|
| app rail | 56px | ws-rail 改名 | 顶部 Chat(激活)/Work(灰)/Inbox(灰·红点) 三 application 图标 + 分隔线 + workspace 图标 + 底部设置/头像 |
| nav tree | 240px | +20px | 按 state.currentApp 切换内容树。Chat=频道树，Work/Inbox=占位提示。底部"视图：消息流 ⇄"入口（SP7 占位） |
| main | flex | 不变 | 消息流（Chat application 下） |
| detail panel | 300px | +100px | members/pin/settings tabs + 可折叠按钮。members tab 顶部加搜索框 |

### 2.3 设计约束（不变）
- 黑白配色：#0d0d0d 底 / #0a0a0a 面板 / #1a1a1a/#222 边框 / #1f1f1f active / #e5e5e5/#888/#555 文字
- 字号 11/13/9/10px，字重 500/600
- 无多级菜单（application 切换是单层图标，不构成多级菜单）
- 无 emoji，极简符号

### 2.4 Mockup
详见 [sp4-huly-layout.html](file:///Users/xiatian/Desktop/peytchat/.superpowers/brainstorm/29054-1785381683/content/sp4-huly-layout.html)

## 3. P0/P1 修复清单

### 3.1 P0（阻断协作或收发，必须修）

| # | 问题 | 修复 |
|---|---|---|
| P0-1 | 前端 message.js 只渲染 text，未消费 MsgDto 的 9 个附件字段 | message.js 加 view_type 分支：Image 缩略图+点击放大、File 文件卡+下载、Audio/Voice 音频条、Video 视频框 |
| P0-2 | webview 无法访问 deltachat blobdir 文件路径 | 新增 `get_asset_url(path)` 命令返回 `asset://localhost/<encoded>` URL；tauri.conf.json 的 `assetProtocol.scope` 配置 `$APPDATA/**` 兜底 |
| P0-3 | homeView 列表项无 last_msg/last_ts（ChatDto 已有字段但未用） | homeView.js 渲染 last_msg 截断 40 字 + last_ts 相对时间 + 头像首字母 |
| P0-4 | `create_chatmail_account` 未调用 `ctx.start_io()`，chatmail 账号无法收发 | commands.rs 在 select_account 后加 `ctx.start_io().await` |
| P0-5 | 接收及时性验证 | start_io 后实测；必要时配 `Config::Interval` 缩短轮询 |
| P0-6 | 发送状态反馈缺失（MsgFailed 已转发但无 handler） | shell.js 注册 MsgFailed/MsgDelivered handler；message.js 显示 pending/delivered/failed + 重发按钮 |

### 3.2 P1（影响体验）

| # | 问题 | 修复 |
|---|---|---|
| P1-1 | 13 种事件已转发但前端无 handler | shell.js 注册 MsgDelivered/MsgFailed/MsgDeleted/ReactionsChanged/MsgRead/ChatDeleted 等 handler |
| P1-2 | refreshCurrentChat 全量重渲染丢失分页 | 改为增量追加新消息；不重置 messagesOldestId/noMoreMsgs |
| P1-3 | search.js 只搜当前 state.messages（50 条） | 新增 `search_msgs` 命令遍历所有 chat 调 core 搜索；search.js 接该命令 |
| P1-4 | 消息列表 innerHTML 全量渲染，超 500 条卡顿 | 简易虚拟化：只渲染 viewport ± buffer（约 50 条） |
| P1-5 | 无动效，"像静态文本" | styles.css transitions：消息 fade-in 150ms、detail slide 200ms、overlay fade 150ms |
| P1-6 | 无未读分隔线 | chatView.js 找第一条未读消息插入"新消息"分隔线 |
| P1-7 | members 列表无搜索框 | rightDrawer.js members tab 顶部加搜索 input |
| P1-8 | pin tab 只显示 msg_id，无内容无跳转 | rightDrawer.js pin tab 渲染消息文本预览+发送人+时间，点击跳转高亮 |
| P1-9 | wsRail 未读聚合仅当前 ws 真实 | 按 master_chat_id + channels.chat_id 聚合所有 ws 未读 |

## 4. Profile 头像扩展（参考 Plzdelta）

### 4.1 后端扩展

**ProfileDto 扩展**（dto.rs）：
```
ProfileDto { id, name, addr, avatar: Option<String>, color: Option<u32> }
```

**get_self_profile 命令扩展**（commands.rs）：
- 除读 `Config::Displayname`/`ConfiguredAddr` 外
- 调 `Contact::get_by_id(&ctx, ContactId::SELF)` → `get_profile_image(&ctx)` 获取头像绝对路径
- 调 `Contact::get_color()` 获取颜色（u32，前端转十六进制）

**update_profile 命令扩展**（commands.rs）：
- 增加 `avatar_path: Option<String>` 参数（None=删除，Some=设置）
- 调 `ctx.set_config(Config::Selfavatar, avatar_path.as_deref())`
- core 自动处理：`BlobObject::create_and_deduplicate` 去重 + `recode_to_avatar_size` 裁剪到 512px/60KB

**MemberDto 扩展**（dto.rs）：
```
MemberDto { contact_id, name, addr, is_self, avatar: Option<String>, color: Option<u32> }
```

**get_chat_info 命令扩展**：填充 member 的 avatar/color 字段

**SelfavatarChanged 事件转发**（events.rs）：
- 新增 `EventType::SelfavatarChanged` match arm
- 转发为 `EventPayload { typ: "SelfavatarChanged", ... }`

### 4.2 前端扩展

**settingsPanel.js 头像选择 UI**：
- profile 设置区显示当前头像（或首字母默认）
- "更换头像"按钮 → 调 Tauri `@tauri-apps/plugin-dialog` 的 `open()` 选图片
- 调 `update_profile({ avatar_path: selected_path })`
- 监听 SelfavatarChanged 事件自动刷新

**各处头像渲染**：
- appRail.js 底部头像（self profile）
- homeView.js 列表项头像（chat avatar 或对方首字母）
- message.js 消息发送者头像
- rightDrawer.js members 列表头像
- memberDetail.js 成员详情大头像

**默认头像策略**：
- 有 avatar：`<img src={transformBlobURL(avatar)}>` 
- 无 avatar：首字母（`[...name][0]?.toUpperCase()`）+ 背景色（`Contact.color` 转十六进制）

**transformBlobURL 工具函数**（api.js 或 utils.js）：
- 将 blobdir 绝对路径转为 `asset://localhost/...` URL（依赖 P0-2 asset protocol 配置）

## 5. 任务分解（14 个 SDD 任务）

| # | 任务 | 范围 | 涉及文件 | 依赖 |
|---|---|---|---|---|
| T1 | P0-4/P0-5 start_io 修复 | `create_chatmail_account` 加 `ctx.start_io().await`；验证收发；必要时配 `Config::Interval` | commands.rs | 无 |
| T2 | P0-2 asset protocol 配置 | 新增 `get_asset_url(path)` 命令返回 `asset://` URL；tauri.conf.json `assetProtocol.scope` 配 `$APPDATA/**` 兜底 | tauri.conf.json, commands.rs, lib.rs | 无 |
| T3 | P0-1 前端附件渲染 | message.js 加 view_type 分支：Image/File/Audio/Voice/Video | message.js, styles.css | T2 |
| T4 | P0-3 homeView 信息密度 | homeView.js 渲染 last_msg + last_ts + 头像首字母 | homeView.js, styles.css | T2 |
| T5 | 布局改造 - app rail | wsRail.js → appRail.js：Chat/Work/Inbox 图标 + ws + 底部设置/头像 | appRail.js, shell.js, state.js, styles.css | 无 |
| T6 | 布局改造 - nav tree | channelTree.js 改造为 nav tree：按 currentApp 切换；底部视图入口占位 | channelTree.js, shell.js, state.js | T5 |
| T7 | 布局改造 - detail panel + members 搜索 | rightDrawer.js 加宽 300px + 可折叠 + members 搜索框（P1-7） | rightDrawer.js, styles.css | T5 |
| T8 | P1-1 + P0-6 事件 handler + 发送状态 | shell.js 注册 13 事件 handler；message.js 显示 pending/delivered/failed + 重发 | shell.js, message.js | T1 |
| T9 | P1-2 频道切换保持分页 | shell.js refreshCurrentChat 改增量追加；chatView.js 不重置分页状态 | shell.js, chatView.js | T8 |
| T10 | P1-3 跨频道全文搜索 | 新增 `search_msgs(query)` 命令调 core `chat::search_msgs`（若 core 无此 API 则 fallback 遍历 chats + get_chat_msgs + 文本 filter）；search.js 接该命令，结果带频道名+跳转 | commands.rs, lib.rs, search.js | 无 |
| T11 | P1-4 消息虚拟化 | chatView.js 只渲染 viewport ± buffer；IntersectionObserver | chatView.js | T9 |
| T12 | P1-5/P1-6/P1-8/P1-9 动效+未读分隔+pin 改造+wsRail 未读 | styles.css transitions；chatView.js 未读分隔线；rightDrawer.js pin 预览+跳转；wsRail.js 真实未读聚合 | styles.css, chatView.js, rightDrawer.js, wsRail.js | T5 |
| T13 | Profile 头像扩展 | dto.rs ProfileDto/MemberDto 加 avatar/color；get_self_profile/get_chat_info 填充；update_profile 加 avatar_path；events.rs 转发 SelfavatarChanged；前端 settingsPanel 头像 UI + 各处头像渲染 + transformBlobURL | dto.rs, commands.rs, events.rs, settingsPanel.js, appRail.js, homeView.js, message.js, rightDrawer.js, memberDetail.js, api.js, styles.css | T2 |
| T14 | 最终验证 + 提交 | cargo build + npm run build + cargo test；git commit | - | 全部 |

### 依赖关系图
```
T1 ──┐
     ├── T8 ── T9 ── T11
T2 ──┤                ┌── T12
     ├── T3           │
     ├── T4           │
     ├── T13 ─────────┘
T5 ── T6
  └── T7
T10 (独立)
T14 (全部完成后)
```

## 6. 数据流与状态变更

### 6.1 state.js 新增字段
```
state.currentApp = "chat" | "work" | "inbox"  // 当前 application（SP4 只有 chat 激活）
state.detailPanelOpen = true                   // detail panel 折叠状态
```

### 6.2 事件流扩展
SP4 后事件处理覆盖：
```
IncomingMsg      → handleIncomingMsg（通知 + 刷新当前 chat + badge）
MsgsChanged      → 增量追加新消息（T9）+ refreshSidebar + badge
MsgsNoticed      → 清除未读分隔线
MsgDelivered     → 更新消息状态为 delivered（T8）
MsgFailed        → 更新消息状态为 failed + 显示重发（T8）
MsgRead          → 清除未读标记
MsgDeleted       → 从 state.messages 移除（T8）
ReactionsChanged → 增量更新 reactions（T8）
ChatlistItemChanged → refreshSidebar + homeView + badge
ChatModified     → refreshSidebar + homeView
ChatDeleted      → 移除频道（T8）
ContactsChanged  → refreshSidebar
SelfavatarChanged → 重新拉 get_self_profile（T13）
ConfigureProgress → login 进度
```

### 6.3 持久化扩展（persist.js）
新增：
- `peytchat.currentApp`（"chat"）
- `peytchat.detailPanelOpen`（true）

## 7. 测试策略

### 7.1 后端测试（cargo test）
- T1：验证 `create_chatmail_account` 后 `ctx.is_io_running()` 为 true
- T13：验证 `get_self_profile` 返回 avatar/color 字段
- T10：验证 `search_msgs` 命令返回正确结果

### 7.2 前端测试（手动）
- T1：chatmail 注册后能立即收发消息
- T3：发送图片/文件，对方收到且本地正确渲染
- T5/T6/T7：application 切换、nav tree 切换、detail panel 折叠
- T8：消息发送失败显示重发按钮，重发成功
- T9：滚动加载历史后收到新消息，scroll 位置保持
- T11：1000+ 消息频道滚动流畅
- T13：头像上传后各处同步显示

### 7.3 跨客户端验证
- peytchat 发消息 → deltachat desktop 收到
- deltachat desktop 发消息 → peytchat 收到
- peytchat 发图片 → deltachat desktop 收到并显示
- 头像设置后 deltachat desktop 显示

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| asset protocol 配置复杂，blobdir 路径动态 | T2 优先用 `get_asset_url` 命令方案，前端调命令拿 URL |
| 消息虚拟化引入 scroll 抖动 | T11 保留 scroll 锚点，先渲染 buffer 再替换 |
| 13 事件 handler 引入回归 | T8 增量更新而非全量重渲染，逐事件验证 |
| start_io 修复后仍有收发问题 | T1 验证 `Config::Interval` 兜底，必要时配置 60s 轮询 |
| 头像上传后 core 裁剪耗时 | T13 异步上传，UI 显示 loading |

## 9. 后续 sprint 预告

- **SP5**：Card + Task 双模式核心（Card 表 + 双重存储 + Card 详情右栏 + Task 指派/状态/截止 + Work application 启用）
- **SP6**：Inbox 统一通知 + Activity 活动流（notifications 表 + Inbox application 启用 + 系统活动消息混排）
- **SP7**：命令面板 + Viewlet 视图切换（Cmd+K 扩展为命令模式 + viewlets 表 + 消息流/卡片网格/看板切换）

## 10. 关键文件索引

### 现有文件（需修改）
- [src-tauri/src/commands.rs](file:///Users/xiatian/Desktop/peytchat/src-tauri/src/commands.rs) — T1/T2/T8/T10/T13
- [src-tauri/src/dto.rs](file:///Users/xiatian/Desktop/peytchat/src-tauri/src/dto.rs) — T13
- [src-tauri/src/events.rs](file:///Users/xiatian/Desktop/peytchat/src-tauri/src/events.rs) — T13
- [src-tauri/src/lib.rs](file:///Users/xiatian/Desktop/peytchat/src-tauri/src/lib.rs) — T2/T10
- [src-tauri/tauri.conf.json](file:///Users/xiatian/Desktop/peytchat/src-tauri/tauri.conf.json) — T2
- [src/shell/shell.js](file:///Users/xiatian/Desktop/peytchat/src/shell/shell.js) — T5/T6/T8/T9
- [src/shell/wsRail.js](file:///Users/xiatian/Desktop/peytchat/src/shell/wsRail.js) → appRail.js — T5/T12
- [src/shell/channelTree.js](file:///Users/xiatian/Desktop/peytchat/src/shell/channelTree.js) — T6
- [src/shell/rightDrawer.js](file:///Users/xiatian/Desktop/peytchat/src/shell/rightDrawer.js) — T7/T12/T13
- [src/chat/chatView.js](file:///Users/xiatian/Desktop/peytchat/src/chat/chatView.js) — T9/T11/T12
- [src/chat/message.js](file:///Users/xiatian/Desktop/peytchat/src/chat/message.js) — T3/T8/T13
- [src/dialogs/homeView.js](file:///Users/xiatian/Desktop/peytchat/src/dialogs/homeView.js) — T4/T13
- [src/dialogs/search.js](file:///Users/xiatian/Desktop/peytchat/src/dialogs/search.js) — T10
- [src/dialogs/settingsPanel.js](file:///Users/xiatian/Desktop/peytchat/src/dialogs/settingsPanel.js) — T13
- [src/dialogs/memberDetail.js](file:///Users/xiatian/Desktop/peytchat/src/dialogs/memberDetail.js) — T13
- [src/state.js](file:///Users/xiatian/Desktop/peytchat/src/state.js) — T5/T6
- [src/persist.js](file:///Users/xiatian/Desktop/peytchat/src/persist.js) — T5
- [src/api.js](file:///Users/xiatian/Desktop/peytchat/src/api.js) — T13
- [src/styles.css](file:///Users/xiatian/Desktop/peytchat/src/styles.css) — T3/T4/T5/T7/T12/T13

### 新增文件
- `src-tauri/src/commands.rs` 内新增 `get_asset_url` / `search_msgs` 命令（T2/T10）
- `src/utils.js` 或 `src/api.js` 内新增 `transformBlobURL` 工具函数（T13）

### 参考
- [Plzdelta Avatar 实现](file:///Users/xiatian/Desktop/Plzdelta/packages/frontend/src/components/Avatar/index.tsx)
- [Plzdelta EditProfileDialog](file:///Users/xiatian/Desktop/Plzdelta/packages/frontend/src/components/dialogs/EditProfileDialog/index.tsx)
- [Huly 平台调研报告]（本对话上下文）
- [SP4 mockup](file:///Users/xiatian/Desktop/peytchat/.superpowers/brainstorm/29054-1785381683/content/sp4-huly-layout.html)
