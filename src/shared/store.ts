import { EventEmitter } from 'node:events';
import { addTokenUsage, threadToHistory, tokenUsageDelta } from './trace.js';
import type {
  AppState, CompactAppState, ConnectionStatus, HistoricalThread, ThreadState, TraceEvent, TurnState,
} from './types.js';

export interface StoreLimits {
  events: number;
  turnsPerThread: number;
  itemsPerTurn: number;
}

const DEFAULT_LIMITS: StoreLimits = {
  events: 2_000,
  turnsPerThread: 100,
  itemsPerTurn: 500,
};

export class TraceStore {
  private readonly emitter = new EventEmitter();
  private readonly limits: StoreLimits;
  private readonly state: AppState = { connection: { status: 'connecting' }, threads: [], events: [] };
  private readonly liveThreadIds = new Set<string>();
  private historicalThreadIds = new Set<string>();
  private nextSeq = 1;

  constructor(limits: Partial<StoreLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  snapshot(): AppState {
    return structuredClone(this.state);
  }

  publicSnapshot(): CompactAppState {
    return {
      connection: { ...this.state.connection },
      events: [],
      threads: this.state.threads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        status: thread.status,
        turnsLoaded: thread.turnsLoaded,
        historySource: thread.historySource,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        cwd: thread.cwd,
        projectFolder: thread.projectFolder,
        tokenUsage: thread.tokenUsage,
        turns: thread.turns.map((turn) => ({
          id: turn.id,
          status: turn.status,
          startedAt: turn.startedAt,
          completedAt: turn.completedAt,
          durationMs: turn.durationMs,
          tokenUsage: turn.tokenUsage,
          summary: compactTurnSummary(turn),
          itemCount: turn.items.length,
          items: [],
        })),
      })),
    };
  }

  getTurn(threadId: string, turnId: string): TurnState | undefined {
    const turn = this.state.threads.find((thread) => thread.id === threadId)
      ?.turns.find((entry) => entry.id === turnId);
    if (!turn) return undefined;
    return {
      id: turn.id,
      status: turn.status,
      startedAt: turn.startedAt,
      completedAt: turn.completedAt,
      durationMs: turn.durationMs,
      tokenUsage: turn.tokenUsage,
      items: turn.items.map((item) => ({ ...item, raw: sanitizeRaw(item.raw) })),
    };
  }

  setConnection(status: ConnectionStatus, details: { userAgent?: string; error?: string } = {}): void {
    this.state.connection = { status, ...details };
    this.emitter.emit('state');
  }

  add(input: Omit<TraceEvent, 'seq' | 'at'> & Partial<Pick<TraceEvent, 'at'>>): TraceEvent {
    const event: TraceEvent = { ...input, seq: this.nextSeq++, at: input.at ?? new Date().toISOString() };
    if (event.threadId) this.liveThreadIds.add(event.threadId);
    const duplicate = this.findEvent(event);
    if (duplicate) {
      Object.assign(duplicate, event, { seq: duplicate.seq });
      this.reduce(duplicate);
      this.emitter.emit('event', duplicate);
      return duplicate;
    }
    this.state.events.push(event);
    trimStart(this.state.events, this.limits.events);
    this.reduce(event);
    this.emitter.emit('event', event);
    return event;
  }

  subscribe(listener: (event: TraceEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  subscribeState(listener: () => void): () => void {
    this.emitter.on('state', listener);
    return () => this.emitter.off('state', listener);
  }

  synchronizeThreads(values: unknown[], replace = true): void {
    const histories = values.flatMap((value) => {
      const thread = threadToHistory(value);
      return thread ? [thread] : [];
    });
    const nextHistoricalIds = new Set(histories.map((thread) => thread.id));
    for (const thread of histories) this.mergeHistoryThread(thread);
    if (replace) {
      this.state.threads = this.state.threads.filter((thread) =>
        !this.historicalThreadIds.has(thread.id) || nextHistoricalIds.has(thread.id) || this.liveThreadIds.has(thread.id));
      this.historicalThreadIds = nextHistoricalIds;
    } else {
      for (const id of nextHistoricalIds) this.historicalThreadIds.add(id);
    }
    this.state.threads.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    this.emitter.emit('state');
  }

  private reduce(event: TraceEvent): void {
    if (!event.threadId) return;
    const thread = this.getOrCreateThread(event);
    thread.updatedAt = event.at;
    if (event.method === 'thread/started') thread.status = 'running';
    if (event.method === 'thread/closed') thread.status = 'completed';
    const previousTotal = thread.tokenUsage?.total;
    if (event.tokenUsage) thread.tokenUsage = event.tokenUsage;
    if (!event.turnId) return;
    const turn = this.getOrCreateTurn(thread, event);
    if (event.tokenUsage) {
      turn.tokenUsage = addTokenUsage(
        turn.tokenUsage,
        tokenUsageDelta(event.tokenUsage.total, previousTotal, event.tokenUsage.last),
      );
    }
    if (event.method === 'turn/started') {
      turn.status = 'running';
      turn.startedAt ??= event.at;
      if (event.durationMs !== undefined) turn.durationMs = event.durationMs;
      thread.status = 'running';
    } else if (event.method === 'turn/completed') {
      turn.status = event.status;
      turn.completedAt = event.at;
      turn.durationMs = event.durationMs ?? elapsedMs(turn.startedAt, turn.completedAt) ?? turn.durationMs;
      thread.status = event.status;
    }
    if (event.itemId) {
      const existing = turn.items.find((item) => item.seq === event.seq || eventKey(item) === eventKey(event));
      if (existing) Object.assign(existing, event, { seq: existing.seq });
      else turn.items.push(event);
      trimStart(turn.items, this.limits.itemsPerTurn);
    }
  }


  private mergeHistoryThread(history: HistoricalThread): void {
    let thread = this.state.threads.find((entry) => entry.id === history.id);
    if (!thread) {
      thread = { ...history, turns: [] };
      this.state.threads.push(thread);
    } else {
      thread.title = history.title;
      thread.createdAt = history.createdAt;
      thread.turnsLoaded ||= history.turnsLoaded;
      thread.historySource = history.historySource ?? thread.historySource;
      thread.cwd = history.cwd ?? thread.cwd;
      thread.projectFolder = history.projectFolder ?? thread.projectFolder;
      if (!thread.tokenUsage || (history.tokenUsage?.total.totalTokens ?? -1) >= thread.tokenUsage.total.totalTokens) {
        thread.tokenUsage = history.tokenUsage ?? thread.tokenUsage;
      }
      if (history.updatedAt >= thread.updatedAt && !this.liveThreadIds.has(history.id)) {
        thread.status = history.status;
        thread.updatedAt = history.updatedAt;
      }
    }
    for (const historicalTurn of history.turns) {
      let turn = thread.turns.find((entry) => entry.id === historicalTurn.id);
      if (!turn) {
        turn = { ...historicalTurn, items: [] };
        thread.turns.push(turn);
      } else {
        turn.status = historicalTurn.status;
        turn.startedAt = historicalTurn.startedAt ?? turn.startedAt;
        turn.completedAt = historicalTurn.completedAt ?? turn.completedAt;
        turn.durationMs = historicalTurn.durationMs ?? turn.durationMs;
        if (!turn.tokenUsage || (historicalTurn.tokenUsage?.totalTokens ?? -1) >= turn.tokenUsage.totalTokens) {
          turn.tokenUsage = historicalTurn.tokenUsage ?? turn.tokenUsage;
        }
      }
      for (const input of historicalTurn.items) {
        const existing = this.findEvent(input);
        if (existing) {
          Object.assign(existing, input, { seq: existing.seq });
          if (!turn.items.some((item) => item.seq === existing.seq)) turn.items.push(existing);
          continue;
        }
        const event: TraceEvent = { ...input, seq: this.nextSeq++ };
        this.state.events.push(event);
        turn.items.push(event);
      }
      trimStart(turn.items, this.limits.itemsPerTurn);
    }
    trimStart(thread.turns, this.limits.turnsPerThread);
    trimStart(this.state.events, this.limits.events);
  }

  private findEvent(event: Pick<TraceEvent, 'method' | 'threadId' | 'turnId' | 'itemId'>): TraceEvent | undefined {
    if (!event.itemId) return undefined;
    const key = eventKey(event);
    return this.state.events.find((candidate) => eventKey(candidate) === key);
  }

  private getOrCreateThread(event: TraceEvent): ThreadState {
    let thread = this.state.threads.find((entry) => entry.id === event.threadId);
    if (!thread) {
      thread = {
        id: event.threadId,
        title: event.summary || `Session ${event.threadId.slice(0, 8)}`,
        status: event.status,
        turnsLoaded: true,
        createdAt: event.at,
        updatedAt: event.at,
        turns: [],
      };
      this.state.threads.push(thread);
    }
    return thread;
  }

  private getOrCreateTurn(thread: ThreadState, event: TraceEvent): TurnState {
    let turn = thread.turns.find((entry) => entry.id === event.turnId);
    if (!turn) {
      turn = { id: event.turnId!, status: event.status, startedAt: event.at, items: [] };
      thread.turns.push(turn);
      trimStart(thread.turns, this.limits.turnsPerThread);
    }
    return turn;
  }
}

function eventKey(event: Pick<TraceEvent, 'method' | 'threadId' | 'turnId' | 'itemId'>): string {
  return `${event.method}\0${event.threadId}\0${event.turnId ?? ''}\0${event.itemId ?? ''}`;
}

function trimStart<T>(values: T[], limit: number): void {
  if (values.length > limit) values.splice(0, values.length - limit);
}

function elapsedMs(startedAt: string | undefined, completedAt: string | undefined): number | undefined {
  if (!startedAt || !completedAt) return undefined;
  const duration = Date.parse(completedAt) - Date.parse(startedAt);
  return Number.isFinite(duration) && duration >= 0 ? duration : undefined;
}

function compactTurnSummary(turn: TurnState): string {
  const userMessage = turn.items.find((item) => normalizeType(item.type) === 'usermessage');
  if (userMessage?.summary) return userMessage.summary;
  let agentMessage: TraceEvent | undefined;
  for (let index = turn.items.length - 1; index >= 0; index -= 1) {
    if (normalizeType(turn.items[index].type) === 'agentmessage') {
      agentMessage = turn.items[index];
      break;
    }
  }
  return agentMessage?.summary || turn.items.find((item) => item.summary)?.summary || `Run ${turn.id}`;
}

function normalizeType(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z]/g, '');
}

const RAW_STRING_LIMIT = 32 * 1_024;

export function sanitizeRaw(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') {
    if (value.length <= RAW_STRING_LIMIT) return value;
    return `${value.slice(0, RAW_STRING_LIMIT)}\n[truncated ${value.length - RAW_STRING_LIMIT} chars]`;
  }
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[truncated circular reference]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => sanitizeRaw(entry, seen));
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeRaw(entry, seen)]));
}

export function publicHistoricalThread(thread: HistoricalThread): HistoricalThread {
  const bounded: HistoricalThread = {
    ...thread,
    turns: thread.turns.slice(-DEFAULT_LIMITS.turnsPerThread).map((turn) => ({
      ...turn,
      items: turn.items.slice(-DEFAULT_LIMITS.itemsPerTurn),
    })),
  };
  return sanitizeRaw(bounded) as HistoricalThread;
}
