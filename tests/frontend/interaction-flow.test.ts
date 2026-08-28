import { describe, expect, it } from "vitest";
import { flowKindIconName, flowLane, flowNode, mergeFlowEvents } from "../../src/web/components/InteractionFlow.js";
import type { TraceEvent } from "../../src/web/types.js";

describe("interaction flow", () => {
  it("extracts the user request and MCP tool arguments", () => {
    expect(flowNode(event("userMessage", { content: [{ type: "text", text: "Build the feature" }] })))
      .toMatchObject({ kind: "user", label: "User", title: "Request", detail: "Build the feature" });

    expect(flowNode(event("mcpToolCall", { server: "browser", tool: "click", arguments: { target: "row" } })))
      .toMatchObject({ kind: "mcp", label: "MCP", title: "browser · click", participantName: "browser" });

    expect(flowNode(event("mcpToolCall", {
      server: "node_repl",
      tool: "js",
      arguments: { title: "Inspect the page", code: "await tab.playwright.domSnapshot()" },
    }))).toMatchObject({ kind: "mcp", title: "Browser · Inspect the page", participantName: "node_repl" });

    expect(flowNode(event("skillCall", { name: "frontend-testing-debugging", path: "/skills/frontend-testing-debugging/SKILL.md" })))
      .toMatchObject({ kind: "skill", label: "Skill", title: "Skill · frontend-testing-debugging" });
  });

  it("summarizes path-keyed file changes from the current App Server shape", () => {
    expect(flowNode(event("FileChange", {
      changes: {
        "/workspace/src/App.tsx": { type: "update", unified_diff: "+new" },
      },
    }))).toMatchObject({
      kind: "file",
      title: "File change",
      detail: "update · /workspace/src/App.tsx",
    });
  });

  it("shows subagent lifecycle and collaboration events", () => {
    expect(flowNode(event("subAgentActivity", {
      kind: "started",
      agent_path: "/root/frontend_impl",
      agent_thread_id: "thread-2",
    }))).toEqual({
      kind: "subagent",
      label: "Start",
      title: "Started · frontend_impl",
      detail: "/root/frontend_impl",
      meta: "thread-2",
      sequenceDirection: "call",
    });

    expect(flowNode(event("collabAgentToolCall", {
      tool: "send_input",
      prompt: "Verify the UI",
      receiver_agents: [{ agent_nickname: "frontend_impl" }],
    }))).toMatchObject({
      kind: "subagent",
      label: "Message",
      title: "Message · frontend_impl",
      detail: "Verify the UI",
      showStatus: true,
      sequenceDirection: "call",
    });

    expect(flowNode(event("subAgentActivity", {
      kind: "completed",
      agentPath: "/root/frontend_impl",
      agentThreadId: "thread-2",
    }))).toMatchObject({
      label: "Result",
      title: "Result · frontend_impl",
      sequenceDirection: "return",
    });

    expect(flowNode(event("collabAgentToolCall", { tool: "wait" }))).toMatchObject({
      label: "Join",
      title: "Join subagents",
      sequenceDirection: "call",
    });
  });

  it("merges realtime lifecycle notifications for the same item", () => {
    const started = event("commandExecution", { command: "npm test" });
    started.method = "item/started";
    started.status = "running";
    const completed = { ...event("commandExecution", { command: "npm test", exitCode: 0 }), seq: 2, status: "completed" };

    expect(mergeFlowEvents([started, completed])).toHaveLength(1);
    expect(mergeFlowEvents([started, completed])[0]).toMatchObject({
      seq: 1,
      startedSeq: 1,
      completedSeq: 2,
      status: "completed",
    });
  });

  it("labels shell argv commands with their actual command", () => {
    expect(flowNode(event("commandExecution", {
      command: ["/bin/zsh", "-lc", "sed -n '1,20p' README.md"],
      cwd: "file:///Users/bytedance/workspace/thread-scope",
      exitCode: 0,
    }))).toMatchObject({
      kind: "tool",
      title: "Shell · sed -n '1,20p' README.md",
      detail: "sed -n '1,20p' README.md",
      meta: "/Users/bytedance/workspace/thread-scope · exit 0",
    });
  });

  it("moves inferred SKILL.md loads into the Skills lane", () => {
    const node = flowNode(event("commandExecution", {
      command: ["/bin/zsh", "-lc", "sed -n '1,260p' /plugins/build-web-apps/skills/react-best-practices/SKILL.md"],
      parsed_cmd: [
        { type: "read", path: "/plugins/build-web-apps/skills/react-best-practices/SKILL.md" },
        { type: "read", path: "/plugins/browser/skills/control-in-app-browser/SKILL.md" },
      ],
    }));

    expect(node).toMatchObject({
      kind: "skill",
      label: "Skill",
      title: "Skill load · react-best-practices +1 (inferred)",
    });
    expect(flowLane(node.kind)).toBe("skill");
  });

  it("places interaction types in stable sequence graph lanes", () => {
    expect(flowLane("user")).toBe("user");
    expect(flowLane("agent")).toBe("agent");
    expect(flowLane("reasoning")).toBe("agent");
    expect(flowLane("skill")).toBe("skill");
    expect(flowLane("mcp")).toBe("mcp");
    expect(flowLane("tool")).toBe("tool");
    expect(flowLane("file")).toBe("tool");
    expect(flowLane("subagent")).toBe("subagent");
  });

  it("uses the same role icons across replay, flow, and sequence views", () => {
    expect(flowKindIconName("user")).toBe("user");
    expect(flowKindIconName("agent")).toBe("agent");
    expect(flowKindIconName("tool")).toBe("terminal");
    expect(flowKindIconName("mcp")).toBe("network");
    expect(flowKindIconName("subagent")).toBe("subagent");
    expect(flowKindIconName("file")).toBe("code");
    expect(flowKindIconName("web")).toBe("search");
  });
});

function event(type: string, raw: unknown): TraceEvent {
  return {
    seq: 1,
    at: "2026-08-25T08:00:00.000Z",
    method: "item/completed",
    type,
    status: "completed",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-1",
    summary: "item completed",
    raw,
  };
}
