import { execFile } from 'node:child_process';
import { extname } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const BROWSER_DOCUMENTS = new Set(['.html', '.htm', '.xhtml', '.svg']);

export interface NativePathOpenerOptions {
  platform?: NodeJS.Platform;
  run?: (command: string, args: string[]) => Promise<{ stdout: string }>;
}

export async function openNativePath(pathname: string, options: NativePathOpenerOptions = {}): Promise<void> {
  const platform = options.platform ?? process.platform;
  const run = options.run ?? runNativeCommand;

  if (platform === 'darwin') {
    if (BROWSER_DOCUMENTS.has(extname(pathname).toLowerCase())) {
      try {
        const { stdout } = await run('defaults', ['read', 'com.apple.LaunchServices/com.apple.launchservices.secure']);
        const bundle = macBundleForHttps(stdout);
        if (bundle) {
          await run('open', ['-b', bundle, pathname]);
          return;
        }
      } catch {
        // Fall back to the file's registered application when LaunchServices cannot name a browser.
      }
    }
    await run('open', [pathname]);
    return;
  }

  if (platform === 'win32') {
    await run('powershell.exe', ['-NoProfile', '-Command', 'Invoke-Item -LiteralPath $args[0]', pathname]);
    return;
  }

  if (platform === 'linux') {
    await run('xdg-open', [pathname]);
    return;
  }

  throw new Error(`Native path opener is unsupported on ${platform}`);
}

async function runNativeCommand(command: string, args: string[]): Promise<{ stdout: string }> {
  const { stdout } = await execFileAsync(command, args, { maxBuffer: 1_048_576 });
  return { stdout };
}

function macBundleForHttps(plist: string): string | undefined {
  const stripped = plist.replace(/LSHandlerPreferredVersions\s*=\s*\{[^}]*\};/g, '');
  const block = /\{[^{}]*LSHandlerURLScheme\s*=\s*"?https"?;[^{}]*\}/.exec(stripped)?.[0];
  return block ? /LSHandlerRoleAll\s*=\s*"?([\w.-]+)"?;/.exec(block)?.[1] : undefined;
}
