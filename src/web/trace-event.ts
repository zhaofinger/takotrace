import type { CompactTraceEvent, TraceEvent } from "./types";
import { asRecord, nonEmptyText, type UnknownRecord } from "./value-utils";

export type TraceLikeEvent = CompactTraceEvent | TraceEvent;

export function eventRaw(event: TraceLikeEvent): UnknownRecord {
  if (!("raw" in event)) return {};
  const raw = asRecord(event.raw);
  const item = asRecord(asRecord(raw.params).item);
  return Object.keys(item).length ? item : raw;
}

export function normalizedEventType(event: TraceLikeEvent): string {
  return (nonEmptyText(eventRaw(event).type) ?? event.type).toLowerCase().replace(/[^a-z]/g, "");
}

export function traceEventId(event: TraceLikeEvent): string {
  return event.itemId ? `item-${event.itemId}` : `event-${event.seq}`;
}

export function timestampMs(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
