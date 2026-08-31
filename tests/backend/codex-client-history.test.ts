import { describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EventEmitter } from 'node:events';
import { CodexClient } from '../../src/server/codex-client.js';
import type { TraceInput } from '../../src/server/provider.js';

describe('CodexClient history sync', () => {
  it('publishes paginated metadata without waiting for full thread reads', async () => {
    const client = new CodexClient({ historyPageSize: 1, historyThreadLimit: 10 });
    const list = vi.spyOn(client, 'listThreads')
      .mockResolvedValueOnce({ data: [thread('new', 20)], nextCursor: 'page-2' })
      .mockResolvedValueOnce({ data: [thread('old', 10)], nextCursor: null });
    const read = vi.spyOn(client, 'readThread');
    const snapshots: unknown[][] = [];
    client.onHistory((threads) => snapshots.push(threads));

    await client.refreshHistory();

    expect(list).toHaveBeenNthCalledWith(1, null, 1);
    expect(list).toHaveBeenNthCalledWith(2, 'page-2', 1);
    expect(read).not.toHaveBeenCalled();
    expect(snapshots[0]).toHaveLength(2);
  });

  it('caches unchanged snapshots and supports explicit lazy loading', async () => {
    const client = new CodexClient();
    vi.spyOn(client, 'listThreads').mockResolvedValue({ data: [thread('new', 20)], nextCursor: null });
    const read = vi.spyOn(client, 'readThread').mockResolvedValue({ thread: thread('new', 20) });

    await client.refreshHistory();
    await client.syncThread('new');
    await client.refreshHistory();

    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith('new');
  });
  it("falls back to includeTurns: false when thread/read encounters deserialization errors", async () => {
    const client = new CodexClient();
    const req = vi.spyOn(client, "request")
      .mockRejectedValueOnce(new Error("failed to deserialize stored thread item subagent-completed-123: unknown variant completed"))
      .mockResolvedValueOnce({ thread: thread("corrupt", 20) });

    const result = await client.readThread("corrupt", true);

    expect(req).toHaveBeenCalledTimes(2);
    expect(req).toHaveBeenNthCalledWith(1, "thread/read", { threadId: "corrupt", includeTurns: true }, 120000);
    expect(req).toHaveBeenNthCalledWith(2, "thread/read", { threadId: "corrupt", includeTurns: false }, 120000);
    expect(result).toEqual({ thread: thread("corrupt", 20) });
  });

  it('recovers rollout turns before falling back to metadata-only reads', async () => {
    const threadId = '01a03900-5582-7a11-bd8d-a594d4ed8c91';
    const turnId = '01a03900-f4e5-7c61-895b-e5b5dd692d83';
    const codexHome = await mkdtemp(join(tmpdir(), 'takotrace-client-'));
    try {
      const directory = join(codexHome, 'sessions', '2026', '08', '25');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, `rollout-2026-08-25T20-58-38-${threadId}.jsonl`), [
        JSON.stringify({ timestamp: '2026-08-25T12:58:38.000Z', type: 'session_meta', payload: { id: threadId, timestamp: '2026-08-25T12:58:38.000Z' } }),
        JSON.stringify({ timestamp: '2026-08-25T12:58:39.000Z', type: 'event_msg', payload: { type: 'task_started', turn_id: turnId, started_at: 1_767_000_000 } }),
        JSON.stringify({ timestamp: '2026-08-25T12:58:40.000Z', type: 'event_msg', payload: { type: 'item_completed', turn_id: turnId, item: { id: 'user-1', type: 'UserMessage', content: [{ type: 'text', text: 'Recover me' }] } } }),
        JSON.stringify({ timestamp: '2026-08-25T12:58:41.000Z', type: 'event_msg', payload: { type: 'task_complete', turn_id: turnId, completed_at: 1_767_000_003 } }),
      ].join('\n'));
      const client = new CodexClient({ codexHome });
      const req = vi.spyOn(client, 'request')
        .mockRejectedValueOnce(new Error('failed to deserialize stored thread item: unknown variant completed'))
        .mockResolvedValueOnce({ thread: { ...thread(threadId, 20), name: 'Preserved title' } });

      const result = await client.readThread(threadId, true) as { thread: { historySource: string; name: string; turns: unknown[] } };

      expect(req).toHaveBeenCalledTimes(2);
      expect(req).toHaveBeenNthCalledWith(2, 'thread/read', { threadId, includeTurns: false }, 120000);
      expect(result.thread.name).toBe('Preserved title');
      expect(result.thread.historySource).toBe('rollout-file');
      expect(result.thread.turns).toHaveLength(1);
    } finally {
      await rm(codexHome, { recursive: true, force: true });
    }
  });

  it('best-effort merges rollout token usage into a successful thread/read response', async () => {
    const threadId = '01a03900-5582-7a11-bd8d-a594d4ed8c91';
    const turnId = '01a03900-f4e5-7c61-895b-e5b5dd692d83';
    const codexHome = await mkdtemp(join(tmpdir(), 'takotrace-client-'));
    try {
      const directory = join(codexHome, 'sessions', '2026', '08', '25');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, `rollout-2026-08-25T20-58-38-${threadId}.jsonl`), [
        JSON.stringify({ timestamp: '2026-08-25T12:58:38.000Z', type: 'session_meta', payload: { id: threadId } }),
        JSON.stringify({ timestamp: '2026-08-25T12:58:39.000Z', type: 'turn_context', payload: { turn_id: turnId } }),
        JSON.stringify({
          timestamp: '2026-08-25T12:58:40.000Z', type: 'event_msg', payload: {
            type: 'token_count', info: {
              total_token_usage: snakeUsage(100), last_token_usage: snakeUsage(100), model_context_window: 200_000,
            },
          },
        }),
      ].join('\n'));
      const client = new CodexClient({ codexHome });
      vi.spyOn(client, 'request').mockResolvedValue({
        thread: {
          ...thread(threadId, 20), historySource: 'app-server',
          turns: [{ id: turnId, status: 'completed', items: [{ id: 'app-item' }] }],
        },
      });

      const result = await client.readThread(threadId, true) as {
        thread: {
          historySource: string;
          tokenUsage: { total: { totalTokens: number } };
          turns: Array<{ tokenUsage: { totalTokens: number }; items: unknown[] }>;
        };
      };

      expect(result.thread.historySource).toBe('app-server');
      expect(result.thread.tokenUsage.total.totalTokens).toBe(100);
      expect(result.thread.turns[0].tokenUsage.totalTokens).toBe(100);
      expect(result.thread.turns[0].items).toEqual([{ id: 'app-item' }]);
    } finally {
      await rm(codexHome, { recursive: true, force: true });
    }
  });

  it('recovers newer rollout runs omitted by a successful App Server read', async () => {
    const threadId = '01a03900-5582-7a11-bd8d-a594d4ed8c91';
    const appTurnId = '01a03900-f4e5-7c61-895b-e5b5dd692d83';
    const newerTurnId = '01a03901-1111-7111-8111-111111111111';
    const codexHome = await mkdtemp(join(tmpdir(), 'takotrace-client-'));
    try {
      const directory = join(codexHome, 'sessions', '2026', '08', '25');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, `rollout-2026-08-25T20-58-38-${threadId}.jsonl`), [
        JSON.stringify({ timestamp: '2026-08-25T12:58:38.000Z', type: 'session_meta', payload: { id: threadId } }),
        JSON.stringify({ timestamp: '2026-08-25T12:58:39.000Z', type: 'event_msg', payload: { type: 'task_started', turn_id: appTurnId } }),
        JSON.stringify({ timestamp: '2026-08-25T12:58:40.000Z', type: 'event_msg', payload: { type: 'item_completed', turn_id: appTurnId, item: { id: 'rollout-old', type: 'UserMessage' } } }),
        JSON.stringify({ timestamp: '2026-08-25T12:58:41.000Z', type: 'event_msg', payload: { type: 'task_complete', turn_id: appTurnId } }),
        JSON.stringify({ timestamp: '2026-08-25T12:58:42.000Z', type: 'event_msg', payload: { type: 'task_started', turn_id: newerTurnId } }),
        JSON.stringify({ timestamp: '2026-08-25T12:58:43.000Z', type: 'event_msg', payload: { type: 'item_completed', turn_id: newerTurnId, item: { id: 'rollout-new', type: 'UserMessage' } } }),
        JSON.stringify({ timestamp: '2026-08-25T12:58:44.000Z', type: 'event_msg', payload: { type: 'task_complete', turn_id: newerTurnId } }),
      ].join('\n'));
      const client = new CodexClient({ codexHome });
      vi.spyOn(client, 'request').mockResolvedValue({
        thread: {
          ...thread(threadId, 20),
          historySource: 'app-server',
          turns: [{ id: appTurnId, status: 'completed', items: [{ id: 'app-old' }] }],
        },
      });

      const result = await client.readThread(threadId, true) as {
        thread: { historySource: string; turns: Array<{ id: string; items: Array<{ id: string }> }> };
      };

      expect(result.thread.historySource).toBe('rollout-file');
      expect(result.thread.turns.map((turn) => turn.id)).toEqual([appTurnId, newerTurnId]);
      expect(result.thread.turns[0].items).toEqual([{ id: 'app-old' }]);
      expect(result.thread.turns[1].items).toEqual([expect.objectContaining({ id: 'rollout-new' })]);
    } finally {
      await rm(codexHome, { recursive: true, force: true });
    }
  });

  it('best-effort fills missing item timing without overriding App Server values', async () => {
    const threadId = '01a03900-5582-7a11-bd8d-a594d4ed8c91';
    const turnId = '01a03900-f4e5-7c61-895b-e5b5dd692d83';
    const codexHome = await mkdtemp(join(tmpdir(), 'takotrace-client-'));
    try {
      const directory = join(codexHome, 'sessions', '2026', '08', '25');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, `rollout-2026-08-25T20-58-38-${threadId}.jsonl`), [
        JSON.stringify({ timestamp: '2026-08-25T12:58:38.000Z', type: 'session_meta', payload: { id: threadId } }),
        JSON.stringify({ timestamp: '2026-08-25T12:58:39.000Z', type: 'turn_context', payload: { turn_id: turnId } }),
        JSON.stringify({
          timestamp: '2026-08-25T12:58:40.000Z', type: 'event_msg', payload: {
            type: 'item_completed', turn_id: turnId, started_at_ms: 1_767_000_001_000,
            completed_at_ms: 1_767_000_002_500, item: { id: 'missing-timing', type: 'CommandExecution', command: 'npm test' },
          },
        }),
        JSON.stringify({
          timestamp: '2026-08-25T12:58:41.000Z', type: 'event_msg', payload: {
            type: 'item_completed', turn_id: turnId, started_at_ms: 1_767_000_003_000,
            completed_at_ms: 1_767_000_004_000, item: { id: 'app-timing', type: 'CommandExecution', command: 'npm run build' },
          },
        }),
      ].join('\n'));
      const client = new CodexClient({ codexHome });
      vi.spyOn(client, 'request').mockResolvedValue({
        thread: {
          ...thread(threadId, 20),
          turns: [{
            id: turnId,
            status: 'completed',
            items: [
              { id: 'missing-timing', type: 'commandExecution', command: 'npm test' },
              { id: 'app-timing', type: 'commandExecution', startedAt: 10, completedAt: 12, durationMs: 2_000 },
            ],
          }],
        },
      });

      const result = await client.readThread(threadId, true) as {
        thread: { turns: Array<{ items: Array<Record<string, unknown>> }> };
      };

      expect(result.thread.turns[0].items[0]).toMatchObject({
        id: 'missing-timing',
        startedAt: 1_767_000_001,
        completedAt: 1_767_000_002.5,
        durationMs: 1_500,
      });
      expect(result.thread.turns[0].items[1]).toMatchObject({
        id: 'app-timing',
        startedAt: 10,
        completedAt: 12,
        durationMs: 2_000,
      });
    } finally {
      await rm(codexHome, { recursive: true, force: true });
    }
  });

  it('best-effort fills missing run models without overriding App Server values', async () => {
    const threadId = '01a03900-5582-7a11-bd8d-a594d4ed8c91';
    const turnId = '01a03900-f4e5-7c61-895b-e5b5dd692d83';
    const codexHome = await mkdtemp(join(tmpdir(), 'takotrace-client-'));
    try {
      const directory = join(codexHome, 'sessions', '2026', '08', '25');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, `rollout-2026-08-25T20-58-38-${threadId}.jsonl`), [
        JSON.stringify({ timestamp: '2026-08-25T12:58:38.000Z', type: 'session_meta', payload: { id: threadId } }),
        JSON.stringify({ timestamp: '2026-08-25T12:58:39.000Z', type: 'turn_context', payload: { turn_id: turnId, model: 'gpt-5.6-sol' } }),
        JSON.stringify({ timestamp: '2026-08-25T12:58:40.000Z', type: 'event_msg', payload: { type: 'task_started', turn_id: turnId } }),
      ].join('\n'));
      const client = new CodexClient({ codexHome });
      vi.spyOn(client, 'request')
        .mockResolvedValueOnce({ thread: { ...thread(threadId, 20), turns: [{ id: turnId, status: 'completed', items: [] }] } })
        .mockResolvedValueOnce({ thread: { ...thread(threadId, 20), turns: [{ id: turnId, status: 'completed', model: 'app-selected-model', items: [] }] } });

      const filled = await client.readThread(threadId, true) as { thread: { turns: Array<{ model?: string }> } };
      const preserved = await client.readThread(threadId, true) as { thread: { turns: Array<{ model?: string }> } };

      expect(filled.thread.turns[0].model).toBe('gpt-5.6-sol');
      expect(preserved.thread.turns[0].model).toBe('app-selected-model');
    } finally {
      await rm(codexHome, { recursive: true, force: true });
    }
  });

  it('uses an active rollout to correct stale interrupted App Server lifecycle state', async () => {
    const threadId = '01a03900-5582-7a11-bd8d-a594d4ed8c91';
    const turnId = '01a03900-f4e5-7c61-895b-e5b5dd692d83';
    const codexHome = await mkdtemp(join(tmpdir(), 'takotrace-client-'));
    try {
      const directory = join(codexHome, 'sessions', '2026', '08', '25');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, `rollout-2026-08-25T20-58-38-${threadId}.jsonl`), [
        JSON.stringify({ timestamp: '2026-08-25T12:58:38.000Z', type: 'session_meta', payload: { id: threadId } }),
        JSON.stringify({ timestamp: '2026-08-25T12:58:39.000Z', type: 'event_msg', payload: { type: 'task_started', turn_id: turnId, started_at: 1_767_000_000 } }),
        JSON.stringify({ timestamp: '2026-08-25T12:58:40.000Z', type: 'event_msg', payload: { type: 'item_completed', turn_id: turnId, item: { id: 'user-1', type: 'UserMessage', content: [{ type: 'text', text: 'Still running' }] } } }),
      ].join('\n'));
      const client = new CodexClient({ codexHome });
      vi.spyOn(client, 'request').mockResolvedValue({
        thread: {
          ...thread(threadId, 20),
          status: { type: 'idle' },
          turns: [{ id: turnId, status: 'interrupted', completedAt: null, items: [{ id: 'user-1' }] }],
        },
      });

      const result = await client.readThread(threadId, true) as {
        thread: { status: { type: string }; turns: Array<{ status: string; completedAt?: number }> };
      };

      expect(result.thread.status).toEqual({ type: 'active' });
      expect(result.thread.turns[0]).toMatchObject({ status: 'inProgress' });
      expect(result.thread.turns[0].completedAt).toBeUndefined();
    } finally {
      await rm(codexHome, { recursive: true, force: true });
    }
  });

  it('preserves an interrupted App Server turn without an active rollout turn', async () => {
    const threadId = '01a03900-5582-7a11-bd8d-a594d4ed8c91';
    const completedTurnId = '01a03900-f4e5-7c61-895b-e5b5dd692d83';
    const interruptedTurnId = '01a03900-f4e5-7c61-895b-e5b5dd692d84';
    const codexHome = await mkdtemp(join(tmpdir(), 'takotrace-client-'));
    try {
      const directory = join(codexHome, 'sessions', '2026', '08', '25');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, `rollout-2026-08-25T20-58-38-${threadId}.jsonl`), [
        JSON.stringify({ timestamp: '2026-08-25T12:58:38.000Z', type: 'session_meta', payload: { id: threadId } }),
        JSON.stringify({ timestamp: '2026-08-25T12:58:39.000Z', type: 'event_msg', payload: { type: 'task_started', turn_id: completedTurnId } }),
        JSON.stringify({ timestamp: '2026-08-25T12:58:40.000Z', type: 'event_msg', payload: { type: 'task_complete', turn_id: completedTurnId } }),
      ].join('\n'));
      const client = new CodexClient({ codexHome });
      vi.spyOn(client, 'request').mockResolvedValue({
        thread: {
          ...thread(threadId, 20),
          turns: [{ id: interruptedTurnId, status: 'interrupted', completedAt: null, items: [] }],
        },
      });

      const result = await client.readThread(threadId, true) as {
        thread: { turns: Array<{ id: string; status: string; completedAt: null }> };
      };

      expect(result.thread.turns.find((turn) => turn.id === interruptedTurnId))
        .toMatchObject({ status: 'interrupted', completedAt: null });
    } finally {
      await rm(codexHome, { recursive: true, force: true });
    }
  });

  it("handles fatal syncThread errors gracefully without rejecting", async () => {
    const client = new CodexClient();
    vi.spyOn(client, "readThread").mockRejectedValue(new Error("Network unrecoverable"));
    const snapshots: unknown[][] = [];
    client.onHistory((threads) => snapshots.push(threads));

    const res = await client.syncThread("fatal-thread");
    expect(res).toEqual({ thread: null });
    expect(snapshots).toEqual([[{ id: "fatal-thread", turnsLoaded: true }]]);
  });

  it('adapts notifications to provider trace events without changing Codex behavior', () => {
    const client = new CodexClient();
    const events: TraceInput[] = [];
    client.onTrace((event) => events.push(event));
    const emitter = (client as unknown as { emitter: EventEmitter }).emitter;
    emitter.emit('notification', {
      method: 'thread/started',
      params: { threadId: 'thread-1', type: 'thread' },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      method: 'thread/started',
      threadId: 'thread-1',
      type: 'thread',
      status: 'running',
      raw: { method: 'thread/started', params: { threadId: 'thread-1', type: 'thread' } },
    });
  });
});

function thread(id: string, updatedAt: number) {
  return { id, name: id, preview: id, createdAt: updatedAt - 1, updatedAt, status: { type: 'notLoaded' }, turns: [] };
}

function snakeUsage(totalTokens: number) {
  return {
    total_tokens: totalTokens,
    input_tokens: totalTokens - 10,
    cached_input_tokens: totalTokens - 20,
    cache_write_input_tokens: 0,
    output_tokens: 10,
    reasoning_output_tokens: 0,
  };
}
