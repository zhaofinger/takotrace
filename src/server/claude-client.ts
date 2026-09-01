import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import {
  getSessionInfo,
  getSessionMessages,
  listSessions,
  query,
  type Options as ClaudeQueryOptions,
  type Query,
  type SDKSessionInfo,
  type SessionMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { ThreadTokenUsage, TokenUsageBreakdown, TurnContextSnapshot } from '../shared/types.js';
import type { TraceInput, TraceProvider } from './provider.js';

export interface ClaudeSdk {
  listSessions(options?: { dir?: string; limit?: number; offset?: number }): Promise<SDKSessionInfo[]>;
  getSessionInfo(sessionId: string, options?: { dir?: string }): Promise<SDKSessionInfo | undefined>;
  getSessionMessages(
    sessionId: string,
    options?: { dir?: string; limit?: number; offset?: number; includeSystemMessages?: boolean },
  ): Promise<SessionMessage[]>;
  query(params: { prompt: string; options?: ClaudeQueryOptions }): Query;
}

export interface ClaudeClientOptions {
  dir?: string;
  pathToClaudeCodeExecutable?: string;
  historyRefreshMs?: number;
  historyThreadLimit?: number;
  historyMessagesLimit?: number;
  sdk?: ClaudeSdk;
}

interface LiveMessage {
  type: string;
  uuid?: string;
  session_id?: string;
  parent_tool_use_id: string | null;
  message: unknown;
}

interface LiveResult {
  type: 'result';
  subtype: string;
  session_id?: string;
  result?: unknown;
  duration_ms?: number;
  usage?: unknown;
  modelUsage?: unknown;
}

export class ClaudeClient implements TraceProvider {
  readonly providerId = 'claude' as const;
  private readonly emitter = new EventEmitter();
  private readonly options: ClaudeClientOptions;
  private readonly sdk: ClaudeSdk;
  private historyTimer?: NodeJS.Timeout;
  private historySync?: Promise<void>;
  private started = false;
  private busy = false;
  private readonly sessionByThread = new Map<string, { sessionId: string; threadId: string }>();
  private pendingThreadId?: string;

  constructor(options: ClaudeClientOptions = {}) {
    this.options = options;
    this.sdk = options.sdk ?? { listSessions, getSessionInfo, getSessionMessages, query };
  }

  async start(): Promise<{ provider: 'claude'; userAgent?: string }> {
    if (this.started) return { provider: 'claude', userAgent: 'claude-agent-sdk' };
    await this.refreshHistory();
    this.started = true;
    this.historyTimer = setInterval(() => {
      if (this.busy) return;
      void this.refreshHistory().catch((error) => this.emitter.emit('clientError', error));
    }, this.options.historyRefreshMs ?? 10_000);
    this.historyTimer.unref();
    return { provider: 'claude', userAgent: 'claude-agent-sdk' };
  }

  async stop(): Promise<void> {
    if (this.historyTimer) clearInterval(this.historyTimer);
    this.historyTimer = undefined;
    this.started = false;
  }

  onTrace(listener: (event: TraceInput) => void): () => void {
    this.emitter.on('trace', listener);
    return () => this.emitter.off('trace', listener);
  }

  onHistory(listener: (threads: unknown[], replace: boolean, provider?: 'claude') => void): () => void {
    this.emitter.on('history', listener);
    return () => this.emitter.off('history', listener);
  }

  onError(listener: (error: Error) => void): () => void {
    this.emitter.on('clientError', listener);
    return () => this.emitter.off('clientError', listener);
  }

  refreshHistory(): Promise<void> {
    if (this.historySync) return this.historySync;
    this.historySync = this.fetchHistory().finally(() => {
      this.historySync = undefined;
    });
    return this.historySync;
  }

  private async fetchHistory(): Promise<void> {
    const limit = this.options.historyThreadLimit ?? 30;
    const sessions = await this.sdk.listSessions({ ...(this.options.dir === undefined ? {} : { dir: this.options.dir }), limit });
    const histories = await mapLimit(sessions, 2, async (session) => {
      const [messages, info] = await Promise.all([
        this.sdk.getSessionMessages(session.sessionId, {
          ...(this.options.dir === undefined ? {} : { dir: this.options.dir }),
          limit: this.options.historyMessagesLimit ?? 200,
          includeSystemMessages: true,
        }),
        this.sdk.getSessionInfo(session.sessionId, {
          ...(this.options.dir === undefined ? {} : { dir: this.options.dir }),
        }),
      ]);
      return sessionToHistory(info ?? session, messages);
    });
    this.emitter.emit('history', histories, true, 'claude');
  }

  startThread(_params: Record<string, unknown> = {}): Promise<unknown> {
    const threadId = this.pendingThreadId && !this.sessionByThread.has(this.pendingThreadId)
      ? this.pendingThreadId
      : randomUUID();
    this.pendingThreadId = threadId;
    return Promise.resolve({ thread: { id: threadId }, sessionId: null });
  }

  async resumeThread(threadId: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const sessionId = typeof params.sessionId === 'string' && params.sessionId ? params.sessionId : threadId;
    const info = await this.sdk.getSessionInfo(sessionId, {
      ...(this.options.dir === undefined ? {} : { dir: this.options.dir }),
    });
    if (!info) {
      throw Object.assign(new Error(`Claude session not found: ${sessionId}`), { statusCode: 404 });
    }
    this.rememberSession(threadId, sessionId);
    return {
      thread: {
        id: threadId,
        sessionId,
        summary: info.summary,
        cwd: info.cwd,
        lastModified: info.lastModified,
      },
      sessionId,
    };
  }

  async startTurn(threadId: string, text: string, _params: Record<string, unknown> = {}): Promise<unknown> {
    if (this.busy) {
      throw Object.assign(new Error('A Claude turn is already running'), { statusCode: 409 });
    }
    const sessionId = this.sessionByThread.get(threadId)?.sessionId;
    const isPending = this.pendingThreadId === threadId && sessionId === undefined;
    const resumeSessionId = sessionId ?? (isPending ? undefined : threadId);
    const turnId = randomUUID();
    this.busy = true;
    let resolvedSessionId: string | undefined = sessionId ?? (isPending ? threadId : undefined);
    const startAt = Date.now();
    try {
      const live = this.sdk.query({
        prompt: text,
        options: {
          ...(resumeSessionId ? { resume: resumeSessionId } : { sessionId: threadId }),
          includePartialMessages: false,
          permissionMode: 'default',
          ...(this.options.pathToClaudeCodeExecutable === undefined
            ? {}
            : { pathToClaudeCodeExecutable: this.options.pathToClaudeCodeExecutable }),
        },
      });
      let emittedThreadStarted = false;
      let emittedTurnStarted = false;
      let resultReceived = false;
      let liveContext: TurnContextSnapshot | undefined;
      const activeTools = new Map<string, Record<string, unknown>>();
      for await (const message of live) {
        if (message.type === 'system' && message.subtype === 'init') {
          resolvedSessionId = message.session_id;
          if (resolvedSessionId) this.rememberSession(threadId, resolvedSessionId);
          this.emitTrace({
            method: 'thread/started', type: 'thread', status: 'running', threadId, at: nowIso(),
            summary: 'Claude session started',
            provider: 'claude', raw: message,
          });
          emittedThreadStarted = true;
          let contextUsage: unknown;
          if (typeof live.getContextUsage === 'function') {
            try {
              contextUsage = await live.getContextUsage();
            } catch {
              // Context usage is optional and must not make an otherwise valid turn fail.
            }
          }
          liveContext = claudeContext(undefined, message, undefined, contextUsage, 'claude-live');
          if (!emittedTurnStarted) {
            this.emitTrace({
              method: 'turn/started', type: 'turn', status: 'running', threadId, turnId, at: nowIso(),
              summary: 'Claude turn started',
              model: messageModel(message),
              provider: 'claude', context: liveContext,
              raw: { type: 'turn', subtype: 'started', thread_id: threadId, turn_id: turnId },
            });
            emittedTurnStarted = true;
          }
          continue;
        }
        if (message.type === 'user') {
          this.emitUserMessage(threadId, turnId, message, activeTools);
          continue;
        }
        if (message.type === 'assistant') {
          if (!emittedThreadStarted) {
            this.emitTrace({
              method: 'thread/started', type: 'thread', status: 'running', threadId, at: nowIso(),
              summary: 'Claude session started',
              provider: 'claude', raw: { type: 'system', subtype: 'init', session_id: message.session_id },
            });
            emittedThreadStarted = true;
          }
          if (!emittedTurnStarted) {
            this.emitTrace({
              method: 'turn/started', type: 'turn', status: 'running', threadId, turnId, at: nowIso(),
              summary: 'Claude turn started',
              provider: 'claude', raw: { type: 'turn', subtype: 'started', thread_id: threadId, turn_id: turnId },
            });
            emittedTurnStarted = true;
          }
          this.emitAssistantMessage(threadId, turnId, message, activeTools);
          continue;
        }
        if (message.type === 'result') {
          if (!resolvedSessionId && message.session_id) {
            resolvedSessionId = message.session_id;
            this.rememberSession(threadId, resolvedSessionId);
          }
          if (!emittedTurnStarted) {
            this.emitTrace({
              method: 'turn/started', type: 'turn', status: 'running', threadId, turnId, at: nowIso(),
              summary: 'Claude turn started',
              provider: 'claude', raw: { type: 'turn', subtype: 'started', thread_id: threadId, turn_id: turnId },
            });
            emittedTurnStarted = true;
          }
          resultReceived = true;
          this.emitResult(threadId, turnId, message, startAt, liveContext);
          continue;
        }
      }
      if (!resultReceived) {
        this.emitTrace({
          method: 'turn/completed', type: 'turn', status: 'failed', threadId, turnId, at: nowIso(),
          durationMs: Date.now() - startAt, provider: 'claude',
          summary: 'Claude turn failed',
          raw: { type: 'result', subtype: 'error', is_error: true, result: 'Turn ended without a result message' },
        });
      }
      return { turnId, threadId, sessionId: resolvedSessionId };
    } catch (error) {
      this.emitTrace({
        method: 'turn/completed', type: 'turn', status: 'failed', threadId, turnId, at: nowIso(),
        durationMs: Date.now() - startAt, provider: 'claude',
        summary: 'Claude turn failed',
        raw: { type: 'result', subtype: 'error', is_error: true, result: errorMessage(error) },
      });
      throw error;
    } finally {
      this.busy = false;
      void this.refreshHistory().catch((error) => this.emitter.emit('clientError', error));
    }
  }

  private emitTrace(event: TraceInput): void {
    this.emitter.emit('trace', event);
  }

  private emitUserMessage(
    threadId: string,
    turnId: string,
    message: LiveMessage,
    activeTools: Map<string, Record<string, unknown>>,
  ): void {
    const blocks = messageBlocks(message);
    for (const [index, block] of blocks.entries()) {
      if (block.type === 'text' && message.parent_tool_use_id !== null) continue;
      const item = userBlockItem(message, block, index);
      if (!item) continue;
      const text = typeof item.text === 'string' ? item.text : '';
      const toolUseId = typeof item.tool_use_id === 'string' ? item.tool_use_id : undefined;
      const startedTool = toolUseId ? activeTools.get(toolUseId) : undefined;
      if (toolUseId) activeTools.delete(toolUseId);
      this.emitTrace({
        method: toolUseId ? 'item/completed' : 'item/started',
        type: startedTool && typeof startedTool.type === 'string'
          ? startedTool.type
          : typeof item.type === 'string' ? item.type : 'userMessage',
        status: 'completed', threadId, turnId,
        itemId: toolUseId ?? (typeof item.id === 'string' ? item.id : `msg-${index}`),
        summary: text.slice(0, 160), at: nowIso(), provider: 'claude',
        raw: startedTool ? { ...startedTool, result: item } : item,
      });
    }
  }

  private emitAssistantMessage(
    threadId: string,
    turnId: string,
    message: LiveMessage,
    activeTools: Map<string, Record<string, unknown>>,
  ): void {
    const blocks = messageBlocks(message);
    for (const [index, block] of blocks.entries()) {
      const item = assistantBlockItem(message, block, index);
      if (!item) continue;
      const type = item.type as string;
      const isToolUse = block.type === 'tool_use';
      const itemId = typeof item.id === 'string' ? item.id : `${message.uuid}:${index}`;
      if (isToolUse) activeTools.set(itemId, item);
      this.emitTrace({
        method: isToolUse ? 'item/started' : 'item/completed',
        type, status: isToolUse ? 'running' : 'completed', threadId, turnId,
        itemId,
        model: messageModel(message),
        parentItemId: item.parentItemId as string | undefined,
        summary: summaryForItem(item), at: nowIso(), provider: 'claude', raw: item,
      });
    }
  }

  private emitResult(
    threadId: string,
    turnId: string,
    message: LiveResult,
    startAt: number,
    context?: TurnContextSnapshot,
  ): void {
    const success = message.subtype === 'success';
    const result = typeof message.result === 'string' ? message.result : '';
    const durationMs = typeof message.duration_ms === 'number' ? message.duration_ms : Date.now() - startAt;
    const usage = normalizeUsage(message.modelUsage) ?? normalizeUsage(message.usage);
    this.emitTrace({
      method: 'turn/completed', type: 'turn', status: success ? 'completed' : 'failed', threadId, turnId,
      durationMs, model: modelFromUsage(message.modelUsage), tokenUsage: usage, at: nowIso(), provider: 'claude',
      context,
      summary: result.length > 160 ? `${result.slice(0, 157)}...` : result || 'Claude turn completed',
      raw: message,
    });
  }

  private rememberSession(threadId: string, sessionId: string): void {
    this.sessionByThread.set(threadId, { sessionId, threadId });
    if (this.pendingThreadId === threadId) this.pendingThreadId = undefined;
  }
}

export function sessionToHistory(session: SDKSessionInfo, messages: SessionMessage[]): unknown {
  return {
    id: session.sessionId,
    name: session.customTitle ?? session.summary ?? session.firstPrompt,
    preview: session.summary ?? session.firstPrompt,
    createdAt: isoAtMs(session.createdAt ?? session.lastModified),
    updatedAt: isoAtMs(session.lastModified),
    cwd: session.cwd,
    status: 'completed',
    turnsLoaded: true,
    historySource: 'claude',
    provider: 'claude',
    modelProvider: 'claude',
    turns: messagesToTurns(session.sessionId, messages, session),
  };
}

export function messagesToTurns(
  sessionId: string,
  messages: SessionMessage[],
  session?: SDKSessionInfo,
): Array<Record<string, unknown>> {
  const turns: Array<{
    id: string;
    status: string;
    model?: string;
    context?: TurnContextSnapshot;
    items: Array<Record<string, unknown>>;
  }> = [];
  let current: (typeof turns)[number] | undefined;
  let latestInit: Record<string, unknown> | undefined;
  let latestCompact: Record<string, unknown> | undefined;
  for (const message of messages) {
    if (message.type === 'system') {
      const system = systemMessageRecord(message);
      if (system.subtype === 'init') latestInit = system;
      if (system.subtype === 'compact_boundary') {
        latestCompact = record(system.compact_metadata);
        if (current) current.context = claudeContext(session, latestInit, latestCompact);
      }
      continue;
    }
    const blocks = messageBlocks(message);
    if (message.type === 'user') {
      const answersToolUse = message.parent_tool_use_id !== null
        || blocks.some((block) => block.type === 'tool_result');
      if (!answersToolUse) {
        current = {
          id: message.uuid,
          status: 'completed',
          context: claudeContext(session, latestInit, latestCompact),
          items: [],
        };
        turns.push(current);
        latestCompact = undefined;
      } else if (!current) {
        current = {
          id: `${sessionId}:turn-${message.uuid}`,
          status: 'completed',
          context: claudeContext(session, latestInit, latestCompact),
          items: [],
        };
        turns.push(current);
        latestCompact = undefined;
      }
      for (const [index, block] of blocks.entries()) {
        const item = userBlockItem(message, block, index);
        if (item) current!.items.push(item);
      }
      continue;
    }
    if (!current) {
      current = {
        id: `${sessionId}:turn-${message.uuid}`,
        status: 'completed',
        context: claudeContext(session, latestInit, latestCompact),
        items: [],
      };
      turns.push(current);
      latestCompact = undefined;
    }
    current.model = messageModel(message) ?? current.model;
    if (current.model && current.context) {
      current.context.session.model = current.model;
    }
    for (const [index, block] of blocks.entries()) {
      const item = assistantBlockItem(message, block, index);
      if (item) current.items.push(item);
    }
  }
  return turns;
}

function systemMessageRecord(message: SessionMessage): Record<string, unknown> {
  const outer = record(message);
  return { ...record(outer.message), ...outer };
}

function claudeContext(
  session?: SDKSessionInfo,
  initValue?: unknown,
  compactMetadata?: Record<string, unknown>,
  contextUsage?: unknown,
  source: TurnContextSnapshot['source'] = 'claude-history',
): TurnContextSnapshot {
  const init = record(initValue);
  return {
    source,
    session: definedRecord({
      cwd: init.cwd ?? session?.cwd,
      git_branch: session?.gitBranch,
      tag: session?.tag,
      created_at: session?.createdAt,
      last_modified: session?.lastModified,
      file_size: session?.fileSize,
      claude_code_version: init.claude_code_version,
      model: init.model,
    }),
    worldState: definedRecord({
      permission_mode: init.permissionMode ?? init.permission_mode,
      tools: init.tools,
      mcp_servers: init.mcp_servers,
      skills: init.skills,
      plugins: init.plugins,
      agents: init.agents,
      slash_commands: init.slash_commands,
      terminal_slash_commands: init.terminal_slash_commands,
      output_style: init.output_style,
      effort: init.effort,
      capabilities: init.capabilities,
    }),
    turn: definedRecord({
      compact_boundary: compactMetadata,
      context_usage: contextUsage,
    }),
  };
}

function definedRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function messageModel(value: unknown): string | undefined {
  const message = record(value);
  const nested = record(message.message);
  return typeof message.model === 'string' && message.model
    ? message.model
    : typeof nested.model === 'string' && nested.model ? nested.model : undefined;
}

function modelFromUsage(value: unknown): string | undefined {
  const models = Object.keys(record(value));
  return models.length === 1 ? models[0] : undefined;
}

function messageBlocks(message: Pick<LiveMessage, 'message'>): Array<Record<string, unknown>> {
  const content = record(message.message).content;
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  if (Array.isArray(content)) return content.map(record);
  if (content && typeof content === 'object') return [record(content)];
  return [];
}

function userBlockItem(
  message: LiveMessage,
  block: Record<string, unknown>,
  index: number,
): Record<string, unknown> | undefined {
  const base = { id: `${message.uuid}:${index}`, status: 'completed', sessionMessage: message };
  if (block.type === 'text') {
    const text = typeof block.text === 'string' ? block.text : '';
    return { ...base, type: 'userMessage', text, content: [{ type: 'text', text }] };
  }
  if (block.type === 'tool_result') {
    const text = blockText(block.content);
    const toolUseId = typeof block.tool_use_id === 'string' ? block.tool_use_id : undefined;
    return {
      ...base,
      type: 'toolResult',
      text,
      tool_use_id: toolUseId,
      parentItemId: message.parent_tool_use_id ?? toolUseId,
      content: [{ type: 'text', text }],
    };
  }
  return undefined;
}

function assistantBlockItem(
  message: LiveMessage,
  block: Record<string, unknown>,
  index: number,
): Record<string, unknown> | undefined {
  const base = {
    id: typeof block.id === 'string' ? block.id : `${message.uuid}:${index}`,
    status: 'completed',
    parentItemId: message.parent_tool_use_id ?? undefined,
    sessionMessage: message,
  };
  if (block.type === 'text') {
    const text = typeof block.text === 'string' ? block.text : '';
    return { ...base, type: 'agentMessage', text, content: [{ type: 'text', text }] };
  }
  if (block.type === 'thinking') {
    const thinking = typeof block.thinking === 'string' ? block.thinking : '';
    return { ...base, type: 'reasoning', text: thinking, content: [{ type: 'thinking', thinking }] };
  }
  if (block.type === 'redacted_thinking') {
    return { ...base, type: 'reasoning', text: '[redacted thinking]' };
  }
  if (block.type === 'tool_use') {
    const name = typeof block.name === 'string' ? block.name : 'tool';
    return {
      ...base,
      type: 'tool',
      name,
      tool: name,
      input: block.input,
      text: toolSummary(name, block.input),
    };
  }
  return undefined;
}

function blockText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .map(record)
    .filter((block) => typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('\n');
}

function toolSummary(name: string, input: unknown): string {
  let serialized: string;
  try {
    serialized = input === undefined ? '' : JSON.stringify(input);
  } catch {
    serialized = String(input);
  }
  if (!serialized) return name;
  const combined = `${name} ${serialized}`;
  return combined.length > 200 ? `${combined.slice(0, 197)}...` : combined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function isoAtMs(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value).toISOString()
    : new Date().toISOString();
}

function nowIso(): string {
  return new Date().toISOString();
}

function summaryForItem(item: Record<string, unknown>): string {
  const text = typeof item.text === 'string' ? item.text : '';
  return text ? (text.length > 160 ? `${text.slice(0, 157)}...` : text) : `Claude ${item.type ?? 'item'}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeUsage(value: unknown): ThreadTokenUsage | undefined {
  const total = normalizeBreakdown(value) ?? aggregateModelUsage(value);
  return total ? { total, last: total } : undefined;
}

function normalizeBreakdown(value: unknown): TokenUsageBreakdown | undefined {
  const source = record(value);
  const inputTokens = num(source.input_tokens) ?? num(source.inputTokens);
  const outputTokens = num(source.output_tokens) ?? num(source.outputTokens);
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  const cacheReadInputTokens = num(source.cache_read_input_tokens) ?? num(source.cacheReadInputTokens) ?? 0;
  const cacheWriteInputTokens = num(source.cache_creation_input_tokens) ?? num(source.cacheCreationInputTokens) ?? 0;
  const reasoningOutputTokens = num(record(source.output_tokens_details).thinking_tokens)
    ?? num(record(source.outputTokensDetails).reasoning_tokens)
    ?? 0;
  return {
    totalTokens: (inputTokens ?? 0) + cacheReadInputTokens + cacheWriteInputTokens + (outputTokens ?? 0),
    inputTokens: inputTokens ?? 0,
    cachedInputTokens: cacheReadInputTokens,
    cacheWriteInputTokens,
    outputTokens: outputTokens ?? 0,
    reasoningOutputTokens,
  };
}

function aggregateModelUsage(value: unknown): TokenUsageBreakdown | undefined {
  const source = record(value);
  const entries = Object.values(source);
  if (!entries.length || !entries.every((entry) => entry && typeof entry === 'object')) return undefined;
  let total: TokenUsageBreakdown | undefined;
  for (const entry of entries) {
    const part = normalizeBreakdown(entry);
    if (!part) continue;
    total = total ? {
      totalTokens: total.totalTokens + part.totalTokens,
      inputTokens: total.inputTokens + part.inputTokens,
      cachedInputTokens: total.cachedInputTokens + part.cachedInputTokens,
      cacheWriteInputTokens: total.cacheWriteInputTokens + part.cacheWriteInputTokens,
      outputTokens: total.outputTokens + part.outputTokens,
      reasoningOutputTokens: total.reasoningOutputTokens + part.reasoningOutputTokens,
    } : part;
  }
  return total;
}

async function mapLimit<T, R>(values: T[], concurrency: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (index < values.length) {
      const current = index++;
      results[current] = await mapper(values[current]);
    }
  }));
  return results;
}
