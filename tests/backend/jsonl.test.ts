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
});
