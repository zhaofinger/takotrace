import { mkdtemp, writeFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { RolloutUsageReader } from '../../src/server/rollout-usage.js';

const usage = (n: number) => JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: n } } } });

describe('RolloutUsageReader', () => {
  it('finds latest usage across blocks and giant lines, then refreshes append and replacement', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'usage-'));
    const path = join(dir, 'log.jsonl');
    const reader = new RolloutUsageReader();
    try {
      await writeFile(path, `${usage(10)}\n${usage(20)}\n${'x'.repeat(2 * 1024 * 1024)}\n{"partial":`);
      expect((await reader.read(path))?.total.totalTokens).toBe(20);
      expect((await reader.read(path))?.total.totalTokens).toBe(20);
      await appendFile(path, `\n${usage(30)}\n`);
      expect((await reader.read(path))?.total.totalTokens).toBe(30);
      await writeFile(path, usage(5));
      expect((await reader.read(path))?.total.totalTokens).toBe(5);
      await writeFile(path, '{"type":"event_msg","payload":{"type":"token_count","info":null}}\n');
      expect(await reader.read(path)).toBeUndefined();
      expect(await reader.read(join(dir, 'missing'))).toBeUndefined();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('handles usage JSON and UTF-8 split across read blocks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'usage-'));
    const path = join(dir, 'log.jsonl');
    try {
      await writeFile(path, `${usage(99)}\n${JSON.stringify({ text: '中文'.repeat(11000) })}\n`);
      expect((await new RolloutUsageReader().read(path))?.total.totalTokens).toBe(99);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
