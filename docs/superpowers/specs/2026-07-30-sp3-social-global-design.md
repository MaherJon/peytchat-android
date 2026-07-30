# SP3 社交入口 + 全局体验 设计文档

> 紧接 SP2(管理闭环 + 聊天体验)。SP2 让现有功能可用;SP3 目标:从「能用」到「好用」——补齐社交扩展入口,加入快捷键/通知/持久化等现代桌面应用体验。

## 目标

让用户能主动扩展社交圈(加好友、建群、处理请求),并补齐全局体验(搜索、快捷键、通知、持久化、实时刷新),使应用具备现代桌面社区应用的完整感。

## 不做(超出范围)

- 语音视频通话
- 文件管理 / Git GUI
- Bot 层
- 消息搜索的高级语法(AND/OR/过滤)——SP3 只做全量文本搜索
- 多账号切换(SP3 仍是单账号)

## 设计约束(继承)

- 仅黑白灰阶,不引入彩色/emoji
- 无多级菜单;会话操作走右键轻量菜单(单层,不超过 5 项)
- 桌面应用思维;核心功能 3 次点击内
- `chatmail/core` 禁止修改
- DTO snake_case;rusqlite 用 `spawn_blocking`

---

## 1. 社交入口

### 1.1 主页 `+` 按钮

主页模式(homeMode)下,频道树 header 右侧加 `+` 按钮(对齐 ws-rail 的 ws-add 风格)。点击弹出 overlay 对话框,含 3 个选项:

- **添加好友**:输入邮箱地址 → `create_chat_by_email` → 进入该私聊
- **通过 QR 加入**:粘贴 SecureJoin QR 链接 → `secure_join` → 进入新会话(可能是私聊或群)
- **创建群**:输入群名 → `create_group_chat`(core chat::create_group,非 workspace 关联,进 homeView 列表)

对话框样式复用 SP1 的 `.overlay`/`.dialog` 暗色极简风格。

### 1.2 联系人请求处理

homeView 渲染 chatlist 时,`is_contact_request = true` 的项:
- badge 显示 `请求`(已有)
- 点击该会话不直接进 chatView,而是进入**请求处理视图**:显示对方信息(姓名/邮箱)+ `accept` / `decline` 两个按钮
- accept → `accept_chat(chatId)` → 进入正常 chatView
- decline → `block_chat(chatId)` 或 `delete_chat(chatId)` → 从列表移除

后端命令 `accept_chat`/`block_chat`/`delete_chat` 已在 MVP 实现,SP3 前端补 UI。

### 1.3 成员详情 → 私聊

右栏 members 列表的成员项可点击。点击后:
- 右栏切换为**成员详情视图**(替换 members 列表):显示姓名/邮箱/role + `发消息` 按钮
- 点 `发消息` → `create_chat_by_contact(contactId)` → 进入该私聊(homeMode + currentChatId = 新私聊)

实现:`rightDrawer.js` members tab 下,成员项 click 调 `renderMemberDetail(body, contactId)`;新增后端命令 `create_chat_by_contact(contact_id: u32) -> u32`(core `chat::create_by_contact_id`)。

### 1.4 会话右键菜单(单层)

homeView 的会话项 + workspace 频道项支持右键菜单(单层,最多 5 项):

**私聊右键**:`查看资料` / `屏蔽` / `删除会话`
**群聊右键**:`改名` / `加人` / `退群` / `删除会话`
**workspace 频道右键**:`频道设置`(跳右栏 settings)/ `离开频道`

菜单样式:暗色极简浮层(绝对定位,1px 边框,无图标),点击菜单项执行后菜单消失。与 SP1 的 category 右键新建频道风格一致。

实现:`src/dialogs/contextMenu.js`(新)导出 `showContextMenu(x, y, items[])`,items 为 `{label, action}` 数组;各渲染模块绑 contextmenu 事件。

### 1.5 我的二维码(账号设置内)

SP2 账号设置面板已有「我的二维码」入口。SP3 补完整实现:
- 点击 → 调 `get_my_qr` → 返回 QR 码字符串(deltachat securejoin URI)
- 前端用 `qrcode` npm 包(轻量,~30KB)渲染为图片
- overlay 居中显示 QR + 说明文字 `扫描此二维码添加你为好友`

实现:`src/dialogs/qrShow.js`(新);`npm install qrcode`。

---

## 2. 全局体验

### 2.1 Cmd+K 全局搜索

任意位置按 Cmd+K(Mac)/ Ctrl+K(Win/Linux)弹出**搜索 overlay**:
- 单输入框,占位 `搜索消息 / 频道 / 成员`
- 输入时实时搜索(防抖 200ms):
  - **消息**:遍历当前 workspace 所有频道的 recent messages 匹配文本(SP3 简化:只搜已加载的 state.messages + 当前频道;全量搜索需 core 支持,留给后续)
  - **频道**:state.workspaces 的所有 channels + homeView chatlist 匹配 name
  - **成员**:当前频道 members 匹配 name
- 结果分组显示(消息/频道/成员),点击跳转(消息→进频道+高亮该消息;频道→进频道;成员→成员详情)

实现:`src/dialogs/search.js`(新);`src/shell/shell.js` 注册全局 keydown Cmd+K;`state.js` 加 searchOpen 字段。

### 2.2 ESC 键

全局 ESC 键行为(按优先级):
1. 若有 overlay 开着(对话框/菜单/搜索)→ 关闭最上层 overlay
2. 若 reply 模式开着 → 取消 reply(清 dataset.replyTo + 移除预览条)
3. 若右栏开着 → 关闭右栏
4. 否则无操作

实现:`shell.js` 注册全局 keydown ESC,按优先级检查 state 并执行。

### 2.3 Cmd+Enter 发送

聊天 composer 中 Cmd+Enter(Mac)/ Ctrl+Enter(Win/Linux)发送消息(与 Enter 单行发送互补;Shift+Enter 仍为换行)。

实现:`composer.js` keydown 判断 `e.metaKey || e.ctrlKey` + Enter。

### 2.4 未读角标

- **Dock/任务栏角标**:Tauri v2 `app.set_badge_count(total_unread)`。total_unread = 所有 chatlist unread 之和 + workspace 频道 unread 之和。
- **workspace 图标聚合角标**:SP2 已实现(汇总该 ws channel unread)。SP3 补实时刷新(见 2.6)。
- 角标在应用聚焦时不清除(unread 仍计),进入对应频道才 mark_chat_noticed 清除。

实现:`shell.js` 定时(或事件驱动)调 `get_chatlist` 汇总 unread → `window.__TAURI__.app.set_badge_count`。

### 2.5 桌面通知

`IncomingMsg` 事件触发:
- 若该 chatId 不是当前 currentChatId(非聚焦聊天)→ 发系统通知
- 通知标题=发送者,正文=消息文本前 50 字符
- 点击通知 → 跳转该聊天(state.currentChatId = chatId + renderChatView)

实现:`shell.js` 的 IncomingMsg 监听改为:若 chatId != currentChatId → `new Notification(title, {body})`;Tauri v2 需 `notification` permission(SP3 启动时请求)。

### 2.6 实时 unread 刷新

SP1 的 `MsgsChanged`/`IncomingMsg` 只刷新当前聊天。SP3 改为:
- `IncomingMsg` → 刷新当前聊天(若有)+ 刷新频道树 unread(重新 list_channels 拉最新 unread)+ 刷新 wsRail 聚合角标 + 更新 Dock 角标
- `MsgsChanged` → 同上
- `ChatlistItemChanged` → 刷新 homeView(若在主页)+ 刷新 wsRail

实现:`shell.js` 的事件监听扩展;`channelTree.js` refreshChannels 重新拉 unread;`wsRail.js` renderWsRail 重算聚合。

### 2.7 持久化(localStorage)

以下状态存 localStorage,启动时恢复:
- `collapsedCategories`:`{ <wsId>: { <categoryName>: bool } }` 折叠状态
- `currentWsId`:上次选中的 workspace
- `currentChatId`:上次选中的频道
- `homeMode`:是否主页模式

启动时 `renderShell` 读取并恢复:若 currentWsId 存在 → 选中该 ws + 刷新频道;若 currentChatId 存在 → 进该频道;否则进主页。

实现:`src/persist.js`(新)导出 `saveState()` / `loadState()`;各 state 变更点调 saveState;renderShell 开头调 loadState 恢复。

### 2.8 空状态引导

- **无 workspace 时**:ws-rail 只剩 `·` 主页 + `+`。chat-main 显示引导卡:`欢迎,创建你的第一个 workspace` + `+ 创建 workspace` 按钮(点击开 wsWizard)。
- **无会话时(主页空)**:homeView 的 ct-list 显示 `还没有会话,点 + 添加好友或创建群` + 高亮主页 `+` 按钮。
- **无消息时(频道空)**:messages 区显示 `这个频道还没有消息,发第一条吧`。

实现:`styles.css` 加 `.guide-card` 类(居中,灰字,单按钮);各空状态判断渲染引导卡。

---

## 3. 文件结构

### 后端
- `src-tauri/src/commands.rs`:新增 `create_chat_by_contact(contact_id) -> u32`;现有 `accept_chat`/`block_chat`/`delete_chat`/`create_chat_by_email`/`secure_join`/`create_group_chat` 复用
- `src-tauri/src/lib.rs`:注册新命令;Tauri notification permission 配置

### 前端
- `src/dialogs/homePlus.js`(新):主页 + 按钮 overlay(添加好友/QR 加入/创建群)
- `src/dialogs/contactRequest.js`(新):联系人请求处理视图
- `src/dialogs/memberDetail.js`(新):成员详情 + 发消息
- `src/dialogs/contextMenu.js`(新):单层右键菜单
- `src/dialogs/qrShow.js`(新):我的二维码展示
- `src/dialogs/search.js`(新):Cmd+K 全局搜索 overlay
- `src/persist.js`(新):localStorage 读写
- `src/shell/shell.js`:全局快捷键 + 事件刷新扩展 + 持久化恢复 + Dock 角标 + 通知
- `src/shell/wsRail.js`:实时聚合角标刷新
- `src/shell/channelTree.js`:折叠持久化读写
- `src/dialogs/homeView.js`:`+` 按钮 + 请求处理入口 + 空状态引导
- `src/chat/chatView.js`:空消息引导
- `src/state.js`:加 searchOpen / collapsedCategories 字段
- `src/styles.css`:context-menu / search-overlay / guide-card / qr-overlay 样式
- `package.json`:`qrcode` 依赖

---

## 4. 验证清单

1. 主页点 `+` → 输入邮箱 → 添加好友 → 进入私聊 → 双向收发消息
2. 主页点 `+` → 创建群 → 群出现在主页列表
3. 收到联系人请求 → 主页会话显示 `请求` badge → 点击 → accept → 进入聊天
4. 右栏 members → 点成员 → 详情 → `发消息` → 进入私聊
5. 右键私聊 → `查看资料` / `屏蔽` / `删除`
6. 右键群聊 → `改名` / `加人` / `退群`
7. 账号设置 → 我的二维码 → 弹 QR → 另一客户端 scan → 成功添加
8. Cmd+K → 输入文字 → 显示消息/频道/成员结果 → 点击跳转
9. ESC 逐级关闭(overlay → reply → 右栏)
10. Cmd+Enter 发送消息
11. 收到消息时(非当前聊天)→ 系统通知 + Dock 角标 +1
12. 点通知 → 跳转该聊天 + 角标清除
13. 刷新应用 → 恢复上次 workspace + 频道
14. 折叠 category → 刷新 → 保持折叠
15. 无 workspace 时 → 引导卡显示
