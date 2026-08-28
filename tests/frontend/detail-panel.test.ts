import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DetailPanel, formatDuration, formatTokenCount } from "../../src/web/components/DetailPanel";

describe("DetailPanel polish", () => {
  it("formats durations for quick scanning while preserving short values", () => {
    expect(formatDuration()).toBe("—");
    expect(formatDuration(420)).toBe("420ms");
    expect(formatDuration(61_000)).toBe("1m 1s");
    expect(formatDuration(3_609_000)).toBe("1h 0m 9s");
  });

  it("formats token counts for compact scanning", () => {
    expect(formatTokenCount(999)).toBe("999");
    expect(formatTokenCount(1_500)).toBe("1.5K");
    expect(formatTokenCount(2_000_000)).toBe("2M");
  });

  it("exposes a single keyboard tab stop for the active detail tab", () => {
    const markup = renderToStaticMarkup(createElement(DetailPanel, {}));
    expect(markup).toContain('id="turn-trace-tab"');
    expect(markup).toContain('id="turn-sequence-tab"');
    expect(markup).toContain('id="turn-json-tab"');
    expect(markup).not.toContain('id="turn-events-tab"');
    const tabs = markup.match(/<button[^>]+role="tab"[^>]*>/g) ?? [];
    expect(tabs.filter((tab) => tab.includes('tabindex="0"'))).toHaveLength(1);
    expect(tabs.filter((tab) => tab.includes('tabindex="-1"'))).toHaveLength(2);
  });

  it("renders a lightweight wrapping summary without the repeated thread id", () => {
    const markup = renderToStaticMarkup(createElement(DetailPanel, {
      turn: {
        id: "turn-full-id",
        status: "completed",
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:01.000Z",
        items: [],
      },
    }));

    expect(markup).toContain('class="vbg-custom-turn-summary"');
    expect(markup).toContain('class="vbg-custom-turn-overview"');
    expect(markup).toContain('class="vbg-custom-turn-summary__utilities"');
    expect(markup).toContain('class="vbg-custom-turn-overview vbg-custom-turn-overview--utilities"');
    expect(markup).toContain('<dt>Status</dt>');
    expect(markup).toContain('<dt>Started</dt>');
    expect(markup).toContain('<dt>Duration</dt>');
    expect(markup).toContain('<dt>Steps</dt>');
    expect(markup).toContain('<dt>Run</dt>');
    expect(markup).not.toContain('<dt>Ended</dt>');
    expect(markup).not.toContain('<dt>Thread</dt>');
    expect(markup).toContain('title="turn-full-id"');
    expect(markup).toContain('<code aria-label="Run turn-full-id" title="turn-full-id">turn-ful…</code>');
    expect(markup).toContain('aria-label="Copy run ID"');
    expect(markup).toContain('class="vbg-custom-id-copy"');
    expect(markup).not.toContain('<details');
    expect(markup).not.toContain('vbg-custom-turn-meta-line');
  });

  it("keeps the full-detail loading state out of the visible layout", () => {
    const markup = renderToStaticMarkup(createElement(DetailPanel, {
      isLoading: true,
      turn: {
        id: "turn-1",
        status: "completed",
        items: [],
      },
    }));

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('class="vbg-custom-sr-only" role="status">Loading full run detail…</span>');
    expect(markup).not.toContain('class="vbg-custom-detail-state">Loading full run detail…</p>');
  });

  it("shows the selected turn token breakdown with exact values", () => {
    const markup = renderToStaticMarkup(createElement(DetailPanel, {
      turn: {
        id: "turn-usage",
        status: "completed",
        items: [],
        tokenUsage: {
          inputTokens: 18_500,
          cachedInputTokens: 12_000,
          cacheWriteInputTokens: 1_250,
          outputTokens: 2_000,
          reasoningOutputTokens: 750,
          totalTokens: 20_500,
        },
      },
    }));

    expect(markup).toContain('aria-labelledby="turn-token-usage-heading"');
    expect(markup).toContain('<span id="turn-token-usage-heading">Token usage</span>');
    expect(markup).toContain('<details>');
    expect(markup).toContain('<summary>');
    expect(markup).toContain('<dt>Input</dt>');
    expect(markup).toContain('<dt>Cached</dt>');
    expect(markup).toContain('<dt>Cache write</dt>');
    expect(markup).toContain('<dt>Output</dt>');
    expect(markup).toContain('<dt>Reasoning</dt>');
    expect(markup).not.toContain('<dt>Total</dt>');
    expect(markup).toContain('aria-label="18,500 input tokens"');
    expect(markup).toContain('aria-label="20,500 total tokens" title="20,500 tokens">20.5K</strong>');
    expect(markup).toContain('class="vbg-custom-turn-token-usage__disclosure"');
  });

  it("omits empty token UI and zero cache-write usage", () => {
    const withoutUsage = renderToStaticMarkup(createElement(DetailPanel, {
      turn: { id: "turn-empty", status: "completed", items: [] },
    }));
    const withoutCacheWrite = renderToStaticMarkup(createElement(DetailPanel, {
      turn: {
        id: "turn-no-cache-write",
        status: "completed",
        items: [],
        tokenUsage: {
          inputTokens: 100,
          cachedInputTokens: 0,
          cacheWriteInputTokens: 0,
          outputTokens: 20,
          reasoningOutputTokens: 0,
          totalTokens: 120,
        },
      },
    }));

    expect(withoutUsage).not.toContain('turn-token-usage-heading');
    expect(withoutCacheWrite).not.toContain('<dt>Cache write</dt>');
  });
});
