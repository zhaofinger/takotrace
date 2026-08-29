<p align="center">
  <img src="./assets/takotrace-logo.png" alt="TakoTrace logo" width="128" />
</p>

<h1 align="center">TakoTrace</h1>

<p align="center">A local-first session inspector and execution tracer for AI coding agents.</p>

<p align="center"><a href="./README.zh-CN.md">中文</a></p>

TakoTrace turns Codex and Claude Code sessions into browsable timelines of messages, reasoning, tool calls, commands, file changes, MCP activity, skills, and subagents.

It reads local session history, streams precise events from runs managed by the current process, and keeps Codex and Claude sessions isolated in dedicated views.

## Highlights

- Browse sessions by provider and working directory.
- Inspect each run as a Trace, Sequence diagram, or Raw JSON.
- Follow commands, file changes, MCP calls, skills, and subagent relationships.
- View token usage, Markdown, attachments, images, and local source files.
- Recover readable Codex history from local rollout files when App Server decoding fails.

The UI uses the agent-oriented terms **Session**, **Run**, and **Step**. Raw APIs retain the original Codex field names.

## Quick start

Requires Node.js 22+ and at least one supported runtime:

- **Codex:** TakoTrace automatically compares the `codex` in `PATH` with macOS ChatGPT/Codex app bundles and uses the newest available version. Pass `--codex-path` to override the selection; if detection fails, TakoTrace keeps using `codex` from `PATH`.
- **Claude:** Claude Code must be discoverable, or passed with `--claude-path`.

```bash
npx takotrace
```

TakoTrace listens on `127.0.0.1:4317`, starts both providers by default, and opens the browser. If one provider is unavailable, the other can continue running.

```bash
# Start one provider only
npx takotrace --provider codex
npx takotrace --provider claude

# Override automatic Codex selection
npx takotrace --codex-path /path/to/codex

# Use a custom port without opening the browser
npx takotrace --port 4400 --no-open
```

Run `npx takotrace --help` for all options, including `--host`, `--port`, `--provider`, `--codex-path`, and `--claude-path`.

## Data and security

- TakoTrace binds to loopback by default and keeps runtime state in memory.
- It adds no remote session storage or telemetry. Managed runs still use the configured Codex or Claude provider.
- Codex rollout fallback and Claude history access are read-only.
- Managed sessions provide precise live events; externally started sessions are periodically synchronized and may be slightly delayed.
- Claude authentication is delegated to Claude Code / Agent SDK. TakoTrace does not implement login, handle credentials, or enable permission bypass.

> [!WARNING]
> The local API has no general authentication layer. Do not expose the service directly to a LAN or the public internet, including with `--host 0.0.0.0`.

## Development

```bash
npm install
npm run dev
```

```bash
npm test
npm run typecheck
npm run build
```
