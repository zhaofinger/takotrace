import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ExecutionReplay from "../../src/web/components/ExecutionReplay.js";
import type { TraceEvent } from "../../src/web/types.js";

describe("ExecutionReplay waterfall", () => {
  it("does not render an empty overview axis", () => {
    const markup = renderToStaticMarkup(createElement(ExecutionReplay, { items: [] }));

    expect(markup).not.toContain('aria-label="Trace overview"');
    expect(markup).not.toContain("Width = relative duration");
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
    expect(markup).toContain('class="vbg-custom-replay-overview__sequence"');
    expect(markup).toContain('marker-end="url(#vbg-replay-arrow)"');
    expect(markup).toContain("Sequence");
    expect(markup).toContain("Width = relative duration");
    expect(markup).toContain("<i>3</i>");
    expect(markup).toContain('aria-label="Overview scale"');
    expect(markup).toContain('class="vbg-custom-replay-overview__bar vbg-custom-replay-overview__bar--tool"');
    expect(markup).toMatch(/vbg-custom-replay-overview__bar[^>]+width:max\(6px, [\d.]+%\)/);
    const overviewWidths = [...markup.matchAll(/width:max\(6px, ([\d.]+)%\)/g)].map((match) => Number(match[1]));
    expect(new Set(overviewWidths).size).toBeGreaterThan(1);
    expect(markup).toContain("Tool · npm test · 3.0s");
    expect(markup).toContain("Timeline");
    expect(markup).not.toContain("<span>Input</span>");
  });

  it("falls back to sequence when events share the same timestamp", () => {
    const items = [
      event(1, "userMessage"),
      event(2, "agentMessage"),
      event(3, "commandExecution", { command: "pwd" }),
    ].map((item) => ({ ...item, at: "2026-01-01T00:00:00.000Z" }));
    const markup = renderToStaticMarkup(createElement(ExecutionReplay, { items }));

    expect(markup).toContain("Sequence");
    expect(markup).toContain('disabled=""');
    expect(markup).toContain("Lifecycle timing is unavailable");
    expect(markup).toContain("Width = relative duration");
  });

  it("labels actions without lifecycle timing as order only", () => {
    const markup = renderToStaticMarkup(createElement(ExecutionReplay, {
      items: [event(1, "agentMessage"), event(2, "commandExecution", { command: "pwd" })],
    }));

    expect(markup).toContain("Order only");
    expect(markup).not.toContain('vbg-custom-replay-action__duration');
    expect(markup).not.toContain("Parallel");
  });

  it("keeps large completed executions collapsed by default", () => {
    const markup = renderToStaticMarkup(createElement(ExecutionReplay, {
      items: [
        event(1, "agentMessage"),
        event(2, "commandExecution", { command: "one" }),
        event(3, "commandExecution", { command: "two" }),
        event(4, "commandExecution", { command: "three" }),
        event(5, "commandExecution", { command: "four" }),
      ],
    }));

    expect(markup).toContain("4 actions");
    expect(markup).toContain('<details class="vbg-custom-replay-execution">');
    expect(markup).not.toContain('<details class="vbg-custom-replay-execution" open="">');
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

  it("renders an MCP result disclosure inside the full-width action detail", () => {
    const markup = renderToStaticMarkup(createElement(ExecutionReplay, {
      items: [
        event(1, "agentMessage"),
        event(2, "mcpToolCall", {
          tool: "node_repl",
          result: { content: [{ type: "text", text: "done" }] },
        }),
      ],
    }));

    expect(markup).toContain('class="vbg-custom-replay-action__detail"');
    expect(markup).toContain("Result · 1 block");
    expect(markup).toContain("done");
  });

  it("renders collaboration dispatch and wait as fork and join lanes", () => {
    const markup = renderToStaticMarkup(createElement(ExecutionReplay, {
      items: [
        event(1, "agentMessage"),
        event(2, "collabAgentToolCall", { tool: "spawnAgent", receiverThreadIds: ["child-1"] }),
        event(3, "collabAgentToolCall", { tool: "wait", receiverThreadIds: ["child-1"] }),
      ],
    }));

    expect(markup).toContain("Subagents ×2");
    expect(markup).toContain('vbg-custom-replay-action--subagent');
    expect(markup).toContain('vbg-custom-replay-action__label">Fork</span>');
    expect(markup).toContain('vbg-custom-replay-action__label">Join</span>');
  });
});

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
