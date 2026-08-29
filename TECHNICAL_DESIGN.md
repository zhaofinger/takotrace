# TakoTrace 技术设计

## 目标

TakoTrace 是一个通过 `npx takotrace` 启动的本地服务，用网页观察 Codex 与 Claude Agent 会话，并实时追踪 Run、工具调用和执行状态。

## 架构

```text
Browser <-- HTTP + SSE --> TakoTrace --> Codex adapter --> stdio JSONL --> codex app-server
                               |             +-- read-only fallback --> rollout JSONL
                               |
                               +--------> Claude adapter --> Agent SDK / ~/.claude sessions
```

- TakoTrace 使用 Node.js/TypeScript 启动 Provider；默认同时管理 `codex app-server` 子进程与 Claude Agent SDK。
- Provider 适配层解析 Codex JSON-RPC 与 Claude SDK/session 数据，并转换为统一的 trace 事件。
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

1. CLI 启动本地 HTTP 服务和所选 Provider；`--provider all` 默认同时启用 Codex 与 Claude。
2. Codex adapter 完成 `initialize` / `initialized` 握手，分页调用 `thread/list` 加载历史元数据，并按需调用 `thread/read` 加载完整 Turn/Item 快照；反序列化兼容错误时，只读解析匹配的 rollout JSONL 恢复历史。
3. Claude adapter 从 `~/.claude` 读取历史 session 与 transcript；受管 Run 通过 Agent SDK 的 `query()` 启动或恢复，并将 SDK 消息归一化为统一事件。
4. 两侧 Provider 持续同步历史快照和实时通知，由服务按 Provider ownership 隔离 Session、搜索、Run 与详情数据。
5. 网页按当前 Codex / Claude Tab 和工作目录分组展示 Session；主时间线以 Run 为单位，将用户消息、Agent 执行和最终回复聚合为一行。
6. `/api/state` 与 SSE 只传 compact item；选中 Run 时，再通过详情接口加载受长度保护的 raw 数据。

## 首版边界

- 精确实时通知仅覆盖当前 TakoTrace 实例管理的会话；外部 Codex 与 Claude 历史会话通过周期同步提供可能滞后的近实时快照。
- 默认只绑定 `127.0.0.1`，不开放远程访问。
- 不修改 Codex 私有会话文件；rollout JSONL 仅作为 `thread/read` 兼容失败时的 best-effort 只读回退，不作为主协议。
- 不提供 claude.ai 登录，也不读取、存储或回显 Provider 凭据。
- 对未知事件保留原始数据并安全忽略，兼容协议扩展。
