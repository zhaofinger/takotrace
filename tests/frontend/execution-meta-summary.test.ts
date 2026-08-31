import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExecutionMetaSummary } from "../../src/web/components/ExecutionMetaSummary";

describe("ExecutionMetaSummary", () => {
  it("presents compact timing, direction, and type metadata", () => {
    const markup = renderToStaticMarkup(createElement(ExecutionMetaSummary, {
      duration: "0ms",
      from: "user",
      startedAt: "2026-08-27T11:12:13.251Z",
      startedAtLabel: "19:12:13",
      startedAtTitle: "2026-08-27 19:12:13.251",
      to: "agent",
      type: "call",
    }));

    expect(markup).toContain('aria-label="Execution from user to agent"');
    expect(markup).toContain('class="vbg-custom-execution-meta__route"');
    expect(markup).toContain("<code title=\"user\">user</code>");
    expect(markup).toContain("<code title=\"agent\">agent</code>");
    expect(markup).toContain('class="vbg-custom-execution-meta__type">call</span>');
    expect(markup).toContain('<time dateTime="2026-08-27T11:12:13.251Z" title="2026-08-27 19:12:13.251">19:12:13</time>');
    expect(markup.indexOf("Started")).toBeLessThan(markup.indexOf("Direction"));
    expect(markup).toContain("<dt>Duration</dt><dd>0ms</dd>");
    expect(markup).toContain("<dt>Type</dt>");
  });

  it("supports a more precise duration label", () => {
    const markup = renderToStaticMarkup(createElement(ExecutionMetaSummary, {
      duration: "0ms",
      durationLabel: "Event latency",
      startedAt: "2026-01-01T00:00:00.000Z",
      startedAtLabel: "2026-01-01 00:00:00.000",
    }));

    expect(markup).toContain("<dt>Event latency</dt><dd>0ms</dd>");
  });

  it("can present timing-only metadata for a compact subagent summary", () => {
    const markup = renderToStaticMarkup(createElement(ExecutionMetaSummary, {
      duration: "25ms",
      startedAt: "2026-08-27T11:12:13.251Z",
      startedAtLabel: "19:12:13.251",
    }));

    expect(markup).toContain('aria-label="Execution timing"');
    expect(markup).toContain("<dt>Started</dt>");
    expect(markup).toContain("<dt>Duration</dt><dd>25ms</dd>");
    expect(markup).not.toContain("Direction");
    expect(markup).not.toContain("Type");
  });
});
