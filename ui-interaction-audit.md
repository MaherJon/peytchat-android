# Peytchat UI 交互审查报告

审查范围：`src/` 下 shell / chat / work / dialogs 模块及 `styles.css`。
审查基准：Discord 及主流桌面软件操作习惯。
审查日期：2026-07-31。

---

## 问题汇总

| 严重度 | 数量 |
|--------|------|
| CRITICAL（完全无法操作 / 核心交互失效） | 2 |
| MAJOR（严重不符合习惯 / 易误操作） | 9 |
| MINOR（小问题 / 可发现性弱） | 9 |
| **合计** | **20** |

---

## CRITICAL

### C1. 点击看板卡片无法显示详情面板
- **文件:行号**：`src/work/kanban.js:47-54` + `src/work/cardDetail.js:8-54` + `src/shell/channelTree.js:243`
- **问题描述**：在协作频道中点击看板卡片时，`kanban.js` 的 `el.onclick` 只调用 `renderCardDetail(cardId)`，而 `renderCardDetail` 仅写入 `#right-drawer` 的 `innerHTML`，**既不设置 `state.rightDrawerOpen=true`，也不移除 `collapsed` 类**。但用户进入协作频道时，`channelTree.js:243` 已将 `state.rightDrawerOpen` 设为 `false`，导致 `rightDrawer.js:33-34` 给抽屉加上 `collapsed` 类。CSS（`styles.css:156`）`.right-drawer.collapsed { width:0; overflow:hidden }` 使抽屉宽度为 0、内容隐藏。结果：详情内容被写进一个零宽度、不可见的抽屉，用户点击卡片后**完全看不到任何详情**，看板最核心的「点卡片→看详情」交互失效。
- **预期行为**（Discord/Linear/Trello）：点击卡片 → 右侧详情面板展开并显示标题/状态/描述等内容。
- **建议修复**：
  - 在 `kanban.js` 卡片点击处理中，调用 `renderCardDetail` 前先 `state.rightDrawerOpen=true; state.detailPanelOpen=true; saveState();`，并通过 `renderRightDrawer()` 统一入口（而非直接调 `renderCardDetail`），让 `rightDrawer.js` 的 work+card 分支也负责移除 `collapsed` 类、渲染顶部 tab/折叠按钮；
  - 或在 `renderCardDetail` 开头直接 `drawer.classList.remove("collapsed")` 并保证 `state.rightDrawerOpen=true`。

### C2. Work 模式协作频道列表项完全无样式，无点击反馈
- **文件:行号**：`src/shell/channelTree.js:223-236`（HTML 类名）+ `src/styles.css`（缺失 `.nav-item` 等规则）
- **问题描述**：`renderWorkNavTree` 渲染协作频道列表时使用 `.nav-item / .nav-header / .nav-group / .nav-group-title / .nav-children / .nav-icon` 等类，但 `styles.css` 中**这些选择器一条规则都没有**（已 grep 确认仅存在 `.nav-tree / .nav-placeholder / .nav-view-*`）。结果：协作频道项是纯文本 `<div>`，无 `cursor:pointer`、无内边距、无 hover 反馈、无 active 高亮（`.nav-item.active` 无样式）。用户看不出这些文字可点，也无法得知当前选中了哪个协作频道。这是 Work 模式频道切换的唯一入口，视觉反馈完全缺失，等同于「无法操作」。
- **预期行为**：与 Chat 模式 `.ct-channel` 一致——hover 变色、active 背景高亮、cursor pointer、合理内边距。
- **建议修复**：在 `styles.css` 补齐，复用 `.ct-channel` 风格：
  ```css
  .nav-item { padding:5px 16px; cursor:pointer; color:var(--text-mute); }
  .nav-item:hover { color:var(--text); }
  .nav-item.active { background:var(--active); color:var(--text); font-weight:500; border-radius:0 4px 4px 0; }
  .nav-header { padding:14px 16px 12px; font-size:13px; font-weight:600; border-bottom:1px solid var(--border); }
  .nav-group-title { padding:8px 16px 2px; font-size:9px; font-weight:600; color:var(--text-weak); text-transform:uppercase; }
  .nav-icon { margin-right:6px; }
  ```

---

## MAJOR

### M1. 切换 workspace 时强制弹出设置抽屉
- **文件:行号**：`src/shell/appRail.js:227-230`（`bindWorkspaceIcons`）
- **问题描述**：每次点击左侧 workspace 图标切换工作区，都强制执行 `state.rightDrawerOpen=true; state.rightDrawerTab="settings"; renderRightDrawer()`。切换工作区是高频导航操作，不应弹出设置面板；这会打断用户「切工作区→选频道」的流程，且每次都要手动关抽屉。
- **预期行为**（Discord/Slack）：切换服务器/工作区只切换频道树与主区，不弹任何面板。
- **建议修复**：删除 227-230 行的 rightDrawerOpen / settings 设置，切换 ws 仅 `renderAppRail + refreshChannels + renderChannelTree + 清空主区为"选择一个频道"`。

### M2. 左下角用户条点击行为不一致且不符合习惯
- **文件:行号**：`src/shell/channelTree.js:165-177`（workspace 模式）vs `src/dialogs/homeView.js:186-194`（home 模式）
- **问题描述**：同一 `.ct-user` 元素在两种模式下行为不同：workspace 模式下点击会 `homeMode=true` + 清空 `currentChatId/currentWsId` + 跳主页 + 再开设置抽屉（一次点击触发「跳转主页」和「开抽屉」两个意外动作）；home 模式下点击只开设置抽屉。两者都不符合习惯——Discord 点用户条只打开「用户设置/状态」，绝不跳转。
- **预期行为**：点击用户条 → 仅打开账号设置抽屉，不改变当前所在工作区/频道/主页状态。
- **建议修复**：统一两处 `ctUser.onclick` 为：仅 `state.rightDrawerOpen=true; state.rightDrawerTab="settings"; saveState(); renderRightDrawer();`，移除 channelTree.js 中的 `homeMode/currentWsId/currentChatId` 改动。

### M3. Chat ↔ Work 模式切换不同步主区内容
- **文件:行号**：`src/shell/appRail.js:195-211`（`bindAppIcons`）+ `src/shell/channelTree.js:254-281`（`renderMain`）
- **问题描述**：点击 Ch/Wk 切换模式时，`bindAppIcons` 只 `renderAppRail + renderChannelTree`，**不重渲染 `#chat-main`**。从 Work（看板）切回 Chat，主区仍显示看板；从 Chat 切 Work 时若 `state.currentView==="messages"`，`renderMain` 没有 messages 分支（只处理 kanban/list），主区保留旧聊天消息。用户看到「频道树是 Chat、主区却是看板」或「频道树是 Work、主区却是聊天」的错位状态。
- **预期行为**：模式切换后主区立即呈现对应模式的内容（Chat→消息流；Work→看板/列表或空态）。
- **建议修复**：`bindAppIcons` 切换后调用 `renderMain()`（Work）或按 `currentChatId` 调 `renderChatView`（Chat）；`renderMain` 增加 `messages` 视图分支或显式回退到 `renderChatView`。

### M4. 消息无右键菜单，仅靠 hover 英文小字按钮
- **文件:行号**：`src/chat/message.js:250-381`（`bindMessageActions`）
- **问题描述**：消息只提供 hover 时出现的 `pin/reply/react/del/card` 英文小字按钮，没有 `contextmenu` 事件。Discord/微信/Telegram 桌面端消息的主要交互是右键菜单（复制、回复、转发、删除、置顶、反应）。仅靠 hover 按钮不符合桌面 IM 习惯，按钮又是英文小字、可发现性差，且 hover 在某些场景（如触控板）不稳定。
- **预期行为**：右键消息弹出上下文菜单，包含复制/回复/转发/置顶/反应/删除等。
- **建议修复**：在 `bindMessageActions` 给每个 `.msg` 绑定 `contextmenu`，调用 `showContextMenu` 渲染「复制文本 / 回复 / 置顶 / 添加反应 / 转 Card / 删除」等项（复用现有 action 逻辑）。

### M5. 看板卡片状态切换用三个无标签小圆点
- **文件:行号**：`src/work/kanban.js:122-126`（`renderCard`）
- **问题描述**：每张卡片底部三个 `·` 按钮，仅靠 `title` 属性和 active 高亮区分 Todo/In Progress/Done，无文字标签。用户无法理解三个点代表三种状态，可发现性极低。
- **预期行为**（Trello/Linear）：状态切换用下拉选择、带标签的分段控件，或直接拖拽卡片跨列。
- **建议修复**：改为带文字的 segmented control（Todo / Doing / Done），或用 `<select>`，并支持拖拽跨列改状态。

### M6. 新建频道入口只有右键分类名
- **文件:行号**：`src/shell/channelTree.js:155-164`
- **问题描述**：创建频道的唯一途径是右键点击分类名（`ct-category` 的 `contextmenu`）。没有 + 按钮、没有菜单项。新用户完全无法发现如何创建频道。Discord 在分类旁有明显的 + 图标。
- **预期行为**：分类行右侧有 + 图标，或频道树头部有「新建频道」入口。
- **建议修复**：在 `.ct-category` 行右侧渲染 + 图标并绑定 `openChannelCreateDialog`；或在 `ct-header` 加「新建频道」按钮。

### M7. 看板列内「+ 添加卡片」不区分所在列状态
- **文件:行号**：`src/work/kanban.js:104`（`renderColumn`）+ `src/work/kanban.js:76-92`（`__newCard`）
- **问题描述**：每列底部的 `+ 添加卡片` 调用 `window.__newCard(${chatId})`，未传该列 status；`__newCard` 调 `create_card` 也不传 status，新卡片总进 Todo 列。在「In Progress」列点 + 却创建到 Todo 列，违反直觉。
- **预期行为**：在某列点 + 创建的卡片应默认进入该列状态。
- **建议修复**：`renderColumn` 把 status 传给 add 按钮 `window.__newCard(${chatId},'${status}')`，`__newCard` 接收并透传给 `create_card`。

### M8. 卡片详情无关闭/折叠按钮，编辑无自动保存
- **文件:行号**：`src/work/cardDetail.js:19-54` + `src/shell/rightDrawer.js:29-32`
- **问题描述**：卡片详情面板没有 ✕ 或折叠按钮——`rightDrawer.js:29-32` 的 work+card 分支提前 `return`，跳过了 rd-tabs/折叠按钮的渲染。编辑标题/描述后必须点「保存」，切换到别的卡片不警告就丢失改动。且无法折叠抽屉以查看全宽看板。用户被详情面板「困住」。
- **预期行为**：详情面板顶部有 ✕ 关闭/折叠按钮；编辑失焦自动保存或切换前提示未保存。
- **建议修复**：cardDetail 顶部加 ✕ 关闭按钮（点击置 `state.currentCardId=null` + `renderRightDrawer()`）；让 rightDrawer 的 work+card 分支也渲染折叠按钮；编辑失焦时自动 `update_card` 或切换前对比改动并提示。

### M9. 输入框无法发送任何附件
- **文件:行号**：`src/chat/composer.js:22-27`
- **问题描述**：composer 只有 `<textarea>`，无附件/图片上传按钮。而 `message.js` 能展示图片/文件/音频/视频附件，但用户无法从 UI 发送任何附件——收得到发不出。IM 核心交互缺失。
- **预期行为**（Discord/微信/Telegram）：输入框旁有 +/附件按钮，可选择图片/文件发送。
- **建议修复**：composer 加 +/附件按钮，触发隐藏 `<input type=file>`，读取后调用后端 `send_file`/`send_image` 类命令。

---

## MINOR

### m1. 频道树「视图切换」是死控件
- **文件:行号**：`src/shell/channelTree.js:96-101`
- **问题**：「视图：消息流 ⇄」中的 `.nav-view-icon` 无 click 事件，title 写「切换视图（SP7）」，点击无反应。
- **修复**：未实现前应禁用（置灰 + not-allowed）或移除，避免误导。

### m2. Reaction picker 表情少且符号错位
- **文件:行号**：`src/chat/message.js:150-155`
- **问题**：只有 4 个硬编码表情，显示符号与 emoji 不匹配（↑ 代表 👍，+ 代表 ➕），无搜索、无完整表情面板。
- **修复**：接完整 emoji picker；至少符号与 data-emoji 一致。

### m3. 新建卡片用原生 prompt
- **文件:行号**：`src/work/kanban.js:77`、`src/work/list.js:89`
- **问题**：用 `prompt("卡片标题:")` 阻断式输入，简陋；Discord/Linear 用内联输入框。
- **修复**：改为卡片内联标题输入框或小型弹窗表单。

### m4. 聊天头部 pin/info 按钮可发现性弱
- **文件:行号**：`src/chat/chatView.js:86-88`
- **问题**：`act-pin`/`act-info` 显示为纯小字「pin · N」「info」，虽有 `cursor:pointer`（styles.css:140）但无图标、无 hover 背景反馈。
- **修复**：加图标（📌/ℹ）与 hover 背景。

### m5. 列表列头排序无方向指示
- **文件:行号**：`src/work/list.js:55-60`
- **问题**：点击列头排序无 asc/desc 切换、无箭头，只有 `.sorted` 类。
- **修复**：加 ▲▼ 方向指示并支持点击切换升降序。

### m6. 右键菜单不检测屏幕边界
- **文件:行号**：`src/dialogs/contextMenu.js:7-8`
- **问题**：菜单直接用 `clientX/clientY` 定位，靠近右/下边缘会溢出视口。
- **修复**：定位前判断 `x+width > innerWidth` 则右对齐，`y+height > innerHeight` 则上对齐。

### m7. disabled 分支 work toast 文案过时
- **文件:行号**：`src/shell/appRail.js:200`
- **问题**：disabled 分支里 work 的 toast「Work 协作模式将在 SP5 启用」已过时（work 已启用），仅 inbox 会触发；文案应清理为仅 inbox 文案。
- **修复**：删除 work 分支判断，仅保留 inbox 提示。

### m8. 输入框 placeholder 在 DM 下语义不准
- **文件:行号**：`src/chat/composer.js:25`
- **问题**：placeholder 固定「发消息到频道...」，在 DM（home 模式私聊）下也显示「频道」。
- **修复**：根据 `homeMode`/频道类型动态显示「发消息到 XX」。

### m9. act-info 与 act-pin 打开抽屉行为不一致
- **文件:行号**：`src/chat/chatView.js:93-102`
- **问题**：`act-info` 用 `rightDrawerOpen = !rightDrawerOpen` 切换，而 `act-pin`/settings 都强制打开；info 的 toggle 行为与其它入口不一致，易让用户困惑抽屉开关状态。
- **修复**：统一为强制打开并切到对应 tab，或所有入口都做 toggle。

---

## 附：审查重点小结

| 审查项 | 结论 |
|--------|------|
| 1. 启动初始状态/登录引导 | 合格。`main.js` 未配置→`renderLogin`，有「快速开始/邮箱登录」双 tab，空会话有「点 + 添加好友或创建群」引导。 |
| 2. 频道切换+active 高亮 | Chat 模式合格（`.ct-channel.active` 有背景）。**Work 模式不合格**（见 C2，列表项无样式无反馈）。 |
| 3. 消息发送 Enter/Shift+Enter | 合格。`composer.js:43-49` Enter 发送、Shift+Enter 换行、Cmd/Ctrl+Enter 发送，符合习惯。**但无法发附件**（见 M9）。 |
| 4. Work 模式切换 | 部分可用。Wk 可切，但**主区不同步**（M3）、**列表项无反馈**（C2）、**切 ws 弹设置**（M1）。 |
| 5. 看板操作 | 严重不足。**点卡片看不到详情**（C1）、状态切换不可懂（M5）、列内建卡不进对应列（M7）、详情无关闭/无自动保存（M8）。 |
| 6. 右键菜单/快捷操作 | 部分可用。频道/会话有右键菜单；**消息无右键菜单**（M4）；建频道仅靠右键分类（M6）。全局 Cmd/Ctrl+K 搜索、ESC 逐级关闭合格。 |
