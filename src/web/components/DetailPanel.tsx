import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  formatClockTime,
  formatDateTime,
  formatDuration,
  formatExactNumber,
  formatShortId,
  formatTokenCount,
} from "../formatters";
import { handleRovingTabKey } from "../roving-tabs";
import type { CompactTurn, ThreadDetail, TokenUsageBreakdown, Turn } from "../types";
import { CopyIconButton } from "./CopyIconButton";
import { EventDetails, type SubagentDetailView } from "./EventDetails";
import ExecutionReplay from "./ExecutionReplay";
import { HighlightedCode } from "./HighlightedCode";
import { Icon } from "./Icon";
import { StatusMark } from "./StatusMark";
import { SubagentEventList } from "./SubagentThreadDetails";

const SequenceDiagram = lazy(async () => {
  const module = await import("./SequenceDiagram");
  return { default: module.SequenceDiagram };
});

const tokenDetailMetrics = [
  { key: "inputTokens", label: "Input", hideWhenZero: false },
  { key: "outputTokens", label: "Output", hideWhenZero: false },
  { key: "cachedInputTokens", label: "Cached", hideWhenZero: false },
  { key: "reasoningOutputTokens", label: "Reasoning", hideWhenZero: false },
  { key: "cacheWriteInputTokens", label: "Cache write", hideWhenZero: true },
] as const;

interface TokenPopoverState {
  above: boolean;
  left: number;
  top: number;
}

type DetailTab = "trace" | "sequence" | "json" | "events";

interface SubagentFrame {
  returnTab: DetailTab;
  sourceSelectionId: string;
  thread: ThreadDetail;
  turnId: string;
}

export function subagentNavigation(sourceView: SubagentDetailView, sourceEventId: string) {
  return {
    sourceSelectionId: sourceView === "sequence" ? `seq-${sourceEventId}` : sourceEventId,
    tab: sourceView,
  } as const;
}

export function tokenBreakdownMetrics(usage: TokenUsageBreakdown) {
  return tokenDetailMetrics.flatMap(({ key, label, hideWhenZero }) => {
    const value = usage[key];
    return hideWhenZero && value === 0 ? [] : [{ key, label, value }];
  });
}

function TurnTokenUsage({ usage }: { usage: TokenUsageBreakdown }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popover, setPopover] = useState<TokenPopoverState | null>(null);

  const closePopover = () => setPopover(null);
  const openPopover = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const maxWidth = Math.min(320, window.innerWidth - 24);
    const halfWidth = maxWidth / 2;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2, 12 + halfWidth),
      window.innerWidth - 12 - halfWidth,
    );
    const above = rect.bottom + 164 > window.innerHeight;
    setPopover({
      above,
      left,
      top: above ? rect.top - 8 : rect.bottom + 8,
    });
  };

  useEffect(() => {
    if (!popover) return;
    const close = (event: Event) => {
      if (event.type === "pointerdown" && triggerRef.current?.contains(event.target as Node)) return;
      closePopover();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [popover]);

  const metrics = tokenBreakdownMetrics(usage);
  const exactTotal = formatExactNumber(usage.totalTokens);
  return (
    <section aria-label="Token usage" className="vbg-custom-turn-token-usage">
      <button
        aria-controls="turn-token-usage-popover"
        aria-expanded={Boolean(popover)}
        aria-label={`Token usage, ${exactTotal} total tokens`}
        className="vbg-custom-turn-token-usage__trigger"
        onClick={() => popover ? closePopover() : openPopover()}
        onKeyDown={(event) => {
          if (event.key === "Escape") closePopover();
        }}
        ref={triggerRef}
        title={`${exactTotal} total tokens`}
        type="button"
      >
        <span aria-hidden="true" className="vbg-custom-turn-token-usage__disclosure"><Icon name="chevron" /></span>
        <strong>{formatTokenCount(usage.totalTokens)}</strong>
        <span className="vbg-custom-turn-token-usage__label">tokens</span>
      </button>
      {popover && typeof document !== "undefined" && createPortal(
        <div
          aria-label="Token breakdown"
          className={`vbg-custom-turn-token-popover${popover.above ? " vbg-custom-turn-token-popover--above" : ""}`}
          id="turn-token-usage-popover"
          role="region"
          style={{ left: popover.left, top: popover.top }}
        >
          <dl>
            {metrics.map(({ key, label, value }) => {
              const exactValue = formatExactNumber(value);
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
        </div>,
        document.body,
      )}
    </section>
  );
}

function defaultSubagentTurn(thread: ThreadDetail): Turn | undefined {
  return thread.turns.at(-1);
}

function SubagentScopeBar({
  onBack,
  onSelectTurn,
  thread,
  turnId,
}: {
  onBack: () => void;
  onSelectTurn: (turnId: string) => void;
  thread: ThreadDetail;
  turnId: string;
}) {
  const name = thread.agentNickname ?? thread.agentPath ?? thread.title ?? "Subagent";
  return (
    <div className="vbg-custom-subagent-scopebar">
      <button aria-label="Back to parent view" className="vbg-custom-subagent-scopebar__back" onClick={onBack} type="button">
        <Icon name="chevron" />
        <span>Parent</span>
      </button>
      <div className="vbg-custom-subagent-scopebar__identity">
        <span aria-hidden="true"><Icon name="subagent" /></span>
        <strong>{name}</strong>
        <code title={thread.id}>{formatShortId(thread.id)}</code>
      </div>
      <StatusMark status={thread.status} />
      {thread.turns.length > 1 && (
        <label className="vbg-custom-subagent-scopebar__run">
          <span>Run</span>
          <select aria-label="Subagent run" onChange={(event) => onSelectTurn(event.currentTarget.value)} value={turnId}>
            {thread.turns.map((turn, index) => (
              <option key={turn.id} value={turn.id}>
                {index + 1}{turn.startedAt ? ` · ${formatDateTime(turn.startedAt)}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

export { formatDuration, formatTokenCount } from "../formatters";

export function DetailPanel({
  error,
  isLoading = false,
  turn,
}: {
  error?: string;
  isLoading?: boolean;
  turn?: CompactTurn | Turn;
}) {
  const [tab, setTab] = useState<DetailTab>("trace");
  const [subagentStack, setSubagentStack] = useState<SubagentFrame[]>([]);
  const [restoredSelectionId, setRestoredSelectionId] = useState<string>();
  const subagentFrame = subagentStack.at(-1);
  const scopedTurn = subagentFrame?.thread.turns.find((item) => item.id === subagentFrame.turnId)
    ?? (subagentFrame ? defaultSubagentTurn(subagentFrame.thread) : undefined);
  const displayTurn = subagentFrame ? scopedTurn : turn;
  const thirdTab = subagentFrame ? "events" : "json";
  const raw = useMemo(() => displayTurn ? JSON.stringify(displayTurn, null, 2) : "", [displayTurn]);
  const panelId = tab === "trace" ? "turn-trace-panel"
    : tab === "sequence" ? "turn-sequence-panel"
      : tab === "events" ? "turn-events-panel" : "turn-json-panel";
  const panelLabelId = tab === "trace" ? "turn-trace-tab"
    : tab === "sequence" ? "turn-sequence-tab"
      : tab === "events" ? "turn-events-tab" : "turn-json-tab";

  useEffect(() => {
    setSubagentStack([]);
    setRestoredSelectionId(undefined);
    setTab((current) => current === "events" ? "trace" : current);
  }, [turn?.id]);

  useEffect(() => {
    if (restoredSelectionId) setRestoredSelectionId(undefined);
  }, [restoredSelectionId]);

  const openSubagent = (
    thread: ThreadDetail,
    sourceEventId: string,
    sourceView: SubagentDetailView,
  ) => {
    const defaultTurn = defaultSubagentTurn(thread);
    if (!defaultTurn) return;
    const navigation = subagentNavigation(sourceView, sourceEventId);
    setSubagentStack((current) => [...current, {
      returnTab: navigation.tab,
      sourceSelectionId: navigation.sourceSelectionId,
      thread,
      turnId: defaultTurn.id,
    }]);
    setRestoredSelectionId(undefined);
    setTab(navigation.tab);
  };

  const closeSubagent = () => {
    if (!subagentFrame) return;
    setSubagentStack((current) => current.slice(0, -1));
    setRestoredSelectionId(subagentFrame.sourceSelectionId);
    setTab(subagentFrame.returnTab);
  };

  const selectSubagentTurn = (turnId: string) => {
    setRestoredSelectionId(undefined);
    setSubagentStack((current) => current.map((frame, index) => index === current.length - 1
      ? { ...frame, turnId }
      : frame));
  };
  return (
    <aside className="vbg-custom-detail" aria-label="Run detail">
      <div className="vbg-custom-detail__tabs" role="tablist">
        <button
          aria-controls="turn-trace-panel"
          aria-selected={tab === "trace"}
          className={tab === "trace" ? "vbg-custom-is-active" : ""}
          id="turn-trace-tab"
          onKeyDown={handleRovingTabKey}
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
          onKeyDown={handleRovingTabKey}
          onClick={() => setTab("sequence")}
          role="tab"
          tabIndex={tab === "sequence" ? 0 : -1}
          type="button"
        >
          Sequence
        </button>
        <button
          aria-controls={`turn-${thirdTab}-panel`}
          aria-selected={tab === thirdTab}
          className={tab === thirdTab ? "vbg-custom-is-active" : ""}
          id={`turn-${thirdTab}-tab`}
          onKeyDown={handleRovingTabKey}
          onClick={() => setTab(thirdTab)}
          role="tab"
          tabIndex={tab === thirdTab ? 0 : -1}
          type="button"
        >
          {thirdTab === "events" ? "Events" : "Raw JSON"}
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
        ) : !displayTurn ? (
          <>
            {subagentFrame && (
              <SubagentScopeBar
                onBack={closeSubagent}
                onSelectTurn={selectSubagentTurn}
                thread={subagentFrame.thread}
                turnId={subagentFrame.turnId}
              />
            )}
            <div className="vbg-custom-detail-empty"><strong>No Subagent runs</strong><span>This Subagent has no recorded execution events.</span></div>
          </>
        ) : (
          <>
            {subagentFrame && (
              <SubagentScopeBar
                onBack={closeSubagent}
                onSelectTurn={selectSubagentTurn}
                thread={subagentFrame.thread}
                turnId={displayTurn.id}
              />
            )}
            {tab === "json" ? (
              <HighlightedCode
                className="vbg-custom-raw-json"
                code={raw}
                language="json"
              />
            ) : (
              <>
              <div className="vbg-custom-turn-summary">
                <dl className="vbg-custom-turn-overview">
                  <div className="vbg-custom-turn-overview__status"><dt>Status</dt><dd><StatusMark status={displayTurn.status} /></dd></div>
                  {displayTurn.model && (
                    <div className="vbg-custom-turn-overview__model"><dt>Model</dt><dd><code className="vbg-custom-model-name" title={displayTurn.model}>{displayTurn.model}</code></dd></div>
                  )}
                  <div className="vbg-custom-turn-overview__started">
                    <dt>Started</dt>
                    <dd><time dateTime={displayTurn.startedAt} title={formatDateTime(displayTurn.startedAt)}>{displayTurn.startedAt ? formatClockTime(displayTurn.startedAt) : "—"}</time></dd>
                  </div>
                  <div className="vbg-custom-turn-overview__duration"><dt>Duration</dt><dd title={displayTurn.durationMs === undefined ? undefined : `${displayTurn.durationMs}ms`}>{formatDuration(displayTurn.durationMs)}</dd></div>
                  <div className="vbg-custom-turn-overview__steps"><dt>Steps</dt><dd>{"itemCount" in displayTurn ? displayTurn.itemCount : displayTurn.items.length}</dd></div>
                </dl>
                <div className="vbg-custom-turn-summary__utilities">
                  <div className="vbg-custom-run-identity">
                    <code aria-label={`Run ${displayTurn.id}`} className="vbg-custom-compact-id" title={displayTurn.id}>{formatShortId(displayTurn.id)}</code>
                    <CopyIconButton copiedLabel="Run ID copied" copyLabel="Copy run ID" value={displayTurn.id} />
                  </div>
                  {displayTurn.tokenUsage && (
                    <TurnTokenUsage usage={displayTurn.tokenUsage} />
                  )}
                </div>
              </div>
              {tab === "trace" ? (
                <ExecutionReplay
                  initialSelectedId={restoredSelectionId}
                  items={displayTurn.items}
                  key={`${subagentFrame?.thread.id ?? "parent"}-${displayTurn.id}`}
                  onOpenSubagent={openSubagent}
                />
              ) : tab === "sequence" ? (
                <Suspense fallback={<div aria-live="polite" className="vbg-custom-loading-state" role="status">Loading sequence…</div>}>
                  <SequenceDiagram
                    initialSelectedStepId={restoredSelectionId}
                    items={displayTurn.items}
                    key={`${subagentFrame?.thread.id ?? "parent"}-${displayTurn.id}`}
                    onOpenSubagent={openSubagent}
                    scope={subagentFrame ? "subagent" : "main"}
                    threadContext={subagentFrame?.thread}
                  />
                </Suspense>
              ) : (
                <div className="vbg-custom-subagent-events-view">
                  {scopedTurn && (
                    <SubagentEventList
                      items={scopedTurn.items}
                      renderEventDetails={(event) => (
                        <EventDetails event={event} fallback={event.summary} onOpenSubagent={openSubagent} />
                      )}
                    />
                  )}
                </div>
              )}
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
