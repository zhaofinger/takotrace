import { describe, expect, it, vi } from 'vitest';
import { openNativePath } from '../../src/server/native-path-opener.js';

describe('openNativePath', () => {
  it('opens browser documents with the macOS default browser', async () => {
    const path = "/tmp/report with spaces ' ; $().html";
    const run = vi.fn(async (command: string) => ({
      stdout: command === 'defaults'
        ? '({ LSHandlerURLScheme = https; LSHandlerRoleAll = "com.example.browser"; })'
        : '',
    }));

    await openNativePath(path, { platform: 'darwin', run });

    expect(run).toHaveBeenNthCalledWith(1, 'defaults', ['read', 'com.apple.LaunchServices/com.apple.launchservices.secure']);
    expect(run).toHaveBeenNthCalledWith(2, 'open', ['-b', 'com.example.browser', path]);
  });

  it('falls back to the registered macOS application', async () => {
    const run = vi.fn(async () => ({ stdout: '' }));
    await openNativePath('/tmp/notes.txt', { platform: 'darwin', run });
    expect(run).toHaveBeenCalledWith('open', ['/tmp/notes.txt']);
  });

  it('uses shell-free platform openers on Windows and Linux', async () => {
    const path = "/tmp/report with spaces ' ; $().pdf";
    const windowsRun = vi.fn(async () => ({ stdout: '' }));
    const linuxRun = vi.fn(async () => ({ stdout: '' }));

    await openNativePath(path, { platform: 'win32', run: windowsRun });
    await openNativePath(path, { platform: 'linux', run: linuxRun });

    expect(windowsRun).toHaveBeenCalledWith('powershell.exe', [
      '-NoProfile', '-Command', 'Invoke-Item -LiteralPath $args[0]', path,
    ]);
    expect(linuxRun).toHaveBeenCalledWith('xdg-open', [path]);
  });

  it('rejects unsupported platforms', async () => {
    const run = vi.fn(async () => ({ stdout: '' }));
    await expect(openNativePath('/tmp/file.txt', { platform: 'aix', run }))
      .rejects.toThrow('Native path opener is unsupported on aix');
    expect(run).not.toHaveBeenCalled();
  });
});
