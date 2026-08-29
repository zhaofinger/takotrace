import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ProviderId } from '../../src/shared/types.js';
import type { TraceInput, TraceProvider } from '../../src/server/provider.js';
import { TakoTraceServer } from '../../src/server/http-server.js';
import { MultiProvider } from '../../src/server/multi-provider.js';

describe('provider-neutral server attach', () => {
  it('attaches trace, history, and error events from any TraceProvider', async () => {
    const provider = new StubProvider('claude');
    const server = new TakoTraceServer(provider, { port: 0 });
    server.attachProvider(provider);

    provider.emitError(new Error('provider down'));
    expect(server.store.snapshot().connection).toMatchObject({ status: 'error', error: 'provider down' });

    provider.emitTrace({
      method: 'item/started', type: 'tool', status: 'running', threadId: 't', turnId: 'u', itemId: 'i',
      summary: 'run', provider: 'claude', raw: { type: 'tool' },
    });
    expect(server.store.snapshot().events).toHaveLength(1);
    expect(server.store.snapshot().threads[0]).toMatchObject({ id: 't', provider: 'claude' });

    provider.emitHistory([{ id: 'h', name: 'h', preview: 'h', createdAt: 1, updatedAt: 1, status: 'completed', turnsLoaded: true, provider: 'claude', historySource: 'claude', turns: [] }], true);
    expect(server.store.snapshot().threads.some((thread) => thread.id === 'h' && thread.historySource === 'claude')).toBe(true);
    await server.close();
  });

  it('keeps attachCodex as a compatible thin wrapper', () => {
    const provider = new StubProvider('claude');
    const attachProvider = vi.spyOn(TakoTraceServer.prototype, 'attachProvider');
    const server = new TakoTraceServer(provider, { port: 0 });
    server.attachCodex(provider);
    expect(attachProvider).toHaveBeenCalledWith(provider);
  });
});

describe('MultiProvider aggregation', () => {
  it('starts all providers, forwards provider-scoped history, and isolates failures', async () => {
    const codex = new StubProvider('codex');
    const claude = new StubProvider('claude');
    const failing = new StubProvider('claude');
    failing.failStart = new Error('claude unavailable');
    const multi = new MultiProvider({ providers: [codex, claude, failing] });
    const errors: Error[] = [];
    multi.onError((error) => errors.push(error));

    const initialized = await multi.start();

    expect(initialized).toMatchObject({ provider: 'all' });
    expect(codex.startImpl).toHaveBeenCalledTimes(1);
    expect(claude.startImpl).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('failed to start');

    const threads: Array<{ threads: unknown[]; replace: boolean; provider?: string }> = [];
    multi.onHistory((value, replace, provider) => threads.push({ threads: value, replace, provider }));
    codex.emitHistory([{ id: 'codex-1' }], true);
    claude.emitHistory([{ id: 'claude-1' }], true);
    expect(threads).toHaveLength(2);
    expect(threads[0]).toEqual({ threads: [{ id: 'codex-1' }], replace: true, provider: 'codex' });
    expect(threads[1]).toEqual({ threads: [{ id: 'claude-1' }], replace: true, provider: 'claude' });

    const traces: TraceInput[] = [];
    multi.onTrace((event) => traces.push(event));
    codex.emitTrace({ method: 'item/started', type: 'tool', status: 'running', threadId: 't', summary: 'run', raw: {} });
    expect(traces).toHaveLength(1);

    await multi.stop();
    expect(codex.stopImpl).toHaveBeenCalledTimes(1);
    expect(claude.stopImpl).toHaveBeenCalledTimes(1);
  });

  it('throws when every provider fails to start', async () => {
    const codex = new StubProvider('codex');
    const claude = new StubProvider('claude');
    codex.failStart = new Error('codex down');
    claude.failStart = new Error('claude down');
    const multi = new MultiProvider({ providers: [codex, claude] });

    await expect(multi.start()).rejects.toThrow(/All providers failed to start/);
  });

  it('routes actions by explicit provider params', async () => {
    const codex = new StubProvider('codex');
    const claude = new StubProvider('claude');
    const multi = new MultiProvider({ providers: [codex, claude] });

    await multi.startThread({ provider: 'codex' });
    expect(codex.startThreadImpl).toHaveBeenCalledWith({});
    expect(claude.startThreadImpl).not.toHaveBeenCalled();
    await multi.startThread({ provider: 'claude' });
    expect(claude.startThreadImpl).toHaveBeenCalledWith({});
    await expect(multi.startThread({ provider: 'gemini' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(multi.startTurn('x', 'hi', { provider: 'gemini' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('routes actions by learned thread ownership, not UUID shape', async () => {
    const codexUuid = '01a040f7-4c03-7c50-89d9-4f424cd1e7c7';
    const claudeUuid = '6d39c4a2-8f91-4b6e-a5e2-6c8d1f0b3a99';
    const codex = new StubProvider('codex');
    const claude = new StubProvider('claude');
    const multi = new MultiProvider({ providers: [codex, claude] });

    codex.emitHistory([{ id: codexUuid }], true);
    claude.emitHistory([{ id: claudeUuid }], true);

    await multi.startTurn(codexUuid, 'hello');
    expect(codex.startTurnImpl).toHaveBeenCalledWith(codexUuid, 'hello', {});
    await multi.startTurn(claudeUuid, 'hello');
    expect(claude.startTurnImpl).toHaveBeenCalledWith(claudeUuid, 'hello', {});

    const traced = 'another-claude-uuid';
    claude.emitTrace({ method: 'thread/started', type: 'thread', status: 'running', threadId: traced, summary: 's', raw: {} });
    await multi.startTurn(traced, 'hello');
    expect(claude.startTurnImpl).toHaveBeenCalledWith(traced, 'hello', {});

    const created = await multi.startThread({ provider: 'claude' }) as { thread: { id: string } };
    await multi.startTurn(created.thread.id, 'hello');
    expect(claude.startTurnImpl).toHaveBeenCalledWith(created.thread.id, 'hello', {});

    await multi.resumeThread(codexUuid);
    expect(codex.resumeThreadImpl).toHaveBeenCalledWith(codexUuid, {});
    await multi.syncThread(codexUuid);
    expect(codex.syncThreadImpl).toHaveBeenCalledWith(codexUuid);
  });

  it('defaults unknown existing threads to codex', async () => {
    const codex = new StubProvider('codex');
    const claude = new StubProvider('claude');
    const multi = new MultiProvider({ providers: [codex, claude] });

    await multi.startTurn('some-unknown-thread', 'hello');
    expect(codex.startTurnImpl).toHaveBeenCalledWith('some-unknown-thread', 'hello', {});
  });
});

class StubProvider implements TraceProvider {
  private readonly emitter = new EventEmitter();
  readonly provider: ProviderId;
  failStart?: Error;

  readonly startImpl = vi.fn(async () => ({ provider: this.provider, userAgent: this.provider }));
  readonly stopImpl = vi.fn(async () => {});
  readonly startThreadImpl = vi.fn(async (params: Record<string, unknown> = {}) => ({ thread: { id: 'thread-1' }, params }));
  readonly resumeThreadImpl = vi.fn(async (threadId: string, params: Record<string, unknown> = {}) => ({ thread: { id: threadId }, params }));
  readonly startTurnImpl = vi.fn(async (threadId: string, text: string, params: Record<string, unknown> = {}) => ({ threadId, text, params }));
  readonly syncThreadImpl = vi.fn(async (threadId: string) => ({ thread: { id: threadId } }));

  constructor(provider: ProviderId) {
    this.provider = provider;
  }

  async start(): Promise<{ provider: ProviderId; userAgent?: string }> {
    if (this.failStart) throw this.failStart;
    return this.startImpl();
  }

  async stop(): Promise<void> {
    await this.stopImpl();
  }

  async startThread(params: Record<string, unknown> = {}): Promise<unknown> {
    return this.startThreadImpl(params);
  }

  async resumeThread(threadId: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return this.resumeThreadImpl(threadId, params);
  }

  async startTurn(threadId: string, text: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return this.startTurnImpl(threadId, text, params);
  }

  async syncThread(threadId: string): Promise<unknown> {
    return this.syncThreadImpl(threadId);
  }

  onTrace(listener: (event: TraceInput) => void): () => void {
    this.emitter.on('trace', listener);
    return () => this.emitter.off('trace', listener);
  }

  onHistory(listener: (threads: unknown[], replace: boolean, provider?: ProviderId) => void): () => void {
    this.emitter.on('history', listener);
    return () => this.emitter.off('history', listener);
  }

  onError(listener: (error: Error) => void): () => void {
    this.emitter.on('clientError', listener);
    return () => this.emitter.off('clientError', listener);
  }

  emitTrace(event: TraceInput): void {
    this.emitter.emit('trace', event);
  }

  emitHistory(threads: unknown[], replace: boolean): void {
    this.emitter.emit('history', threads, replace, this.provider);
  }

  emitError(error: Error): void {
    this.emitter.emit('clientError', error);
  }
}
