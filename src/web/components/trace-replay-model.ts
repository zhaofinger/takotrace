import type { TraceStatus } from "../types";
import { eventRaw, timestampMs, traceEventId } from "../trace-event";
import { flowNode, mergeFlowEvents } from "./InteractionFlow";
import type { FlowEvent, FlowKind, FlowNode } from "./InteractionFlow";
import { parallelExecutionGroups, parallelEventId } from "./parallel-execution-model";
import type { ParallelGroup } from "./parallel-execution-model";

export type ReplayDensity = "key" | "all";
export type ReplayTimingMode = "observed" | "inferred" | "order";

export interface ReplayAction {
  id: string;
  batch: number;
  event: FlowEvent;
  kind: Exclude<FlowKind, "user" | "agent">;
  label: string;
  title: string;
  detail: string;
  meta?: string;
  status: TraceStatus;
  durationMs?: number;
  startedAtMs?: number;
  completedAtMs?: number;
  timing: ReplayTimingMode;
  parallel?: ParallelGroup;
}

export interface ReplayMessage {
  type: "message";
  id: string;
  event: FlowEvent;
  node: FlowNode & { kind: "user" | "agent" };
}

export interface ReplayExecution {
  type: "execution";
  id: string;
  ownerAgentId?: string;
  actions: ReplayAction[];
}

export type ReplayBlock = ReplayMessage | ReplayExecution;

export interface TraceReplayModel {
  blocks: ReplayBlock[];
  total: number;
  visible: number;
}

export interface ReplayExecutionTiming {
  mode: ReplayTimingMode;
  startedAtMs?: number;
  completedAtMs?: number;
  wallTimeMs?: number;
  maxConcurrency: number;
  timedActions: number;
}

function eventTiming(event: FlowEvent): Pick<ReplayAction, "startedAtMs" | "completedAtMs" | "timing"> {
  const startedAtMs = timestampMs(event.startedAt);
  const completedAtMs = timestampMs(event.completedAt);
  if (startedAtMs !== undefined && completedAtMs !== undefined && completedAtMs >= startedAtMs) {
    return { startedAtMs, completedAtMs, timing: "observed" };
  }
  if (event.durationMs !== undefined && event.durationMs > 0) {
    const inferredEnd = completedAtMs
      ?? (event.method.includes("completed") || event.method.includes("failed") ? timestampMs(event.at) : undefined);
    if (inferredEnd !== undefined) {
      return {
        startedAtMs: inferredEnd - event.durationMs,
        completedAtMs: inferredEnd,
        timing: "inferred",
      };
    }
  }
  return { timing: "order" };
}

function action(event: FlowEvent, node: FlowNode, batch: number, parallel?: ParallelGroup): ReplayAction {
  const isMcp = node.kind === "mcp";
  const timing = eventTiming(event);
  const item = eventRaw(event);
  const commandFailed = node.kind === "tool" && typeof item.exitCode === "number" && item.exitCode !== 0;
  return {
    id: traceEventId(event),
    batch,
    event,
    kind: node.kind as ReplayAction["kind"],
    label: isMcp ? "Tool" : node.label,
    title: isMcp ? `MCP · ${node.title}` : node.title,
    detail: node.detail,
    meta: node.meta,
    status: commandFailed ? "failed" : event.status,
    durationMs: event.durationMs,
    parallel,
    ...timing,
  };
}

export function traceReplayModel(items: FlowEvent[], density: ReplayDensity): TraceReplayModel {
  const merged = mergeFlowEvents(items).map((event) => ({ event, node: flowNode(event) }));
  const parallelByEventId = new Map<string, ParallelGroup>();
  for (const group of parallelExecutionGroups(merged.map(({ event }) => event))) {
    for (const id of group.eventIds) if (!parallelByEventId.has(id)) parallelByEventId.set(id, group);
  }
  const isVisible = ({ node }: typeof merged[number]) => density === "all"
    || (node.kind !== "reasoning" && node.kind !== "system");
  const visible = merged.filter(isVisible);
  const blocks: ReplayBlock[] = [];
  let currentAgentId: string | undefined;
  let forceExecutionBlock = true;
  let currentBatch = 0;
  for (const item of merged) {
    if (item.node.kind === "user" || item.node.kind === "agent") {
      const id = traceEventId(item.event);
      blocks.push({ type: "message", id, event: item.event, node: item.node as ReplayMessage["node"] });
      currentAgentId = item.node.kind === "agent" ? id : undefined;
      forceExecutionBlock = true;
      currentBatch = 0;
      continue;
    }
    if (item.node.kind === "reasoning" || item.node.kind === "system") currentBatch += 1;
    if (!isVisible(item)) continue;
    const previous = blocks[blocks.length - 1];
    const parallel = parallelByEventId.get(parallelEventId(item.event));
    if (!forceExecutionBlock && previous?.type === "execution") previous.actions.push(action(item.event, item.node, currentBatch, parallel));
    else blocks.push({
      type: "execution",
      id: `execution-${traceEventId(item.event)}`,
      ownerAgentId: currentAgentId,
      actions: [action(item.event, item.node, currentBatch, parallel)],
    });
    forceExecutionBlock = false;
  }

  return { blocks, total: merged.length, visible: visible.length };
}

function timingForActions(actions: ReplayAction[]): ReplayExecutionTiming {
  const timed = actions.filter((item) => item.startedAtMs !== undefined
    && item.completedAtMs !== undefined
    && item.completedAtMs > item.startedAtMs);
  if (!timed.length) return { mode: "order", maxConcurrency: 0, timedActions: 0 };
  const startedAtMs = Math.min(...timed.map((item) => item.startedAtMs!));
  const completedAtMs = Math.max(...timed.map((item) => item.completedAtMs!));
  const points = timed.flatMap((item) => [
    { at: item.startedAtMs!, delta: 1 },
    { at: item.completedAtMs!, delta: -1 },
  ]).sort((left, right) => left.at - right.at || left.delta - right.delta);
  let active = 0;
  let maxConcurrency = 0;
  for (const point of points) {
    active += point.delta;
    maxConcurrency = Math.max(maxConcurrency, active);
  }
  const fullyObserved = timed.length === actions.length && timed.every((item) => item.timing === "observed");
  return {
    mode: fullyObserved ? "observed" : "inferred",
    startedAtMs,
    completedAtMs,
    wallTimeMs: completedAtMs - startedAtMs,
    maxConcurrency,
    timedActions: timed.length,
  };
}

export function replayBatchTimings(actions: ReplayAction[]): Map<number, ReplayExecutionTiming> {
  const grouped = new Map<number, ReplayAction[]>();
  for (const item of actions) {
    const batch = grouped.get(item.batch);
    if (batch) batch.push(item);
    else grouped.set(item.batch, [item]);
  }
  return new Map([...grouped].map(([batch, items]) => [batch, timingForActions(items)]));
}

export function replayExecutionTiming(actions: ReplayAction[]): ReplayExecutionTiming {
  return timingForActions(actions);
}

export function replayGroupStatus(actions: ReplayAction[]): TraceStatus {
  if (actions.some((item) => item.status === "failed" || item.status === "error")) return "failed";
  if (actions.some((item) => item.status === "running")) return "running";
  if (actions.some((item) => item.status === "pending")) return "pending";
  return "completed";
}

export function replayActionCounts(actions: ReplayAction[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const item of actions) {
    const label = item.kind === "mcp" ? "MCP"
      : item.kind === "file" ? "Files"
        : item.kind === "subagent" ? "Subagents"
          : item.label;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()];
}
