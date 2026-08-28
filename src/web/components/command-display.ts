function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function shellArgument(value: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : JSON.stringify(value);
}

export function commandText(value: unknown): string | undefined {
  const direct = text(value);
  if (direct) return direct;
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) return undefined;

  const args = value.filter((entry) => entry.length > 0);
  if (!args.length) return undefined;
  if (/\/(?:ba|z|)sh$/.test(args[0]) && (args[1] === "-c" || args[1] === "-lc")) {
    return text(args[2]);
  }
  return args.map(shellArgument).join(" ");
}

export function workingDirectoryText(value: unknown): string | undefined {
  const directory = text(value);
  if (!directory?.startsWith("file://")) return directory;
  try {
    return decodeURIComponent(new URL(directory).pathname);
  } catch {
    return directory;
  }
}
