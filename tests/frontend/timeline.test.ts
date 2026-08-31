import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Timeline, turnSummary } from '../../src/web/components/Timeline.js';
import type { Thread, Turn } from '../../src/web/types.js';

describe('turnSummary', () => {
  it('uses the user request for an aggregated turn', () => {
    expect(turnSummary(turn('Fix the login bug'))).toBe('Fix the login bug');
  });

  it('removes the attachment envelope from Codex user messages', () => {
    const value = turn('fallback');
    value.items[0].raw = {
      type: 'userMessage',
      content: [{
        type: 'text',
        text: '# Files mentioned by the user:\n\nfile.png\n\n## My request:\nGroup threads by project',
      }],
    };

    expect(turnSummary(value)).toBe('Group threads by project');
  });

  it('shows loading instead of an empty state while thread history is syncing', () => {
    const thread: Thread = {
      id: 'thread-1',
      title: 'Historical thread',
      status: 'pending',
      turnsLoaded: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      turns: [],
    };
    const markup = renderToStaticMarkup(createElement(Timeline, {
      isLoading: true,
      onSelect: () => undefined,
      thread,
      turns: [],
    }));

    expect(markup).toContain('Loading runs…');
    expect(markup).not.toContain('No runs in this session');
  });

  it('renders a compact headerless row with a status mark and start time', () => {
    const markup = renderToStaticMarkup(createElement(Timeline, {
      onSelect: () => undefined,
      selectedId: 'turn-1',
      turns: [{
        id: 'turn-1',
        status: 'completed',
        startedAt: '2026-01-01T08:30:00.000Z',
        summary: 'A long user prompt',
        itemCount: 0,
        items: [],
      }],
    }));

    expect(markup).not.toContain('<thead');
    expect(markup).toContain('title="A long user prompt"');
    expect(markup).toContain('vbg-custom-status__icon');
    expect(markup).toContain('vbg-visually-hidden">completed</span>');
    expect(markup.match(/<td/g)).toHaveLength(1);
    expect(markup).toContain('class="vbg-custom-event-row__time"');
    expect(markup).toContain('dateTime="2026-01-01T08:30:00.000Z"');
    expect(markup).not.toContain('aria-selected=');
    expect(markup).toContain('aria-current=');
  });

  it('renders turn summaries as non-interactive inline Markdown', () => {
    const summary = '[$eli5](/Users/example/.agents/skills/eli5/SKILL.md) and **stars** with `code`';
    const markup = renderToStaticMarkup(createElement(Timeline, {
      onSelect: () => undefined,
      turns: [{
        id: 'turn-markdown',
        status: 'completed',
        summary,
        itemCount: 0,
        items: [],
      }],
    }));

    expect(markup).toContain('vbg-custom-inline-markdown__link">$eli5</span>');
    expect(markup).toContain('<strong>stars</strong>');
    expect(markup).toContain('<code>code</code>');
    expect(markup).not.toContain('<a ');
  });

  it('renders a one-line session summary with compact details and copy affordances', () => {
    const thread: Thread = {
      id: 'thread-full-id',
      title: 'Thread title',
      status: 'completed',
      turnsLoaded: true,
      historySource: 'rollout-file',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      turns: [],
    };
    const markup = renderToStaticMarkup(createElement(Timeline, {
      onSelect: () => undefined,
      thread,
      turns: [],
    }));

    expect(markup).toContain('aria-label="Copy session ID"');
    expect(markup).toContain('aria-label="Session details for thread-full-id"');
    expect(markup).toContain('class="vbg-custom-session-summary"');
    expect(markup).toContain('<code class="vbg-custom-compact-id" title="thread-full-id">thread-full-id</code>');
    expect(markup).toContain('0 runs');
    expect(markup).toContain('class="vbg-custom-id-copy"');
    expect(markup.indexOf('vbg-custom-session-summary__runs')).toBeLessThan(markup.indexOf('vbg-custom-compact-id'));
    expect(markup.indexOf('vbg-custom-compact-id')).toBeLessThan(markup.indexOf('aria-label="Copy session ID"'));
    expect(markup).not.toContain('<span>Session</span>');
    expect(markup).not.toContain('class="vbg-custom-thread-meta"');
    expect(markup).not.toContain('vbg-custom-thread-code');
    expect(markup).toContain('<main aria-label="Runs"');
    expect(markup).not.toContain('<h2>Runs</h2>');
    expect(markup).not.toContain('vbg-custom-timeline__footer');
  });

  it('does not repeat the loaded session history source below the run list', () => {
    const thread: Thread = {
      id: 'claude-session',
      title: 'Claude session',
      status: 'completed',
      turnsLoaded: true,
      historySource: 'claude',
      provider: 'claude',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      turns: [],
    };
    const markup = renderToStaticMarkup(createElement(Timeline, {
      onSelect: () => undefined,
      thread,
      turns: [],
    }));

    expect(markup).not.toContain('Claude sessions');
    expect(markup).not.toContain('vbg-custom-timeline__footer');
  });

  it('uses the singular run label for one run', () => {
    const thread: Thread = {
      id: 'thread-one-run',
      title: 'One run',
      status: 'completed',
      turnsLoaded: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      turns: [],
    };
    const markup = renderToStaticMarkup(createElement(Timeline, {
      onSelect: () => undefined,
      thread,
      turns: [{
        id: 'turn-only',
        status: 'completed',
        summary: 'Only run',
        itemCount: 0,
        items: [],
      }],
    }));

    expect(markup).not.toContain('1 runs');
    expect(markup).toContain('1 run');
  });

  it('shows total tokens and last-request context usage with exact values', () => {
    const thread: Thread = {
      id: 'thread-token-usage',
      title: 'Token usage',
      status: 'completed',
      turnsLoaded: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      tokenUsage: {
        total: {
          inputTokens: 120_000,
          cachedInputTokens: 80_000,
          cacheWriteInputTokens: 0,
          outputTokens: 8_500,
          reasoningOutputTokens: 3_500,
          totalTokens: 128_500,
        },
        last: {
          inputTokens: 30_000,
          cachedInputTokens: 20_000,
          cacheWriteInputTokens: 0,
          outputTokens: 2_000,
          reasoningOutputTokens: 1_000,
          totalTokens: 32_000,
        },
        modelContextWindow: 128_000,
      },
      turns: [],
    };
    const markup = renderToStaticMarkup(createElement(Timeline, {
      onSelect: () => undefined,
      thread,
      turns: [],
    }));

    expect(markup).toContain('aria-label="Session details for thread-token-usage"');
    expect(markup).toContain('vbg-custom-session-summary__context--normal');
    expect(markup).toContain('>25%</span>');
    expect(markup.indexOf('vbg-custom-session-summary__runs')).toBeLessThan(markup.indexOf('vbg-custom-session-summary__context'));
    expect(markup.indexOf('vbg-custom-session-summary__context')).toBeLessThan(markup.indexOf('vbg-custom-compact-id'));
    expect(markup).toContain('vbg-custom-context-capacity--normal');
    expect(markup).toContain('style="--vbg-context-capacity-scale:0.25"');
    expect(markup).not.toContain('128.5K');
    expect(markup).not.toContain('32K / 128K');
  });

  it('does not render a token summary without usage data', () => {
    const thread: Thread = {
      id: 'thread-no-usage',
      title: 'No usage',
      status: 'completed',
      turnsLoaded: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      turns: [],
    };
    const markup = renderToStaticMarkup(createElement(Timeline, {
      onSelect: () => undefined,
      thread,
      turns: [],
    }));

    expect(markup).not.toContain('vbg-custom-session-summary__context');
  });

  it.each([
    [80, 'warning', 0.8],
    [95, 'danger', 0.95],
    [120, 'danger', 1],
  ])('uses semantic context capacity styling at %i%% usage', (totalTokens, level, trackScale) => {
    const usage = tokenUsage(totalTokens);
    const thread: Thread = {
      id: `thread-context-${totalTokens}`,
      title: 'Context capacity',
      status: 'completed',
      turnsLoaded: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      tokenUsage: { total: usage, last: usage, modelContextWindow: 100 },
      turns: [],
    };
    const markup = renderToStaticMarkup(createElement(Timeline, {
      onSelect: () => undefined,
      thread,
      turns: [],
    }));

    expect(markup).toContain(`vbg-custom-context-capacity--${level}`);
    expect(markup).toContain(`style="--vbg-context-capacity-scale:${trackScale}"`);
  });

  it('does not claim an App Server source before a session is selected', () => {
    const markup = renderToStaticMarkup(createElement(Timeline, {
      onSelect: () => undefined,
      turns: [],
    }));

    expect(markup).toContain('Select a session to view runs');
    expect(markup).not.toContain('Showing 0 runs · App Server');
  });
});

function turn(summary: string): Turn {
  return {
    id: 'turn-1',
    status: 'completed',
    items: [{
      seq: 1,
      at: '2026-01-01T00:00:00.000Z',
      method: 'item/completed',
      type: 'userMessage',
      status: 'completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'item-1',
      summary,
      raw: { type: 'userMessage', text: summary },
    }],
  };
}

function tokenUsage(totalTokens: number) {
  return {
    inputTokens: totalTokens,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens,
  };
}
