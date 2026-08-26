export class JsonlParser<T = unknown> {
  private buffer = '';

  push(chunk: string | Buffer): T[] {
    this.buffer += chunk.toString();
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    return lines.flatMap((line) => this.parseLine(line));
  }

  end(): T[] {
    if (!this.buffer.trim()) {
      this.buffer = '';
      return [];
    }
    const line = this.buffer;
    this.buffer = '';
    return this.parseLine(line);
  }

  private parseLine(line: string): T[] {
    const value = line.trim();
    return value ? [JSON.parse(value) as T] : [];
  }
}
