import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildTimeGroups, ThreadSidebar } from '../../src/web/components/ThreadSidebar.js';
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
    expect(markup).toContain('aria-label="Load more project sessions"');
    expect(markup).toContain('aria-label="Collapse project"');
    expect(markup).not.toContain('vbg-custom-thread-group__chevron');
    expect(markup).not.toContain('vbg-custom-count');
    expect(markup).not.toContain('<h2>Sessions</h2>');
    expect(markup).not.toContain('>#');
    expect(markup).not.toContain('00:00');
    expect(markup).not.toContain('vbg-custom-thread-row__turns');
    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-checked="false"');
    expect(markup).toContain('Group by time');
    expect(markup).not.toContain('Filter threads');
    expect(markup).not.toContain('type="search"');
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-label="Session provider"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('Codex');
    expect(markup).toContain('Claude');
  });

  it('renders provider counts and selects the active provider tab', () => {
    const markup = renderToStaticMarkup(createElement(ThreadSidebar, {
      activeProvider: 'claude',
      counts: { codex: 12, claude: 7 },
      onProviderChange: () => undefined,
      onSelect: () => undefined,
      threads: [],
    }));

    expect(markup).toContain('>12<');
    expect(markup).toContain('>7<');
    expect(markup).toMatch(/aria-selected="true"[^>]*><span>Claude<\/span>/);
  });

  it('associates provider tabs with the active session panel', () => {
    const markup = renderToStaticMarkup(createElement(ThreadSidebar, {
      activeProvider: 'claude',
      counts: { codex: 12, claude: 7 },
      onProviderChange: () => undefined,
      onSelect: () => undefined,
      threads: [],
    }));

    expect(markup).toContain('id="session-provider-tab-codex"');
    expect(markup).toContain('aria-controls="session-provider-panel-codex"');
    expect(markup).toContain('id="session-provider-tab-claude"');
    expect(markup).toContain('aria-controls="session-provider-panel-claude"');
    expect(markup).toContain('id="session-provider-panel-claude"');
    expect(markup).toContain('aria-labelledby="session-provider-tab-claude"');
    expect(markup).toContain('id="session-provider-panel-codex"');
    expect(markup).toContain('aria-labelledby="session-provider-tab-codex" hidden=""');
    expect(markup.match(/role="tabpanel"/g)).toHaveLength(2);
    expect(markup.match(/hidden=""/g)).toHaveLength(1);
  });

  it('sorts threads into local time groups with stable invalid-date fallback', () => {
    const threads: Thread[] = [
      { id: 'older', title: 'Older', cwd: '/workspace/older', status: 'completed', turnsLoaded: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', turns: [] },
      { id: 'today-late', title: 'Today late', cwd: '/workspace/app', status: 'completed', turnsLoaded: true, createdAt: '2026-08-27T11:00:00.000Z', updatedAt: '2026-08-27T11:00:00.000Z', turns: [] },
      { id: 'invalid', title: 'Invalid', cwd: '/workspace/app', status: 'completed', turnsLoaded: true, createdAt: 'invalid', updatedAt: 'invalid', turns: [] },
      { id: 'today-early', title: 'Today early', cwd: '/workspace/app', status: 'completed', turnsLoaded: true, createdAt: '2026-08-27T01:00:00.000Z', updatedAt: '2026-08-27T01:00:00.000Z', turns: [] },
      { id: 'yesterday', title: 'Yesterday', cwd: '/workspace/app', status: 'completed', turnsLoaded: true, createdAt: '2026-08-26T08:00:00.000Z', updatedAt: '2026-08-26T08:00:00.000Z', turns: [] },
    ];

    const groups = buildTimeGroups(threads, new Date('2026-08-27T12:00:00.000Z'));

    expect(groups.map((group) => group.label)).toEqual(['Today', 'Yesterday', 'Older']);
    expect(groups[0]?.threads.map((thread) => thread.id)).toEqual(['today-late', 'today-early']);
    expect(groups.at(-1)?.threads.map((thread) => thread.id)).toEqual(['older', 'invalid']);
  });

  it('shows an honest loading state without empty mobile controls', () => {
    const markup = renderToStaticMarkup(createElement(ThreadSidebar, {
      isLoading: true,
      onSelect: () => undefined,
      threads: [],
    }));

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('Loading sessions…');
    expect(markup).not.toContain('No sessions yet');
    expect(markup).not.toContain('<select');
    expect(markup).not.toContain('Group by time');
  });
});
