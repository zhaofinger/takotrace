import { describe, expect, it } from "vitest";
import { flowLane, flowNode, mergeFlowEvents } from "../../src/web/components/InteractionFlow.js";
import type { TraceEvent } from "../../src/web/types.js";

describe("interaction flow", () => {
  it("extracts the user request and MCP tool arguments", () => {
    expect(flowNode(event("userMessage", { content: [{ type: "text", text: "Build the feature" }] })))
      .toMatchObject({ kind: "user", label: "User", title: "Request", detail: "Build the feature" });

    expect(flowNode(event("mcpToolCall", { server: "browser", tool: "click", arguments: { target: "row" } })))
      .toMatchObject({ kind: "mcp", label: "MCP", title: "browser · click" });

    expect(flowNode(event("skillCall", { name: "frontend-testing-debugging", path: "/skills/frontend-testing-debugging/SKILL.md" })))
      .toMatchObject({ kind: "skill", label: "Skill", title: "frontend-testing-debugging" });
  });

  it("shows subagent lifecycle and collaboration events", () => {
    expect(flowNode(event("subAgentActivity", {
      kind: "started",
      agentPath: "/root/frontend_impl",
      agentThreadId: "thread-2",
    }))).toEqual({
      kind: "subagent",
      label: "Subagent",
      title: "Started · frontend_impl",
      detail: "/root/frontend_impl",
      meta: "thread-2",
    });

    expect(flowNode(event("collabAgentToolCall", { tool: "sendInput", prompt: "Verify the UI" })))
      .toMatchObject({ kind: "subagent", label: "Message", title: "Subagent · collaboration", detail: "Verify the UI", showStatus: true });
  });

  it("merges realtime lifecycle notifications for the same item", () => {
    const started = event("commandExecution", { command: "npm test" });
    started.method = "item/started";
    started.status = "running";
    const completed = { ...event("commandExecution", { command: "npm test", exitCode: 0 }), seq: 2, status: "completed" };

    expect(mergeFlowEvents([started, completed])).toHaveLength(1);
    expect(mergeFlowEvents([started, completed])[0]).toMatchObject({ seq: 1, status: "completed" });
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
