# 侧边栏重构设计：QQ NT 风格分页导航

**日期**：2026-07-31
**状态**：已批准，待实现计划
**关联**：SP4/SP5 既有实现的导航重构

---

## 背景与动机

当前侧边栏 UX 存在严重问题：

1. **workspace 概念不直观**：用户反馈"什么是 workspace"，说明这个概念对普通用户造成了认知负担
2. **Chat/Work 模式切换不直观**：用户不理解为什么要切换模式，模式切换后主区不同步导致界面错位
3. **rail 使用文字缩写**：`Ch/Wk/In` 不符合主流软件习惯，可发现性差
4. **设置藏在右侧抽屉**：不符合桌面软件惯例（QQ NT/Discord 都有独立设置页）
5. **整体操作逻辑不符合日常软件习惯**：用户反馈"无法操作而且我不理解操作逻辑"

**目标**：参考 QQ NT 分页逻辑 + Discord 频道组织，重构为 4 页 SVG 图标导航，弱化 workspace 概念，使操作逻辑直观易用。同时将前端从 JS 全量迁移到 TypeScript，提升代码质量。

---

## 设计决策

### 方案选择：方案 A（4 页分栏 + ws 隐藏式）

**rail 顶部 4 个 SVG 图标**（消息/群组/协作/设置），底部头像，中间留空。页2 顶部仅当多 ws 时才显示 ws 切换栏——单 ws 用户完全看不到 workspace 概念。

**否决方案**：
- 方案 B（rail 保留 ws 图标列）：概念负担重，用户已表示不理解 workspace
- 方案 C（合并群组与协作为 3 页）：看板和消息切换逻辑会混乱

### 关键约束

1. **全局禁止 emoji**：所有 UI 中的 emoji 替换为 SVG 图标（lucide 图标库）
2. **反应符号保留**：消息反应的 ↑/+/★/! 是固定符号集（非 emoji），符合原 mockup 设计，保留
3. **不允许伪代码**：所有实现必须是真实可用的，TypeScript 类型注解完整，禁止 `any`
4. **TypeScript 全量迁移**：`src/**/*.js` → `src/**/*.ts`，一次性完成（非渐进式）
5. **保持美观高级质感**：黑白配色，线性 SVG 图标，Material Design 3 Expressive

---

## 整体布局

```
┌──────┬────────────┬──────────────────────┬──────────┐
│ rail │ nav panel  │ main content         │ detail   │
│ 56px │ 240px      │ flex                 │ 300px    │
│      │            │                      │ (可折叠)  │
└──────┴────────────┴──────────────────────┴──────────┘
```

- **rail**（56px）：4 个 SVG 页面图标 + 底部头像，中间留空
- **nav panel**（240px）：按当前页渲染对应导航内容
- **main content**（flex）：按当前页渲染主内容
- **detail panel**（300px，可折叠）：页1/页2 显示 members/pin/settings，页3 显示卡片详情，页4 隐藏

---

## Rail 设计（56px）

从上到下：

1. **消息页图标**：SVG 对话气泡（lucide `message-circle`），active 时填充高亮
2. **群组页图标**：SVG 人群/井号（lucide `hash` 或 `users`）
3. **协作页图标**：SVG 看板/方格（lucide `layout-grid` 或 `trello`）
4. **分隔线**
5. **留空**（仅多 ws 时此处显示 ws 切换入口，单 ws 时完全空白）
6. **flex 占位**
7. **设置页图标**：SVG 齿轮（lucide `settings`）
8. **底部头像**：点击弹出用户菜单（主题切换/账号设置/登出）

**图标规格**：24x24，线性风格（stroke-width 1.5），active 态填充。hover 态背景变化。

**状态管理**：
```typescript
type Page = 'messages' | 'groups' | 'work' | 'settings';
interface AppState {
  currentPage: Page;  // 替代原 currentApp + homeMode
  // ...
}
```

---

## 页1：消息（Messages）

**定位**：所有非 workspace 的聊天——单聊、私聊、非 ws 群组、联系人请求。

### nav panel（240px）

- **header**：「消息」标题 + 右侧 `+` 按钮（新建：添加好友/创建群/扫码加入）
- **聊天列表**：每项显示头像 + 名称 + 最后消息 + 时间 + 未读角标
- **底部**：自己的头像 + 名称（点击打开用户菜单）

### 数据源

`get_chatlist` 返回的 chats，过滤掉所有属于 workspace 的 chat_id：
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

选中聊天后显示 `renderChatView`（消息流 + composer）。

### 交互

- 点击聊天项 → 主区消息流，nav active 高亮
- `+` 按钮 → `homePlus` 菜单（添加好友/创建群/扫码加入 PEYT）
- 右键聊天项 → 上下文菜单（查看资料/屏蔽/删除会话）
- 底部头像 → 用户菜单（主题/账号设置/登出）

---

## 页2：群组（Groups）

**定位**：当前 workspace 的聊天频道（space_type=chat）。弱化 ws 概念——单 ws 时用户只看到频道列表。

### nav panel（240px）

- **header**：当前 ws 名称（如「PEYT Studio」）+ 成员数
  - **仅当 `state.workspaces.length > 1` 时**：header 可点击，展开 ws 切换下拉
  - **单 ws 时**：纯展示，不可点击，不显示切换入口
- **分类折叠列表**：按 `category` 分组，每组可折叠，右侧 `+` 新建频道
- **频道项**：`# 频道名` + 未读角标 + active 高亮（`#` 用 SVG `hash` 图标替代）
- **底部**：自己的头像 + 名称 + 角色

### 数据源

`list_channels(currentWsId)` 返回的频道，过滤 `space_type=chat`：
```typescript
const groupChannels = state.channels.filter(
  ch => ch.workspace_id === state.currentWsId && getSpaceType(ch.chat_id) === 'chat'
);
```

### 主区

选中频道后 `renderChatView`（消息流 + composer）。

### 交互

- 点击频道 → 主区消息流
- 点击分类 → 折叠/展开
- 分类右侧 `+` → 新建频道弹窗
- 右键频道 → 频道设置/离开频道
- 右键分类 → 新建频道
- 多 ws 时点击 header → ws 切换下拉（显示所有 ws + 创建/加入入口）

---

## 页3：协作（Work）

**定位**：当前 workspace 的协作频道（space_type=card），主区显示看板/列表视图。

### nav panel（240px）

- **header**：「协作」标题 + 当前 ws 名称（同页2 的 ws 切换逻辑）
- **协作频道列表**：每项显示 SVG 看板图标 + 频道名 + 未读角标 + active 高亮
- **空态**：无协作频道时显示引导「暂无协作频道，在群组页右键分类可创建协作频道」
- **底部**：自己的头像 + 名称

### 数据源

`list_channels(currentWsId)` 过滤 `space_type=card`：
```typescript
const workChannels = state.channels.filter(
  ch => ch.workspace_id === state.currentWsId && getSpaceType(ch.chat_id) === 'card'
);
```

### 主区

选中协作频道后：
- **默认看板视图**（`renderKanban`）：三列 Todo/Doing/Done，卡片可切状态
- **视图切换 tab**：看板 ⇄ 列表（顶部，已实现）

### 右侧详情面板

选中卡片时显示卡片详情（标题/描述/状态/负责人/截止日期），可编辑。顶部有 SVG 关闭按钮。

### 交互

- 点击协作频道 → 主区看板
- 点击卡片 → 右侧详情展开 + 卡片 active
- 卡片状态切换：Todo/Doing/Done 分段控件
- 列内 `+` → 创建到对应列
- 消息右键"转 Card" → 将消息转为卡片

### 与页2的关系

- 页2 和页3 **共享** `state.currentWsId`，切换 ws 时两个页面都更新
- `state.currentChatId` 独立——在页2 选了聊天频道，切到页3 不会显示该频道的看板

---

## 页4：设置（Settings）

**定位**：完整设置面板，占据主区（不再放在右侧抽屉）。

### nav panel（240px）

设置项导航列表（类似 macOS 系统设置侧栏）：
- 账号（SVG `user` 图标）
- 外观（SVG `palette` 图标）
- 当前团队（SVG `users` 图标）
- 通知（SVG `bell` 图标）
- 关于（SVG `info` 图标）

### 主区

按选中的设置项显示对应 section：

1. **账号**：头像 + 显示名 + 邮箱 + 修改头像/改名
2. **外观**：主题切换（Nowint/Violet/GoldenHour）三个色块预览，即时生效
3. **当前团队**：当前 ws 信息（名称/成员/频道数）+ 退出团队/切换团队入口 + PEYT Studio 邀请链接（可复制）
4. **通知**：桌面通知开关、Dock 角标开关
5. **关于**：版本号、登出按钮

### 右侧详情面板

设置页不使用详情面板，隐藏（`collapsed` 类）。

### 交互

- 点击 nav 项 → 主区切换 section
- 主题切换即时生效
- 头像点击可上传新头像
- 登出 → 确认后退出登录

---

## 技术实现

### TypeScript 全量迁移

**策略**：一次性全量迁移（非渐进式），因为导航架构变化大，渐进式会产生中间态混乱。

**范围**：
- `src/**/*.js` → `src/**/*.ts`
- `state.js` → `state.ts`：定义明确的 interface
- 所有模块添加类型注解
- 禁止 `any`，禁止伪代码
- Vite 配置调整支持 TS

**类型定义**：
```typescript
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

interface AppState {
  currentPage: Page;
  currentWsId: number | null;
  currentChatId: number | null;
  workspaces: WorkspaceDto[];
  channels: ChannelDto[];
  messages: MsgDto[];
  // ... 移除 currentApp（被 currentPage 替代）、移除 homeMode
}
```

### SVG 图标系统

**方案**：使用 `lucide` npm 包（轻量、线性风格、符合高级质感）。

**用法**：
```typescript
import { MessageCircle, Hash, LayoutGrid, Settings, User, Palette, Bell, Info, Plus, X } from 'lucide';

// 创建图标元素
const icon = MessageCircle.toSvg({ width: 24, height: 24, 'stroke-width': 1.5 });
```

**需要替换的位置**：
- rail 的所有页面图标
- nav panel 的 `+` / `#` / `▣` 符号
- 设置项的图标
- 关闭按钮的 `✕`
- 用户菜单的图标
- PEYT 欢迎消息中的 emoji

### 文件结构变更

```
src/
  shell/
    rail.ts          # 替代 appRail.js，4 页 SVG 图标
    navPanel.ts      # 替代 channelTree.js，按 currentPage 渲染对应 nav
  pages/
    messagesPage.ts  # 页1（替代 homeView.js）
    groupsPage.ts    # 页2（channelTree.js 的 chat 分支）
    workPage.ts      # 页3（channelTree.js 的 work 分支 + renderMain）
    settingsPage.ts  # 页4（替代 settingsPanel.js）
  chat/              # 消息相关（保持，迁移到 TS）
  work/              # 看板相关（保持，迁移到 TS）
  components/        # 共享组件
    avatar.ts
    contextMenu.ts
    toast.ts
    userMenu.ts
  state.ts           # 状态管理
  api.ts             # Tauri IPC 封装
  theme.ts           # 主题系统
  persist.ts         # 状态持久化
  main.ts            # 入口
```

### 状态管理变更

**移除**：
- `currentApp`（被 `currentPage` 替代）
- `homeMode`（被 `currentPage === 'messages'` 替代）
- `rightDrawerTab`（设置不再在抽屉，members/pin 逻辑移到页内）

**新增**：
- `currentPage: Page`
- `currentSettingsSection: 'account' | 'appearance' | 'team' | 'notifications' | 'about'`

**保留**：
- `currentWsId`、`currentChatId`、`workspaces`、`channels` 等

### 右侧详情面板处理

- **页1/页2**：保留 members/pin tabs，通过 chatView 主区头部的 `act-pin`/`act-info` 按钮触发开关（当前已有按钮保留，仅移除 `rightDrawerTab='settings'` 分支，因设置移到页4）
- **页3**：卡片详情，SVG 关闭按钮
- **页4**：隐藏（`collapsed` 类）

### emoji 清理清单

| 位置 | 原 emoji | 替换为 |
|------|----------|--------|
| PEYT 欢迎消息 | 👋 | 移除（纯文字） |
| rail 页面图标 | Ch/Wk/In 文字 | lucide SVG 图标 |
| nav panel 新建 | + 文字 | lucide `plus` SVG |
| 频道名前缀 | # 文字 | lucide `hash` SVG |
| 协作频道前缀 | ▣ 文字 | lucide `layout-grid` SVG |
| 关闭按钮 | ✕ 文字 | lucide `x` SVG |
| 设置项图标 | 无 | lucide 对应 SVG |
| 反应符号 | ↑/+/★/! | **保留**（固定符号集，非 emoji） |

---

## 不在本次范围内

- 后端 Rust 代码不变（除可能的 PEYT Studio 调整）
- deltachat core 不变
- 看板/列表/卡片详情的业务逻辑不变（仅迁移到 TS）
- 消息渲染逻辑不变（仅迁移到 TS）
- 主题系统不变（仅迁移到 TS）

---

## 验收标准

1. rail 显示 4 个 SVG 图标 + 底部头像，点击切换页面
2. 页1 显示非 ws 聊天列表，点击进入消息流
3. 页2 显示当前 ws 的聊天频道，点击进入消息流
4. 页3 显示协作频道，点击进入看板
5. 页4 显示设置面板，分 section 可切换
6. 单 ws 时无 workspace 切换入口可见
7. 多 ws 时页2/页3 顶部可切换 ws
8. 全局无 emoji（反应符号除外）
9. 所有 `.js` 文件迁移为 `.ts`，类型完整
10. `npm run build` 和 `cargo build` 通过
