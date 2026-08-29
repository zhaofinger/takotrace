import { describe, expect, it } from 'vitest';
import { filterThreadsByProvider } from '../../src/web/App.js';
import type { Thread } from '../../src/web/types.js';

describe('provider tabs', () => {
  it('keeps Codex and Claude sessions in separate lists', () => {
    const base: Omit<Thread, 'id' | 'provider'> = {
      title: 'Session', status: 'completed', turnsLoaded: true,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', turns: [],
    };
    const threads: Thread[] = [
      { ...base, id: 'codex', provider: 'codex' },
      { ...base, id: 'claude', provider: 'claude' },
      { ...base, id: 'legacy-codex' },
    ];

    expect(filterThreadsByProvider(threads, 'codex').map((thread) => thread.id)).toEqual(['codex', 'legacy-codex']);
    expect(filterThreadsByProvider(threads, 'claude').map((thread) => thread.id)).toEqual(['claude']);
  });
});
