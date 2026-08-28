import { useMemo, useState, type KeyboardEvent } from "react";
import type { CompactTurn, Turn } from "../types";
import ExecutionReplay from "./ExecutionReplay";
import { HighlightedCode } from "./HighlightedCode";
import { Icon } from "./Icon";
import { SequenceDiagram } from "./SequenceDiagram";
import { StatusMark } from "./StatusMark";

const compactTokenFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const exactTokenFormatter = new Intl.NumberFormat("en-US");
const tokenDetailMetrics = [
  { key: "inputTokens", label: "Input", hideWhenZero: false },
  { key: "cachedInputTokens", label: "Cached", hideWhenZero: false },
  { key: "cacheWriteInputTokens", label: "Cache write", hideWhenZero: true },
  { key: "outputTokens", label: "Output", hideWhenZero: false },
  { key: "reasoningOutputTokens", label: "Reasoning", hideWhenZero: false },
] as const;

export function formatTokenCount(value: number): string {
  return compactTokenFormatter.format(value);
}

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

function formatShortId(value: string): string {
  return value.length > 9 ? `${value.slice(0, 8)}…` : value;
}

export function DetailPanel({
  error,
  isLoading = false,
  turn,
}: {
  error?: string;
  isLoading?: boolean;
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
    <aside className="vbg-custom-detail" aria-label="Run detail">
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
        <HighlightedCode
          aria-labelledby="turn-json-tab"
          className="vbg-custom-raw-json"
          code={raw}
          id="turn-json-panel"
          language="json"
          role="tabpanel"
          tabIndex={0}
        />
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
            <span aria-live="polite" className="vbg-custom-sr-only" role="status">Loading full run detail…</span>
          )}
          {!turn ? isLoading ? (
            <div aria-live="polite" className="vbg-custom-loading-state" role="status">
              <span aria-hidden="true" className="vbg-custom-spinner" />
              <strong>Loading session…</strong>
              <span>Runs and execution details will appear here.</span>
            </div>
          ) : (
            <div className="vbg-custom-detail-empty"><strong>No run selected</strong><span>Select a run to inspect all of its steps.</span></div>
          ) : (
            <>
              <div className="vbg-custom-turn-summary">
                <dl className="vbg-custom-turn-overview">
                  <div><dt>Status</dt><dd><StatusMark status={turn.status} /></dd></div>
                  <div><dt>Started</dt><dd>{formatDate(turn.startedAt)}</dd></div>
                  <div><dt>Duration</dt><dd title={turn.durationMs === undefined ? undefined : `${turn.durationMs}ms`}>{formatDuration(turn.durationMs)}</dd></div>
                  <div><dt>Steps</dt><dd>{"itemCount" in turn ? turn.itemCount : turn.items.length}</dd></div>
                  <div className="vbg-custom-turn-overview__identity">
                    <dt>Run</dt>
                    <dd aria-label={`Run ${turn.id}`} title={turn.id}><code>{formatShortId(turn.id)}</code></dd>
                  </div>
                </dl>
                {turn.tokenUsage && (
                  <section aria-labelledby="turn-token-usage-heading" className="vbg-custom-turn-token-usage">
                    <details>
                      <summary>
                        <span aria-hidden="true" className="vbg-custom-turn-token-usage__disclosure"><Icon name="chevron" /></span>
                        <span id="turn-token-usage-heading">Token usage</span>
                        <strong
                          aria-label={`${exactTokenFormatter.format(turn.tokenUsage.totalTokens)} total tokens`}
                          title={`${exactTokenFormatter.format(turn.tokenUsage.totalTokens)} tokens`}
                        >
                          {formatTokenCount(turn.tokenUsage.totalTokens)}
                        </strong>
                      </summary>
                      <dl>
                        {tokenDetailMetrics.map(({ key, label, hideWhenZero }) => {
                          const value = turn.tokenUsage?.[key] ?? 0;
                          if (hideWhenZero && value === 0) return null;
                          const exactValue = exactTokenFormatter.format(value);
                          return (
                            <div key={key}>
                              <dt>{label}</dt>
                              <dd aria-label={`${exactValue} ${label.toLowerCase()} tokens`} title={`${exactValue} tokens`}>
                                {formatTokenCount(value)}
                              </dd>
                            </div>
                          );
                        })}
                      </dl>
                    </details>
                  </section>
                )}
              </div>
              {tab === "trace" ? <ExecutionReplay items={turn.items} /> : <SequenceDiagram items={turn.items} />}
            </>
          )}
        </div>
      )}
    </aside>
  );
}
