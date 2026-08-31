import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { basename, extname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import type { AddressInfo } from 'node:net';
import { threadToHistory } from '../shared/trace.js';
import { publicHistoricalThread, sanitizeRaw, TraceStore } from '../shared/store.js';
import type { TraceEvent } from '../shared/types.js';
import type { TraceProvider, TraceProviderActions } from './provider.js';
import { openNativePath } from './native-path-opener.js';
import { resolveSubagentAssignment } from './subagent-assignment.js';

export type RpcActions = TraceProviderActions;

const PORT_FALLBACK_ATTEMPTS = 20;

function candidatePorts(requestedPort: number): number[] {
  if (requestedPort === 0) return [0];
  const ports = Array.from(
    { length: Math.min(PORT_FALLBACK_ATTEMPTS, 65_536 - requestedPort) },
    (_, index) => requestedPort + index,
  );
  return ports.at(-1) === 0 ? ports : [...ports, 0];
}

function isAddressInUse(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EADDRINUSE';
}

async function listenOnPort(server: Server, host: string, port: number): Promise<void> {
  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      rejectListen(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolveListen();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

export interface TakoTraceServerOptions {
  host?: string;
  port?: number;
  staticDir?: string;
  visualizationDir?: string;
  store?: TraceStore;
  openPath?: (pathname: string) => Promise<void>;
}

export class TakoTraceServer {
  readonly store: TraceStore;
  private readonly client: RpcActions;
  private readonly host: string;
  private readonly port: number;
  private readonly staticDir: string;
  private readonly visualizationDir: string;
  private readonly openPath: (pathname: string) => Promise<void>;
  private server?: Server;
  private readonly providerUnsubscribers: Array<() => void> = [];

  constructor(client: RpcActions, options: TakoTraceServerOptions = {}) {
    this.client = client;
    this.host = options.host ?? '127.0.0.1';
    this.port = options.port ?? 4317;
    this.staticDir = resolve(options.staticDir ?? join(process.cwd(), 'dist/web'));
    this.visualizationDir = resolve(options.visualizationDir ?? join(homedir(), '.codex/visualizations'));
    this.openPath = options.openPath ?? openNativePath;
    this.store = options.store ?? new TraceStore();
  }

  attachCodex(client: TraceProvider): void {
    this.attachProvider(client);
  }

  attachProvider(provider: TraceProvider): void {
    this.providerUnsubscribers.push(
      provider.onTrace((event) => this.store.add(event)),
      provider.onHistory((threads, replace, source) => this.store.synchronizeThreads(threads, replace, source)),
      provider.onError((error) => this.store.setConnection('error', { error: error.message })),
    );
  }

  async listen(): Promise<{ host: string; port: number }> {
    if (this.server) return this.address();
    this.server = createServer((request, response) => {
      this.route(request, response).catch((error) => sendError(response, 500, error));
    });
    let lastError: unknown;
    for (const port of candidatePorts(this.port)) {
      try {
        await listenOnPort(this.server, this.host, port);
        return this.address();
      } catch (error) {
        lastError = error;
        if (!isAddressInUse(error)) break;
      }
    }
    this.server = undefined;
    throw lastError;
  }

  async close(): Promise<void> {
    for (const unsubscribe of this.providerUnsubscribers.splice(0)) unsubscribe();
    if (!this.server) return;
    const server = this.server;
    this.server = undefined;
    await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  }

  private address(): { host: string; port: number } {
    const address = this.server?.address() as AddressInfo | null;
    return { host: this.host, port: address?.port ?? this.port };
  }

  private async route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    const path = url.pathname;
    if (request.method === 'GET' && path === '/healthz') return sendJson(response, 200, { ok: true });
    if (request.method === 'GET' && path === '/api/state') return sendJson(response, 200, this.store.publicSnapshot());
    if (request.method === 'GET' && path === '/api/events') return this.serveEvents(request, response);
    if ((request.method === 'GET' || request.method === 'HEAD') && path === '/api/visualization') {
      return this.serveVisualization(url.searchParams.get('path'), request, response);
    }
    if ((request.method === 'GET' || request.method === 'HEAD') && path === '/api/source') {
      return this.serveLocalFile(url.searchParams.get('ref'), request, response);
    }
    if (path === '/api/host.openPath') {
      if (request.method !== 'POST') return sendError(response, 405, new Error('Method not allowed'));
      return this.openLocalPath(request, response);
    }
    const attachment = path.match(/^\/api\/attachments\/([^/]+)\/([^/]+)\/([^/]+)\/(\d+)$/);
    if ((request.method === 'GET' || request.method === 'HEAD') && attachment) {
      return this.serveAttachment(
        decodePathSegment(attachment[1]),
        decodePathSegment(attachment[2]),
        decodePathSegment(attachment[3]),
        Number(attachment[4]),
        request,
        response,
      );
    }
    const subagentDetail = path.match(/^\/api\/subagents\/([^/]+)$/);
    if (request.method === 'GET' && subagentDetail) {
      return this.serveSubagentDetail(decodePathSegment(subagentDetail[1]), response);
    }
    if (request.method === 'POST' && path === '/api/threads') {
      const body = await readJson(request);
      return sendJson(response, 201, await this.client.startThread(body));
    }

    const resume = path.match(/^\/api\/threads\/([^/]+)\/resume$/);
    if (request.method === 'POST' && resume) {
      const body = await readJson(request);
      return sendJson(response, 200, await this.client.resumeThread(decodeURIComponent(resume[1]), body));
    }
    const turns = path.match(/^\/api\/threads\/([^/]+)\/turns$/);
    if (request.method === 'POST' && turns) {
      const body = await readJson(request);
      const text = body.text;
      if (typeof text !== 'string' || !text.trim()) return sendError(response, 400, new Error('text must be a non-empty string'));
      const { text: _text, ...params } = body;
      return sendJson(response, 201, await this.client.startTurn(decodeURIComponent(turns[1]), text, params));
    }
    const turnDetail = path.match(/^\/api\/threads\/([^/]+)\/turns\/([^/]+)$/);
    if (request.method === 'GET' && turnDetail) {
      const threadId = decodePathSegment(turnDetail[1]);
      const turnId = decodePathSegment(turnDetail[2]);
      const turn = this.store.getTurn(threadId, turnId);
      return turn ? sendJson(response, 200, { turn }) : sendError(response, 404, new Error('Run not found'));
    }
    const sync = path.match(/^\/api\/threads\/([^/]+)\/sync$/);
    if (request.method === 'POST' && sync) {
      if (!this.client.syncThread) return sendError(response, 501, new Error('Session sync is unavailable'));
      await this.client.syncThread(decodeURIComponent(sync[1]));
      return sendJson(response, 200, { ok: true });
    }
    if (request.method === 'GET' || request.method === 'HEAD') return this.serveStatic(path, request, response);
    sendError(response, 404, new Error('Not found'));
  }

  private async serveSubagentDetail(threadId: string, response: ServerResponse): Promise<void> {
    if (!this.client.readThread) {
      return sendError(response, 501, new Error('Subagent session details are unavailable'));
    }
    let result: unknown;
    try {
      result = await this.client.readThread(threadId);
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      const notFound = /not[ -]?found|unknown thread/i.test(cause.message);
      const wrapped = Object.assign(
        new Error(notFound ? 'Subagent session not found' : `Unable to read subagent session: ${cause.message}`),
        { statusCode: notFound ? 404 : 502 },
      );
      return sendError(response, wrapped.statusCode, wrapped);
    }
    const rawThread = recordValue(result).thread;
    const thread = threadToHistory(rawThread && typeof rawThread === 'object'
      ? { ...recordValue(rawThread), turnsLoaded: true }
      : rawThread);
    if (!thread || thread.id !== threadId) {
      return sendError(response, 404, new Error('Subagent session not found'));
    }
    let parentThread: unknown;
    if (thread.parentThreadId) {
      try {
        parentThread = recordValue(await this.client.readThread(thread.parentThreadId)).thread;
      } catch {
        // Assignment metadata is optional and must not make an otherwise readable child fail.
      }
    }
    const assignment = resolveSubagentAssignment(threadId, rawThread, parentThread);
    return sendJson(response, 200, {
      thread: publicHistoricalThread(thread),
      assignment: sanitizeRaw(assignment),
    });
  }

  private serveEvents(request: IncomingMessage, response: ServerResponse): void {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.write(': connected\n\n');
    const listener = (event: TraceEvent) => {
      const { raw: _raw, ...compact } = event;
      response.write(`id: ${event.seq}\ndata: ${JSON.stringify(compact)}\n\n`);
    };
    const unsubscribe = this.store.subscribe(listener);
    const unsubscribeState = this.store.subscribeState(() => response.write(`data: ${JSON.stringify({ kind: 'snapshot', state: this.store.publicSnapshot() })}\n\n`));
    const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15_000);
    heartbeat.unref();
    request.once('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      unsubscribeState();
    });
  }

  private serveStatic(pathname: string, request: IncomingMessage, response: ServerResponse): void {
    const relative = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
    let file = resolve(this.staticDir, relative || 'index.html');
    if (file !== this.staticDir && !file.startsWith(`${this.staticDir}${sep}`)) return sendError(response, 403, new Error('Forbidden'));
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(this.staticDir, 'index.html');
    if (!existsSync(file) || !statSync(file).isFile()) return sendError(response, 404, new Error('Web assets not built'));
    response.writeHead(200, { 'Content-Type': MIME_TYPES[extname(file)] ?? 'application/octet-stream' });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(file).pipe(response);
  }

  private serveVisualization(pathname: string | null, request: IncomingMessage, response: ServerResponse): void {
    if (!pathname) return sendError(response, 400, new Error('Visualization path is required'));
    if (!existsSync(this.visualizationDir)) return sendError(response, 404, new Error('Visualization not found'));
    const root = realpathSync(this.visualizationDir);
    const requested = resolve(pathname);
    if (!existsSync(requested)) return sendError(response, 404, new Error('Visualization not found'));
    const file = realpathSync(requested);
    if (!file.startsWith(`${root}${sep}`) || !statSync(file).isFile()) return sendError(response, 403, new Error('Forbidden'));
    const contentType = VISUALIZATION_MIME_TYPES[extname(file).toLowerCase()];
    if (!contentType) return sendError(response, 415, new Error('Unsupported visualization type'));
    response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=60' });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(file).pipe(response);
  }

  private serveAttachment(
    threadId: string,
    turnId: string,
    itemId: string,
    contentIndex: number,
    request: IncomingMessage,
    response: ServerResponse,
  ): void {
    const event = this.store.getTurn(threadId, turnId)?.items.find((item) => item.itemId === itemId);
    const raw = traceItemRaw(event?.raw);
    const content = Array.isArray(raw.content) ? raw.content : [];
    const attachment = recordValue(content[contentIndex]);
    const pathname = (attachment.type === 'localImage' || attachment.type === 'local_image') && typeof attachment.path === 'string'
      ? attachment.path
      : undefined;
    if (!pathname || !existsSync(pathname) || !statSync(pathname).isFile()) {
      return sendError(response, 404, new Error('Attachment not found'));
    }
    const contentType = VISUALIZATION_MIME_TYPES[extname(pathname).toLowerCase()];
    if (!contentType) return sendError(response, 415, new Error('Unsupported attachment type'));
    response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=60' });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(pathname).pipe(response);
  }

  private serveLocalFile(encodedReference: string | null, request: IncomingMessage, response: ServerResponse): void {
    if (!encodedReference || encodedReference.length > 16_384 || !/^(?:[0-9a-f]{2})+$/i.test(encodedReference)) {
      return sendError(response, 400, new Error('Valid local file reference is required'));
    }
    const reference = Buffer.from(encodedReference, 'hex').toString('utf8');
    const pathname = localFilePath(reference);
    if (!existsSync(pathname)) return sendError(response, 404, new Error('Local file not found'));
    const file = realpathSync(pathname);
    if (!statSync(file).isFile()) return sendError(response, 403, new Error('Forbidden'));
    const contentType = LOCAL_FILE_MIME_TYPES[extname(file).toLowerCase()];
    if (!contentType) return sendError(response, 415, new Error('Unsupported local file type'));
    const isText = contentType.startsWith('text/plain');
    const isHtml = contentType.startsWith('text/html');
    response.writeHead(200, {
      'Content-Type': isText ? 'text/html; charset=utf-8' : contentType,
      'Content-Security-Policy': isHtml
        ? "sandbox allow-scripts; default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; font-src data:; frame-ancestors 'none'"
        : "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=60',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    if (isText) {
      const contents = readFileSync(file, 'utf8');
      response.end(sourceViewerHtml(basename(file), contents));
      return;
    }
    createReadStream(file).pipe(response);
  }

  private async openLocalPath(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!isTrustedLocalRequest(request)) return sendError(response, 403, new Error('Forbidden'));
    const body = await readJson(request);
    if (typeof body.path !== 'string' || !body.path.trim()) {
      return sendError(response, 400, new Error('path must be a non-empty string'));
    }
    const referencePath = localFileReferencePath(body.path);
    if (!isAbsolute(referencePath)) return sendError(response, 400, new Error('path must be absolute'));
    const pathname = resolve(referencePath);
    if (!existsSync(pathname)) return sendError(response, 404, new Error('Local file not found'));
    const file = realpathSync(pathname);
    if (!statSync(file).isFile()) return sendError(response, 403, new Error('Forbidden'));
    if (!LOCAL_FILE_MIME_TYPES[extname(file).toLowerCase()]) {
      return sendError(response, 415, new Error('Unsupported local file type'));
    }
    try {
      await this.openPath(file);
    } catch (error) {
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), { statusCode: 502 });
    }
    return sendJson(response, 200, { opened: true });
  }
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const VISUALIZATION_MIME_TYPES: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const LOCAL_FILE_MIME_TYPES: Record<string, string> = {
  ...VISUALIZATION_MIME_TYPES,
  '.css': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/plain; charset=utf-8',
  '.json': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml',
  '.ts': 'text/plain; charset=utf-8',
  '.tsx': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 1_000_000) throw Object.assign(new Error('Request body too large'), { statusCode: 413 });
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON body must be an object');
    return value as Record<string, unknown>;
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { statusCode: 400 });
  }
}

function sendJson(response: ServerResponse, status: number, data: unknown): void {
  if (response.headersSent) return;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data ?? null));
}

function sendError(response: ServerResponse, fallbackStatus: number, error: unknown): void {
  const value = error instanceof Error ? error : new Error(String(error));
  const status = typeof (value as Error & { statusCode?: unknown }).statusCode === 'number'
    ? (value as Error & { statusCode: number }).statusCode
    : fallbackStatus;
  sendJson(response, status, { error: { message: value.message } });
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw Object.assign(new Error('Invalid path encoding'), { statusCode: 400 });
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function traceItemRaw(value: unknown): Record<string, unknown> {
  const raw = recordValue(value);
  const item = recordValue(recordValue(raw.params).item);
  return Object.keys(item).length ? item : raw;
}

function localFilePath(reference: string): string {
  return resolve(localFileReferencePath(reference));
}

function localFileReferencePath(reference: string): string {
  const withLine = reference.match(/^(.*?):(\d+)(?::\d+)?$/);
  return withLine?.[1] && existsSync(withLine[1]) ? withLine[1] : reference;
}

function sourceViewerHtml(name: string, contents: string): string {
  const escape = (value: string) => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light dark"><title>${escape(name)}</title><style>html{color-scheme:light dark}body{margin:0;padding:24px;background:Canvas;color:CanvasText;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}</style><pre>${escape(contents)}</pre>`;
}

function isTrustedLocalRequest(request: IncomingMessage): boolean {
  const host = request.headers.host;
  const origin = request.headers.origin;
  if (!host || !origin || request.headers['sec-fetch-site'] === 'cross-site') return false;
  let hostUrl: URL;
  try {
    hostUrl = new URL(`http://${host}`);
  } catch {
    return false;
  }
  const hostname = hostUrl.hostname;
  const ipv4 = hostname.split('.');
  const loopback = hostname === 'localhost' || hostname === '[::1]'
    || (ipv4.length === 4 && ipv4[0] === '127'
      && ipv4.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255));
  const remoteAddress = request.socket.remoteAddress ?? '';
  const localPeer = remoteAddress === '::1' || remoteAddress.startsWith('127.') || remoteAddress.startsWith('::ffff:127.');
  if (!loopback || !localPeer) return false;
  try {
    return new URL(origin).origin === hostUrl.origin;
  } catch {
    return false;
  }
}
