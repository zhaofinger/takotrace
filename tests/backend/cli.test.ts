import { describe, expect, it } from 'vitest';
import { createProvider, parseArgs } from '../../src/cli.js';
import { ClaudeClient } from '../../src/server/claude-client.js';
import { CodexClient } from '../../src/server/codex-client.js';
import { MultiProvider } from '../../src/server/multi-provider.js';
import type { TraceProvider } from '../../src/server/provider.js';

describe('CLI provider options', () => {
  it('defaults to all', () => {
    expect(parseArgs([])).toMatchObject({ provider: 'all', host: '127.0.0.1', port: 4317, open: true });
  });

  it('parses provider executable paths in both forms', () => {
    expect(parseArgs(['--provider', 'claude', '--codex-path', '/opt/codex', '--claude-path', '/opt/claude'])).toMatchObject({
      provider: 'claude',
      codexPath: '/opt/codex',
      claudePath: '/opt/claude',
    });
    expect(parseArgs(['--provider=claude', '--codex-path=/opt/codex', '--claude-path=/opt/claude'])).toMatchObject({
      provider: 'claude',
      codexPath: '/opt/codex',
      claudePath: '/opt/claude',
    });
    expect(parseArgs(['--provider=codex'])).toMatchObject({ provider: 'codex' });
    expect(parseArgs(['--provider=all'])).toMatchObject({ provider: 'all' });
  });

  it('rejects unknown providers', () => {
    expect(() => parseArgs(['--provider', 'gemini'])).toThrow('Invalid provider: gemini (expected codex, claude or all)');
  });

  it('builds the matching provider without starting it', () => {
    const codex = createProvider({
      host: '127.0.0.1', port: 4317, open: false, help: false, provider: 'codex', codexPath: '/opt/codex',
    });
    expect(codex).toBeInstanceOf(CodexClient);
    expect(Reflect.get(codex, 'options')).toMatchObject({ command: '/opt/codex' });
    expect(createProvider({ host: '127.0.0.1', port: 4317, open: false, help: false, provider: 'claude' }))
      .toBeInstanceOf(ClaudeClient);
    const all = createProvider({
      host: '127.0.0.1', port: 4317, open: false, help: false, provider: 'all', codexPath: '/opt/codex',
    });
    expect(all).toBeInstanceOf(MultiProvider);
    const providers = Reflect.get(all, 'providers') as TraceProvider[];
    const allCodex = providers.find((provider) => provider instanceof CodexClient);
    expect(allCodex && Reflect.get(allCodex, 'options')).toMatchObject({ command: '/opt/codex' });
  });
});
