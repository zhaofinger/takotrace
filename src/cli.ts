#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodexClient } from './server/codex-client.js';
import { ThreadScopeServer } from './server/http-server.js';

interface CliOptions {
  host: string;
  port: number;
  open: boolean;
  help: boolean;
}

const HELP = `Usage: thread-scope [options]

Options:
  --host <host>  Bind host (default: 127.0.0.1)
  --port <port>  Bind port (default: 4317)
  --no-open      Do not open the browser
  --help         Show this help
`;

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { host: '127.0.0.1', port: 4317, open: true, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--no-open') options.open = false;
    else if (argument === '--host') options.host = requireValue(args, ++index, '--host');
    else if (argument.startsWith('--host=')) options.host = argument.slice('--host='.length);
    else if (argument === '--port') options.port = parsePort(requireValue(args, ++index, '--port'));
    else if (argument.startsWith('--port=')) options.port = parsePort(argument.slice('--port='.length));
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n\n${HELP}`);
    process.exitCode = 1;
    return;
  }
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  const client = new CodexClient();
  const staticDir = join(dirname(fileURLToPath(import.meta.url)), 'web');
  const server = new ThreadScopeServer(client, { host: options.host, port: options.port, staticDir });
  server.attachCodex(client);
  let address: { host: string; port: number };
  try {
    address = await server.listen();
  } catch (error) {
    await client.stop();
    throw error;
  }

  const url = `http://${formatHost(address.host)}:${address.port}`;
  process.stdout.write(`ThreadScope listening on ${url}\n`);
  if (options.open) openBrowser(url);

  try {
    const initialized = await client.start();
    server.store.setConnection('connected', { userAgent: initialized.userAgent ?? 'codex app-server' });
  } catch (error) {
    server.store.setConnection('error', { error: error instanceof Error ? error.message : String(error) });
    await server.close();
    await client.stop();
    throw error;
  }

  const shutdown = async () => {
    await server.close();
    await client.stop();
  };
  process.once('SIGINT', () => void shutdown().then(() => process.exit(0)));
  process.once('SIGTERM', () => void shutdown().then(() => process.exit(0)));
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error(`Invalid port: ${value}`);
  return port;
}

function formatHost(host: string): string {
  return host.includes(':') ? `[${host}]` : host;
}

function openBrowser(url: string): void {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`thread-scope: ${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
