import { describe, expect, it } from "vitest";
import { mergeFlowEvents } from "../../src/web/components/InteractionFlow.js";
import { parallelExecutionGroups } from "../../src/web/components/parallel-execution-model.js";
import type { TraceEvent } from "../../src/web/types.js";

describe("parallel execution model", () => {
  it("confirms overlap from lifecycle order without usable timestamps", () => {
    const groups = parallelExecutionGroups(mergeFlowEvents([
      event(1, "item/started", "first", "running"),
      event(2, "item/started", "second", "running"),
      event(3, "item/completed", "second", "completed"),
      event(4, "item/completed", "first", "completed"),
    ]));

    expect(groups).toEqual([
      expect.objectContaining({
        eventIds: ["item-first", "item-second"],
        maxConcurrency: 2,
        evidence: "lifecycle",
        confidence: "confirmed",
      }),
    ]);
  });

  it("does not mark sequential lifecycles as parallel", () => {
    const groups = parallelExecutionGroups(mergeFlowEvents([
      event(1, "item/started", "first", "running"),
      event(2, "item/completed", "first", "completed"),
      event(3, "item/started", "second", "running"),
      event(4, "item/completed", "second", "completed"),
    ]));

    expect(groups).toEqual([]);
  });

  it("does not treat turn fallback timestamps as observed overlap", () => {
    const first = {
      ...event(1, "item/completed", "first", "completed"),
      startedAt: "2026-01-01T00:00:01.000Z",
      completedAt: "2026-01-01T00:00:04.000Z",
      timingSource: "turn-fallback" as const,
    };
    const second = {
      ...event(2, "item/completed", "second", "completed"),
      startedAt: "2026-01-01T00:00:02.000Z",
      completedAt: "2026-01-01T00:00:03.000Z",
      timingSource: "turn-fallback" as const,
    };

    expect(parallelExecutionGroups([first, second])).toEqual([]);
  });

  it("recognizes multiple subagent forks before a join as structured parallelism", () => {
    const groups = parallelExecutionGroups([
      collab(1, "fork-a", "spawnAgent", ["child-a"]),
      collab(2, "fork-b", "spawnAgent", ["child-b"]),
      collab(3, "join", "wait", ["child-a", "child-b"]),
    ]);

    expect(groups).toEqual([
      expect.objectContaining({
        eventIds: ["item-fork-a", "item-fork-b"],
        maxConcurrency: 2,
        evidence: "fork-join",
        confidence: "structured",
      }),
    ]);
  });

  it("does not group subagents that finish before the next fork", () => {
    const groups = parallelExecutionGroups([
      collab(1, "fork-a", "spawnAgent", ["child-a"]),
      subagentResult(2, "child-a"),
      collab(3, "fork-b", "spawnAgent", ["child-b"]),
      collab(4, "join", "wait", ["child-b"]),
    ]);

    expect(groups).toEqual([]);
  });

  it("keeps identical item ids in different turns separate", () => {
    const first = event(1, "item/started", "shared", "running");
    const second = { ...event(2, "item/started", "shared", "running"), turnId: "turn-2" };

    expect(mergeFlowEvents([first, second])).toHaveLength(2);
  });
});

function event(seq: number, method: string, itemId: string, status: TraceEvent["status"]): TraceEvent {
  return {
    seq,
    at: "2026-01-01T00:00:00.000Z",
    method,
    type: "commandExecution",
    status,
    threadId: "thread-1",
    turnId: "turn-1",
    itemId,
    summary: itemId,
    raw: { type: "commandExecution", command: itemId },
  };
}

function collab(seq: number, itemId: string, tool: string, receiverThreadIds: string[]): TraceEvent {
  return {
    ...event(seq, "item/completed", itemId, "completed"),
    type: "collabAgentToolCall",
    raw: { type: "collabAgentToolCall", tool, receiverThreadIds },
  };
}

function subagentResult(seq: number, agentThreadId: string): TraceEvent {
  return {
    ...event(seq, "item/completed", `result-${agentThreadId}`, "completed"),
    type: "subAgentActivity",
    raw: { type: "subAgentActivity", kind: "completed", agentThreadId },
  };
}
