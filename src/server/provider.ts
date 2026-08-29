import type { ProviderId, ProviderSelection, TraceEvent } from '../shared/types.js';

export type TraceInput = Omit<TraceEvent, 'seq' | 'at'> & Partial<Pick<TraceEvent, 'at'>>;

export interface TraceProviderEvents {
  onTrace(listener: (event: TraceInput) => void): () => void;
  onHistory(listener: (threads: unknown[], replace: boolean, provider?: ProviderId) => void): () => void;
  onError(listener: (error: Error) => void): () => void;
}

export interface TraceProviderActions {
  startThread(params?: Record<string, unknown>): Promise<{ thread?: { id?: unknown }; sessionId?: unknown } | unknown>;
  resumeThread(threadId: string, params?: Record<string, unknown>): Promise<unknown>;
  startTurn(threadId: string, text: string, params?: Record<string, unknown>): Promise<unknown>;
  readThread?(threadId: string): Promise<unknown>;
  syncThread?(threadId: string): Promise<unknown>;
}

export interface TraceProvider extends TraceProviderEvents, TraceProviderActions {
  readonly providerId?: ProviderId;
  start(): Promise<{ provider: ProviderSelection; userAgent?: string }>;
  stop(): Promise<void>;
}
