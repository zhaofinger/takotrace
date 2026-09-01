import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { formatClockTime, formatDateTime, formatExactNumber, formatPercentage } from "../formatters";
import { eventRaw, normalizedEventType } from "../trace-event";
import type { CompactTraceEvent, CompactTurn, Thread, Turn } from "../types";
import { asRecord, nonEmptyText } from "../value-utils";
import { CopyIconButton } from "./CopyIconButton";
import { Icon } from "./Icon";
import { InlineMarkdown } from "./MarkdownContent";
import { LoadingState } from "./LoadingState";
import { StatusMark } from "./StatusMark";

type DisplayTraceEvent = CompactTraceEvent & { raw?: unknown };

interface SessionTooltipState {
  above: boolean;
  left: number;
  top: number;
}

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
  const tooltipCloseTimerRef = useRef<number | undefined>(undefined);
  const [sessionTooltip, setSessionTooltip] = useState<SessionTooltipState | null>(null);
  const rows = useMemo(
    () => turns.map((turn) => ({ turn, summary: turnSummary(turn) })),
    [turns],
  );
  const contextWindow = thread?.tokenUsage?.modelContextWindow;
  const contextTokens = thread?.tokenUsage?.last.totalTokens;
  const contextRatio = contextWindow && contextWindow > 0 && contextTokens !== undefined
    ? contextTokens / contextWindow
    : undefined;
  const contextPercentage = contextRatio !== undefined ? formatPercentage(contextRatio) : undefined;
  const contextCapacityLevel = contextRatio !== undefined && contextRatio >= 0.95
    ? "danger"
    : contextRatio !== undefined && contextRatio >= 0.8
      ? "warning"
      : "normal";
  const cancelTooltipClose = () => {
    if (tooltipCloseTimerRef.current === undefined) return;
    window.clearTimeout(tooltipCloseTimerRef.current);
    tooltipCloseTimerRef.current = undefined;
  };

  const closeSessionTooltip = () => {
    cancelTooltipClose();
    setSessionTooltip(null);
  };

  const scheduleTooltipClose = () => {
    cancelTooltipClose();
    tooltipCloseTimerRef.current = window.setTimeout(() => {
      setSessionTooltip(null);
      tooltipCloseTimerRef.current = undefined;
    }, 100);
  };

  const showSessionTooltip = (target: HTMLElement) => {
    cancelTooltipClose();
    const rect = target.getBoundingClientRect();
    const maxWidth = Math.min(280, window.innerWidth - 24);
    const halfWidth = maxWidth / 2;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2, 12 + halfWidth),
      window.innerWidth - 12 - halfWidth,
    );
    const above = rect.bottom + 176 > window.innerHeight;
    setSessionTooltip({
      above,
      left,
      top: above ? rect.top - 8 : rect.bottom + 8,
    });
  };

  useEffect(() => () => cancelTooltipClose(), []);

  useEffect(() => {
    closeSessionTooltip();
  }, [thread?.id]);

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
        {thread && (
          <div className="vbg-custom-session-summary">
            <button
              aria-describedby={sessionTooltip ? "session-summary-tooltip" : undefined}
              aria-label={`Session details for ${thread.id}`}
              className="vbg-custom-session-summary__trigger"
              onBlur={closeSessionTooltip}
              onClick={(event) => showSessionTooltip(event.currentTarget)}
              onFocus={(event) => showSessionTooltip(event.currentTarget)}
              onKeyDown={(event) => {
                if (event.key === "Escape") closeSessionTooltip();
              }}
              onMouseEnter={(event) => showSessionTooltip(event.currentTarget)}
              onMouseLeave={(event) => {
                if (document.activeElement !== event.currentTarget) scheduleTooltipClose();
              }}
              type="button"
            >
              <span className="vbg-custom-session-summary__runs">
                {isLoading ? "…" : `${turns.length} ${turns.length === 1 ? "run" : "runs"}`}
              </span>
              {contextPercentage && (
                <span className={`vbg-custom-session-summary__context vbg-custom-session-summary__context--${contextCapacityLevel}`}>
                  {contextPercentage}
                </span>
              )}
              <code className="vbg-custom-compact-id" title={thread.id}>{thread.id}</code>
            </button>
            <CopyIconButton copiedLabel="Session ID copied" copyLabel="Copy session ID" value={thread.id} />
          </div>
        )}
        {!thread && <span className="vbg-custom-timeline__placeholder">Select a session</span>}
        {contextRatio !== undefined && (
          <span
            aria-hidden="true"
            className={`vbg-custom-context-capacity vbg-custom-context-capacity--${contextCapacityLevel}`}
          >
            <span
              style={{ "--vbg-context-capacity-scale": Math.min(contextRatio, 1) } as CSSProperties}
            />
          </span>
        )}
      </header>

      {thread && sessionTooltip && typeof document !== "undefined" && createPortal(
        <div
          className={`vbg-custom-session-tooltip${sessionTooltip.above ? " vbg-custom-session-tooltip--above" : ""}`}
          id="session-summary-tooltip"
          onMouseEnter={cancelTooltipClose}
          onMouseLeave={scheduleTooltipClose}
          role="tooltip"
          style={{ left: sessionTooltip.left, top: sessionTooltip.top }}
        >
          <dl aria-label="Session details">
            <div>
              <dt>Session</dt>
              <dd><code>{thread.id}</code></dd>
            </div>
            <div>
              <dt>Runs</dt>
              <dd>{isLoading ? "Loading…" : turns.length}</dd>
            </div>
            <div>
              <dt>Tokens</dt>
              <dd>{thread.tokenUsage ? formatExactNumber(thread.tokenUsage.total.totalTokens) : "—"}</dd>
            </div>
            <div>
              <dt>Context</dt>
              <dd>
                {contextPercentage && contextWindow !== undefined && contextTokens !== undefined
                  ? `${formatExactNumber(contextTokens)} / ${formatExactNumber(contextWindow)} · ${contextPercentage}`
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>,
        document.body,
      )}

      <table aria-busy={isLoading} className="vbg-custom-event-table" ref={tableRef}>
        <caption className="vbg-custom-sr-only">Session runs</caption>
        <tbody className="vbg-custom-event-table__body">
          {rows.map(({ turn, summary }) => (
            <tr
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
                  <StatusMark label={false} status={turn.status} />
                  <span className="vbg-custom-event-row__title"><InlineMarkdown>{summary}</InlineMarkdown></span>
                  {turn.startedAt && (
                    <time
                      className="vbg-custom-event-row__time"
                      dateTime={turn.startedAt}
                      title={formatDateTime(turn.startedAt)}
                    >
                      {formatClockTime(turn.startedAt)}
                    </time>
                  )}
                </button>
              </td>
            </tr>
          ))}
          {!rows.length && isLoading && (
            <tr>
              <td>
                <LoadingState
                  description="Fetching this session’s history."
                  label="Loading runs…"
                />
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
      {(isLoading || !thread) && (
        <footer className="vbg-custom-timeline__footer">
          {isLoading ? "Loading session history…" : "Select a session to view runs"}
        </footer>
      )}
    </main>
  );
}
