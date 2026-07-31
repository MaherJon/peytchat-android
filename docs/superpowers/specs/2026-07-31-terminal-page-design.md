# 内嵌终端页设计

日期:2026-07-31
状态:已批准

## 目标

在应用内新增"终端"页面:内嵌一个真实终端(PTY),可执行系统命令。作为产品功能,默认白名单模式,专家模式放开全部命令。

## 架构

- 后端:新增 `src-tauri/src/terminal.rs`,基于 `portable-pty` 管理 PTY 会话;命令注册到 `lib.rs`;会话存在 `AppState`
- 前端:新增 `src/pages/terminalPage.ts`,用 `xterm` + `@xterm/addon-fit` 渲染;导航入口在 rail + navPanel + `Page` 类型

## 后端接口

| 命令 | 参数 | 说明 |
|---|---|---|
| `open_terminal` | `workdir?` | 启动默认 shell(bash/zsh/cmd),返回 `session_id` |
| `write_terminal` | `session_id`, `input` | 写入输入到 PTY |
| `resize_terminal` | `session_id`, `cols`, `rows` | 同步窗口尺寸 |
| `close_terminal` | `session_id` | 结束会话 |

事件:`terminal-output`(`{ session_id, data }`)——PTY 输出增量推送到前端。

## 前端

- `terminalPage.ts`:创建 xterm 实例,绑定事件与命令;工具栏含快捷命令按钮、工作目录、专家模式开关
- 白名单:回车时校验命令首 token(ls/pwd/whoami/git status/git log/git branch/npm run dev 等),非白名单拒绝并提示;专家模式跳过校验
- 命令历史:↑/↓ 切换,localStorage 持久化
- 主题:从 CSS 变量读取颜色映射 xterm theme,主题切换时更新
- 关闭页面时结束会话,重新进入开新会话

## 明确不做

审计日志、多会话、远程终端、文件上传下载。
