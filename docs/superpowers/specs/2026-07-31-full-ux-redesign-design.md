# 全面 UX 重设计:QQ NT + Discord 混合分页导航

**日期**:2026-07-31
**状态**:已批准,待实现计划
**关联**:基于 `2026-07-31-sidebar-redesign-design.md` 扩展为全面 UX 重设计

---

## 背景与动机

当前 peytchat UX 存在系统性问题,用户反馈"无法操作而且我不理解操作逻辑":

1. **导航混乱**:rail 用 `Ch/Wk/In` 文字缩写 + workspace 图标列混合,不符合主流软件习惯
2. **模式切换不直观**:`currentApp` + `homeMode` 双变量,用户不知道自己在哪
3. **workspace 概念暴露**:用户反馈"什么是 workspace",造成认知负担
4. **设置藏在右侧抽屉**:不符合桌面软件惯例(QQ NT/Discord 都有独立设置页)
5. **弹窗过多**:homePlus/wsWizard/channelCreate/peytInvite/confirm/prompt 等大量弹窗打断操作流
6. **操作不可发现**:消息操作隐藏、频道操作少、新建流程分散
7. **整体不符合日常软件习惯**:与 Discord/QQ NT 等主流 IM 差距大

**目标**:参考 Discord 频道组织 + QQ NT 分页导航,全面重构为 4 页 SVG 图标导航,弱化 workspace 概念,零弹窗交互,使操作逻辑直观易用。同时将前端从 JS 全量迁移到 TypeScript。

---

## 设计决策汇总

### 核心方案:方案 A(4 页分栏 + ws 隐藏式 + 零弹窗交互)

- **rail**:4 个 SVG 图标(消息/群组/协作/设置)+ 底部头像,中间留空
- **nav panel**:按当前页渲染对应导航内容
- **main content**:按当前页渲染主内容
- **detail panel**:页1/2 显示成员/置顶,页3 显示卡片详情,页4 隐藏
- **零弹窗**:所有操作通过下拉菜单、内联展开、右键菜单、hover 浮层完成
- **workspace 隐藏**:单 ws 时用户完全看不到 workspace 概念

### 关键约束

1. **全局禁止 emoji**:所有 UI 中的 emoji 替换为 SVG 图标(lucide 图标库)
2. **反应符号保留**:消息反应的 ↑/+/★/! 是固定符号集(非 emoji),保留
3. **零弹窗**:禁止任何 modal overlay/confirm()/prompt() 弹窗,系统文件选择器除外
4. **不允许伪代码**:所有实现必须是真实可用的,TypeScript 类型注解完整,禁止 `any`
5. **TypeScript 全量迁移**:`src/**/*.js` → `src/**/*.ts`,一次性完成
6. **保持美观高级质感**:黑白配色,线性 SVG 图标,Material Design 3 Expressive

### 参考标杆

- **QQ NT**:4 页 SVG 图标分页导航(消息/联系人/空间/设置)
- **Discord**:频道组织(分类折叠 + # 前缀)、消息 hover 操作、右键菜单、内联创建

---

## 整体布局

```
┌──────┬────────────┬──────────────────────┬──────────┐
│ rail │ nav panel  │ main content         │ detail   │
│ 56px │ 240px      │ flex                 │ 300px    │
│      │            │                      │ (可折叠)  │
└──────┴────────────┴──────────────────────┴──────────┘
```

- **rail**(56px):4 个 SVG 页面图标 + 底部头像,中间留空
- **nav panel**(240px):按当前页渲染对应导航内容
- **main content**(flex):按当前页渲染主内容
- **detail panel**(300px,可折叠):页1/页2 显示 members/pin,页3 显示卡片详情,页4 隐藏

---

## Rail 设计(56px)

从上到下:

1. **消息页图标**:SVG 对话气泡(lucide `message-circle`),active 时填充高亮
2. **群组页图标**:SVG 人群(lucide `users`)
3. **协作页图标**:SVG 看板方格(lucide `layout-grid`)
4. **分隔线**
5. **留空**(仅多 ws 时此处显示 ws 切换入口,单 ws 时完全空白)
6. **flex 占位**
7. **设置页图标**:SVG 齿轮(lucide `settings`)
8. **底部头像**:点击弹出用户菜单(主题切换/账号设置/登出)

**图标规格**:24x24,线性风格(stroke-width 1.5),active 态填充。hover 态背景变化。

**状态管理**:
```typescript
type Page = 'messages' | 'groups' | 'work' | 'settings';
interface AppState {
  currentPage: Page;  // 替代原 currentApp + homeMode
  // ...
}
```

---

## 页1:消息(Messages)

**定位**:所有非 workspace 的聊天——单聊、私聊、非 ws 群组、联系人请求。

### nav panel(240px)

- **header**:「消息」标题 + 副标题「私聊与非 workspace 群」+ 右侧 `+` 按钮(新建下拉菜单)
- **聊天列表**:每项显示头像 + 名称 + 最后消息 + 时间 + 未读角标
- **底部**:自己的头像 + 名称 + 角色(点击打开用户菜单)

### 新建下拉菜单(零弹窗)

点击 nav header 的 `+` 按钮,弹出下拉菜单(非全屏弹窗),包含:

- 添加好友(邮箱)— 选择后 nav 顶部内联展开邮箱输入框
- 通过 QR 加入 — 选择后 nav 顶部内联展开 QR 链接输入框
- 创建群 — 选择后 nav 顶部内联展开群名输入框
- 加入 PEYT Studio — 选择后调用 `join_peyt_studio` 命令

点击菜单外部或 Esc 关闭。选择项后,下拉菜单关闭,在 nav panel 的聊天列表顶部内联展开输入框(替换列表第一项位置,Enter 创建 / Esc 取消,创建后新会话出现在列表顶部并自动选中)。

### 数据源

`get_chatlist` 返回的 chats,过滤掉所有属于 workspace 的 chat_id:
```typescript
const wsChatIds = new Set<number>(
  state.workspaces.flatMap(ws => [
    ws.master_chat_id,
    ...state.channels
      .filter(ch => ch.workspace_id === ws.id)
      .map(ch => ch.chat_id)
  ])
);
const messages = chats.filter(c => !wsChatIds.has(c.chat_id));
```

### 主区

选中聊天后显示 `renderChatView`(消息流 + composer)。

### 交互

- 点击聊天项 → 主区消息流,nav active 高亮
- `+` 按钮 → 下拉菜单(添加好友/QR/创建群/加入PEYT)
- 右键聊天项 → 上下文菜单(查看资料/屏蔽/删除会话)
- 底部头像 → 用户菜单(主题/账号设置/登出)

---

## 页2:群组(Groups)

**定位**:当前 workspace 的聊天频道(space_type=chat)。弱化 ws 概念——单 ws 时用户只看到频道列表。

### nav panel(240px)

- **header**:当前 ws 名称(如「PEYT Studio」)+ 成员数
  - **仅当 `state.workspaces.length > 1` 时**:header 可点击,展开 ws 切换下拉(显示所有 ws + 创建/加入入口)
  - **单 ws 时**:纯展示,不可点击,不显示切换入口
- **分类折叠列表**:按 `category` 分组,每组可折叠,右侧 `+` 内联创建频道
- **频道项**:`#` SVG 图标 + 频道名 + 未读角标 + active 高亮
- **底部**:自己的头像 + 名称 + 角色

### ws 切换下拉(多 ws 时)

多 workspace 时,点击 nav header 展开 ws 切换下拉:

- 显示所有 ws 列表(图标 + 名称 + 成员数)
- 当前 ws 高亮
- 分隔线
- 创建新团队(内联展开团队名输入框)
- 加入团队(内联展开 QR 链接输入框)

单 ws 时 header 纯展示,不可点击,用户看不到 workspace 概念。

### 内联创建频道(零弹窗)

点击分类右侧的 `+` 图标,在该分类下方内联展开输入框:

```
WORK ▾                    [+]
  [设计评审              ]  ← 内联输入框
  Enter 创建 · Esc 取消 · 分类:WORK
  # 工作频道1
  # 工作频道2
```

- Enter 创建频道(调用 `create_channel` 命令)
- Esc 取消,收起输入框
- 创建后频道出现在该分类下,自动选中

### 数据源

`list_channels(currentWsId)` 返回的频道,过滤 `space_type=chat`:
```typescript
const groupChannels = state.channels.filter(
  ch => ch.workspace_id === state.currentWsId && getSpaceType(ch.chat_id) === 'chat'
);
```

### 主区

选中频道后 `renderChatView`(消息流 + composer)。

### 频道右键菜单

右键频道项弹出上下文菜单:

- 频道信息(切换到 detail panel 的频道信息)
- 静音(切换静音状态)
- 置顶(置顶频道,排到分类顶部)
- 标记已读(清除未读)
- 复制邀请链接(复制 SecureJoin QR)
- ---分隔线---
- 离开频道(红色,内联确认后调用 `leave_channel`)

点击外部或 Esc 关闭。

### 交互

- 点击频道 → 主区消息流
- 点击分类 → 折叠/展开(状态持久化到 localStorage)
- 分类右侧 `+` → 内联创建频道
- 右键频道 → 上下文菜单
- 右键分类 → 内联创建频道
- 多 ws 时点击 header → ws 切换下拉

---

## 页3:协作(Work)

**定位**:当前 workspace 的协作频道(space_type=card),主区显示看板/列表视图。

### nav panel(240px)

- **header**:「协作」标题 + 当前 ws 名称(同页2 的 ws 切换逻辑)
- **协作频道列表**:每项显示 SVG 看板图标 + 频道名 + 未读角标 + active 高亮
- **空态**:无协作频道时显示引导「暂无协作频道,在群组页右键分类可创建协作频道」
- **底部**:自己的头像 + 名称

### 数据源

`list_channels(currentWsId)` 过滤 `space_type=card`:
```typescript
const workChannels = state.channels.filter(
  ch => ch.workspace_id === state.currentWsId && getSpaceType(ch.chat_id) === 'card'
);
```

### 主区

选中协作频道后:
- **默认看板视图**(`renderKanban`):三列 Todo/In Progress/Done,卡片可切状态
- **视图切换 tab**:看板 ⇄ 列表(顶部,已实现)

### 卡片内联创建(零弹窗)

点击看板列底部"+ 添加卡片",在该列内联展开输入框:

```
┌─ TODO ────────── 2 ─┐
│ [卡片1]              │
│ ┌──────────────────┐ │
│ │ SP6 Inbox 设计   │ │  ← 内联输入框
│ │ [创建] [取消]    │ │
│ └──────────────────┘ │
│ + 添加卡片           │
└──────────────────────┘
```

- Enter 创建卡片(调用 `create_card`,默认 status="todo")
- Esc 取消,收起输入框
- 创建后卡片出现在该列底部
- 若目标列非 todo,创建后追加 `update_card` 改状态

替代原有 `prompt()` 弹窗。

### 右侧详情面板

选中卡片时显示卡片详情(标题/描述/状态/负责人/截止日期),可编辑。顶部有 SVG 关闭按钮(`x` 图标)。

### 交互

- 点击协作频道 → 主区看板
- 点击卡片 → 右侧详情展开 + 卡片 active
- 卡片状态切换:Todo/Doing/Done 分段控件
- 列内 `+` → 内联创建卡片
- 消息右键"转 Card" → 将消息转为卡片

### 与页2的关系

- 页2 和页3 **共享** `state.currentWsId`,切换 ws 时两个页面都更新
- `state.currentChatId` 独立——在页2 选了聊天频道,切到页3 不会显示该频道的看板

---

## 页4:设置(Settings)

**定位**:完整设置面板,占据主区(不再放在右侧抽屉)。

### nav panel(240px)

设置项导航列表(类似 macOS 系统设置侧栏):

- 账号(SVG `user` 图标)
- 外观(SVG `palette` 图标)
- 当前团队(SVG `users` 图标)
- 通知(SVG `bell` 图标)
- 关于(SVG `info` 图标)

### 主区

按选中的设置项显示对应 section:

1. **账号**:头像 + 显示名 + 邮箱 + 修改头像/改名
   - 头像修改:点击头像后内联展开"上传/移除"选项,选择上传后打开系统文件选择器(不算弹窗),选择后即时生效
   - 显示名:内联可编辑文本框,失焦保存
2. **外观**:主题切换(Nowint/Violet/GoldenHour)三个色块预览,点击即时生效
3. **当前团队**:当前 ws 信息(名称/成员/频道数)+ 退出团队/切换团队入口 + PEYT Studio 邀请链接(可复制)
   - 退出团队:内联确认后调用 `leave_channel` 离开 master 群
4. **通知**:桌面通知开关、Dock 角标开关(toggle switch)
5. **关于**:版本号、登出按钮(内联确认后调用 `logout`)

### 右侧详情面板

设置页不使用详情面板,隐藏(`collapsed` 类)。

### 交互

- 点击 nav 项 → 主区切换 section
- 主题切换即时生效
- 头像点击 → 内联选项 → 文件选择器
- 登出 → 内联确认 → 退出登录

---

## 零弹窗交互模式(核心设计)

### 1. 下拉菜单(Dropdown)

**场景**:新建入口(添加好友/QR/创建群/加入PEYT)、ws 切换

**实现**:点击触发元素后,在元素下方/右方弹出绝对定位的下拉菜单。菜单项点击后执行操作并关闭菜单。点击菜单外部或按 Esc 关闭菜单。

**与弹窗区别**:下拉菜单是轻量级浮层,锚定在触发元素附近,不遮挡整个界面,点击外部即关闭。弹窗是全屏 overlay,强制用户交互后才能继续。

### 2. 内联展开(Inline Expand)

**场景**:创建频道、创建卡片、修改显示名、修改头像选项

**实现**:点击触发元素后,在原位置展开输入框/选项区,替换或插入到 DOM 中。Enter 确认/Esc 取消,确认后调用后端命令并刷新列表。

**与弹窗区别**:内联展开在用户当前焦点位置展开,不打断用户视线,不遮挡其他内容。

### 3. 右键菜单(Context Menu)

**场景**:频道操作、消息操作

**实现**:右键元素时,在鼠标位置弹出绝对定位的菜单。菜单项点击后执行操作。点击菜单外部或按 Esc 关闭。

### 4. Hover 浮层(Hover Popover)

**场景**:消息操作按钮(反应/回复/置顶/更多)

**实现**:鼠标悬停在消息上时,消息右上角浮出操作按钮组(`opacity: 0` → `opacity: 1` 过渡)。鼠标移出消息时按钮消失。

### 5. 内联确认(Inline Confirm)

**场景**:删除消息、删除卡片、离开频道、登出

**实现**:点击删除按钮后,原内容区域变为内联确认状态(红底),显示"确认删除? 确认/取消"。3 秒后自动取消。确认后执行删除,右下角 toast 显示"已删除 撤销"按钮,5 秒内可撤销。

**与 confirm() 区别**:不弹浏览器原生对话框,不阻塞主线程,在原位置确认,支持撤销。

### 6. Nav Banner

**场景**:首次登录 PEYT Studio 欢迎引导

**实现**:首人登录后,nav panel 顶部显示欢迎 banner(非弹窗),提示分享邀请链接。banner 不影响主区,用户可立即使用。点击"复制邀请"复制链接,点击 `x` 关闭 banner。

**与弹窗区别**:banner 是 nav panel 的一部分,不遮挡主区,不强制交互。

### 7. 文件选择器(允许)

**场景**:头像上传

**实现**:点击"上传"选项后调用 `<input type="file">` 的 `click()` 方法打开系统文件选择器。系统文件选择器不算弹窗(是操作系统原生 UI)。选择文件后即时上传生效。

---

## 消息交互细节

### 消息 hover 操作

鼠标悬停在消息上时,右上角浮出操作按钮组:

- **反应按钮**(SVG `smile`):点击弹出符号选择(↑/+/★/!),点击即发送反应
- **回复按钮**(SVG `reply`):点击后在 composer 上方显示回复预览
- **置顶按钮**(SVG `pin`):点击切换置顶状态
- **更多按钮**(SVG `plus`):点击弹出右键菜单(复制/转发/转Card/删除)

### 消息右键菜单

右键消息弹出上下文菜单:

- 回复
- 置顶/取消置顶
- 复制文本
- 转发
- 转 Card(仅在 ws 频道可用)
- ---分隔线---
- 删除(仅自己消息,红色,内联确认)

### 反应面板

点击消息 hover 操作中的反应按钮,在按钮下方弹出符号选择:

- ↑(上箭头)
- +(加号)
- ★(星号)
- !(感叹号)

点击符号即发送反应。已发送的反应显示为消息下方的胶囊(`↑ 2`),再次点击取消自己的反应。胶囊样式:有自己反应的高亮(`mine` 类)。

### @提及 / #频道引用

在 composer 输入 `@` 后,上方内联弹出成员建议列表:

- 显示当前频道成员(头像 + 名字)
- 键盘上下选择,Enter 确认
- 选中后插入 `@名字` mention 标签(可点击跳转到成员详情)

输入 `#` 后弹出频道建议列表(当前 ws 的频道),选中后插入 `#频道名` 引用标签(可点击跳转到频道)。

### 代码块渲染

消息中的代码块(```...```)使用 highlight.js 渲染语法高亮。行内代码(`` `...` ``)用等宽字体 + 背景色标注。

---

## 技术实现

### TypeScript 全量迁移

**策略**:一次性全量迁移(非渐进式),因为导航架构变化大,渐进式会产生中间态混乱。

**范围**:
- `src/**/*.js` → `src/**/*.ts`
- `state.js` → `state.ts`:定义明确的 interface
- 所有模块添加类型注解
- 禁止 `any`,禁止伪代码
- Vite 配置调整支持 TS

**类型定义**:
```typescript
type Page = 'messages' | 'groups' | 'work' | 'settings';
type SettingsSection = 'account' | 'appearance' | 'team' | 'notifications' | 'about';
type SpaceType = 'chat' | 'card';

interface WorkspaceDto {
  id: number;
  name: string;
  master_chat_id: number;
  icon: string | null;
  created_at: number;
}

interface ChannelDto {
  id: number;
  workspace_id: number;
  chat_id: number;
  name: string;
  category: string;
  position: number;
  topic: string | null;
  unread: number;
}

interface MsgDto {
  msg_id: number;
  chat_id: number;
  from_id: number;
  from_name: string;
  text: string;
  ts: number;
  state: 'pending' | 'delivered' | 'failed' | 'read';
  // 附件字段
  view_type: string | null;
  file: string | null;
  // ... 其他字段
}

interface CardDto {
  id: number;
  workspace_id: number;
  channel_chat_id: number;
  msg_id: number | null;
  type: 'card' | 'task';
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'done';
  assignee_contact_id: number | null;
  assignee_name: string | null;
  due_date: number | null;
  created_at: number;
}

interface SelfProfile {
  id: number;
  name: string;
  addr: string;
  avatar: string | null;
  color: number | null;
}

interface AppState {
  // 页面导航
  currentPage: Page;
  currentSettingsSection: SettingsSection;
  
  // workspace 与频道
  currentWsId: number | null;
  currentChatId: number | null;
  workspaces: WorkspaceDto[];
  channels: ChannelDto[];
  
  // 消息
  messages: MsgDto[];
  messagesOldestId: number | null;
  noMoreMsgs: boolean;
  currentMembers: MemberDto[];
  
  // 卡片
  cards: CardDto[];
  currentCardId: number | null;
  currentView: 'kanban' | 'list';
  
  // UI 状态
  rightDrawerOpen: boolean;
  detailPanelOpen: boolean;
  
  // 其他
  self: SelfProfile | null;
  roles: RoleDto[];
  wsMembers: Record<number, number>;
  collapsedCategories: Record<number, Record<string, boolean>>;
  searchOpen: boolean;
}
```

### SVG 图标系统

**方案**:使用 `lucide` npm 包(轻量、线性风格、符合高级质感)。

**安装**:`npm install lucide`

**用法**:
```typescript
import { MessageCircle, Users, LayoutGrid, Settings, User, Palette, Bell, Info, Plus, X, Hash, Reply, Pin, Copy, Trash, Smile, ChevronDown, Check, Send } from 'lucide';

// 创建图标元素
const icon = MessageCircle.toSvg({ width: 24, height: 24, 'stroke-width': 1.5 });
```

**需要替换的位置**:
- rail 的所有页面图标(message-circle/users/layout-grid/settings)
- nav panel 的 `+` 符号 → `plus` SVG
- nav panel 的 `#` 文字 → `hash` SVG
- nav panel 的 `▣` 文字 → `layout-grid` SVG
- 协作频道前缀 → `layout-grid` SVG
- 关闭按钮的 `✕` → `x` SVG
- 设置项的图标(user/palette/users/bell/info)
- 消息操作按钮(smile/reply/pin/plus)
- 右键菜单图标(info/bell/pin/check/copy/x)
- 用户菜单图标
- PEYT 欢迎消息中的 emoji → 移除(纯文字)

### 文件结构变更

```
src/
  shell/
    rail.ts          # 替代 appRail.js,4 页 SVG 图标
    navPanel.ts      # 替代 channelTree.js,按 currentPage 渲染对应 nav
    rightDrawer.ts   # 详情面板(保留,逻辑调整)
  pages/
    messagesPage.ts  # 页1(替代 homeView.js)
    groupsPage.ts    # 页2(channelTree.js 的 chat 分支)
    workPage.ts      # 页3(channelTree.js 的 work 分支 + renderMain)
    settingsPage.ts  # 页4(替代 settingsPanel.js)
  chat/              # 消息相关(保持,迁移到 TS)
    chatView.ts
    composer.ts
    message.ts
  work/              # 看板相关(保持,迁移到 TS)
    kanban.ts
    list.ts
    cardDetail.ts
  components/        # 共享组件
    avatar.ts
    contextMenu.ts
    dropdown.ts      # 新增:下拉菜单组件
    inlineInput.ts   # 新增:内联输入组件
    inlineConfirm.ts # 新增:内联确认组件
    toast.ts
    userMenu.ts
    navBanner.ts     # 新增:nav banner 组件
  state.ts           # 状态管理
  api.ts             # Tauri IPC 封装
  theme.ts           # 主题系统
  persist.ts         # 状态持久化
  main.ts            # 入口
```

### 状态管理变更

**移除**:
- `currentApp`(被 `currentPage` 替代)
- `homeMode`(被 `currentPage === 'messages'` 替代)
- `rightDrawerTab`(设置不再在抽屉,members/pin 逻辑移到页内)

**新增**:
- `currentPage: Page`
- `currentSettingsSection: SettingsSection`

**保留**:
- `currentWsId`、`currentChatId`、`workspaces`、`channels` 等

### 右侧详情面板处理

- **页1/页2**:保留 members/pin 内容,通过 chatView 主区头部的 `act-pin`/`act-info` 按钮触发开关。点击 `act-info` 显示成员列表,点击 `act-pin` 显示置顶消息。移除原 `rightDrawerTab='settings'` 分支(设置移到页4)。两个按钮互斥,点击一个关闭另一个。
- **页3**:卡片详情,SVG 关闭按钮
- **页4**:隐藏(`collapsed` 类)

### 首次登录流程变更

**移除**:`peytInvite.js` 弹窗对话框

**替换为**:nav panel 顶部 banner

- 首人登录后,`ensure_peyt_studio` 返回 `role: "founder"`
- 在 nav panel 顶部显示欢迎 banner:
  ```
  ┌─────────────────────────┐
  │ ✓ PEYT Studio 已就绪     │
  │   分享邀请链接给同事加入  │
  │   [复制邀请] [查看频道]   │  [x]
  └─────────────────────────┘
  ```
- 点击"复制邀请"调用 `navigator.clipboard.writeText(invite_qr)`,toast 提示"已复制"
- 点击"查看频道"关闭 banner,跳转到群组页第一个频道
- 点击 `x` 关闭 banner(状态持久化,不再显示)
- banner 不阻塞主区,用户可立即使用

### emoji 清理清单

| 位置 | 原 emoji | 替换为 |
|------|----------|--------|
| PEYT 欢迎消息 | 👋 | 移除(纯文字) |
| rail 页面图标 | Ch/Wk/In 文字 | lucide SVG 图标 |
| nav panel 新建 | + 文字 | lucide `plus` SVG |
| 频道名前缀 | # 文字 | lucide `hash` SVG |
| 协作频道前缀 | ▣ 文字 | lucide `layout-grid` SVG |
| 关闭按钮 | ✕ 文字 | lucide `x` SVG |
| 设置项图标 | 无 | lucide 对应 SVG |
| 消息操作按钮 | 无 | lucide 对应 SVG |
| 右键菜单图标 | 无 | lucide 对应 SVG |
| 分类折叠箭头 | ▸/▾ | lucide `chevron-down`/`chevron-right` SVG |
| 反应符号 | ↑/+/★/! | **保留**(固定符号集,非 emoji) |

---

## 不在本次范围内

- 后端 Rust 代码不变(除可能的 PEYT Studio 调整)
- deltachat core 不变
- 看板/列表/卡片详情的业务逻辑不变(仅迁移到 TS + 内联创建优化)
- 消息渲染逻辑不变(仅迁移到 TS + hover 操作优化)
- 主题系统不变(仅迁移到 TS)
- 收发消息核心逻辑不变(SP4 已修复)

---

## 验收标准

### 导航结构
1. rail 显示 4 个 SVG 图标 + 底部头像,点击切换页面
2. 页1 显示非 ws 聊天列表,点击进入消息流
3. 页2 显示当前 ws 的聊天频道,点击进入消息流
4. 页3 显示协作频道,点击进入看板
5. 页4 显示设置面板,分 section 可切换
6. 单 ws 时无 workspace 切换入口可见
7. 多 ws 时页2/页3 顶部可切换 ws

### 零弹窗交互
8. 新建入口用下拉菜单(非弹窗)
9. 创建频道用内联展开输入框(非弹窗)
10. 创建卡片用列内联输入框(非 prompt)
11. 删除操作用内联确认 + toast 撤销(非 confirm)
12. 首次登录用 nav banner(非弹窗)
13. 头像修改用内联选项 + 文件选择器(非弹窗)

### 消息交互
14. 消息 hover 显示操作按钮(反应/回复/置顶/更多)
15. 消息右键菜单完整(回复/置顶/复制/转发/转Card/删除)
16. 反应面板显示 ↑/+/★/! 符号
17. @提及建议列表可用
18. #频道引用建议列表可用
19. 代码块语法高亮

### 频道交互
20. 频道右键菜单完整(信息/静音/置顶/标记已读/复制邀请/离开)
21. 分类折叠/展开可持久化
22. 分类右侧 + 内联创建频道

### TypeScript 迁移
23. 全局无 emoji(反应符号除外)
24. 所有 `.js` 文件迁移为 `.ts`,类型完整,无 `any`
25. `npm run build` 和 `cargo build` 通过

### 视觉一致性
26. 黑白配色,线性 SVG 图标
27. Material Design 3 Expressive 风格
28. 所有 SVG 图标 stroke-width 1.5,active 态填充
