# Migration Guide — Compatibility Layer Refactor

本文档记录了从旧架构(移动端直接依赖 Desktop 模块)到新架构(通过 Compatibility Layer)的迁移过程。

## 变更摘要

### 新增文件 (~38 个)

| 目录 | 文件数 | 用途 |
|------|--------|------|
| `src/shared/` | 3 | 共享类型、工具函数、常量 |
| `src/compat/adapters/` | 9 | 后端 API 适配器 |
| `src/compat/mappers/` | 7 | 数据模型映射 |
| `src/compat/presenters/` | 7 | UI 表现层 |
| `src/compat/services/` | 5 | 业务服务层 |
| `src/compat/events/` | 2 | 事件翻译桥 |
| `src/compat/navigation/` | 1 | 导航抽象桥 |
| `src/compat/state/` | 1 | 移动端状态管理 |
| `src/compat/bridge/` | 1 | 统一入口 |
| `src/mobile/` | 5 | 移动端 UI (4 迁移 + 1 入口) |
| `docs/architecture/` | 3 | 架构文档 |

### 迁移文件 (4 个,从 src/ 移到 src/mobile/)

| 旧路径 | 新路径 |
|--------|--------|
| `src/shell/mobileShell.ts` | `src/mobile/layouts/MobileShell.ts` |
| `src/shell/bottomNavigation.ts` | `src/mobile/components/BottomNavigation.ts` |
| `src/chat/mobileChat.ts` | `src/mobile/components/MobileChat.ts` |
| `src/chat/mobileComposer.ts` | `src/mobile/components/MobileComposer.ts` |

> **注意:** 旧文件保留在原始位置,以保证桌面端向后兼容。

### 修改的现有文件 (2 个)

| 文件 | 变更 |
|------|------|
| `src/main.ts` | 新增移动端视口检测,通过 compat/bridge 启动移动端 |
| `src/shell/shell.ts` | 新增 `eventBridge.init()` 调用(移动端初始化时) |

## 导入变更对照表

### 后端 API 调用

| 旧写法 | 新写法 |
|--------|--------|
| `import { call } from '../api.js'` | `import { chatAdapter } from '../../compat/bridge/index.js'` |
| `call('send_text', { chatId, text })` | `chatAdapter.sendText(chatId, text)` |
| `call('send_reply', { chatId, text, quoteMsgId })` | `chatAdapter.sendReply(chatId, text, quoteMsgId)` |
| `call('delete_chat', { chatId })` | `chatAdapter.deleteChat(chatId)` |
| `call('block_chat', { chatId })` | `chatAdapter.blockChat(chatId)` |
| `call('send_file', { chatId, filePath, ... })` | `chatAdapter.sendFile({ chatId, filePath, ... })` |

### 全局状态

| 旧写法 | 新写法 |
|--------|--------|
| `import { state } from '../state.js'` | `import { stateManager } from '../../compat/bridge/index.js'` |
| `state.currentPage = 'messages'` | `stateManager.updateState({ currentPage: 'messages' })` |
| `state.currentChatId = chatId` | `stateManager.updateState({ currentConversationId: chatId })` |
| `state.currentChatId` | `stateManager.getState().currentConversationId` |
| `state.channels` | `stateManager.getState().conversations` |

### 类型导入

| 旧写法 | 新写法 |
|--------|--------|
| `import type { Page } from '../types.js'` | `import type { Page } from '../../shared/types/index.js'` |
| `import type { MsgDto } from '../types.js'` | `import type { MsgDto } from '../../shared/types/index.js'` |

### 工具函数

| 旧写法 | 新写法 |
|--------|--------|
| `escapeHtml(s)` (本地定义) | `import { escapeHtml } from '../../shared/utils/index.js'` |

### 常量

| 旧写法 | 新写法 |
|--------|--------|
| `PAGE_TITLES` (mobileShell.ts 本地) | `import { PAGE_TITLES } from '../../shared/constants/index.js'` |
| `MOBILE_TABS` (bottomNavigation.ts 本地) | `import { MOBILE_TABS } from '../../shared/constants/index.js'` |
| `QUICK_EMOJIS` (mobileComposer.ts 本地) | `import { QUICK_EMOJIS } from '../../shared/constants/index.js'` |

## 兼容层扩展指南

### 添加新的 Adapter

```typescript
// src/compat/adapters/NewFeatureAdapter.ts
import { call } from '../../api.js';

class NewFeatureAdapter {
  async someCommand(args: SomeArgs): Promise<SomeResult> {
    return call<SomeResult>('command_name', args as unknown as Record<string, unknown>);
  }
}
export const newFeatureAdapter = new NewFeatureAdapter();
```

然后在 `src/compat/bridge/index.ts` 中注册:

```typescript
export { newFeatureAdapter } from '../adapters/NewFeatureAdapter.js';
```

### 添加新的 Mapper

```typescript
// src/compat/mappers/NewMapper.ts
import type { BackendDto } from '../../types.js';

export interface MobileModel {
  id: number;
  name: string;
}

export function mapDtoToModel(dto: BackendDto): MobileModel {
  return { id: dto.id, name: dto.name };
}
```

### 添加新的移动端事件

1. 在 `src/compat/events/EventTypes.ts` 中添加事件常量
2. 在 `src/compat/events/EventBridge.ts` 的 `EVENT_MAP` 中建立 DC 事件映射
3. 在 `src/compat/bridge/index.ts` 中导出新事件类型

## 回滚步骤

如果需要回滚到旧架构:

1. 恢复 `src/main.ts` 的原始 `boot()` 实现
2. 删除 `src/compat/` 目录
3. 删除 `src/mobile/` 目录
4. 删除 `src/shared/` 目录
5. 恢复 `src/shell/mobileShell.ts` 等旧文件中的导入

```bash
git checkout src/main.ts src/shell/shell.ts
rm -rf src/compat/ src/mobile/ src/shared/
```
