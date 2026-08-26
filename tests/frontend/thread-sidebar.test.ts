import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ThreadSidebar } from '../../src/web/components/ThreadSidebar.js';
import type { Thread } from '../../src/web/types.js';

describe('ThreadSidebar', () => {
  it('uses compact project groups without numeric thread prefixes', () => {
    const threads: Thread[] = Array.from({ length: 6 }, (_, index) => ({
      id: `thread-${index + 1}`,
      title: `Thread ${index + 1}`,
      cwd: '/workspace/project',
      status: 'pending',
      turnsLoaded: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      turns: [],
    }));
    const markup = renderToStaticMarkup(createElement(ThreadSidebar, {
      onSelect: () => undefined,
      selectedId: 'thread-1',
      threads,
    }));

    expect(markup.match(/class="vbg-custom-thread-row(?: vbg-custom-is-selected)?"/g)).toHaveLength(5);
    expect(markup).toContain('Load more');
    expect(markup).toContain('aria-label="Load more project threads"');
    expect(markup).toContain('aria-label="Collapse project"');
    expect(markup).not.toContain('vbg-custom-thread-group__chevron');
    expect(markup).not.toContain('vbg-custom-count');
    expect(markup).not.toContain('<h2>Threads</h2>');
    expect(markup).not.toContain('>#');
    expect(markup).not.toContain('00:00');
    expect(markup).not.toContain('vbg-custom-thread-row__turns');
  });
});
