import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExecutionInspector } from "../../src/web/components/ExecutionInspector.js";
import ExecutionReplay from "../../src/web/components/ExecutionReplay.js";
import type { TraceEvent } from "../../src/web/types.js";

describe("ExecutionReplay waterfall", () => {
  it("does not render an empty overview axis", () => {
    const markup = renderToStaticMarkup(createElement(ExecutionReplay, { items: [] }));

    expect(markup).not.toContain('aria-label="Trace overview"');
    expect(markup).not.toContain("Bar width represents relative duration");
  });

  it("renders observed overlap as a parallel waterfall", () => {
    const markup = renderToStaticMarkup(createElement(ExecutionReplay, {
      items: [
        event(1, "agentMessage", { phase: "commentary", text: "Running checks" }),
        {
          ...event(2, "commandExecution", { command: "npm test" }),
          startedAt: "2026-01-01T00:00:01.000Z",
          completedAt: "2026-01-01T00:00:04.000Z",
          durationMs: 3_000,
        },
        {
          ...event(3, "commandExecution", { command: "npm run typecheck" }),
          startedAt: "2026-01-01T00:00:02.000Z",
          completedAt: "2026-01-01T00:00:03.000Z",
          durationMs: 1_000,
        },
      ],
    }));

    expect(markup).toContain("Parallel ×2");
    expect(markup.match(/aria-label="Observed duration/g)).toHaveLength(2);
    expect(markup).not.toContain('vbg-custom-replay-action__bar');
    expect(markup).not.toContain('vbg-custom-replay-action__timeline');
    expect(markup).toContain('aria-label="Trace overview"');
    expect(markup).not.toContain("Show all");
    expect(markup).not.toContain('role="switch"');
    expect(markup).not.toContain('class="vbg-custom-replay-overview__sequence"');
    expect(markup).toContain('title="Bar width represents duration"');
    expect(markup).not.toContain('aria-label="Overview scale"');
    expect(markup).toContain('class="vbg-custom-replay-overview__bar vbg-custom-replay-overview__bar--tool"');
    expect(markup).toMatch(/vbg-custom-replay-overview__bar[^>]+width:max\(6px, [\d.]+%\)/);
    const overviewWidths = [...markup.matchAll(/width:max\(6px, ([\d.]+)%\)/g)].map((match) => Number(match[1]));
    expect(new Set(overviewWidths).size).toBeGreaterThan(1);
    expect(markup).toContain("Tool · Shell · npm test · 3.0s");
    expect(markup).not.toContain("<span>Input</span>");
    expect(markup).not.toContain("<span>MCP</span>");
  });

  it("renders lifecycle overlap as confirmed parallel execution without timestamps", () => {
    const markup = renderToStaticMarkup(createElement(ExecutionReplay, {
      items: [
        lifecycleEvent(1, "item/started", "first", "running"),
        lifecycleEvent(2, "item/started", "second", "running"),
        lifecycleEvent(3, "item/completed", "second", "completed"),
        lifecycleEvent(4, "item/completed", "first", "completed"),
      ],
    }));

    expect(markup).toContain("Parallel ×2");
    expect(markup).toContain("lifecycle overlap");
    expect(markup.match(/vbg-custom-replay-action--parallel/g)).toHaveLength(2);
    expect(markup).not.toContain("Order only");
  });

  it("falls back to sequence when events share the same timestamp", () => {
    const items = [
      event(1, "userMessage"),
      event(2, "agentMessage"),
      event(3, "commandExecution", { command: "pwd" }),
    ].map((item) => ({ ...item, at: "2026-01-01T00:00:00.000Z" }));
    const markup = renderToStaticMarkup(createElement(ExecutionReplay, { items }));

    expect(markup).not.toContain('aria-label="Overview scale"');
    expect(markup).toContain('class="vbg-custom-replay-overview__sequence"');
    expect(markup).toContain('title="Bar width represents relative duration"');
  });

  it("does not infer a false waterfall or overlap from turn fallback timestamps", () => {
    const sharedAt = "2026-01-01T00:21:06.000Z";
    const items = [
      { ...event(1, "userMessage"), at: sharedAt, timingSource: "turn-fallback" as const },
      { ...event(2, "agentMessage"), at: sharedAt, timingSource: "turn-fallback" as const },
      { ...event(3, "commandExecution", { command: "npm test" }), at: sharedAt, durationMs: 4_602, timingSource: "turn-fallback" as const },
      { ...event(4, "mcpToolCall", { tool: "browser" }), at: sharedAt, durationMs: 414, timingSource: "turn-fallback" as const },
    ];
    const markup = renderToStaticMarkup(createElement(ExecutionReplay, { items }));

    expect(markup).toContain('class="vbg-custom-replay-overview__sequence"');
    expect(markup).toContain('title="Bar width represents relative duration"');
    expect(markup).toContain('title="Exact event time is unavailable">Order only</span>');
    expect(markup).not.toContain("Possible overlap");
    expect(markup).not.toContain("Estimated timing");
    expect(markup).not.toContain(">00:21:06</time>");
  });

  it("keeps Skill inside Tools while showing MCP and Subagents in separate overview lanes", () => {
    const markup = renderToStaticMarkup(createElement(ExecutionReplay, {
      items: [
        event(1, "skillCall", { name: "impeccable" }),
        event(2, "mcpToolCall", { server: "browser", tool: "open" }),
        event(3, "subAgentActivity", { kind: "started", agent_path: "/root/reviewer" }),
      ],
    }));

    expect(markup).toContain("<span>Tools</span>");
    expect(markup).toContain("<span>Subagents</span>");
    expect(markup).not.toContain("<span>Skills</span>");
    expect(markup).toContain("<span>MCP</span>");
  });

  it("preserves actual timing when timestamps overlap execution order", () => {
    const markup = renderToStaticMarkup(createElement(ExecutionReplay, {
      items: [
        {
          ...event(1, "userMessage"),
          startedAt: "2026-01-01T00:00:10.000Z",
          completedAt: "2026-01-01T00:00:10.000Z",
        },
        {
          ...event(2, "commandExecution", { command: "npm test" }),
          startedAt: "2026-01-01T00:00:01.000Z",
          completedAt: "2026-01-01T00:00:04.000Z",
        },
        {
          ...event(3, "commandExecution", { command: "npm run typecheck" }),
          startedAt: "2026-01-01T00:00:02.000Z",
          completedAt: "2026-01-01T00:00:03.000Z",
        },
      ],
    }));

    expect(markup).not.toContain('class="vbg-custom-replay-overview__sequence"');
    expect(markup).toContain('title="Bar width represents duration"');
    expect(markup).toMatch(/vbg-custom-replay-overview__bar--user[^>]+left:99\.2%/);
    const overviewWidths = [...markup.matchAll(/width:max\(6px, ([\d.]+)%\)/g)].map((match) => Number(match[1]));
    expect(new Set(overviewWidths).size).toBeGreaterThan(1);
  });

  it("labels actions without lifecycle timing as order only", () => {
    const markup = renderToStaticMarkup(createElement(ExecutionReplay, {
      items: [event(1, "agentMessage"), event(2, "commandExecution", { command: "pwd" })],
    }));

    expect(markup).toContain("Order only");
    expect(markup).not.toContain('vbg-custom-replay-action__duration');
    expect(markup).not.toContain("Parallel");
  });

  it("keeps completed tool call groups collapsed by default", () => {
    const singleCallMarkup = renderToStaticMarkup(createElement(ExecutionReplay, {
      items: [
        event(1, "agentMessage"),
        event(2, "commandExecution", { command: "one" }),
      ],
    }));
    const multipleCallsMarkup = renderToStaticMarkup(createElement(ExecutionReplay, {
      items: [
        event(1, "agentMessage"),
        event(2, "commandExecution", { command: "one" }),
        event(3, "commandExecution", { command: "two" }),
        event(4, "commandExecution", { command: "three" }),
        event(5, "commandExecution", { command: "four" }),
      ],
    }));

    expect(singleCallMarkup).toContain("1 tool call");
    expect(singleCallMarkup).not.toContain('<details class="vbg-custom-replay-execution" open="">');
    expect(multipleCallsMarkup).toContain("4 tool calls");
    expect(multipleCallsMarkup).toContain('<details class="vbg-custom-replay-execution">');
    expect(multipleCallsMarkup).not.toContain('<details class="vbg-custom-replay-execution" open="">');
  });

  it("keeps running and failed tool call groups expanded", () => {
    const runningMarkup = renderToStaticMarkup(createElement(ExecutionReplay, {
      items: [
        event(1, "agentMessage"),
        { ...event(2, "commandExecution", { command: "npm test" }), status: "running" },
      ],
    }));
    const failedMarkup = renderToStaticMarkup(createElement(ExecutionReplay, {
      items: [
        event(1, "agentMessage"),
        event(2, "commandExecution", { command: "false", exitCode: 1 }),
      ],
    }));

    expect(runningMarkup).toContain('<details class="vbg-custom-replay-execution" open="">');
    expect(failedMarkup).toContain('<details class="vbg-custom-replay-execution" open="">');
  });

  it("keeps per-action duration compact while the overview carries timing", () => {
    const markup = renderToStaticMarkup(createElement(ExecutionReplay, {
      items: [
        event(1, "agentMessage"),
        { ...event(2, "commandExecution", { command: "long" }), at: "2026-01-01T00:00:06.000Z", durationMs: 6_000 },
        event(3, "reasoning", { summary: ["next phase"] }),
        { ...event(4, "mcpToolCall", { tool: "short" }), at: "2026-01-01T00:00:07.000Z", durationMs: 1_000 },
      ],
    }));

    expect(markup).toContain('class="vbg-custom-replay-action__duration">6.0s</time>');
    expect(markup).toContain('class="vbg-custom-replay-action__duration">1.0s</time>');
    expect(markup).not.toContain('vbg-custom-replay-action__timeline');
    expect(markup).not.toContain("Execution timeline · Estimated");
    expect(markup).not.toContain("Batch 1");
    expect(markup).not.toContain("Phase 1");
  });

  it("keeps action details out of the list row and renders them in the shared inspector", () => {
    const mcpEvent = event(2, "mcpToolCall", {
      tool: "node_repl",
      arguments: { code: "1 + 1" },
      result: { content: [{ type: "text", text: "done" }] },
    });
    const markup = renderToStaticMarkup(createElement(ExecutionReplay, {
      items: [
        event(1, "agentMessage"),
        mcpEvent,
      ],
    }));
    const inspectorMarkup = renderToStaticMarkup(createElement(ExecutionInspector, {
      item: {
        seq: mcpEvent.seq,
        event: mcpEvent,
        kind: "mcp",
        title: "node_repl · js",
        detail: "node_repl · js",
        status: "completed",
        at: mcpEvent.at,
        from: "agent",
        to: "mcp",
        type: "call",
      },
      onClose: () => undefined,
    }));

    expect(markup).toContain('class="vbg-custom-replay-action__summary"');
    expect(markup).not.toContain('vbg-custom-replay-action__detail');
    expect(markup).not.toContain("Result · 1 block");
    expect(inspectorMarkup).toContain('id="execution-inspector"');
    expect(inspectorMarkup).toContain('role="tablist"');
    expect(inspectorMarkup).toContain("Overview");
    expect(inspectorMarkup).toContain("Raw event");
    expect(inspectorMarkup).not.toContain("Collapse action details");
    expect(inspectorMarkup).not.toContain("Expand action details");
    expect(inspectorMarkup).toContain("Close execution details");
    expect(inspectorMarkup).toContain('autofocus=""');
    expect(inspectorMarkup).toContain('<details class="vbg-custom-event-disclosure" open="">');
    expect(inspectorMarkup).toContain("Result · 1 block");
    expect(inspectorMarkup).toContain("done");
  });

  it("labels the recorded start timestamp with an unambiguous local date", () => {
    const commandEvent = {
      ...event(2, "commandExecution", { command: "npm test" }),
      at: "2026-08-29T00:04:05.000",
      startedAt: "2026-08-29T00:04:01.954",
      completedAt: "2026-08-29T00:04:05.000",
    };
    const markup = renderToStaticMarkup(createElement(ExecutionInspector, {
      item: {
        seq: commandEvent.seq,
        event: commandEvent,
        kind: "tool",
        title: "Shell · npm test",
        detail: "npm test",
        status: "completed",
        at: commandEvent.at,
        from: "agent",
        to: "tool",
        type: "call",
      },
      onClose: () => undefined,
    }));

    expect(markup).toContain('<time dateTime="2026-08-29T00:04:01.954" title="2026-08-29 00:04:01.954">00:04:01</time>');
    expect(markup).not.toContain('<time dateTime="2026-08-29T00:04:05.000">');
  });

  it("renders collaboration dispatch and wait with explicit wait semantics", () => {
    const markup = renderToStaticMarkup(createElement(ExecutionReplay, {
      items: [
        event(1, "agentMessage"),
        event(2, "collabAgentToolCall", { tool: "spawnAgent", receiverThreadIds: ["child-1"] }),
        event(3, "collabAgentToolCall", {
          tool: "wait",
          receiverThreadIds: ["child-1"],
          result: { message: "Wait timed out.", timed_out: true },
        }),
      ],
    }));

    expect(markup).toContain("Subagents ×2");
    expect(markup).toContain('vbg-custom-replay-action--subagent');
    expect(markup).toContain('vbg-custom-replay-action__label">Fork</span>');
    expect(markup).toContain('vbg-custom-replay-action__label">Wait</span>');
    expect(markup).toContain("Timed out");
  });

  it("labels multiple collaboration forks as a parallel dispatch", () => {
    const markup = renderToStaticMarkup(createElement(ExecutionReplay, {
      items: [
        event(1, "agentMessage"),
        event(2, "collabAgentToolCall", { tool: "spawnAgent", receiverThreadIds: ["child-1"] }),
        event(3, "collabAgentToolCall", { tool: "spawnAgent", receiverThreadIds: ["child-2"] }),
        event(4, "collabAgentToolCall", { tool: "wait", receiverThreadIds: ["child-1", "child-2"] }),
      ],
    }));

    expect(markup).toContain("Parallel dispatch ×2");
    expect(markup).toContain("fork join");
  });
});

function lifecycleEvent(seq: number, method: string, itemId: string, status: TraceEvent["status"]): TraceEvent {
  return {
    ...event(seq, "commandExecution", { command: itemId }),
    at: "2026-01-01T00:00:00.000Z",
    method,
    itemId,
    status,
  };
}

function event(seq: number, type: string, raw: Record<string, unknown> = {}): TraceEvent {
  return {
    seq,
    at: `2026-01-01T00:00:${String(seq).padStart(2, "0")}.000Z`,
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
