import { useMemo, useState, type KeyboardEvent } from "react";
import type { CompactTurn, Turn } from "../types";
import ExecutionReplay from "./ExecutionReplay";
import { SequenceDiagram } from "./SequenceDiagram";
import { StatusMark } from "./StatusMark";

function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function formatDuration(value?: number): string {
  if (value === undefined) return "—";
  if (value < 1_000) return `${value}ms`;
  const totalSeconds = Math.round(value / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours && `${hours}h`, (hours || minutes) && `${minutes}m`, `${seconds}s`].filter(Boolean).join(" ");
}

export function DetailPanel({
  error,
  isLoading = false,
  threadId,
  turn,
}: {
  error?: string;
  isLoading?: boolean;
  threadId?: string;
  turn?: CompactTurn | Turn;
}) {
  const [tab, setTab] = useState<"trace" | "sequence" | "json">("trace");
  const raw = useMemo(() => turn ? JSON.stringify(turn, null, 2) : "", [turn]);
  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
    const currentIndex = tabs.indexOf(event.currentTarget);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  };

  return (
    <aside className="vbg-custom-detail" aria-label="Turn detail">
      <div className="vbg-custom-detail__tabs" role="tablist">
        <button
          aria-controls="turn-trace-panel"
          aria-selected={tab === "trace"}
          className={tab === "trace" ? "vbg-custom-is-active" : ""}
          id="turn-trace-tab"
          onKeyDown={handleTabKey}
          onClick={() => setTab("trace")}
          role="tab"
          tabIndex={tab === "trace" ? 0 : -1}
          type="button"
        >
          Trace
        </button>
        <button
          aria-controls="turn-sequence-panel"
          aria-selected={tab === "sequence"}
          className={tab === "sequence" ? "vbg-custom-is-active" : ""}
          id="turn-sequence-tab"
          onKeyDown={handleTabKey}
          onClick={() => setTab("sequence")}
          role="tab"
          tabIndex={tab === "sequence" ? 0 : -1}
          type="button"
        >
          Sequence
        </button>
        <button
          aria-controls="turn-json-panel"
          aria-selected={tab === "json"}
          className={tab === "json" ? "vbg-custom-is-active" : ""}
          id="turn-json-tab"
          onKeyDown={handleTabKey}
          onClick={() => setTab("json")}
          role="tab"
          tabIndex={tab === "json" ? 0 : -1}
          type="button"
        >
          Raw JSON
        </button>
      </div>
      {tab === "json" ? (
        <pre
          aria-labelledby="turn-json-tab"
          className="vbg-custom-raw-json"
          id="turn-json-panel"
          role="tabpanel"
          tabIndex={0}
        >
          {raw}
        </pre>
      ) : (
        <div
          aria-busy={isLoading}
          aria-labelledby={tab === "trace" ? "turn-trace-tab" : "turn-sequence-tab"}
          className="vbg-custom-detail__content"
          id={tab === "trace" ? "turn-trace-panel" : "turn-sequence-panel"}
          role="tabpanel"
          tabIndex={0}
        >
          {error && (
            <p aria-live="polite" className="vbg-custom-detail-state vbg-custom-detail-state--error">{error}</p>
          )}
          {isLoading && turn && (
            <span aria-live="polite" className="vbg-custom-sr-only" role="status">Loading full turn detail…</span>
          )}
          {!turn ? isLoading ? (
            <div aria-live="polite" className="vbg-custom-loading-state" role="status">
              <span aria-hidden="true" className="vbg-custom-spinner" />
              <strong>Loading thread…</strong>
              <span>Turns and conversation details will appear here.</span>
            </div>
          ) : (
            <div className="vbg-custom-detail-empty"><strong>No turn selected</strong><span>Select a turn to inspect all of its items.</span></div>
          ) : (
            <>
              <dl className="vbg-custom-turn-meta-line">
                <div>
                  <dt>Ended</dt>
                  <dd title={formatDate(turn.completedAt)}>{formatDate(turn.completedAt)}</dd>
                </div>
                <div>
                  <dt>Thread</dt>
                  <dd title={threadId}><code>{threadId || "—"}</code></dd>
                </div>
                <div>
                  <dt>Turn</dt>
                  <dd title={turn.id}><code>{turn.id}</code></dd>
                </div>
              </dl>
              <dl className="vbg-custom-turn-overview">
                <div><dt>Status</dt><dd><StatusMark status={turn.status} /></dd></div>
                <div><dt>Started</dt><dd>{formatDate(turn.startedAt)}</dd></div>
                <div><dt>Duration</dt><dd title={turn.durationMs === undefined ? undefined : `${turn.durationMs}ms`}>{formatDuration(turn.durationMs)}</dd></div>
                <div><dt>Items</dt><dd>{"itemCount" in turn ? turn.itemCount : turn.items.length}</dd></div>
              </dl>
              {tab === "trace" ? <ExecutionReplay items={turn.items} /> : <SequenceDiagram items={turn.items} />}
            </>
          )}
        </div>
      )}
    </aside>
  );
}
