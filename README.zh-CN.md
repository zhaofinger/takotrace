<p align="center">
  <img src="./assets/takotrace-logo.png" alt="TakoTrace Logo" width="160" />
</p>

<h1 align="center">TakoTrace</h1>

<p align="center">用时间线、时序图和原始事件查看 Codex 与 Claude Code 会话。</p>

<p align="center">
  <a href="https://github.com/zhaofinger/takotrace/stargazers"><img src="https://img.shields.io/github/stars/zhaofinger/takotrace?style=flat&logo=github" alt="GitHub Stars" /></a>
  <img src="https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white" alt="Node.js 22+" />
  <img src="https://img.shields.io/badge/Provider-Codex%20%2B%20Claude-2563eb" alt="支持 Codex 与 Claude" />
  <img src="https://img.shields.io/badge/存储-本地优先-0f766e" alt="本地优先" />
</p>

<p align="center"><a href="./README.md">English</a></p>

TakoTrace 把本地 AI 编程会话整理成可浏览的执行轨迹。用户请求、Agent 推理、命令、文件修改、MCP 调用、Skill 和 Subagent 都集中在一个界面，不必再翻 rollout 文件或终端日志。

## 快速开始

需要 Node.js 22+，并安装 Codex、Claude Code，或同时安装两者。

```bash
npx takotrace
```

TakoTrace 默认监听 `127.0.0.1:4317`，启动可用的 Provider 并打开浏览器。

```bash
# 只启动一个 Provider
npx takotrace --provider codex
npx takotrace --provider claude

# 指定 Codex 路径
npx takotrace --codex-path /path/to/codex

# 修改端口且不自动打开浏览器
npx takotrace --port 4400 --no-open
```

运行 `npx takotrace --help` 查看全部参数。

## 可以查看什么

- 按 Provider 和工作目录分组的 Session。
- 每个 Run 的 Trace、Sequence 和 Raw JSON。
- 命令、文件修改、MCP 调用、Skill 与 Subagent 关系。
- Token 用量、Markdown、附件、图片和本地源文件。
- Codex App Server 解码失败时，从本地 rollout 文件只读恢复历史。

界面使用 **Session**、**Run**、**Step**，Raw API 保留 Provider 的原始字段名。

## 数据与安全

TakoTrace 默认只绑定 loopback，运行状态保存在内存中，不增加遥测或远程会话存储。Codex rollout 回退与 Claude 历史访问均为只读，登录和认证仍由 Codex 或 Claude Code 负责。

> [!WARNING]
> 本地 API 没有通用认证层。不要将它直接暴露到局域网或公网，包括使用 `--host 0.0.0.0`。

## 文档

- [技术设计](./TECHNICAL_DESIGN.md)
- [产品原则](./PRODUCT.md)
- [本地开发](./DEVELOPMENT.md)

<p align="center">
  <a href="https://github.com/zhaofinger/takotrace"><img src="./assets/star-takotrace.gif" alt="如果 TakoTrace 对你有用，欢迎点亮 Star" width="600" /></a>
</p>
