import { useEffect, useMemo, useRef, useState } from "react";
import type { CompactTraceEvent, CompactTurn, Thread, Turn } from "../types";
import { Icon } from "./Icon";
import { InlineMarkdown } from "./MarkdownContent";
import { StatusMark } from "./StatusMark";

type DisplayTraceEvent = CompactTraceEvent & { raw?: unknown };

function formatTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
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
  return finalResponse?.summary || turn.items.find((item) => item.summary)?.summary || `Turn ${turn.id}`;
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
  const rows = useMemo(
    () => turns.map((turn) => ({ turn, summary: turnSummary(turn) })),
    [turns],
  );

  useEffect(() => {
    setCopied(false);
    window.clearTimeout(copyResetTimer.current);
  }, [thread?.id]);

  useEffect(() => () => window.clearTimeout(copyResetTimer.current), []);

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
    <main aria-label="Turns" className="vbg-custom-timeline" id="main">
      <div className="vbg-custom-timeline__title">
        {thread ? (
          <button
            aria-label={copied ? "Thread ID copied" : "Copy thread ID"}
            aria-live="polite"
            className={`vbg-custom-thread-code${copied ? " vbg-custom-is-copied" : ""}`}
            onClick={() => void copyThreadId()}
            title={thread.id}
            type="button"
          >
            <span>Thread</span>
            <code>{thread.id}</code>
            <Icon name={copied ? "check" : "copy"} />
          </button>
        ) : <span className="vbg-custom-timeline__placeholder">Select a thread</span>}
        {thread && (
          <span className="vbg-custom-count vbg-custom-count--muted">
            {isLoading ? "Loading…" : `${turns.length} turns`}
          </span>
        )}
      </div>

      <table aria-busy={isLoading} className="vbg-custom-event-table">
        <caption className="vbg-custom-sr-only">Thread turns</caption>
        <tbody className="vbg-custom-event-table__body">
          {rows.map(({ turn, summary }) => (
            <tr
              aria-selected={turn.id === selectedId}
              className={`vbg-custom-event-row${turn.id === selectedId ? " vbg-custom-is-selected" : ""}`}
              key={turn.id}
              onClick={() => onSelect(turn)}
            >
              <td className="vbg-custom-event-row__summary" title={summary}>
                <button
                  aria-current={turn.id === selectedId ? "true" : undefined}
                  className="vbg-custom-event-row__select"
                  type="button"
                >
                  <InlineMarkdown>{summary}</InlineMarkdown>
                </button>
              </td>
              <td className="vbg-mono vbg-custom-event-row__time" title={turn.startedAt ?? turn.completedAt}>
                {formatTime(turn.startedAt ?? turn.completedAt)}
              </td>
              <td><StatusMark label={false} status={turn.status} /></td>
            </tr>
          ))}
          {!rows.length && isLoading && (
            <tr>
              <td colSpan={3}>
                <div aria-live="polite" className="vbg-custom-loading-state" role="status">
                  <span aria-hidden="true" className="vbg-custom-spinner" />
                  <strong>Loading turns…</strong>
                  <span>Fetching this thread’s history.</span>
                </div>
              </td>
            </tr>
          )}
          {!rows.length && !isLoading && (
            <tr>
              <td colSpan={3}>
                <div className="vbg-custom-timeline-empty">
                  <Icon name="activity" />
                  <strong>{thread ? "No turns in this thread" : "No thread selected"}</strong>
                  <span>{thread ? "Synced turns will appear here." : "Choose a thread from the list."}</span>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <footer className="vbg-custom-timeline__footer">
        {isLoading
          ? "Loading thread history…"
          : `Showing ${turns.length} turn${turns.length === 1 ? "" : "s"} · ${thread?.historySource === "rollout-file" ? "Rollout fallback" : "App Server"}`}
      </footer>
    </main>
  );
}
