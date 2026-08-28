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

  it('renders a compact headerless row without a timestamp', () => {
    const markup = renderToStaticMarkup(createElement(Timeline, {
      onSelect: () => undefined,
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
    expect(markup).toContain('vbg-custom-sr-only">completed</span>');
    expect(markup).not.toContain('vbg-custom-status__icon');
    expect(markup.match(/<td/g)).toHaveLength(1);
    expect(markup).not.toContain('vbg-custom-event-row__time');
    expect(markup).not.toContain('2026-01-01T08:30:00.000Z');
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

  it('keeps the thread id on one line with copy and hover affordances', () => {
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

    expect(markup).toContain('title="thread-full-id"');
    expect(markup).toContain('aria-label="Copy session ID"');
    expect(markup).toContain('class="vbg-custom-thread-identity"');
    expect(markup).toContain('<span>Session</span>');
    expect(markup).toContain('class="vbg-custom-id-copy"');
    expect(markup).toContain('class="vbg-custom-thread-meta"');
    expect(markup).not.toContain('vbg-custom-thread-code');
    expect(markup).toContain('<main aria-label="Runs"');
    expect(markup).not.toContain('<h2>Runs</h2>');
    expect(markup).toContain('Rollout fallback');
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

    expect(markup).toContain('<dt>Runs</dt><dd aria-label="1 run">1</dd>');
    expect(markup).not.toContain('1 runs');
    expect(markup.indexOf('vbg-custom-thread-meta')).toBeGreaterThan(markup.indexOf('vbg-custom-timeline__title'));
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

    expect(markup).toContain('aria-label="Session summary"');
    expect(markup).toContain('<dt>Runs</dt><dd aria-label="0 runs">0</dd>');
    expect(markup).toContain('<dt>Tokens</dt>');
    expect(markup).toContain('aria-label="128,500 total tokens"');
    expect(markup).toContain('title="128,500 tokens">128.5K</dd>');
    expect(markup).toContain('<dt>Context</dt>');
    expect(markup).toContain('aria-label="32,000 of 128,000 context tokens, 25%"');
    expect(markup).toContain('title="32,000 / 128,000 tokens (25%)"');
    expect(markup).toContain('>25%</dd>');
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

    expect(markup).not.toContain('<dt>Tokens</dt>');
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
