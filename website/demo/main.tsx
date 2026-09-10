import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Header } from "../../src/web/components/Header";
import { ThreadSidebar } from "../../src/web/components/ThreadSidebar";
import { Timeline } from "../../src/web/components/Timeline";
import { DetailPanel } from "../../src/web/components/DetailPanel";
import { nextThemePreference, type ThemePreference } from "../../src/web/theme";
import type { SessionProvider } from "../../src/web/types";
import { threads } from "./data";
import "../../src/web/assets/vercel-brand.css";
import "../../src/web/styles.css";
import "./style.css";

function Demo() {
  const [provider, setProvider] = useState<SessionProvider>("codex");
  const [threadId, setThreadId] = useState(threads[0].id);
  const [turnId, setTurnId] = useState(threads[0].turns[0].id);
  const [theme, setTheme] = useState<ThemePreference>("dark");
  const visible = threads.filter((thread) => thread.provider === provider);
  const thread = visible.find((thread) => thread.id === threadId) ?? visible[0];
  const turn =
    thread.turns.find((turn) => turn.id === turnId) ?? thread.turns[0];
  useEffect(() => {
    document.body.classList.toggle("dark", theme === "dark");
    document.body.classList.toggle("light", theme === "light");
    const notify = () =>
      window.dispatchEvent(new Event("takotrace:themechange"));
    notify();
    if (theme !== "auto") return;
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    systemTheme.addEventListener("change", notify);
    return () => systemTheme.removeEventListener("change", notify);
  }, [theme]);
  const selectThread = (id: string) => {
    setThreadId(id);
    setTurnId(threads.find((thread) => thread.id === id)!.turns[0].id);
  };
  return (
    <div className="vbg-custom-app-shell">
      <Header
        connection={{
          status: "demo",
          userAgent: "Mock data · no live connection",
        }}
        threads={visible}
        onSelectThread={selectThread}
        onSelectTurn={(id, run) => {
          setThreadId(id);
          setTurnId(run);
        }}
        theme={theme}
        onThemeChange={() => setTheme(nextThemePreference(theme))}
      />
      <div className="vbg-custom-workspace">
        <ThreadSidebar
          activeProvider={provider}
          counts={{ codex: 2, claude: 1 }}
          threads={visible}
          selectedId={thread.id}
          onSelect={selectThread}
          onProviderChange={setProvider}
        />
        <Timeline
          thread={thread}
          turns={thread.turns}
          selectedId={turn.id}
          onSelect={(turn) => setTurnId(turn.id)}
        />
        <DetailPanel turn={turn} />
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Demo />);
