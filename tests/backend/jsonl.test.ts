import { describe, expect, it } from 'vitest';
import { JsonlParser } from '../../src/shared/jsonl.js';

describe('JsonlParser', () => {
  it('handles fragmented and multiple messages', () => {
    const parser = new JsonlParser<{ id: number }>();
    expect(parser.push('{"id":1')).toEqual([]);
    expect(parser.push('}\n{"id":2}\n{"id"')).toEqual([{ id: 1 }, { id: 2 }]);
    expect(parser.push(':3}\n')).toEqual([{ id: 3 }]);
  });

  it('flushes a final line without a newline', () => {
    const parser = new JsonlParser<{ ok: boolean }>();
    parser.push('{"ok":true}');
    expect(parser.end()).toEqual([{ ok: true }]);
    expect(parser.end()).toEqual([]);
  });

  it('parses a large fragmented line without rescanning the whole buffer', () => {
    const parser = new JsonlParser<{ id: number; blob: string }>();
    const payload = JSON.stringify({ id: 7, blob: 'x'.repeat(2 * 1024 * 1024) });
    const chunk = Buffer.from(`${payload}\n`);
    expect(chunk.length).toBeGreaterThan(2 * 1024 * 1024);

    const messages: Array<{ id: number; blob: string }> = [];
    const step = 64 * 1024;
    for (let offset = 0; offset < chunk.length; offset += step) {
      messages.push(...parser.push(chunk.subarray(offset, offset + step)));
    }

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ id: 7 });
    expect(messages[0].blob).toHaveLength(2 * 1024 * 1024);
  });
});
