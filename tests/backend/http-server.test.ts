import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { TakoTraceServer, type RpcActions } from '../../src/server/http-server.js';

describe('TakoTraceServer', () => {
  const servers: TakoTraceServer[] = [];
  const temporaryPaths: string[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
    await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
  });

  it('serves health/state and forwards thread actions', async () => {
    const actions: RpcActions = {
      startThread: vi.fn(async (params) => ({ thread: { id: 'new-thread' }, params })),
      resumeThread: vi.fn(async (threadId) => ({ thread: { id: threadId } })),
      startTurn: vi.fn(async (threadId, text) => ({ turn: { id: 'turn-1' }, threadId, text })),
      syncThread: vi.fn(async (threadId) => ({ thread: { id: threadId } })),
    };
    const server = new TakoTraceServer(actions, { port: 0 });
    servers.push(server);
    const { host, port } = await server.listen();
    const base = `http://${host}:${port}`;

    expect(await json(`${base}/healthz`)).toEqual({ ok: true });
    expect((await json(`${base}/api/state`) as { threads: unknown[] }).threads).toEqual([]);
    expect(await json(`${base}/api/threads`, { method: 'POST', body: JSON.stringify({ cwd: '/tmp' }) }))
      .toMatchObject({ thread: { id: 'new-thread' } });
    expect(await json(`${base}/api/threads/a%20b/resume`, { method: 'POST', body: '{}' }))
      .toMatchObject({ thread: { id: 'a b' } });
    expect(await json(`${base}/api/threads/a/turns`, { method: 'POST', body: JSON.stringify({ text: 'hello' }) }))
      .toMatchObject({ text: 'hello' });
    expect(actions.startTurn).toHaveBeenCalledWith('a', 'hello', {});
    expect(await json(`${base}/api/threads/a/sync`, { method: 'POST', body: '{}' }))
      .toEqual({ ok: true });
    expect(actions.syncThread).toHaveBeenCalledWith('a');
  });

  it('streams new trace events over SSE', async () => {
    const actions: RpcActions = {
      startThread: async () => ({}),
      resumeThread: async () => ({}),
      startTurn: async () => ({}),
    };
    const server = new TakoTraceServer(actions, { port: 0 });
    servers.push(server);
    const { host, port } = await server.listen();
    const response = await fetch(`http://${host}:${port}/api/events`);
    const reader = response.body!.getReader();
    await reader.read();
    const largeRaw = 'sse payload'.repeat(10_000);
    server.store.add({
      method: 'item/started', type: 'command', status: 'running', threadId: 't', turnId: 'u', itemId: 'i', summary: 'run',
      raw: { result: largeRaw },
    });
    const chunk = await reader.read();
    const eventText = new TextDecoder().decode(chunk.value);
    expect(eventText).toContain('data: {');
    expect(eventText).not.toContain('"raw"');
    expect(eventText).not.toContain(largeRaw);
    server.store.setConnection('connected');
    const snapshotChunk = await reader.read();
    const snapshotText = new TextDecoder().decode(snapshotChunk.value);
    expect(snapshotText).toContain('"kind":"snapshot"');
    expect(snapshotText).toContain('"events":[]');
    expect(snapshotText).not.toContain('"raw"');
    await reader.cancel();
  });

  it('returns JSON errors for invalid request bodies', async () => {
    const actions: RpcActions = {
      startThread: async () => ({}),
      resumeThread: async () => ({}),
      startTurn: async () => ({}),
    };
    const server = new TakoTraceServer(actions, { port: 0 });
    servers.push(server);
    const { host, port } = await server.listen();
    const response = await fetch(`http://${host}:${port}/api/threads/t/turns`, { method: 'POST', body: '{}' });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { message: 'text must be a non-empty string' } });
  });

  it('reads normalized subagent details without adding the child to the main store', async () => {
    const largeRaw = 'x'.repeat(50_000);
    const actions: RpcActions = {
      startThread: async () => ({}),
      resumeThread: async () => ({}),
      startTurn: async () => ({}),
      readThread: vi.fn(async (threadId) => ({
        thread: {
          id: threadId,
          sessionId: 'session-1',
          parentThreadId: 'parent-1',
          preview: 'Investigate the backend',
          status: { type: 'idle' },
          createdAt: 1_767_225_600,
          updatedAt: 1_767_225_603,
          cwd: '/tmp/project',
          modelProvider: 'openai',
          agentNickname: 'backend',
          agentRole: 'worker',
          source: { subAgent: { thread_spawn: { depth: 1, agent_path: '/root/backend' } } },
          turns: Array.from({ length: 101 }, (_, turnIndex) => ({
            id: `turn-${turnIndex}`,
            model: turnIndex === 100 ? 'gpt-5.6-sol' : undefined,
            status: 'completed',
            items: Array.from({ length: turnIndex === 100 ? 501 : 1 }, (_value, itemIndex) => ({
              id: `item-${itemIndex}`,
              type: 'agentMessage',
              status: 'completed',
              text: turnIndex === 100 && itemIndex === 500 ? largeRaw : `item ${itemIndex}`,
            })),
          })),
        },
      })),
    };
    const server = new TakoTraceServer(actions, { port: 0 });
    servers.push(server);
    const { host, port } = await server.listen();
    const base = `http://${host}:${port}`;

    const detail = await json(`${base}/api/subagents/child%20thread`) as {
      thread: {
        id: string;
        parentThreadId: string;
        agentPath: string;
        depth: number;
        turnsLoaded: boolean;
        turns: Array<{ id: string; model?: string; items: Array<{ itemId: string; raw: { text: string } }> }>;
      };
    };
    expect(actions.readThread).toHaveBeenCalledWith('child thread');
    expect(detail.thread).toMatchObject({
      id: 'child thread', parentThreadId: 'parent-1', agentPath: '/root/backend', depth: 1, turnsLoaded: true,
    });
    expect(detail.thread.turns).toHaveLength(100);
    expect(detail.thread.turns[0].id).toBe('turn-1');
    expect(detail.thread.turns[99].items).toHaveLength(500);
    expect(detail.thread.turns[99].model).toBe('gpt-5.6-sol');
    expect(detail.thread.turns[99].items[0].itemId).toBe('item-1');
    expect(detail.thread.turns[99].items[499].raw.text).toContain('[truncated ');
    expect(server.store.snapshot().threads).toEqual([]);
  });

  it('returns explicit errors when subagent details are missing or unavailable', async () => {
    const unavailable = new TakoTraceServer({
      startThread: async () => ({}), resumeThread: async () => ({}), startTurn: async () => ({}),
    }, { port: 0 });
    servers.push(unavailable);
    const unavailableAddress = await unavailable.listen();
    const unavailableResponse = await fetch(`http://${unavailableAddress.host}:${unavailableAddress.port}/api/subagents/child`);
    expect(unavailableResponse.status).toBe(501);
    expect(await unavailableResponse.json()).toEqual({ error: { message: 'Subagent session details are unavailable' } });

    const missing = new TakoTraceServer({
      startThread: async () => ({}), resumeThread: async () => ({}), startTurn: async () => ({}),
      readThread: async () => ({ thread: null }),
    }, { port: 0 });
    servers.push(missing);
    const missingAddress = await missing.listen();
    const missingResponse = await fetch(`http://${missingAddress.host}:${missingAddress.port}/api/subagents/child`);
    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.json()).toEqual({ error: { message: 'Subagent session not found' } });
  });

  it('returns the matched assignment and tolerates unavailable parent details', async () => {
    const parentPromptActions: RpcActions = {
      startThread: async () => ({}), resumeThread: async () => ({}), startTurn: async () => ({}),
      readThread: vi.fn(async (threadId) => ({
        thread: threadId === 'child'
          ? {
              id: 'child', parentThreadId: 'parent', status: { type: 'idle' }, createdAt: 1, updatedAt: 2,
              turns: [],
            }
          : {
              id: 'parent', status: { type: 'idle' }, createdAt: 1, updatedAt: 2,
              turns: [{ id: 'turn', items: [
                {
                  id: 'spawn', type: 'collabAgentToolCall', tool: 'spawnAgent',
                  receiverThreadIds: ['child'], prompt: 'Implement assignment lookup',
                },
                {
                  id: 'activity', type: 'subAgentActivity', agentThreadId: 'child',
                  arguments: { task_name: 'backend', agent_type: 'worker', fork_turns: 'all' },
                },
              ] }],
            },
      })),
    };
    const withParent = new TakoTraceServer(parentPromptActions, { port: 0 });
    servers.push(withParent);
    const parentAddress = await withParent.listen();
    const detail = await json(`http://${parentAddress.host}:${parentAddress.port}/api/subagents/child`) as {
      assignment: Record<string, unknown>;
    };
    expect(detail.assignment).toEqual({
      availability: 'available', text: 'Implement assignment lookup', source: 'parent-prompt',
      taskName: 'backend', agentType: 'worker', forkTurns: 'all',
    });
    expect(parentPromptActions.readThread).toHaveBeenNthCalledWith(1, 'child');
    expect(parentPromptActions.readThread).toHaveBeenNthCalledWith(2, 'parent');

    const parentFailureActions: RpcActions = {
      startThread: async () => ({}), resumeThread: async () => ({}), startTurn: async () => ({}),
      readThread: vi.fn(async (threadId) => {
        if (threadId === 'parent') throw new Error('parent unavailable');
        return {
          thread: {
            id: 'child', parentThreadId: 'parent', status: { type: 'idle' }, createdAt: 1, updatedAt: 2,
            turns: [],
          },
        };
      }),
    };
    const withoutParent = new TakoTraceServer(parentFailureActions, { port: 0 });
    servers.push(withoutParent);
    const failureAddress = await withoutParent.listen();
    const fallback = await json(`http://${failureAddress.host}:${failureAddress.port}/api/subagents/child`) as {
      thread: { id: string };
      assignment: Record<string, unknown>;
    };
    expect(fallback.thread.id).toBe('child');
    expect(fallback.assignment).toEqual({ availability: 'not-recorded' });
  });

  it('serves compact state and a bounded full turn detail', async () => {
    const actions: RpcActions = {
      startThread: async () => ({}),
      resumeThread: async () => ({}),
      startTurn: async () => ({}),
    };
    const server = new TakoTraceServer(actions, { port: 0 });
    servers.push(server);
    const largeRaw = 'x'.repeat(50_000);
    server.store.add({
      method: 'item/completed', type: 'tool', status: 'completed', threadId: 'thread space', turnId: 'turn space',
      itemId: 'item-1', summary: 'tool result', durationMs: 42, raw: { nested: { result: largeRaw } },
    });
    const { host, port } = await server.listen();
    const base = `http://${host}:${port}`;

    const state = await json(`${base}/api/state`) as {
      events: unknown[];
      threads: Array<{ turns: Array<{ summary: string; itemCount: number; items: unknown[] }> }>;
    };
    expect(state.events).toEqual([]);
    expect(state.threads[0].turns[0]).toMatchObject({
      summary: 'tool result', itemCount: 1, items: [],
    });
    expect(JSON.stringify(state)).not.toContain(largeRaw);

    const detail = await json(`${base}/api/threads/thread%20space/turns/turn%20space`) as {
      turn: { items: Array<{ raw: { nested: { result: string } } }> };
    };
    const result = detail.turn.items[0].raw.nested.result;
    expect(result.length).toBeLessThan(largeRaw.length);
    expect(result).toContain('[truncated ');
    expect(server.store.snapshot().threads[0].turns[0].items[0].raw).toEqual({ nested: { result: largeRaw } });

    const missing = await fetch(`${base}/api/threads/thread%20space/turns/missing`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: { message: 'Run not found' } });
  });

  it('serves only supported images from the configured visualization directory', async () => {
    const actions: RpcActions = {
      startThread: async () => ({}),
      resumeThread: async () => ({}),
      startTurn: async () => ({}),
    };
    const root = await mkdtemp(join(tmpdir(), 'takotrace-visualizations-'));
    temporaryPaths.push(root);
    const nested = join(root, 'thread');
    await mkdir(nested);
    const image = join(nested, 'preview.png');
    const text = join(nested, 'notes.txt');
    await writeFile(image, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(text, 'private');
    const outside = join(root, '..', `outside-${basename(root)}.png`);
    await writeFile(outside, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    temporaryPaths.push(outside);
    const server = new TakoTraceServer(actions, { port: 0, visualizationDir: root });
    servers.push(server);
    const { host, port } = await server.listen();
    const base = `http://${host}:${port}/api/visualization?path=`;

    const allowed = await fetch(`${base}${encodeURIComponent(image)}`);
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await allowed.arrayBuffer())).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    expect((await fetch(`${base}${encodeURIComponent(text)}`)).status).toBe(415);
    expect((await fetch(`${base}${encodeURIComponent(outside)}`)).status).toBe(403);
  });

  it('serves camelCase and snake_case local image blocks referenced by a traced user message', async () => {
    const actions: RpcActions = {
      startThread: async () => ({}),
      resumeThread: async () => ({}),
      startTurn: async () => ({}),
    };
    const root = await mkdtemp(join(tmpdir(), 'takotrace-attachment-'));
    temporaryPaths.push(root);
    const image = join(root, 'prompt.png');
    await writeFile(image, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const server = new TakoTraceServer(actions, { port: 0 });
    servers.push(server);
    server.store.add({
      method: 'item/completed',
      type: 'userMessage',
      status: 'completed',
      threadId: 'thread space',
      turnId: 'turn space',
      itemId: 'item space',
      summary: 'Prompt with image',
      raw: {
        type: 'userMessage',
        content: [
          { type: 'text', text: 'Prompt with image' },
          { type: 'localImage', path: image },
          { type: 'local_image', path: image },
        ],
      },
    });
    const { host, port } = await server.listen();
    const base = `http://${host}:${port}/api/attachments/thread%20space/turn%20space/item%20space`;

    const allowed = await fetch(`${base}/1`);
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await allowed.arrayBuffer())).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect((await fetch(`${base}/0`)).status).toBe(404);
    expect((await fetch(`${base}/2`)).status).toBe(200);
    expect((await fetch(`${base}/3`)).status).toBe(404);
    expect((await fetch(`http://${host}:${port}/api/attachments/thread%20space/turn%20space/missing/1`)).status).toBe(404);
  });

  it('serves supported local files from arbitrary session directories and neutralizes executable text', async () => {
    const actions: RpcActions = {
      startThread: async () => ({}),
      resumeThread: async () => ({}),
      startTurn: async () => ({}),
    };
    const root = await mkdtemp(join(tmpdir(), 'takotrace-local-files-'));
    temporaryPaths.push(root);
    const skill = join(root, 'SKILL.md');
    await writeFile(skill, '# Local skill\n<script>alert(1)</script>');
    const artifact = join(root, 'artifact.html');
    await writeFile(artifact, '<!doctype html><title>Artifact</title><h1>Rendered</h1>');
    const outside = join(root, '..', `outside-${basename(root)}.md`);
    await writeFile(outside, '# Private');
    temporaryPaths.push(outside);
    const server = new TakoTraceServer(actions, { port: 0 });
    servers.push(server);
    const { host, port } = await server.listen();
    const base = `http://${host}:${port}/api/source?ref=`;

    const allowed = await fetch(`${base}${Buffer.from(`${skill}:42`).toString('hex')}`);
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(allowed.headers.get('content-security-policy')).toBe("default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
    const html = await allowed.text();
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
    expect(html).toContain('background:Canvas;color:CanvasText');
    expect(html).toContain('<pre># Local skill\n&lt;script&gt;alert(1)&lt;/script&gt;</pre>');
    expect(html).not.toContain('<script>alert(1)</script>');
    const rendered = await fetch(`${base}${Buffer.from(artifact).toString('hex')}`);
    expect(rendered.status).toBe(200);
    expect(rendered.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(rendered.headers.get('content-security-policy')).toContain('sandbox allow-scripts');
    expect(await rendered.text()).toContain('<h1>Rendered</h1>');
    const outsideResponse = await fetch(`${base}${Buffer.from(outside).toString('hex')}`);
    expect(outsideResponse.status).toBe(200);
    expect(await outsideResponse.text()).toContain('# Private');
    expect((await fetch(`${base}not-hex`)).status).toBe(400);
  });

  it('opens supported local files through a loopback same-origin host action', async () => {
    const actions: RpcActions = {
      startThread: async () => ({}),
      resumeThread: async () => ({}),
      startTurn: async () => ({}),
    };
    const root = await mkdtemp(join(tmpdir(), 'takotrace-open-path-'));
    temporaryPaths.push(root);
    const artifact = join(root, 'artifact.html');
    await writeFile(artifact, '<!doctype html><title>Artifact</title>');
    const unsupported = join(root, 'artifact.bin');
    await writeFile(unsupported, 'binary');
    const openPath = vi.fn(async () => {});
    const server = new TakoTraceServer(actions, { port: 0, openPath });
    servers.push(server);
    const { host, port } = await server.listen();
    const base = `http://${host}:${port}`;
    const endpoint = `${base}/api/host.openPath`;
    const headers = { 'content-type': 'application/json', origin: base };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ path: `${artifact}:42:3` }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ opened: true });
    expect(openPath).toHaveBeenCalledWith(await realpath(artifact));

    const invalidCases = [
      { path: '', status: 400 },
      { path: 'relative.html', status: 400 },
      { path: join(root, 'missing.html'), status: 404 },
      { path: root, status: 403 },
      { path: unsupported, status: 415 },
    ];
    for (const invalid of invalidCases) {
      const invalidResponse = await fetch(endpoint, {
        method: 'POST', headers, body: JSON.stringify({ path: invalid.path }),
      });
      expect(invalidResponse.status, invalid.path).toBe(invalid.status);
    }
    expect(openPath).toHaveBeenCalledTimes(1);
    expect((await fetch(endpoint)).status).toBe(405);
  });

  it('rejects non-local or cross-origin host-open requests', async () => {
    const actions: RpcActions = {
      startThread: async () => ({}),
      resumeThread: async () => ({}),
      startTurn: async () => ({}),
    };
    const root = await mkdtemp(join(tmpdir(), 'takotrace-open-path-origin-'));
    temporaryPaths.push(root);
    const artifact = join(root, 'artifact.html');
    await writeFile(artifact, '<!doctype html>');
    const openPath = vi.fn(async () => {});
    const server = new TakoTraceServer(actions, { port: 0, openPath });
    servers.push(server);
    const { host, port } = await server.listen();
    const endpoint = `http://${host}:${port}/api/host.openPath`;
    const body = JSON.stringify({ path: artifact });

    const missingOrigin = await fetch(endpoint, { method: 'POST', body });
    const wrongOrigin = await fetch(endpoint, {
      method: 'POST', headers: { origin: 'http://127.0.0.1:1' }, body,
    });
    const crossSite = await fetch(endpoint, {
      method: 'POST',
      headers: { origin: `http://${host}:${port}`, 'sec-fetch-site': 'cross-site' },
      body,
    });
    const reboundHost = await fetch(endpoint, {
      method: 'POST',
      headers: { host: 'attacker.example', origin: 'http://attacker.example' },
      body,
    });

    expect([missingOrigin.status, wrongOrigin.status, crossSite.status, reboundHost.status]).toEqual([403, 403, 403, 403]);
    expect(openPath).not.toHaveBeenCalled();
  });

  it('returns a gateway error when the native file opener fails', async () => {
    const actions: RpcActions = {
      startThread: async () => ({}),
      resumeThread: async () => ({}),
      startTurn: async () => ({}),
    };
    const root = await mkdtemp(join(tmpdir(), 'takotrace-open-path-error-'));
    temporaryPaths.push(root);
    const artifact = join(root, 'artifact.html');
    await writeFile(artifact, '<!doctype html>');
    const server = new TakoTraceServer(actions, {
      port: 0,
      openPath: async () => { throw new Error('native opener failed'); },
    });
    servers.push(server);
    const { host, port } = await server.listen();
    const base = `http://${host}:${port}`;
    const response = await fetch(`${base}/api/host.openPath`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ path: artifact }),
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: { message: 'native opener failed' } });
  });
});

async function json(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { headers: { 'content-type': 'application/json' }, ...init });
  expect(response.ok).toBe(true);
  return response.json();
}
