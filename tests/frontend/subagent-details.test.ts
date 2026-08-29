import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventDetails } from "../../src/web/components/EventDetails";
import {
  SubagentThreadContent,
  subagentEventLabel,
  subagentTargetThreadIds,
  subagentThreadOverview,
  subagentThreadSummary,
} from "../../src/web/components/SubagentThreadDetails";
import {
  getSubagentDetailSnapshot,
  loadSubagentDetail,
  resetSubagentDetailCache,
} from "../../src/web/subagent-detail-store";
import type { SubagentAssignment, ThreadDetail, TraceEvent } from "../../src/web/types";

afterEach(() => {
  resetSubagentDetailCache();
  vi.unstubAllGlobals();
});

describe("subagent detail targets", () => {
  it("deduplicates the agent thread and receiver thread ids", () => {
    expect(subagentTargetThreadIds({
      agentThreadId: "child-1",
      agent_thread_id: "child-2",
      receiver_thread_ids: ["child-1", " child-3 ", null, ""],
    })).toEqual(["child-1", "child-2", "child-3"]);
  });

  it("renders one explicit lazy-load control per target", () => {
    const markup = renderToStaticMarkup(createElement(EventDetails, {
      event: event(1, "collabAgentToolCall", {
        tool: "sendInput",
        agentThreadId: "child-1",
        receiverThreadIds: ["child-1", "child-2"],
      }),
      fallback: "Send input",
    }));

    expect(markup.match(/Load assigned task and result/g)).toHaveLength(2);
    expect(markup).toContain("child-1");
    expect(markup).toContain("child-2");
  });

  it("starts loading directly when the selected drawer requests the summary", () => {
    const markup = renderToStaticMarkup(createElement(EventDetails, {
      autoLoadSubagent: true,
      event: event(1, "collabAgentToolCall", {
        prompt: "Inspect the layout",
        tool: "spawnAgent",
        receiverThreadIds: ["child-1"],
      }),
      fallback: "Spawn subagent",
      subagentView: "trace",
    }));

    expect(markup).toContain("Loading assigned task and result…");
    expect(markup).not.toContain("Load assigned task and result");
  });
});

describe("subagent detail cache", () => {
  it("shares an in-flight request and caches its result", async () => {
    let resolveResponse!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; }));
    vi.stubGlobal("fetch", fetchMock);

    const first = loadSubagentDetail("child/a");
    const second = loadSubagentDetail("child/a");
    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/subagents/child%2Fa");

    resolveResponse(new Response(JSON.stringify({
      thread: threadDetail(),
      assignment: assignment("available", { text: "Implement details" }),
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    await first;
    await loadSubagentDetail("child/a");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getSubagentDetailSnapshot("child/a")).toMatchObject({
      status: "success",
      thread: { id: "child-1" },
      assignment: { availability: "available", text: "Implement details" },
    });
  });

  it("stores an error and retries the same target", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Child unavailable" } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        thread: threadDetail(),
        assignment: assignment("not-recorded"),
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadSubagentDetail("child-1")).rejects.toThrow("Child unavailable");
    expect(getSubagentDetailSnapshot("child-1")).toEqual({ status: "error", error: "Child unavailable" });
    await expect(loadSubagentDetail("child-1", true)).resolves.toMatchObject({
      thread: { id: "child-1" },
      assignment: { availability: "not-recorded" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("loaded subagent thread", () => {
  it("shows the child run status, identity, timing, steps, result, and source view entry", () => {
    const thread = threadDetail();
    const markup = renderToStaticMarkup(createElement(SubagentThreadContent, {
      detailView: "sequence",
      thread,
      onOpenThread: () => undefined,
    }));

    expect(markup).toContain("Builder");
    expect(markup).toContain("completed");
    expect(markup).toContain("worker");
    expect(markup).toContain("/root/frontend_impl");
    expect(markup).toContain('class="vbg-custom-subagent-thread__model"');
    expect(markup).toContain('title="gpt-5.6-sol">gpt-5.6-sol</code>');
    expect(markup).toContain("<h4>Assigned task</h4>");
    expect(markup).toContain("Implement details");
    expect(markup).toContain("<h4>Result</h4>");
    expect(markup).toContain("Compile failed");
    expect(markup).toContain("<dt>Duration</dt><dd>6s</dd>");
    expect(markup).toContain("<dt>Steps</dt><dd>7</dd>");
    expect(markup).toContain(">Open sequence</button>");
    expect(markup).not.toContain(">openai<");
    expect(markup).not.toContain("Runs</dt>");
    expect(markup).not.toContain("npm test");
    expect(markup).not.toContain("Refresh");
    expect(markup.indexOf('vbg-custom-subagent-thread__model')).toBeLessThan(markup.indexOf('vbg-custom-subagent-thread"'));
    const cardHeader = markup.match(/<section class="vbg-custom-subagent-thread"[^>]*><header>(.*?)<\/header>/)?.[1] ?? "";
    expect(cardHeader).not.toContain("gpt-5.6-sol");
  });

  it("uses the latest event as activity while a child is still running", () => {
    const thread = threadDetail();
    thread.status = "running";
    thread.turns[0]!.status = "running";
    thread.turns[0]!.completedAt = undefined;

    expect(subagentThreadOverview(thread)).toEqual({
      active: true,
      durationMs: undefined,
      latestActivity: "Worker disconnected",
      steps: 7,
    });

    const markup = renderToStaticMarkup(createElement(SubagentThreadContent, { thread }));
    expect(markup).toContain("<h4>Latest activity</h4>");
    expect(markup).toContain("Worker disconnected");
    expect(markup).not.toContain("<h4>Result</h4>");
  });

  it("keeps an empty child compact and does not offer an unavailable source view", () => {
    const thread = threadDetail();
    thread.turns = [];
    thread.agentRole = undefined;

    const markup = renderToStaticMarkup(createElement(SubagentThreadContent, {
      thread,
      onOpenThread: () => undefined,
    }));

    expect(markup).toContain("/root/frontend_impl");
    expect(markup).toContain("<dt>Duration</dt><dd>—</dd>");
    expect(markup).toContain("<dt>Steps</dt><dd>0</dd>");
    expect(markup).not.toContain(">Open trace</button>");
  });

  it("does not infer a duration from invalid timestamp order", () => {
    const thread = threadDetail();
    thread.turns[0]!.startedAt = "2026-01-01T00:00:08.000Z";
    thread.turns[0]!.completedAt = "2026-01-01T00:00:07.000Z";

    expect(subagentThreadOverview(thread).durationMs).toBeUndefined();
  });

  it("prefers the child user message, then the event prompt, then the resolved assignment", () => {
    const thread = threadDetail();
    const resolved = assignment("available", { text: "Resolved assignment" });

    expect(subagentThreadSummary(thread, "Event prompt", resolved)).toEqual({
      assignedTask: "Implement details",
      result: "Compile failed",
    });

    thread.turns[0]!.items = thread.turns[0]!.items.filter((item) => item.type !== "userMessage");
    expect(subagentThreadSummary(thread, "Event prompt", resolved)).toEqual({
      assignedTask: "Event prompt",
      result: "Compile failed",
    });

    expect(subagentThreadSummary(thread, undefined, resolved)).toEqual({
      assignedTask: "Resolved assignment",
      result: "Compile failed",
    });
  });

  it("renders an available resolved assignment and its metadata independently", () => {
    const thread = threadDetail();
    thread.turns[0]!.items = thread.turns[0]!.items.filter((item) => item.type !== "userMessage");
    const markup = renderToStaticMarkup(createElement(SubagentThreadContent, {
      assignment: assignment("available", {
        text: "Implement the summary card",
        taskName: "summary_card",
        agentType: "worker",
        forkTurns: "all",
      }),
      thread,
    }));

    expect(markup).toContain("<h4>Assigned task</h4>");
    expect(markup).toContain("Implement the summary card");
    expect(markup).toContain("<dt>Task name</dt><dd title=\"summary_card\">summary_card</dd>");
    expect(markup).toContain("<dt>Agent type</dt><dd title=\"worker\">worker</dd>");
    expect(markup).toContain("<dt>Fork turns</dt><dd title=\"all\">all</dd>");
  });

  it("explains when the assigned task is encrypted", () => {
    const thread = threadDetail();
    thread.turns[0]!.items = thread.turns[0]!.items.filter((item) => item.type !== "userMessage");
    const markup = renderToStaticMarkup(createElement(SubagentThreadContent, {
      assignment: assignment("encrypted", { taskName: "private_task" }),
      thread,
    }));

    expect(markup).toContain("Unavailable in this recording · encrypted by Codex");
    expect(markup).toContain("private_task");
  });

  it("explains when the source did not record the assigned task", () => {
    const thread = threadDetail();
    thread.turns[0]!.items = thread.turns[0]!.items.filter((item) => item.type !== "userMessage");
    const markup = renderToStaticMarkup(createElement(SubagentThreadContent, {
      assignment: assignment("not-recorded"),
      thread,
    }));

    expect(markup).toContain("Source did not expose the assigned task");
  });

  it("classifies agent phases and execution events", () => {
    expect(subagentEventLabel(event(1, "agentMessage", { phase: "commentary" }))).toBe("Commentary");
    expect(subagentEventLabel(event(2, "agentMessage", { phase: "final_answer" }))).toBe("Final");
    expect(subagentEventLabel(event(3, "fileChange", { changes: [] }))).toBe("Files");
    expect(subagentEventLabel(event(4, "reasoning", { summary: ["Plan"] }))).toBe("Reasoning");
  });
});

function threadDetail(): ThreadDetail {
  return {
    id: "child-1",
    title: "Implement frontend",
    status: "completed",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:05.000Z",
    agentNickname: "Builder",
    agentRole: "worker",
    agentPath: "/root/frontend_impl",
    depth: 1,
    modelProvider: "openai",
    turns: [{
      id: "turn-1",
      model: "gpt-5.6-sol",
      status: "completed",
      startedAt: "2026-01-01T00:00:01.000Z",
      completedAt: "2026-01-01T00:00:07.000Z",
      items: [
        event(1, "userMessage", { text: "Implement details" }),
        event(2, "agentMessage", { phase: "commentary", text: "Inspecting components" }),
        event(3, "commandExecution", { command: "npm test", exitCode: 0 }),
        event(4, "fileChange", { changes: [{ path: "src/web/App.tsx", kind: "update" }] }),
        { ...event(5, "agentMessage", { phase: "final_answer", text: "Compile failed" }), status: "failed" },
        event(6, "reasoning", { summary: ["Validate the result"] }),
        { ...event(7, "runtimeError", { error: "Worker disconnected" }), status: "failed" },
      ],
    }],
  };
}

function assignment(
  availability: SubagentAssignment["availability"],
  fields: Omit<SubagentAssignment, "availability"> = {},
): SubagentAssignment {
  return { availability, ...fields };
}

function event(seq: number, type: string, raw: Record<string, unknown>): TraceEvent {
  return {
    seq,
    at: `2026-01-01T00:00:0${seq}.000Z`,
    method: "item/completed",
    type,
    status: "completed",
    threadId: "child-1",
    turnId: "turn-1",
    itemId: String(seq),
    summary: String(raw.text ?? raw.command ?? type),
    raw: { type, ...raw },
  };
}
