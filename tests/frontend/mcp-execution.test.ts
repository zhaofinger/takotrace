import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EventDetails } from "../../src/web/components/EventDetails";
import { nodeReplExecution } from "../../src/web/components/mcp-execution";
import type { TraceEvent } from "../../src/web/types";

describe("nodeReplExecution", () => {
  it("prefers explicit Browser and Computer Use result metadata", () => {
    expect(nodeReplExecution(call({
      title: "Inspect the page",
      code: "console.log('ambiguous')",
    }, "browserUse"))).toMatchObject({
      kind: "browser",
      displayTitle: "Browser · Inspect the page",
      source: "metadata",
    });
    expect(nodeReplExecution(call({
      title: "Inspect Finder",
      code: "console.log('ambiguous')",
    }, "computerUse"))).toMatchObject({
      kind: "computer-use",
      displayTitle: "Computer Use · Inspect Finder",
      source: "metadata",
    });
  });

  it("uses conservative code signals when older events lack surface metadata", () => {
    expect(nodeReplExecution(call({
      title: "Open the app",
      code: "const tab = await browser.tabs.new(); await tab.goto('http://localhost')",
    }))).toMatchObject({ kind: "browser", source: "code" });
    expect(nodeReplExecution(call({
      title: "Scroll the page",
      code: "await tab.cua.scroll({ deltaY: 500 })",
    }))).toMatchObject({ kind: "browser", source: "code" });
    expect(nodeReplExecution(call({
      title: "Open a browser tab",
      code: "const tab = await agent.browsers.create({ target: 'host' })",
    }))).toMatchObject({ kind: "browser", source: "code" });
    expect(nodeReplExecution(call({
      title: "Read Finder",
      code: "const state = await sky.get_app_state({ app: 'Finder' })",
    }))).toMatchObject({ kind: "computer-use", source: "code" });
  });

  it("falls back to JavaScript without guessing from the action title", () => {
    expect(nodeReplExecution(call({
      title: "Open the browser report",
      code: "const total = [1, 2, 3].reduce((sum, value) => sum + value, 0)",
    }))).toMatchObject({
      kind: "javascript",
      displayTitle: "JavaScript · Open the browser report",
      source: "fallback",
    });
    expect(nodeReplExecution({ server: "browser", tool: "click" })).toBeUndefined();
  });

  it("shows the classified execution while retaining the raw MCP runtime", () => {
    const raw = call({
      title: "Inspect the page",
      code: "await tab.playwright.domSnapshot()",
    });
    const event: TraceEvent = {
      seq: 1,
      at: "2026-08-27T00:00:00.000Z",
      method: "item/completed",
      type: "mcpToolCall",
      status: "completed",
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      summary: "item completed",
      raw,
    };
    const markup = renderToStaticMarkup(createElement(EventDetails, { event, fallback: "fallback" }));

    expect(markup).toContain("<dt>Execution</dt><dd>Browser (inferred)</dd>");
    expect(markup).toContain("<dt>Server</dt><dd>node_repl</dd>");
    expect(markup).toContain("<dt>Tool</dt><dd>js</dd>");
  });
});

function call(argumentsValue: Record<string, unknown>, surfaceKind?: string): Record<string, unknown> {
  return {
    server: "node_repl",
    tool: "js",
    arguments: argumentsValue,
    ...(surfaceKind ? {
      result: { _meta: { "codex/toolSurface": { kind: surfaceKind } } },
    } : {}),
  };
}
