import { open, stat } from 'node:fs/promises';
import { normalizeThreadTokenUsage } from '../shared/trace.js';
import type { ThreadTokenUsage } from '../shared/types.js';

const BLOCK_BYTES = 64 * 1024;
const MAX_USAGE_LINE_BYTES = 1024 * 1024;

/** Reads the latest cumulative usage, without loading conversation content. */
export class RolloutUsageReader {
  private readonly cache = new Map<string, { version: string; usage?: ThreadTokenUsage }>();

  async read(path: string): Promise<ThreadTokenUsage | undefined> {
    try {
      const info = await stat(path);
      if (!info.isFile()) return undefined;
      const version = `${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
      const cached = this.cache.get(path);
      if (cached?.version === version) return cached.usage;
      const file = await open(path, 'r');
      let usage: ThreadTokenUsage | undefined;
      try {
        let position = info.size;
        let suffix = Buffer.alloc(0);
        let oversized = false;
        const parse = (prefix: Buffer): ThreadTokenUsage | undefined => {
          if (oversized || prefix.length + suffix.length > MAX_USAGE_LINE_BYTES) return undefined;
          const line = Buffer.concat([prefix, suffix]);
          if (!line.includes('token_count')) return undefined;
          try {
            const entry = JSON.parse(line.toString('utf8'));
            if (entry?.type !== 'event_msg' || entry.payload?.type !== 'token_count') return undefined;
            return normalizeThreadTokenUsage(entry.payload.info ?? entry.payload.token_usage ?? entry.payload.tokenUsage);
          } catch { return undefined; }
        };
        // Reverse block scanning keeps memory bounded even for huge embedded images.
        while (position > 0 && !usage) {
          const length = Math.min(BLOCK_BYTES, position);
          position -= length;
          const block = Buffer.allocUnsafe(length);
          const { bytesRead } = await file.read(block, 0, length, position);
          let end = bytesRead;
          for (let index = bytesRead - 1; index >= 0; index--) {
            if (block[index] !== 10) continue;
            usage = parse(block.subarray(index + 1, end));
            suffix = Buffer.alloc(0);
            oversized = false;
            end = index;
            if (usage) break;
          }
          if (!usage) {
            if (oversized || end + suffix.length > MAX_USAGE_LINE_BYTES) {
              oversized = true;
              suffix = Buffer.alloc(0);
            } else {
              suffix = Buffer.concat([block.subarray(0, end), suffix]);
            }
          }
        }
        if (!usage) usage = parse(Buffer.alloc(0));
      } finally {
        await file.close();
      }
      this.cache.set(path, { version, usage });
      return usage;
    } catch {
      // Missing, unreadable or concurrently removed logs must not break the list.
      return undefined;
    }
  }

  retain(paths: Set<string>): void {
    for (const path of this.cache.keys()) if (!paths.has(path)) this.cache.delete(path);
  }
}
