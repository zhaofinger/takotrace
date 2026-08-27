import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline';

const THREAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RolloutReaderOptions {
  codexHome?: string;
}

export interface RolloutReadResult {
  source: string;
  thread: Record<string, unknown>;
}

interface RolloutTurn {
  id: string;
  status: string;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  items: Map<string, Record<string, unknown>>;
}

export async function readRolloutThread(
  threadId: string,
  options: RolloutReaderOptions = {},
): Promise<RolloutReadResult | undefined> {
  if (!THREAD_ID_PATTERN.test(threadId)) return undefined;
  const codexHome = options.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), '.codex');
  const source = await findRolloutFile(codexHome, threadId);
  if (!source) return undefined;

  const turns = new Map<string, RolloutTurn>();
  let sessionMeta: Record<string, unknown> = {};
  let firstTimestamp: number | undefined;
  let lastTimestamp: number | undefined;
  let preview: string | undefined;

  const lines = createInterface({ input: createReadStream(source, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of lines) {
    let entry: Record<string, unknown>;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!parsed || typeof parsed !== 'object') continue;
      entry = parsed as Record<string, unknown>;
    } catch {
      continue;
    }

    const timestamp = timestampSeconds(entry.timestamp);
    if (timestamp !== undefined) {
      firstTimestamp = firstTimestamp === undefined ? timestamp : Math.min(firstTimestamp, timestamp);
      lastTimestamp = lastTimestamp === undefined ? timestamp : Math.max(lastTimestamp, timestamp);
    }
    const payload = record(entry.payload);
    if (entry.type === 'session_meta') {
      sessionMeta = payload;
      continue;
    }
    if (entry.type === 'turn_context') {
      const turnId = stringField(payload.turn_id);
      if (turnId) getOrCreateTurn(turns, turnId);
      continue;
    }
    if (entry.type !== 'event_msg') continue;

    const eventType = stringField(payload.type);
    const turnId = stringField(payload.turn_id);
    if (!eventType || !turnId) continue;
    const turn = getOrCreateTurn(turns, turnId);
    if (eventType === 'task_started') {
      turn.status = 'inProgress';
      turn.startedAt = numberField(payload.started_at) ?? timestamp ?? turn.startedAt;
      continue;
    }
    if (eventType === 'task_complete' || eventType === 'task_failed') {
      turn.status = eventType === 'task_failed' ? 'failed' : 'completed';
      turn.startedAt = numberField(payload.started_at) ?? turn.startedAt;
      turn.completedAt = numberField(payload.completed_at) ?? timestamp ?? turn.completedAt;
      turn.durationMs = numberField(payload.duration_ms) ?? turn.durationMs;
      continue;
    }
    if (eventType !== 'item_completed') continue;

    const item = normalizeItem(payload.item, payload);
    const itemId = stringField(item.id);
    if (!itemId) continue;
    turn.items.set(itemId, item);
    if (!preview && item.type === 'userMessage') preview = itemText(item);
  }

  const historicalTurns = [...turns.values()]
    .filter((turn) => turn.items.size > 0 || turn.startedAt !== undefined || turn.completedAt !== undefined)
    .map((turn) => ({
      id: turn.id,
      status: turn.status,
      ...(turn.startedAt === undefined ? {} : { startedAt: turn.startedAt }),
      ...(turn.completedAt === undefined ? {} : { completedAt: turn.completedAt }),
      ...(turn.durationMs === undefined ? {} : { durationMs: turn.durationMs }),
      items: [...turn.items.values()],
    }));
  if (!historicalTurns.length) return undefined;

  const sessionTimestamp = timestampSeconds(sessionMeta.timestamp);
  const createdAt = sessionTimestamp ?? firstTimestamp ?? historicalTurns[0].startedAt ?? Date.now() / 1_000;
  const updatedAt = lastTimestamp ?? historicalTurns.at(-1)?.completedAt ?? createdAt;
  const allCompleted = historicalTurns.every((turn) => turn.status === 'completed');
  return {
    source,
    thread: {
      id: threadId,
      sessionId: stringField(sessionMeta.session_id),
      preview: truncate(preview ?? `Thread ${threadId.slice(0, 8)}`, 160),
      status: { type: allCompleted ? 'idle' : 'active' },
      historySource: 'rollout-file',
      createdAt,
      updatedAt,
      cwd: stringField(sessionMeta.cwd),
      path: source,
      cliVersion: stringField(sessionMeta.cli_version),
      source: sessionMeta.source,
      threadSource: stringField(sessionMeta.thread_source),
      turns: historicalTurns,
    },
  };
}

async function findRolloutFile(codexHome: string, threadId: string): Promise<string | undefined> {
  const suffix = `-${threadId}.jsonl`;
  const sessionRoot = join(codexHome, 'sessions');
  const years = await directories(sessionRoot);
  for (const year of years.sort().reverse()) {
    const months = await directories(join(sessionRoot, year));
    for (const month of months.sort().reverse()) {
      const days = await directories(join(sessionRoot, year, month));
      for (const day of days.sort().reverse()) {
        const directory = join(sessionRoot, year, month, day);
        const match = (await files(directory))
          .filter((name) => name.startsWith('rollout-') && name.endsWith(suffix))
          .sort()
          .at(-1);
        if (match) return join(directory, match);
      }
    }
  }

  const archivedRoot = join(codexHome, 'archived_sessions');
  const archived = (await files(archivedRoot))
    .filter((name) => name.startsWith('rollout-') && name.endsWith(suffix))
    .sort()
    .at(-1);
  return archived ? join(archivedRoot, archived) : undefined;
}

async function directories(path: string): Promise<string[]> {
  try {
    return (await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

async function files(path: string): Promise<string[]> {
  try {
    return (await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

function getOrCreateTurn(turns: Map<string, RolloutTurn>, id: string): RolloutTurn {
  let turn = turns.get(id);
  if (!turn) {
    turn = { id, status: 'pending', items: new Map() };
    turns.set(id, turn);
  }
  return turn;
}

function normalizeItem(value: unknown, event: Record<string, unknown>): Record<string, unknown> {
  const item = record(value);
  const type = lowerFirst(stringField(item.type) ?? 'item');
  const startedAtMs = numberField(event.started_at_ms);
  const completedAtMs = numberField(event.completed_at_ms);
  const normalized: Record<string, unknown> = {
    ...item,
    type,
    status: stringField(item.status) ?? 'completed',
  };
  if (Array.isArray(item.content)) {
    normalized.content = item.content.map((entry) => {
      const content = record(entry);
      return { ...content, type: lowerFirst(stringField(content.type) ?? 'content') };
    });
  }
  if (startedAtMs !== undefined) normalized.startedAt = startedAtMs / 1_000;
  if (completedAtMs !== undefined) normalized.completedAt = completedAtMs / 1_000;
  if (startedAtMs !== undefined && completedAtMs !== undefined) normalized.durationMs = completedAtMs - startedAtMs;
  copyAlias(normalized, item, 'agent_path', 'agentPath');
  copyAlias(normalized, item, 'agent_thread_id', 'agentThreadId');
  copyAlias(normalized, item, 'exit_code', 'exitCode');
  if (typeof item.summary_text === 'string') normalized.summary = [item.summary_text];
  return normalized;
}

function copyAlias(target: Record<string, unknown>, source: Record<string, unknown>, from: string, to: string): void {
  if (source[from] !== undefined && target[to] === undefined) target[to] = source[from];
}

function itemText(item: Record<string, unknown>): string | undefined {
  if (typeof item.text === 'string' && item.text.trim()) return item.text.trim();
  if (!Array.isArray(item.content)) return undefined;
  for (const value of item.content) {
    const content = record(value);
    if (typeof content.text === 'string' && content.text.trim()) return content.text.trim();
  }
  return undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function timestampSeconds(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp / 1_000;
}

function lowerFirst(value: string): string {
  return value ? `${value[0].toLowerCase()}${value.slice(1)}` : value;
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export function rolloutSourceName(result: RolloutReadResult): string {
  return basename(result.source);
}
