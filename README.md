# ThreadScope

ThreadScope 是一个本地 Codex 会话观察器。它启动并管理 `codex app-server`，通过网页展示 Codex 历史会话快照，以及当前实例所管理会话的实时 Thread、Turn、消息、工具调用、命令、文件修改和原始协议数据。

Thread 列表按 Codex 会话的工作目录分组；时间线以 Turn 为单位，将一次用户输入、Agent 推理、工具调用和最终回复聚合为一行。完整 item 与 raw 数据只在选中 Turn 后按需加载。

网页 UI 遵循 [Vercel Web Interface Guidelines](https://vercel.com/design.md)，并直接使用其公开的 Vercel Brand Guidelines CSS 基础层；ThreadScope 自身的样式只使用该基础层提供的公开 `--vbg-*` 设计令牌。

## 使用

需要 Node.js 22+，并确保 `codex` 命令可从当前 shell 的 `PATH` 访问。

```bash
npx thread-scope
```

默认监听 `127.0.0.1:4317` 并打开浏览器：

```text
--host <host>  监听地址，默认 127.0.0.1
--port <port>  监听端口，默认 4317；传 0 可使用随机端口
--no-open      不自动打开浏览器
--help         查看帮助
```

## 本地开发

```bash
npm install
npm run dev
```

开发命令会同时启动支持自动重启的后端（`127.0.0.1:4317`）和支持热更新的 Vite 前端（`127.0.0.1:5173`）。浏览器请访问 `http://127.0.0.1:5173`。也可通过 `npm run dev:server` 或 `npm run dev:web` 单独启动一侧。

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

## HTTP 接口

- `GET /api/state`：读取不含 raw 数据的精简内存快照。
- `GET /api/threads/:threadId/turns/:turnId`：按需读取一个 Turn 的完整详情。
- `GET /api/events`：订阅 SSE 实时事件。
- `POST /api/threads`：创建 Thread，请求体透传 `thread/start` 参数。
- `POST /api/threads/:id/resume`：恢复 Thread。
- `POST /api/threads/:id/sync`：读取并刷新指定历史 Thread 的完整快照。
- `POST /api/threads/:id/turns`：启动 Turn，请求体至少包含 `text`。
- `GET /healthz`：服务健康检查。

数据仅保存在内存中。服务通过 App Server 的 `thread/list` 和 `thread/read` 接口加载历史：默认保留最近 100 个 Thread 的元数据、完整加载最近 5 个，并每 10 秒刷新；用户选中的 Thread 会按需完整加载。外部 Codex Desktop 会话属于可能滞后的近实时快照，只有当前 ThreadScope 实例管理的会话能获得精确实时通知。

App Server 是主数据源。当完整 `thread/read` 因版本不兼容或存储项反序列化失败时，服务会只读解析匹配的 `~/.codex/sessions` 或 `~/.codex/archived_sessions` rollout JSONL，按 `turn_id` 恢复历史，并在界面标记 `Rollout fallback`。该回退不会写入 Codex 文件，会跳过未知或损坏行；文件回退也不可用时才降级为仅显示线程元数据。
