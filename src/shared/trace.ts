import type { EntityStatus, HistoricalThread, RpcNotification, TraceEvent } from './types.js';

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' ? (value as RecordValue) : {};
}

function stringAt(value: unknown, ...paths: string[][]): string | undefined {
  for (const path of paths) {
    let current: unknown = value;
    for (const key of path) current = record(current)[key];
    if (typeof current === 'string' && current) return current;
  }
  return undefined;
}

function numberAt(value: unknown, ...paths: string[][]): number | undefined {
  for (const path of paths) {
    let current: unknown = value;
    for (const key of path) current = record(current)[key];
    if (typeof current === 'number' && Number.isFinite(current)) return current;
  }
  return undefined;
}

function summaryFor(method: string, params: unknown): string {
  const values = record(params);
  const item = record(record(params).item);
  const content = Array.isArray(item.content) ? item.content : [];
  const firstText = content.map(record).find((entry) => entry.type === 'text');
  const text = stringAt(item, ['text'], ['command'], ['name'], ['tool'])
    ?? stringAt(firstText, ['text'])
    ?? stringAt(values, ['thread', 'name'], ['thread', 'preview']);
  if (text) {
    const summary = item.type === 'userMessage' ? extractUserRequest(text) : text;
    return summary.length > 160 ? `${summary.slice(0, 157)}...` : summary;
  }
  return method.replaceAll('/', ' ');
}

function extractUserRequest(text: string): string {
  const marker = /## My request:\s*/i.exec(text);
  return marker ? text.slice(marker.index + marker[0].length).trim() : text;
}

function eventStatus(method: string, params: unknown): EntityStatus {
  const explicit = stringAt(params, ['status'], ['turn', 'status'], ['item', 'status']);
  if (explicit === 'failed' || explicit === 'error' || explicit === 'cancelled') return 'failed';
  if (explicit === 'inProgress' || explicit === 'running') return 'running';
  if (explicit === 'completed' || explicit === 'approved') return 'completed';
  if (method.endsWith('/completed')) return 'completed';
  if (method.endsWith('/started')) return 'running';
  return 'pending';
}

function entityStatus(value: unknown): EntityStatus {
  if (value && typeof value === 'object') return entityStatus(record(value).type);
  if (value === 'failed' || value === 'error' || value === 'cancelled') return 'failed';
  if (value === 'inProgress' || value === 'running' || value === 'active') return 'running';
  if (value === 'completed' || value === 'complete' || value === 'approved' || value === 'idle') return 'completed';
  return 'pending';
}

function isoAt(value: unknown, fallback: string): string {
  return typeof value === 'number' && Number.isFinite(value) ? new Date(value * 1_000).toISOString() : fallback;
}

function folderName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '');
  return normalized.split(/[\\/]/).pop() || path;
}

function nullableString(value: unknown): string | null | undefined {
  return value === null || typeof value === 'string' ? value : undefined;
}

function subagentSpawnSource(value: unknown): RecordValue {
  const source = record(value);
  const subagent = record(source.subAgent ?? source.subagent);
  return record(subagent.thread_spawn ?? subagent.threadSpawn);
}

export function notificationToTrace(notification: RpcNotification): Omit<TraceEvent, 'seq'> {
  const params = notification.params;
  const method = notification.method;
  const type = stringAt(params, ['item', 'type'], ['type']) ?? method.split('/')[0] ?? 'unknown';
  const startedAtMs = numberAt(params, ['item', 'startedAtMs'], ['startedAtMs']);
  const completedAtMs = numberAt(params, ['item', 'completedAtMs'], ['completedAtMs']);
  const emittedAtMs = numberAt(notification, ['emittedAtMs'])
    ?? completedAtMs
    ?? startedAtMs;
  const turnAtSeconds = method.endsWith('/completed')
    ? numberAt(params, ['turn', 'completedAt'])
    : numberAt(params, ['turn', 'startedAt']);
  const timestamp = emittedAtMs ?? (turnAtSeconds === undefined ? Date.now() : turnAtSeconds * 1_000);
  return {
    at: new Date(timestamp).toISOString(),
    startedAt: startedAtMs === undefined
      ? (method.endsWith('/started') ? new Date(timestamp).toISOString() : undefined)
      : new Date(startedAtMs).toISOString(),
    completedAt: completedAtMs === undefined
      ? (method.endsWith('/completed') || method.endsWith('/failed') ? new Date(timestamp).toISOString() : undefined)
      : new Date(completedAtMs).toISOString(),
    method,
    type,
    status: eventStatus(method, params),
    threadId: stringAt(params, ['threadId'], ['thread_id'], ['thread', 'id']) ?? '',
    turnId: stringAt(params, ['turnId'], ['turn_id'], ['turn', 'id']),
    itemId: stringAt(params, ['itemId'], ['item_id'], ['item', 'id']),
    parentItemId: stringAt(params, ['parentItemId'], ['parent_item_id'], ['item', 'parentItemId'], ['item', 'parent_id']),
    summary: summaryFor(method, params),
    durationMs: numberAt(params, ['item', 'durationMs'], ['turn', 'durationMs']),
    raw: notification,
  };
}

export function threadToHistory(value: unknown): HistoricalThread | undefined {
  const thread = record(value);
  const id = stringAt(thread, ['id']);
  if (!id) return undefined;
  const createdAt = isoAt(thread.createdAt, new Date().toISOString());
  const updatedAt = isoAt(thread.updatedAt, createdAt);
  const cwd = stringAt(thread, ['cwd'], ['cwd', 'path']);
  const projectFolder = stringAt(thread, ['projectFolder']) ?? (cwd ? folderName(cwd) : undefined);
  const rawTurns = Array.isArray(thread.turns) ? thread.turns : [];
  const spawnSource = subagentSpawnSource(thread.source);
  const parentThreadId = nullableString(thread.parentThreadId) ?? nullableString(spawnSource.parent_thread_id);
  const agentNickname = nullableString(thread.agentNickname) ?? nullableString(spawnSource.agent_nickname);
  const agentRole = nullableString(thread.agentRole) ?? nullableString(spawnSource.agent_role);
  const agentPath = nullableString(thread.agentPath)
    ?? nullableString(spawnSource.agent_path)
    ?? nullableString(spawnSource.agentPath);
  return {
    id,
    sessionId: stringAt(thread, ['sessionId']),
    forkedFromId: nullableString(thread.forkedFromId),
    parentThreadId,
    title: stringAt(thread, ['name'], ['preview']) ?? `Thread ${id.slice(0, 8)}`,
    status: entityStatus(thread.status),
    turnsLoaded: thread.turnsLoaded === true,
    createdAt,
    updatedAt,
    cwd,
    projectFolder,
    ephemeral: typeof thread.ephemeral === 'boolean' ? thread.ephemeral : undefined,
    modelProvider: stringAt(thread, ['modelProvider']),
    path: nullableString(thread.path),
    cliVersion: stringAt(thread, ['cliVersion']),
    source: thread.source,
    threadSource: nullableString(thread.threadSource),
    agentNickname,
    agentRole,
    agentPath,
    depth: numberAt(thread, ['depth']) ?? numberAt(spawnSource, ['depth']),
    turns: rawTurns.flatMap((rawTurn) => {
      const turn = record(rawTurn);
      const turnId = stringAt(turn, ['id']);
      if (!turnId) return [];
      const status = entityStatus(turn.status);
      const startedAt = typeof turn.startedAt === 'number' ? isoAt(turn.startedAt, createdAt) : undefined;
      const completedAt = typeof turn.completedAt === 'number' ? isoAt(turn.completedAt, updatedAt) : undefined;
      const durationMs = numberAt(turn, ['durationMs']);
      const at = completedAt ?? startedAt ?? updatedAt;
      const rawItems = Array.isArray(turn.items) ? turn.items : [];
      const items = rawItems.flatMap((rawItem): Array<Omit<TraceEvent, 'seq'>> => {
        const item = record(rawItem);
        const itemId = stringAt(item, ['id']);
        if (!itemId) return [];
        const itemStatus = entityStatus(item.status);
        const finalStatus = itemStatus === 'pending' ? (status === 'completed' ? 'completed' : status) : itemStatus;
        const method = finalStatus === 'completed' || finalStatus === 'failed' ? 'item/completed' : 'item/started';
        const itemStartedAt = typeof item.startedAt === 'number' ? isoAt(item.startedAt, at) : undefined;
        const itemCompletedAt = typeof item.completedAt === 'number' ? isoAt(item.completedAt, at) : undefined;
        return [{
          at: itemCompletedAt ?? itemStartedAt ?? at,
          startedAt: itemStartedAt,
          completedAt: itemCompletedAt,
          method,
          type: stringAt(item, ['type']) ?? 'item',
          status: finalStatus,
          threadId: id,
          turnId,
          itemId,
          parentItemId: stringAt(item, ['parentItemId'], ['parent_id']),
          summary: summaryFor(method, { item }),
          durationMs: numberAt(item, ['durationMs']),
          raw: rawItem,
        }];
      });
      return [{ id: turnId, status, startedAt, completedAt, durationMs, items }];
    }),
  };
}
