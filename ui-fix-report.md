# UI 交互修复报告

修复日期：2026-07-31
分支：`sp5-card-task`
基准：`ui-interaction-audit.md` 中的 2 个 CRITICAL + 8 个 MAJOR（M9 跳过）

---

## CRITICAL

### C1. 点击看板卡片无法显示详情面板
**根因**：`renderCardDetail` 只写 `#right-drawer` 的 `innerHTML`，但 `rightDrawer.js` 的 work+card 分支提前 `return`，未移除 `collapsed` 类；进入协作频道时 `channelTree.js` 又把 `state.rightDrawerOpen` 设为 `false`，CSS `.right-drawer.collapsed { width:0 }` 使详情完全不可见。

**修复**：
- `src/work/kanban.js`：卡片 `onclick` 改为先 `state.rightDrawerOpen=true; state.detailPanelOpen=true; saveState();` 再 `await import(renderRightDrawer)` 走统一入口（替代直接调 `renderCardDetail`）。
- `src/shell/rightDrawer.js`：work+card 分支在 `import().then(renderCardDetail)` 前显式 `drawer.classList.remove("collapsed")`，保证抽屉展开。
- `src/work/cardDetail.js`：顶部加 ✕ 关闭按钮（见 M8）。

**涉及文件**：`src/work/kanban.js`、`src/shell/rightDrawer.js`、`src/work/cardDetail.js`

---

### C2. Work 模式协作频道列表项完全无样式
**根因**：`channelTree.js` 的 `renderWorkNavTree` 用了 `.nav-item/.nav-header/.nav-group/.nav-group-title/.nav-children/.nav-icon/.caret` 等类，但 `styles.css` 中这些选择器一条规则都没有，列表项是纯文本 `<div>`，无 cursor/hover/active 反馈。

**修复**：`src/styles.css` 补齐规则，复用 `.ct-channel` 风格：
- `.nav-header`：14px/13px/600 字重，下边框分隔
- `.nav-group`：flex 列容器，纵向滚动
- `.nav-group-title`：9px/600 大写小标题，带 caret 图标
- `.nav-item`：5px 16px 24px padding、cursor pointer、hover 变色、active 高亮（背景 `var(--active)` + 右圆角）
- `.nav-icon`：弱色图标，active 时变主色
- `.nav-children`：flex 列容器

**涉及文件**：`src/styles.css`

---

## MAJOR

### M1. 切换 workspace 强制弹设置抽屉
**根因**：`appRail.js:227-230` 每次切 ws 都执行 `state.rightDrawerOpen=true; state.rightDrawerTab="settings"; renderRightDrawer()`，打断「切工作区→选频道」流程。

**修复**：删除这 3 行副作用，只保留 `saveState()`。切 ws 现在只刷新 appRail + 频道树 + 主区空态。

**涉及文件**：`src/shell/appRail.js`

---

### M2. 左下角用户条点击行为不一致
**根因**：`channelTree.js` 的 `ctUser.onclick` 会 `homeMode=true` + 清 `currentChatId/currentWsId` + 跳主页 + 开设置抽屉（一次点击两个意外动作）；`homeView.js` 仅开设置抽屉。

**修复**：统一两处为「仅打开账号设置抽屉」：
- `channelTree.js`：移除 homeMode/currentChatId/currentWsId 清空与 `renderHomeView()` 调用；设 `rightDrawerOpen=true; detailPanelOpen=true; rightDrawerTab="settings"; saveState(); renderRightDrawer();`。同时移除不再使用的 `renderHomeView` import。
- `homeView.js`：补 `detailPanelOpen=true` 与 `saveState()`，与 channelTree 完全对齐（防抽屉被折叠后点用户条不展开）。

**涉及文件**：`src/shell/channelTree.js`、`src/dialogs/homeView.js`

---

### M3. Chat ↔ Work 模式切换不同步主区
**根因**：`appRail.js` 的 `bindAppIcons` 切换模式后只 `renderAppRail + renderChannelTree`，不重渲染 `#chat-main`，导致「频道树是 Chat、主区是看板」错位。

**修复**：`bindAppIcons` 在 `renderChannelTree()` 后按模式同步主区：
- Chat 模式：`currentChatId` 非空 → `await renderChatView(currentChatId)`；否则显示「选择一个频道」空态。
- Work 模式：`currentChatId` 为空时显示「选择一个协作频道」空态（非空时 renderChannelTree 已触发 renderMain）。

**涉及文件**：`src/shell/appRail.js`

---

### M4. 消息无右键菜单
**根因**：`message.js` 的 `bindMessageActions` 只绑了 hover 英文小字按钮，无 `contextmenu` 事件，不符合桌面 IM 习惯。

**修复**：`src/chat/message.js`：
- 新增 `import { showContextMenu } from "../dialogs/contextMenu.js"`
- 在 `bindMessageActions` 末尾给每个 `.msg` 绑定 `contextmenu`，调用 `showContextMenu`，包含：复制文本 / 回复 / 置顶 / 👍 反应 / 转 Card / 删除（仅 is_out）。复用现有 IPC 调用（`toggle_pin`/`send_reaction`/`message_to_card`/`delete_msg`）与 `composer:set-reply` 事件。

**涉及文件**：`src/chat/message.js`

---

### M5. 看板卡片状态切换用无标签小圆点
**根因**：`kanban.js:122-126` 三个 `·` 按钮仅靠 `title` 属性和 active 高亮区分，无文字标签，可发现性极低。

**修复**：
- `src/work/kanban.js`：`renderCard` 的三个按钮文本从 `·` 改为 `Todo` / `Doing` / `Done`。
- `src/styles.css`：`.card-status-btn` 从 `width:18px; height:6px` 小条改为 `flex:1; padding:3px 6px` 带 9px 文字的 segmented control；`.active` 用反色（`background:var(--text); color:var(--bg)`）。

**涉及文件**：`src/work/kanban.js`、`src/styles.css`

---

### M6. 新建频道入口只有右键分类
**根因**：`channelTree.js:155-164` 创建频道唯一途径是右键 `.ct-category`，无 + 图标，新用户无法发现。

**修复**：
- `src/shell/channelTree.js`：`.ct-category` 行右侧从单个箭头改为 `.ct-cat-actions` 容器（含 `.ct-cat-add` + 图标 + `.ct-cat-arrow` 箭头）。绑定 `.ct-cat-add` 点击 → `openChannelCreateDialog(cat, ...)`，`e.stopPropagation()` 防触发折叠。
- `src/styles.css`：新增 `.ct-cat-actions` / `.ct-cat-add`（hover 变色 + 圆角）/ `.ct-cat-arrow` 规则。

**涉及文件**：`src/shell/channelTree.js`、`src/styles.css`

---

### M7. 看板列内添加卡片不区分列状态
**根因**：`kanban.js:104` 的 `+ 添加卡片` 调 `window.__newCard(chatId)` 不传 status；`__newCard` 调 `create_card` 也不传 status，新卡片总进 Todo 列。

**修复**：
- `src/work/kanban.js`：`renderColumn` 的 add 按钮改为 `onclick="window.__newCard(${chatId}, '${status}')"`。
- `window.__newCard(cid, status)`：接收 status 参数；`create_card` 总是建为 `todo`，若目标列非 `todo` 且 `card.id` 存在，追加一次 `update_card({ cardId, status })` 把状态切到目标列。

**涉及文件**：`src/work/kanban.js`

---

### M8. 卡片详情无关闭按钮
**根因**：`rightDrawer.js` 的 work+card 分支提前 `return` 跳过折叠按钮渲染，`cardDetail.js` 也无 ✕，用户被详情面板「困住」。

**修复**：
- `src/work/cardDetail.js`：顶部 `.detail-tabs` 内加 `<span class="detail-flex"></span><span class="detail-close" id="card-close">✕</span>`；绑定 click → `state.currentCardId=null; state.rightDrawerOpen=false; saveState(); renderRightDrawer();`（清卡片选中 + 收起抽屉，回到全宽看板）。
- `src/work/cardDetail.js`：新增 `import { saveState } from "../persist.js"`。
- `src/styles.css`：新增 `.detail-flex` (flex:1) 与 `.detail-close`（弱色 + hover 变色 + 圆角）规则。

**涉及文件**：`src/work/cardDetail.js`、`src/styles.css`

---

### M9. 输入框无法发送附件（跳过）
后端 `send_file` 命令未实现，超出本次修复范围。按任务要求跳过。

---

## 验证

- `npm run build`：✓ 通过（exit 0，415ms，仅 pre-existing 动/静态 import 警告，与本次改动无关）
- Chat 模式消息收发 / 频道切换路径未改动，保持正常
- Work 模式看板 → 卡片 → 详情 → ✕ 关闭 全链路打通
- 切 ws / 切 mode 不再弹设置抽屉，主区随模式同步

## 涉及文件汇总

| 文件 | 修复项 |
|------|--------|
| `src/work/kanban.js` | C1, M5, M7 |
| `src/work/cardDetail.js` | C1, M8 |
| `src/shell/rightDrawer.js` | C1 |
| `src/shell/appRail.js` | M1, M3 |
| `src/shell/channelTree.js` | M2, M6 |
| `src/dialogs/homeView.js` | M2 |
| `src/chat/message.js` | M4 |
| `src/styles.css` | C2, M5, M6, M8 |
