# UI Adaptation Layer — Architecture Documentation

## Overview

The UI Adaptation Layer (`src/compat/ui/`) provides a stable facade between the Desktop UI modules (`src/pages/`, `src/chat/`, `src/shell/`) and the Android Mobile UI (`src/mobile/`).

Unlike the previous compatibility layer which wrapped ALL backend access (adapters, mappers, services, presenters, events, state), this layer focuses exclusively on **UI adaptation**:
- **Data access**: `mobile/` imports `call()` and `onEvent()` directly from `src/api.ts`
- **State management**: `mobile/` imports `state` and `setState()` directly from `src/state.ts`
- **UI components**: `mobile/` imports adapters from `src/compat/ui/` instead of desktop `pages/*.js` or `chat/*.js` directly

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     src/mobile/                              │
│                   (Android UI Only)                          │
│  app/main.ts  │  layouts/MobileShell.ts                     │
│  components/MobileChat.ts  │  MobileComposer.ts              │
│  components/BottomNavigation.ts                             │
│                                                              │
│  Imports from: compat/ui/  +  api.ts  +  state.ts           │
└──────────┬──────────────────┬───────────────┬───────────────┘
           │                  │               │
           │ (UI)             │ (data)        │ (state)
           ▼                  ▼               ▼
┌──────────────────┐ ┌────────────┐ ┌──────────────┐
│  src/compat/ui/  │ │ src/api.ts │ │ src/state.ts │
│  (UI Adapters)   │ │ (Tauri IPC)│ │ (App State)  │
│                  │ │            │ │              │
│  shell.ts        │ │ call()     │ │ state        │
│  chat.ts         │ │ onEvent()  │ │ setState()   │
│  pages.ts        │ │            │ │              │
│  composer.ts     │ └─────┬──────┘ └──────┬───────┘
│  navigation.ts   │       │               │
│  styles.ts       │       ▼               │
└────────┬─────────┘  ┌─────────────────┐   │
         │             │  src-tauri/     │   │
         ▼             │  (Rust backend) │   │
┌──────────────────┐   └─────────────────┘   │
│   src/           │                         │
│  (Desktop UI)    │                         │
│                  │                         │
│  pages/*.ts      │◄────────────────────────┘
│  chat/chatView   │  state flows directly
│  components/     │
│  shell/          │
└──────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    src/shared/                               │
│                (Shared Layer)                               │
│  types/  │  utils/  │  constants/                          │
│                                                              │
│  Used by: mobile/, compat/ui/, AND src/                     │
└─────────────────────────────────────────────────────────────┘
```

## Dependency Rules

| Rule | Status |
|------|--------|
| `mobile/ → src/api.ts` | ✅ **ALLOWED** — direct data access, no wrapping |
| `mobile/ → src/state.ts` | ✅ **ALLOWED** — direct state access, no wrapping |
| `mobile/ → compat/ui/` | ✅ **ALLOWED** — UI adaptation layer |
| `mobile/ → shared/` | ✅ Allowed — shared types/utils/constants |
| `compat/ui/ → src/` | ✅ Allowed — wraps desktop UI modules |
| `compat/ui/ → src/api.ts` | ✅ Allowed — direct data access |
| `compat/ui/ → src/state.ts` | ✅ Allowed — direct state access |
| `compat/ui/ → shared/` | ✅ Allowed — shared types |
| `mobile/ → src/pages/` (directly) | ❌ **AVOID** — use compat/ui/pages.ts |
| `mobile/ → src/chat/` (directly) | ❌ **AVOID** — use compat/ui/chat.ts |
| `compat/ui/ → mobile/` | ❌ FORBIDDEN — no reverse deps |
| Circular dependencies | ❌ FORBIDDEN |

## UI Adapters

### Shell Adapter (`compat/ui/shell.ts`)
Adapts desktop 3-column layout (rail + navPanel + rightDrawer) into mobile single-column WeChat-style layout (TopBar + PageContainer + BottomNav).

| Export | Description |
|--------|-------------|
| `renderMobileShell()` | Render mobile shell HTML into `#app` |
| `navigateToMobilePage(page)` | Navigate to a tab page |
| `enterMobileChat(chatId)` | Enter full-screen chat mode |
| `leaveMobileChat()` | Exit chat, return to previous page |
| `updateMobileTopBar()` | Update top bar title/buttons |

### Chat Adapter (`compat/ui/chat.ts`)
Wraps desktop `chat/chatView.ts` for mobile consumption.

| Export | Description |
|--------|-------------|
| `renderChatView(chatId)` | Render chat view for a given chat |
| `appendOptimisticMessage(msg)` | Add optimistic (sending) message to list |
| `appendNewMessages(chatId)` | Load and append newer messages |

### Pages Adapter (`compat/ui/pages.ts`)
Wraps ALL desktop `pages/*.ts` dynamic imports behind a single `renderPage()` entry point. When desktop restructures page modules, only this file needs updating.

| Export | Description |
|--------|-------------|
| `renderPage(page, container)` | Render any page type into a container |
| `PageName` | Type alias for page identifiers |

### Composer Adapter (`compat/ui/composer.ts`)
Provides full mobile message composition: emoji picker, @mentions, #channel suggestions, attachments, slash commands, and optimistic updates. Uses `call()` directly for backend commands.

| Export | Description |
|--------|-------------|
| `renderComposer(chatId, container, onSent)` | Render composer UI into container |
| `MobileComposerOnSent` | Callback type for send completion |

### Navigation Adapter (`compat/ui/navigation.ts`)
Provides bottom tab navigation (5 tabs) + navigation stack for sub-pages. Replaces the old NavigationBridge.

| Export | Description |
|--------|-------------|
| `renderBottomNav()` | Render bottom 5-tab navigation |
| `navigate(page)` | Navigate to a page |
| `goBack()` | Pop navigation stack, return to previous |
| `openChat(chatId)` | Open a chat (pushes current page to stack) |
| `initNavigation()` | Initialize navigation from persisted state |
| `NavigationEntry` | Type for stack entries |

### Styles Adapter (`compat/ui/styles.ts`)
Provides mobile CSS variables, responsive breakpoints, theme adaptation, and injects mobile stylesheet.

| Export | Description |
|--------|-------------|
| `MOBILE_CSS_VARS` | Mobile CSS variable definitions |
| `applyMobileTheme()` | Apply current theme to mobile shell |
| `getMobileBreakpoint()` | Return mobile breakpoint (900px) |
| `isMobileViewport()` | Check if current viewport is mobile |
| `injectMobileStyles()` | Inject mobile `<style>` into `<head>` |

## Migration from Old Compatibility Layer

The old `compat/` layer (adapters, mappers, services, presenters, events, navigation bridge, state manager, bridge index) has been **removed**. The new architecture is:

| Old Pattern | New Pattern |
|-------------|-------------|
| `import { chatAdapter } from 'compat/bridge'` → `chatAdapter.sendText(...)` | `import { call } from 'api.js'` → `call('send_text', ...)` |
| `import { stateManager } from 'compat/bridge'` → `stateManager.getState()` | `import { state } from 'state.ts'` → `state.currentPage` |
| `import { eventBridge } from 'compat/bridge'` → `eventBridge.on(...)` | `import { onEvent } from 'api.ts'` → `onEvent('MsgsChanged', ...)` |
| `import { chatService } from 'compat/bridge'` → `chatService.loadConversations()` | `import { call } from 'api.ts'` → `call('list_channels', ...)` |
| Dynamic import from `../../pages/messagesPage.js` | Import from `../../compat/ui/pages.js` → `renderPage('messages', ...)` |
| Dynamic import from `../../chat/chatView.js` | Import from `../../compat/ui/chat.js` → `renderChatView(...)` |

## Key Design Principles

1. **No data-layer wrapping**: `api.ts` (Tauri IPC) and `state.ts` (app state) are used directly by both desktop and mobile. No intermediate adapters, mappers, or services.

2. **UI-only adaptation**: `compat/ui/` only wraps desktop UI module imports. It does NOT wrap backend calls.

3. **Stable API surface**: When upstream changes desktop UI module paths or export signatures, only the adapter files in `compat/ui/` need updating — mobile pages remain unchanged.

4. **Shared utilities**: `shared/` contains types, constants, and utility functions used by all layers.
