import { useEffect, useId, useMemo, useState } from "react";
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

export type GlobalSearchKeyboardAction =
  | { type: "dismiss" }
  | { type: "move"; index: number }
  | { type: "select"; index: number };

export function getGlobalSearchKeyboardAction(
  key: string,
  activeIndex: number,
  optionCount: number,
): GlobalSearchKeyboardAction | null {
  if (key === "Escape") return { type: "dismiss" };
  if (key === "Enter") {
    return activeIndex >= 0 && activeIndex < optionCount
      ? { type: "select", index: activeIndex }
      : null;
  }
  if (optionCount === 0) return null;

  switch (key) {
    case "ArrowDown":
      return { type: "move", index: activeIndex < 0 ? 0 : (activeIndex + 1) % optionCount };
    case "ArrowUp":
      return { type: "move", index: activeIndex < 0 ? optionCount - 1 : (activeIndex - 1 + optionCount) % optionCount };
    case "Home":
      return { type: "move", index: 0 };
    case "End":
      return { type: "move", index: optionCount - 1 };
    default:
      return null;
  }
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
  const componentId = useId().replace(/:/g, "");
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const results = useMemo(() => searchThreadsAndTurns(threads, query), [query, threads]);
  const hasQuery = Boolean(query.trim());
  const hasResults = results.threads.length > 0 || results.turns.length > 0;
  const optionCount = results.threads.length + results.turns.length;
  const isOpen = isFocused && hasQuery;
  const resultsId = `threadscope-global-search-results-${componentId}`;
  const sessionsHeadingId = `threadscope-global-search-sessions-${componentId}`;
  const runsHeadingId = `threadscope-global-search-runs-${componentId}`;
  const optionId = (index: number) => `${resultsId}-option-${index}`;

  useEffect(() => setActiveIndex(-1), [results]);

  const finishSelection = (select: () => void) => {
    select();
    setQuery("");
    setIsFocused(false);
    setActiveIndex(-1);
  };

  const selectOption = (index: number) => {
    if (index < results.threads.length) {
      const thread = results.threads[index];
      if (thread) finishSelection(() => onSelectThread(thread.id));
      return;
    }

    const result = results.turns[index - results.threads.length];
    if (result) finishSelection(() => onSelectTurn(result.thread.id, result.turn.id));
  };

  return (
    <div
      className="vbg-custom-global-search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsFocused(false);
          setActiveIndex(-1);
        }
      }}
    >
      <label className="vbg-custom-global-search__field">
        <Icon name="search" />
        <span className="vbg-custom-sr-only">Search sessions and loaded runs</span>
        <input
          aria-activedescendant={isOpen && activeIndex >= 0 && activeIndex < optionCount ? optionId(activeIndex) : undefined}
          aria-autocomplete="list"
          aria-controls={resultsId}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(-1);
          }}
          onFocus={() => setIsFocused(true)}
          onKeyDown={(event) => {
            const action = getGlobalSearchKeyboardAction(event.key, activeIndex, optionCount);
            if (!action) return;

            event.preventDefault();
            if (action.type === "move") {
              setActiveIndex(action.index);
            } else if (action.type === "select") {
              selectOption(action.index);
            } else {
              setQuery("");
              setIsFocused(false);
              setActiveIndex(-1);
              event.currentTarget.blur();
            }
          }}
          placeholder="Search sessions and runs…"
          role="combobox"
          spellCheck={false}
          type="search"
          value={query}
        />
      </label>

      {isOpen && (
        <div className="vbg-custom-global-search__results">
          <div aria-label="Search results" id={resultsId} role="listbox">
            {results.threads.length > 0 && (
              <section aria-labelledby={sessionsHeadingId} role="group">
                <h2 id={sessionsHeadingId}>Sessions</h2>
                {results.threads.map((thread, index) => (
                  <button
                    aria-selected={activeIndex === index}
                    id={optionId(index)}
                    key={thread.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => finishSelection(() => onSelectThread(thread.id))}
                    role="option"
                    tabIndex={-1}
                    title={thread.title || thread.id}
                    type="button"
                  >
                    <Icon name="history" />
                    <span className="vbg-custom-global-search__result-copy">
                      <strong>{thread.title || thread.id}</strong>
                      <span>{projectName(thread.cwd)} · {thread.id}</span>
                    </span>
                  </button>
                ))}
              </section>
            )}

            {results.turns.length > 0 && (
              <section aria-labelledby={runsHeadingId} role="group">
                <h2 id={runsHeadingId}>Runs</h2>
                {results.turns.map(({ thread, turn }, turnIndex) => {
                  const index = results.threads.length + turnIndex;
                  return (
                    <button
                      aria-selected={activeIndex === index}
                      id={optionId(index)}
                      key={`${thread.id}:${turn.id}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => finishSelection(() => onSelectTurn(thread.id, turn.id))}
                      role="option"
                      tabIndex={-1}
                      title={turn.summary}
                      type="button"
                    >
                      <Icon name="message" />
                      <span className="vbg-custom-global-search__result-copy">
                        <strong>{turn.summary || turn.id}</strong>
                        <span>{thread.title || thread.id} · {turn.id}</span>
                      </span>
                    </button>
                  );
                })}
              </section>
            )}
          </div>

          {!hasResults && (
            <div aria-live="polite" className="vbg-custom-global-search__empty" role="status">
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
