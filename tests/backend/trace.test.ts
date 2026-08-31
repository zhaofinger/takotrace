import { describe, expect, it } from "vitest";
import { notificationToTrace, threadToHistory } from "../../src/shared/trace.js";

describe("trace lifecycle timing", () => {
  it("normalizes realtime token usage notifications", () => {
    const event = notificationToTrace({
      method: "thread/tokenUsage/updated",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        tokenUsage: {
          total: { totalTokens: 150, inputTokens: 120, cachedInputTokens: 80, outputTokens: 30 },
          last: { totalTokens: 50, inputTokens: 40, cachedInputTokens: 20, outputTokens: 10 },
          modelContextWindow: 200_000,
        },
      },
    });

    expect(event.tokenUsage).toEqual({
      total: {
        totalTokens: 150, inputTokens: 120, cachedInputTokens: 80, cacheWriteInputTokens: 0,
        outputTokens: 30, reasoningOutputTokens: 0,
      },
      last: {
        totalTokens: 50, inputTokens: 40, cachedInputTokens: 20, cacheWriteInputTokens: 0,
        outputTokens: 10, reasoningOutputTokens: 0,
      },
      modelContextWindow: 200_000,
    });
  });

  it("preserves item lifecycle timestamps and parent identity from notifications", () => {
    const started = notificationToTrace({
      method: "item/started",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        startedAtMs: 1_767_225_601_250,
        item: { id: "child-1", parentItemId: "agent-1", type: "commandExecution" },
      },
    });
    const completed = notificationToTrace({
      method: "item/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        completedAtMs: 1_767_225_602_500,
        item: { id: "child-1", parentItemId: "agent-1", type: "commandExecution", durationMs: 1_250 },
      },
    });

    expect(started).toMatchObject({
      startedAt: "2026-01-01T00:00:01.250Z",
      completedAt: undefined,
      parentItemId: "agent-1",
    });
    expect(completed).toMatchObject({
      startedAt: undefined,
      completedAt: "2026-01-01T00:00:02.500Z",
      durationMs: 1_250,
    });
  });

  it("uses item timestamps when thread history provides them", () => {
    const thread = threadToHistory({
      id: "thread-1",
      status: { type: "completed" },
      createdAt: 1_767_225_600,
      updatedAt: 1_767_225_603,
      turns: [{
        id: "turn-1",
        model: "gpt-5.6-sol",
        status: "completed",
        startedAt: 1_767_225_600,
        completedAt: 1_767_225_603,
        items: [{
          id: "item-1",
          type: "commandExecution",
          status: "completed",
          startedAt: 1_767_225_601,
          completedAt: 1_767_225_602,
          durationMs: 1_000,
        }],
      }],
    });

    expect(thread?.turns[0]).toMatchObject({ model: "gpt-5.6-sol" });
    expect(thread?.turns[0].items[0]).toMatchObject({
      at: "2026-01-01T00:00:02.000Z",
      startedAt: "2026-01-01T00:00:01.000Z",
      completedAt: "2026-01-01T00:00:02.000Z",
      timingSource: "observed",
    });
  });

  it("marks turn-level fallback timestamps as unavailable item timing", () => {
    const thread = threadToHistory({
      id: "thread-1",
      status: { type: "completed" },
      createdAt: 1_767_225_600,
      updatedAt: 1_767_225_603,
      turns: [{
        id: "turn-1",
        status: "completed",
        startedAt: 1_767_225_600,
        completedAt: 1_767_225_603,
        items: [{ id: "item-1", type: "agentMessage", status: "completed", text: "Done" }],
      }],
    });

    expect(thread?.turns[0].items[0]).toMatchObject({
      at: "2026-01-01T00:00:03.000Z",
      timingSource: "turn-fallback",
    });
  });

  it("does not copy a running or interrupted turn status onto committed history items", () => {
    const thread = threadToHistory({
      id: "thread-1",
      status: { type: "active" },
      createdAt: 1_767_225_600,
      updatedAt: 1_767_225_603,
      turns: [{
        id: "turn-1",
        status: "interrupted",
        startedAt: 1_767_225_600,
        items: [
          { id: "user-1", type: "userMessage", content: [{ type: "text", text: "Inspect this" }] },
          { id: "reasoning-1", type: "reasoning", summary: ["Checking"] },
          { id: "subagent-1", type: "subAgentActivity", kind: "started" },
          { id: "tool-running", type: "commandExecution", status: "inProgress" },
          { id: "tool-failed", type: "commandExecution", status: "failed" },
          { id: "tool-interrupted", type: "commandExecution", status: "interrupted" },
        ],
      }],
    });

    expect(thread?.turns[0].status).toBe("interrupted");
    expect(thread?.turns[0].items.map((item) => [item.itemId, item.status, item.method])).toEqual([
      ["user-1", "completed", "item/completed"],
      ["reasoning-1", "completed", "item/completed"],
      ["subagent-1", "completed", "item/completed"],
      ["tool-running", "running", "item/started"],
      ["tool-failed", "failed", "item/completed"],
      ["tool-interrupted", "interrupted", "item/completed"],
    ]);
  });

  it("reads a run model from live turn notifications", () => {
    const event = notificationToTrace({
      method: "turn/started",
      params: {
        threadId: "thread-1",
        turn: { id: "turn-1", model: "gpt-5.6-sol" },
      },
    });

    expect(event.model).toBe("gpt-5.6-sol");

    const settings = notificationToTrace({
      method: "thread/settings/updated",
      params: {
        threadId: "thread-1",
        threadSettings: { model: "gpt-5.6-terra" },
      },
    });
    expect(settings.model).toBe("gpt-5.6-terra");
  });

  it("preserves and normalizes subagent thread metadata", () => {
    const thread = threadToHistory({
      id: "child-1",
      sessionId: "session-1",
      forkedFromId: null,
      parentThreadId: "parent-1",
      preview: "Child task",
      status: { type: "active" },
      createdAt: 1_767_225_600,
      updatedAt: 1_767_225_603,
      cwd: "/tmp/project",
      ephemeral: false,
      modelProvider: "openai",
      path: "/tmp/child.jsonl",
      cliVersion: "0.147.0",
      threadSource: "collaboration",
      agentNickname: "worker",
      agentRole: "explorer",
      source: {
        subAgent: {
          thread_spawn: {
            parent_thread_id: "parent-from-source",
            depth: 2,
            agent_path: "/root/worker",
            agent_nickname: "source-worker",
            agent_role: "source-role",
          },
        },
      },
      turns: [],
    });

    expect(thread).toMatchObject({
      id: "child-1",
      sessionId: "session-1",
      forkedFromId: null,
      parentThreadId: "parent-1",
      ephemeral: false,
      modelProvider: "openai",
      path: "/tmp/child.jsonl",
      cliVersion: "0.147.0",
      threadSource: "collaboration",
      agentNickname: "worker",
      agentRole: "explorer",
      agentPath: "/root/worker",
      depth: 2,
    });
  });

  it("preserves normalized thread and turn token usage from history", () => {
    const thread = threadToHistory({
      id: "thread-1",
      createdAt: 1_767_225_600,
      updatedAt: 1_767_225_603,
      tokenUsage: {
        total: { total_tokens: 100, input_tokens: 80, output_tokens: 20 },
        last: { total_tokens: 40, input_tokens: 30, output_tokens: 10 },
      },
      turns: [{
        id: "turn-1",
        tokenUsage: { total_tokens: 40, input_tokens: 30, output_tokens: 10 },
        items: [],
      }],
    });

    expect(thread?.tokenUsage?.total.totalTokens).toBe(100);
    expect(thread?.turns[0].tokenUsage).toMatchObject({ totalTokens: 40, inputTokens: 30, outputTokens: 10 });
  });
});
