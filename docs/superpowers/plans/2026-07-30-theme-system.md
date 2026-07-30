# Discord 风格主题系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Nowint 黑白主题基础上，新增 VioletEverGarden（紫罗兰）和 GoldenHour（粉黄）两个 Discord 风格渐变主题，通过 CSS 变量 + `data-theme` 属性实现零侵入切换。

**Architecture:** 将 212 处内联硬编码颜色重构为 CSS 变量引用（Nowint 下渲染结果零变化），通过 `[data-theme="xxx"]` 选择器覆盖变量。body 设渐变背景，独立 `.theme-mask` div 做遮罩层，`#app` 在其上方。主题选择持久化到 localStorage，启动时 `initTheme()` 在渲染前应用避免 FOUC。

**Tech Stack:** Vanilla JS（无框架）、CSS 自定义属性、Tauri（桌面壳）、localStorage（持久化）

## Global Constraints

- **Nowint 零变化**：`:root` 中现有 11 个变量（`--bg`/`--panel`/`--border`/`--border-strong`/`--active`/`--capsule`/`--text`/`--text-body`/`--text-mute`/`--text-weak`/`--text-faint`）的值完全不变，只允许新增变量
- **Violet 渐变**：`linear-gradient(135deg, #583aeb 0%, #ff914d 100%)` + 85% 黑遮罩（`rgba(0,0,0,0.85)`）+ 10% 白面板（`rgba(255,255,255,0.10)`）
- **GoldenHour 渐变**：`linear-gradient(135deg, #FF8A3D 0%, #FFB86B 35%, #FFE08A 70%, #FFF1D6 100%)` + 70% 白遮罩（`rgba(255,255,255,0.7)`）+ 50% 浅灰面板（`rgba(245,240,235,0.5)`）
- **文本偏色**：Violet 偏紫（非纯白），GoldenHour 偏暖棕（非纯黑）
- **面板边框**：Violet 和 GoldenHour 都用极细半透明边框
- **作用范围**：仅主 shell，登录页保持 Nowint
- **交互**：点击色板即应用，无需确认按钮
- **core 禁止修改**：不动 `core/` 目录
- **调色板**（Nowint 现有值，不可变）：`#0d0d0d`/`#0a0a0a`/`#1a1a1a`/`#222`/`#1f1f1f`/`#161616`/`#e5e5e5`/`#d4d4d4`/`#888`/`#555`/`#444`

## 颜色映射表（全计划通用）

重构时按此表将硬编码颜色替换为 CSS 变量：

| 硬编码值 | 替换为 | 用途 |
|---------|--------|------|
| `#0d0d0d` | `var(--bg)` | 主背景 |
| `#0a0a0a` | `var(--panel)` | 面板背景 |
| `#1a1a1a` | `var(--border)` | 普通边框 |
| `#222` | `var(--border-strong)` | 强边框/输入框边框 |
| `#1f1f1f` | `var(--active)` | 激活/hover 背景 |
| `#161616` | `var(--capsule)` | 胶囊/按钮背景 |
| `#e5e5e5` | `var(--text)` | 主文本 |
| `#d4d4d4` | `var(--text-body)` | 正文文本 |
| `#888` | `var(--text-mute)` | 次要文本 |
| `#555` | `var(--text-weak)` | 弱文本 |
| `#444` | `var(--text-faint)` | 极弱文本 |
| `#333` | `var(--border-dashed)` | 虚线边框/图标边框/引用线 |
| `#666` | `var(--text-action)` | 操作按钮文本 |
| `#fff` | `var(--hover-bright)` | hover 时的亮色 |
| `#fff`（QR 码背景） | **不替换** | QR 码需要纯白背景才能扫描 |

**特殊不替换**：
- `colorHex()` 返回的动态头像背景色（由 Contact::get_color() 决定，与主题无关）
- QR 码 canvas 的 `#fff` 背景（功能需求）
- hljs 代码高亮的内联颜色（第三方库控制）

---

### Task 1: 主题基础设施（theme.js + main.js + index.html + styles.css 变量块）

**Files:**
- Create: `src/theme.js`
- Modify: `src/main.js:1-13`
- Modify: `src/index.html:9-12`
- Modify: `src/styles.css:1-15`（:root 新增变量 + 末尾追加主题变量块）

**Interfaces:**
- Produces: `getCurrentTheme()` → `"nowint" | "violet" | "goldenhour"`；`applyTheme(theme: string)` → 设置 `data-theme` 属性 + 写 localStorage；`initTheme()` → 启动时调用

- [ ] **Step 1: 创建 src/theme.js**

```javascript
// src/theme.js
const THEME_KEY = "peytchat.theme";

export function getCurrentTheme() {
  return localStorage.getItem(THEME_KEY) || "nowint";
}

export function applyTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  if (theme === "nowint") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

export function initTheme() {
  applyTheme(getCurrentTheme());
}
```

- [ ] **Step 2: 修改 src/main.js，在 boot 开头调用 initTheme**

将 `src/main.js` 第 1 行改为：

```javascript
import { call } from "./api.js";
import { initTheme } from "./theme.js";
import { renderLogin } from "./views/login.js";
import { renderShell } from "./shell/shell.js";

async function boot() {
  initTheme();
  const configured = await call("is_configured");
  if (configured) {
    await renderShell();
  } else {
    renderLogin(async () => { await renderShell(); });
  }
}

boot();
```

- [ ] **Step 3: 修改 src/index.html，在 #app 前插入 .theme-mask**

将 `<body>` 内改为：

```html
  <body>
    <div class="theme-mask"></div>
    <div id="app"><h1>Peytchat</h1></div>
    <script type="module" src="/main.js"></script>
  </body>
```

- [ ] **Step 4: 修改 src/styles.css :root，新增变量（不改动现有 11 个变量）**

将 `src/styles.css` 第 1-15 行的 `:root` 块改为（在 `--text-faint` 后、`--font` 前新增 5 个变量）：

```css
:root {
  --bg: #0d0d0d;
  --panel: #0a0a0a;
  --border: #1a1a1a;
  --border-strong: #222;
  --active: #1f1f1f;
  --capsule: #161616;
  --text: #e5e5e5;
  --text-body: #d4d4d4;
  --text-mute: #888;
  --text-weak: #555;
  --text-faint: #444;
  --border-dashed: #333;
  --text-action: #666;
  --hover-bright: #fff;
  --theme-gradient: none;
  --theme-mask: none;
  --font: -apple-system, 'SF Pro Display', 'Inter', sans-serif;
  --font-mono: 'SF Mono', Menlo, monospace;
}
```

- [ ] **Step 5: 在 src/styles.css 末尾追加主题变量覆盖块 + 遮罩层 CSS**

在文件末尾追加：

```css
/* === 主题系统 === */

/* 遮罩层 */
.theme-mask {
  position: fixed;
  inset: 0;
  background: var(--theme-mask);
  z-index: 0;
  pointer-events: none;
}

/* body 背景：有渐变用渐变，无渐变回退到 --bg */
body {
  background: var(--theme-gradient, var(--bg));
}

#app {
  position: relative;
  z-index: 1;
}

/* VioletEverGarden 主题 */
[data-theme="violet"] {
  --bg: rgba(255,255,255,0.10);
  --panel: rgba(255,255,255,0.10);
  --border: rgba(255,255,255,0.06);
  --border-strong: rgba(255,255,255,0.10);
  --active: rgba(255,255,255,0.20);
  --capsule: rgba(255,255,255,0.08);
  --text: #e8e5f0;
  --text-body: #d8d5e4;
  --text-mute: #9890aa;
  --text-weak: #665a7a;
  --text-faint: #443a5a;
  --border-dashed: rgba(255,255,255,0.12);
  --text-action: #9890aa;
  --hover-bright: #f5f0ff;
  --theme-gradient: linear-gradient(135deg, #583aeb 0%, #ff914d 100%);
  --theme-mask: rgba(0,0,0,0.85);
}

/* GoldenHour 主题 */
[data-theme="goldenhour"] {
  --bg: rgba(245,240,235,0.5);
  --panel: rgba(245,240,235,0.5);
  --border: rgba(60,40,20,0.06);
  --border-strong: rgba(60,40,20,0.10);
  --active: rgba(60,40,20,0.08);
  --capsule: rgba(255,250,245,0.6);
  --text: #3a3028;
  --text-body: #4a4038;
  --text-mute: #7a7068;
  --text-weak: #aaa090;
  --text-faint: #c0b8a8;
  --border-dashed: rgba(60,40,20,0.12);
  --text-action: #7a7068;
  --hover-bright: #fff8f0;
  --theme-gradient: linear-gradient(135deg, #FF8A3D 0%, #FFB86B 35%, #FFE08A 70%, #FFF1D6 100%);
  --theme-mask: rgba(255,255,255,0.7);
}
```

- [ ] **Step 6: 验证构建**

Run: `npm run build`
Expected: 构建成功，无报错

- [ ] **Step 7: 手动验证主题切换**

Run: `npm run tauri dev`
在浏览器 devtools console 执行：
```javascript
document.documentElement.setAttribute('data-theme', 'violet');
// 观察：body 出现紫蓝→橙渐变，85%黑遮罩覆盖，面板半透明
document.documentElement.setAttribute('data-theme', 'goldenhour');
// 观察：body 出现粉黄渐变，70%白遮罩覆盖，面板半透明
document.documentElement.removeAttribute('data-theme');
// 观察：恢复 Nowint 黑白
```
Expected: 三个主题切换正常，Nowint 完全恢复。注意：此时内联硬编码颜色还未替换，面板背景仍是硬编码的 #0a0a0a，这是预期的——后续 Task 会替换。

- [ ] **Step 8: Commit**

```bash
git add src/theme.js src/main.js src/index.html src/styles.css
git commit -m "feat: 主题基础设施 — theme.js + CSS 变量覆盖块 + .theme-mask DOM"
```

---

### Task 2: 重构 styles.css 硬编码颜色

**Files:**
- Modify: `src/styles.css`（全文件，约 100 处硬编码颜色）

**Interfaces:**
- Consumes: Task 1 的 CSS 变量定义
- Produces: styles.css 中所有颜色使用 `var(--xxx)` 引用

- [ ] **Step 1: 替换 styles.css 中所有硬编码颜色为 var() 引用**

按颜色映射表替换。以下是每处替换的精确位置（行号以当前文件为准，替换时搜索匹配的硬编码值）：

**`#0d0d0d` → `var(--bg)`（3 处）**：
- 第 448 行 `.msg-unread-divider .divider-label { background: #0d0d0d; }` → `var(--bg)`
- 第 490 行 `.space-type-toggle { background: #0d0d0d; }` → `var(--bg)`

**`#0a0a0a` → `var(--panel)`（12 处）**：
- 第 17 行 `html, body { background: var(--bg); }` — body 行已有 var(--bg)，跳过
- 第 33 行 `.ws-rail { background: #0a0a0a; }` → `var(--panel)`
- 第 44 行 `.app-rail { background: #0a0a0a; }` → `var(--panel)`
- 第 56 行 `.app-icon.disabled { background: #0a0a0a; }` → `var(--panel)`
- 第 157 行 `.rd-search input { background: #0a0a0a; }` → `var(--panel)`
- 第 164 行 `.detail-expand { background: #0a0a0a; }` → `var(--panel)`
- 第 407 行 `.msg-attachment.file { background: #0a0a0a; }` → `var(--panel)`
- 第 498 行 `.detail-tabs { border-bottom: 1px solid #1a1a1a; }` — 这是 border，改为 `var(--border)`
- 第 512 行 `.card-detail-title { background: #0a0a0a; }` → `var(--panel)`
- 第 524 行 `.card-detail-value select, input { background: #0a0a0a; }` → `var(--panel)`
- 第 533 行 `.card-detail-desc { background: #0a0a0a; }` → `var(--panel)`
- 第 543 行 `.btn { background: #0a0a0a; }` → `var(--panel)`

**`#1a1a1a` → `var(--border)`（15 处）**：
- 第 33 行 `.ws-rail { border-right: 1px solid #1a1a1a; }` → `var(--border)`
- 第 47 行 `.app-rail { border-right: 1px solid #1a1a1a; }` → `var(--border)`
- 第 79 行 `.channel-tree { border-right: 1px solid #1a1a1a; }` → `var(--border)`（注意：.channel-tree 和 .nav-tree 共享规则）
- 第 80 行 `.nav-tree { border-right: 1px solid #1a1a1a; }` → `var(--border)`
- 第 87 行 `.nav-view-switcher { border-top: 1px solid #1a1a1a; }` → `var(--border)`
- 第 101 行 `.channel-tree .ct-user { border-top: 1px solid #1a1a1a; }` → `var(--border)`
- 第 107 行 `.home-item { border-bottom: 1px solid #1a1a1a; }` → `var(--border)`
- 第 130 行 `.chat-header { border-bottom: 1px solid #1a1a1a; }` — 检查：实际是 `var(--border)`？不，第 130 行写的是 `1px solid var(--border)`，已用变量，跳过
- 第 146 行 `.composer { border-top: 1px solid #1a1a1a; }` — 检查实际值，如已是 `var(--border)` 跳过
- 第 149 行 `.right-drawer { border-left: 1px solid #1a1a1a; }` — 同上
- 第 156 行 `.rd-search { border-bottom: 1px solid #1a1a1a; }` → `var(--border)`
- 第 454 行 `.rd-pin-item { border-bottom: 1px solid #1a1a1a; }` → `var(--border)`
- 第 498 行 `.detail-tabs { border-bottom: 1px solid #1a1a1a; }` → `var(--border)`

**`#222` → `var(--border-strong)`（18 处）**：
- 第 58 行 `.app-avatar { background: #222; }` → `var(--border-strong)`
- 第 71 行 `.app-ws-icon { background: #161616; border: 1px solid #222; }` → border 用 `var(--border-strong)`
- 第 102 行 `.channel-tree .ct-avatar { background: #222; }` → `var(--border-strong)`
- 第 112 行 `.home-avatar { background: #222; }` → `var(--border-strong)`
- 第 160 行 `.rd-avatar { background: #222; }` → `var(--border-strong)`
- 第 410 行 `.msg-attachment.file .file-icon { background: #161616; border: 1px solid #222; }` → border 用 `var(--border-strong)`
- 第 468 行 `.msg-avatar { background: #222; }` → `var(--border-strong)`
- 第 477 行 `.member-detail-avatar { background: #222; }` → `var(--border-strong)`
- 第 512 行 `.card-detail-title { border: 1px solid #222; }` → `var(--border-strong)`
- 第 525 行 `.card-detail-value select, input { border: 1px solid #222; }` → `var(--border-strong)`
- 第 533 行 `.card-detail-desc { border: 1px solid #222; }` → `var(--border-strong)`
- 第 542 行 `.btn { border: 1px solid #222; }` → `var(--border-strong)`
- 第 552 行 `.btn-ghost { border-color: #222; }` → `var(--border-strong)`

**`#1f1f1f` → `var(--active)`（5 处）**：
- 第 38 行 `.ws-rail .ws-sep { background: #1f1f1f; }` → `var(--active)`
- 第 65 行 `.app-separator { background: #1f1f1f; }` → `var(--active)`
- 第 75 行 `.app-rail .ws-sep { background: #1f1f1f; }` → `var(--active)`
- 第 546 行 `.btn:hover { background: #1f1f1f; }` → `var(--active)`
- 第 492 行 `.st-btn.active { background: #1f1f1f; }` → `var(--active)`
- 第 553 行 `.btn-ghost:hover { background: #1f1f1f; }` → `var(--active)`

**`#161616` → `var(--capsule)`（8 处）**：
- 第 7 行 `--capsule: #161616;` — 这是变量定义本身，跳过
- 第 37 行 `.ws-rail .ws-icon.inactive { background: #161616; }` → `var(--capsule)`（检查：实际已是 `var(--capsule)`？如已是用变量跳过）
- 第 52 行 `.app-icon { background: #161616; }` → `var(--capsule)`
- 第 71 行 `.app-ws-icon { background: #161616; }` → `var(--capsule)`
- 第 108 行 `.home-item:hover { background: #161616; }` → `var(--capsule)`
- 第 410 行 `.file-icon { background: #161616; }` → `var(--capsule)`
- 第 456 行 `.rd-pin-item:hover { background: #161616; }` → `var(--capsule)`

**`#e5e5e5` → `var(--text)`（20 处）**：
- 第 8 行 `--text: #e5e5e5;` — 变量定义，跳过
- 第 114 行 `.home-avatar { color: #e5e5e5; }` → `var(--text)`
- 第 121 行 `.home-name { color: #e5e5e5; }` → `var(--text)`
- 第 125 行 `.home-unread { color: #0a0a0a; }` — 这是 `color: var(--panel)`，背景是 `#e5e5e5` → `var(--text)`
- 第 160 行 `.rd-avatar { color: #e5e5e5; }` → `var(--text)`
- 第 414 行 `.file-name { color: #e5e5e5; }` → `var(--text)`
- 第 421 行 `.msg-state.state-read { color: #e5e5e5; }` → `var(--text)`
- 第 422 行 `.msg-state.state-failed { color: #e5e5e5; }` → `var(--text)`
- 第 425 行 `.msg-resend { color: #e5e5e5; }` → `var(--text)`
- 第 445 行 `.msg-unread-divider .divider-line { background: #e5e5e5; }` → `var(--text)`
- 第 447 行 `.msg-unread-divider .divider-label { color: #e5e5e5; }` → `var(--text)`
- 第 457 行 `.rd-pin-from { color: #e5e5e5; }` → `var(--text)`
- 第 469 行 `.msg-avatar { color: #e5e5e5; }` → `var(--text)`
- 第 479 行 `.member-detail-avatar { color: #e5e5e5; }` → `var(--text)`
- 第 488 行 `.settings-avatar-letter { color: #e5e5e5; }` → `var(--text)`
- 第 491 行 `.st-btn.active { color: #e5e5e5; }` → `var(--text)`
- 第 503 行 `.detail-tab.active { color: #e5e5e5; }` → `var(--text)`
- 第 504 行 `.detail-tab.active { border-bottom: 1px solid #e5e5e5; }` → `var(--text)`
- 第 511 行 `.card-detail-title { color: #e5e5e5; }` → `var(--text)`
- 第 521 行 `.card-detail-value { color: #e5e5e5; }` → `var(--text)`
- 第 526 行 `.card-detail-value select, input { color: #e5e5e5; }` → `var(--text)`
- 第 531 行 `.card-type.task { color: #e5e5e5; }` → `var(--text)`
- 第 534 行 `.card-detail-desc { color: #e5e5e5; }` → `var(--text)`
- 第 543 行 `.btn { color: #e5e5e5; }` → `var(--text)`
- 第 548 行 `.btn-primary { background: #e5e5e5; color: #0a0a0a; border-color: #e5e5e5; }` → 三处都替换为 `var(--text)` 和 `var(--panel)`

**`#888` → `var(--text-mute)`（6 处）**：
- 第 57 行 `.app-icon.settings { color: #888; }` → `var(--text-mute)`
- 第 74 行 `.app-ws-icon.home { color: #888; }` → `var(--text-mute)`
- 第 530 行 `.card-type { color: #888; }` → `var(--text-mute)`
- 第 552 行 `.btn-ghost { color: #888; }` → `var(--text-mute)`

**`#555` → `var(--text-weak)`（8 处）**：
- 第 76 行 `.ws-add { color: #555; }` → `var(--text-weak)`
- 第 452 行 `.rd-empty { color: #555; }` → `var(--text-weak)`
- 第 459 行 `.rd-pin-time { color: #555; }` → `var(--text-weak)`
- 第 501 行 `.detail-tab { color: #555; }` → `var(--text-weak)`
- 第 515 行 `.card-detail-title:focus { border-color: #555; }` → `var(--text-weak)`
- 第 519 行 `.card-detail-label { color: #555; }` → `var(--text-weak)`
- 第 529 行 `.card-detail-value select, input:focus { border-color: #555; }` → `var(--text-weak)`
- 第 537 行 `.card-detail-desc:focus { border-color: #555; }` → `var(--text-weak)`
- 第 539 行 `.detail-empty { color: #555; }` → `var(--text-weak)`

**`#333` → `var(--border-dashed)`（8 处）**：
- 第 35 行 `.ws-icon.home { border: 1px solid #333; }` → `var(--border-dashed)`
- 第 40 行 `.ws-add { border: 1px dashed #333; }` → `var(--border-dashed)`
- 第 56 行 `.app-icon.disabled { color: #333; }` → `var(--border-dashed)`（注意：这里 #333 用作 color 而非 border，但语义上是"禁用态弱色"，映射到 `var(--border-dashed)` 在 Violet/GoldenHour 下会变成半透明白/棕，效果合理）
- 第 57 行 `.app-icon.settings { border: 1px solid #333; }` → `var(--border-dashed)`
- 第 74 行 `.app-ws-icon.home { border: 1px solid #333; }` → `var(--border-dashed)`
- 第 76 行 `.ws-add { border: 1px dashed #333; }` → `var(--border-dashed)`
- 第 142 行 `.msg-quote { border-left: 2px solid #333; }` → `var(--border-dashed)`

**`#666` → `var(--text-action)`（1 处）**：
- 第 133 行 `.chat-header .ch-actions { color: #666; }` → `var(--text-action)`

**`#fff` → `var(--hover-bright)`（1 处）**：
- 第 551 行 `.btn-primary:hover { background: #fff; }` → `var(--hover-bright)`

- [ ] **Step 2: 验证构建**

Run: `npm run build`
Expected: 构建成功

- [ ] **Step 3: 验证 Nowint 主题零变化**

Run: `npm run tauri dev`
检查：所有界面与重构前完全一致（颜色值通过 CSS 变量解析为相同的 hex 值）

- [ ] **Step 4: 验证 Violet/GoldenHour 主题**

在 devtools console 执行 `document.documentElement.setAttribute('data-theme', 'violet')` 和 `'goldenhour'`
检查：面板背景变为半透明，渐变从缝隙透出，文本颜色随主题变化

- [ ] **Step 5: Commit**

```bash
git add src/styles.css
git commit -m "refactor: styles.css 硬编码颜色替换为 CSS 变量引用"
```

---

### Task 3: 重构 settingsPanel.js + 新增主题切换 UI

**Files:**
- Modify: `src/dialogs/settingsPanel.js`（58 处硬编码颜色 + 新增"外观"分区）

**Interfaces:**
- Consumes: Task 1 的 `getCurrentTheme()` / `applyTheme()` from `src/theme.js`
- Produces: 账号设置面板中的"外观"分区 UI

- [ ] **Step 1: 在 settingsPanel.js 顶部导入 theme 模块**

在 `src/dialogs/settingsPanel.js` 第 1-8 行的 import 块末尾追加：

```javascript
import { getCurrentTheme, applyTheme } from "../theme.js";
```

- [ ] **Step 2: 替换 settingsPanel.js 中所有硬编码颜色为 var() 引用**

按颜色映射表替换以下硬编码值（搜索文件中的内联 `style="..."` 中的颜色）：

- `#0a0a0a` → `var(--panel)`（约 10 处：input 背景、div 只读背景）
- `#161616` → `var(--capsule)`（约 8 处：button 背景）
- `#222` → `var(--border-strong)`（约 15 处：border、button border）
- `#1a1a1a` → `var(--border)`（约 3 处：div border）
- `#e5e5e5` → `var(--text)`（约 10 处：color）
- `#888` → `var(--text-mute)`（约 8 处：color）
- `#555` → `var(--text-weak)`（约 4 处：label color）

**注意**：`colorHex()` 函数返回的动态值（如 `style="background:${bg}"`）不替换。

- [ ] **Step 3: 在 renderAccountSettings 函数中新增"外观"分区**

在 `src/dialogs/settingsPanel.js` 的 `renderAccountSettings` 函数中，找到模板字符串中 `<button id="acc-logout"` 那一行，在其**前方**插入"外观"分区：

```javascript
  const currentTheme = getCurrentTheme();
  // ... 在 body.innerHTML 模板中，acc-logout 按钮前插入：
  `
  <div class="rd-appearance">
    <div class="rd-appearance-title">外观</div>
    <div class="theme-options">
      <div class="theme-opt ${currentTheme === 'nowint' ? 'active' : ''}" data-theme="nowint">
        <div class="theme-swatch theme-swatch-nowint"></div>
        Nowint
      </div>
      <div class="theme-opt ${currentTheme === 'violet' ? 'active' : ''}" data-theme="violet">
        <div class="theme-swatch theme-swatch-violet"></div>
        Violet
      </div>
      <div class="theme-opt ${currentTheme === 'goldenhour' ? 'active' : ''}" data-theme="goldenhour">
        <div class="theme-swatch theme-swatch-goldenhour"></div>
        GoldenHour
      </div>
    </div>
  </div>
  `
```

- [ ] **Step 4: 绑定主题切换事件**

在 `renderAccountSettings` 函数末尾（其他 onclick 绑定之后）追加：

```javascript
  document.querySelectorAll(".theme-opt").forEach((opt) => {
    opt.onclick = () => {
      const theme = opt.dataset.theme;
      applyTheme(theme);
      document.querySelectorAll(".theme-opt").forEach((o) => o.classList.remove("active"));
      opt.classList.add("active");
    };
  });
```

- [ ] **Step 5: 在 styles.css 末尾追加"外观"分区 CSS**

```css
/* 主题切换 UI */
.rd-appearance { margin: 8px 0; padding: 0 16px; }
.rd-appearance-title {
  font-size: 9px; font-weight: 600; letter-spacing: 0.5px;
  text-transform: uppercase; color: var(--text-weak); margin-bottom: 8px;
}
.theme-options { display: flex; gap: 6px; }
.theme-opt {
  flex: 1; border: 1px solid var(--border-strong); border-radius: 4px;
  padding: 6px 4px; text-align: center; cursor: pointer;
  background: var(--bg); color: var(--text-mute); font-size: 9px;
  transition: border-color 150ms, background 150ms;
}
.theme-opt:hover { border-color: var(--text-mute); }
.theme-opt.active {
  border-color: var(--text); background: var(--active);
  color: var(--text); font-weight: 600;
}
.theme-swatch {
  width: 100%; height: 24px; border-radius: 3px; margin-bottom: 4px;
  position: relative; overflow: hidden;
}
.theme-swatch-nowint { background: linear-gradient(135deg, #0d0d0d, #1f1f1f, #e5e5e5); }
.theme-swatch-violet { background: linear-gradient(135deg, #583aeb, #ff914d); position: relative; }
.theme-swatch-violet::after {
  content: ""; position: absolute; inset: 0; background: rgba(0,0,0,0.5);
}
.theme-swatch-goldenhour { background: linear-gradient(135deg, #FF8A3D, #FFE08A, #FFF1D6); position: relative; }
.theme-swatch-goldenhour::after {
  content: ""; position: absolute; inset: 0; background: rgba(255,255,255,0.5);
}
```

- [ ] **Step 6: 验证构建**

Run: `npm run build`
Expected: 构建成功

- [ ] **Step 7: 验证主题切换功能**

Run: `npm run tauri dev`
1. 进入 Home 模式（点击 · 图标）→ 右侧设置面板 → 账号设置
2. 看到"外观"分区，三个色板横向排列
3. 点击 Violet → 界面立即切换为紫罗兰主题
4. 点击 GoldenHour → 界面立即切换为粉黄主题
5. 点击 Nowint → 恢复黑白
6. 刷新页面 → 主题保持（localStorage 持久化）

- [ ] **Step 8: Commit**

```bash
git add src/dialogs/settingsPanel.js src/styles.css
git commit -m "feat: 账号设置新增主题切换 UI + settingsPanel 颜色变量化"
```

---

### Task 4: 重构剩余 JS 文件硬编码颜色

**Files:**
- Modify: `src/dialogs/homePlus.js`（24 处）
- Modify: `src/dialogs/memberDetail.js`（11 处）
- Modify: `src/dialogs/contactRequest.js`（7 处）
- Modify: `src/dialogs/homeView.js`（6 处）
- Modify: `src/shell/rightDrawer.js`（6 处）
- Modify: `src/chat/message.js`（5 处）
- Modify: `src/dialogs/qrShow.js`（2 处，但 `#fff` QR 背景不替换）
- Modify: `src/dialogs/search.js`（1 处）
- Modify: `src/dialogs/wsWizard.js`（1 处）
- Modify: `src/shell/appRail.js`（2 处）

**Interfaces:**
- Consumes: Task 1 的 CSS 变量定义

- [ ] **Step 1: 替换 homePlus.js 中所有硬编码颜色**

搜索文件中所有 `style="..."` 内联样式中的颜色，按颜色映射表替换：
- `#0a0a0a` → `var(--panel)`
- `#161616` → `var(--capsule)`
- `#222` → `var(--border-strong)`
- `#1a1a1a` → `var(--border)`
- `#e5e5e5` → `var(--text)`
- `#888` → `var(--text-mute)`
- `#555` → `var(--text-weak)`

- [ ] **Step 2: 替换 memberDetail.js 中所有硬编码颜色**

同上映射表。

- [ ] **Step 3: 替换 contactRequest.js 中所有硬编码颜色**

同上映射表。

- [ ] **Step 4: 替换 homeView.js 中所有硬编码颜色**

同上映射表。

- [ ] **Step 5: 替换 rightDrawer.js 中所有硬编码颜色**

同上映射表。

- [ ] **Step 6: 替换 message.js 中所有硬编码颜色**

同上映射表。**注意**：`colorHex()` 返回的动态头像背景色不替换。

- [ ] **Step 7: 替换 qrShow.js 中硬编码颜色**

仅替换 `#0a0a0a` → `var(--panel)` 等面板色。**`#fff`（QR 码 canvas 背景）不替换**——QR 码需要纯白背景才能扫描。

- [ ] **Step 8: 替换 search.js 中硬编码颜色**

同上映射表。

- [ ] **Step 9: 替换 wsWizard.js 中硬编码颜色**

同上映射表。

- [ ] **Step 10: 替换 appRail.js 中硬编码颜色**

同上映射表。**注意**：`colorHex()` 返回的动态头像背景色不替换。

- [ ] **Step 11: 验证构建**

Run: `npm run build`
Expected: 构建成功

- [ ] **Step 12: 验证三个主题下所有界面正常**

Run: `npm run tauri dev`
逐一切换三个主题，检查：
- Home 列表（homeView.js 渲染）
- 频道树（channelTree.js 渲染）
- 聊天主区（chatView.js + message.js 渲染）
- 右侧抽屉（rightDrawer.js 渲染）
- 各对话框（homePlus/memberDetail/contactRequest/qrShow/search/wsWizard）
- 上下文菜单、toast

- [ ] **Step 13: Commit**

```bash
git add src/dialogs/homePlus.js src/dialogs/memberDetail.js src/dialogs/contactRequest.js src/dialogs/homeView.js src/shell/rightDrawer.js src/chat/message.js src/dialogs/qrShow.js src/dialogs/search.js src/dialogs/wsWizard.js src/shell/appRail.js
git commit -m "refactor: 剩余 JS 文件硬编码颜色替换为 CSS 变量引用"
```

---

### Task 5: 构建验证 + 视觉回归测试

**Files:**
- 无文件修改（仅验证）

- [ ] **Step 1: 完整构建验证**

Run: `npm run build`
Expected: 构建成功，无警告（vite 的动态+静态导入警告是已知的，可忽略）

- [ ] **Step 2: Nowint 主题视觉回归**

Run: `npm run tauri dev`
不切换主题（默认 Nowint），逐一检查：
- [ ] 登录页：与重构前完全一致
- [ ] Home 列表：头像、名称、时间、未读徽标颜色一致
- [ ] 频道树：分类标题、频道项、激活态、未读徽标一致
- [ ] 聊天主区：消息文本、代码块、reactions、引用块、角色标签一致
- [ ] 右侧抽屉：成员列表、置顶消息、设置面板一致
- [ ] 对话框：创建频道、联系人请求、二维码、搜索一致
- [ ] 上下文菜单、toast 一致

- [ ] **Step 3: Violet 主题视觉验证**

在账号设置中切换到 Violet，检查：
- [ ] body 出现 `#583aeb → #ff914d` 渐变
- [ ] 85% 黑遮罩覆盖全屏
- [ ] 面板 10% 白半透明，渐变从面板缝隙透出
- [ ] 文本为紫偏色（`#e8e5f0` 等），可读
- [ ] 边框极细半透明
- [ ] 所有界面元素可读，无低对比度区域

- [ ] **Step 4: GoldenHour 主题视觉验证**

切换到 GoldenHour，检查：
- [ ] body 出现粉黄渐变
- [ ] 70% 白遮罩覆盖全屏
- [ ] 面板 50% 浅灰半透明
- [ ] 文本为暖棕偏色（`#3a3028` 等），可读
- [ ] 边框极细半透明
- [ ] 所有界面元素可读，无低对比度区域

- [ ] **Step 5: 持久化验证**

- [ ] 切换到 Violet → 刷新页面 → 主题保持 Violet
- [ ] 切换到 GoldenHour → 刷新页面 → 主题保持 GoldenHour
- [ ] 切换到 Nowint → 刷新页面 → 主题保持 Nowint
- [ ] 重启应用 → 主题保持

- [ ] **Step 6: 功能无回归验证**

在 Violet 主题下执行核心功能：
- [ ] 发送消息（文本、附件）
- [ ] 切换频道
- [ ] 创建 workspace / 频道
- [ ] 消息 reactions（↑/+/★/!）
- [ ] 消息 pin / reply / delete
- [ ] 搜索（Cmd+K）
- [ ] 二维码显示

- [ ] **Step 7: 最终 Commit（如有修复）**

如果验证中发现问题并修复：
```bash
git add -A
git commit -m "fix: 主题系统视觉回归修复"
```

如果无问题，此步骤跳过。

---

## Self-Review 结果

**1. Spec 覆盖检查**：
- ✅ 三个主题变量定义 → Task 1 Step 5
- ✅ DOM 结构与遮罩层 → Task 1 Step 3 + Step 5
- ✅ 硬编码颜色重构（212 处）→ Task 2（styles.css ~100 处）+ Task 3（settingsPanel.js 58 处）+ Task 4（剩余 65 处）
- ✅ 主题切换 UI → Task 3 Step 3-5
- ✅ 持久化 → Task 1 Step 1（theme.js）+ Task 5 Step 5（验证）
- ✅ 边界情况（登录页、hljs、QR 白背景、动态头像色）→ 颜色映射表注明"特殊不替换"
- ✅ 测试验收 → Task 5

**2. 占位符扫描**：无 TBD/TODO，所有步骤都有具体代码或操作。

**3. 类型一致性**：`getCurrentTheme()` / `applyTheme(theme)` / `initTheme()` 在 Task 1 定义，Task 3 导入使用，签名一致。CSS 变量名在 Task 1 定义，Task 2-4 引用，名称一致。

**4. 额外发现**：
- styles.css 中部分颜色已使用 `var(--xxx)`（如第 130 行 `.chat-header`），这些不需要替换。
- `#0d0d0d` 在 `:root` 的 `--bg` 定义中是变量定义本身，不替换。
- QR 码的 `#fff` 背景是功能需求，明确标注不替换。
- `colorHex()` 返回的动态值不替换，已在颜色映射表注明。
