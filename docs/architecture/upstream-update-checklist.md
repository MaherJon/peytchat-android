# Upstream Update Checklist

当上游 Desktop 仓库发布新版本时,按照此清单更新 Android 项目。

## 更新流程

### Step 1: 替换 Backend 文件

```bash
# 将上游 Desktop 的 src/ 目录复制到本项目的 src/ 目录
# 注意: 不要覆盖 compat/ mobile/ shared/ 目录

# 示例(假设上游仓库在 ../peytchat-desktop):
rsync -av --exclude='compat/' --exclude='mobile/' --exclude='shared/' \
  ../peytchat-desktop/src/ ./src/
```

### Step 2: 检查 API 变更

检查上游是否变更了以下关键接口:

- [ ] `src/api.ts` — `call()` / `onEvent()` / `transformBlobURL()` 签名是否变更
- [ ] `src/types.ts` — DTO 接口字段是否新增/删除/重命名
- [ ] `src/state.ts` — `AppState` 接口字段是否变更
- [ ] `src-tauri/src/commands.rs` — Tauri 命令是否新增/删除/重命名参数
- [ ] `src-tauri/src/lib.rs` — `invoke_handler` 注册是否变更

### Step 3: 修复 Compatibility Layer

根据 API 变更,更新 `src/compat/` 中的相应模块:

#### Adapters
- [ ] `compat/adapters/ChatAdapter.ts` — 适配 chat 相关命令变更
- [ ] `compat/adapters/ChannelAdapter.ts` — 适配 channel 命令变更
- [ ] `compat/adapters/WorkspaceAdapter.ts` — 适配 workspace 命令变更
- [ ] `compat/adapters/UserAdapter.ts` — 适配 user/contact 命令变更
- [ ] `compat/adapters/SettingsAdapter.ts` — 适配 settings 变更
- [ ] `compat/adapters/PluginAdapter.ts` — 适配 plugin 命令变更
- [ ] `compat/adapters/NotificationAdapter.ts` — 适配 inbox 命令变更
- [ ] `compat/adapters/SearchAdapter.ts` — 适配 search 命令变更
- [ ] `compat/adapters/CardAdapter.ts` — 适配 card 命令变更

#### Mappers
- [ ] `compat/mappers/ChatMapper.ts` — 更新 ChatModel/MessageModel 映射
- [ ] `compat/mappers/ChannelMapper.ts` — 更新 ConversationModel 映射
- [ ] `compat/mappers/WorkspaceMapper.ts` — 更新 WorkspaceModel 映射
- [ ] `compat/mappers/UserMapper.ts` — 更新 UserModel 映射
- [ ] `compat/mappers/CardMapper.ts` — 更新 CardModel 映射

#### Presenters
- [ ] `compat/presenters/ChatPresenter.ts` — 更新聊天视图数据
- [ ] `compat/presenters/ConversationPresenter.ts` — 更新会话视图数据
- [ ] `compat/presenters/ProfilePresenter.ts` — 更新个人资料视图
- [ ] `compat/presenters/SettingsPresenter.ts` — 更新设置视图
- [ ] `compat/presenters/NotificationPresenter.ts` — 更新通知视图
- [ ] `compat/presenters/SearchPresenter.ts` — 更新搜索视图

#### Events
- [ ] `compat/events/EventTypes.ts` — 新增/变更移动端事件类型
- [ ] `compat/events/EventBridge.ts` — 更新 DC 事件 → 移动端事件映射

#### Services
- [ ] `compat/services/ChatService.ts`
- [ ] `compat/services/WorkspaceService.ts`
- [ ] `compat/services/PluginService.ts`
- [ ] `compat/services/NotificationService.ts`
- [ ] `compat/services/SearchService.ts`

### Step 4: 递增版本号

如果 API 发生 breaking change:

```typescript
// src/shared/constants/index.ts
export const COMPAT_API_VERSION = 2; // 递增版本号
```

### Step 5: 构建验证

```bash
# TypeScript 类型检查
npx tsc --noEmit

# 前端构建
npm run build

# 完整 Tauri 构建(可选,耗时较长)
npm run tauri build
```

### Step 6: 依赖检查

```bash
# 确认 mobile/ 没有直接导入 backend
grep -rn "from '.*/api\.js'" src/mobile/     # 必须为空
grep -rn "from '.*/state\.js'" src/mobile/   # 必须为空
```

### Step 7: 功能验证

- [ ] 桌面端 Shell 正常渲染(rail + nav panel + chat main + drawer)
- [ ] 移动端 Shell 正常渲染(顶栏 + 页面容器 + 底部导航)
- [ ] 消息收发正常
- [ ] 工作区/频道功能正常
- [ ] 卡片任务功能正常
- [ ] 插件系统正常
- [ ] 通知(Inbox)正常

## 成功标准

✅ 上游更新后,只需修改 `src/compat/` 目录
✅ `src/mobile/` 目录无需任何修改
✅ 桌面端和移动端都正常工作
