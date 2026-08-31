import { useEffect, useMemo, useRef, useState } from "react";
import { formatClockTime as formatTime, formatCompactDuration as formatDuration } from "../formatters";
import { EventDetails, type OpenSubagentHandler } from "./EventDetails";
import { ExecutionOverview } from "./ExecutionOverview";
import {
  ExecutionInspector,
  restoreFocusAfterInspectorClose,
  type ExecutionInspectorItem,
} from "./ExecutionInspector";
import { flowKindIconName } from "./InteractionFlow";
import type { FlowEvent } from "./InteractionFlow";
import { Icon } from "./Icon";
import { StatusMark } from "./StatusMark";
import {
  replayActionCounts,
  replayExecutionTiming,
  replayGroupStatus,
  traceReplayModel,
} from "./trace-replay-model";
import type { ReplayAction } from "./trace-replay-model";
import { compactShellCommand } from "./sequence-diagram-model";
import { parallelEvidenceLabel } from "./parallel-execution-model";

function replayInspectorItem(action: ReplayAction): ExecutionInspectorItem {
  const isShellCommand = action.kind === "tool" && action.title.startsWith("Shell ·");
  const cwd = action.meta?.split(" · ", 1)[0];
  return {
    seq: action.event.seq,
    kind: action.kind,
    title: isShellCommand ? compactShellCommand(action.detail, cwd) : action.title,
    fullTitle: isShellCommand ? action.detail : action.title,
    detail: action.detail,
    status: action.status,
    durationMs: action.durationMs,
    at: action.event.at,
    from: "agent",
    to: action.kind,
    type: "call",
    event: action.event,
  };
}

function ExecutionGroup({
  actions,
  selectedId,
  onSelectAction,
}: {
  actions: ReplayAction[];
  selectedId?: string;
  onSelectAction: (id: string) => void;
}) {
  const status = replayGroupStatus(actions);
  const timing = replayExecutionTiming(actions);
  const parallelGroups = [...new Map(actions.flatMap((item) => item.parallel ? [[item.parallel.id, item.parallel] as const] : [])).values()];
  const strongestParallel = parallelGroups.sort((left, right) => right.maxConcurrency - left.maxConcurrency)[0];
  const parallelBounds = new Map<string, { firstId: string; lastId: string }>();
  for (const item of actions) {
    if (!item.parallel) continue;
    const bounds = parallelBounds.get(item.parallel.id);
    if (bounds) bounds.lastId = item.id;
    else parallelBounds.set(item.parallel.id, { firstId: item.id, lastId: item.id });
  }
  const failedCount = actions.filter((item) => item.status === "failed" || item.status === "error").length;
  const isToolCallGroup = actions.every((item) => item.kind !== "reasoning" && item.kind !== "system");
  const shouldOpenInitially = status === "failed"
    || status === "running";
  const [isOpen, setIsOpen] = useState(shouldOpenInitially);

  useEffect(() => {
    if (actions.some((item) => item.id === selectedId)) setIsOpen(true);
  }, [actions, selectedId]);

  if (!actions.length) return null;

  return (
    <details
      className="vbg-custom-replay-execution"
      open={isOpen || undefined}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary>
        <span aria-hidden="true" className="vbg-custom-replay-disclosure"><Icon name="chevron" /></span>
        <strong>{isToolCallGroup ? `${actions.length} tool call${actions.length === 1 ? "" : "s"}` : "Execution"}</strong>
        {!isToolCallGroup && <span>{actions.length} actions</span>}
        <span className="vbg-custom-replay-counts">
          {replayActionCounts(actions).map(([label, count]) => <i key={label}>{label}{count > 1 ? ` ×${count}` : ""}</i>)}
          {strongestParallel ? (
            <i className="vbg-custom-replay-counts__parallel">
              {parallelEvidenceLabel(strongestParallel)}
            </i>
          ) : timing.maxConcurrency > 1 && (
            <i className="vbg-custom-replay-counts__parallel">
              {timing.mode === "observed" ? "Parallel" : "Possible overlap"} ×{timing.maxConcurrency}
            </i>
          )}
          {!strongestParallel && (timing.mode === "order" ? <i>Order only</i> : timing.mode === "inferred" ? <i title="Estimated from completion time and duration">Estimated</i> : null)}
          {timing.wallTimeMs !== undefined && timing.wallTimeMs > 0 && <i>{formatDuration(timing.wallTimeMs)}</i>}
        </span>
        {failedCount > 0 && <span className="vbg-custom-replay-failure">{failedCount} failed</span>}
        <StatusMark label={false} status={status} />
      </summary>
      <ol className="vbg-custom-replay-actions">
        {actions.map((item) => {
          const bounds = item.parallel ? parallelBounds.get(item.parallel.id) : undefined;
          const parallelStart = bounds?.firstId === item.id;
          const parallelEnd = bounds?.lastId === item.id;
          const renderedDurationMs = item.startedAtMs !== undefined && item.completedAtMs !== undefined
            ? Math.max(0, item.completedAtMs - item.startedAtMs)
            : item.durationMs;
          const durationSource = item.timing === "observed" ? "Observed"
            : item.timing === "inferred" ? "Estimated"
              : "Reported";
          return (
            <li
              className={`vbg-custom-replay-action vbg-custom-replay-action--${item.kind}${item.parallel ? " vbg-custom-replay-action--parallel" : ""}`}
              data-parallel-end={item.parallel && parallelEnd || undefined}
              data-parallel-start={item.parallel && parallelStart || undefined}
              data-selected={selectedId === item.id || undefined}
              id={item.id}
              key={item.id}
            >
              {item.parallel && parallelStart && (
                <div className="vbg-custom-replay-parallel-label">
                  <span>{parallelEvidenceLabel(item.parallel)}</span>
                  <small>{item.parallel.evidence === "lifecycle" ? "lifecycle overlap" : item.parallel.evidence.replace("-", " ")}</small>
                </div>
              )}
              <button
                type="button"
                className="vbg-custom-replay-action__summary"
                id={`replay-action-trigger-${item.id}`}
                aria-controls={selectedId === item.id ? "execution-inspector" : undefined}
                aria-expanded={selectedId === item.id}
                onClick={() => onSelectAction(item.id)}
              >
                  <span aria-hidden="true" className="vbg-custom-replay-action__icon"><Icon name={flowKindIconName(item.kind)} /></span>
                  <span className="vbg-custom-replay-action__label">{item.label}</span>
                  <strong>{item.title}</strong>
                  {item.meta && <code>{item.meta}</code>}
                  {renderedDurationMs !== undefined && renderedDurationMs > 0 && (
                    <time
                      aria-label={`${durationSource} duration ${formatDuration(renderedDurationMs)}`}
                      className="vbg-custom-replay-action__duration"
                    >{formatDuration(renderedDurationMs)}</time>
                  )}
                  <StatusMark label={false} status={item.statusLabel ?? item.status} />
              </button>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

export default function ExecutionReplay({
  initialSelectedId,
  items,
  onOpenSubagent,
}: {
  initialSelectedId?: string;
  items: FlowEvent[];
  onOpenSubagent?: OpenSubagentHandler;
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>(initialSelectedId);
  const streamRef = useRef<HTMLOListElement>(null);
  const model = useMemo(() => traceReplayModel(items), [items]);
  const selectedAction = useMemo(() => model.blocks
    .flatMap((block) => block.type === "execution" ? block.actions : [])
    .find((action) => action.id === selectedId), [model.blocks, selectedId]);

  useEffect(() => {
    if (selectedId && !model.blocks.some((block) => block.type === "execution"
      ? block.actions.some((item) => item.id === selectedId)
      : block.id === selectedId)) {
      setSelectedId(undefined);
    }
  }, [model.blocks, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    let revealFrame = 0;
    const layoutFrame = window.requestAnimationFrame(() => {
      revealFrame = window.requestAnimationFrame(() => {
        const stream = streamRef.current;
        const target = document.getElementById(selectedId);
        if (!stream || !target) return;
        const streamRect = stream.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const edgePadding = 12;
        if (targetRect.bottom > streamRect.bottom - edgePadding) {
          stream.scrollTop += targetRect.bottom - streamRect.bottom + edgePadding;
        } else if (targetRect.top < streamRect.top + edgePadding) {
          stream.scrollTop -= streamRect.top - targetRect.top + edgePadding;
        }
      });
    });
    return () => {
      window.cancelAnimationFrame(layoutFrame);
      window.cancelAnimationFrame(revealFrame);
    };
  }, [selectedId]);

  const closeInspector = () => {
    const actionId = selectedAction?.id;
    setSelectedId(undefined);
    if (actionId) {
      restoreFocusAfterInspectorClose(`replay-action-trigger-${actionId}`);
    }
  };

  const selectAction = (id: string) => {
    if (selectedId === id) {
      closeInspector();
      return;
    }
    setSelectedId(id);
  };

  const selectOverviewItem = (id: string) => {
    if (selectedId === id) {
      setSelectedId(undefined);
      return;
    }
    setSelectedId(id);
  };

  return (
    <section
      aria-label="Execution replay"
      className="vbg-custom-replay"
      onKeyDown={(event) => {
        if (event.key === "Escape" && selectedAction) {
          event.preventDefault();
          closeInspector();
        }
      }}
    >
      <div className="vbg-custom-replay-head">
        <ExecutionOverview items={items} onSelect={selectOverviewItem} selectedId={selectedId} />
      </div>
      <div className={`vbg-custom-replay-workspace${selectedAction ? " vbg-custom-replay-workspace--with-inspector" : ""}`}>
        <ol className="vbg-custom-replay-stream" ref={streamRef}>
          {model.blocks.map((block) => block.type === "execution" ? (
            <li className="vbg-custom-replay-execution-block" key={block.id}>
              <ExecutionGroup actions={block.actions} selectedId={selectedId} onSelectAction={selectAction} />
            </li>
          ) : (
            <li
              className={`vbg-custom-replay-message vbg-custom-replay-message--${block.node.kind}`}
              data-selected={selectedId === block.id || undefined}
              id={block.id}
              key={block.id}
            >
              <article>
                <header>
                  <span className="vbg-custom-replay-message__role">{block.node.label}</span>
                  <strong>{block.node.title}</strong>
                  {block.event.timingSource === "turn-fallback" ? (
                    <span className="vbg-custom-replay-message__timing" title="Exact event time is unavailable">Order only</span>
                  ) : (
                    <time dateTime={block.event.at}>{formatTime(block.event.at)}</time>
                  )}
                  <StatusMark label={false} status={block.event.status} />
                </header>
                <EventDetails event={block.event} fallback={block.node.detail} onOpenSubagent={onOpenSubagent} subagentView="trace" />
              </article>
            </li>
          ))}
        </ol>
        {selectedAction && (
          <ExecutionInspector
            key={selectedAction.id}
            item={replayInspectorItem(selectedAction)}
            onClose={closeInspector}
            onOpenSubagent={onOpenSubagent}
            subagentView="trace"
          />
        )}
      </div>
    </section>
  );
}
