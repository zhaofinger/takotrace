import { useMemo } from "react";
import { formatCompactDuration as formatDuration } from "../formatters";
import { timestampMs as timestamp } from "../trace-event";
import type { FlowEvent, FlowKind } from "./InteractionFlow";
import { traceReplayModel, type ReplayTimingMode } from "./trace-replay-model";

type OverviewScale = "actual" | "logical";
type OverviewLane = "user" | "agent" | "tools" | "mcp" | "subagents";

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
  { key: "mcp", label: "MCP" },
  { key: "subagents", label: "Subagents" },
];

const OVERVIEW_MARKER_WIDTH = 0.8;
const OVERVIEW_TRACK_PITCH = 8;

function overviewLane(kind: FlowKind): OverviewLane {
  if (kind === "user") return "user";
  if (kind === "agent" || kind === "reasoning") return "agent";
  if (kind === "mcp") return "mcp";
  if (kind === "subagent") return "subagents";
  return "tools";
}

function overviewEventSpan(event: FlowEvent): Pick<OverviewItem, "startedAtMs" | "completedAtMs" | "timing"> {
  if (event.timingSource === "turn-fallback") {
    return { startedAtMs: event.seq, completedAtMs: event.seq, timing: "order" };
  }
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

function overviewItems(items: FlowEvent[]): OverviewItem[] {
  const overview: OverviewItem[] = [];
  for (const block of traceReplayModel(items).blocks) {
    if (block.type === "execution") {
      for (const item of block.actions) {
        const startedAtMs = item.startedAtMs ?? timestamp(item.event.startedAt) ?? timestamp(item.event.at) ?? item.event.seq;
        const completedAtMs = item.completedAtMs ?? timestamp(item.event.completedAt)
          ?? (item.durationMs === undefined ? startedAtMs : startedAtMs + item.durationMs);
        overview.push({
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
    overview.push({
      id: block.id,
      kind: block.node.kind,
      label: `${block.node.label} · ${block.node.title}`,
      lane: overviewLane(block.node.kind),
      ...span,
    });
  }
  return overview;
}

function overviewLayout(items: OverviewItem[], scale: OverviewScale): OverviewLayoutItem[] {
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
  if (timed.every((item) => item.timing === "inferred")
    && new Set(timed.map((item) => item.completedAtMs)).size === 1) return false;
  const startedAtMs = timed.map((item) => item.startedAtMs);
  return new Set(startedAtMs).size > 1
    && Math.max(...timed.map((item) => item.completedAtMs)) > Math.min(...startedAtMs);
}

export function ExecutionOverview({
  items,
  onSelect,
  selectedId,
}: {
  items: FlowEvent[];
  onSelect: (id: string) => void;
  selectedId?: string;
}) {
  const overview = useMemo(() => overviewItems(items), [items]);
  if (!overview.length) return null;
  const effectiveScale: OverviewScale = overviewHasActualTiming(overview) ? "actual" : "logical";
  const layout = overviewLayout(overview, effectiveScale);
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
