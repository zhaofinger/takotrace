import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type CodexCommandSource = 'explicit' | 'path' | 'bundle';

export interface ResolvedCodexCommand {
  command: string;
  version?: string;
  source: CodexCommandSource;
}

export interface ResolveCodexCommandOptions {
  explicitPath?: string;
  platform?: NodeJS.Platform;
  homeDir?: string;
  timeoutMs?: number;
  probe?: (command: string, timeoutMs: number) => string | undefined;
  isExecutable?: (command: string) => boolean;
}

const DEFAULT_TIMEOUT_MS = 2_000;
const BUNDLE_RELATIVE_PATHS = [
  ['ChatGPT.app', 'Contents', 'Resources', 'codex'],
  ['Codex.app', 'Contents', 'Resources', 'codex'],
] as const;

export function resolveCodexCommand(options: ResolveCodexCommandOptions = {}): ResolvedCodexCommand {
  const probe = options.probe ?? probeCodexVersion;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (options.explicitPath !== undefined) {
    return {
      command: options.explicitPath,
      version: safelyProbe(probe, options.explicitPath, timeoutMs),
      source: 'explicit',
    };
  }

  const pathVersion = safelyProbe(probe, 'codex', timeoutMs);
  const pathResult: ResolvedCodexCommand = {
    command: 'codex',
    version: pathVersion,
    source: 'path',
  };

  if ((options.platform ?? process.platform) !== 'darwin' || pathVersion === undefined) {
    return pathResult;
  }

  const isExecutable = options.isExecutable ?? canExecute;
  let selected = pathResult;
  for (const command of macBundleCandidates(options.homeDir ?? homedir())) {
    if (!safelyCheckExecutable(isExecutable, command)) continue;

    const version = safelyProbe(probe, command, timeoutMs);
    if (version !== undefined && compareVersions(version, selected.version!) > 0) {
      selected = { command, version, source: 'bundle' };
    }
  }
  return selected;
}

function macBundleCandidates(homeDir: string): string[] {
  return [
    ...BUNDLE_RELATIVE_PATHS.map(parts => join('/Applications', ...parts)),
    ...BUNDLE_RELATIVE_PATHS.map(parts => join(homeDir, 'Applications', ...parts)),
  ];
}

function probeCodexVersion(command: string, timeoutMs: number): string | undefined {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    shell: false,
    timeout: timeoutMs,
  });
  if (result.error || result.status !== 0) return undefined;
  return extractVersion(result.stdout || result.stderr || '');
}

function extractVersion(output: string): string | undefined {
  return /(?:^|\s)v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:\s|$)/.exec(output.trim())?.[1];
}

function canExecute(command: string): boolean {
  try {
    accessSync(command, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function safelyProbe(
  probe: NonNullable<ResolveCodexCommandOptions['probe']>,
  command: string,
  timeoutMs: number,
): string | undefined {
  try {
    return probe(command, timeoutMs);
  } catch {
    return undefined;
  }
}

function safelyCheckExecutable(
  isExecutable: NonNullable<ResolveCodexCommandOptions['isExecutable']>,
  command: string,
): boolean {
  try {
    return isExecutable(command);
  } catch {
    return false;
  }
}

function compareVersions(left: string, right: string): number {
  const leftVersion = parseVersion(left);
  const rightVersion = parseVersion(right);
  if (!leftVersion || !rightVersion) return 0;

  for (let index = 0; index < 3; index += 1) {
    const difference = leftVersion.core[index] - rightVersion.core[index];
    if (difference !== 0) return Math.sign(difference);
  }

  if (leftVersion.prerelease.length === 0 || rightVersion.prerelease.length === 0) {
    return leftVersion.prerelease.length === rightVersion.prerelease.length
      ? 0
      : leftVersion.prerelease.length === 0 ? 1 : -1;
  }

  const length = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = leftVersion.prerelease[index];
    const rightIdentifier = rightVersion.prerelease[index];
    if (leftIdentifier === undefined || rightIdentifier === undefined) {
      return leftIdentifier === rightIdentifier ? 0 : leftIdentifier === undefined ? -1 : 1;
    }
    if (leftIdentifier === rightIdentifier) continue;

    const leftNumber = /^\d+$/.test(leftIdentifier) ? Number(leftIdentifier) : undefined;
    const rightNumber = /^\d+$/.test(rightIdentifier) ? Number(rightIdentifier) : undefined;
    if (leftNumber !== undefined || rightNumber !== undefined) {
      if (leftNumber === undefined) return 1;
      if (rightNumber === undefined) return -1;
      return Math.sign(leftNumber - rightNumber);
    }
    return leftIdentifier < rightIdentifier ? -1 : 1;
  }
  return 0;
}

function parseVersion(version: string): { core: [number, number, number]; prerelease: string[] } | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
  if (!match) return undefined;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split('.') ?? [],
  };
}
