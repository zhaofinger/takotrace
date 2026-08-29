import { describe, expect, it, vi } from 'vitest';
import type { Query, SDKSessionInfo, SDKMessage, SessionMessage } from '@anthropic-ai/claude-agent-sdk';
import { ClaudeClient, messagesToTurns, sessionToHistory, type ClaudeSdk } from '../../src/server/claude-client.js';

describe('ClaudeClient history mapping', () => {
  it('maps sessions and messages to history with canonical item raw', async () => {
    const session: SDKSessionInfo = {
      sessionId: 'session-1',
      summary: 'Investigate flaky tests',
      firstPrompt: 'Investigate flaky tests',
      customTitle: 'Flaky tests',
      lastModified: 1_767_225_603_000,
      createdAt: 1_767_225_600_000,
      cwd: '/tmp/project',
    };
    const messages = [
      message('user', 'u-1', null, { type: 'text', text: 'Fix the login bug' }),
      message('assistant', 'a-1', null, { type: 'thinking', thinking: 'Check the auth flow' }),
      message('assistant', 'a-2', null, { type: 'text', text: 'I will fix it' }),
      message('assistant', 'a-3', null, { type: 'tool_use', id: 'tool-1', name: 'Edit', input: { file: 'a.ts' } }),
      message('user', 'u-2', 'tool-1', { type: 'tool_result', tool_use_id: 'tool-1', content: [{ type: 'text', text: 'updated' }] }),
      message('assistant', 'a-4', 'sub-1', { type: 'text', text: 'subagent report' }),
    ];
    const sdk = fakeSdk([session], messages, session);
    const client = new ClaudeClient({ sdk });
    const snapshots: Array<{ threads: unknown[]; replace: boolean }> = [];
    client.onHistory((threads, replace) => snapshots.push({ threads, replace }));

    const initialized = await client.start();

    expect(initialized).toEqual({ provider: 'claude', userAgent: 'claude-agent-sdk' });
    expect(sdk.listSessions).toHaveBeenCalledWith({ limit: 30 });
    expect(sdk.getSessionMessages).toHaveBeenCalledWith('session-1', { limit: 200, includeSystemMessages: true });
    expect(sdk.getSessionInfo).toHaveBeenCalledWith('session-1', {});
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].replace).toBe(true);
    expect(snapshots[0].threads[0]).toMatchObject({
      id: 'session-1',
      name: 'Flaky tests',
      historySource: 'claude',
      provider: 'claude',
      modelProvider: 'claude',
      turnsLoaded: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:03.000Z',
      cwd: '/tmp/project',
    });
    const turns = (snapshots[0].threads[0] as { turns: Array<{ items: Array<Record<string, unknown>> }> }).turns;
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ model: 'claude-sonnet-4-6' });
    const items = turns[0].items;
    expect(items.map((item) => item.type)).toEqual([
      'userMessage', 'reasoning', 'agentMessage', 'tool', 'toolResult', 'agentMessage',
    ]);
    expect(items[0]).toMatchObject({
      id: 'u-1:0',
      text: 'Fix the login bug',
      content: [{ type: 'text', text: 'Fix the login bug' }],
    });
    expect(items[1]).toMatchObject({ type: 'reasoning', text: 'Check the auth flow' });
    expect(items[3]).toMatchObject({ type: 'tool', name: 'Edit', tool: 'Edit', input: { file: 'a.ts' } });
    expect(items[4]).toMatchObject({
      type: 'toolResult',
      parentItemId: 'tool-1',
      text: 'updated',
    });
    expect(items[5]).toMatchObject({ type: 'agentMessage', parentItemId: 'sub-1' });
    for (const item of items) {
      expect((item.sessionMessage as { uuid: string }).uuid).toBeDefined();
    }
    await client.stop();
  });

  it('starts new turns on user prompts and keeps tool_result blocks in the same turn', () => {
    const turns = messagesToTurns('session-1', [
      message('user', 'u-1', null, { type: 'text', text: 'Prompt one' }),
      message('assistant', 'a-1', null, { type: 'text', text: 'Reply one' }),
      message('user', 'u-2', null, { type: 'text', text: 'Prompt two' }),
      message('user', 'u-3', 'tool-9', { type: 'tool_result', tool_use_id: 'tool-9', content: 'done' }),
    ]);

    expect(turns).toHaveLength(2);
    expect(turns[0].id).toBe('u-1');
    expect(turns[1].id).toBe('u-2');
    expect(turns[1].items).toHaveLength(2);
    expect((turns[1].items as Array<Record<string, unknown>>)[1]).toMatchObject({
      type: 'toolResult',
      parentItemId: 'tool-9',
    });
  });

  it('normalizes string and block content with unknown blocks skipped', () => {
    const history = sessionToHistory({ sessionId: 's', summary: 't', lastModified: 1 }, [
      message('user', 'u-1', null, 'plain text'),
      message('assistant', 'a-1', null, { type: 'redacted_thinking', thinking: 'hidden' }),
      message('assistant', 'a-2', null, { type: 'image', source: { type: 'url' } }),
    ]);

    const items = ((history as { turns: Array<{ items: Array<Record<string, unknown>> }> }).turns)[0].items;
    expect(items[0]).toMatchObject({ type: 'userMessage', text: 'plain text' });
    expect(items[1]).toMatchObject({ type: 'reasoning', text: '[redacted thinking]' });
    expect(items).toHaveLength(2);
  });

  it('runs a first turn through query() with safe options and maps the stream', async () => {
    const stream = streamOf(
      initMessage('real-1'),
      userMessage('u-1', 'Fix the login bug'),
      assistantMessage('a-1', [{ type: 'text', text: 'I will fix it' }]),
      assistantMessage('a-2', [{ type: 'tool_use', id: 'tool-1', name: 'Edit', input: { file: 'a.ts' } }]),
      userMessage('u-2', [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'updated' }], 'tool-1'),
      resultMessage('real-1', 'success', {
        input_tokens: 10,
        cache_read_input_tokens: 2,
        cache_creation_input_tokens: 0,
        output_tokens: 5,
        output_tokens_details: { thinking_tokens: 3 },
      }),
    );
    const sdk = fakeSdk([], [], undefined, stream);
    const client = new ClaudeClient({ sdk });
    await client.start();
    const events: Array<Record<string, unknown>> = [];
    client.onTrace((event) => events.push(event as unknown as Record<string, unknown>));

    const created = await client.startThread({}) as { thread: { id: string } };
    expect(created.thread.id).toMatch(/^[0-9a-f-]{36}$/);
    const result = await client.startTurn(created.thread.id, 'Fix the login bug') as {
      turnId: string;
      threadId: string;
      sessionId: string;
    };

    expect(result).toMatchObject({ threadId: created.thread.id, sessionId: 'real-1' });
    expect(result.turnId).toBeTruthy();
    expect(sdk.query).toHaveBeenCalledWith({
      prompt: 'Fix the login bug',
      options: {
        sessionId: created.thread.id,
        includePartialMessages: false,
        permissionMode: 'default',
      },
    });
    const options = (sdk.query as ReturnType<typeof vi.fn>).mock.calls[0][0].options as Record<string, unknown>;
    expect(options.resume).toBeUndefined();
    expect(options.sessionId).toBe(created.thread.id);
    expect(options.bypassPermissions).toBeUndefined();
    expect(options.allowDangerouslySkipPermissions).toBeUndefined();
    expect(options.permissionMode).not.toBe('bypassPermissions');
    expect(events.map((event) => event.method)).toEqual([
      'thread/started',
      'turn/started',
      'item/started',
      'item/completed',
      'item/started',
      'item/completed',
      'turn/completed',
    ]);
    expect(events[2]).toMatchObject({ type: 'userMessage', summary: 'Fix the login bug' });
    expect(events[3]).toMatchObject({ type: 'agentMessage', status: 'completed', model: 'claude-sonnet-4-6' });
    expect(events[4]).toMatchObject({ type: 'tool', status: 'running', itemId: 'tool-1' });
    expect(events[4].raw as Record<string, unknown>).toMatchObject({ name: 'Edit', input: { file: 'a.ts' } });
    expect(events[5]).toMatchObject({ type: 'tool', status: 'completed', itemId: 'tool-1' });
    expect(events[5].raw as Record<string, unknown>).toMatchObject({
      name: 'Edit',
      input: { file: 'a.ts' },
      result: { type: 'toolResult', text: 'updated' },
    });
    expect(events[6]).toMatchObject({
      type: 'turn',
      status: 'completed',
      tokenUsage: {
        total: { totalTokens: 17, inputTokens: 10, cachedInputTokens: 2, outputTokens: 5, reasoningOutputTokens: 3 },
        last: { totalTokens: 17, inputTokens: 10, cachedInputTokens: 2, outputTokens: 5, reasoningOutputTokens: 3 },
      },
    });
    await client.stop();
  });

  it('resumes an existing session by id and reuses it for later turns', async () => {
    const stream = streamOf(
      initMessage('session-1'),
      userMessage('u-1', 'Continue'),
      assistantMessage('a-1', [{ type: 'text', text: 'Done' }]),
      resultMessage('session-1', 'success'),
    );
    const sdk = fakeSdk(
      [{ sessionId: 'session-1', summary: 'Existing', lastModified: 1_767_225_600_000, cwd: '/tmp' }],
      [],
      { sessionId: 'session-1', summary: 'Existing', lastModified: 1_767_225_600_000, cwd: '/tmp' },
      stream,
    );
    const client = new ClaudeClient({ sdk });
    await client.start();

    const resumed = await client.resumeThread('session-1') as { thread: { sessionId: string }; sessionId: string };
    expect(resumed.thread.sessionId).toBe('session-1');
    expect(resumed.sessionId).toBe('session-1');
    expect(sdk.query).not.toHaveBeenCalled();

    await client.startTurn('session-1', 'Continue');
    expect(sdk.query).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Continue',
      options: expect.objectContaining({ resume: 'session-1', includePartialMessages: false, permissionMode: 'default' }),
    }));
    await client.stop();
  });

  it('maps error results to a failed turn and reports query failures', async () => {
    const sdk = fakeSdk([], [], undefined, streamOf(
      initMessage('real-1'),
      resultMessage('real-1', 'error_during_execution', undefined, 'Permission required'),
    ));
    const client = new ClaudeClient({ sdk });
    await client.start();
    const events: Array<Record<string, unknown>> = [];
    client.onTrace((event) => events.push(event as unknown as Record<string, unknown>));

    await client.startTurn('claude-pending-x', 'hello');
    expect(events.at(-1)).toMatchObject({ method: 'turn/completed', status: 'failed' });

    const failing = fakeSdk([], [], undefined, streamOf(initMessage('real-1')));
    const failingClient = new ClaudeClient({ sdk: failing });
    await failingClient.start();
    (failing.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('sdk exploded');
    });
    const failedEvents: Array<Record<string, unknown>> = [];
    failingClient.onTrace((event) => failedEvents.push(event as unknown as Record<string, unknown>));
    await expect(failingClient.startTurn('claude-pending-2', 'hello')).rejects.toThrow('sdk exploded');
    expect(failedEvents.at(-1)).toMatchObject({ method: 'turn/completed', status: 'failed' });
    await failingClient.stop();
    await client.stop();
  });

  it('rejects a second turn while one is running and polls are paused', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const stream = (async function* () {
      yield sdkMessage(initMessage('real-1'));
      await gate;
      yield sdkMessage(resultMessage('real-1', 'success'));
    })();
    const sdk = fakeSdk([], [], undefined, stream);
    const client = new ClaudeClient({ sdk, historyRefreshMs: 5_000 });
    await client.start();
    const first = client.startTurn('claude-pending-1', 'first');
    await Promise.resolve();
    await expect(client.startTurn('claude-pending-1', 'second')).rejects.toMatchObject({ statusCode: 409 });
    release();
    await first;
    await client.stop();
  });
});

function fakeSdk(
  sessions: SDKSessionInfo[],
  messages: SessionMessage[],
  info: SDKSessionInfo | undefined,
  queryStream?: AsyncGenerator<SDKMessage, void>,
): ClaudeSdk {
  return {
    listSessions: vi.fn(async () => sessions),
    getSessionMessages: vi.fn(async () => messages),
    getSessionInfo: vi.fn(async () => info),
    query: vi.fn((_params) => (queryStream ?? emptyStream()) as unknown as Query),
  };
}

function message(
  type: 'user' | 'assistant',
  uuid: string,
  parent_tool_use_id: string | null,
  content: unknown,
): SessionMessage {
  return {
    type,
    uuid,
    session_id: 'session-1',
    parent_tool_use_id,
    parent_agent_id: null,
    message: { role: type, content, ...(type === 'assistant' ? { model: 'claude-sonnet-4-6' } : {}) },
  } as unknown as SessionMessage;
}

function streamOf(...messages: Array<Record<string, unknown>>): AsyncGenerator<SDKMessage, void> {
  return (async function* () {
    for (const message of messages) yield sdkMessage(message);
  })();
}

async function* emptyStream(): AsyncGenerator<SDKMessage, void> {}

function sdkMessage(value: Record<string, unknown>): SDKMessage {
  return value as unknown as SDKMessage;
}

function initMessage(sessionId: string): Record<string, unknown> {
  return { type: 'system', subtype: 'init', session_id: sessionId, uuid: 'init-1' };
}

function userMessage(
  uuid: string,
  content: unknown,
  parent_tool_use_id: string | null = null,
): Record<string, unknown> {
  return {
    type: 'user',
    uuid,
    session_id: 'session',
    parent_tool_use_id,
    message: { role: 'user', content },
  };
}

function assistantMessage(uuid: string, content: unknown): Record<string, unknown> {
  return {
    type: 'assistant',
    uuid,
    session_id: 'session',
    parent_tool_use_id: null,
    message: { id: `msg-${uuid}`, role: 'assistant', model: 'claude-sonnet-4-6', content, stop_reason: null, usage: {} },
  };
}

function resultMessage(
  sessionId: string,
  subtype: string,
  usage?: Record<string, unknown>,
  result = 'done',
): Record<string, unknown> {
  return {
    type: 'result',
    subtype,
    session_id: sessionId,
    result,
    duration_ms: 100,
    is_error: subtype !== 'success',
    num_turns: 1,
    total_cost_usd: 0,
    usage: usage ?? { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    modelUsage: {},
  };
}
