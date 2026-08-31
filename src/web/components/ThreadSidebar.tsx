import { useMemo, useState } from "react";
import { projectName } from "../formatters";
import { handleRovingTabKey } from "../roving-tabs";
import type { SessionProvider, Thread } from "../types";
import { Icon } from "./Icon";

const COLLAPSED_THREAD_COUNT = 5;
const COLLAPSED_TIME_THREAD_COUNT = 20;
const PROVIDER_TAB_ID_PREFIX = "session-provider-tab";
const PROVIDER_PANEL_ID_PREFIX = "session-provider-panel";

interface ThreadGroup {
  cwd: string;
  label: string;
  threads: Thread[];
}

interface TimeThreadGroup {
  key: string;
  label: string;
  threads: Thread[];
}

function localDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

export function buildTimeGroups(threads: Thread[], now = new Date()): TimeThreadGroup[] {
  const today = localDayNumber(now);
  const groups = new Map<string, TimeThreadGroup>();
  const sorted = threads
    .map((thread, index) => ({ thread, index, timestamp: Date.parse(thread.updatedAt) }))
    .sort((left, right) => {
      const leftTime = Number.isNaN(left.timestamp) ? Number.NEGATIVE_INFINITY : left.timestamp;
      const rightTime = Number.isNaN(right.timestamp) ? Number.NEGATIVE_INFINITY : right.timestamp;
      return rightTime - leftTime || left.index - right.index;
    });

  for (const { thread, timestamp } of sorted) {
    const age = Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : today - localDayNumber(new Date(timestamp));
    const [key, label] = age <= 0
      ? ["today", "Today"]
      : age === 1
        ? ["yesterday", "Yesterday"]
        : age <= 7
          ? ["previous-7-days", "Previous 7 days"]
          : age <= 30
            ? ["previous-30-days", "Previous 30 days"]
            : ["older", "Older"];
    const group = groups.get(key);
    if (group) group.threads.push(thread);
    else groups.set(key, { key, label, threads: [thread] });
  }

  return Array.from(groups.values());
}

export function ThreadSidebar({
  activeProvider = "codex",
  counts,
  isLoading = false,
  onProviderChange,
  threads,
  selectedId,
  onSelect,
}: {
  activeProvider?: SessionProvider;
  counts?: Record<SessionProvider, number>;
  isLoading?: boolean;
  onProviderChange?: (provider: SessionProvider) => void;
  threads: Thread[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const [sortByTime, setSortByTime] = useState(false);
  const [visibleCounts, setVisibleCounts] = useState<Map<string, number>>(() => new Map());
  const [visibleTimeCount, setVisibleTimeCount] = useState(COLLAPSED_TIME_THREAD_COUNT);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const projectGroups = useMemo<ThreadGroup[]>(() => {
    const grouped = new Map<string, Thread[]>();
    for (const thread of threads) {
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
  }, [threads]);
  const timeThreads = useMemo(() => {
    const visible = threads.slice(0, visibleTimeCount);
    const selectedThread = threads.find((thread) => thread.id === selectedId);
    return selectedThread && !visible.includes(selectedThread) ? [...visible, selectedThread] : visible;
  }, [selectedId, threads, visibleTimeCount]);
  const timeGroups = useMemo(() => buildTimeGroups(timeThreads), [timeThreads]);
  const allTimeGroups = useMemo(() => buildTimeGroups(threads), [threads]);
  const selectGroups = sortByTime ? allTimeGroups : projectGroups;
  const hasMoreTimeThreads = visibleTimeCount < threads.length;
  const inactiveProvider: SessionProvider = activeProvider === "codex" ? "claude" : "codex";

  return (
    <aside aria-busy={isLoading} className="vbg-custom-threads" aria-label="Sessions">
      <div aria-label="Session provider" className="vbg-custom-provider-tabs" role="tablist">
        {(["codex", "claude"] as const).map((provider) => (
          <button
            aria-controls={`${PROVIDER_PANEL_ID_PREFIX}-${provider}`}
            aria-selected={activeProvider === provider}
            className={activeProvider === provider ? "vbg-custom-is-selected" : undefined}
            id={`${PROVIDER_TAB_ID_PREFIX}-${provider}`}
            key={provider}
            onClick={() => onProviderChange?.(provider)}
            onKeyDown={handleRovingTabKey}
            role="tab"
            tabIndex={activeProvider === provider ? 0 : -1}
            type="button"
          >
            <span>{provider === "codex" ? "Codex" : "Claude"}</span>
            <span className="vbg-custom-provider-tabs__count">{counts?.[provider] ?? 0}</span>
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`${PROVIDER_TAB_ID_PREFIX}-${activeProvider}`}
        className="vbg-custom-provider-panel"
        id={`${PROVIDER_PANEL_ID_PREFIX}-${activeProvider}`}
        role="tabpanel"
      >
      {threads.length > 0 && (
        <label className="vbg-custom-thread-select-wrap">
          <span className="vbg-custom-sr-only">Select session</span>
          <select value={selectedId ?? ""} onChange={(event) => onSelect(event.target.value)}>
            {selectGroups.map((group) => (
              <optgroup key={"cwd" in group ? group.cwd || "unknown" : group.key} label={group.label}>
                {group.threads.map((thread) => (
                  <option key={thread.id} value={thread.id}>
                    {thread.title || thread.id}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}
      {threads.length > 0 && (
        <div className="vbg-custom-thread-list-toolbar">
          <button
            aria-checked={sortByTime}
            className="vbg-custom-thread-sort-switch"
            onClick={() => setSortByTime((current) => !current)}
            role="switch"
            type="button"
          >
            <span>Group by time</span>
            <span aria-hidden="true" className="vbg-custom-thread-sort-switch__track">
              <span className="vbg-custom-thread-sort-switch__thumb" />
            </span>
          </button>
        </div>
      )}
      {threads.length === 0 && (
        <div aria-live={isLoading ? "polite" : undefined} className="vbg-custom-thread-mobile-state" role={isLoading ? "status" : undefined}>
          {isLoading ? (
            <>
              <span aria-hidden="true" className="vbg-custom-spinner" />
              <strong>Loading sessions…</strong>
            </>
          ) : (
            <>
              <Icon name="activity" />
              <strong>No sessions yet</strong>
              <span>New sessions will appear here.</span>
            </>
          )}
        </div>
      )}
      <div className="vbg-custom-thread-list">
        {sortByTime ? timeGroups.map((group) => (
          <section className="vbg-custom-thread-group vbg-custom-thread-group--time" key={group.key}>
            <h3 className="vbg-custom-thread-time-heading">{group.label}</h3>
            {group.threads.map((thread) => (
              <button
                aria-current={thread.id === selectedId ? "true" : undefined}
                className={`vbg-custom-thread-row vbg-custom-thread-row--time${thread.id === selectedId ? " vbg-custom-is-selected" : ""}`}
                key={thread.id}
                onClick={() => onSelect(thread.id)}
                title={thread.title || thread.id}
                type="button"
              >
                <span className="vbg-custom-thread-row__title">{thread.title || thread.id}</span>
                <span className="vbg-custom-thread-row__project">
                  <Icon name="folder" />
                  <span>{projectName(thread.cwd)}</span>
                </span>
              </button>
            ))}
          </section>
        )) : projectGroups.map((group) => {
          const groupKey = group.cwd || "unknown";
          const selectedIndex = group.threads.findIndex((thread) => thread.id === selectedId);
          const isGroupCollapsed = collapsedGroups.has(groupKey);
          const visibleCount = visibleCounts.get(groupKey) ?? COLLAPSED_THREAD_COUNT;
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
              {!isGroupCollapsed && hasMore && (
                <button
                  aria-label={`Load more ${group.label} sessions`}
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
        {sortByTime && hasMoreTimeThreads && (
          <button
            className="vbg-custom-thread-group__toggle vbg-custom-thread-group__toggle--time"
            onClick={() => setVisibleTimeCount((current) => Math.min(current + COLLAPSED_TIME_THREAD_COUNT, threads.length))}
            type="button"
          >
            Load more
          </button>
        )}
        {threads.length === 0 && isLoading && (
          <div aria-live="polite" className="vbg-custom-loading-state" role="status">
            <span aria-hidden="true" className="vbg-custom-spinner" />
            <strong>Loading sessions…</strong>
            <span>Reading local session history.</span>
          </div>
        )}
        {threads.length === 0 && !isLoading && (
          <div className="vbg-custom-empty-state">
            <Icon name="activity" />
            <strong>No sessions yet</strong>
            <span>New sessions will appear here.</span>
          </div>
        )}
      </div>
      </div>
      <div
        aria-labelledby={`${PROVIDER_TAB_ID_PREFIX}-${inactiveProvider}`}
        hidden
        id={`${PROVIDER_PANEL_ID_PREFIX}-${inactiveProvider}`}
        role="tabpanel"
      />
    </aside>
  );
}
