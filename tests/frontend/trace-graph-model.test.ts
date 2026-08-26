import { describe, expect, it } from "vitest";
import { traceGraphModel } from "../../src/web/components/trace-graph-model.js";
import type { TraceEvent } from "../../src/web/types.js";

describe("trace graph model", () => {
  it("keeps the execution path concise without losing the full event count", () => {
    const items = [
      event(1, "userMessage", "user"),
      event(2, "reasoning", "reasoning"),
      event(3, "commandExecution", "command"),
      event(4, "mcpToolCall", "mcp"),
      event(5, "agentMessage", "answer"),
    ];

    const key = traceGraphModel(items, "key");
    expect(key.total).toBe(5);
    expect(key.nodes.map((node) => node.kind)).toEqual(["user", "tool", "mcp", "agent"]);
    expect(key.edges.map(({ source, target, relation }) => [source, target, relation])).toEqual([
      ["item-1", "item-5", "main"],
      ["item-5", "item-3", "child"],
      ["item-3", "item-4", "child"],
    ]);

    expect(traceGraphModel(items, "all").nodes).toHaveLength(5);
  });

  it("keeps user and agent on the main trace and nests execution under the active agent", () => {
    const model = traceGraphModel([
      event(1, "userMessage", "user"),
      event(2, "agentMessage", "update"),
      event(3, "skillCall", "skill"),
      event(4, "commandExecution", "command"),
      event(5, "mcpToolCall", "mcp"),
      event(6, "subagentActivity", "subagent"),
      event(7, "agentMessage", "answer"),
    ], "all");

    expect(model.nodes.map(({ id, tier, ownerId, label }) => ({ id, tier, ownerId, label }))).toEqual([
      { id: "item-1", tier: "main", ownerId: undefined, label: "User" },
      { id: "item-2", tier: "main", ownerId: undefined, label: "Agent" },
      { id: "item-3", tier: "execution", ownerId: "item-2", label: "Skill" },
      { id: "item-4", tier: "execution", ownerId: "item-2", label: "Tool" },
      { id: "item-5", tier: "execution", ownerId: "item-2", label: "Tool" },
      { id: "item-6", tier: "nested", ownerId: "item-2", label: "Subagent" },
      { id: "item-7", tier: "main", ownerId: undefined, label: "Agent" },
    ]);
    expect(model.edges.filter((edge) => edge.relation === "main").map(({ source, target }) => [source, target])).toEqual([
      ["item-1", "item-2"],
      ["item-2", "item-7"],
    ]);
    expect(model.edges.filter((edge) => edge.relation === "child").map(({ source, target }) => [source, target])).toEqual([
      ["item-2", "item-3"],
      ["item-3", "item-4"],
      ["item-4", "item-5"],
      ["item-5", "item-6"],
    ]);
  });

  it("collapses start and completion notifications into one graph node", () => {
    const started = event(1, "commandExecution", "started");
    started.itemId = "shared";
    started.method = "item/started";
    started.status = "running";
    const completed = event(2, "commandExecution", "completed");
    completed.itemId = "shared";

    const model = traceGraphModel([started, completed], "all");
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]).toMatchObject({ id: "item-shared", status: "completed" });
  });
});

function event(seq: number, type: string, summary: string): TraceEvent {
  return {
    seq,
    at: `2026-08-25T08:00:0${seq}.000Z`,
    method: "item/completed",
    type,
    status: "completed",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: String(seq),
    summary,
    raw: { type },
  };
}
