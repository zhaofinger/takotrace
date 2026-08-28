<p align="center">
  <img src="./assets/threadscope-logo.png" alt="ThreadScope logo" width="144" />
</p>

<h1 align="center">ThreadScope</h1>

<p align="center">本地优先的 Codex 会话观察与执行追踪工具</p>

ThreadScope 启动并管理 `codex app-server`，将 Agent 的 Session、Run、Step，以及消息、推理、工具调用、命令、文件修改、MCP 与 Subagent 活动组织成可浏览、可追踪的网页界面。

产品界面采用 Agent 平台常见术语：Session 对应 Codex Thread，Run 对应 Codex Turn，Step 对应 Codex Item。底层 API 与 Raw JSON 保留 Codex 原始字段名。

它既能读取历史会话快照，也能精确展示当前 ThreadScope 实例所管理会话的实时事件。所有数据默认保留在本机内存中，不上传到第三方服务。

## 核心能力

- **Session 导航**：按工作目录聚合历史 Session，快速定位目标会话。
- **Run 时间线**：将用户输入、Agent 响应和执行 Step 聚合展示，并显示 Token 与上下文使用量。
- **多种执行视图**：提供 Trace、Sequence 与 Raw JSON，支持关键步骤和完整事件密度切换。
- **执行链追踪**：识别工具、命令、文件修改、MCP、Skill 和 Subagent 活动及其层级关系。
- **Subagent 详情**：仅在用户展开时按需读取子线程，避免污染主会话数据。
- **内容预览**：渲染 Markdown，并支持本地图片、附件、可视化结果和源文件跳转。
- **只读历史回退**：App Server 无法反序列化历史项时，可从本机 Codex rollout JSONL 恢复可用内容。

## 快速开始

需要 Node.js 22+，并确保 `codex` 命令可从当前 shell 的 `PATH` 访问。

```bash
node --version
codex --version
npx thread-scope
```

ThreadScope 默认监听 `127.0.0.1:4317` 并自动打开浏览器。

| 参数 | 说明 |
| --- | --- |
| `--host <host>` | 监听地址，默认 `127.0.0.1` |
| `--port <port>` | 监听端口，默认 `4317`；传 `0` 使用随机端口 |
| `--no-open` | 不自动打开浏览器 |
| `--help`、`-h` | 查看帮助 |

示例：

```bash
npx thread-scope --port 4400 --no-open
```

## 数据边界

```text
Browser UI <-- HTTP / SSE --> ThreadScope <-- stdio JSONL --> codex app-server
                                  |
                                  +-- read-only fallback --> ~/.codex/sessions
```

- App Server 是主数据源，ThreadScope 不拦截其他 Codex Desktop 或 CLI 进程的 stdio。
- 当前 ThreadScope 实例创建或恢复的会话可以获得精确实时通知。
- 外部 Codex 会话通过 `thread/list` 和 `thread/read` 定期同步，属于可能滞后的近实时快照。
- rollout JSONL 回退仅执行只读解析，不会修改 `~/.codex` 中的会话文件。
- 服务状态存于内存，进程退出后不会建立额外的持久化数据库。

## 本地开发

```bash
npm install
npm run dev
```

开发命令会同时启动自动重启的后端 `http://127.0.0.1:4317` 和支持热更新的 Vite 前端 `http://127.0.0.1:5173`。也可通过 `npm run dev:server` 或 `npm run dev:web` 单独启动。

生产方式启动：

```bash
npm run build
node dist/cli.js --no-open
```

质量检查：

```bash
npm test
npm run typecheck
npm run build
```

## HTTP API

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/healthz` | 服务健康检查 |
| `GET` | `/api/state` | 读取不含 Raw 数据的精简内存快照 |
| `GET` | `/api/events` | 订阅 SSE 实时事件 |
| `GET` | `/api/threads/:threadId/turns/:turnId` | 按需读取完整 Run（Codex Turn） |
| `GET` | `/api/subagents/:threadId` | 按需读取 Subagent Session 详情 |
| `GET` | `/api/visualization?path=...` | 读取本地可视化文件 |
| `GET` | `/api/source?ref=...` | 读取本地源文件 |
| `POST` | `/api/host.openPath` | 通过操作系统默认应用打开本地文件（仅限 loopback 同源请求） |
| `GET` | `/api/attachments/:threadId/:turnId/:itemId/:index` | 读取事件附件 |
| `POST` | `/api/threads` | 创建 Session（Codex Thread） |
| `POST` | `/api/threads/:id/resume` | 恢复 Session |
| `POST` | `/api/threads/:id/sync` | 同步指定历史 Session |
| `POST` | `/api/threads/:id/turns` | 启动 Run（Codex Turn），请求体至少包含 `text` |

## 项目文档

- [产品定义](./PRODUCT.md)
- [技术设计](./TECHNICAL_DESIGN.md)

ThreadScope 当前处于 `0.1.0` 阶段，接口与数据模型仍可能调整。
