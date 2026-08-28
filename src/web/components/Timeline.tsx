import { useEffect, useMemo, useRef } from "react";
import { formatExactNumber, formatPercentage, formatTokenCount } from "../formatters";
import { eventRaw, normalizedEventType } from "../trace-event";
import type { CompactTraceEvent, CompactTurn, Thread, Turn } from "../types";
import { asRecord, nonEmptyText } from "../value-utils";
import { CopyIconButton } from "./CopyIconButton";
import { Icon } from "./Icon";
import { InlineMarkdown } from "./MarkdownContent";

type DisplayTraceEvent = CompactTraceEvent & { raw?: unknown };

export { formatTokenCount } from "../formatters";

function rawItemText(item: DisplayTraceEvent): string | undefined {
  const raw = eventRaw(item);
  const direct = nonEmptyText(raw.text);
  if (direct) return direct;
  if (!Array.isArray(raw.content)) return undefined;
  const textEntry = raw.content.map(asRecord).find((entry) => entry.type === "text" && nonEmptyText(entry.text));
  return nonEmptyText(textEntry?.text);
}

function requestText(item: DisplayTraceEvent): string {
  const text = rawItemText(item) ?? item.summary;
  const marker = "## My request:";
  const markerIndex = text.indexOf(marker);
  return (markerIndex >= 0 ? text.slice(markerIndex + marker.length) : text).trim();
}

export function turnSummary(turn: CompactTurn | Turn): string {
  if ("summary" in turn && turn.summary) return turn.summary;
  const userMessage = turn.items.find((item) => normalizedEventType(item) === "usermessage");
  if (userMessage) return requestText(userMessage);
  const finalResponse = [...turn.items].reverse().find((item) => normalizedEventType(item) === "agentmessage");
  return finalResponse?.summary || turn.items.find((item) => item.summary)?.summary || `Run ${turn.id}`;
}

export function Timeline({
  isLoading = false,
  thread,
  turns,
  selectedId,
  onSelect,
}: {
  isLoading?: boolean;
  thread?: Thread;
  turns: CompactTurn[];
  selectedId?: string;
  onSelect: (turn: CompactTurn) => void;
}) {
  const tableRef = useRef<HTMLTableElement>(null);
  const selectedRowRef = useRef<HTMLTableRowElement>(null);
  const rows = useMemo(
    () => turns.map((turn) => ({ turn, summary: turnSummary(turn) })),
    [turns],
  );
  const contextWindow = thread?.tokenUsage?.modelContextWindow;
  const contextTokens = thread?.tokenUsage?.last.totalTokens;
  const contextPercentage = contextWindow && contextWindow > 0 && contextTokens !== undefined
    ? formatPercentage(contextTokens / contextWindow)
    : undefined;

  useEffect(() => {
    const table = tableRef.current;
    const row = selectedRowRef.current;
    if (!table || !row) return;

    const rowTop = row.offsetTop;
    const rowBottom = rowTop + row.offsetHeight;
    const visibleTop = table.scrollTop;
    const visibleBottom = visibleTop + table.clientHeight;

    if (rowTop < visibleTop) table.scrollTop = rowTop;
    else if (rowBottom > visibleBottom) table.scrollTop = rowBottom - table.clientHeight;
  }, [rows.length, selectedId, thread?.id]);

  return (
    <main aria-label="Runs" className="vbg-custom-timeline" id="main">
      <header className="vbg-custom-timeline__header">
        <div className="vbg-custom-timeline__title">
          {thread ? (
            <div className="vbg-custom-thread-identity">
              <span>Session</span>
              <code title={thread.id}>{thread.id}</code>
              <CopyIconButton copiedLabel="Session ID copied" copyLabel="Copy session ID" value={thread.id} />
            </div>
          ) : <span className="vbg-custom-timeline__placeholder">Select a session</span>}
        </div>
        {thread && (
          <dl aria-label="Session summary" className="vbg-custom-thread-meta">
            <div>
              <dt>Runs</dt>
              <dd aria-label={isLoading ? "Loading runs" : `${turns.length} ${turns.length === 1 ? "run" : "runs"}`}>
                {isLoading ? "…" : turns.length}
              </dd>
            </div>
            {thread.tokenUsage && (
              <>
                <div>
                  <dt>Tokens</dt>
                  <dd
                    aria-label={`${formatExactNumber(thread.tokenUsage.total.totalTokens)} total tokens`}
                    title={`${formatExactNumber(thread.tokenUsage.total.totalTokens)} tokens`}
                  >
                    {formatTokenCount(thread.tokenUsage.total.totalTokens)}
                  </dd>
                </div>
                {contextPercentage && contextWindow !== undefined && contextTokens !== undefined && (
                  <div>
                    <dt>Context</dt>
                    <dd
                      aria-label={`${formatExactNumber(contextTokens)} of ${formatExactNumber(contextWindow)} context tokens, ${contextPercentage}`}
                      title={`${formatExactNumber(contextTokens)} / ${formatExactNumber(contextWindow)} tokens (${contextPercentage})`}
                    >
                      {contextPercentage}
                    </dd>
                  </div>
                )}
              </>
            )}
          </dl>
        )}
      </header>

      <table aria-busy={isLoading} className="vbg-custom-event-table" ref={tableRef}>
        <caption className="vbg-custom-sr-only">Session runs</caption>
        <tbody className="vbg-custom-event-table__body">
          {rows.map(({ turn, summary }) => (
            <tr
              aria-selected={turn.id === selectedId}
              className={`vbg-custom-event-row${turn.id === selectedId ? " vbg-custom-is-selected" : ""}`}
              key={turn.id}
              onClick={() => onSelect(turn)}
              ref={turn.id === selectedId ? selectedRowRef : undefined}
            >
              <td className="vbg-custom-event-row__summary" title={summary}>
                <button
                  aria-current={turn.id === selectedId ? "true" : undefined}
                  className="vbg-custom-event-row__select"
                  type="button"
                >
                  <InlineMarkdown>{summary}</InlineMarkdown>
                  <span className="vbg-custom-sr-only">{turn.status}</span>
                </button>
              </td>
            </tr>
          ))}
          {!rows.length && isLoading && (
            <tr>
              <td>
                <div aria-live="polite" className="vbg-custom-loading-state" role="status">
                  <span aria-hidden="true" className="vbg-custom-spinner" />
                  <strong>Loading runs…</strong>
                  <span>Fetching this session’s history.</span>
                </div>
              </td>
            </tr>
          )}
          {!rows.length && !isLoading && (
            <tr>
              <td>
                <div className="vbg-custom-timeline-empty">
                  <Icon name="history" />
                  <strong>{thread ? "No runs in this session" : "No session selected"}</strong>
                  <span>{thread ? "Synced runs will appear here." : "Choose a session from the list."}</span>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <footer className="vbg-custom-timeline__footer">
        {isLoading
          ? "Loading session history…"
          : thread
            ? `Showing ${turns.length} run${turns.length === 1 ? "" : "s"} · ${thread.historySource === "rollout-file" ? "Rollout fallback" : "App Server"}`
            : "Select a session to view runs"}
      </footer>
    </main>
  );
}
