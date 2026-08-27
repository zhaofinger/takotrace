import { useEffect, useMemo, useState } from "react";
import { DensitySwitch } from "./DensitySwitch";
import { EventDetails } from "./EventDetails";
import { flowKindIconName } from "./InteractionFlow";
import type { FlowEvent, FlowKind } from "./InteractionFlow";
import { Icon } from "./Icon";
import { StatusMark } from "./StatusMark";
import {
  replayActionCounts,
  replayExecutionTiming,
  replayGroupStatus,
  traceReplayModel,
} from "./trace-replay-model";
import type { ReplayAction, ReplayDensity, ReplayTimingMode } from "./trace-replay-model";

type ReplayTimeScale = "actual" | "logical";
type OverviewLane = "user" | "agent" | "tools" | "subagents";

interface OverviewItem {
  id: string;
  kind: FlowKind;
  label: string;
  lane: OverviewLane;
  startedAtMs: number;
  completedAtMs: number;
  timing: ReplayTimingMode;
}

interface OverviewLayoutItem extends OverviewItem {
  left: number;
  width: number;
  track: number;
}

const OVERVIEW_LANES: Array<{ key: OverviewLane; label: string }> = [
  { key: "user", label: "Input" },
  { key: "agent", label: "Agent" },
  { key: "tools", label: "Tools" },
  { key: "subagents", label: "Subagents" },
];

const OVERVIEW_MARKER_WIDTH = 0.8;
const OVERVIEW_TRACK_PITCH = 8;

function formatDuration(value?: number): string | undefined {
  if (value === undefined) return undefined;
  if (value < 1_000) return `${value}ms`;
  return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}s`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function timestamp(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function overviewLane(kind: FlowKind): OverviewLane {
  if (kind === "user") return "user";
  if (kind === "agent" || kind === "reasoning") return "agent";
  if (kind === "subagent") return "subagents";
  return "tools";
}

function overviewEventSpan(event: FlowEvent): Pick<OverviewItem, "startedAtMs" | "completedAtMs" | "timing"> {
  const observedStart = timestamp(event.startedAt);
  const observedEnd = timestamp(event.completedAt);
  if (observedStart !== undefined && observedEnd !== undefined && observedEnd >= observedStart) {
    return { startedAtMs: observedStart, completedAtMs: observedEnd, timing: "observed" };
  }
  const completedAtMs = observedEnd ?? timestamp(event.at) ?? event.seq;
  if (event.durationMs !== undefined && event.durationMs > 0) {
    return { startedAtMs: completedAtMs - event.durationMs, completedAtMs, timing: "inferred" };
  }
  return { startedAtMs: completedAtMs, completedAtMs, timing: "order" };
}

function overviewItems(model: ReturnType<typeof traceReplayModel>): OverviewItem[] {
  const items: OverviewItem[] = [];
  for (const block of model.blocks) {
    if (block.type === "execution") {
      for (const item of block.actions) {
        const startedAtMs = item.startedAtMs ?? timestamp(item.event.startedAt) ?? timestamp(item.event.at) ?? item.event.seq;
        const completedAtMs = item.completedAtMs ?? timestamp(item.event.completedAt)
          ?? (item.durationMs === undefined ? startedAtMs : startedAtMs + item.durationMs);
        items.push({
          id: item.id,
          kind: item.kind,
          label: `${item.label} · ${item.title}`,
          lane: overviewLane(item.kind),
          startedAtMs,
          completedAtMs: Math.max(startedAtMs, completedAtMs),
          timing: item.timing,
        });
      }
      continue;
    }
    const span = overviewEventSpan(block.event);
    items.push({
      id: block.id,
      kind: block.node.kind,
      label: `${block.node.label} · ${block.node.title}`,
      lane: overviewLane(block.node.kind),
      ...span,
    });
  }
  return items;
}

function overviewLayout(items: OverviewItem[], scale: ReplayTimeScale): OverviewLayoutItem[] {
  if (!items.length) return [];
  const startedAtMs = Math.min(...items.map((item) => item.startedAtMs));
  const completedAtMs = Math.max(...items.map((item) => item.completedAtMs));
  const durationMs = Math.max(1, completedAtMs - startedAtMs);
  const maxLaneDurationMs = new Map(OVERVIEW_LANES.map((lane) => [
    lane.key,
    Math.max(1, ...items
      .filter((item) => item.lane === lane.key)
      .map((item) => item.completedAtMs - item.startedAtMs)),
  ]));
  const logicalSlotWidth = 100 / items.length;
  const logicalGap = Math.min(1, logicalSlotWidth * 0.15);
  const positioned = items.map((item, index) => {
    const itemDurationMs = Math.max(0, item.completedAtMs - item.startedAtMs);
    if (scale === "logical") {
      const availableWidth = Math.max(OVERVIEW_MARKER_WIDTH, logicalSlotWidth - logicalGap);
      const durationRatio = itemDurationMs === 0 ? 0 : Math.sqrt(itemDurationMs / maxLaneDurationMs.get(item.lane)!);
      const width = OVERVIEW_MARKER_WIDTH + (availableWidth - OVERVIEW_MARKER_WIDTH) * durationRatio;
      return { ...item, left: index * logicalSlotWidth, width, track: 0 };
    }
    const left = Math.min(100 - OVERVIEW_MARKER_WIDTH, ((item.startedAtMs - startedAtMs) / durationMs) * 100);
    const proportionalWidth = (itemDurationMs / durationMs) * 100;
    const width = Math.min(100 - left, Math.max(0, proportionalWidth));
    return { ...item, left, width, track: 0 };
  });

  for (const lane of OVERVIEW_LANES) {
    const endings: number[] = [];
    const laneItems = positioned.filter((item) => item.lane === lane.key).sort((left, right) => left.left - right.left);
    for (const item of laneItems) {
      const track = scale === "logical" ? 0 : Math.max(0, endings.findIndex((ending) => ending <= item.left));
      item.track = track === -1 ? endings.length : track;
      endings[item.track] = item.left + item.width;
    }
  }
  return positioned;
}

function overviewHasActualTiming(items: OverviewItem[]): boolean {
  const timed = items.filter((item) => item.timing !== "order");
  if (timed.length < 2) return false;
  const timestampsFollowExecutionOrder = items.every((item, index) => index === 0
    || item.startedAtMs >= items[index - 1].startedAtMs);
  if (!timestampsFollowExecutionOrder) return false;
  const startedAtMs = timed.map((item) => item.startedAtMs);
  return new Set(startedAtMs).size > 1
    && Math.max(...timed.map((item) => item.completedAtMs)) > Math.min(...startedAtMs);
}

function ReplayOverview({
  items,
  scale,
  selectedId,
  onSelect,
}: {
  items: OverviewItem[];
  scale: ReplayTimeScale;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  if (!items.length) return null;
  const actualTimingAvailable = overviewHasActualTiming(items);
  const effectiveScale = scale === "actual" && actualTimingAvailable ? "actual" : "logical";
  const layout = overviewLayout(items, effectiveScale);
  const visibleLanes = OVERVIEW_LANES.filter((lane) => layout.some((item) => item.lane === lane.key));
  const laneHeights = new Map<OverviewLane, number>();
  const laneOffsets = new Map<OverviewLane, number>();
  let totalHeight = 0;
  for (const lane of visibleLanes) {
    const laneItems = layout.filter((item) => item.lane === lane.key);
    const tracks = Math.max(1, ...laneItems.map((item) => item.track + 1));
    const height = Math.max(18, tracks * OVERVIEW_TRACK_PITCH + 6);
    laneOffsets.set(lane.key, totalHeight);
    laneHeights.set(lane.key, height);
    totalHeight += height;
  }
  const sequence = effectiveScale === "actual"
    ? [...layout].sort((left, right) => left.startedAtMs - right.startedAtMs)
    : layout;
  const points = sequence.map((item) => ({
    x: item.left + Math.min(item.width / 2, OVERVIEW_MARKER_WIDTH / 2),
    y: laneOffsets.get(item.lane)! + item.track * OVERVIEW_TRACK_PITCH + 7,
  }));
  const path = points.reduce((value, point, index) => index === 0
    ? `M ${point.x} ${point.y}`
    : `${value} H ${point.x} V ${point.y}`, "");
  return (
    <div
      aria-label="Trace overview"
      className="vbg-custom-replay-overview"
      title={effectiveScale === "actual" ? "Bar width represents duration" : "Bar width represents relative duration"}
    >
      <div className="vbg-custom-replay-overview__plot" style={{ height: `${totalHeight}px` }}>
        {effectiveScale === "logical" && points.length > 1 && (
          <svg
            aria-hidden="true"
            className="vbg-custom-replay-overview__sequence"
            preserveAspectRatio="none"
            viewBox={`0 0 100 ${totalHeight}`}
          >
            <defs>
              <marker id="vbg-replay-arrow" markerHeight="5" markerWidth="5" orient="auto" refX="4" refY="2.5">
                <path d="M 0 0 L 5 2.5 L 0 5 z" />
              </marker>
            </defs>
            <path d={path} markerEnd="url(#vbg-replay-arrow)" />
          </svg>
        )}
        {visibleLanes.map((lane) => {
          const laneItems = layout.filter((item) => item.lane === lane.key);
          return (
            <div className="vbg-custom-replay-overview__lane" key={lane.key} style={{ height: `${laneHeights.get(lane.key)}px` }}>
              <span>{lane.label}</span>
              <div className="vbg-custom-replay-overview__track">
                {laneItems.map((item) => {
                  const duration = formatDuration(Math.max(0, item.completedAtMs - item.startedAtMs));
                  const timingLabel = item.timing === "observed" ? "Observed timing"
                    : item.timing === "inferred" ? "Estimated timing"
                      : "Order only";
                  const accessibleLabel = `${item.label} · ${duration} · ${timingLabel}`;
                  const point = item.timing === "order" || item.completedAtMs === item.startedAtMs;
                  return (
                    <button
                      aria-label={accessibleLabel}
                      aria-pressed={selectedId === item.id}
                      className={`vbg-custom-replay-overview__bar vbg-custom-replay-overview__bar--${item.kind}${point ? " vbg-custom-replay-overview__bar--point" : ""}`}
                      data-timing={item.timing}
                      key={item.id}
                      onClick={() => onSelect(item.id)}
                      style={{ left: `${item.left}%`, top: `${item.track * OVERVIEW_TRACK_PITCH + 3}px`, width: point ? "8px" : `max(6px, ${item.width}%)` }}
                      title={accessibleLabel}
                      type="button"
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
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
  const failedCount = actions.filter((item) => item.status === "failed" || item.status === "error").length;
  const shouldOpenInitially = status === "failed"
    || status === "running"
    || actions.length <= 3;
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
        <strong>Execution</strong>
        <span>{actions.length} action{actions.length === 1 ? "" : "s"}</span>
        <span className="vbg-custom-replay-counts">
          {replayActionCounts(actions).map(([label, count]) => <i key={label}>{label}{count > 1 ? ` ×${count}` : ""}</i>)}
          {timing.maxConcurrency > 1 && (
            <i className="vbg-custom-replay-counts__parallel">
              {timing.mode === "observed" ? "Parallel" : "Possible overlap"} ×{timing.maxConcurrency}
            </i>
          )}
          {timing.mode === "order" ? <i>Order only</i> : timing.mode === "inferred" ? <i title="Estimated from completion time and duration">Estimated</i> : null}
          {timing.wallTimeMs !== undefined && timing.wallTimeMs > 0 && <i>{formatDuration(timing.wallTimeMs)}</i>}
        </span>
        {failedCount > 0 && <span className="vbg-custom-replay-failure">{failedCount} failed</span>}
        <StatusMark label={false} status={status} />
      </summary>
      <ol className="vbg-custom-replay-actions">
        {actions.map((item) => {
          const renderedDurationMs = item.startedAtMs !== undefined && item.completedAtMs !== undefined
            ? Math.max(0, item.completedAtMs - item.startedAtMs)
            : item.durationMs;
          const durationSource = item.timing === "observed" ? "Observed"
            : item.timing === "inferred" ? "Estimated"
              : "Reported";
          return (
            <li
              className={`vbg-custom-replay-action vbg-custom-replay-action--${item.kind}`}
              data-selected={selectedId === item.id || undefined}
              id={item.id}
              key={item.id}
            >
              <button
                type="button"
                className="vbg-custom-replay-action__summary"
                id={`replay-action-trigger-${item.id}`}
                aria-controls={selectedId === item.id ? "replay-action-inspector" : undefined}
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
                  <StatusMark label={false} status={item.status} />
              </button>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

export function ReplayActionInspector({
  action,
  collapsed,
  onClose,
  onToggle,
}: {
  action: ReplayAction;
  collapsed: boolean;
  onClose: () => void;
  onToggle: () => void;
}) {
  const titleId = `replay-action-inspector-title-${action.event.seq}`;
  const bodyId = `replay-action-inspector-body-${action.event.seq}`;
  const duration = formatDuration(action.durationMs);

  return (
    <aside
      className={`vbg-custom-sequence__inspector vbg-custom-replay-inspector${collapsed ? " vbg-custom-sequence__inspector--collapsed" : ""}`}
      id="replay-action-inspector"
      aria-labelledby={titleId}
    >
      <header className="vbg-custom-sequence__inspector-header">
        <div className="vbg-custom-sequence__inspector-title" id={titleId} aria-live="polite">
          <span className="vbg-custom-sequence__step-num">Step {action.event.seq}</span>
          <strong title={action.title}>{action.title}</strong>
          <StatusMark status={action.status} />
        </div>
        <div className="vbg-custom-sequence__inspector-actions">
          <button
            type="button"
            className="vbg-custom-sequence__inspector-toggle"
            onClick={onToggle}
            aria-controls={bodyId}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand action details" : "Collapse action details"}
            title={collapsed ? "Expand details" : "Collapse details"}
          >
            <Icon name="chevron" />
          </button>
          <button
            type="button"
            className="vbg-custom-sequence__inspector-close"
            onClick={onClose}
            aria-label="Close action details"
            title="Close details"
          >
            &times;
          </button>
        </div>
      </header>
      <div className="vbg-custom-sequence__inspector-body" id={bodyId} hidden={collapsed}>
        <dl className="vbg-custom-sequence__inspector-meta">
          <div><dt>From</dt><dd>agent</dd></div>
          <div><dt>To</dt><dd>{action.kind}</dd></div>
          <div><dt>Type</dt><dd>call</dd></div>
          <div><dt>Time</dt><dd>{formatTime(action.event.at)}</dd></div>
          {duration && <div><dt>Duration</dt><dd>{duration}</dd></div>}
        </dl>
        <EventDetails event={action.event} fallback={action.detail} />
      </div>
    </aside>
  );
}

export default function ExecutionReplay({ items }: { items: FlowEvent[] }) {
  const [density, setDensity] = useState<ReplayDensity>("key");
  const [selectedId, setSelectedId] = useState<string>();
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const model = useMemo(() => traceReplayModel(items, density), [density, items]);
  const overview = useMemo(() => overviewItems(model), [model]);
  const selectedAction = useMemo(() => model.blocks
    .flatMap((block) => block.type === "execution" ? block.actions : [])
    .find((action) => action.id === selectedId), [model.blocks, selectedId]);
  const actualTimingAvailable = useMemo(() => overviewHasActualTiming(overview), [overview]);
  const effectiveScale: ReplayTimeScale = actualTimingAvailable ? "actual" : "logical";

  useEffect(() => {
    if (selectedId && !overview.some((item) => item.id === selectedId)) {
      setSelectedId(undefined);
      setInspectorCollapsed(false);
    }
  }, [overview, selectedId]);

  const closeInspector = () => {
    const actionId = selectedAction?.id;
    setSelectedId(undefined);
    setInspectorCollapsed(false);
    if (actionId) {
      requestAnimationFrame(() => document.getElementById(`replay-action-trigger-${actionId}`)?.focus());
    }
  };

  const selectAction = (id: string) => {
    if (selectedId === id) {
      closeInspector();
      return;
    }
    setSelectedId(id);
    setInspectorCollapsed(false);
  };

  const selectOverviewItem = (id: string) => {
    if (selectedId === id) {
      setSelectedId(undefined);
      return;
    }
    setSelectedId(id);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
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
        <header className="vbg-custom-replay-toolbar">
          <DensitySwitch
            checked={density === "all"}
            label="Show all replay events"
            onChange={(checked) => setDensity(checked ? "all" : "key")}
            total={model.total}
            visible={model.visible}
          />
        </header>
        <ReplayOverview items={overview} onSelect={selectOverviewItem} scale={effectiveScale} selectedId={selectedId} />
      </div>
      <div className={`vbg-custom-replay-workspace${selectedAction ? " vbg-custom-replay-workspace--with-inspector" : ""}`}>
        <ol className="vbg-custom-replay-stream">
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
                  <time dateTime={block.event.at}>{formatTime(block.event.at)}</time>
                  <StatusMark label={false} status={block.event.status} />
                </header>
                <EventDetails event={block.event} fallback={block.node.detail} />
              </article>
            </li>
          ))}
        </ol>
        {selectedAction && (
          <ReplayActionInspector
            action={selectedAction}
            collapsed={inspectorCollapsed}
            onClose={closeInspector}
            onToggle={() => setInspectorCollapsed((current) => !current)}
          />
        )}
      </div>
    </section>
  );
}
