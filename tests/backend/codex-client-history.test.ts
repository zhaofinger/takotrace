import { describe, expect, it, vi } from 'vitest';
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
