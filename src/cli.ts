#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProviderSelection } from './shared/types.js';
import { CodexClient } from './server/codex-client.js';
import { resolveCodexCommand } from './server/codex-command.js';
import { ClaudeClient } from './server/claude-client.js';
import { TakoTraceServer } from './server/http-server.js';
import { MultiProvider } from './server/multi-provider.js';
import type { TraceProvider } from './server/provider.js';

interface CliOptions {
  host: string;
  port: number;
  open: boolean;
  help: boolean;
  provider: ProviderSelection;
  codexPath?: string;
  claudePath?: string;
}

const HELP = `Usage: takotrace [options]

Options:
  --host <host>  Bind host (default: 127.0.0.1)
  --port <port>  Bind port (default: 4317)
  --provider <codex|claude|all>  Agent providers (default: all)
  --codex-path <path>  Codex executable path (overrides automatic selection)
  --claude-path <path>  Claude Code executable path for managed sessions
  --no-open      Do not open the browser
  --help         Show this help
`;

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { host: '127.0.0.1', port: 4317, open: true, help: false, provider: 'all' };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--no-open') options.open = false;
    else if (argument === '--host') options.host = requireValue(args, ++index, '--host');
    else if (argument.startsWith('--host=')) options.host = argument.slice('--host='.length);
    else if (argument === '--port') options.port = parsePort(requireValue(args, ++index, '--port'));
    else if (argument.startsWith('--port=')) options.port = parsePort(argument.slice('--port='.length));
    else if (argument === '--provider') options.provider = parseProvider(requireValue(args, ++index, '--provider'));
    else if (argument.startsWith('--provider=')) options.provider = parseProvider(argument.slice('--provider='.length));
    else if (argument === '--codex-path') options.codexPath = requireValue(args, ++index, '--codex-path');
    else if (argument.startsWith('--codex-path=')) options.codexPath = argument.slice('--codex-path='.length);
    else if (argument === '--claude-path') options.claudePath = requireValue(args, ++index, '--claude-path');
    else if (argument.startsWith('--claude-path=')) options.claudePath = argument.slice('--claude-path='.length);
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

export function createProvider(options: CliOptions): TraceProvider {
  if (options.provider === 'codex') return new CodexClient({ command: options.codexPath });
  const claude = new ClaudeClient({ pathToClaudeCodeExecutable: options.claudePath });
  if (options.provider === 'claude') return claude;
  return new MultiProvider({ providers: [new CodexClient({ command: options.codexPath }), claude] });
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

  if (options.provider !== 'claude') {
    const selected = resolveCodexCommand({ explicitPath: options.codexPath });
    options.codexPath = selected.command;
    process.stdout.write(
      `Codex command: source=${selected.source} version=${selected.version ?? 'unknown'} command=${selected.command}\n`,
    );
  }

  const provider = createProvider(options);
  const staticDir = join(dirname(fileURLToPath(import.meta.url)), 'web');
  const server = new TakoTraceServer(provider, { host: options.host, port: options.port, staticDir });
  server.attachProvider(provider);
  let address: { host: string; port: number };
  try {
    address = await server.listen();
  } catch (error) {
    await provider.stop();
    throw error;
  }

  const url = `http://${formatHost(address.host)}:${address.port}`;
  process.stdout.write(`TakoTrace listening on ${url}\n`);
  if (options.open) openBrowser(url);

  try {
    const initialized = await provider.start();
    server.store.setConnection('connected', {
      provider: initialized.provider,
      userAgent: initialized.userAgent ?? (
        initialized.provider === 'all'
          ? 'codex + claude'
          : initialized.provider === 'claude' ? 'claude-agent-sdk' : 'codex app-server'
      ),
    });
  } catch (error) {
    server.store.setConnection('error', { error: error instanceof Error ? error.message : String(error) });
    await server.close();
    await provider.stop();
    throw error;
  }

  const shutdown = async () => {
    await server.close();
    await provider.stop();
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

function parseProvider(value: string): ProviderSelection {
  if (value === 'codex' || value === 'claude' || value === 'all') return value;
  throw new Error(`Invalid provider: ${value} (expected codex, claude or all)`);
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
    process.stderr.write(`takotrace: ${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
