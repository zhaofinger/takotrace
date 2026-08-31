import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ExecutionInspector,
  restoreFocusAfterInspectorClose,
} from "../../src/web/components/ExecutionInspector";
import type { FlowEvent } from "../../src/web/components/InteractionFlow";
import {
  nextSequenceStepIndex,
  SequenceDiagram,
} from "../../src/web/components/SequenceDiagram";
import { buildSequenceDiagramModel } from "../../src/web/components/sequence-diagram-model";

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
    expect(markup).not.toContain("Show all");
    expect(markup).not.toContain('role="switch"');
    expect(markup).not.toContain("vbg-custom-sequence__toolbar");
    expect(markup).toContain("Copy Mermaid");
    expect(markup).toContain("User");
    expect(markup).toContain("Agent");
    expect(markup).toContain("Tools");
    expect(markup).toContain("vbg-custom-sequence__workspace");
    expect(markup).toContain("vbg-custom-sequence__step-row");
    expect(markup).toContain("vbg-custom-sequence__step-row--role-user");
    expect(markup).toContain("vbg-custom-sequence__step-row--role-tool");
    expect(markup).toContain("vbg-custom-sequence__step-row--role-agent");
    expect(markup).toContain("vbg-custom-sequence__step-icon");
    expect(markup).toContain(">git status</strong>");
    expect(markup).toContain('data-tooltip="Shell · git status"');
    expect(markup.match(/tabindex="0"/g)).toHaveLength(1);
    expect(markup.match(/tabindex="-1"/g)).toHaveLength(2);
  });

  it("labels child-run messages as communication with the parent agent", () => {
    const markup = renderToStaticMarkup(createElement(SequenceDiagram, {
      items: sampleItems,
      scope: "subagent",
    }));

    expect(markup).toContain("Parent Agent");
    expect(markup).toContain("Current worker");
    expect(markup).toContain("Subagent");
    expect(markup).toContain("Parent Agent to Subagent");
    expect(markup).toContain("Subagent to Parent Agent");
    expect(markup).not.toContain(">User</strong>");
  });

  it("moves step selection with vertical navigation keys without wrapping", () => {
    expect(nextSequenceStepIndex(1, 4, "ArrowUp")).toBe(0);
    expect(nextSequenceStepIndex(1, 4, "ArrowDown")).toBe(2);
    expect(nextSequenceStepIndex(0, 4, "ArrowUp")).toBe(0);
    expect(nextSequenceStepIndex(3, 4, "ArrowDown")).toBe(3);
    expect(nextSequenceStepIndex(2, 4, "Home")).toBe(0);
    expect(nextSequenceStepIndex(1, 4, "End")).toBe(3);
    expect(nextSequenceStepIndex(1, 4, "ArrowRight")).toBeNull();
  });

  it("makes lifecycle parallelism visible in the sequence UI", () => {
    const markup = renderToStaticMarkup(createElement(SequenceDiagram, { items: [
      { ...sampleItems[1], seq: 1, itemId: "first", method: "item/started", status: "running", at: "2026-01-01T00:00:00.000Z" },
      { ...sampleItems[1], seq: 2, itemId: "second", method: "item/started", status: "running", at: "2026-01-01T00:00:00.000Z" },
      { ...sampleItems[1], seq: 3, itemId: "second", method: "item/completed", status: "completed", at: "2026-01-01T00:00:00.000Z" },
      { ...sampleItems[1], seq: 4, itemId: "first", method: "item/completed", status: "completed", at: "2026-01-01T00:00:00.000Z" },
    ] }));

    expect(markup).toContain("Parallel ×2");
    expect(markup.match(/vbg-custom-sequence__step-row--parallel(?:\s|")/g)).toHaveLength(2);
  });

  it("always renders reasoning without a density control", () => {
    const items = [
      sampleItems[0],
      createEvent("reasoning", { summary: ["Thinking through the request"] }, {
        seq: 2,
        itemId: "reasoning-1",
      }),
    ];
    const markup = renderToStaticMarkup(createElement(SequenceDiagram, { items }));

    expect(markup).not.toContain("Show all");
    expect(markup).toContain("Step 2: Think &amp; Plan - Reasoning");
    expect(markup.match(/vbg-custom-sequence__step-row--role-/g)).toHaveLength(2);
  });

  it("renders compact shell command titles without hiding failure state", () => {
    const command = '/bin/zsh -lc "zsh -lc \\"rg -n sequence src/web\\""';
    const markup = renderToStaticMarkup(createElement(SequenceDiagram, {
      items: [createEvent("commandExecution", { command }, { status: "failed" })],
    }));

    expect(markup).toContain(">rg -n sequence src/web</strong>");
    expect(markup).toContain("vbg-custom-sequence__step-row--status-failed");
    expect(markup).toContain("failed");
  });

  it("uses an icon and compact name for inferred skill loads", () => {
    const markup = renderToStaticMarkup(createElement(SequenceDiagram, {
      items: [createEvent("commandExecution", {
        command: ["/bin/zsh", "-lc", "cat /Users/bytedance/.agents/skills/read/SKILL.md"],
        parsed_cmd: [{ type: "read", path: "/Users/bytedance/.agents/skills/read/SKILL.md" }],
      })],
    }));

    expect(markup).toContain("vbg-custom-sequence__step-icon");
    expect(markup).toContain(">read</strong>");
    expect(markup).toContain('data-tooltip="Skill load · read (inferred)"');
  });

  it("uses an icon and compact action for Browser MCP executions", () => {
    const markup = renderToStaticMarkup(createElement(SequenceDiagram, {
      items: [createEvent("mcpToolCall", {
        server: "node_repl",
        tool: "js",
        arguments: {
          title: "Inspect the page",
          code: "await browser.tabs.list()",
        },
      })],
    }));

    expect(markup).toContain("vbg-custom-sequence__step-icon");
    expect(markup).toContain(">Inspect the page</strong>");
    expect(markup).toContain('data-tooltip="Browser · Inspect the page"');
  });

  it("organizes step details into focused inspector tabs", () => {
    const [step] = buildSequenceDiagramModel([
      createEvent("commandExecution", {
        command: "git status",
        cwd: "/workspace",
        aggregatedOutput: "working tree clean",
        exitCode: 0,
      }),
    ]).steps;
    const markup = renderToStaticMarkup(createElement(ExecutionInspector, {
      item: {
        seq: step.seq,
        kind: step.node.kind,
        title: step.displayTitle,
        fullTitle: step.detailTitle,
        detail: step.detail,
        status: step.status,
        durationMs: step.durationMs,
        at: step.at,
        from: step.from,
        to: step.toLabel ?? step.to,
        type: step.type,
        event: step.event,
      },
      onClose: () => undefined,
    }));

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('role="tab"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain("Overview");
    expect(markup).toContain("Raw event");
    expect(markup).toContain("TOOL");
    expect(markup).toContain(`<strong title="${step.detailTitle}">${step.displayTitle}</strong>`);
    expect(markup).toContain('role="tabpanel"');
    expect(markup).toContain('autofocus=""');
    expect(markup).toContain("Content");
    expect(markup).toContain("working tree clean");
  });

  it("restores focus to the selected step after the inspector closes", () => {
    const focus = vi.fn();
    const getElementById = vi.fn(() => ({ focus }));
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("document", { getElementById });
    vi.stubGlobal("window", { requestAnimationFrame });

    restoreFocusAfterInspectorClose("sequence-step-2");

    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    expect(getElementById).toHaveBeenCalledWith("sequence-step-2");
    expect(focus).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("keeps a subagent drawer to basic timing, input, and result information", () => {
    const subagentEvent = createEvent("collabAgentToolCall", {
      tool: "spawnAgent",
      prompt: "Inspect the layout",
      receiverThreadIds: ["child-1"],
    });
    const markup = renderToStaticMarkup(createElement(ExecutionInspector, {
      item: {
        seq: 4,
        kind: "subagent",
        title: "Started · layout_review",
        detail: "Started · layout_review",
        status: "completed",
        durationMs: 25,
        at: subagentEvent.at,
        from: "agent",
        to: "subagent",
        type: "call",
        event: subagentEvent,
      },
      onClose: () => undefined,
      subagentView: "sequence",
    }));

    expect(markup).toContain('aria-label="Execution timing"');
    expect(markup).toContain("<dt>Started</dt>");
    expect(markup).toContain("<dt>Event latency</dt><dd>25ms</dd>");
    expect(markup).toContain("Loading assigned task and result…");
    expect(markup).not.toContain('role="tablist"');
    expect(markup).not.toContain("Raw event");
    expect(markup).not.toContain("Direction");
    expect(markup).not.toContain("Type");
    expect(markup).not.toContain("Content");
  });
});
