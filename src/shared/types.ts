export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
export type EntityStatus = 'pending' | 'running' | 'completed' | 'interrupted' | 'failed';
export type ProviderId = 'codex' | 'claude';
export type ProviderSelection = ProviderId | 'all';
export type HistorySource = 'app-server' | 'rollout-file' | 'claude';

export interface TokenUsageBreakdown {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

export interface ThreadTokenUsage {
  total: TokenUsageBreakdown;
  last: TokenUsageBreakdown;
  modelContextWindow?: number;
}

export interface TraceEvent {
  seq: number;
  startedSeq?: number;
  completedSeq?: number;
  at: string;
  startedAt?: string;
  completedAt?: string;
  method: string;
  type: string;
  status: EntityStatus;
  threadId: string;
  turnId?: string;
  itemId?: string;
  parentItemId?: string;
  summary: string;
  durationMs?: number;
  timingSource?: 'observed' | 'turn-fallback';
  model?: string;
  tokenUsage?: ThreadTokenUsage;
  provider?: ProviderId;
  raw: unknown;
}

export interface TurnState {
  id: string;
  status: EntityStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  model?: string;
  tokenUsage?: TokenUsageBreakdown;
  items: TraceEvent[];
}

export interface ThreadState {
  id: string;
  title: string;
  status: EntityStatus;
  turnsLoaded: boolean;
  historySource?: HistorySource;
  provider?: ProviderId;
  createdAt: string;
  updatedAt: string;
  cwd?: string;
  projectFolder?: string;
  tokenUsage?: ThreadTokenUsage;
  turns: TurnState[];
}

export interface AppState {
  connection: {
    status: ConnectionStatus;
    provider?: ProviderSelection;
    userAgent?: string;
    error?: string;
  };
  threads: ThreadState[];
  events: TraceEvent[];
}

export type CompactTraceEvent = Omit<TraceEvent, 'raw'>;
export type CompactTurnState = Omit<TurnState, 'items'> & {
  summary: string;
  itemCount: number;
  items: CompactTraceEvent[];
};
export type CompactThreadState = Omit<ThreadState, 'turns'> & { turns: CompactTurnState[] };

export interface CompactAppState {
  connection: AppState['connection'];
  threads: CompactThreadState[];
  events: [];
}

export interface HistoricalTurn {
  id: string;
  status: EntityStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  model?: string;
  tokenUsage?: TokenUsageBreakdown;
  items: Array<Omit<TraceEvent, 'seq'>>;
}

export interface HistoricalThread {
  id: string;
  sessionId?: string;
  forkedFromId?: string | null;
  parentThreadId?: string | null;
  title: string;
  status: EntityStatus;
  turnsLoaded: boolean;
  historySource?: HistorySource;
  provider?: ProviderId;
  createdAt: string;
  updatedAt: string;
  cwd?: string;
  projectFolder?: string;
  ephemeral?: boolean;
  modelProvider?: string;
  path?: string | null;
  cliVersion?: string;
  source?: unknown;
  threadSource?: string | null;
  agentNickname?: string | null;
  agentRole?: string | null;
  agentPath?: string | null;
  depth?: number;
  tokenUsage?: ThreadTokenUsage;
  turns: HistoricalTurn[];
}

export interface RpcNotification {
  method: string;
  params?: unknown;
}

export interface RpcRequest {
  id: number | string;
  method: string;
  params?: unknown;
}

export interface RpcResponse {
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type RpcMessage = RpcNotification | RpcRequest | RpcResponse;
