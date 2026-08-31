import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readRolloutThread } from '../../src/server/rollout-reader.js';

const THREAD_ID = '01a03900-5582-7a11-bd8d-a594d4ed8c91';
const TURN_ID = '01a03900-f4e5-7c61-895b-e5b5dd692d83';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('rollout reader', () => {
  it('only keeps the latest unclosed turn running', async () => {
    const codexHome = await temporaryCodexHome();
    const directory = join(codexHome, 'sessions', '2026', '08', '25');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `rollout-2026-08-25T20-58-38-${THREAD_ID}.jsonl`), [
      entry('session_meta', { id: THREAD_ID }),
      entry('event_msg', { type: 'task_started', turn_id: 'old-unclosed' }),
      entry('event_msg', { type: 'item_completed', turn_id: 'old-unclosed', item: { id: 'old-user', type: 'UserMessage' } }),
      entry('event_msg', { type: 'task_started', turn_id: 'latest-unclosed' }),
      entry('event_msg', { type: 'item_completed', turn_id: 'latest-unclosed', item: { id: 'latest-user', type: 'UserMessage' } }),
    ].join('\n'));

    const result = await readRolloutThread(THREAD_ID, { codexHome });
    const turns = result?.thread.turns as Array<Record<string, unknown>>;

    expect(turns[0]).toMatchObject({ id: 'old-unclosed', status: 'interrupted' });
    expect(turns[1]).toMatchObject({ id: 'latest-unclosed', status: 'inProgress' });
    expect(result?.thread.status).toEqual({ type: 'active' });
  });

  it('recovers turns from sessions while merging duplicate contexts and skipping invalid lines', async () => {
    const codexHome = await temporaryCodexHome();
    const directory = join(codexHome, 'sessions', '2026', '08', '25');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `rollout-2026-08-25T20-58-38-${THREAD_ID}.jsonl`), [
      entry('session_meta', { id: THREAD_ID, timestamp: '2026-08-25T12:58:38.000Z', cwd: '/tmp/project', cli_version: '0.150.0' }),
      entry('event_msg', { type: 'task_started', turn_id: TURN_ID, started_at: 1_767_000_000 }),
      entry('turn_context', { turn_id: TURN_ID, model: 'gpt-5.6-sol' }),
      entry('turn_context', { turn_id: TURN_ID }),
      entry('event_msg', {
        type: 'token_count',
        info: {
          total_token_usage: tokenUsage(100, 80, 20),
          last_token_usage: tokenUsage(100, 80, 20),
          model_context_window: 200_000,
        },
      }),
      entry('event_msg', {
        type: 'token_count',
        info: {
          total_token_usage: tokenUsage(160, 125, 35),
          last_token_usage: tokenUsage(60, 45, 15),
          model_context_window: 200_000,
        },
      }),
      '{broken json',
      entry('unknown_event', { value: 'ignored' }),
      entry('event_msg', {
        type: 'item_completed',
        turn_id: TURN_ID,
        started_at_ms: 1_767_000_000_000,
        completed_at_ms: 1_767_000_000_010,
        item: { id: 'user-1', type: 'UserMessage', content: [{ type: 'Text', text: 'Build it' }] },
      }),
      entry('event_msg', {
        type: 'item_completed',
        turn_id: TURN_ID,
        item: { id: 'subagent-1', type: 'SubAgentActivity', kind: 'completed', agent_thread_id: 'child-1' },
      }),
      entry('response_item', {
        type: 'function_call', name: 'wait_agent', call_id: 'wait-1', arguments: '{"timeout_ms":60000}',
      }),
      entry('event_msg', {
        type: 'item_completed', turn_id: TURN_ID,
        item: { id: 'wait-1', type: 'CollabAgentToolCall', tool: 'wait', status: 'completed' },
      }),
      entry('response_item', {
        type: 'function_call_output', call_id: 'wait-1', output: '{"message":"Wait timed out.","timed_out":true}',
      }),
      entry('event_msg', { type: 'task_complete', turn_id: TURN_ID, started_at: 1_767_000_000, completed_at: 1_767_000_003, duration_ms: 3_000 }),
      '{"type":"event_msg"',
    ].join('\n'));

    const result = await readRolloutThread(THREAD_ID, { codexHome });

    expect(result?.thread.turns).toHaveLength(1);
    expect(result?.thread.preview).toBe('Build it');
    expect(result?.thread.cwd).toBe('/tmp/project');
    expect(result?.thread.historySource).toBe('rollout-file');
    const turn = (result?.thread.turns as Array<Record<string, unknown>>)[0];
    expect(turn).toMatchObject({ id: TURN_ID, status: 'completed', durationMs: 3_000, model: 'gpt-5.6-sol' });
    expect(turn.tokenUsage).toMatchObject({ totalTokens: 160, inputTokens: 125, outputTokens: 35 });
    expect(result?.thread.tokenUsage).toMatchObject({
      total: { totalTokens: 160, inputTokens: 125, outputTokens: 35 },
      last: { totalTokens: 60, inputTokens: 45, outputTokens: 15 },
      modelContextWindow: 200_000,
    });
    expect(turn.items).toEqual([
      expect.objectContaining({ id: 'user-1', type: 'userMessage', durationMs: 10 }),
      expect.objectContaining({ id: 'subagent-1', type: 'subAgentActivity', kind: 'completed', agentThreadId: 'child-1' }),
      expect.objectContaining({
        id: 'wait-1', type: 'collabAgentToolCall',
        arguments: { timeout_ms: 60_000 },
        result: { message: 'Wait timed out.', timed_out: true },
      }),
    ]);
  });

  it('loads archived session files', async () => {
    const codexHome = await temporaryCodexHome();
    const directory = join(codexHome, 'archived_sessions');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `rollout-2026-08-25T20-58-38-${THREAD_ID}.jsonl`), [
      entry('session_meta', { id: THREAD_ID, timestamp: '2026-08-25T12:58:38.000Z' }),
      entry('event_msg', { type: 'task_started', turn_id: TURN_ID, started_at: 1_767_000_000 }),
      entry('event_msg', { type: 'task_complete', turn_id: TURN_ID, completed_at: 1_767_000_003 }),
      entry('event_msg', {
        type: 'token_count',
        info: { total_token_usage: tokenUsage(40, 30, 10), last_token_usage: tokenUsage(40, 30, 10) },
      }),
    ].join('\n'));

    const result = await readRolloutThread(THREAD_ID, { codexHome });

    expect(result?.source).toContain('/archived_sessions/');
    expect(result?.thread.turns).toHaveLength(1);
    expect((result?.thread.turns as Array<Record<string, unknown>>)[0].tokenUsage).toMatchObject({ totalTokens: 40 });
  });

  it('keeps models per run and uses recorded settings only as a fallback', async () => {
    const codexHome = await temporaryCodexHome();
    const directory = join(codexHome, 'sessions', '2026', '08', '25');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `rollout-2026-08-25T20-58-38-${THREAD_ID}.jsonl`), [
      entry('session_meta', { id: THREAD_ID }),
      entry('world_state', { state: { model: 'gpt-default' } }),
      entry('turn_context', { turn_id: 'turn-1' }),
      entry('event_msg', { type: 'task_started', turn_id: 'turn-1' }),
      entry('event_msg', { type: 'task_complete', turn_id: 'turn-1' }),
      entry('event_msg', { type: 'thread_settings_applied', thread_settings: { model: 'gpt-setting' } }),
      entry('turn_context', { turn_id: 'turn-2' }),
      entry('event_msg', { type: 'task_started', turn_id: 'turn-2' }),
      entry('event_msg', { type: 'task_complete', turn_id: 'turn-2' }),
      entry('turn_context', { turn_id: 'turn-3', model: 'gpt-explicit' }),
      entry('event_msg', { type: 'task_started', turn_id: 'turn-3' }),
      entry('event_msg', { type: 'task_complete', turn_id: 'turn-3' }),
    ].join('\n'));

    const result = await readRolloutThread(THREAD_ID, { codexHome });
    const turns = result?.thread.turns as Array<Record<string, unknown>>;

    expect(turns.map(({ id, model }) => ({ id, model }))).toEqual([
      { id: 'turn-1', model: 'gpt-default' },
      { id: 'turn-2', model: 'gpt-setting' },
      { id: 'turn-3', model: 'gpt-explicit' },
    ]);
  });

  it('rejects non-Codex ids without touching arbitrary paths', async () => {
    const codexHome = await temporaryCodexHome();
    await expect(readRolloutThread('../sessions/secret', { codexHome })).resolves.toBeUndefined();
  });
});

async function temporaryCodexHome(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'takotrace-rollout-'));
  temporaryDirectories.push(path);
  return path;
}

function entry(type: string, payload: Record<string, unknown>): string {
  return JSON.stringify({ timestamp: '2026-08-25T12:58:38.000Z', type, payload });
}

function tokenUsage(total: number, input: number, output: number) {
  return {
    total_tokens: total,
    input_tokens: input,
    cached_input_tokens: 20,
    cache_write_input_tokens: 0,
    output_tokens: output,
    reasoning_output_tokens: 0,
  };
}
