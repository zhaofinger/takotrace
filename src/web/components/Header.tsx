import type { ConnectionState, Thread } from "../types";
import type { ThemePreference } from "../theme";
import { nextThemePreference } from "../theme";
import { Icon } from "./Icon";
import { GlobalSearch } from "./GlobalSearch";
import { StatusMark } from "./StatusMark";

const THEME_LABELS: Record<ThemePreference, string> = {
  auto: "System",
  light: "Light",
  dark: "Dark",
};

export function Header({
  connection,
  onSelectThread,
  onSelectTurn,
  onThemeChange,
  theme,
  threads,
}: {
  connection: ConnectionState;
  onSelectThread: (threadId: string) => void;
  onSelectTurn: (threadId: string, turnId: string) => void;
  onThemeChange: () => void;
  theme: ThemePreference;
  threads: Thread[];
}) {
  const isConnected = connection.status.toLowerCase() === "connected";
  const connectionLabel = isConnected
    ? "Connected"
    : `${connection.status.charAt(0).toUpperCase()}${connection.status.slice(1)}`;
  const nextTheme = nextThemePreference(theme);

  return (
    <header className="vbg-custom-topbar">
      <h1>ThreadScope</h1>
      <GlobalSearch
        onSelectThread={onSelectThread}
        onSelectTurn={onSelectTurn}
        threads={threads}
      />
      <div className="vbg-custom-topbar__meta">
        <details className="vbg-custom-topbar__connection">
          <summary title="Connection details">
            <StatusMark status={connectionLabel} />
          </summary>
          <dl>
            <div><dt>Mode</dt><dd>{isConnected ? "Desktop snapshots · near real-time" : "Snapshot connection"}</dd></div>
            {connection.userAgent && <div><dt>Client</dt><dd>{connection.userAgent}</dd></div>}
          </dl>
        </details>
        {connection.error && <span className="vbg-custom-topbar__error" title={connection.error}>{connection.error}</span>}
        <button
          aria-label={`Theme: ${THEME_LABELS[theme]}. Switch to ${THEME_LABELS[nextTheme]}`}
          className="vbg-custom-theme-toggle"
          onClick={onThemeChange}
          title={`Theme: ${THEME_LABELS[theme]}`}
          type="button"
        >
          <Icon name={theme === "auto" ? "monitor" : theme === "light" ? "sun" : "moon"} />
          <span>{THEME_LABELS[theme]}</span>
        </button>
      </div>
    </header>
  );
}
