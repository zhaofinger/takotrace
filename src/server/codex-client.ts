import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { JsonlParser } from '../shared/jsonl.js';
import type { RpcMessage, RpcNotification, RpcResponse } from '../shared/types.js';

export interface CodexClientOptions {
  command?: string;
  args?: string[];
  cwd?: string;
  requestTimeoutMs?: number;
  historyReadTimeoutMs?: number;
  historyRefreshMs?: number;
  historyPageSize?: number;
  historyThreadLimit?: number;
}

export interface ThreadStartInput {
  cwd?: string;
  model?: string;
  [key: string]: unknown;
}

export class CodexClient {
  private readonly emitter = new EventEmitter();
  private readonly options: CodexClientOptions;
  private readonly parser = new JsonlParser<RpcMessage>();
  private child?: ChildProcessWithoutNullStreams;
  private requestId = 1;
  private historyTimer?: NodeJS.Timeout;
  private historySync?: Promise<void>;
  private readonly threadVersions = new Map<string, number>();
  private readonly loadedThreadIds = new Set<string>();
  private readonly pending = new Map<number | string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }>();

  constructor(options: CodexClientOptions = {}) {
    this.options = options;
  }

  async start(): Promise<{ userAgent?: string }> {
    if (this.child) return {};
    const command = this.options.command ?? 'codex';
    const args = this.options.args ?? ['app-server', '--stdio'];
    const child = spawn(command, args, {
      cwd: this.options.cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    child.stdout.on('data', (chunk: Buffer) => this.consume(chunk));
    child.stderr.on('data', (chunk: Buffer) => this.emitter.emit('stderr', chunk.toString()));
    child.once('error', (error) => this.fail(error));
    child.once('exit', (code, signal) => {
      const detail = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`;
      this.fail(new Error(`codex app-server exited with ${detail}`));
    });

    const initialized = await this.request('initialize', {
      clientInfo: { name: 'thread-scope', title: 'ThreadScope', version: '0.1.0' },
      capabilities: { experimentalApi: true, requestAttestation: false },
    });
    this.notify('initialized');
    await this.refreshHistory();
    this.historyTimer = setInterval(() => {
      void this.refreshHistory().catch((error) => this.emitter.emit('stderr', `History sync failed: ${error instanceof Error ? error.message : error}\n`));
    }, this.options.historyRefreshMs ?? 10_000);
    this.historyTimer.unref();
    const result = initialized && typeof initialized === 'object'
      ? initialized as Record<string, unknown>
      : {};
    return { userAgent: typeof result.userAgent === 'string' ? result.userAgent : undefined };
  }

  async stop(): Promise<void> {
    if (this.historyTimer) clearInterval(this.historyTimer);
    this.historyTimer = undefined;
    const child = this.child;
    this.child = undefined;
    if (!child || child.exitCode !== null) return;
    child.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
        resolve();
      }, 1_500);
      timer.unref();
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  onNotification(listener: (notification: RpcNotification) => void): () => void {
    this.emitter.on('notification', listener);
    return () => this.emitter.off('notification', listener);
  }

  onError(listener: (error: Error) => void): () => void {
    this.emitter.on('clientError', listener);
    return () => this.emitter.off('clientError', listener);
  }

  onHistory(listener: (threads: unknown[], replace: boolean) => void): () => void {
    this.emitter.on('history', listener);
    return () => this.emitter.off('history', listener);
  }

  refreshHistory(): Promise<void> {
    if (this.historySync) return this.historySync;
    this.historySync = this.fetchHistory().finally(() => {
      this.historySync = undefined;
    });
    return this.historySync;
  }

  listThreads(cursor: string | null, limit: number): Promise<unknown> {
    return this.request('thread/list', { cursor, limit, sortKey: 'updated_at', sortDirection: 'desc' });
  }

  async readThread(threadId: string, includeTurns = true): Promise<unknown> {
    const timeoutMs = this.options.historyReadTimeoutMs ?? 120_000;
    if (!includeTurns) {
      return this.request('thread/read', { threadId, includeTurns: false }, timeoutMs);
    }
    try {
      return await this.request('thread/read', { threadId, includeTurns: true }, timeoutMs);
    } catch (error) {
      if (this.isDeserializationOrCorruptError(error)) {
        this.emitter.emit('stderr', `Warning: failed to read thread ${threadId} with turns: ${error instanceof Error ? error.message : error}. Falling back to includeTurns: false.\n`);
        return this.request('thread/read', { threadId, includeTurns: false }, timeoutMs);
      }
      throw error;
    }
  }

  async syncThread(threadId: string): Promise<unknown> {
    this.loadedThreadIds.add(threadId);
    try {
      const response = record(await this.readThread(threadId));
      const thread = response.thread;
      if (thread) {
        this.threadVersions.set(threadId, numberField(thread, 'updatedAt'));
        this.emitter.emit('history', [withTurnsLoaded(thread, true)], false);
      }
      return response;
    } catch (error) {
      this.emitter.emit('stderr', `Warning: syncThread failed for ${threadId}: ${error instanceof Error ? error.message : error}\n`);
      this.emitter.emit('history', [{ id: threadId, turnsLoaded: true }], false);
      return { thread: null };
    }
  }

  startThread(params: ThreadStartInput = {}): Promise<unknown> {
    return this.request('thread/start', params);
  }

  resumeThread(threadId: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return this.request('thread/resume', { ...params, threadId });
  }

  startTurn(threadId: string, text: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return this.request('turn/start', {
      ...params,
      threadId,
      input: [{ type: 'text', text, text_elements: [] }],
    });
  }

  request(method: string, params?: unknown, timeoutMs = this.options.requestTimeoutMs ?? 30_000): Promise<unknown> {
    const id = this.requestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC request timed out: ${method}`));
      }, timeoutMs);
      timer.unref();
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write({ id, method, ...(params === undefined ? {} : { params }) });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  notify(method: string, params?: unknown): void {
    this.write({ method, ...(params === undefined ? {} : { params }) });
  }

  private write(message: RpcMessage): void {
    if (!this.child?.stdin.writable) throw new Error('codex app-server is not running');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private async fetchHistory(): Promise<void> {
    const pageSize = this.options.historyPageSize ?? 50;
    const threadLimit = this.options.historyThreadLimit ?? 100;
    const listed: unknown[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | null = null;
    do {
      const response = record(await this.listThreads(cursor, pageSize));
      if (Array.isArray(response.data)) listed.push(...response.data);
      const nextCursor = typeof response.nextCursor === 'string' ? response.nextCursor : null;
      if (!nextCursor || seenCursors.has(nextCursor)) break;
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    } while (cursor && listed.length < threadLimit);

    listed.sort((left, right) => numberField(right, 'updatedAt') - numberField(left, 'updatedAt'));
    const selected = listed.slice(0, threadLimit);
    const selectedIds = new Set(selected.flatMap((value) => {
      const id = record(value).id;
      return typeof id === 'string' ? [id] : [];
    }));
    for (const value of listed.slice(threadLimit)) {
      const id = record(value).id;
      if (typeof id === 'string' && this.loadedThreadIds.has(id) && !selectedIds.has(id)) {
        selected.push(value);
        selectedIds.add(id);
      }
    }
    this.emitter.emit('history', selected.map((value) => withTurnsLoaded(value, false)), true);

    const listedById = new Map(selected.flatMap((value) => {
      const id = record(value).id;
      return typeof id === 'string' ? [[id, value] as const] : [];
    }));
    const hydrated = await mapLimit([...this.loadedThreadIds], 2, async (id) => {
      const listedThread = listedById.get(id);
      if (!listedThread) return undefined;
      const version = numberField(listedThread, 'updatedAt');
      if (this.threadVersions.get(id) === version) return undefined;
      try {
        const response = record(await this.readThread(id));
        const fullThread = response.thread ?? listedThread;
        this.threadVersions.set(id, version);
        return withTurnsLoaded(fullThread, true);
      } catch {
        return undefined;
      }
    });
    for (const id of this.threadVersions.keys()) {
      if (!selectedIds.has(id) && !this.loadedThreadIds.has(id)) this.threadVersions.delete(id);
    }
    const updates = hydrated.filter((value): value is NonNullable<typeof value> => value !== undefined);
    if (updates.length) this.emitter.emit('history', updates, false);
  }

  private consume(chunk: Buffer): void {
    let messages: RpcMessage[];
    try {
      messages = this.parser.push(chunk);
    } catch (error) {
      this.emitter.emit('clientError', error instanceof Error ? error : new Error(String(error)));
      return;
    }
    for (const message of messages) this.handleMessage(message);
  }

  private handleMessage(message: RpcMessage): void {
    if ('id' in message && !('method' in message)) {
      const response = message as RpcResponse;
      const request = this.pending.get(response.id);
      if (!request) return;
      clearTimeout(request.timer);
      this.pending.delete(response.id);
      if (response.error) request.reject(new Error(response.error.message));
      else request.resolve(response.result);
      return;
    }
    if ('method' in message) this.emitter.emit('notification', message as RpcNotification);
  }

  private isDeserializationOrCorruptError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /deserialize|unknown variant|corrupt|parse error/i.test(message);
  }

  private fail(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    this.emitter.emit('clientError', error);
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function numberField(value: unknown, key: string): number {
  const field = record(value)[key];
  return typeof field === 'number' && Number.isFinite(field) ? field : 0;
}

function withTurnsLoaded(value: unknown, turnsLoaded: boolean): Record<string, unknown> {
  return { ...record(value), turnsLoaded };
}

async function mapLimit<T, R>(values: T[], concurrency: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (index < values.length) {
      const current = index++;
      results[current] = await mapper(values[current]);
    }
  }));
  return results;
}
