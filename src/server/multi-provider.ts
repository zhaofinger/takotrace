import { EventEmitter } from 'node:events';
import type { ProviderId, ProviderSelection } from '../shared/types.js';
import type { TraceInput, TraceProvider } from './provider.js';

export interface MultiProviderOptions {
  providers: TraceProvider[];
}

export class MultiProvider implements TraceProvider {
  private readonly emitter = new EventEmitter();
  private readonly providers: TraceProvider[];
  private readonly unsubscribers: Array<() => void> = [];
  private readonly providerById = new Map<ProviderId, TraceProvider>();
  private readonly threadProvider = new Map<string, ProviderId>();
  private started = false;

  constructor(options: MultiProviderOptions) {
    this.providers = options.providers;
    for (const provider of this.providers) {
      const id = providerProviderId(provider);
      if (id) this.providerById.set(id, provider);
    }
    for (const provider of this.providers) {
      const id = providerProviderId(provider);
      this.unsubscribers.push(
        provider.onTrace((event) => {
          if (event.threadId && id) this.threadProvider.set(event.threadId, id);
          this.emitter.emit('trace', event);
        }),
        provider.onHistory((threads, replace, source) => {
          if (source) {
            for (const thread of threads) {
              const threadId = record(thread).id;
              if (typeof threadId === 'string') this.threadProvider.set(threadId, source);
            }
          }
          this.emitter.emit('history', threads, replace, source);
        }),
        provider.onError((error) => this.emitter.emit('clientError', error)),
      );
    }
  }

  async start(): Promise<{ provider: ProviderSelection; userAgent?: string }> {
    if (this.started) return { provider: 'all', userAgent: 'codex + claude' };
    const errors: Array<{ id: ProviderId | undefined; message: string }> = [];
    await Promise.all(this.providers.map(async (provider) => {
      try {
        await provider.start();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const id = providerProviderId(provider);
        this.emitter.emit('clientError', new Error(`Provider ${id ?? 'unknown'} failed to start: ${message}`));
        errors.push({ id, message });
      }
    }));
    if (errors.length === this.providers.length) {
      throw new Error(`All providers failed to start: ${errors.map((entry) => `${entry.id ?? 'unknown'}: ${entry.message}`).join('; ')}`);
    }
    this.started = true;
    return {
      provider: 'all',
      ...(errors.length ? { userAgent: `codex + claude (${errors.length} provider failed)` } : { userAgent: 'codex + claude' }),
    };
  }

  async stop(): Promise<void> {
    this.started = false;
    await Promise.allSettled(this.providers.map((provider) => provider.stop()));
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
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

  async startThread(params: Record<string, unknown> = {}): Promise<unknown> {
    const explicit = providerParam(params);
    const provider = this.resolveProvider(explicit);
    if (!provider) return Promise.reject(new Error('No providers configured'));
    const result = await provider.startThread(withoutProvider(params));
    const resultRecord = record(result);
    const resultThread = record(resultRecord.thread);
    const threadId = typeof resultThread.id === 'string'
      ? resultThread.id
      : typeof resultRecord.id === 'string'
        ? resultRecord.id
        : undefined;
    const providerId = explicit ?? providerProviderId(provider);
    if (threadId && providerId) this.threadProvider.set(threadId, providerId);
    return result;
  }

  async resumeThread(threadId: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return this.routeThreadAction('resumeThread', threadId, params);
  }

  async startTurn(threadId: string, text: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return this.routeThreadAction('startTurn', threadId, text, params);
  }

  async readThread(threadId: string): Promise<unknown> {
    const provider = this.providerForThread(threadId);
    if (!provider?.readThread) throw Object.assign(new Error('Thread provider does not support subagent details'), { statusCode: 501 });
    return provider.readThread(threadId);
  }

  async syncThread(threadId: string): Promise<unknown> {
    const provider = this.providerForThread(threadId);
    if (!provider?.syncThread) throw Object.assign(new Error('Thread provider does not support session sync'), { statusCode: 501 });
    return provider.syncThread(threadId);
  }

  private routeThreadAction(method: 'resumeThread' | 'startTurn', ...args: unknown[]): Promise<unknown> {
    const params = typeof args.at(-1) === 'object' && args.at(-1) !== null ? args.at(-1) as Record<string, unknown> : {};
    const explicit = providerParam(params);
    args[args.length - 1] = withoutProvider(params);
    const provider = this.resolveProvider(explicit);
    if (!provider) return Promise.reject(new Error('No providers configured'));
    if (!explicit) {
      const threadId = typeof args[0] === 'string' ? args[0] : undefined;
      const routed = threadId ? this.providerForThread(threadId) : undefined;
      if (routed) return callThreadAction(routed, method, args);
    }
    return callThreadAction(provider, method, args);
  }

  private resolveProvider(explicit: ProviderId | undefined): TraceProvider | undefined {
    if (explicit) {
      const provider = this.providerById.get(explicit);
      if (!provider) throw Object.assign(new Error(`Unknown provider: ${explicit}`), { statusCode: 400 });
      return provider;
    }
    return this.providers[0];
  }

  private providerForThread(threadId: string): TraceProvider | undefined {
    const id = this.threadProvider.get(threadId);
    if (id) return this.providerById.get(id);
    return this.providerById.get('codex') ?? this.providerById.get('claude');
  }
}

function providerParam(params: Record<string, unknown>): ProviderId | undefined {
  const value = params.provider;
  if (value === undefined) return undefined;
  if (value === 'codex' || value === 'claude') return value;
  throw Object.assign(new Error(`Unknown provider: ${String(value)}`), { statusCode: 400 });
}

function providerProviderId(provider: TraceProvider): ProviderId | undefined {
  if (provider.providerId) return provider.providerId;
  if ('provider' in provider) {
    const declared = (provider as { provider?: unknown }).provider;
    if (declared === 'codex' || declared === 'claude') return declared;
  }
  if (provider.constructor.name.includes('Codex')) return 'codex';
  if (provider.constructor.name.includes('Claude')) return 'claude';
  return undefined;
}

function withoutProvider(params: Record<string, unknown>): Record<string, unknown> {
  const { provider: _provider, ...rest } = params;
  return rest;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function callThreadAction(
  provider: TraceProvider,
  method: 'resumeThread' | 'startTurn',
  args: unknown[],
): Promise<unknown> {
  const threadId = args[0] as string;
  if (method === 'resumeThread') return provider.resumeThread(threadId, args[1] as Record<string, unknown>);
  return provider.startTurn(threadId, args[1] as string, args[2] as Record<string, unknown>);
}
