import { flowNode } from "./InteractionFlow";
import type { FlowEvent } from "./InteractionFlow";

export type ParallelEvidence = "timestamp" | "lifecycle" | "fork-join";

export interface ParallelGroup {
  id: string;
  eventIds: string[];
  maxConcurrency: number;
  evidence: ParallelEvidence;
  confidence: "confirmed" | "structured";
}

interface EventSpan {
  id: string;
  start: number;
  end: number;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function rawItem(event: FlowEvent): Record<string, unknown> {
  if (!("raw" in event)) return {};
  const raw = record(event.raw);
  const item = record(record(raw.params).item);
  return Object.keys(item).length ? item : raw;
}

function normalized(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
}

export function parallelEventId(event: FlowEvent): string {
  return event.itemId ? `item-${event.itemId}` : `event-${event.seq}`;
}

function actionEvents(events: FlowEvent[]): FlowEvent[] {
  return events.filter((event) => {
    const kind = flowNode(event).kind;
    return kind !== "user" && kind !== "agent" && kind !== "reasoning" && kind !== "system";
  });
}

function timestamp(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function actualTimeSpans(events: FlowEvent[]): EventSpan[] {
  return events.flatMap((event) => {
    const start = timestamp(event.startedAt);
    const end = timestamp(event.completedAt);
    return start !== undefined && end !== undefined && end > start
      ? [{ id: parallelEventId(event), start, end }]
      : [];
  });
}

function lifecycleSpans(events: FlowEvent[]): EventSpan[] {
  const lastSeq = Math.max(0, ...events.map((event) => event.completedSeq ?? event.startedSeq ?? event.seq)) + 1;
  return events.flatMap((event) => {
    const start = event.startedSeq;
    const end = event.completedSeq ?? (event.status === "running" ? lastSeq : undefined);
    return start !== undefined && end !== undefined && end > start
      ? [{ id: parallelEventId(event), start, end }]
      : [];
  });
}

function overlappingGroups(
  spans: EventSpan[],
  evidence: ParallelEvidence,
  confidence: ParallelGroup["confidence"],
): ParallelGroup[] {
  const sorted = [...spans].sort((left, right) => left.start - right.start || left.end - right.end);
  const groups: ParallelGroup[] = [];
  let component: EventSpan[] = [];
  let componentEnd = Number.NEGATIVE_INFINITY;

  const flush = () => {
    if (component.length < 2) return;
    const points = component.flatMap((span) => [
      { at: span.start, delta: 1 },
      { at: span.end, delta: -1 },
    ]).sort((left, right) => left.at - right.at || left.delta - right.delta);
    let active = 0;
    let maxConcurrency = 0;
    for (const point of points) {
      active += point.delta;
      maxConcurrency = Math.max(maxConcurrency, active);
    }
    if (maxConcurrency < 2) return;
    const eventIds = component.map((span) => span.id);
    groups.push({
      id: `parallel-${evidence}-${eventIds.join("-")}`,
      eventIds,
      maxConcurrency,
      evidence,
      confidence,
    });
  };

  for (const span of sorted) {
    if (component.length && span.start >= componentEnd) {
      flush();
      component = [];
      componentEnd = Number.NEGATIVE_INFINITY;
    }
    component.push(span);
    componentEnd = Math.max(componentEnd, span.end);
  }
  flush();
  return groups;
}

function receivers(raw: Record<string, unknown>): string[] {
  const values = Array.isArray(raw.receiverThreadIds)
    ? raw.receiverThreadIds
    : Array.isArray(raw.receiver_thread_ids) ? raw.receiver_thread_ids : [];
  return values.filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
}

function forkJoinGroups(events: FlowEvent[]): ParallelGroup[] {
  const groups: ParallelGroup[] = [];
  let forks: Array<{ id: string; targets: string[] }> = [];

  const flush = (selected = forks) => {
    if (!selected.length) return;
    const targets = new Set(selected.flatMap((fork) => fork.targets));
    const maxConcurrency = Math.max(targets.size, selected.length === 1 ? 0 : selected.length);
    if (maxConcurrency > 1) {
      const eventIds = selected.map((fork) => fork.id);
      groups.push({
        id: `parallel-fork-join-${eventIds.join("-")}`,
        eventIds,
        maxConcurrency,
        evidence: "fork-join",
        confidence: "structured",
      });
    }
  };

  for (const event of events) {
    const raw = rawItem(event);
    const type = normalized(raw.type ?? event.type);
    if (type === "subagentactivity") {
      const kind = normalized(raw.kind);
      const threadId = typeof (raw.agentThreadId ?? raw.agent_thread_id) === "string"
        ? String(raw.agentThreadId ?? raw.agent_thread_id).trim()
        : "";
      if (threadId && ["completed", "failed", "interrupted"].includes(kind)) {
        forks = forks.filter((fork) => !fork.targets.includes(threadId));
      }
      continue;
    }
    if (type !== "collabagenttoolcall") continue;
    const tool = normalized(raw.tool);
    if (tool === "spawnagent" || tool === "resumeagent") {
      forks.push({ id: parallelEventId(event), targets: receivers(raw) });
    } else if (tool === "wait" || tool === "waitagent") {
      const waitTargets = new Set(receivers(raw));
      const joined = waitTargets.size
        ? forks.filter((fork) => fork.targets.some((target) => waitTargets.has(target)))
        : forks;
      flush(joined);
      const joinedIds = new Set(joined.map((fork) => fork.id));
      forks = forks.filter((fork) => !joinedIds.has(fork.id));
    }
  }
  flush();
  return groups;
}

function groupKey(group: ParallelGroup): string {
  return [...group.eventIds].sort().join("\0");
}

export function parallelExecutionGroups(events: FlowEvent[]): ParallelGroup[] {
  const actions = actionEvents(events);
  const candidates = [
    ...overlappingGroups(actualTimeSpans(actions), "timestamp", "confirmed"),
    ...overlappingGroups(lifecycleSpans(actions), "lifecycle", "confirmed"),
    ...forkJoinGroups(actions),
  ];
  const priority: Record<ParallelEvidence, number> = { timestamp: 3, lifecycle: 2, "fork-join": 1 };
  const best = new Map<string, ParallelGroup>();
  for (const group of candidates) {
    const key = groupKey(group);
    const previous = best.get(key);
    if (!previous || priority[group.evidence] > priority[previous.evidence]) best.set(key, group);
  }
  return [...best.values()];
}

export function parallelEvidenceLabel(group: ParallelGroup): string {
  if (group.evidence === "fork-join") return `Parallel dispatch ×${group.maxConcurrency}`;
  return `Parallel ×${group.maxConcurrency}`;
}
