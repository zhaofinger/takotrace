import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchState, fetchTurnDetail, subscribeToEvents, syncThread } from "./client";
import { DetailPanel } from "./components/DetailPanel";
import { Header } from "./components/Header";
import { ThreadSidebar } from "./components/ThreadSidebar";
import { Timeline } from "./components/Timeline";
import { nextThemePreference, readThemePreference, THEME_STORAGE_KEY } from "./theme";
import type { AppState, SnapshotEvent, TraceEvent, Turn } from "./types";

const initialState: AppState = {
  connection: { status: "connecting" },
  threads: [],
  events: [],
};

function isSnapshot(value: TraceEvent | SnapshotEvent): value is SnapshotEvent {
  return "kind" in value && value.kind === "snapshot";
}

export default function App() {
  const [theme, setTheme] = useState(readThemePreference);
  const [state, setState] = useState<AppState>(initialState);
  const [selectedThreadId, setSelectedThreadId] = useState<string>();
  const [selectedTurnId, setSelectedTurnId] = useState<string>();
  const [turnDetail, setTurnDetail] = useState<Turn>();
  const [turnDetailError, setTurnDetailError] = useState<string>();
  const [turnDetailLoading, setTurnDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [syncingThreads, setSyncingThreads] = useState<Set<string>>(() => new Set());
  const refreshTimer = useRef<number | undefined>(undefined);
  const syncingThreadIds = useRef(new Set<string>());
  const turnDetailRequestToken = useRef(0);

  useEffect(() => {
    document.body.classList.toggle("light", theme === "light");
    document.body.classList.toggle("dark", theme === "dark");
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Theme switching still works for this session when storage is unavailable.
    }
    window.dispatchEvent(new Event("threadscope:themechange"));

    if (theme !== "auto") return;
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => window.dispatchEvent(new Event("threadscope:themechange"));
    colorScheme.addEventListener("change", handleChange);
    return () => colorScheme.removeEventListener("change", handleChange);
  }, [theme]);

  const loadState = useCallback(async (signal?: AbortSignal) => {
    try {
      const nextState = await fetchState(signal);
      setState(nextState);
      setLoadError(undefined);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLoadError(error instanceof Error ? error.message : "Unable to load state");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadState(controller.signal);
    const unsubscribe = subscribeToEvents({
      onOpen: () => setState((current) => ({ ...current, connection: { ...current.connection, status: "connected", error: undefined } })),
      onError: () => setState((current) => ({ ...current, connection: { ...current.connection, status: "disconnected" } })),
      onEvent: (event) => {
        if (isSnapshot(event)) {
          setState(event.state);
          return;
        }
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = window.setTimeout(() => void loadState(), 80);
      },
    });
    return () => {
      controller.abort();
      window.clearTimeout(refreshTimer.current);
      unsubscribe();
    };
  }, [loadState]);

  useEffect(() => {
    if (!state.threads.length) {
      setSelectedThreadId(undefined);
      return;
    }
    if (!selectedThreadId || !state.threads.some((thread) => thread.id === selectedThreadId)) {
      setSelectedThreadId(state.threads[0].id);
    }
  }, [selectedThreadId, state.threads]);

  useEffect(() => {
    if (
      !selectedThreadId ||
      syncingThreadIds.current.has(selectedThreadId) ||
      state.threads.find((thread) => thread.id === selectedThreadId)?.turnsLoaded !== false
    ) {
      return;
    }

    syncingThreadIds.current.add(selectedThreadId);
    setSyncingThreads((current) => new Set(current).add(selectedThreadId));
    void syncThread(selectedThreadId)
      .then(() => loadState())
      .catch((error: unknown) => {
        // Fallback: reload state in case partial metadata was recorded, and report error non-fatally
        void loadState();
        setLoadError(error instanceof Error ? error.message : "Unable to sync thread");
      })
      .finally(() => {
        syncingThreadIds.current.delete(selectedThreadId);
        setSyncingThreads((current) => {
          const next = new Set(current);
          next.delete(selectedThreadId);
          return next;
        });
      });
  }, [loadState, selectedThreadId, state.threads]);

  const selectedThread = state.threads.find((thread) => thread.id === selectedThreadId);
  const threadLoading = selectedThreadId ? syncingThreads.has(selectedThreadId) : false;
  const turns = useMemo(() => selectedThread?.turns ?? [], [selectedThread]);

  useEffect(() => {
    if (!turns.length) {
      setSelectedTurnId(undefined);
      return;
    }
    if (!selectedTurnId || !turns.some((turn) => turn.id === selectedTurnId)) {
      setSelectedTurnId(turns[turns.length - 1].id);
    }
  }, [selectedTurnId, turns]);

  const selectedTurn = turns.find((turn) => turn.id === selectedTurnId);
  const visibleTurn = turnDetail?.id === selectedTurnId ? turnDetail : selectedTurn;

  useEffect(() => {
    const requestToken = ++turnDetailRequestToken.current;
    setTurnDetail(undefined);
    setTurnDetailError(undefined);

    if (!selectedThreadId || !selectedTurnId || !selectedTurn) {
      setTurnDetailLoading(false);
      return;
    }

    const controller = new AbortController();
    setTurnDetailLoading(true);
    void fetchTurnDetail(selectedThreadId, selectedTurnId, controller.signal)
      .then((detail) => {
        if (turnDetailRequestToken.current === requestToken) setTurnDetail(detail);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || turnDetailRequestToken.current !== requestToken) return;
        setTurnDetailError(error instanceof Error ? error.message : "Unable to load turn detail");
      })
      .finally(() => {
        if (turnDetailRequestToken.current === requestToken) setTurnDetailLoading(false);
      });

    return () => controller.abort();
  }, [
    selectedThreadId,
    selectedTurnId,
    selectedTurn?.itemCount,
    selectedTurn?.status,
  ]);

  return (
    <div className="vbg-custom-app-shell">
      <a className="vbg-skip-link" href="#main">Skip to content</a>
      <Header
        connection={state.connection}
        onThemeChange={() => setTheme((current) => nextThemePreference(current))}
        theme={theme}
      />
      {loadError && (
        <div className="vbg-custom-error-banner" role="alert">
          <span>{loadError}</span>
          <button onClick={() => void loadState()} type="button">Retry</button>
        </div>
      )}
      <div aria-busy={loading} className={`vbg-custom-workspace${loading ? " vbg-custom-is-loading" : ""}`}>
        <ThreadSidebar threads={state.threads} selectedId={selectedThreadId} onSelect={setSelectedThreadId} />
        <Timeline
          isLoading={threadLoading}
          thread={selectedThread}
          turns={turns}
          selectedId={selectedTurnId}
          onSelect={(turn) => setSelectedTurnId(turn.id)}
        />
        <DetailPanel
          error={turnDetailError}
          isLoading={threadLoading || turnDetailLoading}
          threadId={selectedThread?.id}
          turn={visibleTurn}
        />
      </div>
    </div>
  );
}
