# ThreadScope 技术设计

## 目标

ThreadScope 是一个通过 `npx thread-scope` 启动的本地服务，用网页实时展示 Codex 会话的 Thread、Turn、工具调用和执行状态。

## 架构

```text
Browser <-- HTTP + SSE --> ThreadScope --> stdio JSONL --> codex app-server
                                |
                                +-- read-only fallback --> rollout JSONL
```

- ThreadScope 使用 Node.js/TypeScript 启动并管理 `codex app-server` 子进程。
- 服务解析 App Server 的 JSON-RPC 消息，并转换为统一的 trace 事件。
- 浏览器通过 SSE 接收实时事件，通过 HTTP 获取历史数据和发送操作。
- 首版数据保存在内存中，暂不引入数据库。

## 数据模型

```text
Thread
└── Turn
    └── Item: message | tool | command | file_change | approval
```

每个事件至少包含时间、类型、状态、Thread ID、Turn ID、Item ID 和原始数据。

## 核心流程

1. CLI 启动本地 HTTP 服务和 App Server。
2. 完成 `initialize` / `initialized` 握手。
3. 分页调用 `thread/list` 加载历史元数据，并按需调用 `thread/read` 加载完整 Turn/Item 快照；反序列化兼容错误时，只读解析匹配的 rollout JSONL 恢复历史。
4. 创建或恢复 Thread，并持续读取通知。
5. 将历史快照及 `turn/started`、`item/started`、`item/completed`、`turn/completed` 等事件推送到网页。
6. 网页按 Thread 的 `cwd`（Codex 项目工作目录）分组；主时间线以 Turn 为单位，将用户消息、Agent 执行和最终回复聚合为一行。
7. `/api/state` 与 SSE 只传 compact item；选中 Turn 时，再通过详情接口加载受长度保护的 raw 数据。

## 首版边界

- 精确实时通知仅覆盖当前 ThreadScope 实例管理的会话；其他 Codex Desktop 会话通过周期轮询提供可能滞后的近实时快照。
- 默认只绑定 `127.0.0.1`，不开放远程访问。
- 不修改 Codex 私有会话文件；rollout JSONL 仅作为 `thread/read` 兼容失败时的 best-effort 只读回退，不作为主协议。
- 对未知事件保留原始数据并安全忽略，兼容协议扩展。
