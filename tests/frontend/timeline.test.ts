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

    expect(markup).toContain('Loading turns…');
    expect(markup).not.toContain('No turns in this thread');
  });

  it('renders a compact headerless row with icon-only status', () => {
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
    expect(markup).toContain('vbg-visually-hidden">completed</span>');
    expect(markup.indexOf('A long user prompt')).toBeLessThan(markup.indexOf('vbg-custom-event-row__time'));
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
    expect(markup).toContain('aria-label="Copy thread ID"');
    expect(markup).toContain('<main aria-label="Turns"');
    expect(markup).not.toContain('<h2>Turns</h2>');
    expect(markup).toContain('Rollout fallback');
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
