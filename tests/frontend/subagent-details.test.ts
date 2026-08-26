import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventDetails } from "../../src/web/components/EventDetails";
import {
  SubagentThreadContent,
  subagentEventLabel,
  subagentTargetThreadIds,
} from "../../src/web/components/SubagentThreadDetails";
import {
  getSubagentDetailSnapshot,
  loadSubagentDetail,
  resetSubagentDetailCache,
} from "../../src/web/subagent-detail-store";
import type { ThreadDetail, TraceEvent } from "../../src/web/types";

afterEach(() => {
  resetSubagentDetailCache();
  vi.unstubAllGlobals();
});

describe("subagent detail targets", () => {
  it("deduplicates the agent thread and receiver thread ids", () => {
    expect(subagentTargetThreadIds({
      agentThreadId: "child-1",
      receiverThreadIds: ["child-1", " child-2 ", null, ""],
    })).toEqual(["child-1", "child-2"]);
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

    expect(markup.match(/Load details/g)).toHaveLength(2);
    expect(markup).toContain("child-1");
    expect(markup).toContain("child-2");
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

    resolveResponse(new Response(JSON.stringify({ thread: threadDetail() }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    await first;
    await loadSubagentDetail("child/a");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getSubagentDetailSnapshot("child/a").status).toBe("success");
  });

  it("stores an error and retries the same target", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Child unavailable" } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ thread: threadDetail() }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadSubagentDetail("child-1")).rejects.toThrow("Child unavailable");
    expect(getSubagentDetailSnapshot("child-1")).toEqual({ status: "error", error: "Child unavailable" });
    await expect(loadSubagentDetail("child-1", true)).resolves.toMatchObject({ id: "child-1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("loaded subagent thread", () => {
  it("shows identity, counts, messages, tools, files, and errors", () => {
    const thread = threadDetail();
    const markup = renderToStaticMarkup(createElement(SubagentThreadContent, { thread, onRefresh: () => undefined }));

    expect(markup).toContain("Builder");
    expect(markup).toContain("frontend_impl");
    expect(markup).toContain("worker");
    expect(markup).toContain("Turns</dt><dd>1");
    expect(markup).toContain("Items</dt><dd>7");
    expect(markup).toContain("Prompt</span>");
    expect(markup).toContain("Commentary</span>");
    expect(markup).toContain("Final</span>");
    expect(markup).toContain("Tool</span>");
    expect(markup).toContain("Error</span>");
    expect(markup).toContain("Reasoning</span>");
    expect(markup).toContain(">Refresh</button>");
    expect(markup).toContain("npm test");
    expect(markup).toContain("Compile failed");
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
      status: "completed",
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
