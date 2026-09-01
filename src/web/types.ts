export type TraceStatus =
  | "running"
  | "completed"
  | "complete"
  | "pending"
  | "blocked"
  | "approved"
  | "error"
  | "failed"
  | "disconnected"
  | string;

export type SessionProvider = "codex" | "claude";

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

export interface TurnContextSnapshot {
  source: "rollout-file" | "claude-history" | "claude-live";
  session: Record<string, unknown>;
  worldState: Record<string, unknown>;
  turn: Record<string, unknown>;
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
  status: TraceStatus;
  threadId: string;
  turnId?: string;
  itemId?: string;
  parentItemId?: string;
  summary: string;
  durationMs?: number;
  timingSource?: "observed" | "turn-fallback";
  model?: string;
  provider?: "codex" | "claude";
  context?: TurnContextSnapshot;
  raw: unknown;
}

export type CompactTraceEvent = Omit<TraceEvent, "raw" | "context">;

export interface Turn {
  id: string;
  status: TraceStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  model?: string;
  tokenUsage?: TokenUsageBreakdown;
  context?: TurnContextSnapshot;
  items: TraceEvent[];
}

export type CompactTurn = Omit<Turn, "items" | "context"> & {
  summary: string;
  itemCount: number;
  items: CompactTraceEvent[];
};

export interface Thread {
  id: string;
  title: string;
  cwd?: string;
  status: TraceStatus;
  turnsLoaded: boolean;
  historySource?: "app-server" | "rollout-file" | "claude";
  provider?: "codex" | "claude";
  createdAt: string;
  updatedAt: string;
  tokenUsage?: ThreadTokenUsage;
  turns: CompactTurn[];
}

export interface ThreadDetail {
  id: string;
  title: string;
  cwd?: string;
  projectFolder?: string;
  status: TraceStatus;
  turnsLoaded?: boolean;
  historySource?: "app-server" | "rollout-file" | "claude";
  provider?: "codex" | "claude";
  createdAt: string;
  updatedAt: string;
  turns: Turn[];
  sessionId?: string;
  parentThreadId?: string;
  agentNickname?: string;
  agentRole?: string;
  agentPath?: string;
  depth?: number;
  modelProvider?: string;
}

export type SubagentAssignmentAvailability = "available" | "encrypted" | "not-recorded";

export interface SubagentAssignment {
  availability: SubagentAssignmentAvailability;
  text?: string;
  source?: string;
  taskName?: string;
  agentType?: string;
  forkTurns?: string;
}

export interface SubagentDetail {
  thread: ThreadDetail;
  assignment: SubagentAssignment;
}

export interface ConnectionState {
  status: string;
  provider?: "codex" | "claude" | "all";
  userAgent?: string;
  error?: string;
}

export interface AppState {
  connection: ConnectionState;
  threads: Thread[];
  events: CompactTraceEvent[];
}

export interface SnapshotEvent {
  kind: "snapshot";
  state: AppState;
}
