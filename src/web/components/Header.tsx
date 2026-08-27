import type { ConnectionState } from "../types";
import type { ThemePreference } from "../theme";
import { nextThemePreference } from "../theme";
import { Icon } from "./Icon";
import { StatusMark } from "./StatusMark";

const THEME_LABELS: Record<ThemePreference, string> = {
  auto: "System",
  light: "Light",
  dark: "Dark",
};

export function Header({
  connection,
  onThemeChange,
  theme,
}: {
  connection: ConnectionState;
  onThemeChange: () => void;
  theme: ThemePreference;
}) {
  const isConnected = connection.status.toLowerCase() === "connected";
  const nextTheme = nextThemePreference(theme);

  return (
    <header className="vbg-custom-topbar">
      <h1>ThreadScope</h1>
      <div className="vbg-custom-topbar__meta">
        <StatusMark status={isConnected ? "Connected" : connection.status} />
        {isConnected && <><span className="vbg-custom-topbar__divider vbg-custom-topbar__mode" /><span className="vbg-custom-topbar__mode">Desktop snapshots · near real-time</span></>}
        {connection.userAgent && <><span className="vbg-custom-topbar__divider vbg-custom-topbar__client" /><span className="vbg-custom-topbar__client" title={connection.userAgent}>{connection.userAgent}</span></>}
        {connection.error && <><span className="vbg-custom-topbar__divider" /><span className="vbg-custom-topbar__error">{connection.error}</span></>}
        <span className="vbg-custom-topbar__divider" />
        <code>127.0.0.1</code>
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
