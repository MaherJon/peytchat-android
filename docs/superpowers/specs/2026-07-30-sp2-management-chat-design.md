# SP2 管理闭环 + 聊天体验 设计文档

> 紧接 SP1(外壳 + Workspace 模型)。SP1 交付了暗色四栏布局与基础聊天,但大量入口是死路、发送无反馈、管理无闭环。SP2 目标:从「能看」到「能用」。

## 目标

将 SP1 的静态展示外壳升级为可操作的应用:每个元素(workspace/频道/账号/消息)都有完整的设置与生命周期管理;聊天发送有状态反馈、reply 有闭环、reaction 可发起、历史可加载、错误有提示。

## 不做(留给 SP3)

- 添加好友/创建群入口、联系人请求处理、成员详情转私聊
- Cmd+K 搜索、桌面通知、Dock 角标
- 折叠/当前频道持久化、实时 unread 刷新
- 空状态引导卡

## 设计约束(继承用户偏好)

- 仅黑白灰阶色板(继承 SP1 CSS 变量),不引入彩色/emoji
- 无多级菜单、无复杂向导;管理入口走右栏 settings tab
- 桌面应用思维,核心功能 3 次点击内到达
- `chatmail/core` 禁止修改,所有改动在 `src-tauri/` 与 `src/` 内
- DTO snake_case,`#[derive(Serialize)]`
- rusqlite 同步访问用 `spawn_blocking`

---

## 1. 管理闭环:右栏 settings tab 模式

### 1.1 交互模型

右栏 tabs 从 `[members, pin, search]` 改为 `[members, pin, settings]`。移除 `search`(SP3 实现前不露空占位,避免破坏信任)。settings tab 内容**上下文敏感**,根据全局 state 自动切换:

| 当前上下文 | settings 显示 |
|---|---|
| homeMode = true(主页) | 账号设置 |
| 选中 workspace、currentChatId = null | workspace 设置 |
| 选中频道(currentChatId != null) | 频道设置 |

### 1.2 入口

- **点 workspace 图标**:选中 ws + 频道树切换 + 右栏自动开 settings tab(workspace 设置)。与 SP1「点图标只进频道树」不同,现在附带开 settings。
- **点 ct-user 区**(频道树底部用户条):切主页模式 + 右栏开 settings(账号设置)。
- **chat-header 的 info action**:切 members tab(保持现有)。
- **手动切 settings tab**:在右栏顶部点击 `settings`。

### 1.3 账号设置面板

- 显示名(可编辑,调 `update_profile` → core `set_config` displayname)
- 邮箱地址(只读,从 `get_self_profile` 拉)
- 我的二维码(点击展示 SecureJoin QR,复用 `get_my_qr` 命令,弹 overlay 显示 QR 图片)
- 登出按钮(调 `logout` → accounts.unselect + stop io,返回登录页)

### 1.4 workspace 设置面板

- workspace 名称(可编辑,调 `update_workspace` → 本地 sqlite UPDATE)
- 图标字符(可编辑,单字符,如 FE/BE/OP)
- 总群入口(按钮:打开 master_chat,即 `state.currentChatId = master_chat_id` + renderChatView)
- workspace 二维码(复用 master chat 的 `get_securejoin_qr`,弹 overlay,供他人 scan 加入)
- 离开 workspace(调 `leave_workspace` → 删本地元数据 + leave master chat + 删该 ws 所有 channel 元数据)
- 删除 workspace(调 `delete_workspace` → 同 leave 但更彻底,本地表全删 + leave 所有关联 chat)

### 1.5 频道设置面板

- 频道名(可编辑,调 `update_channel` → 本地 sqlite UPDATE channels.name;不改 core chat name)
- topic(可编辑,调 `update_channel` → UPDATE channels.topic)
- category(可编辑,调 `update_channel` → UPDATE channels.category;影响频道树分组)
- 离开频道(调 `leave_channel` → 删本地元数据 + chat::leave_group)
- 删除频道(调 `delete_channel` → 删本地元数据 + chat::delete 谨慎;SP2 默认只提供「离开」)

### 1.6 后端新增命令

所有命令在 `src-tauri/src/commands.rs` 实现,`lib.rs` invoke_handler 注册。

- `update_workspace(id: i64, name: Option<String>, icon: Option<String>) -> ()`:UPDATE workspaces SET name/icon
- `delete_workspace(id: i64) -> ()`:先 list 该 ws 所有 channels,逐个 chat::leave_group;再 leave master chat;再 DELETE workspaces + DELETE channels WHERE workspace_id + DELETE roles/contact_roles/pins WHERE workspace_id
- `leave_workspace(id: i64) -> ()`:同 delete 但保留?——不,leave 也删本地元数据(否则频道树残留),区别在于 leave 不 leave master chat(仅本地清理)。实际:leave = 删本地元数据,不动 core chat;delete = 删本地元数据 + leave 所有 core chat。
- `update_channel(chat_id: u32, name: Option<String>, topic: Option<String>, category: Option<String>) -> ()`:UPDATE channels SET 对应字段
- `delete_channel(chat_id: u32) -> ()`:chat::leave_group + DELETE channels WHERE chat_id
- `leave_channel(chat_id: u32) -> ()`:仅 DELETE channels WHERE chat_id(不 leave core,保留群可被重新加入)
- `update_profile(name: String) -> ()`:ctx.set_config(Config::Displayname, name)
- `get_my_qr() -> String`:chat::get_securejoin_qr(ctx, master_chat_id) 或针对无 ws 场景用 ChatId::create_for_contact(SELF)
- `logout() -> ()`:accounts.get_selected_account_id → accounts.remove_account 或 accounts.unselect + stop_io;前端跳登录页
- `delete_msg(msg_id: u32) -> ()`:deltachat::message::delete_msgs(ctx, &[MsgId])

### 1.7 前端结构

- `src/shell/rightDrawer.js`:tabs 数组改 `["members","pin","settings"]`;settings 分支调 `renderSettingsPanel()`
- `src/dialogs/settingsPanel.js`(新):导出 `renderSettingsPanel(body)` 根据 state 上下文调 `renderAccountSettings`/`renderWorkspaceSettings`/`renderChannelSettings`;每个子函数渲染表单 + 绑定 submit
- `src/shell/wsRail.js`:`ws-icon` click 改为「选中 ws + 开 settings」;workspace 图标渲染未读聚合角标(汇总该 ws 所有 channel unread,从 state.channels 累加)
- `src/shell/channelTree.js`:`ct-sub` 改显成员数(从 master chat info 拉 `info.members.length`,缓存到 state.wsMembers);折叠状态存 localStorage(`wsCatCollapsed_<wsId>` key)
- `src/shell/shell.js`:ct-user 区加 click 事件 → 切主页 + 开 settings

### 1.8 数据流

settings 表单提交 → call 命令 → 后端更新 sqlite/core → 前端刷新对应 state(workspaces/channels/self)→ 重新渲染 wsRail/channelTree/settingsPanel。失败时顶部 toast 提示。

---

## 2. 聊天体验升级

### 2.1 发送状态(乐观更新)

前端发送消息时不等后端返回先在 UI 插入一条 `state: "sending"` 的消息气泡(灰色 opacity 0.6 + 末尾 spinner 点)。后端 `send_text`/`send_reply` 返回 msg_id 后,把该临时气泡的 state 改为 `sent`(恢复正常样式)。若 await 抛错,state 改为 `failed`(红色小圆点 + 点击重发)。

实现:`composer.js` 发送时生成临时 msg 对象(unix ts + 临时 id = `tmp_<timestamp>`),插入 `state.messages` 末尾并渲染;`renderMessage` 根据 `m._state` 加样式;发送成功后替换临时 id 为真 msg_id 并改 `_state="sent"`。

### 2.2 reply 闭环

- 点 reply 按钮 → composer 上方出现**预览条**:显示 `↩ 回复 alice: 看下这个 race...`(被回复者名 + 内容前 40 字符)+ 右侧 `×` cancel 按钮。
- ESC 键取消 reply(清 `composer.dataset.replyTo` + 移除预览条)。
- 发送后预览条消失。
- composer placeholder 改为 `回复 alice...`(非 `msg #id`)。

实现:composer.js 渲染前检查 `input.dataset.replyTo`,若有则从 `state.messages` 查原消息取 from_name + text,渲染预览条到 composer 上方;bindComposer 加 ESC 监听。

### 2.3 reaction 选择器

- hover 消息时,消息右下角浮现 `+` 按钮。
- 点 `+` 弹出**符号选择条**(固定 4 个:`↑` `+` `★` `!`),对齐 mockup 极简无 emoji 风格。
- 点符号 → `send_reaction(emoji=对应符号)`。↑ 映射回 👍(core 用 👍),+ 映射 ➕,★ 和 ! 直接用字符(core 接受任意字符串)。
- 已有 reaction 的胶囊点击=取消该 reaction(再发一次同 emoji 即 toggle)。

实现:`message.js` renderMessage 加 `msg-actions` 浮层(默认 `display:none`,hover `display:flex`);`+` 按钮点击弹 `msg-reaction-picker`(绝对定位,4 个符号 span);bindMessageActions 绑定选择器点击。

### 2.4 消息删除

- 只对自己的消息(`m.is_out`)hover 时显示删除按钮(垃圾篓符号或文本 `del`)。
- 点删除 → confirm overlay("删除这条消息?") → `delete_msg(msg_id)` → 从 state.messages 移除 + 重渲染。

实现:`message.js` 对 is_out 消息加 `msg-del-btn`;bindMessageActions 绑定 → 弹 confirm overlay → call delete_msg。

### 2.5 历史加载

- messages 容器滚动到顶时(`scrollTop === 0`)触发加载更早消息。
- 后端 `get_chat_msgs` 已返回全部消息(SP1 实现),SP2 改为支持 `before_msg_id: Option<u32>` 参数,返回该 id 之前的 N 条(默认 50)。
- 前端维护 `state.messagesOldestId`,滚到顶时调 `get_chat_msgs(chatId, before_msg_id=oldestId)`,prepend 到 messages 前。
- 首次进频道只加载最近 50 条;滚到顶加载更多;无更多时停止。

实现:`commands.rs` get_chat_msgs 加 `before_msg_id` 参数,core `chat::get_chat_msgs` 本身按时间序返回,前端 slice;`chatView.js` messages 容器加 scroll 监听。

### 2.6 日期分隔

- 渲染 messages 时,相邻消息若 `ts` 跨天(日期不同),插入日期分隔条(居中灰字 `2026-07-30`)。
- 格式:当天显示 `今天`,昨天显示 `昨天`,更早显示 `YYYY-MM-DD`。

实现:`message.js` renderMessages 循环中比较 prev.ts 与 cur.ts 的 toDateString()。

### 2.7 加载态

- messages 区加载时显示局部 spinner(居中三个跳动的点,纯 CSS)。
- 右栏 body 加载时同样局部 spinner。
- 不用全局遮罩(桌面应用思维,避免打断)。

实现:`styles.css` 加 `.spinner` 类(CSS animation);各 render 函数 await 前插入 spinner HTML,await 完替换。

### 2.8 错误态(toast)

- 顶部固定区(`#toast`,position fixed top-center)显示错误消息。
- 3 秒自动消失(CSS transition opacity)。
- 所有 catch{} 不再静默,改为 `showToast(e.message)`。

实现:`src/toast.js`(新)导出 `showToast(msg)`;`styles.css` 加 `.toast` 类;各模块 catch 调 showToast。

### 2.9 role tag / @mention 动态化

- `message.js` 不再硬编码 `core` / `["core","ops"]`。
- 进入频道时拉 `list_roles(workspaceId)` 存 `state.roles`;渲染消息时根据 `m.from_id` 查 `list_all_contact_roles` 映射取 primary role name 显示 tag。
- @mention 高亮的 targets 改为 `state.roles.map(r=>r.name) + state.self.name`。

实现:`chatView.js` renderChatView 开头加 `state.roles = await call("list_roles", {workspaceId: state.currentWsId})`;`message.js` highlightMentions 读 state.roles。

### 2.10 composer 多行

- Shift+Enter 插入换行(不发送);Enter 发送。
- textarea 替换 input(支持多行 + 自适应高度)。

实现:`composer.js` input 改 textarea;keydown 判断 e.shiftKey;styles.css `.composer textarea` 样式。

### 2.11 pin/reply 按钮 hover 显示

- 默认隐藏,hover 消息时显示(hover 已用于 reaction 选择器,统一)。
- mockup 的 pin/reply 是文本按钮,保持文本风格,仅改显示时机。

实现:`.msg .msg-pin-btn, .msg .msg-reply-btn { display: none }`;`.msg:hover .msg-pin-btn, .msg:hover .msg-reply-btn { display: inline }`。

---

## 3. 文件结构

### 后端
- `src-tauri/src/commands.rs`:新增 10 个命令(update_workspace/delete_workspace/leave_workspace/update_channel/delete_channel/leave_channel/update_profile/get_my_qr/logout/delete_msg)
- `src-tauri/src/db.rs`:新增 update_workspace/update_channel/delete_workspace_channels 等辅助方法
- `src-tauri/src/dto.rs`:get_chat_msgs 加 before_msg_id 参数(不改 DTO,改命令签名)
- `src-tauri/src/lib.rs`:注册新命令

### 前端
- `src/shell/rightDrawer.js`:tabs 改,settings 分支
- `src/dialogs/settingsPanel.js`(新):账号/workspace/频道设置面板
- `src/shell/wsRail.js`:workspace 图标未读聚合 + 点击开 settings
- `src/shell/channelTree.js`:ct-sub 成员数 + 折叠持久化
- `src/shell/shell.js`:ct-user click 开账号 settings
- `src/chat/chatView.js`:加载态 + 历史加载 + role 拉取
- `src/chat/message.js`:发送状态 + reaction 选择器 + 删除 + 日期分隔 + hover 操作 + role 动态
- `src/chat/composer.js`:textarea 多行 + reply 预览条 + ESC
- `src/toast.js`(新):toast 错误提示
- `src/state.js`:加 messagesOldestId / roles / wsMembers 字段
- `src/styles.css`:spinner / toast / msg-actions / msg-reaction-picker / reply-preview / msg-del 样式

---

## 4. 验证清单

1. 点 workspace 图标 → 右栏开 workspace settings → 改名 → 频道树 header 更新
2. workspace settings → 点总群入口 → 进入 master chat
3. workspace settings → 我的二维码 → 弹 QR overlay
4. 频道 settings → 改 topic → chat-header topic 更新
5. 频道 settings → 离开 → 频道从树消失 + core chat leave
6. 账号 settings → 改显示名 → channelTree 底部 ct-user 更新
7. 账号 settings → 登出 → 回登录页
8. 发消息 → 气泡先灰(sending)→ 后正常(sent);拔网线发送 → failed 状态 + 可重发
9. 点 reply → composer 上方预览条 + ESC 取消
10. hover 消息 → `+` 出现 → 点 → 选 ↑ → reaction 胶囊出现
11. hover 自己消息 → del 按钮 → 确认 → 消息消失
12. 进频道只显 50 条 → 滚到顶 → 加载更早
13. 跨天消息间有日期分隔条
14. 任何操作失败 → 顶部 toast 提示
15. role tag 显示实际 role(非硬编码 core)
