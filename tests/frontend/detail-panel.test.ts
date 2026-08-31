import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DetailPanel,
  formatDuration,
  formatTokenCount,
  subagentNavigation,
  tokenBreakdownMetrics,
} from "../../src/web/components/DetailPanel";

describe("DetailPanel polish", () => {
  it("opens subagent details in the source view and restores its selection id", () => {
    expect(subagentNavigation("trace", "event-7")).toEqual({
      sourceSelectionId: "event-7",
      tab: "trace",
    });
    expect(subagentNavigation("sequence", "event-7")).toEqual({
      sourceSelectionId: "seq-event-7",
      tab: "sequence",
    });
  });

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
    expect(tabs[0]).toContain('id="turn-trace-tab"');
    expect(tabs[1]).toContain('id="turn-sequence-tab"');
    expect(tabs.filter((tab) => tab.includes('tabindex="0"'))).toHaveLength(1);
    expect(tabs.filter((tab) => tab.includes('tabindex="-1"'))).toHaveLength(2);
  });

  it("renders a compact single-line summary without the repeated thread id", () => {
    const markup = renderToStaticMarkup(createElement(DetailPanel, {
      turn: {
        id: "turn-full-id",
        status: "completed",
        model: "gpt-5.6-sol",
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:01.000Z",
        items: [],
      },
    }));

    expect(markup).toContain('class="vbg-custom-turn-summary"');
    expect(markup).toContain('class="vbg-custom-turn-overview"');
    expect(markup).toContain('class="vbg-custom-turn-summary__utilities"');
    expect(markup).toContain('class="vbg-custom-run-identity"');
    expect(markup).not.toContain('vbg-custom-turn-overview--utilities');
    expect(markup).toContain('<dt>Status</dt>');
    expect(markup).toContain('<dt>Model</dt>');
    expect(markup).toContain('class="vbg-custom-model-name" title="gpt-5.6-sol">gpt-5.6-sol</code>');
    expect(markup).toContain('<dt>Started</dt>');
    expect(markup).toContain('<time dateTime="2026-01-01T00:00:00.000Z" title=');
    expect(markup).not.toContain('>2026-01-01T00:00:00.000Z</time>');
    expect(markup).toContain('<dt>Duration</dt>');
    expect(markup).toContain('<dt>Steps</dt>');
    expect(markup).not.toContain('<dt>Run</dt>');
    expect(markup).not.toContain('<dt>Ended</dt>');
    expect(markup).not.toContain('<dt>Thread</dt>');
    expect(markup).toContain('title="turn-full-id"');
    expect(markup).toContain('<code aria-label="Run turn-full-id" class="vbg-custom-compact-id" title="turn-full-id">turn-ful…</code>');
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

  it("omits the model fact when the run did not record one", () => {
    const markup = renderToStaticMarkup(createElement(DetailPanel, {
      turn: { id: "turn-without-model", status: "completed", items: [] },
    }));

    expect(markup).not.toContain("<dt>Model</dt>");
  });

  it("renders a compact token trigger and exposes ordered detail metrics", () => {
    const usage = {
      inputTokens: 18_500,
      cachedInputTokens: 12_000,
      cacheWriteInputTokens: 1_250,
      outputTokens: 2_000,
      reasoningOutputTokens: 750,
      totalTokens: 20_500,
    };
    const markup = renderToStaticMarkup(createElement(DetailPanel, {
      turn: {
        id: "turn-usage",
        status: "completed",
        items: [],
        tokenUsage: usage,
      },
    }));

    expect(markup).toContain('<section aria-label="Token usage"');
    expect(markup).toContain('aria-controls="turn-token-usage-popover"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-label="Token usage, 20,500 total tokens"');
    expect(markup).toContain('<strong>20.5K</strong>');
    expect(markup).toContain('class="vbg-custom-turn-token-usage__label">tokens</span>');
    expect(markup).toContain('class="vbg-custom-turn-token-usage__disclosure"');
    expect(markup).not.toContain('<details');
    expect(markup).not.toContain('<dt>Input</dt>');
    expect(tokenBreakdownMetrics(usage)).toEqual([
      { key: "inputTokens", label: "Input", value: 18_500 },
      { key: "outputTokens", label: "Output", value: 2_000 },
      { key: "cachedInputTokens", label: "Cached", value: 12_000 },
      { key: "reasoningOutputTokens", label: "Reasoning", value: 750 },
      { key: "cacheWriteInputTokens", label: "Cache write", value: 1_250 },
    ]);
  });

  it("omits empty token UI and zero cache-write usage", () => {
    const withoutUsage = renderToStaticMarkup(createElement(DetailPanel, {
      turn: { id: "turn-empty", status: "completed", items: [] },
    }));
    const metrics = tokenBreakdownMetrics({
      inputTokens: 100,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 20,
      reasoningOutputTokens: 0,
      totalTokens: 120,
    });

    expect(withoutUsage).not.toContain('aria-label="Token usage"');
    expect(metrics).not.toContainEqual(expect.objectContaining({ label: "Cache write" }));
  });
});
