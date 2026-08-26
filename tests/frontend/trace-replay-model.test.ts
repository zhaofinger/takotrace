import { describe, expect, it } from "vitest";
import {
  replayActionCounts,
  replayExecutionTiming,
  replayGroupStatus,
  traceReplayModel,
} from "../../src/web/components/trace-replay-model.js";
import type { TraceEvent } from "../../src/web/types.js";

describe("trace replay model", () => {
  it("keeps messages on the reading spine and groups consecutive execution events", () => {
    const model = traceReplayModel([
      event(1, "userMessage"),
      event(2, "agentMessage", { phase: "commentary", text: "Checking" }),
      event(3, "skillCall", { name: "frontend" }),
      event(4, "commandExecution", { command: "rg Trace" }),
      event(5, "mcpToolCall", { server: "browser", tool: "screenshot" }),
      event(6, "agentMessage", { phase: "final_answer", text: "Done" }),
    ], "key");

    expect(model.blocks.map((block) => block.type === "message"
      ? [block.type, block.node.kind, block.id]
      : [block.type, block.ownerAgentId, block.actions.map((item) => item.kind)])).toEqual([
      ["message", "user", "item-1"],
      ["message", "agent", "item-2"],
      ["execution", "item-2", ["skill", "tool", "mcp"]],
      ["message", "agent", "item-6"],
    ]);
    const execution = model.blocks[2];
    expect(execution.type === "execution" && execution.actions[2]).toMatchObject({
      label: "Tool",
      title: "MCP · browser · screenshot",
    });
  });

  it("preserves calls before the first agent message as an unowned execution block", () => {
    const model = traceReplayModel([
      event(1, "userMessage"),
      event(2, "commandExecution", { command: "pwd" }),
      event(3, "mcpToolCall", { server: "fs", tool: "read" }),
      event(4, "agentMessage", { phase: "final_answer" }),
    ], "key");

    expect(model.blocks.map((block) => block.type === "message"
      ? [block.type, block.node.kind]
      : [block.type, block.ownerAgentId, block.actions.length])).toEqual([
      ["message", "user"],
      ["execution", undefined, 2],
      ["message", "agent"],
    ]);
  });

  it("merges lifecycle events and only includes low-level noise in all-events mode", () => {
    const started = event(3, "commandExecution", { command: "npm test" });
    started.method = "item/started";
    started.status = "running";
    started.itemId = "shared";
    const completed = event(6, "commandExecution", { command: "npm test", exitCode: 0 });
    completed.itemId = "shared";
    completed.durationMs = 120;
    const items = [
      event(1, "userMessage"),
      event(2, "agentMessage", { phase: "commentary" }),
      started,
      event(4, "reasoning", { summary: ["Inspect"] }),
      event(5, "unknownSystemEvent"),
      completed,
    ];

    const key = traceReplayModel(items, "key");
    expect(key.total).toBe(5);
    expect(key.visible).toBe(3);
    const keyExecution = key.blocks.find((block) => block.type === "execution");
    expect(keyExecution?.type === "execution" && keyExecution.actions).toHaveLength(1);
    expect(keyExecution?.type === "execution" && keyExecution.actions[0]).toMatchObject({ status: "completed", durationMs: 120 });

    const all = traceReplayModel(items, "all");
    expect(all.visible).toBe(5);
    const allExecution = all.blocks.find((block) => block.type === "execution");
    expect(allExecution?.type === "execution" && allExecution.actions.map((item) => [item.kind, item.batch])).toEqual([
      ["tool", 0],
      ["reasoning", 1],
      ["system", 2],
    ]);
  });

  it("uses hidden reasoning events as execution batch boundaries", () => {
    const model = traceReplayModel([
      event(1, "agentMessage", { phase: "commentary" }),
      event(2, "commandExecution"),
      event(3, "reasoning", { summary: ["Check result"] }),
      event(4, "mcpToolCall"),
    ], "key");

    const execution = model.blocks.find((block) => block.type === "execution");
    expect(execution?.type === "execution" && execution.actions.map((item) => [item.kind, item.batch])).toEqual([
      ["tool", 0],
      ["mcp", 1],
    ]);
  });

  it("detects observed parallel actions from lifecycle overlap", () => {
    const firstStarted = event(2, "commandExecution");
    firstStarted.method = "item/started";
    firstStarted.status = "running";
    firstStarted.itemId = "first";
    const secondStarted = event(3, "mcpToolCall");
    secondStarted.method = "item/started";
    secondStarted.status = "running";
    secondStarted.itemId = "second";
    const secondCompleted = { ...event(4, "mcpToolCall"), itemId: "second", durationMs: 1_000 };
    const firstCompleted = { ...event(5, "commandExecution"), itemId: "first", durationMs: 3_000 };
    const model = traceReplayModel([
      event(1, "agentMessage", { phase: "commentary" }),
      firstStarted,
      secondStarted,
      secondCompleted,
      firstCompleted,
    ], "key");
    const execution = model.blocks.find((block) => block.type === "execution");
    if (!execution || execution.type !== "execution") throw new Error("Expected execution block");

    expect(replayExecutionTiming(execution.actions)).toMatchObject({
      mode: "observed",
      maxConcurrency: 2,
      timedActions: 2,
      wallTimeMs: 3_000,
    });
  });

  it("marks completion-plus-duration overlap as inferred", () => {
    const first = { ...event(2, "commandExecution"), at: "2026-08-25T08:00:06.000Z", durationMs: 3_000 };
    const second = { ...event(3, "mcpToolCall"), at: "2026-08-25T08:00:06.000Z", durationMs: 1_000 };
    const model = traceReplayModel([event(1, "agentMessage"), first, second], "key");
    const execution = model.blocks.find((block) => block.type === "execution");
    if (!execution || execution.type !== "execution") throw new Error("Expected execution block");

    expect(replayExecutionTiming(execution.actions)).toMatchObject({
      mode: "inferred",
      maxConcurrency: 2,
      timedActions: 2,
      wallTimeMs: 3_000,
    });
  });

  it("detects inferred overlap across narrative phases", () => {
    const model = traceReplayModel([
      event(1, "agentMessage"),
      { ...event(2, "commandExecution"), at: "2026-08-25T08:00:06.000Z", durationMs: 3_000 },
      event(3, "reasoning", { summary: ["next phase"] }),
      { ...event(4, "mcpToolCall"), at: "2026-08-25T08:00:06.000Z", durationMs: 1_000 },
    ], "key");
    const execution = model.blocks.find((block) => block.type === "execution");
    if (!execution || execution.type !== "execution") throw new Error("Expected execution block");

    expect(replayExecutionTiming(execution.actions)).toMatchObject({
      mode: "inferred",
      maxConcurrency: 2,
      timedActions: 2,
      wallTimeMs: 3_000,
    });
  });

  it("summarizes action types and gives failures priority", () => {
    const model = traceReplayModel([
      event(1, "agentMessage", { phase: "commentary" }),
      event(2, "commandExecution"),
      { ...event(3, "commandExecution"), status: "running" },
      { ...event(4, "fileChange"), status: "failed" },
    ], "key");
    const execution = model.blocks.find((block) => block.type === "execution");
    if (!execution || execution.type !== "execution") throw new Error("Expected execution block");

    expect(replayActionCounts(execution.actions)).toEqual([["Tool", 2], ["Files", 1]]);
    expect(replayGroupStatus(execution.actions)).toBe("failed");
  });

  it("treats a completed command with a non-zero exit code as a failed outcome", () => {
    const model = traceReplayModel([
      event(1, "agentMessage", { phase: "commentary" }),
      event(2, "commandExecution", { command: "false", exitCode: 1 }),
    ], "key");
    const execution = model.blocks.find((block) => block.type === "execution");
    if (!execution || execution.type !== "execution") throw new Error("Expected execution block");

    expect(execution.actions[0].status).toBe("failed");
    expect(replayGroupStatus(execution.actions)).toBe("failed");
  });
});

function event(seq: number, type: string, raw: Record<string, unknown> = {}): TraceEvent {
  return {
    seq,
    at: `2026-08-25T08:00:${String(seq).padStart(2, "0")}.000Z`,
    method: "item/completed",
    type,
    status: "completed",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: String(seq),
    summary: type,
    raw: { type, ...raw },
  };
}
