import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExecutionMetaSummary } from "../../src/web/components/ExecutionMetaSummary";

describe("ExecutionMetaSummary", () => {
  it("prioritizes execution direction before timing details", () => {
    const markup = renderToStaticMarkup(createElement(ExecutionMetaSummary, {
      duration: "0ms",
      from: "user",
      startedAt: "2026-08-27T11:12:13.251Z",
      startedAtLabel: "19:12:13.251",
      to: "agent",
      type: "call",
    }));

    expect(markup).toContain('aria-label="Execution from user to agent"');
    expect(markup).toContain('class="vbg-custom-execution-meta__route"');
    expect(markup).toContain("<code title=\"user\">user</code>");
    expect(markup).toContain("<code title=\"agent\">agent</code>");
    expect(markup).toContain('class="vbg-custom-execution-meta__type">call</span>');
    expect(markup).toContain('<time dateTime="2026-08-27T11:12:13.251Z">19:12:13.251</time>');
    expect(markup.indexOf("Direction")).toBeLessThan(markup.indexOf("Started"));
    expect(markup).toContain("<dt>Duration</dt><dd>0ms</dd>");
  });
});
