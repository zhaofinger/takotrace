import { useEffect, useMemo, useRef, useState } from "react";
import type { CompactTraceEvent, CompactTurn, Thread, Turn } from "../types";
import { Icon } from "./Icon";
import { InlineMarkdown } from "./MarkdownContent";

type DisplayTraceEvent = CompactTraceEvent & { raw?: unknown };

const compactTokenFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const exactTokenFormatter = new Intl.NumberFormat("en-US");
const percentageFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

export function formatTokenCount(value: number): string {
  return compactTokenFormatter.format(value);
}

function normalizedType(item: CompactTraceEvent): string {
  return item.type.toLowerCase().replaceAll(/[^a-z]/g, "");
}

function rawItemText(item: DisplayTraceEvent): string | undefined {
  if (!item.raw || typeof item.raw !== "object") return undefined;
  const raw = item.raw as { text?: unknown; content?: unknown };
  if (typeof raw.text === "string") return raw.text;
  if (!Array.isArray(raw.content)) return undefined;
  const text = raw.content.find((entry): entry is { type: string; text: string } =>
    Boolean(entry && typeof entry === "object" && "type" in entry && "text" in entry
      && (entry as { type?: unknown }).type === "text" && typeof (entry as { text?: unknown }).text === "string"));
  return text?.text;
}

function requestText(item: DisplayTraceEvent): string {
  const text = rawItemText(item) ?? item.summary;
  const marker = "## My request:";
  const markerIndex = text.indexOf(marker);
  return (markerIndex >= 0 ? text.slice(markerIndex + marker.length) : text).trim();
}

export function turnSummary(turn: CompactTurn | Turn): string {
  if ("summary" in turn && turn.summary) return turn.summary;
  const userMessage = turn.items.find((item) => normalizedType(item) === "usermessage");
  if (userMessage) return requestText(userMessage);
  const finalResponse = [...turn.items].reverse().find((item) => normalizedType(item) === "agentmessage");
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
  const [copied, setCopied] = useState(false);
  const copyResetTimer = useRef<number | undefined>(undefined);
  const tableRef = useRef<HTMLTableElement>(null);
  const selectedRowRef = useRef<HTMLTableRowElement>(null);
  const rows = useMemo(
    () => turns.map((turn) => ({ turn, summary: turnSummary(turn) })),
    [turns],
  );
  const contextWindow = thread?.tokenUsage?.modelContextWindow;
  const contextTokens = thread?.tokenUsage?.last.totalTokens;
  const contextPercentage = contextWindow && contextWindow > 0 && contextTokens !== undefined
    ? percentageFormatter.format(contextTokens / contextWindow)
    : undefined;

  useEffect(() => {
    setCopied(false);
    window.clearTimeout(copyResetTimer.current);
  }, [thread?.id]);

  useEffect(() => () => window.clearTimeout(copyResetTimer.current), []);

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

  const copyThreadId = async () => {
    if (!thread) return;
    try {
      await navigator.clipboard.writeText(thread.id);
      setCopied(true);
      window.clearTimeout(copyResetTimer.current);
      copyResetTimer.current = window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main aria-label="Runs" className="vbg-custom-timeline" id="main">
      <header className="vbg-custom-timeline__header">
        <div className="vbg-custom-timeline__title">
          {thread ? (
            <div className="vbg-custom-thread-identity">
              <span>Session</span>
              <code title={thread.id}>{thread.id}</code>
              <button
                aria-label={copied ? "Session ID copied" : "Copy session ID"}
                aria-live="polite"
                className={`vbg-custom-id-copy${copied ? " vbg-custom-is-copied" : ""}`}
                onClick={() => void copyThreadId()}
                title={copied ? "Copied" : "Copy session ID"}
                type="button"
              >
                <Icon name={copied ? "check" : "copy"} />
              </button>
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
                    aria-label={`${exactTokenFormatter.format(thread.tokenUsage.total.totalTokens)} total tokens`}
                    title={`${exactTokenFormatter.format(thread.tokenUsage.total.totalTokens)} tokens`}
                  >
                    {formatTokenCount(thread.tokenUsage.total.totalTokens)}
                  </dd>
                </div>
                {contextPercentage && contextWindow !== undefined && contextTokens !== undefined && (
                  <div>
                    <dt>Context</dt>
                    <dd
                      aria-label={`${exactTokenFormatter.format(contextTokens)} of ${exactTokenFormatter.format(contextWindow)} context tokens, ${contextPercentage}`}
                      title={`${exactTokenFormatter.format(contextTokens)} / ${exactTokenFormatter.format(contextWindow)} tokens (${contextPercentage})`}
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
