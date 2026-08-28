import { describe, expect, it } from 'vitest';
import { TraceStore } from '../../src/shared/store.js';

describe('TraceStore', () => {
  it('reduces thread, turn and item lifecycle events', () => {
    const store = new TraceStore();
    store.add(event('thread/started', 'running'));
    store.add({ ...event('turn/started', 'running'), turnId: 'turn-1' });
    store.add({ ...event('item/started', 'running'), turnId: 'turn-1', itemId: 'item-1' });
    store.add({ ...event('item/completed', 'completed'), turnId: 'turn-1', itemId: 'item-1' });
    store.add({ ...event('turn/completed', 'completed'), turnId: 'turn-1' });

    const state = store.snapshot();
    expect(state.threads).toHaveLength(1);
    expect(state.threads[0].status).toBe('completed');
    expect(state.threads[0].turns[0]).toMatchObject({ id: 'turn-1', status: 'completed' });
    expect(state.threads[0].turns[0].items).toHaveLength(2);
    expect(state.events.map((entry) => entry.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps bounded events and preserves unknown raw events', () => {
    const store = new TraceStore({ events: 2, turnsPerThread: 1, itemsPerTurn: 1 });
    store.add(event('future/notification', 'pending', 'thread-1'));
    store.add(event('future/notification', 'pending', 'thread-2'));
    store.add(event('future/notification', 'pending', 'thread-3'));

    const state = store.snapshot();
    expect(state.events).toHaveLength(2);
    expect(state.threads.map((thread) => thread.id)).toEqual(['thread-1', 'thread-2', 'thread-3']);
    expect(state.events[1].raw).toEqual({ future: true });
  });

  it('does not cap the number of threads', () => {
    const store = new TraceStore();
    for (let index = 0; index < 101; index += 1) {
      store.add(event('thread/started', 'running', `thread-${index}`));
    }

    expect(store.snapshot().threads).toHaveLength(101);
  });

  it('preserves protocol-reported duration', () => {
    const store = new TraceStore();
    store.add({ ...event('item/completed', 'completed'), turnId: 'turn-1', itemId: 'item-1', durationMs: 842 });

    expect(store.snapshot().events[0].durationMs).toBe(842);
  });

  it('updates turn duration from realtime completion notifications', () => {
    const store = new TraceStore();
    store.add({ ...event('turn/started', 'running'), turnId: 'turn-1', at: '2026-01-01T00:00:00.000Z' });
    store.add({ ...event('turn/completed', 'completed'), turnId: 'turn-1', at: '2026-01-01T00:00:02.000Z', durationMs: 1_950 });

    expect(store.snapshot().threads[0].turns[0].durationMs).toBe(1_950);
  });

  it('hydrates history and deduplicates a matching live notification', () => {
    const store = new TraceStore();
    store.synchronizeThreads([historyThread()]);
    const before = store.snapshot();
    expect(before.threads[0]).toMatchObject({
      id: 'history-1', title: 'Saved thread', status: 'pending', cwd: '/Users/example/project', projectFolder: 'project',
    });
    expect(before.threads[0].turns[0].durationMs).toBe(86_400_000);
    expect(before.threads[0].turns[0].items).toHaveLength(1);

    store.add({
      method: 'item/completed', type: 'agentMessage', status: 'completed', threadId: 'history-1', turnId: 'turn-1',
      itemId: 'item-1', summary: 'new summary', raw: { notification: true }, at: '2026-01-03T00:00:00.000Z',
    });
    const after = store.snapshot();
    expect(after.events).toHaveLength(1);
    expect(after.threads[0].turns[0].items).toHaveLength(1);
    expect(after.events[0]).toMatchObject({ summary: 'new summary', raw: { notification: true } });
  });

  it('updates an existing item from a newer history snapshot without changing its sequence', () => {
    const store = new TraceStore();
    store.synchronizeThreads([historyThread()]);
    const seq = store.snapshot().events[0].seq;
    const updated = historyThread();
    updated.turns[0].items[0].text = 'updated answer';

    store.synchronizeThreads([updated]);

    expect(store.snapshot().events).toHaveLength(1);
    expect(store.snapshot().events[0]).toMatchObject({ seq, summary: 'updated answer' });
  });

  it('extracts the real user request from an attachment envelope before truncating', () => {
    const store = new TraceStore();
    const thread = historyThread();
    thread.turns[0].items[0] = {
      id: 'item-1', type: 'userMessage', status: 'completed',
      text: `${'attachment metadata '.repeat(20)}\n## My request:\nFix the compact state response`,
    };

    store.synchronizeThreads([thread]);

    expect(store.snapshot().threads[0].turns[0].items[0].summary).toBe('Fix the compact state response');
  });

  it('keeps item detail out of the public list snapshot', () => {
    const store = new TraceStore();
    const thread = historyThread();
    thread.turns[0].items[0] = {
      id: 'item-1', type: 'userMessage', status: 'completed', text: 'Render the list immediately',
    };
    store.synchronizeThreads([thread]);

    expect(store.publicSnapshot().threads[0].turns[0]).toMatchObject({
      summary: 'Render the list immediately',
      itemCount: 1,
      items: [],
    });
  });

  it('attributes realtime cumulative token deltas once and falls back to last usage after a reset', () => {
    const store = new TraceStore();
    store.add({ ...event('turn/started', 'running'), turnId: 'turn-1' });
    store.add({
      ...event('thread/tokenUsage/updated', 'pending'), turnId: 'turn-1',
      tokenUsage: threadUsage(100, 100),
    });
    store.add({
      ...event('thread/tokenUsage/updated', 'pending'), turnId: 'turn-1',
      tokenUsage: threadUsage(160, 60),
    });
    store.add({
      ...event('thread/tokenUsage/updated', 'pending'), turnId: 'turn-1',
      tokenUsage: threadUsage(160, 60),
    });
    store.add({ ...event('turn/started', 'running'), turnId: 'turn-2' });
    store.add({
      ...event('thread/tokenUsage/updated', 'pending'), turnId: 'turn-2',
      tokenUsage: threadUsage(30, 30),
    });

    const state = store.snapshot();
    expect(state.threads[0].tokenUsage?.total.totalTokens).toBe(30);
    expect(state.threads[0].turns[0].tokenUsage?.totalTokens).toBe(160);
    expect(state.threads[0].turns[1].tokenUsage?.totalTokens).toBe(30);
    expect(store.publicSnapshot().threads[0].turns[0].tokenUsage?.totalTokens).toBe(160);
    expect(store.getTurn('thread-1', 'turn-1')?.tokenUsage?.totalTokens).toBe(160);
  });

  it('does not clear live token usage during a metadata-only history refresh', () => {
    const store = new TraceStore();
    store.add({
      ...event('thread/tokenUsage/updated', 'pending', 'history-1'), turnId: 'turn-1',
      tokenUsage: threadUsage(100, 100),
    });

    store.synchronizeThreads([{ ...historyThread(), turns: [], turnsLoaded: false }]);

    expect(store.snapshot().threads[0].tokenUsage?.total.totalTokens).toBe(100);
  });
});

function event(method: string, status: 'pending' | 'running' | 'completed' | 'failed', threadId = 'thread-1') {
  return { method, type: method.split('/')[0], status, threadId, summary: method, raw: { future: true } };
}

function historyThread() {
  return {
    id: 'history-1', name: 'Saved thread', preview: 'Preview', cwd: '/Users/example/project',
    createdAt: 1_767_225_600, updatedAt: 1_767_312_000,
    status: { type: 'notLoaded' }, turns: [{
      id: 'turn-1', status: 'completed', startedAt: 1_767_225_600, completedAt: 1_767_312_000, durationMs: 86_400_000,
      items: [{ id: 'item-1', type: 'agentMessage', status: 'completed', text: 'answer' }],
    }],
  };
}

function threadUsage(totalTokens: number, lastTokens: number) {
  const usage = (tokens: number) => ({
    totalTokens: tokens,
    inputTokens: tokens - 10,
    cachedInputTokens: Math.max(0, tokens - 20),
    cacheWriteInputTokens: 0,
    outputTokens: 10,
    reasoningOutputTokens: 0,
  });
  return { total: usage(totalTokens), last: usage(lastTokens), modelContextWindow: 200_000 };
}
