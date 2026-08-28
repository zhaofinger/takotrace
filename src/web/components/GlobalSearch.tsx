import { useMemo, useState } from "react";
import type { CompactTurn, Thread } from "../types";
import { Icon } from "./Icon";

const MAX_THREAD_RESULTS = 8;
const MAX_TURN_RESULTS = 12;

export interface TurnSearchResult {
  thread: Thread;
  turn: CompactTurn;
}

export interface GlobalSearchResults {
  threads: Thread[];
  turns: TurnSearchResult[];
}

function includesQuery(values: Array<string | undefined>, query: string): boolean {
  const term = query.trim().toLocaleLowerCase();
  return Boolean(term) && values.some((value) => value?.toLocaleLowerCase().includes(term));
}

export function searchThreadsAndTurns(threads: Thread[], query: string): GlobalSearchResults {
  if (!query.trim()) return { threads: [], turns: [] };

  const matchingThreads: Thread[] = [];
  const matchingTurns: TurnSearchResult[] = [];

  for (const thread of threads) {
    if (
      matchingThreads.length < MAX_THREAD_RESULTS
      && includesQuery([thread.id, thread.title, thread.cwd, thread.status], query)
    ) {
      matchingThreads.push(thread);
    }

    if (matchingTurns.length >= MAX_TURN_RESULTS) continue;
    for (const turn of thread.turns) {
      if (includesQuery([turn.id, turn.summary, turn.status], query)) {
        matchingTurns.push({ thread, turn });
        if (matchingTurns.length >= MAX_TURN_RESULTS) break;
      }
    }
  }

  return { threads: matchingThreads, turns: matchingTurns };
}

function projectName(cwd?: string): string {
  if (!cwd) return "Unknown project";
  const normalized = cwd.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]/).pop() || cwd;
}

export function GlobalSearch({
  onSelectThread,
  onSelectTurn,
  threads,
}: {
  onSelectThread: (threadId: string) => void;
  onSelectTurn: (threadId: string, turnId: string) => void;
  threads: Thread[];
}) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const results = useMemo(() => searchThreadsAndTurns(threads, query), [query, threads]);
  const hasQuery = Boolean(query.trim());
  const hasResults = results.threads.length > 0 || results.turns.length > 0;
  const resultsId = "threadscope-global-search-results";

  const finishSelection = (select: () => void) => {
    select();
    setQuery("");
    setIsFocused(false);
  };

  return (
    <div
      className="vbg-custom-global-search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsFocused(false);
      }}
    >
      <label className="vbg-custom-global-search__field">
        <Icon name="search" />
        <span className="vbg-custom-sr-only">Search sessions and loaded runs</span>
        <input
          aria-controls={resultsId}
          aria-expanded={isFocused && hasQuery}
          aria-haspopup="dialog"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setIsFocused(true)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            setQuery("");
            setIsFocused(false);
            event.currentTarget.blur();
          }}
          placeholder="Search sessions and runs…"
          role="combobox"
          spellCheck={false}
          type="search"
          value={query}
        />
      </label>

      {isFocused && hasQuery && (
        <div aria-label="Search results" className="vbg-custom-global-search__results" id={resultsId} role="dialog">
          {results.threads.length > 0 && (
            <section>
              <h2>Sessions</h2>
              {results.threads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => finishSelection(() => onSelectThread(thread.id))}
                  title={thread.title || thread.id}
                  type="button"
                >
                  <Icon name="folder" />
                  <span className="vbg-custom-global-search__result-copy">
                    <strong>{thread.title || thread.id}</strong>
                    <span>{projectName(thread.cwd)} · {thread.id}</span>
                  </span>
                </button>
              ))}
            </section>
          )}

          {results.turns.length > 0 && (
            <section>
              <h2>Runs</h2>
              {results.turns.map(({ thread, turn }) => (
                <button
                  key={`${thread.id}:${turn.id}`}
                  onClick={() => finishSelection(() => onSelectTurn(thread.id, turn.id))}
                  title={turn.summary}
                  type="button"
                >
                  <Icon name="message" />
                  <span className="vbg-custom-global-search__result-copy">
                    <strong>{turn.summary || turn.id}</strong>
                    <span>{thread.title || thread.id} · {turn.id}</span>
                  </span>
                </button>
              ))}
            </section>
          )}

          {!hasResults && (
            <div className="vbg-custom-global-search__empty">
              <strong>No matches</strong>
              <span>Try a session title, project, ID, or run summary.</span>
            </div>
          )}
          <footer>Searching loaded runs only.</footer>
        </div>
      )}
    </div>
  );
}
