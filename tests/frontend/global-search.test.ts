import { describe, expect, it } from 'vitest';
import { searchThreadsAndTurns } from '../../src/web/components/GlobalSearch.js';
import type { Thread } from '../../src/web/types.js';

const threads: Thread[] = [
  {
    id: 'thread-auth-123',
    title: 'Fix login flow',
    cwd: '/workspace/account-app',
    status: 'completed',
    turnsLoaded: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    turns: [{
      id: 'turn-oauth-456',
      status: 'completed',
      summary: 'Add OAuth callback validation',
      itemCount: 4,
      items: [],
    }],
  },
  {
    id: 'thread-empty-789',
    title: 'Unloaded history',
    cwd: '/workspace/archive',
    status: 'pending',
    turnsLoaded: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    turns: [],
  },
];

describe('searchThreadsAndTurns', () => {
  it('matches thread metadata case-insensitively', () => {
    const results = searchThreadsAndTurns(threads, ' ACCOUNT-APP ');

    expect(results.threads.map((thread) => thread.id)).toEqual(['thread-auth-123']);
    expect(results.turns).toEqual([]);
  });

  it('matches loaded turns by id or summary and keeps their thread identity', () => {
    const bySummary = searchThreadsAndTurns(threads, 'oauth callback');
    const byId = searchThreadsAndTurns(threads, 'TURN-OAUTH');

    expect(bySummary.turns[0]?.thread.id).toBe('thread-auth-123');
    expect(bySummary.turns[0]?.turn.id).toBe('turn-oauth-456');
    expect(byId.turns[0]?.turn.summary).toBe('Add OAuth callback validation');
  });

  it('does not invent turn results for unloaded threads or an empty query', () => {
    expect(searchThreadsAndTurns(threads, 'Unloaded').turns).toEqual([]);
    expect(searchThreadsAndTurns(threads, '  ')).toEqual({ threads: [], turns: [] });
  });
});
