import { describe, expect, it } from "vitest";
import { retainSelectedTurnDetail } from "../../src/web/App.js";
import type { Turn } from "../../src/web/types.js";

describe("live run detail refresh", () => {
  const populatedDetail: Turn = {
    id: "turn-current",
    status: "running",
    items: [{
      seq: 1,
      at: "2026-09-01T00:00:00.000Z",
      method: "item/started",
      type: "agentMessage",
      status: "running",
      threadId: "thread-current",
      turnId: "turn-current",
      summary: "Working",
      raw: {},
    }],
  };

  it("preserves populated detail while the selected run refreshes", () => {
    expect(retainSelectedTurnDetail(populatedDetail, "turn-current")).toBe(populatedDetail);
  });

  it("discards detail when a different run is selected", () => {
    expect(retainSelectedTurnDetail(populatedDetail, "turn-next")).toBeUndefined();
  });
});
