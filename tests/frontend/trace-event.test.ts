import { describe, expect, it } from "vitest";
import { eventRaw, normalizedEventType, timestampMs, traceEventId } from "../../src/web/trace-event";
import type { TraceEvent } from "../../src/web/types";

function event(overrides: Partial<TraceEvent> = {}): TraceEvent {
  return {
    seq: 7,
    at: "2026-01-01T00:00:00.000Z",
    method: "item/completed",
    type: "item",
    status: "completed",
    threadId: "thread-1",
    summary: "done",
    raw: {},
    ...overrides,
  };
}

describe("trace event utilities", () => {
  it("prefers the App Server item payload and its normalized type", () => {
    const value = event({ raw: { params: { item: { type: "Mcp_Tool-Call", tool: "read" } } } });
    expect(eventRaw(value)).toEqual({ type: "Mcp_Tool-Call", tool: "read" });
    expect(normalizedEventType(value)).toBe("mcptoolcall");
  });

  it("falls back safely for compact events and malformed raw values", () => {
    const compact = { ...event({ type: "User-Message" }) } as Omit<TraceEvent, "raw"> & { raw?: never };
    delete (compact as { raw?: unknown }).raw;
    expect(eventRaw(compact)).toEqual({});
    expect(normalizedEventType(compact)).toBe("usermessage");
    expect(eventRaw(event({ raw: [] }))).toEqual({});
  });

  it("uses stable ids and rejects invalid timestamps", () => {
    expect(traceEventId(event({ itemId: "tool-1" }))).toBe("item-tool-1");
    expect(traceEventId(event())).toBe("event-7");
    expect(timestampMs("2026-01-01T00:00:00.000Z")).toBe(1_767_225_600_000);
    expect(timestampMs("not-a-date")).toBeUndefined();
    expect(timestampMs()).toBeUndefined();
  });
});
