import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DetailPanel, formatDuration } from "../../src/web/components/DetailPanel";

describe("DetailPanel polish", () => {
  it("formats durations for quick scanning while preserving short values", () => {
    expect(formatDuration()).toBe("—");
    expect(formatDuration(420)).toBe("420ms");
    expect(formatDuration(61_000)).toBe("1m 1s");
    expect(formatDuration(3_609_000)).toBe("1h 0m 9s");
  });

  it("exposes a single keyboard tab stop for the active detail tab", () => {
    const markup = renderToStaticMarkup(createElement(DetailPanel, {}));
    expect(markup).toContain('id="turn-trace-tab"');
    expect(markup).toContain('id="turn-events-tab"');
    const tabs = markup.match(/<button[^>]+role="tab"[^>]*>/g) ?? [];
    expect(tabs.filter((tab) => tab.includes('tabindex="0"'))).toHaveLength(1);
    expect(tabs.filter((tab) => tab.includes('tabindex="-1"'))).toHaveLength(2);
  });

  it("renders metadata as a persistent single-line strip", () => {
    const markup = renderToStaticMarkup(createElement(DetailPanel, {
      threadId: "thread-full-id",
      turn: {
        id: "turn-full-id",
        status: "completed",
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:01.000Z",
        items: [],
      },
    }));

    expect(markup).toContain('class="vbg-custom-turn-meta-line"');
    expect(markup).toContain('<dt>Ended</dt>');
    expect(markup).toContain('title="thread-full-id"');
    expect(markup).toContain('title="turn-full-id"');
    expect(markup).not.toContain('<details');
    expect(markup.indexOf('vbg-custom-turn-meta-line')).toBeLessThan(markup.indexOf('vbg-custom-turn-overview'));
  });

  it("keeps the full-detail loading state out of the visible layout", () => {
    const markup = renderToStaticMarkup(createElement(DetailPanel, {
      isLoading: true,
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        status: "completed",
        items: [],
      },
    }));

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('class="vbg-custom-sr-only" role="status">Loading full turn detail…</span>');
    expect(markup).not.toContain('class="vbg-custom-detail-state">Loading full turn detail…</p>');
  });
});
