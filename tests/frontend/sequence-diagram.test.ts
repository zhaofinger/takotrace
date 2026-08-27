import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FlowEvent } from "../../src/web/components/InteractionFlow";
import { SequenceDiagram } from "../../src/web/components/SequenceDiagram";

function createEvent(type: string, raw: unknown, overrides: Partial<FlowEvent> = {}): FlowEvent {
  return {
    seq: 1,
    at: "2026-01-01T00:00:00.000Z",
    method: "item/completed",
    type,
    status: "completed",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-1",
    summary: "item completed",
    raw,
    ...overrides,
  };
}

describe("SequenceDiagram Component", () => {
  const sampleItems: FlowEvent[] = [
    createEvent("userMessage", { content: [{ type: "text", text: "What is the status?" }] }, {
      seq: 1,
      itemId: "item-1",
      at: "2026-01-01T00:00:00.000Z",
    }),
    createEvent("commandExecution", { command: "git status" }, {
      seq: 2,
      itemId: "item-2",
      at: "2026-01-01T00:00:01.000Z",
      durationMs: 150,
    }),
    createEvent("agentMessage", { text: "Branch is clean.", meta: "final_answer" }, {
      seq: 3,
      itemId: "item-3",
      at: "2026-01-01T00:00:02.000Z",
    }),
  ];

  it("renders empty state when items are empty", () => {
    const markup = renderToStaticMarkup(createElement(SequenceDiagram, { items: [] }));
    expect(markup).toContain("No sequence events to display");
  });

  it("renders participants and sequence steps", () => {
    const markup = renderToStaticMarkup(createElement(SequenceDiagram, { items: sampleItems }));
    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-checked="false"');
    expect(markup).toContain('aria-label="Show all sequence steps"');
    expect(markup).toContain("3 / 3");
    expect(markup).toContain("Copy Mermaid");
    expect(markup).toContain("User");
    expect(markup).toContain("Agent");
    expect(markup).toContain("Tools");
    expect(markup).toContain("vbg-custom-sequence__workspace");
    expect(markup).toContain("vbg-custom-sequence__step-row");
    expect(markup).toContain("git status");
  });

  it("hides reasoning by default and exposes the full-step count", () => {
    const items = [
      sampleItems[0],
      createEvent("reasoning", { summary: ["Thinking through the request"] }, {
        seq: 2,
        itemId: "reasoning-1",
      }),
    ];
    const markup = renderToStaticMarkup(createElement(SequenceDiagram, { items }));

    expect(markup).toContain("1 / 2");
    expect(markup).not.toContain("Thinking through the request");
  });

  it("renders compact shell command titles without hiding failure state", () => {
    const command = '/bin/zsh -lc "zsh -lc \\"rg -n sequence src/web\\""';
    const markup = renderToStaticMarkup(createElement(SequenceDiagram, {
      items: [createEvent("commandExecution", { command }, { status: "failed" })],
    }));

    expect(markup).toContain("rg -n sequence src/web");
    expect(markup).toContain("failed");
  });
});
