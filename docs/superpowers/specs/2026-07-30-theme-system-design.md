# Discord 风格主题系统 设计文档

> **Sprint 定位**: 在现有 Nowint 黑白主题基础上，新增 VioletEverGarden（紫罗兰）和 GoldenHour（粉黄）两个 Discord 风格渐变主题，通过 CSS 变量 + `data-theme` 属性实现零侵入切换。
>
> **前置决策**(brainstorming 5 轮问答 + visual companion mockup 确认):
> - 实现方式: 将 212 处内联硬编码颜色重构为 CSS 变量引用（Nowint 下渲染结果完全相同），通过 `[data-theme="xxx"]` 选择器覆盖变量
> - DOM 结构: body 渐变背景 + 独立 `.theme-mask` 遮罩层（position:fixed），#app 在其上方
> - 主题切换入口: 账号设置面板新增"外观"分区，三个色板横向排列，点击即应用
> - 文本颜色: 每主题独立定义，Violet 偏紫（非纯白），GoldenHour 偏暖棕（非纯黑）
> - 面板边框: Violet 和 GoldenHour 都用极细半透明边框
> - 作用范围: 仅主 shell，登录页保持 Nowint
> - Violet 渐变: `#583aeb → #ff914d` + 85% 黑遮罩 + 10% 白面板
> - GoldenHour 渐变: `#FF8A3D → #FFB86B → #FFE08A → #FFF1D6` + 70% 白遮罩 + 50% 浅灰面板

## 1. 目标与范围

### 1.1 目标
1. **三个主题**: Nowint（默认黑白，不修改）、VioletEverGarden（紫罗兰渐变）、GoldenHour（粉黄渐变）
2. **零侵入默认主题**: Nowint 的 `:root` 变量定义完全不变，视觉效果零变化
3. **硬编码颜色重构**: 将 12 个 JS 文件中 212 处内联硬编码颜色重构为 CSS 变量引用
4. **主题切换 UI**: 账号设置面板新增"外观"分区，色板预览 + 点击即应用
5. **持久化**: 主题选择写入 localStorage，启动时自动恢复
6. **DOM 遮罩层**: body 渐变背景 + 独立 `.theme-mask` 遮罩层，面板半透明透出渐变

### 1.2 不做（留后续 sprint）
- 自定义主题色（用户自选渐变颜色）
- 主题导入/导出
- 主题市场/分享
- 登录页主题（登录页保持 Nowint）
- 动态主题（随时间自动切换）
- 主题切换动画过渡（直接切换，无 transition）

## 2. 主题变量定义

### 2.1 Nowint（默认，完全不修改）

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
  --font: -apple-system, 'SF Pro Display', 'Inter', sans-serif;
  --font-mono: 'SF Mono', Menlo, monospace;
  /* 主题相关变量 - Nowint 下为空值，不产生任何视觉效果 */
  --theme-gradient: none;
  --theme-mask: none;
}
```

### 2.2 VioletEverGarden（紫罗兰）

```css
[data-theme="violet"] {
  --bg: rgba(255,255,255,0.10);            /* 10% 白面板 */
  --panel: rgba(255,255,255,0.10);
  --border: rgba(255,255,255,0.06);        /* 极细半透明边框 */
  --border-strong: rgba(255,255,255,0.10);
  --active: rgba(255,255,255,0.20);
  --capsule: rgba(255,255,255,0.08);
  --text: #e8e5f0;                          /* 亮色 + 极淡紫罗兰偏色 */
  --text-body: #d8d5e4;
  --text-mute: #9890aa;
  --text-weak: #665a7a;
  --text-faint: #443a5a;
  --theme-gradient: linear-gradient(135deg, #583aeb 0%, #ff914d 100%);
  --theme-mask: rgba(0,0,0,0.85);           /* 85% 黑遮罩 */
}
```

### 2.3 GoldenHour（粉黄）

```css
[data-theme="goldenhour"] {
  --bg: rgba(245,240,235,0.5);             /* 50% 浅灰面板 */
  --panel: rgba(245,240,235,0.5);
  --border: rgba(60,40,20,0.06);           /* 极细半透明边框 */
  --border-strong: rgba(60,40,20,0.10);
  --active: rgba(60,40,20,0.08);
  --capsule: rgba(255,250,245,0.6);
  --text: #3a3028;                          /* 暗色 + 极淡暖棕偏色 */
  --text-body: #4a4038;
  --text-mute: #7a7068;
  --text-weak: #aaa090;
  --text-faint: #c0b8a8;
  --theme-gradient: linear-gradient(135deg, #FF8A3D 0%, #FFB86B 35%, #FFE08A 70%, #FFF1D6 100%);
  --theme-mask: rgba(255,255,255,0.7);     /* 70% 白遮罩 */
}
```

## 3. DOM 结构与遮罩层

### 3.1 DOM 层次

```
<body>  ← background: var(--theme-gradient)
  ├── <div class="theme-mask"></div>  ← position:fixed; inset:0; background: var(--theme-mask); z-index:0
  └── <div id="app">  ← position:relative; z-index:1
        └── <div class="shell">  ← 四栏布局
              ├── .app-rail      ← background: var(--panel) 半透明
              ├── .channel-tree   ← background: var(--panel) 半透明
              ├── .chat-main      ← background: var(--panel) 半透明
              └── .right-drawer   ← background: var(--panel) 半透明
```

### 3.2 遮罩层 CSS

```css
/* 遮罩层 - 仅非 Nowint 主题显示 */
.theme-mask {
  position: fixed;
  inset: 0;
  background: var(--theme-mask);
  z-index: 0;
  pointer-events: none;
  /* 默认（无 data-theme 属性时，即 Nowint）--theme-mask 为 none，
     background 计算为 none，遮罩层不可见。无需额外 display:none。 */
}

/* body 背景：有渐变用渐变，无渐变回退到 --bg 纯色 */
body {
  background: var(--theme-gradient, var(--bg));
}

#app {
  position: relative;
  z-index: 1;
}
```

**说明**：Nowint 主题下 `--theme-gradient: none` 和 `--theme-mask: none`，因此 `body` 背景回退到 `var(--bg)`（`#0d0d0d`），遮罩层 `background: none` 不可见。无需 `display:none` 或额外选择器。

### 3.3 index.html 改动

在 `<body>` 内、`#app` 前插入遮罩层节点：

```html
<body>
  <div class="theme-mask"></div>
  <div id="app">...</div>
  <script type="module" src="/main.js"></script>
</body>
```

## 4. 硬编码颜色重构

### 4.1 重构策略

将 12 个 JS 文件中 212 处内联 `style="background:#0a0a0a"` 等硬编码颜色替换为 CSS 变量引用：

| 硬编码值 | 替换为 | 出现次数（约） |
|---------|--------|--------------|
| `#0d0d0d` | `var(--bg)` | 8 |
| `#0a0a0a` | `var(--panel)` | 30 |
| `#1a1a1a` | `var(--border)` | 25 |
| `#222` | `var(--border-strong)` | 35 |
| `#1f1f1f` | `var(--active)` | 12 |
| `#161616` | `var(--capsule)` | 20 |
| `#e5e5e5` | `var(--text)` | 40 |
| `#888` | `var(--text-mute)` | 18 |
| `#555` | `var(--text-weak)` | 24 |

### 4.2 涉及文件

- `src/styles.css`（89 处，已在 CSS 变量中，部分硬编码需替换）
- `src/dialogs/settingsPanel.js`（58 处）
- `src/dialogs/homePlus.js`（24 处）
- `src/dialogs/memberDetail.js`（11 处）
- `src/dialogs/homeView.js`（6 处）
- `src/dialogs/contactRequest.js`（7 处）
- `src/dialogs/qrShow.js`（2 处）
- `src/dialogs/search.js`（1 处）
- `src/dialogs/wsWizard.js`（1 处）
- `src/shell/appRail.js`（2 处）
- `src/shell/rightDrawer.js`（6 处）
- `src/chat/message.js`（5 处）

### 4.3 重构原则

- **Nowint 渲染结果零变化**: `var(--bg)` 在 Nowint 下解析为 `#0d0d0d`，与原硬编码完全相同
- **不修改逻辑代码**: 仅替换内联 style 中的颜色值，不改变任何功能逻辑
- **保留非颜色内联样式**: `padding`/`font-size`/`border-radius` 等非颜色样式保持不变
- **特殊颜色单独处理**: 头像背景色（`colorHex()` 返回值）保持动态计算，不替换为变量

## 5. 主题切换 UI

### 5.1 settingsPanel.js 改动

在 `renderAccountSettings` 函数中，"账号"分区下方、"登出"按钮上方插入"外观"分区：

```javascript
// 在 renderAccountSettings 的 body.innerHTML 模板中插入：
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

### 5.2 色板预览 CSS

```css
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
.theme-opt.active {
  border-color: var(--text); background: var(--active);
  color: var(--text); font-weight: 600;
}
.theme-swatch {
  width: 100%; height: 24px; border-radius: 3px; margin-bottom: 4px;
  position: relative; overflow: hidden;
}
.theme-swatch-nowint { background: linear-gradient(135deg, #0d0d0d, #1f1f1f, #e5e5e5); }
.theme-swatch-violet {
  background: linear-gradient(135deg, #583aeb, #ff914d);
}
.theme-swatch-violet::after {
  content: ""; position: absolute; inset: 0;
  background: rgba(0,0,0,0.5);
}
.theme-swatch-goldenhour {
  background: linear-gradient(135deg, #FF8A3D, #FFE08A, #FFF1D6);
}
.theme-swatch-goldenhour::after {
  content: ""; position: absolute; inset: 0;
  background: rgba(255,255,255,0.5);
}
```

### 5.3 交互逻辑

```javascript
document.querySelectorAll(".theme-opt").forEach((opt) => {
  opt.onclick = () => {
    const theme = opt.dataset.theme;
    applyTheme(theme);
    // 更新选中状态
    document.querySelectorAll(".theme-opt").forEach((o) => o.classList.remove("active"));
    opt.classList.add("active");
  };
});
```

## 6. 主题应用与持久化

### 6.1 theme.js 新模块

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

### 6.2 main.js 改动

```javascript
import { initTheme } from "./theme.js";

async function boot() {
  initTheme();  // 在渲染前应用主题，避免 FOUC
  const configured = await call("is_configured");
  // ... 原有逻辑
}
```

### 6.3 settingsPanel.js 集成

```javascript
import { getCurrentTheme, applyTheme } from "../theme.js";

// 在 renderAccountSettings 中：
const currentTheme = getCurrentTheme();
// ... 渲染主题选项
// 绑定点击事件（见 5.3）
```

## 7. 边界情况处理

### 7.1 登录页

- 登录页不应用主题，保持 Nowint 黑白风格
- `initTheme()` 仍在 boot 时调用（登录页和主 shell 共用 main.js），但登录页的 CSS 仅使用 `:root` 变量，不依赖 `data-theme`
- 登录页的 `.login-form` 样式中如有硬编码颜色，需替换为 `var(--xxx)`（Nowint 下零变化）

### 7.2 动态创建的 DOM

- 所有动态创建的 DOM 元素（消息、对话框、菜单等）只要使用 `var(--xxx)` 引用颜色，就会自动响应主题切换
- 已有的 `colorHex()` 函数返回的头像背景色保持不变（这是用户自定义色，不应随主题变）

### 7.3 主题切换时的重渲染

- 主题切换通过 CSS 变量实现，浏览器自动重绘，无需 JS 手动重渲染
- 但 `settingsPanel.js` 中的内联 `style="background:${bg}"`（头像字母背景色）是动态值，主题切换时不会自动更新——这是预期行为（头像色由 Contact::get_color() 决定，与主题无关）

### 7.4 hljs 代码高亮

- 消息中的代码块使用 hljs 高亮，其颜色是 hljs 库内联的，不响应 CSS 变量
- Nowint 下 hljs 使用暗色主题，Violet 下也可用（80% 黑遮罩下暗色高亮可读）
- GoldenHour 下暗色 hljs 在亮背景上可能对比度不足，但属于可接受范围（代码块有 `var(--panel)` 背景区隔）

## 8. 测试验收

### 8.1 视觉验收

- [ ] Nowint 主题：所有界面与重构前像素级一致（212 处颜色替换零变化）
- [ ] Violet 主题：渐变背景 + 85% 黑遮罩，面板 10% 白半透明，文本紫偏色可读
- [ ] GoldenHour 主题：渐变背景 + 70% 白遮罩，面板 50% 浅灰，文本暖棕偏色可读
- [ ] 主题切换：点击色板立即生效，无闪烁、无重载
- [ ] 持久化：刷新页面后主题保持

### 8.2 功能验收

- [ ] 四栏布局在三个主题下都正常显示
- [ ] 消息列表（含代码块、reactions、引用、@mention）在三个主题下可读
- [ ] 对话框（创建频道、联系人请求、二维码等）在三个主题下可读
- [ ] 上下文菜单、toast、搜索覆盖层在三个主题下可读
- [ ] 头像图片和字母头像在三个主题下都正常显示

### 8.3 无回归

- [ ] `npm run build` 通过
- [ ] 所有原有功能不受影响（消息收发、频道切换、设置保存等）
