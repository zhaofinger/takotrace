export class JsonlParser<T = unknown> {
  private pendingChunks: Buffer[] = [];
  private pendingBytes = 0;

  push(chunk: string | Buffer): T[] {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    const messages: T[] = [];
    // Only the current chunk is scanned. Bytes before the last newline are never
    // revisited, so a multi-megabyte response stays linear instead of being
    // rescanned from the start on every chunk.
    let start = 0;
    let lineStart = 0;
    for (;;) {
      const newline = bytes.indexOf(0x0a, start);
      if (newline === -1) break;
      const tail = bytes.subarray(lineStart, newline);
      const line = this.pendingBytes === 0
        ? tail
        : Buffer.concat([...this.pendingChunks, tail], this.pendingBytes + tail.length);
      this.resetPending();
      messages.push(...this.parseLine(line.toString('utf8')));
      start = newline + 1;
      lineStart = newline + 1;
    }
    if (lineStart < bytes.length) {
      const tail = bytes.subarray(lineStart);
      this.pendingChunks.push(tail);
      this.pendingBytes += tail.length;
    }
    return messages;
  }

  end(): T[] {
    if (this.pendingChunks.length === 0) return [];
    const line = Buffer.concat(this.pendingChunks, this.pendingBytes);
    this.resetPending();
    return this.parseLine(line.toString('utf8'));
  }

  private resetPending(): void {
    this.pendingChunks = [];
    this.pendingBytes = 0;
  }

  private parseLine(line: string): T[] {
    const value = line.trim();
    if (!value) return [];
    try {
      return [JSON.parse(value) as T];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid JSON line: ${message}`);
    }
  }
}
