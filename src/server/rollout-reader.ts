import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline';
import { addTokenUsage, normalizeThreadTokenUsage, tokenUsageDelta } from '../shared/trace.js';
import type { ThreadTokenUsage, TokenUsageBreakdown } from '../shared/types.js';

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
  model?: string;
  tokenUsage?: TokenUsageBreakdown;
  items: Map<string, Record<string, unknown>>;
}

interface RolloutToolCall {
  arguments?: unknown;
  item?: Record<string, unknown>;
  result?: unknown;
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
  let activeTurnId: string | undefined;
  let mostRecentTurnId: string | undefined;
  let currentModel: string | undefined;
  let latestTokenUsage: ThreadTokenUsage | undefined;
  let previousTotal: TokenUsageBreakdown | undefined;
  const toolCalls = new Map<string, RolloutToolCall>();

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
    if (entry.type === 'world_state') {
      currentModel = stringField(record(payload.state).model) ?? currentModel;
      continue;
    }
    if (entry.type === 'response_item') {
      const responseType = stringField(payload.type);
      const callId = stringField(payload.call_id);
      if (!callId) continue;
      const toolCall = toolCalls.get(callId) ?? {};
      if (responseType === 'function_call') toolCall.arguments = parseJsonValue(payload.arguments);
      if (responseType === 'function_call_output') toolCall.result = parseJsonValue(payload.output);
      if (toolCall.item) attachToolCallMetadata(toolCall.item, toolCall);
      toolCalls.set(callId, toolCall);
      continue;
    }
    if (entry.type === 'session_meta') {
      sessionMeta = payload;
      continue;
    }
    if (entry.type === 'turn_context') {
      const turnId = stringField(payload.turn_id);
      if (turnId) {
        activeTurnId = turnId;
        mostRecentTurnId = turnId;
        const turn = getOrCreateTurn(turns, turnId);
        turn.model = stringField(payload.model)
          ?? stringField(record(payload.thread_settings).model)
          ?? turn.model
          ?? currentModel;
        currentModel = turn.model ?? currentModel;
      }
      continue;
    }
    if (entry.type !== 'event_msg') continue;

    const eventType = stringField(payload.type);
    if (eventType === 'thread_settings_applied') {
      currentModel = stringField(record(payload.thread_settings).model) ?? currentModel;
      continue;
    }
    if (eventType === 'token_count') {
      const tokenUsage = normalizeThreadTokenUsage(payload.info ?? payload.token_usage ?? payload.tokenUsage);
      if (!tokenUsage) continue;
      // task_complete normally follows the final token_count, but some rollouts flush usage just after it.
      // Prefer the active turn and otherwise keep that trailing snapshot on the most recently completed turn.
      const usageTurnId = activeTurnId ?? mostRecentTurnId;
      if (usageTurnId) {
        const turn = getOrCreateTurn(turns, usageTurnId);
        turn.tokenUsage = addTokenUsage(
          turn.tokenUsage,
          tokenUsageDelta(tokenUsage.total, previousTotal, tokenUsage.last),
        );
      }
      previousTotal = tokenUsage.total;
      latestTokenUsage = tokenUsage;
      continue;
    }
    const turnId = stringField(payload.turn_id);
    if (!eventType || !turnId) continue;
    const turn = getOrCreateTurn(turns, turnId);
    turn.model = stringField(payload.model) ?? turn.model ?? currentModel;
    if (eventType === 'task_started') {
      activeTurnId = turnId;
      mostRecentTurnId = turnId;
      turn.status = 'inProgress';
      turn.startedAt = numberField(payload.started_at) ?? timestamp ?? turn.startedAt;
      continue;
    }
    if (eventType === 'task_complete' || eventType === 'task_failed') {
      mostRecentTurnId = turnId;
      if (activeTurnId === turnId) activeTurnId = undefined;
      turn.status = eventType === 'task_failed' ? 'failed' : 'completed';
      turn.startedAt = numberField(payload.started_at) ?? turn.startedAt;
      turn.completedAt = numberField(payload.completed_at) ?? timestamp ?? turn.completedAt;
      turn.durationMs = numberField(payload.duration_ms) ?? turn.durationMs;
      continue;
    }
    if (eventType !== 'item_completed') continue;
    activeTurnId = turnId;
    mostRecentTurnId = turnId;

    const item = normalizeItem(payload.item, payload);
    const itemId = stringField(item.id);
    if (!itemId) continue;
    const toolCall = toolCalls.get(itemId);
    if (toolCall) {
      toolCall.item = item;
      attachToolCallMetadata(item, toolCall);
    }
    turn.items.set(itemId, item);
    if (!preview && item.type === 'userMessage') preview = itemText(item);
  }

  const historicalTurns = [...turns.values()]
    .filter((turn) => turn.items.size > 0 || turn.startedAt !== undefined || turn.completedAt !== undefined || turn.model !== undefined || turn.tokenUsage !== undefined)
    .map((turn) => ({
      id: turn.id,
      status: turn.status,
      ...(turn.startedAt === undefined ? {} : { startedAt: turn.startedAt }),
      ...(turn.completedAt === undefined ? {} : { completedAt: turn.completedAt }),
      ...(turn.durationMs === undefined ? {} : { durationMs: turn.durationMs }),
      ...(turn.model === undefined ? {} : { model: turn.model }),
      ...(turn.tokenUsage === undefined ? {} : { tokenUsage: turn.tokenUsage }),
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
      preview: truncate(preview ?? `Session ${threadId.slice(0, 8)}`, 160),
      status: { type: allCompleted ? 'idle' : 'active' },
      historySource: 'rollout-file',
      createdAt,
      updatedAt,
      cwd: stringField(sessionMeta.cwd),
      path: source,
      cliVersion: stringField(sessionMeta.cli_version),
      source: sessionMeta.source,
      threadSource: stringField(sessionMeta.thread_source),
      ...(latestTokenUsage === undefined ? {} : { tokenUsage: latestTokenUsage }),
      turns: historicalTurns,
    },
  };
}

function attachToolCallMetadata(item: Record<string, unknown>, toolCall: RolloutToolCall): void {
  if (toolCall.arguments !== undefined) item.arguments = toolCall.arguments;
  if (toolCall.result !== undefined) item.result = toolCall.result;
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string' || !value) return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
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
