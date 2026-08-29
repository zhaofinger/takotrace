import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { threadToHistory } from "../../src/shared/trace";
import { StatusMark, statusTone } from "../../src/web/components/StatusMark";

describe("StatusMark", () => {
  it("uses the same icon slot for completed and pending states", () => {
    const completed = renderToStaticMarkup(createElement(StatusMark, { label: false, status: "completed" }));
    const pending = renderToStaticMarkup(createElement(StatusMark, { label: false, status: "pending" }));

    expect(completed).toContain('class="vbg-custom-status__icon"');
    expect(pending).toContain('class="vbg-custom-status__icon"');
  });

  it("maps lifecycle states to semantic tones", () => {
    expect(statusTone("pending")).toBe("neutral");
    expect(statusTone("running")).toBe("active");
    expect(statusTone("completed")).toBe("success");
    expect(statusTone("interrupted")).toBe("warning");
    expect(statusTone("failed")).toBe("danger");
  });

  it("normalizes a returned subagent message independently from its interrupted run", () => {
    const thread = threadToHistory({
      id: "child-1",
      status: { type: "notLoaded" },
      createdAt: 1_767_225_600,
      updatedAt: 1_767_225_603,
      turns: [{
        id: "turn-1",
        status: "interrupted",
        completedAt: 1_767_225_603,
        durationMs: 3_000,
        items: [{ id: "message-1", type: "agentMessage", text: "Already returned" }],
      }],
    });

    expect(thread?.status).toBe("interrupted");
    expect(thread?.turns[0]).toMatchObject({ status: "interrupted", completedAt: "2026-01-01T00:00:03.000Z" });
    expect(thread?.turns[0].items[0]).toMatchObject({ method: "item/completed", status: "completed" });
  });
});
