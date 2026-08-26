import { useMemo, useState } from "react";
import type { Thread } from "../types";
import { Icon } from "./Icon";

const COLLAPSED_THREAD_COUNT = 5;

function projectName(cwd?: string): string {
  if (!cwd) return "Unknown project";
  const normalized = cwd.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]/).pop() || cwd;
}

export function ThreadSidebar({
  threads,
  selectedId,
  onSelect,
}: {
  threads: Thread[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [visibleCounts, setVisibleCounts] = useState<Map<string, number>>(() => new Map());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const groups = useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered = term
      ? threads.filter((thread) => `${thread.id} ${thread.title} ${thread.cwd ?? ""}`.toLowerCase().includes(term))
      : threads;
    const grouped = new Map<string, Thread[]>();
    for (const thread of filtered) {
      const key = thread.cwd || "";
      const projectThreads = grouped.get(key);
      if (projectThreads) projectThreads.push(thread);
      else grouped.set(key, [thread]);
    }
    return Array.from(grouped, ([cwd, projectThreads]) => ({
      cwd,
      label: projectName(cwd),
      threads: projectThreads,
    }));
  }, [query, threads]);
  const filteredCount = groups.reduce((count, group) => count + group.threads.length, 0);

  return (
    <aside className="vbg-custom-threads" aria-label="Threads">
      <label className="vbg-custom-thread-select-wrap">
        <span className="vbg-custom-sr-only">Select thread</span>
        <select value={selectedId ?? ""} onChange={(event) => onSelect(event.target.value)}>
          {groups.map((group) => (
            <optgroup key={group.cwd || "unknown"} label={group.label}>
              {group.threads.map((thread) => (
                <option key={thread.id} value={thread.id}>
                  {thread.title || thread.id}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="vbg-custom-search-field">
        <Icon name="search" />
        <span className="vbg-custom-sr-only">Filter threads</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter threads…"
        />
      </label>
      <div className="vbg-custom-thread-list">
        {groups.map((group) => {
          const groupKey = group.cwd || "unknown";
          const selectedIndex = group.threads.findIndex((thread) => thread.id === selectedId);
          const isGroupCollapsed = !query.trim() && collapsedGroups.has(groupKey);
          const visibleCount = query.trim()
            ? group.threads.length
            : visibleCounts.get(groupKey) ?? COLLAPSED_THREAD_COUNT;
          const loadedThreads = group.threads.slice(0, visibleCount);
          const selectedThread = selectedIndex >= visibleCount ? group.threads[selectedIndex] : undefined;
          const visibleThreads = selectedThread ? [...loadedThreads, selectedThread] : loadedThreads;
          const hasMore = visibleCount < group.threads.length;
          return (
            <section className="vbg-custom-thread-group" key={groupKey}>
              <h3 title={group.cwd || undefined}>
                <button
                  aria-expanded={!isGroupCollapsed}
                  aria-label={`${isGroupCollapsed ? "Expand" : "Collapse"} ${group.label}`}
                  className="vbg-custom-thread-group__heading"
                  onClick={() => setCollapsedGroups((current) => {
                    const next = new Set(current);
                    if (isGroupCollapsed) next.delete(groupKey);
                    else next.add(groupKey);
                    return next;
                  })}
                  type="button"
                >
                  <Icon name={isGroupCollapsed ? "folder" : "folderOpen"} />
                  <span>{group.label}</span>
                </button>
              </h3>
              {!isGroupCollapsed && visibleThreads.map((thread) => (
                <button
                  aria-current={thread.id === selectedId ? "true" : undefined}
                  className={`vbg-custom-thread-row${thread.id === selectedId ? " vbg-custom-is-selected" : ""}`}
                  key={thread.id}
                  onClick={() => onSelect(thread.id)}
                  title={thread.title || thread.id}
                  type="button"
                >
                  <span className="vbg-custom-thread-row__line">
                    <span className="vbg-custom-thread-row__identity">
                      <span className="vbg-custom-thread-row__title">{thread.title || thread.id}</span>
                    </span>
                  </span>
                </button>
              ))}
              {!isGroupCollapsed && hasMore && !query.trim() && (
                <button
                  aria-label={`Load more ${group.label} threads`}
                  className="vbg-custom-thread-group__toggle"
                  onClick={() => setVisibleCounts((current) => {
                    const next = new Map(current);
                    next.set(groupKey, Math.min(visibleCount + COLLAPSED_THREAD_COUNT, group.threads.length));
                    return next;
                  })}
                  type="button"
                >
                  Load more
                </button>
              )}
            </section>
          );
        })}
        {filteredCount === 0 && (
          <div className="vbg-custom-empty-state">
            <Icon name="activity" />
            <strong>{threads.length ? "No matching threads" : "No threads yet"}</strong>
            <span>{threads.length ? "Try a different filter." : "New activity will appear here."}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
