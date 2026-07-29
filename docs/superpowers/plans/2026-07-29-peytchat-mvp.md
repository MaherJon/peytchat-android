# Peytchat MVP 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 chatmail/core（Delta Chat 核心）与 Tauri v2 构建跨平台桌面应用，通过邮箱登录实现私聊与群聊（文本），UI 为最简可跑通的单页前端。

**Architecture:** 后端 Rust 直接 `use deltachat::*`（path 依赖 `core/`），通过 Tauri commands 暴露 MVP 命令，核心事件由 tokio task 转发为单一 `dc-event`。前端 Vanilla HTML/CSS/JS + Vite，模块级状态，朴素重绘。

**Tech Stack:** Tauri v2、deltachat crate（`core/` path 依赖，pin 到当前 main `2.58.0-dev`）、Vanilla JS + Vite、thiserror + serde。

## Global Constraints

- 平台：macOS/Windows/Linux 桌面。
- `core/` 已 clone 到 `peytchat/core/`（shallow，main 分支），保持上游原样不修改。
- `src-tauri` 是独立 Cargo workspace 根，不并入 `core/` 的 workspace。
- Delta Chat sqlite 数据库存放于 Tauri `app_data_dir/accounts/`。
- MVP 单账号：登录后即当前账号，无账号切换 UI。
- 核心登录走 `Context::add_or_update_transport(&mut EnteredLoginParam)`（`configure()` 已 deprecated）。
- 联系人创建用 `Contact::create`（`add_or_lookup` 是 pub(crate)）。
- 群组创建用 `chat::create_group`（非 `create_group_chat`）。
- 会话数量用 `Chatlist::try_load(ctx, 0, None, None).await?.len()`（`chat::get_chat_cnt` 是 pub(crate)）。
- `Accounts::new(dir, writable)` 是 async；`start_io` 是 `&mut self`。
- `Accounts::get_account(id) -> Option<Context>`（无独立 Account 结构体）。
- `EventEmitter::recv()` async 返回 `Option<Event>`，`None` 表示 Accounts 已 drop。
- `Context` 是 `Clone`（Arc 内部），command 间直接 clone。
- 前端不引入测试框架；Rust 部分用 `cargo test` 单测。
- 仅黑白配色：`#fff` / `#000` / `#e5e5e5`。

---

### Task 1: 项目骨架与依赖

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/build.rs`
- Create: `package.json`
- Create: `vite.config.js`
- Create: `src/index.html`
- Create: `src/main.js`
- Create: `src/styles.css`
- Create: `.gitignore`

**Interfaces:**
- Produces: 可启动的空 Tauri 窗口（`cargo tauri dev`），前端显示 "Peytchat" 占位标题；`src-tauri` 依赖 `deltachat = { path = "../core" }`。

- [ ] **Step 1: 创建 `.gitignore`**

```gitignore
node_modules
dist
src-tauri/target
.DS_Store
core/.git
```

注意：`core/` 已是独立 git 仓库（clone 来的），其 `.git` 不纳入父仓库；`core/` 源码本身保留在磁盘供 path 依赖，但不上传到 peytchat 仓库（见 Step 2 的 git 配置）。

- [ ] **Step 2: 确认 `core/` 不被父 git 追踪**

`core/` 是 clone 的独立仓库，会被父仓库当作 gitlink（submodule 风格）或忽略。为避免复杂度，在 `.gitignore` 中追加 `core/`，使父仓库不追踪它（path 依赖在本地有效；CI/他人 clone 时需另行 clone core，已在 README 约定）。

在 `.gitignore` 追加：
```
core/
```

- [ ] **Step 3: 初始化前端 `package.json`**

```json
{
  "name": "peytchat",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 4: 创建 `vite.config.js`**

```js
import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: "es2021",
  },
});
```

- [ ] **Step 5: 创建前端入口 `src/index.html`**

```html
<!DOCTYPE html>
<html lang="zh">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Peytchat</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <div id="app"><h1>Peytchat</h1></div>
    <script type="module" src="/main.js"></script>
  </body>
</html>
```

- [ ] **Step 6: 创建 `src/main.js`（占位）**

```js
console.log("Peytchat starting…");
```

- [ ] **Step 7: 创建 `src/styles.css`**

```css
:root {
  --bg: #fff;
  --fg: #000;
  --border: #e5e5e5;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--fg);
  font-size: 14px;
}
#app { height: 100vh; }
```

- [ ] **Step 8: 创建 `src-tauri/Cargo.toml`**

```toml
[package]
name = "peytchat"
version = "0.1.0"
edition = "2021"

[lib]
name = "peytchat_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2.0", features = [] }

[dependencies]
tauri = { version = "2.0", features = [] }
deltachat = { path = "../core" }
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "1"
```

- [ ] **Step 9: 创建 `src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 10: 创建 `src-tauri/tauri.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Peytchat",
  "version": "0.1.0",
  "identifier": "com.peytchat.app",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "Peytchat",
        "width": 1000,
        "height": 700,
        "minWidth": 800,
        "minHeight": 600
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/icon.png"]
  }
}
```

- [ ] **Step 11: 创建 `src-tauri/src/lib.rs`（最小 Builder）**

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 12: 创建 `src-tauri/src/main.rs`**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    peytchat_lib::run();
}
```

- [ ] **Step 13: 安装前端依赖并验证 Tauri 启动**

Run: `npm install`
Run: `cargo tauri dev`（在 `src-tauri/` 下首次需 `cargo build`，耗时较长）
Expected: 窗口打开，显示 "Peytchat" 标题，终端无错误。

- [ ] **Step 14: 提交**

```bash
git add .gitignore package.json vite.config.js src/ src-tauri/
git commit -m "chore: scaffold Tauri v2 + Vite project with deltachat dependency"
```

---

### Task 2: 后端状态与错误类型

**Files:**
- Create: `src-tauri/src/state.rs`
- Create: `src-tauri/src/error.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/state.rs`（inline `#[cfg(test)]`）

**Interfaces:**
- Consumes: `deltachat::accounts::Accounts`、`deltachat::context::Context`
- Produces:
  - `pub struct AppState { accounts: Arc<Mutex<Accounts>>, current_id: Option<u32> }`
  - `impl AppState { pub async fn new(dir: PathBuf) -> Result<Self>; pub fn current(&self) -> Option<Context>; pub async fn set_current(&mut self, id: u32); }`
  - `pub enum AppError { AuthFailed, Network, AutoconfigNotFound, Core(String), Io(String) }`，实现 `Serialize` 与 `From` 转换。

- [ ] **Step 1: 写 `error.rs`**

```rust
use serde::Serialize;

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    #[error("认证失败：邮箱或密码错误")]
    AuthFailed,
    #[error("网络错误：{0}")]
    Network(String),
    #[error("未找到自动配置，请手动填写 IMAP/SMTP")]
    AutoconfigNotFound,
    #[error("核心错误：{0}")]
    Core(String),
    #[error("IO 错误：{0}")]
    Io(String),
}

impl From<deltachat::error::Error> for AppError {
    fn from(e: deltachat::error::Error) -> Self {
        AppError::Core(e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
```

- [ ] **Step 2: 写 `state.rs`（含测试）**

```rust
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

use deltachat::accounts::Accounts;
use deltachat::context::Context;

use crate::error::AppResult;

pub struct AppState {
    pub accounts: Arc<Mutex<Accounts>>,
    pub current_id: Option<u32>,
}

impl AppState {
    pub async fn new(dir: PathBuf) -> AppResult<Self> {
        tokio::fs::create_dir_all(&dir).await?;
        let accounts = Accounts::new(dir, true).await?;
        Ok(Self {
            accounts: Arc::new(Mutex::new(accounts)),
            current_id: None,
        })
    }

    pub async fn current(&self) -> Option<Context> {
        let accounts = self.accounts.lock().await;
        let id = self.current_id?;
        accounts.get_account(id)
    }

    pub async fn set_current(&mut self, id: u32) {
        self.current_id = Some(id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_state_init_and_add_account() {
        let tmp = tempfile::tempdir().unwrap();
        let mut state = AppState::new(tmp.path().join("accounts")).await.unwrap();
        assert!(state.current().await.is_none());

        let id = {
            let mut accounts = state.accounts.lock().await;
            accounts.add_account().await.unwrap()
        };
        state.set_current(id).await;
        assert_eq!(state.current_id, Some(id));
        assert!(state.current().await.is_some());
    }
}
```

- [ ] **Step 3: 加 `tempfile` 测试依赖**

在 `src-tauri/Cargo.toml` 的 `[dependencies]` 后追加：

```toml
[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 4: 在 `lib.rs` 中声明模块**

将 `lib.rs` 改为：

```rust
mod error;
mod state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: 运行测试验证通过**

Run: `cargo test -p peytchat --lib`
Expected: 1 test passed（`test_state_init_and_add_account`）。

- [ ] **Step 6: 提交**

```bash
git add src-tauri/
git commit -m "feat(backend): add AppState and AppError with accounts init test"
```

---

### Task 3: 登录与个人资料命令

**Files:**
- Create: `src-tauri/src/commands.rs`
- Create: `src-tauri/src/dto.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `AppState`、`deltachat::login_param::{EnteredLoginParam, EnteredCertificateChecks}`、`deltachat::provider::Socket`、`deltachat::config::Config`
- Produces（Tauri commands，均 `async fn`，返回 `AppResult<T>`）:
  - `is_configured(state) -> bool`
  - `login(state, email, password, advanced) -> u32`（account id）
  - `get_self_profile(state) -> ProfileDto`
- Produces DTO（`dto.rs`）:
  - `pub struct AdvancedLogin { imap_host: Option<String>, imap_port: Option<u16>, imap_security: Option<String>, imap_user: Option<String>, smtp_host: Option<String>, smtp_port: Option<u16>, smtp_security: Option<String>, smtp_user: Option<String>, smtp_password: Option<String> }`
  - `pub struct ProfileDto { id: u32, name: Option<String>, addr: Option<String> }`

- [ ] **Step 1: 写 `dto.rs`**

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct AdvancedLogin {
    pub imap_host: Option<String>,
    pub imap_port: Option<u16>,
    pub imap_security: Option<String>, // "ssl" | "tls" | "plain"
    pub imap_user: Option<String>,
    pub smtp_host: Option<String>,
    pub smtp_port: Option<u16>,
    pub smtp_security: Option<String>,
    pub smtp_user: Option<String>,
    pub smtp_password: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ProfileDto {
    pub id: u32,
    pub name: Option<String>,
    pub addr: Option<String>,
}
```

- [ ] **Step 2: 写 `commands.rs`**

```rust
use deltachat::config::Config;
use deltachat::login_param::{EnteredCertificateChecks, EnteredLoginParam};
use deltachat::provider::Socket;
use tauri::State;

use crate::dto::{AdvancedLogin, ProfileDto};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

fn parse_socket(s: &Option<String>) -> Socket {
    match s.as_deref() {
        Some("ssl") => Socket::Ssl,
        Some("tls") => Socket::Starttls,
        Some("plain") => Socket::Plain,
        _ => Socket::Automatic,
    }
}

#[tauri::command]
pub async fn is_configured(state: State<'_, AppState>) -> AppResult<bool> {
    Ok(state.current_id.is_some())
}

#[tauri::command]
pub async fn login(
    state: State<'_, AppState>,
    email: String,
    password: String,
    advanced: Option<AdvancedLogin>,
) -> AppResult<u32> {
    let id = {
        let mut accounts = state.accounts.lock().await;
        accounts.add_account().await?
    };
    let ctx = {
        let accounts = state.accounts.lock().await;
        accounts.get_account(id).ok_or(AppError::Core("account gone".into()))?
    };

    let mut param = EnteredLoginParam::default();
    param.addr = email.clone();
    param.imap.password = password.clone();
    if let Some(a) = &advanced {
        param.imap.server = a.imap_host.clone().unwrap_or_default();
        param.imap.port = a.imap_port.unwrap_or(0);
        param.imap.security = parse_socket(&a.imap_security);
        param.imap.user = a.imap_user.clone().unwrap_or_default();
        param.smtp.server = a.smtp_host.clone().unwrap_or_default();
        param.smtp.port = a.smtp_port.unwrap_or(0);
        param.smtp.security = parse_socket(&a.smtp_security);
        param.smtp.user = a.smtp_user.clone().unwrap_or_default();
        param.smtp.password = a.smtp_password.clone().unwrap_or_default();
        param.certificate_checks = EnteredCertificateChecks::Automatic;
    }

    ctx.add_or_update_transport(&mut param).await?;
    ctx.start_io().await;

    let mut accounts = state.accounts.lock().await;
    accounts.select_account(id).await?;
    drop(accounts);

    let mut state_mut = state;
    state_mut.set_current(id).await;
    Ok(id)
}

#[tauri::command]
pub async fn get_self_profile(state: State<'_, AppState>) -> AppResult<ProfileDto> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let id = ctx.get_id();
    let name = ctx.get_config(Config::Displayname).await?;
    let addr = ctx.get_config(Config::ConfiguredAddr).await?;
    Ok(ProfileDto { id, name, addr })
}
```

- [ ] **Step 3: 在 `lib.rs` 注册命令并初始化 AppState**

将 `lib.rs` 改为：

```rust
mod commands;
mod dto;
mod error;
mod state;

use std::path::PathBuf;
use tauri::Manager;

use crate::error::AppResult;
use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir().expect("no app data dir");
            let accounts_dir = dir.join("accounts");
            let state = tauri::async_runtime::block_on(async move {
                AppState::new(accounts_dir).await
            })?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::is_configured,
            commands::login,
            commands::get_self_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: 编译验证**

Run: `cargo build -p peytchat`
Expected: 编译通过（首次会编译 `core/`，耗时较长）。

- [ ] **Step 5: 手动启动验证登录命令可调用**

Run: `cargo tauri dev`
在前端 console 执行（临时）：
```js
await window.__TAURI__.core.invoke("login", { email: "bad@example.com", password: "x" });
```
Expected: 返回错误（`AuthFailed` 或 `Network`/`Core`），不 panic。

- [ ] **Step 6: 提交**

```bash
git add src-tauri/
git commit -m "feat(backend): add login, is_configured, get_self_profile commands"
```

---

### Task 4: 前端登录视图

**Files:**
- Create: `src/api.js`
- Create: `src/state.js`
- Create: `src/views/login.js`
- Modify: `src/main.js`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: Tauri `@tauri-apps/api/core` 的 `invoke`、`@tauri-apps/api/event` 的 `listen`
- Produces:
  - `api.js`: `export async function invoke(cmd, args)`、`export async function onEvent(typ, cb)`
  - `state.js`: `export const state = { self: null, chatlist: [], currentChatId: null, messages: [] }`
  - `views/login.js`: `export function renderLogin()`

- [ ] **Step 1: 写 `src/api.js`**

```js
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export async function call(cmd, args) {
  try {
    return await invoke(cmd, args);
  } catch (err) {
    showError(err);
    throw err;
  }
}

export async function onEvent(typ, cb) {
  await listen("dc-event", (e) => {
    if (e.payload && e.payload.typ === typ) cb(e.payload);
  });
}

export function showError(err) {
  const el = document.getElementById("error");
  if (!el) return;
  const msg = typeof err === "object" && err !== null
    ? (err.message || JSON.stringify(err))
    : String(err);
  el.textContent = msg;
  el.style.display = "block";
}

export function clearError() {
  const el = document.getElementById("error");
  if (el) el.style.display = "none";
}
```

- [ ] **Step 2: 写 `src/state.js`**

```js
export const state = {
  self: null,
  chatlist: [],
  currentChatId: null,
  messages: [],
};
```

- [ ] **Step 3: 写 `src/views/login.js`**

```js
import { call, clearError, showError } from "../api.js";

export function renderLogin(onSuccess) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="login-wrap">
      <form id="login-form" class="login-form">
        <h1>Peytchat</h1>
        <input id="email" type="email" placeholder="邮箱" required autocomplete="username" />
        <input id="password" type="password" placeholder="密码" required autocomplete="current-password" />
        <button type="button" id="advanced-toggle" class="link">高级设置</button>
        <div id="advanced" class="advanced" hidden>
          <input id="imap_host" placeholder="IMAP 主机" />
          <input id="imap_port" type="number" placeholder="IMAP 端口" />
          <select id="imap_security">
            <option value="">IMAP 安全（自动）</option>
            <option value="ssl">SSL/TLS</option>
            <option value="tls">STARTTLS</option>
            <option value="plain">明文</option>
          </select>
          <input id="imap_user" placeholder="IMAP 用户名" />
          <input id="smtp_host" placeholder="SMTP 主机" />
          <input id="smtp_port" type="number" placeholder="SMTP 端口" />
          <select id="smtp_security">
            <option value="">SMTP 安全（自动）</option>
            <option value="ssl">SSL/TLS</option>
            <option value="tls">STARTTLS</option>
            <option value="plain">明文</option>
          </select>
          <input id="smtp_user" placeholder="SMTP 用户名" />
          <input id="smtp_password" type="password" placeholder="SMTP 密码" />
        </div>
        <button type="submit" id="login-btn">登录</button>
        <div id="error" class="error" style="display:none"></div>
      </form>
    </div>
  `;

  const toggle = document.getElementById("advanced-toggle");
  const advanced = document.getElementById("advanced");
  toggle.addEventListener("click", () => {
    advanced.hidden = !advanced.hidden;
  });

  const form = document.getElementById("login-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const adv = advanced.hasAttribute("hidden") ? null : collectAdvanced();
    const btn = document.getElementById("login-btn");
    btn.disabled = true;
    btn.textContent = "登录中…";
    try {
      await call("login", { email, password, advanced: adv });
      onSuccess();
    } catch {
      btn.disabled = false;
      btn.textContent = "登录";
    }
  });
}

function collectAdvanced() {
  const get = (id) => {
    const v = document.getElementById(id).value.trim();
    return v ? v : null;
  };
  const getNum = (id) => {
    const v = document.getElementById(id).value.trim();
    return v ? Number(v) : null;
  };
  return {
    imap_host: get("imap_host"),
    imap_port: getNum("imap_port"),
    imap_security: get("imap_security"),
    imap_user: get("imap_user"),
    smtp_host: get("smtp_host"),
    smtp_port: getNum("smtp_port"),
    smtp_security: get("smtp_security"),
    smtp_user: get("smtp_user"),
    smtp_password: get("smtp_password"),
  };
}
```

- [ ] **Step 4: 写 `src/main.js`（路由）**

```js
import { call } from "./api.js";
import { renderLogin } from "./views/login.js";

async function boot() {
  const configured = await call("is_configured");
  if (configured) {
    showMain();
  } else {
    renderLogin(showMain);
  }
}

function showMain() {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="main-placeholder">已登录（主视图待实现）</div>`;
}

boot();
```

- [ ] **Step 5: 追加登录样式到 `src/styles.css`**

```css
.login-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
.login-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 320px;
}
.login-form h1 { margin: 0 0 8px; font-size: 22px; }
.login-form input, .login-form select, .login-form button {
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--fg);
  font-size: 14px;
}
.login-form button { cursor: pointer; border-color: var(--fg); }
.login-form button:disabled { opacity: 0.5; cursor: default; }
.advanced { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
.link { background: none; border: none; color: var(--fg); text-decoration: underline; cursor: pointer; text-align: left; padding: 4px 0; }
.error { color: var(--fg); background: #f2f2f2; padding: 8px; border-radius: 4px; font-size: 13px; }
.main-placeholder { display: flex; align-items: center; justify-content: center; height: 100%; color: #888; }
```

- [ ] **Step 6: 手动验证登录流程**

Run: `cargo tauri dev`
操作：输入一个真实可用的 IMAP/SMTP 邮箱与密码（或测试 chatmail 账号），点击登录。
Expected: 登录成功后显示"已登录"占位；错误时表单下方显示错误文案，按钮恢复。

- [ ] **Step 7: 提交**

```bash
git add src/
git commit -m "feat(frontend): add login view with advanced IMAP/SMTP settings"
```

---

### Task 5: 会话/消息/发送命令与事件转发

**Files:**
- Modify: `src-tauri/src/dto.rs`
- Modify: `src-tauri/src/commands.rs`
- Create: `src-tauri/src/events.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/events.rs`（inline `#[cfg(test)]`）

**Interfaces:**
- Consumes: `deltachat::chatlist::Chatlist`、`deltachat::chat::{self, Chat, ChatItem, ChatId}`、`deltachat::message::{self, Message, MessageState}`、`deltachat::contact::Contact`、`deltachat::events::{EventType, EventEmitter}`
- Produces DTO:
  - `pub struct ChatDto { chat_id: u32, name: String, is_group: bool, last_msg: Option<String>, last_ts: Option<i64>, unread: u32 }`
  - `pub struct MsgDto { msg_id: u32, from_id: u32, from_name: String, text: String, ts: i64, is_out: bool, state: String }`
- Produces commands:
  - `get_chatlist(state) -> Vec<ChatDto>`
  - `get_chat_msgs(state, chat_id) -> Vec<MsgDto>`
  - `send_text(state, chat_id, text) -> u32`（msg_id）
- Produces `events.rs`:
  - `pub fn spawn_event_forwarder(app: tauri::AppHandle, accounts: Arc<Mutex<Accounts>>)`
  - payload 结构：`{ typ: String, chat_id: Option<u32>, msg_id: Option<u32>, contact_id: Option<u32> }`

- [ ] **Step 1: 在 `dto.rs` 追加 DTO**

```rust
#[derive(Debug, Serialize)]
pub struct ChatDto {
    pub chat_id: u32,
    pub name: String,
    pub is_group: bool,
    pub last_msg: Option<String>,
    pub last_ts: Option<i64>,
    pub unread: u32,
}

#[derive(Debug, Serialize)]
pub struct MsgDto {
    pub msg_id: u32,
    pub from_id: u32,
    pub from_name: String,
    pub text: String,
    pub ts: i64,
    pub is_out: bool,
    pub state: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct EventPayload {
    pub typ: String,
    pub chat_id: Option<u32>,
    pub msg_id: Option<u32>,
    pub contact_id: Option<u32>,
}
```

- [ ] **Step 2: 在 `commands.rs` 追加会话/消息命令**

```rust
use deltachat::chat::{self, Chat, ChatItem};
use deltachat::chatlist::Chatlist;
use deltachat::contact::Contact;
use deltachat::message::{self, MessageState};

use crate::dto::{ChatDto, MsgDto};

fn state_str(s: MessageState) -> &'static str {
    match s {
        MessageState::OutPending => "pending",
        MessageState::OutFailed => "failed",
        MessageState::OutDelivered => "delivered",
        MessageState::OutMdnRcvd => "read",
        _ => "other",
    }
}

#[tauri::command]
pub async fn get_chatlist(state: State<'_, AppState>) -> AppResult<Vec<ChatDto>> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let list = Chatlist::try_load(&ctx, 0, None, None).await?;
    let mut out = Vec::with_capacity(list.len());
    for i in 0..list.len() {
        let chat_id = list.get_chat_id(i)?;
        let chat = Chat::load_from_db(&ctx, chat_id).await?;
        let is_group = chat.get_type() == deltachat::chat::Chattype::Group;
        let (last_msg, last_ts) = if let Some(msg_id) = list.get_msg_id(i)? {
            let m = message::Message::load_from_db(&ctx, msg_id).await?;
            (Some(m.get_text()), Some(m.get_timestamp()))
        } else {
            (None, None)
        };
        let unread = chat_id.get_fresh_msg_cnt(&ctx).await?;
        out.push(ChatDto {
            chat_id: chat_id.to_u32(),
            name: chat.get_name().to_string(),
            is_group,
            last_msg,
            last_ts,
            unread,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn get_chat_msgs(state: State<'_, AppState>, chat_id: u32) -> AppResult<Vec<MsgDto>> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let chat_id = deltachat::chat::ChatId::new(chat_id);
    let items = chat::get_chat_msgs(&ctx, chat_id).await?;
    let mut out = Vec::new();
    for item in items {
        if let ChatItem::Message { msg_id } = item {
            let m = message::Message::load_from_db(&ctx, msg_id).await?;
            let from_id = m.get_from_id();
            let from_name = if from_id == deltachat::contact::ContactId::SELF {
                "我".to_string()
            } else {
                Contact::get_by_id(&ctx, from_id).await?.get_display_name().to_string()
            };
            out.push(MsgDto {
                msg_id: msg_id.to_u32(),
                from_id: from_id.to_u32(),
                from_name,
                text: m.get_text(),
                ts: m.get_timestamp(),
                is_out: m.get_state().is_outgoing(),
                state: state_str(m.get_state()).to_string(),
            });
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn send_text(
    state: State<'_, AppState>,
    chat_id: u32,
    text: String,
) -> AppResult<u32> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let chat_id = deltachat::chat::ChatId::new(chat_id);
    let msg_id = chat::send_text_msg(&ctx, chat_id, text).await?;
    Ok(msg_id.to_u32())
}
```

- [ ] **Step 3: 写 `events.rs`（含测试）**

```rust
use std::sync::Arc;
use tokio::sync::Mutex;

use deltachat::accounts::Accounts;
use deltachat::events::EventType;
use tauri::{AppHandle, Emitter};

use crate::dto::EventPayload;

pub fn spawn_event_forwarder(app: AppHandle, accounts: Arc<Mutex<Accounts>>) {
    tokio::spawn(async move {
        let emitter = {
            let accounts = accounts.lock().await;
            accounts.get_event_emitter()
        };
        while let Some(event) = emitter.recv().await {
            let payload = match event.typ {
                EventType::IncomingMsg { chat_id, msg_id } => EventPayload {
                    typ: "IncomingMsg".into(),
                    chat_id: Some(chat_id.to_u32()),
                    msg_id: Some(msg_id.to_u32()),
                    contact_id: None,
                },
                EventType::MsgsChanged { chat_id, msg_id } => EventPayload {
                    typ: "MsgsChanged".into(),
                    chat_id: Some(chat_id.to_u32()),
                    msg_id: Some(msg_id.to_u32()),
                    contact_id: None,
                },
                EventType::ContactsChanged(c) => EventPayload {
                    typ: "ContactsChanged".into(),
                    chat_id: None,
                    msg_id: None,
                    contact_id: c.map(|x| x.to_u32()),
                },
                EventType::ConfigureProgress { .. } => EventPayload {
                    typ: "ConfigureProgress".into(),
                    chat_id: None,
                    msg_id: None,
                    contact_id: None,
                },
                _ => continue,
            };
            let _ = app.emit("dc-event", payload);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_payload_serialization() {
        let p = EventPayload {
            typ: "IncomingMsg".into(),
            chat_id: Some(42),
            msg_id: Some(7),
            contact_id: None,
        };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("\"typ\":\"IncomingMsg\""));
        assert!(json.contains("\"chat_id\":42"));
        assert!(json.contains("\"msg_id\":7"));
    }
}
```

- [ ] **Step 4: 在 `lib.rs` 注册新命令并启动事件转发**

将 `lib.rs` 改为：

```rust
mod commands;
mod dto;
mod error;
mod events;
mod state;

use tauri::Manager;

use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir().expect("no app data dir");
            let accounts_dir = dir.join("accounts");
            let state = tauri::async_runtime::block_on(async move {
                AppState::new(accounts_dir).await
            })?;
            let handle = app.handle().clone();
            events::spawn_event_forwarder(handle, state.accounts.clone());
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::is_configured,
            commands::login,
            commands::get_self_profile,
            commands::get_chatlist,
            commands::get_chat_msgs,
            commands::send_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: 运行测试**

Run: `cargo test -p peytchat --lib`
Expected: 2 tests passed（`test_state_init_and_add_account`、`test_payload_serialization`）。

- [ ] **Step 6: 编译验证**

Run: `cargo build -p peytchat`
Expected: 编译通过。

- [ ] **Step 7: 提交**

```bash
git add src-tauri/
git commit -m "feat(backend): add chatlist/msgs/send commands and event forwarding"
```

---

### Task 6: 前端主视图（会话列表 + 聊天面板）

**Files:**
- Create: `src/views/chatList.js`
- Create: `src/views/chatView.js`
- Modify: `src/main.js`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `api.js` 的 `call`/`onEvent`、`state.js` 的 `state`、后端命令 `get_chatlist`/`get_chat_msgs`/`send_text`
- Produces:
  - `views/chatList.js`: `export function renderChatList()`
  - `views/chatView.js`: `export function renderChatView(chatId)`

- [ ] **Step 1: 写 `src/views/chatList.js`**

```js
import { call, onEvent } from "../api.js";
import { state } from "../state.js";
import { renderChatView } from "./chatView.js";

export async function renderChatList() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="main">
      <aside class="sidebar">
        <div class="sidebar-header">
          <span>会话</span>
          <button id="new-group" class="link">新建群组</button>
        </div>
        <ul id="chatlist" class="chatlist"></ul>
      </aside>
      <main id="chat-panel" class="chat-panel">
        <div class="empty">选择一个会话</div>
      </main>
    </div>
  `;

  document.getElementById("new-group").addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("peytchat:new-group"));
  });

  await refreshChatlist();
  onEvent("MsgsChanged", refreshChatlist);
  onEvent("IncomingMsg", refreshChatlist);
}

async function refreshChatlist() {
  state.chatlist = await call("get_chatlist");
  const ul = document.getElementById("chatlist");
  if (!ul) return;
  ul.innerHTML = state.chatlist.map((c) => `
    <li class="chat-item ${state.currentChatId === c.chat_id ? "active" : ""}" data-id="${c.chat_id}">
      <div class="avatar">${initial(c.name)}</div>
      <div class="chat-meta">
        <div class="chat-name">${escapeHtml(c.name)}</div>
        <div class="chat-last">${escapeHtml(c.last_msg || "")}</div>
      </div>
      ${c.unread > 0 ? `<span class="unread">${c.unread}</span>` : ""}
    </li>
  `).join("");
  ul.querySelectorAll(".chat-item").forEach((el) => {
    el.addEventListener("click", () => {
      const id = Number(el.dataset.id);
      state.currentChatId = id;
      ul.querySelectorAll(".chat-item").forEach((x) => x.classList.remove("active"));
      el.classList.add("active");
      renderChatView(id);
    });
  });
}

function initial(name) {
  return (name || "?").charAt(0).toUpperCase();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}
```

- [ ] **Step 2: 写 `src/views/chatView.js`**

```js
import { call, onEvent } from "../api.js";
import { state } from "../state.js";

export async function renderChatView(chatId) {
  const panel = document.getElementById("chat-panel");
  panel.innerHTML = `
    <div class="chat-header" id="chat-header"></div>
    <div class="messages" id="messages"></div>
    <form class="composer" id="composer">
      <input id="msg-input" placeholder="输入消息…" autocomplete="off" />
      <button type="submit">发送</button>
    </form>
  `;

  const header = state.chatlist.find((c) => c.chat_id === chatId);
  document.getElementById("chat-header").textContent = header ? header.name : "";

  await refreshMessages(chatId);
  onEvent("MsgsChanged", () => { if (state.currentChatId === chatId) refreshMessages(chatId); });
  onEvent("IncomingMsg", () => { if (state.currentChatId === chatId) refreshMessages(chatId); });

  const form = document.getElementById("composer");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("msg-input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    try {
      await call("send_text", { chatId, text });
      await refreshMessages(chatId);
    } catch {
      /* 错误已由 showError 处理 */
    }
  });
}

async function refreshMessages(chatId) {
  state.messages = await call("get_chat_msgs", { chatId });
  const box = document.getElementById("messages");
  if (!box) return;
  box.innerHTML = state.messages.map((m) => `
    <div class="msg ${m.is_out ? "out" : "in"}">
      ${m.is_out ? "" : `<div class="msg-from">${escapeHtml(m.from_name)}</div>`}
      <div class="msg-text">${escapeHtml(m.text)}</div>
      ${m.state === "failed" ? `<div class="msg-failed">发送失败</div>` : ""}
    </div>
  `).join("");
  box.scrollTop = box.scrollHeight;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}
```

- [ ] **Step 3: 改 `src/main.js` 接入主视图**

```js
import { call } from "./api.js";
import { renderLogin } from "./views/login.js";
import { renderChatList } from "./views/chatList.js";

async function boot() {
  const configured = await call("is_configured");
  if (configured) {
    await renderChatList();
  } else {
    renderLogin(async () => { await renderChatList(); });
  }
}

boot();
```

- [ ] **Step 4: 追加主视图样式到 `src/styles.css`**

```css
.main { display: flex; height: 100%; }
.sidebar { width: 280px; border-right: 1px solid var(--border); display: flex; flex-direction: column; }
.sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--border); font-weight: 600; }
.chatlist { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; }
.chat-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; cursor: pointer; border-bottom: 1px solid var(--border); }
.chat-item:hover { background: #fafafa; }
.chat-item.active { background: #f0f0f0; }
.avatar { width: 34px; height: 34px; border-radius: 50%; background: var(--fg); color: var(--bg); display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; }
.chat-meta { flex: 1; min-width: 0; }
.chat-name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chat-last { font-size: 12px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.unread { background: var(--fg); color: var(--bg); border-radius: 10px; padding: 1px 7px; font-size: 11px; }
.chat-panel { flex: 1; display: flex; flex-direction: column; }
.empty { display: flex; align-items: center; justify-content: center; height: 100%; color: #888; }
.chat-header { padding: 12px 16px; border-bottom: 1px solid var(--border); font-weight: 600; }
.messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
.msg { max-width: 70%; }
.msg.in { align-self: flex-start; }
.msg.out { align-self: flex-end; }
.msg-from { font-size: 11px; color: #888; margin-bottom: 2px; }
.msg-text { padding: 8px 12px; border: 1px solid var(--border); border-radius: 12px; word-break: break-word; }
.msg.out .msg-text { background: var(--fg); color: var(--bg); }
.msg-failed { font-size: 11px; color: var(--fg); margin-top: 2px; }
.composer { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border); }
.composer input { flex: 1; padding: 9px 10px; border: 1px solid var(--border); border-radius: 4px; font-size: 14px; }
.composer button { padding: 9px 16px; border: 1px solid var(--fg); background: var(--fg); color: var(--bg); border-radius: 4px; cursor: pointer; }
```

- [ ] **Step 5: 手动验证私聊**

Run: `cargo tauri dev`
操作：登录 → 左栏出现会话 → 点击一个会话 → 右侧显示消息 → 输入文本回车发送 → 对方收到 → 对方回复后右侧实时出现。
Expected: 私聊文本收发正常，未读红点正确。

- [ ] **Step 6: 提交**

```bash
git add src/
git commit -m "feat(frontend): add two-pane main view with chatlist and chat panel"
```

---

### Task 7: 群组命令

**Files:**
- Modify: `src-tauri/src/dto.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `deltachat::chat::{self, ChatId}`、`deltachat::contact::{Contact, ContactId}`
- Produces DTO:
  - `pub struct ContactDto { id: u32, name: String, addr: String }`
- Produces commands:
  - `get_contacts(state) -> Vec<ContactDto>`
  - `create_group(state, name, member_emails) -> u32`（chat_id）
  - `add_group_member(state, chat_id, email) -> u32`（contact_id）

- [ ] **Step 1: 在 `dto.rs` 追加 `ContactDto`**

```rust
#[derive(Debug, Serialize)]
pub struct ContactDto {
    pub id: u32,
    pub name: String,
    pub addr: String,
}
```

- [ ] **Step 2: 在 `commands.rs` 追加群组命令**

```rust
use deltachat::contact::{Contact, ContactId};

use crate::dto::ContactDto;

#[tauri::command]
pub async fn get_contacts(state: State<'_, AppState>) -> AppResult<Vec<ContactDto>> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let ids = Contact::get_all(&ctx, 0, None).await?;
    let mut out = Vec::new();
    for id in ids {
        if id == ContactId::SELF || id == ContactId::INFO || id == ContactId::DEVICE {
            continue;
        }
        let c = Contact::get_by_id(&ctx, id).await?;
        out.push(ContactDto {
            id: id.to_u32(),
            name: c.get_display_name().to_string(),
            addr: c.get_addr().to_string(),
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn create_group(
    state: State<'_, AppState>,
    name: String,
    member_emails: Vec<String>,
) -> AppResult<u32> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let chat_id = chat::create_group(&ctx, &name).await?;
    for email in member_emails {
        let email = email.trim();
        if email.is_empty() { continue; }
        let cid = Contact::create(&ctx, "", email).await?;
        chat::add_contact_to_chat(&ctx, chat_id, cid).await?;
    }
    Ok(chat_id.to_u32())
}

#[tauri::command]
pub async fn add_group_member(
    state: State<'_, AppState>,
    chat_id: u32,
    email: String,
) -> AppResult<u32> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let chat_id = deltachat::chat::ChatId::new(chat_id);
    let cid = Contact::create(&ctx, "", &email).await?;
    chat::add_contact_to_chat(&ctx, chat_id, cid).await?;
    Ok(cid.to_u32())
}
```

- [ ] **Step 3: 在 `lib.rs` 注册新命令**

在 `invoke_handler!` 宏中追加三个命令：

```rust
        .invoke_handler(tauri::generate_handler![
            commands::is_configured,
            commands::login,
            commands::get_self_profile,
            commands::get_chatlist,
            commands::get_chat_msgs,
            commands::send_text,
            commands::get_contacts,
            commands::create_group,
            commands::add_group_member,
        ])
```

- [ ] **Step 4: 编译验证**

Run: `cargo build -p peytchat`
Expected: 编译通过。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/
git commit -m "feat(backend): add get_contacts, create_group, add_group_member commands"
```

---

### Task 8: 前端群组弹层

**Files:**
- Create: `src/views/group.js`
- Modify: `src/views/chatList.js`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: 后端命令 `create_group`、`add_group_member`
- Produces:
  - `views/group.js`: `export function openCreateGroupDialog(onCreated)`

- [ ] **Step 1: 写 `src/views/group.js`**

```js
import { call, clearError } from "../api.js";

export function openCreateGroupDialog(onCreated) {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="dialog">
      <h2>新建群组</h2>
      <input id="group-name" placeholder="群组名称" />
      <textarea id="group-members" placeholder="成员邮箱，逗号分隔&#10;alice@example.com, bob@example.com"></textarea>
      <div id="error" class="error" style="display:none"></div>
      <div class="dialog-actions">
        <button type="button" id="group-cancel" class="link">取消</button>
        <button type="button" id="group-create">创建</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  document.getElementById("group-cancel").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  document.getElementById("group-create").addEventListener("click", async () => {
    clearError();
    const name = document.getElementById("group-name").value.trim();
    const raw = document.getElementById("group-members").value.trim();
    if (!name) return;
    const emails = raw ? raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean) : [];
    try {
      await call("create_group", { name, memberEmails: emails });
      close();
      onCreated();
    } catch {
      /* 错误已显示 */
    }
  });
}
```

- [ ] **Step 2: 在 `chatList.js` 接入新建群组**

在 `renderChatList` 中，将"新建群组"按钮的事件处理改为：

```js
import { openCreateGroupDialog } from "./group.js";

// 替换原来的 dispatchEvent 逻辑：
document.getElementById("new-group").addEventListener("click", () => {
  openCreateGroupDialog(async () => { await refreshChatlist(); });
});
```

- [ ] **Step 3: 追加弹层样式到 `src/styles.css`**

```css
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; z-index: 100; }
.dialog { background: var(--bg); border: 1px solid var(--border); padding: 20px; width: 360px; display: flex; flex-direction: column; gap: 12px; }
.dialog h2 { margin: 0; font-size: 16px; }
.dialog input, .dialog textarea { padding: 9px 10px; border: 1px solid var(--border); border-radius: 4px; font-size: 14px; font-family: inherit; }
.dialog textarea { min-height: 80px; resize: vertical; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 12px; }
.dialog-actions button { padding: 8px 16px; border: 1px solid var(--fg); border-radius: 4px; cursor: pointer; }
.dialog-actions button:last-child { background: var(--fg); color: var(--bg); }
```

- [ ] **Step 4: 手动验证群聊**

Run: `cargo tauri dev`
操作：登录 → 点"新建群组" → 输入群名 + 2 个邮箱 → 创建 → 左栏出现群组 → 选中 → 群内发文本 → 成员收到。
Expected: 群组创建成功，群内文本收发正常。

- [ ] **Step 5: 提交**

```bash
git add src/
git commit -m "feat(frontend): add create-group dialog"
```

---

### Task 9: 错误处理打磨与全量手动验证

**Files:**
- Modify: `src-tauri/src/error.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src/views/login.js`

**Interfaces:**
- 无新增接口；改进 `login` 命令的错误映射。

- [ ] **Step 1: 在 `login` 命令中映射核心错误**

将 `commands.rs` 中 `login` 的 `ctx.add_or_update_transport(&mut param).await?;` 替换为带映射的版本：

```rust
    if let Err(e) = ctx.add_or_update_transport(&mut param).await {
        let msg = e.to_string().to_lowercase();
        let mapped = if msg.contains("auth") || msg.contains("login") || msg.contains("password") {
            AppError::AuthFailed
        } else if msg.contains("network") || msg.contains("connection") || msg.contains("timeout") {
            AppError::Network(msg)
        } else if msg.contains("autoconfig") || msg.contains("provider") {
            AppError::AutoconfigNotFound
        } else {
            AppError::Core(e.to_string())
        };
        return Err(mapped);
    }
    ctx.start_io().await;
```

- [ ] **Step 2: 在 `login.js` 显示登录进度（可选，订阅 ConfigureProgress）**

在 `views/login.js` 的提交处理中，在调用 `call("login")` 前订阅进度：

```js
import { onEvent } from "../api.js";

// 在 form submit 处理函数内，btn.textContent = "登录中…" 之后追加：
const unlisten = await onEvent("ConfigureProgress", () => {
  btn.textContent = "登录中…";
});
try {
  await call("login", { email, password, advanced: adv });
  unlisten();
  onSuccess();
} catch {
  unlisten();
  btn.disabled = false;
  btn.textContent = "登录";
}
```

- [ ] **Step 3: 编译与测试**

Run: `cargo test -p peytchat --lib && cargo build -p peytchat`
Expected: 测试通过，编译成功。

- [ ] **Step 4: 全量手动验证清单**

依次执行以下 8 项，全部通过：

1. 用任意 IMAP/SMTP 邮箱登录成功（默认 autoconfig）。
2. autoconfig 失败时展开高级设置手动填写，登录成功。
3. 收到一封邮件 → 左栏显示为会话项。
4. 选中会话 → 发送文本 → 对方收到。
5. 对方回复 → 右侧消息流实时出现。
6. 创建群组 → 邀请 2 人 → 群内收发文本。
7. 断网发送 → 消息标记"发送失败"；恢复后核心自动重试。
8. 重启应用 → 已登录态保留，会话与消息恢复。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/ src/
git commit -m "feat: polish login error mapping and add progress feedback"
```

---

## Self-Review

**1. Spec coverage:**
- §1 目标（邮箱登录 + 私聊/群聊文本 + 用户渲染）→ Task 3（登录）+ Task 6（私聊）+ Task 7/8（群聊）+ Task 7 `get_contacts`/`get_self_profile`（用户渲染）。✓
- §3 仓库布局 → Task 1 建立全部骨架文件。✓
- §4.1 AppState → Task 2。✓
- §4.2 命令表（9 个命令）→ is_configured/login/get_self_profile (Task 3) + get_chatlist/get_chat_msgs/send_text (Task 5) + get_contacts/create_group/add_group_member (Task 7)。✓
- §4.3 事件转发 → Task 5 `events.rs`。✓
- §4.4 AppError → Task 2 + Task 9 打磨。✓
- §5 前端各模块 → Task 4（登录）+ Task 6（主视图）+ Task 8（群组）。✓
- §6 数据流 → 命令 + 事件两条路径均覆盖。✓
- §7 错误处理 → Task 9 映射 + Task 6 发送失败标记。✓
- §8 测试 → Rust 单测（Task 2/5）+ 手动验证清单（Task 9 Step 4）。✓
- §10 风险缓解（pin commit）→ Global Constraints 已注明 pin 到当前 main。✓

**2. Placeholder scan:** 无 TBD/TODO/"适当处理"。每步均有实际代码或具体命令。✓

**3. Type consistency:**
- `AppState` 字段 `accounts: Arc<Mutex<Accounts>>` + `current_id: Option<u32>` 在 Task 2 定义，Task 3/5/7 使用一致。✓
- `AppError` 变体在 Task 2 定义，Task 9 引用 `AuthFailed`/`Network`/`AutoconfigNotFound`/`Core` 一致。✓
- DTO 字段名：`chat_id`/`msg_id`/`is_out`/`state` 在 Task 5 定义，Task 6 前端使用一致。✓
- `EventPayload.typ` 字符串 `"IncomingMsg"`/`"MsgsChanged"`/`"ContactsChanged"`/`"ConfigureProgress"` 在 Task 5 Rust 与 Task 4/6 前端 `onEvent` 一致。✓
- 命令名 `create_group`/`add_group_member`/`get_contacts`（snake_case，Tauri 自动转 camelCase 调用：`createGroup`/`addGroupMember`/`getContacts`）—— Task 8 前端调用 `call("create_group", { name, memberEmails })`，Tauri v2 默认对命令名不自动转换，前端 invoke 用 snake_case 原名。参数 `member_emails` → 前端传 `memberEmails`：Tauri v2 默认对参数名做 camelCase→snake_case 转换。✓ 一致。

无问题，计划完整。

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-29-peytchat-mvp.md`. Two execution options:

1. **Subagent-Driven (recommended)** - 每个 Task 派一个 fresh subagent，Task 间 review，快速迭代
2. **Inline Execution** - 在当前会话用 executing-plans 批量执行，带 checkpoint review

Which approach?
