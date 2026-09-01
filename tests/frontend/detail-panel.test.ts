import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DetailPanel,
  tokenBreakdownMetrics,
} from "../../src/web/components/DetailPanel";
import { ContextDetails, contextSections } from "../../src/web/components/ContextDetails";
import { formatDuration, formatTokenCount } from "../../src/web/formatters";

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
    expect(markup).toContain(">Trace</button>");
    expect(markup).not.toContain(">Sequence</button>");
    expect(markup).not.toContain('id="turn-trace-tab"');
    expect(markup).toContain('id="turn-sequence-tab"');
    expect(markup).toContain('id="turn-context-tab"');
    expect(markup).toContain('id="turn-json-tab"');
    expect(markup).not.toContain('id="turn-events-tab"');
    const tabs = markup.match(/<button[^>]+role="tab"[^>]*>/g) ?? [];
    expect(tabs[0]).toContain('id="turn-sequence-tab"');
    expect(tabs[1]).toContain('id="turn-context-tab"');
    expect(tabs[2]).toContain('id="turn-json-tab"');
    expect(tabs.filter((tab) => tab.includes('tabindex="0"'))).toHaveLength(1);
    expect(tabs.filter((tab) => tab.includes('tabindex="-1"'))).toHaveLength(2);
  });

  it('groups recorded run context without losing long instruction text', () => {
    const longInstructions = 'Follow this instruction. '.repeat(300);
    const context = {
      source: 'rollout-file' as const,
      session: {
        base_instructions: longInstructions,
        cli_version: '0.150.0',
        git: { branch: 'codex/context-view' },
      },
      worldState: {
        agents_md: { text: 'Project rules' },
        permissions: { filesystem: 'workspace-write' },
      },
      turn: {
        cwd: '/tmp/project',
        model: 'gpt-5.6-sol',
        effort: 'high',
        approval_policy: 'never',
        summary: 'Compacted context summary',
      },
    };
    const sections = contextSections(context);
    const markup = renderToStaticMarkup(createElement(ContextDetails, { context }));

    expect(sections.map((section) => section.title)).toEqual([
      'Instructions', 'Environment', 'Permissions', 'Runtime', 'Context management',
    ]);
    expect(markup).toContain('Run context');
    expect(markup).toContain('Local rollout');
    expect(markup).toContain('Base instructions');
    expect(markup).toContain('Follow this instruction.');
    expect(markup).not.toContain('[truncated');
    expect(markup).toContain('Compacted context summary');
  });

  it('states when a provider did not record local context', () => {
    const markup = renderToStaticMarkup(createElement(ContextDetails, {}));
    expect(markup).toContain('No local context recorded');
    expect(markup).toContain('did not expose a context snapshot');
  });

  it('renders Claude live capabilities and context usage with an honest source label', () => {
    const context = {
      source: 'claude-live' as const,
      session: { cwd: '/tmp/project', model: 'claude-sonnet-4-6', claude_code_version: '2.1.0' },
      worldState: {
        permission_mode: 'default',
        tools: ['Read', 'Edit'],
        mcp_servers: [{ name: 'github', status: 'connected' }],
        skills: ['frontend-testing'],
      },
      turn: { context_usage: { totalTokens: 12_000, maxTokens: 200_000, percentage: 6 } },
    };
    const markup = renderToStaticMarkup(createElement(ContextDetails, { context }));

    expect(markup).toContain('Claude live');
    expect(markup).toContain('Permission mode');
    expect(markup).toContain('MCP servers');
    expect(markup).toContain('Context usage');
    expect(markup).toContain('12000');
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

  it("shows loading instead of a false empty trace while full run detail is loading", () => {
    const markup = renderToStaticMarkup(createElement(DetailPanel, {
      isLoading: true,
      turn: {
        id: "turn-1",
        status: "completed",
        items: [],
      },
    }));

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('class="vbg-custom-loading-state" role="status"');
    expect(markup).toContain('class="vbg-custom-spinner"');
    expect(markup).toContain('Loading run details…');
    expect(markup).not.toContain('No sequence events to display');
  });

  it("does not pair a failed detail request with a false empty trace", () => {
    const markup = renderToStaticMarkup(createElement(DetailPanel, {
      error: "Unable to load run detail",
      turn: {
        id: "turn-1",
        status: "completed",
        items: [],
      },
    }));

    expect(markup).toContain("Unable to load run detail");
    expect(markup).not.toContain("No sequence events to display");
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
