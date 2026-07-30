# SP3 社交入口 + 全局体验 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从「能用」到「好用」——补齐社交扩展入口(加好友/QR/建群/请求处理/成员转私聊/右键菜单/二维码)与全局体验(Cmd+K 搜索/ESC/Cmd+Enter/Dock 角标/通知/实时刷新/持久化/空状态),使应用具备现代桌面社区应用完整感。

**Architecture:** 后端新增 2 命令(create_group_chat + create_chat_by_contact);前端新增 7 个 dialog 模块(homePlus/contactRequest/memberDetail/contextMenu/qrShow/search/persist)+ 改造 shell/homeView/channelTree/rightDrawer/settingsPanel;全局快捷键 + 事件刷新扩展 + localStorage 持久化 + Tauri notification/badge API 接入。

**Tech Stack:** Rust + Tauri v2 + deltachat crate + rusqlite(后端);Vanilla JS + Vite + highlight.js + qrcode(前端)。

## Global Constraints

- `chatmail/core` 禁止修改,所有改动在 `src-tauri/` 与 `src/` 内
- 暗色主题色板固定(继承 SP1/SP2):底 `#0d0d0d` / 面板 `#0a0a0a` / 边框 `#1a1a1a`/`#222` / active `#1f1f1f` / capsule `#161616` / 文字 `#e5e5e5`/`#d4d4d4`/`#888`/`#555`/`#444`
- 仅黑白灰阶,不引入彩色/emoji
- 无多级菜单;会话操作走右键轻量菜单(单层,不超过 5 项)
- 桌面应用思维;核心功能 3 次点击内
- DTO snake_case;rusqlite 用 `spawn_blocking`
- 现有命令复用:create_chat_by_email / accept_chat / block_chat / delete_chat / secure_join / get_chat_info / get_my_qr / list_roles / list_channels / list_workspaces
- qrcode npm 包已安装(^1.5.4)

---

## File Structure

**后端:**
- `src-tauri/src/commands.rs`(改):新增 `create_group_chat` + `create_chat_by_contact`
- `src-tauri/src/lib.rs`(改):注册新命令 + Tauri notification permission 配置

**前端:**
- `src/persist.js`(新):localStorage 读写 saveState/loadState
- `src/dialogs/homePlus.js`(新):主页 + 按钮 overlay
- `src/dialogs/contactRequest.js`(新):联系人请求处理视图
- `src/dialogs/memberDetail.js`(新):成员详情 + 发消息
- `src/dialogs/contextMenu.js`(新):单层右键菜单
- `src/dialogs/qrShow.js`(新):我的二维码展示
- `src/dialogs/search.js`(新):Cmd+K 全局搜索 overlay
- `src/state.js`(改):加 searchOpen 字段
- `src/shell/shell.js`(改):全局快捷键 + 事件刷新扩展 + 持久化恢复 + Dock 角标 + 通知
- `src/shell/wsRail.js`(改):实时聚合角标刷新
- `src/shell/channelTree.js`(改):折叠持久化(已在 SP2 完成,SP3 只读不改)
- `src/shell/rightDrawer.js`(改):members tab 成员项 click → 成员详情
- `src/dialogs/homeView.js`(改):+ 按钮 + 请求处理入口 + 空状态引导 + 右键菜单
- `src/chat/chatView.js`(改):空消息引导(SP2 已有,SP3 不改)
- `src/dialogs/settingsPanel.js`(改):我的二维码改用 qrShow.js
- `src/styles.css`(改):context-menu / search-overlay / qr-overlay 样式

---

### Task 1: 后端新增 create_group_chat + create_chat_by_contact 命令

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `AppState` from SP1, core `chat::create_group_chat` + `chat::create_by_contact_id`
- Produces: `create_group_chat(name: String) -> AppResult<u32>`, `create_chat_by_contact(contact_id: u32) -> AppResult<u32>`

- [ ] **Step 1: 在 commands.rs 末尾添加命令**

在 `src-tauri/src/commands.rs` 文件末尾(`delete_msg` 之后)添加:

```rust
#[tauri::command]
pub async fn create_group_chat(
    state: State<'_, AppState>,
    name: String,
) -> AppResult<u32> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let chat_id = chat::create_group_chat(&ctx, &name).await?;
    Ok(chat_id.to_u32())
}

#[tauri::command]
pub async fn create_chat_by_contact(
    state: State<'_, AppState>,
    contact_id: u32,
) -> AppResult<u32> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let chat_id = chat::create_by_contact_id(&ctx, deltachat::contact::ContactId::new(contact_id)).await?;
    Ok(chat_id.to_u32())
}
```

注意:
- `chat::create_group_chat(context, name) -> Result<ChatId>` — 查 core/src/chat.rs 确认签名。
- `chat::create_by_contact_id(context, contact_id) -> Result<ChatId>` — 查 core/src/chat.rs 确认。
- 若签名不符,implementer 查阅 core 源码调整,在 report 记录偏差。

- [ ] **Step 2: 在 lib.rs 注册命令**

修改 `src-tauri/src/lib.rs` 的 `invoke_handler` 宏,在现有命令列表末尾(`commands::delete_msg,` 之后)添加:

```rust
commands::create_group_chat,
commands::create_chat_by_contact,
```

- [ ] **Step 3: 编译验证**

Run: `cd src-tauri && cargo build`
Expected: 编译通过(若 API 签名不符,调整后重试;记录偏差)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(cmd): add create_group_chat and create_chat_by_contact commands"
```

---

### Task 2: src/persist.js + state.js searchOpen 字段

**Files:**
- Create: `src/persist.js`
- Modify: `src/state.js`

**Interfaces:**
- Produces: `saveState()` / `loadState()` 函数;`state.searchOpen` 字段

- [ ] **Step 1: 创建 src/persist.js**

```js
import { state } from "./state.js";

const KEYS = {
  currentWsId: "peytchat.currentWsId",
  currentChatId: "peytchat.currentChatId",
  homeMode: "peytchat.homeMode",
};

export function saveState() {
  try {
    if (state.currentWsId != null) {
      localStorage.setItem(KEYS.currentWsId, String(state.currentWsId));
    } else {
      localStorage.removeItem(KEYS.currentWsId);
    }
    if (state.currentChatId != null) {
      localStorage.setItem(KEYS.currentChatId, String(state.currentChatId));
    } else {
      localStorage.removeItem(KEYS.currentChatId);
    }
    localStorage.setItem(KEYS.homeMode, state.homeMode ? "1" : "0");
  } catch {}
}

export function loadState() {
  try {
    const wsId = localStorage.getItem(KEYS.currentWsId);
    const chatId = localStorage.getItem(KEYS.currentChatId);
    const homeMode = localStorage.getItem(KEYS.homeMode);
    state.currentWsId = wsId ? Number(wsId) : null;
    state.currentChatId = chatId ? Number(chatId) : null;
    state.homeMode = homeMode === "1";
  } catch {}
}
```

注意:`collapsedCategories` 已由 channelTree.js(Task 8 SP2)直接读写 localStorage,不在此处管理。

- [ ] **Step 2: 修改 src/state.js 加 searchOpen 字段**

在 state 对象末尾(`collapsedCategories: {},` 之后)加:
```js
  searchOpen: false,
```

- [ ] **Step 3: build 验证**

Run: `npm run build`
Expected: 成功

- [ ] **Step 4: Commit**

```bash
git add src/persist.js src/state.js
git commit -m "feat(persist): add localStorage save/load and searchOpen state field"
```

---

### Task 3: src/dialogs/contextMenu.js 通用右键菜单

**Files:**
- Create: `src/dialogs/contextMenu.js`
- Modify: `src/styles.css`

**Interfaces:**
- Produces: `showContextMenu(x, y, items)` 函数,items 为 `{label, action}` 数组

- [ ] **Step 1: 创建 src/dialogs/contextMenu.js**

```js
let currentMenu = null;

export function showContextMenu(x, y, items) {
  // 关闭已有菜单
  hideContextMenu();
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.innerHTML = items.map((it, i) => `<div class="cm-item" data-i="${i}">${escapeHtml(it.label)}</div>`).join("");
  document.body.appendChild(menu);
  currentMenu = menu;
  menu.querySelectorAll(".cm-item").forEach((el) => {
    el.addEventListener("click", () => {
      const i = Number(el.dataset.i);
      hideContextMenu();
      const action = items[i]?.action;
      if (action) action();
    });
  });
  // 点击菜单外关闭
  setTimeout(() => {
    document.addEventListener("click", hideContextMenu, { once: true });
  }, 0);
}

export function hideContextMenu() {
  if (currentMenu) {
    currentMenu.remove();
    currentMenu = null;
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
```

- [ ] **Step 2: 在 src/styles.css 末尾追加样式**

```css

/* context menu */
.context-menu {
  position: fixed;
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  padding: 4px 0;
  min-width: 120px;
  z-index: 200;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}
.context-menu .cm-item {
  padding: 6px 16px;
  font-size: 11px;
  color: var(--text);
  cursor: pointer;
}
.context-menu .cm-item:hover {
  background: var(--active);
}
```

- [ ] **Step 3: build 验证**

Run: `npm run build`
Expected: 成功

- [ ] **Step 4: Commit**

```bash
git add src/dialogs/contextMenu.js src/styles.css
git commit -m "feat(contextMenu): add single-layer right-click menu component"
```

---

### Task 4: src/dialogs/homePlus.js 主页 + 按钮 overlay

**Files:**
- Create: `src/dialogs/homePlus.js`

**Interfaces:**
- Consumes: `create_chat_by_email` / `secure_join` / `create_group_chat` 命令
- Produces: `openHomePlus(onDone)` 函数,弹出 overlay 含 3 选项

- [ ] **Step 1: 创建 src/dialogs/homePlus.js**

```js
import { call } from "../api.js";
import { showToast } from "../toast.js";
import { state } from "../state.js";
import { renderChatView } from "../chat/chatView.js";
import { renderHomeView } from "./homeView.js";

export function openHomePlus() {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.style.display = "flex";
  overlay.innerHTML = `
    <div class="dialog" style="max-width:320px">
      <h2>新建</h2>
      <div style="display:flex;flex-direction:column;gap:8px;margin:8px 0">
        <button class="hp-opt" data-act="add" style="background:#161616;border:1px solid #222;color:#e5e5e5;padding:10px;border-radius:4px;font-size:11px;cursor:pointer;text-align:left">添加好友(邮箱)</button>
        <button class="hp-opt" data-act="qr" style="background:#161616;border:1px solid #222;color:#e5e5e5;padding:10px;border-radius:4px;font-size:11px;cursor:pointer;text-align:left">通过 QR 加入</button>
        <button class="hp-opt" data-act="group" style="background:#161616;border:1px solid #222;color:#e5e5e5;padding:10px;border-radius:4px;font-size:11px;cursor:pointer;text-align:left">创建群</button>
      </div>
      <div id="hp-form" style="display:none;flex-direction:column;gap:8px;margin:8px 0"></div>
      <div class="dialog-actions">
        <button id="hp-close">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelectorAll(".hp-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.act;
      showForm(act, overlay);
    });
  });
  document.getElementById("hp-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
}

function showForm(act, overlay) {
  const form = overlay.querySelector("#hp-form");
  form.style.display = "flex";
  if (act === "add") {
    form.innerHTML = `
      <input id="hp-email" type="email" placeholder="好友邮箱地址" style="background:#0a0a0a;border:1px solid #222;border-radius:4px;padding:8px 12px;color:#e5e5e5;font-size:11px" />
      <button id="hp-submit" style="background:#e5e5e5;color:#0a0a0a;border:none;padding:8px;border-radius:4px;font-size:11px;cursor:pointer">添加</button>
    `;
    document.getElementById("hp-submit").addEventListener("click", async () => {
      const email = document.getElementById("hp-email").value.trim();
      if (!email) return;
      try {
        const chatId = await call("create_chat_by_email", { email });
        overlay.remove();
        state.homeMode = true;
        state.currentWsId = null;
        state.currentChatId = chatId;
        await renderHomeView();
        await renderChatView(chatId);
        showToast("已添加");
      } catch (e) { showToast(e.message || String(e)); }
    });
  } else if (act === "qr") {
    form.innerHTML = `
      <input id="hp-qr" placeholder="粘贴 SecureJoin QR 链接" style="background:#0a0a0a;border:1px solid #222;border-radius:4px;padding:8px 12px;color:#e5e5e5;font-size:11px" />
      <button id="hp-submit" style="background:#e5e5e5;color:#0a0a0a;border:none;padding:8px;border-radius:4px;font-size:11px;cursor:pointer">加入</button>
    `;
    document.getElementById("hp-submit").addEventListener("click", async () => {
      const qr = document.getElementById("hp-qr").value.trim();
      if (!qr) return;
      try {
        const chatId = await call("secure_join", { qr });
        overlay.remove();
        state.homeMode = true;
        state.currentWsId = null;
        state.currentChatId = chatId;
        await renderHomeView();
        await renderChatView(chatId);
        showToast("已加入");
      } catch (e) { showToast(e.message || String(e)); }
    });
  } else if (act === "group") {
    form.innerHTML = `
      <input id="hp-name" placeholder="群名称" style="background:#0a0a0a;border:1px solid #222;border-radius:4px;padding:8px 12px;color:#e5e5e5;font-size:11px" />
      <button id="hp-submit" style="background:#e5e5e5;color:#0a0a0a;border:none;padding:8px;border-radius:4px;font-size:11px;cursor:pointer">创建</button>
    `;
    document.getElementById("hp-submit").addEventListener("click", async () => {
      const name = document.getElementById("hp-name").value.trim();
      if (!name) return;
      try {
        const chatId = await call("create_group_chat", { name });
        overlay.remove();
        state.homeMode = true;
        state.currentWsId = null;
        state.currentChatId = chatId;
        await renderHomeView();
        await renderChatView(chatId);
        showToast("已创建群");
      } catch (e) { showToast(e.message || String(e)); }
    });
  }
}
```

- [ ] **Step 2: build 验证**

Run: `npm run build`
Expected: 成功

- [ ] **Step 3: Commit**

```bash
git add src/dialogs/homePlus.js
git commit -m "feat(homePlus): add home plus button overlay (add friend/QR join/create group)"
```

---

### Task 5: src/dialogs/contactRequest.js 联系人请求处理

**Files:**
- Create: `src/dialogs/contactRequest.js`

**Interfaces:**
- Consumes: `accept_chat` / `block_chat` / `delete_chat` 命令 + `get_chat_info`
- Produces: `renderContactRequest(chatId, mainEl)` 函数,渲染请求处理视图

- [ ] **Step 1: 创建 src/dialogs/contactRequest.js**

```js
import { call } from "../api.js";
import { showToast } from "../toast.js";
import { state } from "../state.js";
import { renderChatView } from "../chat/chatView.js";
import { renderHomeView } from "./homeView.js";

export async function renderContactRequest(chatId, mainEl) {
  mainEl.innerHTML = `<div class="spinner"><span></span></div>`;
  try {
    const info = await call("get_chat_info", { chatId });
    const name = info.name || "未知";
    const members = info.members || [];
    const other = members.find((m) => !m.is_self) || members[0] || {};
    const email = other.email || info.email || "";
    mainEl.innerHTML = `
      <div class="guide-card" style="padding:40px 20px">
        <div style="font-size:13px;color:#e5e5e5;font-weight:600">${escapeHtml(name)}</div>
        <div style="font-size:11px;color:#888">${escapeHtml(email)}</div>
        <div style="font-size:10px;color:#555;margin-top:8px">想与你建立联系</div>
        <div style="display:flex;gap:12px;margin-top:16px">
          <button id="cr-accept" style="background:#e5e5e5;color:#0a0a0a;border:none;padding:8px 20px;border-radius:4px;font-size:11px;cursor:pointer">接受</button>
          <button id="cr-decline" style="background:transparent;border:1px solid #222;color:#888;padding:8px 20px;border-radius:4px;font-size:11px;cursor:pointer">拒绝</button>
        </div>
      </div>
    `;
    document.getElementById("cr-accept").addEventListener("click", async () => {
      try {
        await call("accept_chat", { chatId });
        showToast("已接受");
        await renderChatView(chatId);
      } catch (e) { showToast(e.message || String(e)); }
    });
    document.getElementById("cr-decline").addEventListener("click", async () => {
      try {
        await call("block_chat", { chatId });
        showToast("已拒绝");
        state.currentChatId = null;
        await renderHomeView();
      } catch (e) { showToast(e.message || String(e)); }
    });
  } catch (e) {
    mainEl.innerHTML = `<div class="guide-card">加载失败:${escapeHtml(e.message || String(e))}</div>`;
    showToast(e.message || String(e));
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
```

- [ ] **Step 2: build 验证**

Run: `npm run build`
Expected: 成功

- [ ] **Step 3: Commit**

```bash
git add src/dialogs/contactRequest.js
git commit -m "feat(contactRequest): add contact request handling view (accept/decline)"
```

---

### Task 6: src/dialogs/memberDetail.js 成员详情 + 发消息

**Files:**
- Create: `src/dialogs/memberDetail.js`
- Modify: `src/shell/rightDrawer.js`

**Interfaces:**
- Consumes: `create_chat_by_contact` 命令 + `get_chat_info`
- Produces: `renderMemberDetail(body, contactId)` 函数

- [ ] **Step 1: 创建 src/dialogs/memberDetail.js**

```js
import { call } from "../api.js";
import { showToast } from "../toast.js";
import { state } from "../state.js";
import { renderChatView } from "../chat/chatView.js";
import { renderHomeView } from "./homeView.js";
import { renderRightDrawer } from "../shell/rightDrawer.js";

export async function renderMemberDetail(body, contactId) {
  body.innerHTML = `<div class="spinner"><span></span></div>`;
  try {
    const info = await call("get_chat_info", { chatId: state.currentChatId });
    const member = (info.members || []).find((m) => m.contact_id === contactId);
    if (!member) {
      body.innerHTML = `<div style="padding:16px;color:#555">成员不存在</div>`;
      return;
    }
    body.innerHTML = `
      <div class="rd-group">成员详情</div>
      <div style="padding:0 16px 8px;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;align-items:center;gap:10px;margin:8px 0">
          <div class="rd-avatar" style="width:32px;height:32px;font-size:13px">${escapeHtml(member.name.charAt(0).toUpperCase())}</div>
          <div>
            <div style="font-size:12px;font-weight:600;color:#e5e5e5">${escapeHtml(member.name)}</div>
            <div style="font-size:9px;color:#555">${escapeHtml(member.email || "")}</div>
          </div>
        </div>
        <button id="md-msg" style="background:#161616;border:1px solid #222;color:#e5e5e5;padding:8px;border-radius:4px;font-size:11px;cursor:pointer;margin-top:8px">发消息</button>
        <button id="md-back" style="background:transparent;border:1px solid #222;color:#888;padding:8px;border-radius:4px;font-size:11px;cursor:pointer">返回成员列表</button>
      </div>
    `;
    document.getElementById("md-msg").addEventListener("click", async () => {
      try {
        const chatId = await call("create_chat_by_contact", { contactId });
        state.homeMode = true;
        state.currentWsId = null;
        state.currentChatId = chatId;
        state.rightDrawerOpen = false;
        renderRightDrawer();
        await renderHomeView();
        await renderChatView(chatId);
        showToast("已进入私聊");
      } catch (e) { showToast(e.message || String(e)); }
    });
    document.getElementById("md-back").addEventListener("click", () => {
      state.rightDrawerTab = "members";
      renderRightDrawer();
    });
  } catch (e) {
    body.innerHTML = `<div style="padding:16px;color:#555">加载失败</div>`;
    showToast(e.message || String(e));
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
```

- [ ] **Step 2: 修改 src/shell/rightDrawer.js members tab 成员项可点击**

在 renderMembers 函数中,成员项渲染加 click 事件。修改成员项渲染:
```js
const items = list.map((m) => `
  <div class="rd-member ${m.is_self ? '' : 'muted'}" data-cid="${m.contact_id}" style="${m.is_self ? '' : 'cursor:pointer'}">
    <div class="rd-avatar">${escapeHtml(m.name.charAt(0).toUpperCase())}</div>
    <span class="rd-name">${escapeHtml(m.name)}</span>
  </div>
`).join("");
```

在 renderMembers 末尾(body.innerHTML 设置之后)加事件绑定:
```js
body.querySelectorAll(".rd-member[data-cid]").forEach((el) => {
  el.addEventListener("click", async () => {
    const cid = Number(el.dataset.cid);
    const { renderMemberDetail } = await import("../dialogs/memberDetail.js");
    await renderMemberDetail(body, cid);
  });
});
```

注意:self 成员项(m.is_self)无 data-cid,不可点击。

- [ ] **Step 3: build 验证**

Run: `npm run build`
Expected: 成功

- [ ] **Step 4: Commit**

```bash
git add src/dialogs/memberDetail.js src/shell/rightDrawer.js
git commit -m "feat(memberDetail): add member detail view with send message action"
```

---

### Task 7: src/dialogs/qrShow.js 我的二维码(qrcode 渲染图片)

**Files:**
- Create: `src/dialogs/qrShow.js`
- Modify: `src/dialogs/settingsPanel.js`

**Interfaces:**
- Consumes: `get_my_qr` / `get_securejoin_qr` 命令 + `qrcode` npm 包
- Produces: `showQrOverlay(qrStr, title)` 函数

- [ ] **Step 1: 创建 src/dialogs/qrShow.js**

```js
import QRCode from "qrcode";
import { showToast } from "../toast.js";

export async function showQrOverlay(qrStr, title = "我的二维码") {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.style.display = "flex";
  overlay.innerHTML = `
    <div class="dialog" style="max-width:320px;align-items:center">
      <h2>${escapeHtml(title)}</h2>
      <div id="qr-canvas" style="background:#fff;padding:12px;border-radius:4px;margin:8px 0"></div>
      <div style="font-size:9px;color:#555;margin-bottom:12px;text-align:center">扫描此二维码添加为好友</div>
      <div class="dialog-actions">
        <button class="primary" id="qr-copy">复制字符串</button>
        <button id="qr-close">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  // 渲染 QR 到 canvas
  try {
    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, qrStr, { width: 200, margin: 1, color: { dark: "#000000", light: "#ffffff" } });
    document.getElementById("qr-canvas").appendChild(canvas);
  } catch (e) {
    document.getElementById("qr-canvas").innerHTML = `<div style="font-size:9px;color:#555;word-break:break-all;max-height:120px;overflow:auto">${escapeHtml(qrStr)}</div>`;
  }
  document.getElementById("qr-copy").addEventListener("click", () => {
    navigator.clipboard.writeText(qrStr).then(() => showToast("已复制"));
  });
  document.getElementById("qr-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
```

- [ ] **Step 2: 修改 src/dialogs/settingsPanel.js 用 qrShow.js**

在 settingsPanel.js 顶部加 import:
```js
import { showQrOverlay } from "./qrShow.js";
```

删除 settingsPanel.js 中原有的 showQrOverlay 函数(整个函数定义),让账号设置和 workspace 设置的"二维码"按钮调 import 的 showQrOverlay(需 await)。

具体修改:
- 删除 settingsPanel.js 末尾的 `function showQrOverlay(qrStr) { ... }` 整个函数
- 账号设置的 `document.getElementById("acc-qr").onclick` 改为:
  ```js
  document.getElementById("acc-qr").onclick = async () => {
    try {
      const qr = await call("get_my_qr");
      await showQrOverlay(qr, "我的二维码");
    } catch (e) { showToast(e.message || String(e)); }
  };
  ```
- workspace 设置的 `document.getElementById("ws-qr").onclick` 改为:
  ```js
  document.getElementById("ws-qr").onclick = async () => {
    try {
      const qr = await call("get_securejoin_qr", { chatId: ws.master_chat_id });
      await showQrOverlay(qr, `${ws.name} workspace`);
    } catch (e) { showToast(e.message || String(e)); }
  };
  ```

- [ ] **Step 3: build 验证**

Run: `npm run build`
Expected: 成功(qrcode 包已安装)

- [ ] **Step 4: Commit**

```bash
git add src/dialogs/qrShow.js src/dialogs/settingsPanel.js
git commit -m "feat(qrShow): render QR code as canvas image using qrcode package"
```

---

### Task 8: src/dialogs/search.js Cmd+K 全局搜索

**Files:**
- Create: `src/dialogs/search.js`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `state.messages` / `state.workspaces` / `state.channels` / `get_chat_info`
- Produces: `openSearch()` / `closeSearch()` 函数

- [ ] **Step 1: 创建 src/dialogs/search.js**

```js
import { call } from "../api.js";
import { state } from "../state.js";
import { renderChatView } from "../chat/chatView.js";

let searchTimer = null;

export function openSearch() {
  if (state.searchOpen) return;
  state.searchOpen = true;
  const overlay = document.createElement("div");
  overlay.className = "overlay search-overlay";
  overlay.style.display = "flex";
  overlay.id = "search-overlay";
  overlay.innerHTML = `
    <div class="search-dialog">
      <input id="search-input" placeholder="搜索消息 / 频道 / 成员" autocomplete="off" />
      <div id="search-results" class="search-results"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  const input = document.getElementById("search-input");
  input.focus();
  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => doSearch(input.value.trim()), 200);
  });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeSearch(); });
}

export function closeSearch() {
  const overlay = document.getElementById("search-overlay");
  if (overlay) overlay.remove();
  state.searchOpen = false;
}

async function doSearch(q) {
  const resultsEl = document.getElementById("search-results");
  if (!resultsEl) return;
  if (!q) {
    resultsEl.innerHTML = "";
    return;
  }
  const lower = q.toLowerCase();
  const sections = [];
  // 1. 消息(只搜已加载的 state.messages)
  const msgMatches = (state.messages || []).filter((m) => (m.text || "").toLowerCase().includes(lower)).slice(0, 5);
  if (msgMatches.length > 0) {
    const items = msgMatches.map((m) => `<div class="sr-item" data-type="msg" data-id="${m.msg_id}"><span class="sr-type">消息</span><span class="sr-content">${escapeHtml(m.from_name)}: ${escapeHtml((m.text || "").slice(0, 60))}</span></div>`).join("");
    sections.push(`<div class="sr-section">消息</div>${items}`);
  }
  // 2. 频道(state.channels + state.workspaces 的 master)
  const chanMatches = (state.channels || []).filter((c) => (c.name || "").toLowerCase().includes(lower)).slice(0, 5);
  if (chanMatches.length > 0) {
    const items = chanMatches.map((c) => `<div class="sr-item" data-type="channel" data-id="${c.chat_id}"><span class="sr-type">频道</span><span class="sr-content">#${escapeHtml(c.name)}</span></div>`).join("");
    sections.push(`<div class="sr-section">频道</div>${items}`);
  }
  // 3. 成员(当前频道 members,需异步拉)
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
  // 绑定点击
  resultsEl.querySelectorAll(".sr-item").forEach((el) => {
    el.addEventListener("click", async () => {
      const type = el.dataset.type;
      const id = el.dataset.id;
      if (type === "channel") {
        state.currentChatId = Number(id);
        closeSearch();
        await renderChatView(Number(id));
      } else if (type === "msg") {
        // 跳转当前频道(消息在当前频道)
        closeSearch();
        await renderChatView(state.currentChatId);
        // 高亮该消息
        const msgEl = document.querySelector(`[data-msg="${id}"]`);
        if (msgEl) {
          msgEl.scrollIntoView({ behavior: "smooth" });
          msgEl.style.background = "#1f1f1f";
          setTimeout(() => { msgEl.style.background = ""; }, 2000);
        }
      } else if (type === "member") {
        // 切到成员详情
        closeSearch();
        state.rightDrawerOpen = true;
        state.rightDrawerTab = "members";
        const { renderRightDrawer } = await import("../shell/rightDrawer.js");
        renderRightDrawer();
        setTimeout(async () => {
          const body = document.getElementById("rd-body");
          if (body) {
            const { renderMemberDetail } = await import("./memberDetail.js");
            await renderMemberDetail(body, Number(id));
          }
        }, 100);
      }
    });
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
```

- [ ] **Step 2: 在 src/styles.css 末尾追加样式**

```css

/* search overlay */
.search-overlay { align-items: flex-start; padding-top: 60px; }
.search-dialog {
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  width: 480px;
  max-height: 400px;
  display: flex;
  flex-direction: column;
}
.search-dialog input {
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-size: 13px;
  font-family: var(--font);
  outline: none;
}
.search-results { flex: 1; overflow-y: auto; }
.sr-section { padding: 8px 16px 4px; color: var(--text-weak); font-size: 9px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; }
.sr-item { padding: 8px 16px; display: flex; gap: 10px; cursor: pointer; }
.sr-item:hover { background: var(--active); }
.sr-type { color: var(--text-weak); font-size: 9px; min-width: 30px; }
.sr-content { color: var(--text); font-size: 11px; }
.sr-empty { padding: 16px; color: var(--text-weak); font-size: 11px; text-align: center; }
```

- [ ] **Step 3: build 验证**

Run: `npm run build`
Expected: 成功

- [ ] **Step 4: Commit**

```bash
git add src/dialogs/search.js src/styles.css
git commit -m "feat(search): add Cmd+K global search overlay (messages/channels/members)"
```

---

### Task 9: homeView + channelTree 右键菜单 + 空状态引导

**Files:**
- Modify: `src/dialogs/homeView.js`
- Modify: `src/shell/channelTree.js`

**Interfaces:**
- Consumes: `showContextMenu` from Task 3, `openHomePlus` from Task 4, `renderContactRequest` from Task 5, `block_chat`/`delete_chat`/`leave_channel` 命令

- [ ] **Step 1: 修改 src/dialogs/homeView.js**

1. 顶部加 import:
```js
import { showContextMenu } from "./contextMenu.js";
import { openHomePlus } from "./homePlus.js";
import { renderContactRequest } from "./contactRequest.js";
import { renderRightDrawer } from "../shell/rightDrawer.js";
```

2. ct-header 加 + 按钮:
```js
tree.innerHTML = `
  <div class="ct-header" style="display:flex;justify-content:space-between;align-items:center">
    <div>
      <div class="ct-name">主页</div>
      <div class="ct-sub">DM 与非 workspace 群</div>
    </div>
    <div id="home-plus" style="cursor:pointer;color:#888;font-size:14px;padding:0 8px">+</div>
  </div>
  <div class="ct-list">${items || '<div class="guide-card" style="height:auto;padding:24px 16px"><div>还没有会话</div><div style="font-size:9px;color:#555;margin-top:4px">点 + 添加好友或创建群</div></div>'}</div>
  <div class="ct-user" style="cursor:pointer">
    <div class="ct-avatar">${escapeHtml(state.self?.name?.charAt(0) || "?")}</div>
    <div>
      <div class="ct-username">${escapeHtml(state.self?.name || "me")}</div>
    </div>
  </div>
`;
```

3. 绑定 home-plus click:
```js
document.getElementById("home-plus").addEventListener("click", () => openHomePlus());
```

4. 会话项 click 改为:若 is_contact_request → renderContactRequest,否则 renderChatView:
```js
tree.querySelectorAll(".ct-channel").forEach((el) => {
  el.addEventListener("click", async () => {
    const id = Number(el.dataset.id);
    const chat = chats.find((c) => c.chat_id === id);
    state.currentChatId = id;
    tree.querySelectorAll(".ct-channel").forEach((x) => x.classList.remove("active"));
    el.classList.add("active");
    if (chat?.is_contact_request) {
      const main = document.getElementById("chat-main");
      await renderContactRequest(id, main);
    } else {
      await renderChatView(id);
    }
  });
  // 右键菜单
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const id = Number(el.dataset.id);
    const chat = chats.find((c) => c.chat_id === id);
    if (!chat) return;
    const items = [];
    if (chat.is_group) {
      items.push({ label: "改名", action: async () => { /* 简化:prompt 输入 */ const name = prompt("新名称", chat.name); if (name) { try { await call("update_channel", { chatId: id, name }); await renderHomeView(); } catch (e) { showToast(e.message || String(e)); } } } });
      items.push({ label: "退群", action: async () => { try { await call("leave_channel", { chatId: id }); await renderHomeView(); showToast("已退出"); } catch (e) { showToast(e.message || String(e)); } } });
    } else {
      items.push({ label: "查看资料", action: () => { state.rightDrawerOpen = true; state.rightDrawerTab = "members"; renderRightDrawer(); } });
      items.push({ label: "屏蔽", action: async () => { if (!confirm("屏蔽此会话?")) return; try { await call("block_chat", { chatId: id }); await renderHomeView(); showToast("已屏蔽"); } catch (e) { showToast(e.message || String(e)); } } });
    }
    items.push({ label: "删除会话", action: async () => { if (!confirm("删除此会话?")) return; try { await call("delete_chat", { chatId: id }); await renderHomeView(); showToast("已删除"); } catch (e) { showToast(e.message || String(e)); } } });
    showContextMenu(e.clientX, e.clientY, items);
  });
});
```

5. ct-user click(已有,保持):开 rightDrawer settings tab。

注意:需在 homeView.js 顶部加 `import { call } from "../api.js";`(若未有)和 `import { showToast } from "../toast.js";`。

- [ ] **Step 2: 修改 src/shell/channelTree.js 加频道右键菜单**

在 channelTree.js 顶部加 import:
```js
import { showContextMenu } from "../dialogs/contextMenu.js";
import { showToast } from "../toast.js";
```

在频道项 click 绑定之后,加右键菜单:
```js
tree.querySelectorAll(".ct-channel").forEach((el) => {
  // ... 现有 click ...
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const id = Number(el.dataset.id);
    showContextMenu(e.clientX, e.clientY, [
      { label: "频道设置", action: () => { state.rightDrawerOpen = true; state.rightDrawerTab = "settings"; renderRightDrawer(); } },
      { label: "离开频道", action: async () => { if (!confirm("离开此频道?")) return; try { await call("leave_channel", { chatId: id }); await refreshChannels(); renderChannelTree(); state.currentChatId = null; document.getElementById("chat-main").innerHTML = `<div class="empty">选择一个频道</div>`; showToast("已离开"); } catch (e) { showToast(e.message || String(e)); } } },
    ]);
  });
});
```

- [ ] **Step 3: build 验证**

Run: `npm run build`
Expected: 成功

- [ ] **Step 4: Commit**

```bash
git add src/dialogs/homeView.js src/shell/channelTree.js
git commit -m "feat(ui): home plus button, contact request entry, context menus, empty state guide"
```

---

### Task 10: shell.js 全局快捷键 + 事件刷新扩展 + 持久化 + Dock 角标 + 通知

**Files:**
- Modify: `src/shell/shell.js`
- Modify: `src/shell/wsRail.js`

**Interfaces:**
- Consumes: `openSearch`/`closeSearch` from Task 8, `loadState`/`saveState` from Task 2, Tauri app/notification API

- [ ] **Step 1: 修改 src/shell/shell.js**

顶部加 import:
```js
import { loadState, saveState } from "../persist.js";
import { openSearch, closeSearch } from "../dialogs/search.js";
import { hideContextMenu } from "../dialogs/contextMenu.js";
import { showToast } from "../toast.js";
```

修改 renderShell:
1. 开头调 loadState 恢复状态
2. 末尾注册全局快捷键 + 扩展事件刷新 + Dock 角标 + 通知

具体修改 renderShell:

```js
export async function renderShell() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="shell">
      <div id="ws-rail" class="ws-rail"></div>
      <div id="channel-tree" class="channel-tree"></div>
      <div id="chat-main" class="chat-main"><div class="empty">选择一个频道</div></div>
      <div id="right-drawer" class="right-drawer collapsed"></div>
    </div>
  `;
  // 恢复持久化状态
  loadState();
  await refreshWorkspaces();
  try {
    state.self = await call("get_self_profile");
  } catch {}
  try { await call("validate_channels"); } catch {}

  // 根据恢复的状态决定初始视图
  if (state.currentWsId != null && state.workspaces.find((w) => w.id === state.currentWsId)) {
    state.homeMode = false;
    renderWsRail();
    await refreshChannels();
    renderChannelTree();
    if (state.currentChatId != null) {
      // 检查 currentChatId 是否属于当前 ws 频道
      const ch = state.channels.find((c) => c.chat_id === state.currentChatId);
      if (ch) {
        await renderChatView(state.currentChatId);
      } else {
        document.getElementById("chat-main").innerHTML = `<div class="empty">选择一个频道</div>`;
      }
    } else {
      document.getElementById("chat-main").innerHTML = `<div class="empty">选择一个频道</div>`;
    }
  } else {
    state.homeMode = true;
    state.currentWsId = null;
    renderWsRail();
    await renderHomeView();
    // 若有 currentChatId 且在 home chatlist 中,进该会话
    if (state.currentChatId != null) {
      try {
        const chats = await call("get_chatlist");
        if (chats.find((c) => c.chat_id === state.currentChatId)) {
          await renderChatView(state.currentChatId);
        }
      } catch {}
    }
  }

  // 注册全局事件刷新
  const { onEvent } = await import("../api.js");
  onEvent("MsgsChanged", () => { if (state.currentChatId) refreshCurrentChat(); refreshSidebar(); updateBadge(); });
  onEvent("IncomingMsg", handleIncomingMsg);
  onEvent("ChatlistItemChanged", () => { refreshSidebar(); if (state.homeMode) renderHomeView(); updateBadge(); });
  onEvent("ChatModified", () => { refreshSidebar(); if (state.homeMode) renderHomeView(); });
  onEvent("ContactsChanged", refreshSidebar);

  // 全局快捷键
  document.addEventListener("keydown", (e) => {
    // Cmd+K / Ctrl+K 搜索
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      if (state.searchOpen) closeSearch(); else openSearch();
      return;
    }
    // ESC 逐级关闭
    if (e.key === "Escape") {
      if (state.searchOpen) { closeSearch(); return; }
      const overlay = document.querySelector(".overlay");
      if (overlay) { overlay.remove(); return; }
      hideContextMenu();
      const replyPreview = document.getElementById("reply-preview");
      if (replyPreview) { const area = document.getElementById("composer-area"); if (area) { delete area.dataset.replyTo; const { renderComposer } = await import("../chat/composer.js"); renderComposer(state.currentChatId, () => {}); } return; }
      if (state.rightDrawerOpen) { state.rightDrawerOpen = false; renderRightDrawer(); return; }
    }
  });

  // 请求通知权限
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }

  // 初始 Dock 角标
  updateBadge();
}

async function handleIncomingMsg(e) {
  const chatId = e.chat_id;
  if (state.currentChatId === chatId) {
    // 当前聊天,直接刷新
    await refreshCurrentChat();
  } else {
    // 非当前聊天,发系统通知
    try {
      const info = await call("get_chat_info", { chatId });
      const name = info.name || "新消息";
      const text = (e.text || "").slice(0, 50);
      if ("Notification" in window && Notification.permission === "granted") {
        const notif = new Notification(name, { body: text });
        notif.onclick = () => {
          state.currentChatId = chatId;
          state.homeMode = true;
          state.currentWsId = null;
          renderHomeView().then(() => renderChatView(chatId));
          window.focus();
        };
      }
    } catch {}
  }
  refreshSidebar();
  updateBadge();
}

async function updateBadge() {
  try {
    const chats = await call("get_chatlist");
    const total = chats.reduce((sum, c) => sum + (c.unread || 0), 0);
    // Tauri v2 badge API
    if (window.__TAURI__?.app?.setBadgeCount) {
      await window.__TAURI__.app.setBadgeCount(total);
    }
  } catch {}
}

async function refreshCurrentChat() {
  if (state.currentChatId != null) {
    await renderChatView(state.currentChatId);
    saveState();
  }
}

async function refreshSidebar() {
  await refreshWorkspaces();
  await refreshChannels();
  renderWsRail();
  if (state.currentWsId != null && !state.homeMode) {
    renderChannelTree();
  }
  saveState();
}
```

注意:
- ESC handler 中的 `await import` 在 keydown 回调里需改为 async,整个 keydown 监听器用 async。
- `window.__TAURI__.app.setBadgeCount` 是 Tauri v2 API,若不存在静默跳过(已 try/catch)。
- `renderRightDrawer` 需 import(顶部已有)。

- [ ] **Step 2: 修改 src/shell/wsRail.js 实时聚合刷新**

wsRail.js 的 renderWsRail 已在 SP2 实现聚合角标(仅当前 ws 真实)。SP3 改进:refreshSidebar 调 renderWsRail 时会自动重算。无需额外改 wsRail.js,只需确保 shell.js 的 refreshSidebar 调 renderWsRail(已在上步包含)。

但需在 wsRail.js 的 workspace click 和 ws-home click 中调 saveState:
- workspace click 末尾加 `saveState();`(需 import)
- ws-home click 末尾加 `saveState();`

在 wsRail.js 顶部加:
```js
import { saveState } from "../persist.js";
```

workspace click handler 末尾(在 renderRightDrawer() 之后)加:
```js
saveState();
```

ws-home click handler 末尾加:
```js
saveState();
```

- [ ] **Step 3: 修改 src/chat/chatView.js 持久化**

在 chatView.js 的 renderChatView 末尾(try 块内,mark_chat_noticed 之后)加:
```js
saveState();
```

顶部加 import:
```js
import { saveState } from "../persist.js";
```

- [ ] **Step 4: 修改 src/shell/channelTree.js 持久化**

在 channelTree.js 的频道 click handler 末尾加 `saveState();`(需 import)。

顶部加:
```js
import { saveState } from "../persist.js";
```

频道 click handler:
```js
el.addEventListener("click", async () => {
  const id = Number(el.dataset.id);
  state.currentChatId = id;
  saveState();
  renderChannelTree();
  await renderChatView(id);
});
```

- [ ] **Step 5: build 验证**

Run: `npm run build`
Expected: 成功

- [ ] **Step 6: Commit**

```bash
git add src/shell/shell.js src/shell/wsRail.js src/chat/chatView.js src/shell/channelTree.js
git commit -m "feat(shell): global shortcuts (Cmd+K/ESC), event refresh, persist restore, dock badge, notifications"
```

---

### Task 11: src/shell/rightDrawer.js search tab 清理 + 最终验证

**Files:**
- Modify: `src/shell/rightDrawer.js`(若有残留 search 引用)
- Verify: cargo build + npm run build + 全量测试

**Interfaces:**
- 无新接口,只清理 + 验证

- [ ] **Step 1: 检查 rightDrawer.js 无 search 残留**

Read src/shell/rightDrawer.js,确认 tabs 已是 `["members", "pin", "settings"]`(SP2 Task 6 已改),无 "search" 残留。若有则清理。

- [ ] **Step 2: cargo build 验证**

Run: `cd src-tauri && cargo build`
Expected: 编译通过

- [ ] **Step 3: npm run build 验证**

Run: `npm run build`
Expected: 成功

- [ ] **Step 4: cargo test 验证**

Run: `cd src-tauri && cargo test`
Expected: 全部 PASS

- [ ] **Step 5: Commit(若有改动)**

```bash
git add -A 2>/dev/null
git commit -m "chore(sp3): final verification and cleanup" 2>/dev/null || echo "No changes needed"
```

---

## Self-Review

### Spec coverage
- 1.1 主页 + 按钮 → Task 4 + Task 9
- 1.2 联系人请求处理 → Task 5 + Task 9
- 1.3 成员详情 → 私聊 → Task 6
- 1.4 会话右键菜单 → Task 3 + Task 9
- 1.5 我的二维码 → Task 7
- 2.1 Cmd+K 搜索 → Task 8 + Task 10
- 2.2 ESC 键 → Task 10
- 2.3 Cmd+Enter 发送 → SP2 Task 11 已完成
- 2.4 未读角标 → Task 10
- 2.5 桌面通知 → Task 10
- 2.6 实时 unread 刷新 → Task 10
- 2.7 持久化 → Task 2 + Task 10
- 2.8 空状态引导 → Task 9

### Placeholder scan
无 TBD/TODO;所有步骤含完整代码。

### Type consistency
- `create_group_chat(name: String) -> u32` — Task 1 后端与 Task 4 前端一致
- `create_chat_by_contact(contact_id: u32) -> u32` — Task 1 与 Task 6 一致
- `showContextMenu(x, y, items)` — Task 3 与 Task 9 一致
- `openHomePlus()` — Task 4 与 Task 9 一致
- `renderContactRequest(chatId, mainEl)` — Task 5 与 Task 9 一致
- `renderMemberDetail(body, contactId)` — Task 6 与 Task 8 一致
- `showQrOverlay(qrStr, title)` — Task 7 与 settingsPanel 一致
- `openSearch()`/`closeSearch()` — Task 8 与 Task 10 一致
- `saveState()`/`loadState()` — Task 2 与 Task 10 一致

无遗漏。计划完整。
