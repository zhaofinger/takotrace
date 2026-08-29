<p align="center">
  <img src="./assets/takotrace-logo.png" alt="TakoTrace logo" width="128" />
</p>

<h1 align="center">TakoTrace</h1>

<p align="center">本地优先的 Agent 会话观察与执行追踪工具。</p>

<p align="center"><a href="./README.md">English</a></p>

TakoTrace 将 Codex 与 Claude Code 会话整理为可浏览的执行时间线，集中展示消息、推理、工具调用、命令、文件修改、MCP、Skill 与 Subagent 活动。

它读取本地会话历史，精确展示当前进程所管理 Run 的实时事件，并在独立视图中隔离 Codex 与 Claude 会话。

## 核心能力

- 按 Provider 和工作目录浏览 Session。
- 使用 Trace、Sequence 或 Raw JSON 检查 Run。
- 追踪命令、文件修改、MCP、Skill 和 Subagent 关系。
- 查看 Token、Markdown、附件、图片与本地源文件。
- Codex App Server 解码失败时，从本地 rollout 文件只读恢复历史。

界面使用 **Session**、**Run**、**Step** 等 Agent 通用术语；Raw API 保留 Codex 原始字段名。

## 快速开始

需要 Node.js 22+，并至少准备一种运行环境：

- **Codex：** TakoTrace 会自动比较 `PATH` 与 macOS ChatGPT/Codex 应用内置的 `codex`，选择可用的最新版本。可用 `--codex-path` 显式覆盖；探测失败时继续使用 `PATH` 中的 `codex`。
- **Claude：** 系统可找到 Claude Code，或通过 `--claude-path` 指定路径。

```bash
npx takotrace
```

默认监听 `127.0.0.1:4317`、同时启动两个 Provider 并自动打开浏览器。单个 Provider 启动失败不会影响另一个继续运行。

```bash
# 仅启动一个 Provider
npx takotrace --provider codex
npx takotrace --provider claude

# 覆盖 Codex 自动选择结果
npx takotrace --codex-path /path/to/codex

# 自定义端口且不自动打开浏览器
npx takotrace --port 4400 --no-open
```

运行 `npx takotrace --help` 查看 `--host`、`--port`、`--provider`、`--codex-path`、`--claude-path` 等完整参数。

## 数据与安全

- 默认仅绑定 loopback，运行状态保存在内存中。
- 不增加远程会话存储或遥测；受管 Run 仍会访问所配置的 Codex 或 Claude 服务。
- Codex rollout 回退和 Claude 历史读取均为只读。
- 受管会话提供精确实时事件；外部会话通过周期同步获取，可能略有延迟。
- Claude 登录与认证交给 Claude Code / Agent SDK；TakoTrace 不处理凭据，也不会绕过权限检查。

> [!WARNING]
> 本地 API 没有通用认证层。不要将服务直接暴露到局域网或公网，包括使用 `--host 0.0.0.0`。

## 本地开发

```bash
npm install
npm run dev
```

```bash
npm test
npm run typecheck
npm run build
```
