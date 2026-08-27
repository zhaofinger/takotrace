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

export interface TraceEvent {
  seq: number;
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
  raw: unknown;
}

export type CompactTraceEvent = Omit<TraceEvent, "raw">;

export interface Turn {
  id: string;
  status: TraceStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  items: TraceEvent[];
}

export type CompactTurn = Omit<Turn, "items"> & {
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
  historySource?: "app-server" | "rollout-file";
  createdAt: string;
  updatedAt: string;
  turns: CompactTurn[];
}

export interface ThreadDetail {
  id: string;
  title: string;
  cwd?: string;
  projectFolder?: string;
  status: TraceStatus;
  turnsLoaded?: boolean;
  historySource?: "app-server" | "rollout-file";
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

export interface ConnectionState {
  status: string;
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
