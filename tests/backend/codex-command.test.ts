import { describe, expect, it, vi } from 'vitest';
import { resolveCodexCommand } from '../../src/server/codex-command.js';

const bundledChatGptCodex = '/Applications/ChatGPT.app/Contents/Resources/codex';

describe('resolveCodexCommand', () => {
  it('selects a newer executable from a trusted macOS application bundle', () => {
    const versions = new Map([
      ['codex', '0.147.0'],
      [bundledChatGptCodex, '0.150.0-alpha.12.2'],
    ]);

    expect(resolveCodexCommand({
      platform: 'darwin',
      homeDir: '/Users/tester',
      probe: command => versions.get(command),
      isExecutable: command => versions.has(command),
    })).toEqual({
      command: bundledChatGptCodex,
      version: '0.150.0-alpha.12.2',
      source: 'bundle',
    });
  });

  it('keeps PATH when the bundled version is the same', () => {
    expect(resolveCodexCommand({
      platform: 'darwin',
      probe: () => '0.150.0',
      isExecutable: () => true,
    })).toEqual({ command: 'codex', version: '0.150.0', source: 'path' });
  });

  it('treats a stable release as newer than its prerelease', () => {
    const versions = new Map([
      ['codex', '0.150.0-alpha.12.2'],
      [bundledChatGptCodex, '0.150.0'],
    ]);

    expect(resolveCodexCommand({
      platform: 'darwin',
      probe: command => versions.get(command),
      isExecutable: command => versions.has(command),
    })).toMatchObject({ command: bundledChatGptCodex, version: '0.150.0', source: 'bundle' });
  });

  it('safely keeps the PATH command when its version probe fails', () => {
    const isExecutable = vi.fn(() => true);
    expect(resolveCodexCommand({
      platform: 'darwin',
      probe: () => undefined,
      isExecutable,
    })).toEqual({ command: 'codex', version: undefined, source: 'path' });
    expect(isExecutable).not.toHaveBeenCalled();
  });

  it('always gives an explicit path highest priority', () => {
    const probe = vi.fn(() => '0.100.0');
    const isExecutable = vi.fn(() => true);
    expect(resolveCodexCommand({
      explicitPath: '/opt/custom/codex',
      platform: 'darwin',
      probe,
      isExecutable,
    })).toEqual({ command: '/opt/custom/codex', version: '0.100.0', source: 'explicit' });
    expect(probe).toHaveBeenCalledOnce();
    expect(probe).toHaveBeenCalledWith('/opt/custom/codex', 2_000);
    expect(isExecutable).not.toHaveBeenCalled();
  });

  it('does not inspect application bundles outside macOS', () => {
    const probe = vi.fn(() => '0.147.0');
    const isExecutable = vi.fn(() => true);
    expect(resolveCodexCommand({ platform: 'linux', probe, isExecutable }))
      .toEqual({ command: 'codex', version: '0.147.0', source: 'path' });
    expect(probe).toHaveBeenCalledOnce();
    expect(isExecutable).not.toHaveBeenCalled();
  });
});
