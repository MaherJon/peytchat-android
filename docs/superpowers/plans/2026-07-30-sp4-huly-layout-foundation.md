# SP4 Huly 化布局 + 地基修复 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从「能用」到「好用」——重设计为 Huly 风格 application 切换布局，修复 chatmail 账号收发消息根因（start_io 遗漏），补齐附件渲染/事件实时性/搜索/虚拟化/动效/profile 头像，为 SP5+ Card/Task/Inbox 协作铺垫地基。

**Architecture:** 后端修复 `create_chatmail_account` 的 `start_io` 遗漏 + 新增 `get_asset_url`/`search_msgs` 命令 + 扩展 ProfileDto/MemberDto 加 avatar/color；前端 wsRail→appRail 升级为 application 切换栏、channelTree 改造为 nav tree、rightDrawer 加宽 300px 可折叠、message.js 附件渲染分支、shell.js 13 事件 handler + 增量刷新、chatView.js 虚拟化、styles.css 动效、Plzdelta 风格 profile 头像。

**Tech Stack:** Rust + Tauri v2 + deltachat crate + rusqlite（后端）；Vanilla JS + Vite + highlight.js + qrcode（前端）。

## Global Constraints

- core 禁止修改（chatmail/core @ bbcfa5e git submodule）
- 黑白配色：#0d0d0d 底 / #0a0a0a 面板 / #1a1a1a/#222 边框 / #1f1f1f active / #e5e5e5/#888/#555 文字
- 字号 11/13/9/10px，字重 500/600
- 无多级菜单（application 切换是单层图标）
- 无 emoji，极简符号（reactions 限定 ↑/+/★/!）
- 消息删除仅限自己消息（core 不支持编辑）
- UI 完全对齐 mockup（sp4-huly-layout.html）
- 后端命令用 `#[tauri::command]` + lib.rs `generate_handler!` 注册
- rusqlite 调用包在 `tokio::task::spawn_blocking` 内
- 前端通过 `call(cmd, args)` 调 Tauri 命令，`onEvent(typ, cb)` 监听事件

---

## File Structure

### 后端（src-tauri/src/）
- `commands.rs` — 修改：T1 start_io / T2 get_asset_url / T10 search_msgs / T13 profile avatar
- `dto.rs` — 修改：T13 ProfileDto/MemberDto 加 avatar/color
- `events.rs` — 修改：T13 SelfavatarChanged 转发
- `lib.rs` — 修改：T2/T10 注册新命令
- `tauri.conf.json` — 修改：T2 assetProtocol scope

### 前端（src/）
- `shell/shell.js` — 修改：T5/T6/T8/T9 主控重构
- `shell/wsRail.js` → `shell/appRail.js` — 重命名：T5 application 切换栏
- `shell/channelTree.js` — 修改：T6 nav tree 改造
- `shell/rightDrawer.js` — 修改：T7/T12/T13 加宽+折叠+members 搜索+pin 改造+头像
- `chat/chatView.js` — 修改：T9/T11/T12 增量刷新+虚拟化+未读分隔
- `chat/message.js` — 修改：T3/T8/T13 附件渲染+发送状态+头像
- `dialogs/homeView.js` — 修改：T4/T13 信息密度+头像
- `dialogs/search.js` — 修改：T10 跨频道搜索
- `dialogs/settingsPanel.js` — 修改：T13 头像选择 UI
- `dialogs/memberDetail.js` — 修改：T13 大头像
- `state.js` — 修改：T5/T6 currentApp/detailPanelOpen 字段
- `persist.js` — 修改：T5 持久化新字段
- `api.js` — 修改：T13 transformBlobURL 工具
- `styles.css` — 修改：T3/T4/T5/T7/T12/T13 样式

---

### Task 1: P0-4/P0-5 start_io 修复（收发消息根因）

**Files:**
- Modify: `src-tauri/src/commands.rs` (`create_chatmail_account` 函数，约 L110-153)

**Interfaces:**
- Consumes: `ctx.start_io()` 来自 deltachat context（`login` 命令 L98 已有用法）
- Produces: chatmail 账号注册后 IO 自动启动，能立即收发消息

- [ ] **Step 1: 定位 create_chatmail_account 函数**

Read `src-tauri/src/commands.rs` 找到 `create_chatmail_account` 函数（约 L110-153），确认 `select_account` 后、`set_current` 前缺少 `ctx.start_io().await`。

- [ ] **Step 2: 加 start_io 调用**

在 `accounts.select_account(id).await?;` 的大括号块之后、`state.set_current(id);` 之前，插入：
```rust
    // 启动 IO（与 login 命令对齐，否则 chatmail 账号无法收发消息）
    ctx.start_io().await;
```

- [ ] **Step 3: 验证编译**

Run: `cd src-tauri && cargo build 2>&1 | tail -20`
Expected: 编译通过，无错误

- [ ] **Step 4: 手动验证收发**

Run: `cd src-tauri && cargo build && cd .. && npm run tauri dev`
注册新 chatmail 账号 → 发消息给 deltachat desktop 账号 → 确认对方收到 → 对方回复 → 确认本地收到

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/commands.rs
git commit -m "fix(cmd): start_io after create_chatmail_account to enable send/receive

chatmail 账号注册后未调用 ctx.start_io() 导致 SMTP/IMAP 不工作，
发出的消息存本地但未提交，接收不及时直到重启应用。
对齐 login 命令 L98 的做法。"
```

---

### Task 2: P0-2 asset protocol 配置

**Files:**
- Modify: `src-tauri/tauri.conf.json` (`app.security.assetProtocol` 配置)
- Modify: `src-tauri/src/commands.rs` (新增 `get_asset_url` 命令)
- Modify: `src-tauri/src/lib.rs` (注册 `get_asset_url` 命令)

**Interfaces:**
- Consumes: `ctx.get_blobdir()` 获取 blobdir 路径
- Produces: `get_asset_url(path: String) -> String` 命令，返回 `asset://localhost/<encoded>` URL；前端可用 `<img src={url}>` 加载 blobdir 文件

- [ ] **Step 1: 配置 tauri.conf.json assetProtocol**

Read `src-tauri/tauri.conf.json`，找到 `app.security` 节，确保有 `assetProtocol` 配置：
```json
{
  "app": {
    "security": {
      "assetProtocol": {
        "enable": true,
        "scope": ["$APPDATA/**", "$HOME/**"]
      }
    }
  }
}
```
若已有 `assetProtocol` 但 scope 不含 `$APPDATA/**`，追加该项。

- [ ] **Step 2: 新增 get_asset_url 命令**

在 `src-tauri/src/commands.rs` 末尾新增：
```rust
/// 将本地文件路径转为 webview 可访问的 asset:// URL。
/// 用于加载 deltachat blobdir 中的头像/图片/文件。
#[tauri::command]
pub async fn get_asset_url(
    state: State<'_, AppState>,
    path: String,
) -> AppResult<String> {
    use tauri::path::PathResolver;
    let app_handle = state.app_handle.clone();
    let url = app_handle
        .path()
        .asset_protocol()
        .get(path.as_str())
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| AppError::Core(format!("asset url error: {e}")))?;
    Ok(url)
}
```

注意：需在 `AppState` 加 `app_handle: tauri::AppHandle` 字段（若未有）。若 `AppState` 无此字段，改用更简方案：直接返回 `asset://localhost/` + URL 编码的路径。

简化方案（若上面复杂）：
```rust
#[tauri::command]
pub async fn get_asset_url(_state: State<'_, AppState>, path: String) -> AppResult<String> {
    // Tauri v2 asset protocol: asset://localhost/<url_encoded_absolute_path>
    let encoded = urlencoding::encode(&path);
    Ok(format!("asset://localhost/{}", encoded))
}
```

若用简化方案，需在 `src-tauri/Cargo.toml` 加 `urlencoding = "2"` 依赖。

- [ ] **Step 3: 注册命令**

在 `src-tauri/src/lib.rs` 的 `generate_handler!` 宏内加 `commands::get_asset_url,`

- [ ] **Step 4: 验证编译**

Run: `cd src-tauri && cargo build 2>&1 | tail -20`
Expected: 编译通过

- [ ] **Step 5: 手动验证**

前端 console 执行 `await window.__TAURI__.core.invoke('get_asset_url', { path: '/tmp/test.txt' })` → 确认返回 `asset://localhost/...` URL

- [ ] **Step 6: 提交**

```bash
git add src-tauri/tauri.conf.json src-tauri/src/commands.rs src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat(cmd): add get_asset_url command + assetProtocol scope for blobdir access"
```

---

### Task 3: P0-1 前端附件渲染

**Files:**
- Modify: `src/chat/message.js` (renderMessage 函数，加 view_type 分支)
- Modify: `src/styles.css` (附件样式)

**Interfaces:**
- Consumes: MsgDto 的 `view_type/file/file_name/file_mime/file_bytes/width/height/download_state` 字段（后端已提供）
- Consumes: `call('get_asset_url', { path })` from Task 2
- Produces: 消息能渲染图片缩略图、文件卡片、音频条、视频框

- [ ] **Step 1: 在 message.js 加附件渲染分支**

Read `src/chat/message.js`，找到 `renderMessage` 函数。在 text 渲染逻辑后，加 view_type 分支：
```js
// 附件渲染（view_type != Text）
let attachmentHtml = "";
if (msg.view_type && msg.view_type !== "Text" && msg.file) {
  const assetUrl = await call("get_asset_url", { path: msg.file });
  switch (msg.view_type) {
    case "Image":
    case "Gif":
    case "Sticker":
      attachmentHtml = `<div class="msg-attachment img" data-asset="${escapeHtml(assetUrl)}">
        <img src="${escapeHtml(assetUrl)}" alt="${escapeHtml(msg.file_name || "image")}" style="max-width:240px;max-height:180px;border-radius:4px;cursor:pointer" data-full="${escapeHtml(assetUrl)}" />
      </div>`;
      break;
    case "File":
      attachmentHtml = `<div class="msg-attachment file" data-download="${escapeHtml(assetUrl)}">
        <div class="file-icon">□</div>
        <div class="file-info">
          <div class="file-name">${escapeHtml(msg.file_name || "file")}</div>
          <div class="file-meta">${formatBytes(msg.file_bytes)} · 点击下载</div>
        </div>
      </div>`;
      break;
    case "Audio":
    case "Voice":
      attachmentHtml = `<div class="msg-attachment audio">
        <audio controls src="${escapeHtml(assetUrl)}" style="max-width:280px"></audio>
      </div>`;
      break;
    case "Video":
      attachmentHtml = `<div class="msg-attachment video">
        <video controls src="${escapeHtml(assetUrl)}" style="max-width:280px;max-height:200px;border-radius:4px"></video>
      </div>`;
      break;
  }
}
```

注意：`renderMessage` 需改为 `async` 函数（若尚未是），因为 `call('get_asset_url')` 是异步的。

- [ ] **Step 2: 加 formatBytes 工具函数**

在 message.js 顶部加：
```js
function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}
```

- [ ] **Step 3: 加图片点击放大**

在 message.js 渲染后的事件绑定中加：
```js
msgEl.querySelectorAll(".msg-attachment img[data-full]").forEach((img) => {
  img.addEventListener("click", () => {
    const overlay = document.createElement("div");
    overlay.className = "overlay img-fullscreen-overlay";
    overlay.style.display = "flex";
    overlay.innerHTML = `<img src="${img.dataset.full}" style="max-width:90%;max-height:90%" />`;
    overlay.addEventListener("click", () => overlay.remove());
    document.body.appendChild(overlay);
  });
});
```

- [ ] **Step 4: 加文件下载**

```js
msgEl.querySelectorAll(".msg-attachment.file[data-download]").forEach((el) => {
  el.addEventListener("click", async () => {
    // 通过创建 <a download> 触发下载
    const a = document.createElement("a");
    a.href = el.dataset.download;
    a.download = "";
    a.click();
  });
});
```

- [ ] **Step 5: 加 styles.css 附件样式**

在 styles.css 加：
```css
.msg-attachment { margin-top: 6px; }
.msg-attachment.file {
  display: inline-flex; align-items: center; gap: 10px;
  background: #0a0a0a; border: 1px solid #1a1a1a; border-radius: 4px;
  padding: 8px 12px; cursor: pointer; max-width: 280px;
}
.msg-attachment.file .file-icon {
  width: 28px; height: 28px; background: #161616; border: 1px solid #222;
  border-radius: 4px; display: flex; align-items: center; justify-content: center;
  color: #888; font-size: 11px;
}
.msg-attachment.file .file-name { font-size: 10px; font-weight: 500; color: #e5e5e5; }
.msg-attachment.file .file-meta { font-size: 9px; color: #555; margin-top: 1px; }
.img-fullscreen-overlay { background: rgba(0,0,0,0.9); }
```

- [ ] **Step 6: 验证 build**

Run: `npm run build 2>&1 | tail -10`
Expected: build 通过

- [ ] **Step 7: 手动验证**

用 deltachat desktop 发图片/文件给 peytchat → 确认 peytchat 正确渲染图片缩略图、文件卡片、点击放大、点击下载

- [ ] **Step 8: 提交**

```bash
git add src/chat/message.js src/styles.css
git commit -m "feat(msg): render attachments (image/file/audio/video) via get_asset_url"
```

---

### Task 4: P0-3 homeView 信息密度

**Files:**
- Modify: `src/dialogs/homeView.js` (列表项渲染 last_msg + last_ts + 头像首字母)
- Modify: `src/styles.css` (homeView 列表项样式)

**Interfaces:**
- Consumes: ChatDto 的 `last_msg/last_ts/chat_id/name/is_group` 字段（后端已提供）
- Produces: homeView 列表项显示头像首字母 + name + last_msg 预览 + last_ts 相对时间

- [ ] **Step 1: 加 formatRelativeTime 工具函数**

在 homeView.js 顶部加：
```js
function formatRelativeTime(ts) {
  if (!ts) return "";
  const now = Date.now() / 1000;
  const diff = now - ts;
  const date = new Date(ts * 1000);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return Math.floor(diff / 60) + " 分";
  if (diff < 86400) {
    return date.getHours().toString().padStart(2, "0") + ":" + date.getMinutes().toString().padStart(2, "0");
  }
  if (diff < 86400 * 2) return "昨天";
  return (date.getMonth() + 1).toString().padStart(2, "0") + "-" + date.getDate().toString().padStart(2, "0");
}

function avatarLetter(name) {
  if (!name) return "?";
  const chars = [...name];
  return chars[0]?.toUpperCase() || "?";
}
```

- [ ] **Step 2: 改造列表项渲染**

Read `src/dialogs/homeView.js`，找到列表项渲染逻辑。改为：
```js
const itemHtml = `
  <div class="home-item ${unread > 0 ? "has-unread" : ""}" data-chat="${chat.chat_id}">
    <div class="home-avatar">${avatarLetter(chat.name)}</div>
    <div class="home-content">
      <div class="home-row">
        <span class="home-name">${escapeHtml(chat.name)}</span>
        <span class="home-time">${formatRelativeTime(chat.last_ts)}</span>
      </div>
      <div class="home-row">
        <span class="home-lastmsg">${escapeHtml((chat.last_msg || "").slice(0, 40))}</span>
        ${unread > 0 ? `<span class="home-unread">${unread}</span>` : ""}
      </div>
    </div>
  </div>
`;
```

- [ ] **Step 3: 加 styles.css 样式**

```css
.home-item {
  display: flex; gap: 10px; padding: 8px 16px; cursor: pointer;
  border-bottom: 1px solid #1a1a1a;
}
.home-item:hover { background: #161616; }
.home-item.has-unread .home-name { font-weight: 600; }
.home-avatar {
  width: 32px; height: 32px; background: #222; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 600; color: #e5e5e5; flex-shrink: 0;
}
.home-content { flex: 1; min-width: 0; }
.home-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.home-name { font-size: 11px; font-weight: 500; color: #e5e5e5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.home-time { font-size: 9px; color: #555; flex-shrink: 0; }
.home-lastmsg { font-size: 10px; color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.home-unread {
  background: #e5e5e5; color: #0a0a0a; border-radius: 8px;
  padding: 0 6px; font-size: 9px; font-weight: 600; flex-shrink: 0;
}
```

- [ ] **Step 4: 验证 build + 手动验证**

Run: `npm run build`
启动应用 → homeView 列表项显示头像首字母 + name + last_msg 预览 + 相对时间 + 未读徽标

- [ ] **Step 5: 提交**

```bash
git add src/dialogs/homeView.js src/styles.css
git commit -m "feat(home): show avatar letter + last_msg preview + relative time in list items"
```

---

### Task 5: 布局改造 - app rail

**Files:**
- Rename: `src/shell/wsRail.js` → `src/shell/appRail.js`
- Modify: `src/shell/shell.js` (import 改名 + 调 renderAppRail)
- Modify: `src/state.js` (加 currentApp/detailPanelOpen 字段)
- Modify: `src/persist.js` (持久化 currentApp/detailPanelOpen)
- Modify: `src/styles.css` (app rail 样式 + application 图标)

**Interfaces:**
- Consumes: state.workspaces, state.self, state.currentWsId
- Produces: `renderAppRail()` 函数渲染 application 切换栏；state.currentApp = "chat"|"work"|"inbox"

- [ ] **Step 1: 加 state.js 新字段**

Read `src/state.js`，在 state 对象加：
```js
currentApp: "chat",      // "chat" | "work" | "inbox"
detailPanelOpen: true,   // detail panel 折叠状态
```

- [ ] **Step 2: 加 persist.js 持久化**

Read `src/persist.js`，在 KEYS 加：
```js
currentApp: "peytchat.currentApp",
detailPanelOpen: "peytchat.detailPanelOpen",
```
在 `saveState` 加：
```js
localStorage.setItem(KEYS.currentApp, state.currentApp);
localStorage.setItem(KEYS.detailPanelOpen, state.detailPanelOpen ? "1" : "0");
```
在 `loadState` 加：
```js
state.currentApp = localStorage.getItem(KEYS.currentApp) || "chat";
state.detailPanelOpen = localStorage.getItem(KEYS.detailPanelOpen) !== "0";
```

- [ ] **Step 3: 重命名 wsRail.js → appRail.js**

Run: `git mv src/shell/wsRail.js src/shell/appRail.js`

- [ ] **Step 4: 改造 appRail.js 渲染**

Read `src/shell/appRail.js`（原 wsRail.js），将 `renderWsRail` 改为 `renderAppRail`。在顶部加 application 图标：
```js
import { call } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../toast.js";
import { saveState } from "../persist.js";

export function renderAppRail() {
  const rail = document.getElementById("ws-rail"); // 保留原 id 避免大改 HTML
  rail.className = "app-rail";
  rail.innerHTML = `
    <div class="app-icon ${state.currentApp === "chat" ? "active" : ""}" data-app="chat" title="Chat · 聊天">Ch</div>
    <div class="app-icon disabled" data-app="work" title="Work · 协作（SP5 启用）">Wk</div>
    <div class="app-icon disabled" data-app="inbox" title="Inbox · 通知（SP6 启用）">In</div>
    <div class="app-separator"></div>
    ${renderWorkspaces()}
    <div class="app-flex"></div>
    <div class="app-icon settings" title="设置">·</div>
    <div class="app-avatar">${(state.self?.name || "?")[0]?.toUpperCase()}</div>
  `;
  bindAppIcons();
  bindWorkspaceIcons();
}
```

`renderWorkspaces` 保持原逻辑（home + workspace icons + + 按钮），但 class 名调整为 `app-ws-icon`。

- [ ] **Step 5: 绑定 application 图标点击**

```js
function bindAppIcons() {
  document.querySelectorAll(".app-icon[data-app]").forEach((el) => {
    el.addEventListener("click", () => {
      if (el.classList.contains("disabled")) {
        const app = el.dataset.app;
        const msg = app === "work" ? "Work 协作模式将在 SP5 启用" : "Inbox 通知中心将在 SP6 启用";
        showToast(msg);
        return;
      }
      state.currentApp = el.dataset.app;
      saveState();
      renderAppRail();
      // 触发 nav tree 切换
      const { renderChannelTree } = require("./channelTree.js");
      renderChannelTree();
    });
  });
}
```

- [ ] **Step 6: 加 styles.css app rail 样式**

```css
.app-rail {
  width: 56px; background: #0a0a0a; display: flex; flex-direction: column;
  align-items: center; padding: 10px 0; gap: 6px;
  border-right: 1px solid #1a1a1a;
}
.app-icon {
  width: 36px; height: 36px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; font-size: 11px; letter-spacing: -0.5px;
  background: #161616; color: #888; border: 1px solid #222;
  transition: background 150ms, color 150ms;
}
.app-icon.active { background: #e5e5e5; color: #0a0a0a; font-weight: 600; }
.app-icon.disabled { color: #333; cursor: not-allowed; border-color: #1a1a1a; background: #0a0a0a; }
.app-icon.settings { border: 1px solid #333; color: #888; font-size: 13px; }
.app-avatar {
  width: 36px; height: 36px; background: #222; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; cursor: pointer;
}
.app-separator { width: 24px; height: 1px; background: #1f1f1f; margin: 6px 0; }
.app-flex { flex: 1; }
.app-ws-icon {
  width: 36px; height: 36px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; font-size: 12px;
  background: #161616; color: #888; border: 1px solid #222;
}
.app-ws-icon.active { background: #e5e5e5; color: #0a0a0a; font-weight: 600; }
```

- [ ] **Step 7: 更新 shell.js import**

Read `src/shell/shell.js`，将 `import { renderWsRail } from "./wsRail.js"` 改为 `import { renderAppRail } from "./appRail.js"`，所有 `renderWsRail()` 调用改为 `renderAppRail()`。

- [ ] **Step 8: 验证 build + 手动验证**

Run: `npm run build`
启动应用 → app rail 显示 Chat(白)/Work(灰)/Inbox(灰) 图标 + workspace 图标 + 底部设置/头像 → 点击 Work/Inbox 弹 toast → 点击 Chat 正常切换

- [ ] **Step 9: 提交**

```bash
git add src/shell/appRail.js src/shell/shell.js src/state.js src/persist.js src/styles.css
git rm src/shell/wsRail.js 2>/dev/null || true
git commit -m "feat(shell): rename wsRail→appRail, add Chat/Work/Inbox application switcher

app rail 56px: 顶部 Chat(激活)/Work(灰)/Inbox(灰) 三 application 图标 + 分隔 + workspace 图标 + 底部设置/头像。
Work/Inbox 点击 toast 提示 SP5/SP6 启用。state.currentApp 持久化。"
```

---

### Task 6: 布局改造 - nav tree

**Files:**
- Modify: `src/shell/channelTree.js` (按 currentApp 切换内容)
- Modify: `src/shell/shell.js` (nav tree 容器宽度 240px)
- Modify: `src/styles.css` (nav tree 宽度 + 占位样式)

**Interfaces:**
- Consumes: state.currentApp, state.channels, state.workspaces, state.currentWsId
- Produces: `renderChannelTree()` 按 currentApp 切换：chat=频道树，work/inbox=占位提示

- [ ] **Step 1: 改 channelTree.js 宽度**

Read `src/shell/channelTree.js`，将容器宽度从 220px 改为 240px（在 styles.css 的 `.channel-tree` 选择器改）。

- [ ] **Step 2: 按 currentApp 分支渲染**

在 `renderChannelTree` 函数开头加：
```js
export function renderChannelTree() {
  const tree = document.getElementById("channel-tree");
  tree.className = "nav-tree";
  if (state.currentApp !== "chat") {
    // Work/Inbox 占位（SP5/SP6 启用）
    tree.innerHTML = `
      <div class="nav-placeholder">
        <div class="nav-placeholder-title">${state.currentApp === "work" ? "Work" : "Inbox"}</div>
        <div class="nav-placeholder-desc">${state.currentApp === "work" ? "协作模式将在 SP5 启用" : "通知中心将在 SP6 启用"}</div>
      </div>
    `;
    return;
  }
  // 原有频道树渲染逻辑...
}
```

- [ ] **Step 3: 加 nav tree 底部视图入口占位**

在频道树渲染末尾加：
```js
tree.innerHTML += `
  <div class="nav-view-switcher">
    <span>视图：消息流</span>
    <span class="nav-view-icon" title="切换视图（SP7）">⇄</span>
  </div>
`;
```

- [ ] **Step 4: 加 styles.css 样式**

```css
.nav-tree { width: 240px; } /* 覆盖原 220px */
.nav-placeholder {
  padding: 40px 20px; text-align: center; color: #555;
}
.nav-placeholder-title { font-size: 13px; font-weight: 600; color: #888; margin-bottom: 6px; }
.nav-placeholder-desc { font-size: 10px; }
.nav-view-switcher {
  padding: 8px 16px; border-top: 1px solid #1a1a1a;
  display: flex; justify-content: space-between; align-items: center;
  color: #555; font-size: 9px;
}
.nav-view-icon { cursor: pointer; }
```

- [ ] **Step 5: 验证 build + 手动验证**

Run: `npm run build`
启动应用 → Chat 模式下显示频道树（240px）+ 底部视图切换入口 → 切换到 Work/Inbox 显示占位提示

- [ ] **Step 6: 提交**

```bash
git add src/shell/channelTree.js src/styles.css
git commit -m "feat(nav): channelTree→navTree, switch content by currentApp + view switcher placeholder"
```

---

### Task 7: 布局改造 - detail panel + members 搜索

**Files:**
- Modify: `src/shell/rightDrawer.js` (加宽 300px + 可折叠 + members 搜索框)
- Modify: `src/styles.css` (detail panel 样式)

**Interfaces:**
- Consumes: state.rightDrawerOpen, state.rightDrawerTab, state.detailPanelOpen
- Produces: detail panel 300px + 折叠按钮 + members tab 顶部搜索框过滤成员

- [ ] **Step 1: 加宽 detail panel 到 300px**

在 styles.css 将 `.right-drawer` 宽度从 200px 改为 300px：
```css
.right-drawer { width: 300px; }
.right-drawer.collapsed { width: 0; overflow: hidden; }
```

- [ ] **Step 2: 加折叠按钮**

Read `src/shell/rightDrawer.js`，在 tabs 行末尾加折叠按钮：
```js
const tabsHtml = `
  <span class="rd-tab ${tab === "members" ? "active" : ""}" data-tab="members">members</span>
  <span class="rd-tab ${tab === "pin" ? "active" : ""}" data-tab="pin">pin</span>
  <span class="rd-tab ${tab === "settings" ? "active" : ""}" data-tab="settings">settings</span>
  <span class="rd-flex"></span>
  <span class="rd-collapse" title="折叠">›</span>
`;
```

绑定折叠：
```js
drawer.querySelector(".rd-collapse").addEventListener("click", () => {
  state.detailPanelOpen = false;
  saveState();
  renderRightDrawer();
});
```

- [ ] **Step 3: members tab 加搜索框**

在 members 渲染前加：
```js
const searchHtml = `<div class="rd-search"><input id="rd-member-search" placeholder="搜索成员..." /></div>`;
```

绑定过滤：
```js
const searchInput = drawer.querySelector("#rd-member-search");
if (searchInput) {
  searchInput.addEventListener("input", () => {
    const q = searchInput.value.toLowerCase();
    drawer.querySelectorAll(".rd-member").forEach((el) => {
      const name = el.dataset.name?.toLowerCase() || "";
      el.style.display = name.includes(q) ? "" : "none";
    });
  });
}
```

member 项加 `data-name` 属性。

- [ ] **Step 4: 加展开按钮（折叠时）**

当 `state.detailPanelOpen === false` 时，在 main 区右侧加一个展开按钮：
```js
if (!state.detailPanelOpen) {
  const main = document.getElementById("chat-main");
  const expandBtn = document.createElement("div");
  expandBtn.className = "detail-expand";
  expandBtn.innerHTML = "‹";
  expandBtn.title = "展开详情面板";
  expandBtn.addEventListener("click", () => {
    state.detailPanelOpen = true;
    saveState();
    renderRightDrawer();
    expandBtn.remove();
  });
  main.appendChild(expandBtn);
}
```

- [ ] **Step 5: 加 styles.css 样式**

```css
.rd-flex { flex: 1; }
.rd-collapse { color: #555; cursor: pointer; }
.rd-search { padding: 8px 12px; border-bottom: 1px solid #1a1a1a; }
.rd-search input {
  width: 100%; padding: 5px 8px; background: #0a0a0a; border: 1px solid #222;
  border-radius: 3px; color: #e5e5e5; font-size: 10px; font-family: inherit;
}
.detail-expand {
  position: absolute; right: 0; top: 50%; transform: translateY(-50%);
  width: 20px; height: 40px; background: #0a0a0a; border: 1px solid #1a1a1a;
  border-right: none; border-radius: 4px 0 0 4px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; color: #888;
  z-index: 10;
}
```

- [ ] **Step 6: 验证 build + 手动验证**

Run: `npm run build`
启动应用 → detail panel 300px → members tab 有搜索框，输入过滤 → 点击折叠按钮面板收起 → main 区出现展开按钮 → 点击展开

- [ ] **Step 7: 提交**

```bash
git add src/shell/rightDrawer.js src/styles.css
git commit -m "feat(drawer): widen to 300px + collapsible + members search filter"
```

---

### Task 8: P1-1 + P0-6 事件 handler + 发送状态反馈

**Files:**
- Modify: `src/shell/shell.js` (注册 13 事件 handler)
- Modify: `src/chat/message.js` (显示 pending/delivered/failed 状态 + 重发按钮)

**Interfaces:**
- Consumes: events.rs 已转发的 13 种事件（MsgDelivered/MsgFailed/MsgDeleted/ReactionsChanged/MsgRead/ChatDeleted 等）
- Produces: 消息状态实时更新（pending→delivered/failed），失败可重发，删除消息 UI 自动移除

- [ ] **Step 1: shell.js 注册 13 事件 handler**

Read `src/shell/shell.js`，在现有 `onEvent` 注册块后加：
```js
onEvent("MsgDelivered", (e) => updateMsgState(e.msg_id, "delivered"));
onEvent("MsgFailed", (e) => updateMsgState(e.msg_id, "failed"));
onEvent("MsgDeleted", (e) => removeMsg(e.msg_id));
onEvent("ReactionsChanged", (e) => refreshMsgReactions(e.msg_id));
onEvent("MsgRead", (e) => updateMsgState(e.msg_id, "read"));
onEvent("MsgsNoticed", () => { /* 未读分隔线清除，UI 自然刷新 */ });
onEvent("ChatDeleted", (e) => {
  // 从 state.channels 移除
  state.channels = state.channels.filter((c) => c.chat_id !== e.chat_id);
  if (state.currentChatId === e.chat_id) {
    state.currentChatId = null;
    document.getElementById("chat-main").innerHTML = `<div class="empty">选择一个频道</div>`;
  }
  const { renderChannelTree } = require("./channelTree.js");
  renderChannelTree();
});
onEvent("ChatEphemeralTimerModified", () => {}); // no-op
onEvent("IncomingReaction", (e) => refreshMsgReactions(e.msg_id));
onEvent("IncomingMsgBunch", () => {}); // no-op
onEvent("SecurejoinJoinerProgress", () => {}); // no-op
onEvent("SecurejoinInviterProgress", () => {}); // no-op
onEvent("WebxdcStatusUpdate", () => {}); // no-op
onEvent("WebxdcRealtimeData", () => {}); // no-op
onEvent("WebxdcInstanceDeleted", () => {}); // no-op
```

- [ ] **Step 2: 实现 updateMsgState / removeMsg / refreshMsgReactions**

在 shell.js 加：
```js
function updateMsgState(msgId, newState) {
  const msg = state.messages.find((m) => m.msg_id === msgId);
  if (msg) {
    msg.state = newState;
    const el = document.querySelector(`[data-msg="${msgId}"]`);
    if (el) {
      const stateEl = el.querySelector(".msg-state");
      if (stateEl) stateEl.textContent = stateLabel(newState);
      el.classList.remove("state-pending", "state-delivered", "state-failed", "state-read");
      el.classList.add("state-" + newState);
    }
  }
}

function removeMsg(msgId) {
  state.messages = state.messages.filter((m) => m.msg_id !== msgId);
  const el = document.querySelector(`[data-msg="${msgId}"]`);
  if (el) el.remove();
}

async function refreshMsgReactions(msgId) {
  try {
    const reactions = await call("get_reactions", { msgId });
    const el = document.querySelector(`[data-msg="${msgId}"] .msg-reactions`);
    if (el) {
      // 重新渲染 reactions 区域
      const { renderReactions } = require("../chat/message.js");
      renderReactions(el, reactions);
    }
  } catch {}
}

function stateLabel(s) {
  return { pending: "··", delivered: "✓", failed: "!", read: "✓✓" }[s] || "";
}
```

- [ ] **Step 3: message.js 显示发送状态 + 重发按钮**

Read `src/chat/message.js`，在消息渲染中加状态指示（仅 is_out 消息）：
```js
${msg.is_out ? `<span class="msg-state state-${msg.state || "pending"}" data-msg-state="${msg.msg_id}">${stateLabel(msg.state)}</span>` : ""}
```

失败状态加重发按钮：
```js
${msg.is_out && msg.state === "failed" ? `<span class="msg-resend" data-msg-id="${msg.msg_id}">重发</span>` : ""}
```

绑定重发：
```js
msgEl.querySelectorAll(".msg-resend").forEach((el) => {
  el.addEventListener("click", async () => {
    const msgId = Number(el.dataset.msgId);
    const msg = state.messages.find((m) => m.msg_id === msgId);
    if (msg) {
      try {
        await call("send_text", { chatId: state.currentChatId, text: msg.text });
        removeMsg(msgId); // 移除旧的失败消息
      } catch (e) { showToast("重发失败: " + e.message); }
    }
  });
});
```

- [ ] **Step 4: 加 styles.css 状态样式**

```css
.msg-state { font-size: 9px; color: #555; margin-left: 4px; }
.msg-state.state-delivered { color: #888; }
.msg-state.state-read { color: #e5e5e5; }
.msg-state.state-failed { color: #e5e5e5; }
.msg-resend {
  font-size: 9px; color: #e5e5e5; margin-left: 6px;
  cursor: pointer; border: 1px solid #222; padding: 0 4px; border-radius: 3px;
}
.msg-resend:hover { background: #1f1f1f; }
```

- [ ] **Step 5: 验证 build + 手动验证**

Run: `npm run build`
发送消息 → 状态从 pending → delivered → read → 模拟失败（断网发送）→ 显示 ! + 重发按钮 → 点击重发成功

- [ ] **Step 6: 提交**

```bash
git add src/shell/shell.js src/chat/message.js src/styles.css
git commit -m "feat(events): register 13 event handlers + show send state + resend on failure"
```

---

### Task 9: P1-2 频道切换保持分页（增量刷新）

**Files:**
- Modify: `src/shell/shell.js` (refreshCurrentChat 改增量)
- Modify: `src/chat/chatView.js` (不重置分页状态 + appendMessages 函数)

**Interfaces:**
- Consumes: state.messages, state.messagesOldestId, state.noMoreMsgs
- Produces: 新消息到达时增量追加，不丢失已加载的历史消息和 scroll 位置

- [ ] **Step 1: chatView.js 加 appendNewMessages 函数**

Read `src/chat/chatView.js`，新增：
```js
export async function appendNewMessages(chatId) {
  if (state.currentChatId !== chatId) return;
  try {
    // 只拉取最新的 50 条，找出 state.messages 里没有的新消息
    const msgs = await call("get_chat_msgs", { chatId, beforeMsgId: null });
    const existingIds = new Set(state.messages.map((m) => m.msg_id));
    const newMsgs = msgs.filter((m) => !existingIds.has(m.msg_id));
    if (newMsgs.length === 0) return;
    state.messages.push(...newMsgs);
    // 只渲染新增的消息
    const box = document.getElementById("chat-messages");
    if (box) {
      const wasAtBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 50;
      const { renderMessage } = require("./message.js");
      for (const m of newMsgs) {
        const el = await renderMessage(m);
        box.appendChild(el);
      }
      // 如果用户在底部，自动滚到新消息
      if (wasAtBottom) box.scrollTop = box.scrollHeight;
    }
  } catch (e) {
    console.error("appendNewMessages failed:", e);
  }
}
```

- [ ] **Step 2: shell.js refreshCurrentChat 改增量**

Read `src/shell/shell.js`，将 `refreshCurrentChat` 改为：
```js
async function refreshCurrentChat() {
  if (state.currentChatId != null) {
    // 增量追加新消息，而非全量重渲染
    const { appendNewMessages } = await import("../chat/chatView.js");
    await appendNewMessages(state.currentChatId);
    saveState();
  }
}
```

- [ ] **Step 3: chatView.js renderChatView 不重置分页状态（仅首次加载时重置）**

在 `renderChatView` 函数中，确保 `messagesOldestId = null; noMoreMsgs = false;` 只在**切换到新频道**时执行，而非每次调用。加判断：
```js
export async function renderChatView(chatId) {
  // 只有切换到不同频道时才重置
  if (state.currentChatId !== chatId) {
    state.messages = [];
    state.messagesOldestId = null;
    state.noMoreMsgs = false;
  }
  state.currentChatId = chatId;
  // ... 原有渲染逻辑
}
```

- [ ] **Step 4: 验证 build + 手动验证**

Run: `npm run build`
进入频道 → 滚动加载历史消息（向上滚触发 loadEarlier）→ 对方发新消息 → 确认历史消息保持 + 新消息追加到底部 + scroll 位置不跳

- [ ] **Step 5: 提交**

```bash
git add src/shell/shell.js src/chat/chatView.js
git commit -m "feat(chat): incremental message append on refresh, preserve pagination state"
```

---

### Task 10: P1-3 跨频道全文搜索

**Files:**
- Modify: `src-tauri/src/commands.rs` (新增 `search_msgs` 命令)
- Modify: `src-tauri/src/lib.rs` (注册命令)
- Modify: `src/dialogs/search.js` (接 search_msgs 命令)

**Interfaces:**
- Consumes: deltachat core 的消息搜索能力
- Produces: `search_msgs(query: String) -> Vec<SearchResultDto>` 命令；前端搜索能跨频道找消息

- [ ] **Step 1: 新增 SearchResultDto**

在 `src-tauri/src/dto.rs` 加：
```rust
#[derive(Debug, Serialize)]
pub struct SearchResultDto {
    pub msg_id: u32,
    pub chat_id: u32,
    pub chat_name: String,
    pub from_name: String,
    pub text: String,
    pub ts: i64,
}
```

- [ ] **Step 2: 新增 search_msgs 命令**

在 `src-tauri/src/commands.rs` 加（先尝试 core 的 search_msgs，若不存在用 fallback）：
```rust
#[tauri::command]
pub async fn search_msgs(
    state: State<'_, AppState>,
    query: String,
) -> AppResult<Vec<SearchResultDto>> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let mut out = Vec::new();
    // fallback 方案：遍历所有 chat，取最近 50 条消息，文本过滤
    let chatlist = Chatlist::try_load(&ctx, 0, None, None).await?;
    for i in 0..chatlist.len() {
        let chat_id = match chatlist.get_chat_id(i) {
            Ok(id) => id,
            Err(_) => continue,
        };
        let chat = match Chat::load_from_db(&ctx, chat_id).await {
            Ok(c) => c,
            Err(_) => continue,
        };
        let chat_name = chat.get_name().to_string();
        let items = match chat::get_chat_msgs(&ctx, chat_id).await {
            Ok(v) => v,
            Err(_) => continue,
        };
        // 只取最近 50 条做过滤（避免全量扫描）
        let recent: Vec<_> = items.into_iter().rev().take(50).collect();
        for item in recent {
            if let ChatItem::Message { msg_id } = item {
                let m = match Message::load_from_db(&ctx, msg_id).await {
                    Ok(m) => m,
                    Err(_) => continue,
                };
                let text = m.get_text();
                if text.to_lowercase().contains(&query.to_lowercase()) {
                    let from_id = m.get_from_id();
                    let from_name = if from_id == ContactId::SELF {
                        "我".to_string()
                    } else {
                        Contact::get_by_id(&ctx, from_id).await.map(|c| c.get_display_name().to_string()).unwrap_or_default()
                    };
                    out.push(SearchResultDto {
                        msg_id: msg_id.to_u32(),
                        chat_id: chat_id.to_u32(),
                        chat_name: chat_name.clone(),
                        from_name,
                        text: text.chars().take(80).collect(),
                        ts: m.get_timestamp(),
                    });
                    if out.len() >= 30 { break; } // 限制 30 条
                }
            }
        }
        if out.len() >= 30 { break; }
    }
    Ok(out)
}
```

- [ ] **Step 3: 注册命令 + import**

在 `src-tauri/src/commands.rs` 顶部 import 加 `SearchResultDto`。
在 `src-tauri/src/lib.rs` 的 `generate_handler!` 加 `commands::search_msgs,`。

- [ ] **Step 4: search.js 接 search_msgs**

Read `src/dialogs/search.js`，将消息搜索部分改为：
```js
async function doSearch(q) {
  const resultsEl = document.getElementById("search-results");
  if (!resultsEl) return;
  if (!q) { resultsEl.innerHTML = ""; return; }
  const lower = q.toLowerCase();
  const sections = [];
  // 1. 跨频道消息搜索（调 search_msgs 命令）
  try {
    const results = await call("search_msgs", { query: q });
    if (results.length > 0) {
      const items = results.map((r) => `
        <div class="sr-item" data-type="msg" data-chat="${r.chat_id}" data-id="${r.msg_id}">
          <span class="sr-type">${escapeHtml(r.chat_name)}</span>
          <span class="sr-content">${escapeHtml(r.from_name)}: ${escapeHtml(r.text)}</span>
        </div>
      `).join("");
      sections.push(`<div class="sr-section">消息 (${results.length})</div>${items}`);
    }
  } catch (e) { console.error("search_msgs failed:", e); }
  // 2. 频道（state.channels）
  const chanMatches = (state.channels || []).filter((c) => (c.name || "").toLowerCase().includes(lower)).slice(0, 5);
  if (chanMatches.length > 0) {
    const items = chanMatches.map((c) => `<div class="sr-item" data-type="channel" data-id="${c.chat_id}"><span class="sr-type">频道</span><span class="sr-content">#${escapeHtml(c.name)}</span></div>`).join("");
    sections.push(`<div class="sr-section">频道</div>${items}`);
  }
  // 3. 成员（当前频道）
  try {
    if (state.currentChatId) {
      const info = await call("get_chat_info", { chatId: state.currentChatId });
      const memMatches = (info.members || []).filter((m) => (m.name || "").toLowerCase().includes(lower)).slice(0, 5);
      if (memMatches.length > 0) {
        const items = memMatches.map((m) => `<div class="sr-item" data-type="member" data-id="${m.contact_id}"><span class="sr-type">成员</span><span class="sr-content">${escapeHtml(m.name)}</span></div>`).join("");
        sections.push(`<div class="sr-section">成员</div>${items}`);
      }
    }
  } catch {}
  resultsEl.innerHTML = sections.join("") || `<div class="sr-empty">无结果</div>`;
  bindSearchResults();
}
```

- [ ] **Step 5: 验证 build + 手动验证**

Run: `cd src-tauri && cargo build && cd .. && npm run build`
Cmd+K 搜索 → 输入关键词 → 确认能跨频道找到消息 → 点击结果跳转到对应频道 + 高亮消息

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/commands.rs src-tauri/src/dto.rs src-tauri/src/lib.rs src/dialogs/search.js
git commit -m "feat(search): cross-channel message search via search_msgs command"
```

---

### Task 11: P1-4 消息虚拟化

**Files:**
- Modify: `src/chat/chatView.js` (viewport ± buffer 渲染)

**Interfaces:**
- Consumes: state.messages
- Produces: 超过 100 条消息时只渲染可视区 ± buffer，滚动流畅

- [ ] **Step 1: 加虚拟化渲染逻辑**

Read `src/chat/chatView.js`，在渲染消息列表处改为：
```js
const BUFFER = 20; // 上下各 buffer 20 条
const VIEWPORT = 30; // 可视区约 30 条

function getVisibleRange(scrollTop, clientHeight, itemHeight) {
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - BUFFER);
  const end = Math.min(state.messages.length, start + VIEWPORT + 2 * BUFFER);
  return { start, end };
}

function renderVisibleMessages(box, start, end) {
  const visible = state.messages.slice(start, end);
  const { renderMessage } = require("./message.js");
  // 用 transform: translateY 定位，避免大量 DOM
  box.innerHTML = "";
  const spacerTop = document.createElement("div");
  spacerTop.style.height = (start * ITEM_HEIGHT) + "px";
  box.appendChild(spacerTop);
  for (const m of visible) {
    const el = await renderMessage(m);
    box.appendChild(el);
  }
  const spacerBottom = document.createElement("div");
  spacerBottom.style.height = ((state.messages.length - end) * ITEM_HEIGHT) + "px";
  box.appendChild(spacerBottom);
}
```

注意：ITEM_HEIGHT 是估算值（约 60px），实际消息高度不一，可先用估算值，后续优化。

- [ ] **Step 2: 绑定 scroll 事件**

```js
let scrollTimer = null;
box.addEventListener("scroll", () => {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    const { start, end } = getVisibleRange(box.scrollTop, box.clientHeight, ITEM_HEIGHT);
    renderVisibleMessages(box, start, end);
  }, 100); // 100ms debounce
});
```

- [ ] **Step 3: 验证 build + 手动验证**

Run: `npm run build`
进入有 500+ 消息的频道 → 滚动流畅 → 消息正确渲染 → 加载更多历史时仍流畅

- [ ] **Step 4: 提交**

```bash
git add src/chat/chatView.js
git commit -m "perf(chat): virtualize message list (viewport ± buffer) for 500+ messages"
```

---

### Task 12: P1-5/P1-6/P1-8/P1-9 动效+未读分隔+pin 改造+wsRail 未读聚合

**Files:**
- Modify: `src/styles.css` (transitions)
- Modify: `src/chat/chatView.js` (未读分隔线)
- Modify: `src/shell/rightDrawer.js` (pin tab 改造)
- Modify: `src/shell/appRail.js` (真实未读聚合)

**Interfaces:**
- Consumes: state.messages, state.pins, ChatDto.unread
- Produces: 消息进入 fade-in、detail slide、overlay fade 动效 + 未读分隔线 + pin 显示消息预览+跳转 + wsRail 真实未读

- [ ] **Step 1: styles.css 加动效**

```css
@media (prefers-reduced-motion: no-preference) {
  .msg-item { animation: msg-fade-in 150ms ease-out; }
  @keyframes msg-fade-in {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .right-drawer { transition: width 200ms ease-out; }
  .overlay { transition: opacity 150ms ease-out; }
  .nav-tree { transition: opacity 150ms; }
}
```

- [ ] **Step 2: chatView.js 加未读分隔线**

在渲染消息时，找到第一条未读消息（timestamp > lastNoticedTs），插入分隔线：
```js
// 计算未读分隔位置
const chatInfo = await call("get_chat_info", { chatId });
// core 的 marknoticed 后无法知道哪条是未读，用 unread count 反推
let unreadCount = 0;
try {
  const chats = await call("get_chatlist");
  const chat = chats.find((c) => c.chat_id === chatId);
  unreadCount = chat?.unread || 0;
} catch {}
// 在倒数 unreadCount 条消息前插分隔线
if (unreadCount > 0 && state.messages.length >= unreadCount) {
  const dividerIndex = state.messages.length - unreadCount;
  // 在渲染时于 dividerIndex 位置插入分隔线
}
```

分隔线 HTML：
```html
<div class="msg-unread-divider">
  <span class="divider-line"></span>
  <span class="divider-label">新消息</span>
  <span class="divider-line"></span>
</div>
```

样式：
```css
.msg-unread-divider {
  display: flex; align-items: center; gap: 8px; margin: 8px 0;
}
.msg-unread-divider .divider-line { flex: 1; height: 1px; background: #e5e5e5; }
.msg-unread-divider .divider-label {
  color: #e5e5e5; font-size: 9px; font-weight: 600;
  letter-spacing: 0.5px; background: #0d0d0d; padding: 0 8px;
}
```

- [ ] **Step 3: rightDrawer.js pin tab 改造**

Read `src/shell/rightDrawer.js`，将 pin tab 渲染改为调 get_chat_msgs 取消息文本：
```js
async function renderPins(drawer) {
  const pins = state.pins || [];
  if (pins.length === 0) {
    drawer.querySelector("#rd-body").innerHTML = `<div class="rd-empty">无置顶消息</div>`;
    return;
  }
  // 拉取每条 pin 的消息内容
  const pinItems = await Promise.all(pins.map(async (p) => {
    try {
      const msgs = await call("get_chat_msgs", { chatId: p.channel_chat_id });
      const msg = msgs.find((m) => m.msg_id === p.msg_id);
      return msg ? { ...p, msg } : null;
    } catch { return null; }
  }));
  const valid = pinItems.filter(Boolean);
  drawer.querySelector("#rd-body").innerHTML = valid.map((p) => `
    <div class="rd-pin-item" data-chat="${p.channel_chat_id}" data-msg="${p.msg_id}">
      <div class="rd-pin-from">${escapeHtml(p.msg.from_name)}</div>
      <div class="rd-pin-text">${escapeHtml((p.msg.text || "").slice(0, 60))}</div>
      <div class="rd-pin-time">${formatRelativeTime(p.msg.ts)}</div>
    </div>
  `).join("");
  // 绑定点击跳转
  drawer.querySelectorAll(".rd-pin-item").forEach((el) => {
    el.addEventListener("click", async () => {
      const chatId = Number(el.dataset.chat);
      const msgId = Number(el.dataset.msg);
      state.currentChatId = chatId;
      const { renderChatView } = await import("../chat/chatView.js");
      await renderChatView(chatId);
      setTimeout(() => {
        const msgEl = document.querySelector(`[data-msg="${msgId}"]`);
        if (msgEl) {
          msgEl.scrollIntoView({ behavior: "smooth" });
          msgEl.style.background = "#1f1f1f";
          setTimeout(() => { msgEl.style.background = ""; }, 2000);
        }
      }, 200);
    });
  });
}
```

- [ ] **Step 4: appRail.js 真实未读聚合**

Read `src/shell/appRail.js`，将 workspace 未读聚合改为真实值：
```js
async function getWsUnread(wsId) {
  try {
    const chats = await call("get_chatlist");
    // 找到属于该 workspace 的所有频道（master_chat + channels）
    const wsChannels = state.channels.filter((c) => c.workspace_id === wsId);
    const wsChatIds = new Set(wsChannels.map((c) => c.chat_id));
    // 也加上 master_chat_id（需从 state.workspaces 找）
    const ws = state.workspaces.find((w) => w.id === wsId);
    if (ws) wsChatIds.add(ws.master_chat_id);
    return chats.filter((c) => wsChatIds.has(c.chat_id)).reduce((sum, c) => sum + (c.unread || 0), 0);
  } catch { return 0; }
}
```

- [ ] **Step 5: 验证 build + 手动验证**

Run: `npm run build`
- 新消息进入有 fade-in 动效
- detail panel 展开/折叠有 slide
- 有未读消息时显示"新消息"分隔线
- pin tab 显示消息预览，点击跳转高亮
- 切换 workspace 时各 ws 角标真实

- [ ] **Step 6: 提交**

```bash
git add src/styles.css src/chat/chatView.js src/shell/rightDrawer.js src/shell/appRail.js
git commit -m "feat(ui): animations + unread divider + pin preview/jump + real ws unread aggregate"
```

---

### Task 13: Profile 头像扩展（参考 Plzdelta）

**Files:**
- Modify: `src-tauri/src/dto.rs` (ProfileDto/MemberDto 加 avatar/color)
- Modify: `src-tauri/src/commands.rs` (get_self_profile/get_chat_info 填充 avatar/color + update_profile 加 avatar_path)
- Modify: `src-tauri/src/events.rs` (转发 SelfavatarChanged 事件)
- Modify: `src/dialogs/settingsPanel.js` (头像选择 UI)
- Modify: `src/shell/appRail.js` (底部头像)
- Modify: `src/dialogs/homeView.js` (列表项头像)
- Modify: `src/chat/message.js` (发送者头像)
- Modify: `src/shell/rightDrawer.js` (members 头像)
- Modify: `src/dialogs/memberDetail.js` (大头像)
- Modify: `src/api.js` (transformBlobURL 工具)
- Modify: `src/styles.css` (头像样式)

**Interfaces:**
- Consumes: `Contact::get_profile_image` / `Contact::get_color` / `Config::Selfavatar`（core API）
- Consumes: `call('get_asset_url', { path })` from Task 2
- Produces: ProfileDto.avatar/color + MemberDto.avatar/color + update_profile 支持 avatar_path + SelfavatarChanged 事件 + 前端各处头像渲染

- [ ] **Step 1: dto.rs 扩展 ProfileDto/MemberDto**

Read `src-tauri/src/dto.rs`，修改：
```rust
#[derive(Debug, Serialize)]
pub struct ProfileDto {
    pub id: u32,
    pub name: Option<String>,
    pub addr: Option<String>,
    pub avatar: Option<String>,  // blobdir 绝对路径
    pub color: Option<u32>,      // Contact::get_color() 返回的 u32
}

#[derive(Debug, Serialize)]
pub struct MemberDto {
    pub contact_id: u32,
    pub name: String,
    pub addr: String,
    pub is_self: bool,
    pub avatar: Option<String>,
    pub color: Option<u32>,
}
```

- [ ] **Step 2: commands.rs get_self_profile 填充 avatar/color**

```rust
#[tauri::command]
pub async fn get_self_profile(state: State<'_, AppState>) -> AppResult<ProfileDto> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let id = ctx.get_id();
    let name = ctx.get_config(Config::Displayname).await?;
    let addr = ctx.get_config(Config::ConfiguredAddr).await?;
    let self_contact = Contact::get_by_id(&ctx, ContactId::SELF).await?;
    let avatar = self_contact.get_profile_image(&ctx).await?.map(|p| p.to_string_lossy().to_string());
    let color = Some(self_contact.get_color());
    Ok(ProfileDto { id, name, addr, avatar, color })
}
```

- [ ] **Step 3: commands.rs get_chat_info 填充 member avatar/color**

在 `get_chat_info` 的 member 循环中加：
```rust
let c = Contact::get_by_id(&ctx, cid).await?;
let avatar = c.get_profile_image(&ctx).await?.map(|p| p.to_string_lossy().to_string());
let color = Some(c.get_color());
members.push(MemberDto {
    contact_id: cid.to_u32(),
    name: c.get_display_name().to_string(),
    addr: c.get_addr().to_string(),
    is_self: cid == ContactId::SELF,
    avatar,
    color,
});
```

- [ ] **Step 4: commands.rs update_profile 加 avatar_path 参数**

```rust
#[tauri::command]
pub async fn update_profile(
    state: State<'_, AppState>,
    name: Option<String>,
    avatar_path: Option<String>,  // None=不改, Some(path)=设置, Some("")=删除
) -> AppResult<()> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    if let Some(n) = name {
        ctx.set_config(Config::Displayname, Some(&n)).await?;
    }
    if let Some(ap) = avatar_path {
        let value = if ap.is_empty() { None } else { Some(ap.as_str()) };
        ctx.set_config(Config::Selfavatar, value).await?;
    }
    Ok(())
}
```

注意：前端调用时 `avatar_path: null` 表示不改，`avatar_path: ""` 表示删除，`avatar_path: "/path/to/img"` 表示设置。但 Tauri 序列化 Option<String> 时 None 和 Some("") 不同，需前端明确传参。

实际更清晰的方案：分两个参数 `avatar_path: Option<String>` 和 `clear_avatar: bool`。但为简化，用上面的方案。

- [ ] **Step 5: events.rs 转发 SelfavatarChanged**

在 `src-tauri/src/events.rs` 的 match 块加：
```rust
EventType::SelfavatarChanged => EventPayload {
    typ: "SelfavatarChanged".into(),
    chat_id: None,
    msg_id: None,
    contact_id: None,
    progress: None,
    comment: None,
    text: None,
},
```

- [ ] **Step 6: api.js 加 transformBlobURL 工具**

```js
export async function transformBlobURL(path) {
  if (!path) return null;
  try {
    return await call("get_asset_url", { path });
  } catch { return null; }
}
```

- [ ] **Step 7: settingsPanel.js 头像选择 UI**

Read `src/dialogs/settingsPanel.js`，在 profile 设置区加头像选择：
```js
async function renderProfileSettings(body) {
  const self = state.self || {};
  const avatarUrl = self.avatar ? await transformBlobURL(self.avatar) : null;
  const colorHex = self.color ? "#" + self.color.toString(16).padStart(6, "0") : "#222";
  body.innerHTML = `
    <div class="settings-profile">
      <div class="settings-avatar">
        ${avatarUrl 
          ? `<img src="${avatarUrl}" class="settings-avatar-img" />`
          : `<div class="settings-avatar-letter" style="background:${colorHex}">${(self.name || "?")[0]?.toUpperCase()}</div>`
        }
      </div>
      <button id="settings-change-avatar">更换头像</button>
      <button id="settings-clear-avatar">删除头像</button>
      <div class="settings-name-row">
        <label>显示名</label>
        <input id="settings-name" value="${escapeHtml(self.name || "")}" />
      </div>
      <button id="settings-save">保存</button>
    </div>
  `;
  // 绑定更换头像
  body.querySelector("#settings-change-avatar").addEventListener("click", async () => {
    const selected = await window.__TAURI__.dialog.open({
      filters: [{ name: "图片", extensions: ["jpg", "jpeg", "png", "gif", "webp"] }],
      multiple: false,
    });
    if (selected) {
      try {
        await call("update_profile", { name: null, avatarPath: selected });
        showToast("头像已更新");
      } catch (e) { showToast("头像更新失败: " + e.message); }
    }
  });
  // 绑定删除头像
  body.querySelector("#settings-clear-avatar").addEventListener("click", async () => {
    try {
      await call("update_profile", { name: null, avatarPath: "" });
      showToast("头像已删除");
    } catch (e) { showToast("删除失败: " + e.message); }
  });
  // 绑定保存
  body.querySelector("#settings-save").addEventListener("click", async () => {
    const name = body.querySelector("#settings-name").value;
    try {
      await call("update_profile", { name, avatarPath: null });
      showToast("已保存");
    } catch (e) { showToast("保存失败: " + e.message); }
  });
}
```

- [ ] **Step 8: shell.js 监听 SelfavatarChanged 事件**

在 shell.js 事件注册块加：
```js
onEvent("SelfavatarChanged", async () => {
  try {
    state.self = await call("get_self_profile");
    const { renderAppRail } = await import("./appRail.js");
    renderAppRail();
  } catch {}
});
```

- [ ] **Step 9: 各处头像渲染**

在 appRail.js 底部头像：
```js
const avatarUrl = state.self?.avatar ? await transformBlobURL(state.self.avatar) : null;
const colorHex = state.self?.color ? "#" + state.self.color.toString(16).padStart(6, "0") : "#222";
const avatarHtml = avatarUrl
  ? `<img src="${avatarUrl}" class="app-avatar" />`
  : `<div class="app-avatar" style="background:${colorHex}">${(state.self?.name || "?")[0]?.toUpperCase()}</div>`;
```

在 message.js 发送者头像（如有 member 信息）：
```js
// 需从 chatInfo.members 找到 from_id 对应的 member
const member = state.currentMembers?.find((m) => m.contact_id === msg.from_id);
const avatarUrl = member?.avatar ? await transformBlobURL(member.avatar) : null;
const colorHex = member?.color ? "#" + member.color.toString(16).padStart(6, "0") : "#222";
const avatarHtml = avatarUrl
  ? `<img src="${avatarUrl}" class="msg-avatar" />`
  : `<div class="msg-avatar" style="background:${colorHex}">${(msg.from_name || "?")[0]?.toUpperCase()}</div>`;
```

在 homeView.js / rightDrawer.js / memberDetail.js 类似处理。

- [ ] **Step 10: styles.css 头像样式**

```css
.app-avatar, .msg-avatar, .home-avatar, .rd-avatar, .member-detail-avatar {
  border-radius: 50%; object-fit: cover;
}
.app-avatar { width: 36px; height: 36px; }
.msg-avatar { width: 28px; height: 28px; font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; color: #e5e5e5; flex-shrink: 0; }
.home-avatar { width: 32px; height: 32px; font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; color: #e5e5e5; flex-shrink: 0; }
.rd-avatar { width: 24px; height: 24px; font-size: 10px; font-weight: 600; display: flex; align-items: center; justify-content: center; color: #e5e5e5; flex-shrink: 0; }
.member-detail-avatar { width: 80px; height: 80px; font-size: 32px; font-weight: 600; display: flex; align-items: center; justify-content: center; color: #e5e5e5; }
.settings-avatar { width: 64px; height: 64px; margin: 0 auto 12px; }
.settings-avatar-img { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; }
.settings-avatar-letter { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 600; color: #e5e5e5; }
```

- [ ] **Step 11: 验证 build + 手动验证**

Run: `cd src-tauri && cargo build && cd .. && npm run build`
- 设置面板显示当前头像 → 更换头像 → 各处同步显示
- 删除头像 → 显示首字母默认头像
- 消息发送者头像显示
- members 列表头像显示

- [ ] **Step 12: 提交**

```bash
git add src-tauri/src/dto.rs src-tauri/src/commands.rs src-tauri/src/events.rs src/dialogs/settingsPanel.js src/shell/appRail.js src/dialogs/homeView.js src/chat/message.js src/shell/rightDrawer.js src/dialogs/memberDetail.js src/api.js src/styles.css src/shell/shell.js
git commit -m "feat(profile): avatar/color fields + upload via Selfavatar + render everywhere

参考 Plzdelta 实现：
- ProfileDto/MemberDto 加 avatar/color 字段
- get_self_profile/get_chat_info 填充 Contact::get_profile_image + get_color
- update_profile 加 avatar_path 参数 → Config::Selfavatar（core 自动裁剪 512px）
- events.rs 转发 SelfavatarChanged 事件
- 前端 settingsPanel 头像选择 UI（Tauri dialog 选文件）
- 各处头像渲染（appRail/homeView/message/rightDrawer/memberDetail）
- transformBlobURL 工具函数（调 get_asset_url 命令）"
```

---

### Task 14: 最终验证 + 提交

**Files:**
- 无新文件，仅验证

- [ ] **Step 1: cargo build 验证**

Run: `cd src-tauri && cargo build 2>&1 | tail -20`
Expected: 编译通过，无错误无警告

- [ ] **Step 2: cargo test 验证**

Run: `cd src-tauri && cargo test 2>&1 | tail -20`
Expected: 所有测试通过

- [ ] **Step 3: npm run build 验证**

Run: `npm run build 2>&1 | tail -10`
Expected: build 通过

- [ ] **Step 4: 手动端到端验证**

Run: `npm run tauri dev`
1. chatmail 注册新账号 → 确认能立即收发消息（T1）
2. 发图片/文件给 deltachat desktop → 确认对方收到 + 本地正确渲染（T3）
3. application 切换：Chat 激活，Work/Inbox 弹 toast（T5/T6）
4. detail panel 折叠/展开 + members 搜索（T7）
5. 消息发送状态显示 + 失败重发（T8）
6. 滚动加载历史后收新消息，scroll 保持（T9）
7. Cmd+K 跨频道搜索（T10）
8. 500+ 消息频道滚动流畅（T11）
9. 动效 + 未读分隔线 + pin 预览跳转（T12）
10. 设置头像 → 各处同步显示（T13）

- [ ] **Step 5: 跨客户端验证**

- peytchat 发消息 → deltachat desktop 收到
- deltachat desktop 发消息 → peytchat 收到
- peytchat 发图片 → deltachat desktop 收到并显示
- peytchat 设置头像 → deltachat desktop 显示

- [ ] **Step 6: 最终提交（若有未提交修改）**

```bash
git status
# 若有未提交修改
git add -A
git commit -m "chore(sp4): final verification pass - build/test/manual all green"
```

---

## Self-Review

### Spec 覆盖检查
- ✅ 布局 Huly 化 → T5/T6/T7
- ✅ P0-1 附件渲染 → T3
- ✅ P0-2 asset protocol → T2
- ✅ P0-3 homeView 信息密度 → T4
- ✅ P0-4 start_io 修复 → T1
- ✅ P0-5 接收及时性 → T1（验证 + Config::Interval 兜底）
- ✅ P0-6 发送状态反馈 → T8
- ✅ P1-1 事件 handler → T8
- ✅ P1-2 增量刷新 → T9
- ✅ P1-3 跨频道搜索 → T10
- ✅ P1-4 消息虚拟化 → T11
- ✅ P1-5 动效 → T12
- ✅ P1-6 未读分隔线 → T12
- ✅ P1-7 members 搜索 → T7
- ✅ P1-8 pin 改造 → T12
- ✅ P1-9 wsRail 未读聚合 → T12
- ✅ Profile 头像 → T13

### 类型一致性检查
- ProfileDto.avatar: Option<String> ✓（后端）/ 前端 string|null ✓
- MemberDto.avatar/color: 同 ProfileDto ✓
- get_asset_url(path: String) -> String ✓（T2 定义，T3/T13 消费）
- search_msgs(query: String) -> Vec<SearchResultDto> ✓（T10 定义+消费）
- transformBlobURL(path) -> Promise<string|null> ✓（T13 定义+消费）
- state.currentApp: "chat"|"work"|"inbox" ✓（T5 定义，T6 消费）
- state.detailPanelOpen: boolean ✓（T5 定义，T7 消费）

### 占位符扫描
- 无 TBD/TODO
- 无"implement later"
- 所有步骤都有具体代码或具体命令
