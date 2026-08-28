import { lazy, Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CompactTurn, Turn } from "../types";
import ExecutionReplay from "./ExecutionReplay";
import { HighlightedCode } from "./HighlightedCode";
import { Icon } from "./Icon";
import { StatusMark } from "./StatusMark";

const SequenceDiagram = lazy(async () => {
  const module = await import("./SequenceDiagram");
  return { default: module.SequenceDiagram };
});

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
  const [copiedRunId, setCopiedRunId] = useState<string>();
  const copyResetTimer = useRef<number | undefined>(undefined);
  const raw = useMemo(() => turn ? JSON.stringify(turn, null, 2) : "", [turn]);
  const panelId = tab === "trace" ? "turn-trace-panel" : tab === "sequence" ? "turn-sequence-panel" : "turn-json-panel";
  const panelLabelId = tab === "trace" ? "turn-trace-tab" : tab === "sequence" ? "turn-sequence-tab" : "turn-json-tab";
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

  useEffect(() => {
    setCopiedRunId(undefined);
    window.clearTimeout(copyResetTimer.current);
  }, [turn?.id]);

  useEffect(() => () => window.clearTimeout(copyResetTimer.current), []);

  const copyRunId = async () => {
    if (!turn) return;
    try {
      await navigator.clipboard.writeText(turn.id);
      setCopiedRunId(turn.id);
      window.clearTimeout(copyResetTimer.current);
      copyResetTimer.current = window.setTimeout(() => setCopiedRunId(undefined), 1_500);
    } catch {
      setCopiedRunId(undefined);
    }
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
      <div
        aria-busy={isLoading}
        aria-labelledby={panelLabelId}
        className={`vbg-custom-detail__content${tab === "json" ? " vbg-custom-detail__content--raw" : ""}`}
        id={panelId}
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
          ) : tab === "json" ? (
            <HighlightedCode
              className="vbg-custom-raw-json"
              code={raw}
              language="json"
            />
          ) : (
            <>
              <div className="vbg-custom-turn-summary">
                <dl className="vbg-custom-turn-overview">
                  <div><dt>Status</dt><dd><StatusMark status={turn.status} /></dd></div>
                  <div><dt>Started</dt><dd>{formatDate(turn.startedAt)}</dd></div>
                  <div><dt>Duration</dt><dd title={turn.durationMs === undefined ? undefined : `${turn.durationMs}ms`}>{formatDuration(turn.durationMs)}</dd></div>
                  <div><dt>Steps</dt><dd>{"itemCount" in turn ? turn.itemCount : turn.items.length}</dd></div>
                </dl>
                <div className="vbg-custom-turn-summary__utilities">
                  <dl className="vbg-custom-turn-overview vbg-custom-turn-overview--utilities">
                    <div className="vbg-custom-turn-overview__identity">
                      <dt>Run</dt>
                      <dd>
                        <code aria-label={`Run ${turn.id}`} title={turn.id}>{formatShortId(turn.id)}</code>
                        <button
                          aria-label={copiedRunId === turn.id ? "Run ID copied" : "Copy run ID"}
                          aria-live="polite"
                          className={`vbg-custom-id-copy${copiedRunId === turn.id ? " vbg-custom-is-copied" : ""}`}
                          onClick={() => void copyRunId()}
                          title={copiedRunId === turn.id ? "Copied" : "Copy run ID"}
                          type="button"
                        >
                          <Icon name={copiedRunId === turn.id ? "check" : "copy"} />
                        </button>
                      </dd>
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
              </div>
              {tab === "trace" ? <ExecutionReplay items={turn.items} /> : (
                <Suspense fallback={<div aria-live="polite" className="vbg-custom-loading-state" role="status">Loading sequence…</div>}>
                  <SequenceDiagram items={turn.items} />
                </Suspense>
              )}
            </>
          )}
      </div>
    </aside>
  );
}
