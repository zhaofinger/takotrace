import { describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexClient } from '../../src/server/codex-client.js';

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
    const codexHome = await mkdtemp(join(tmpdir(), 'thread-scope-client-'));
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

  it("handles fatal syncThread errors gracefully without rejecting", async () => {
    const client = new CodexClient();
    vi.spyOn(client, "readThread").mockRejectedValue(new Error("Network unrecoverable"));
    const snapshots: unknown[][] = [];
    client.onHistory((threads) => snapshots.push(threads));

    const res = await client.syncThread("fatal-thread");
    expect(res).toEqual({ thread: null });
    expect(snapshots).toEqual([[{ id: "fatal-thread", turnsLoaded: true }]]);
  });
});

function thread(id: string, updatedAt: number) {
  return { id, name: id, preview: id, createdAt: updatedAt - 1, updatedAt, status: { type: 'notLoaded' }, turns: [] };
}
