import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EventDetails } from "../../src/web/components/EventDetails";
import type { TraceEvent } from "../../src/web/types";

function fileChangeEvent(raw: unknown): TraceEvent {
  return {
    seq: 1,
    at: "2026-08-27T09:23:02.237Z",
    method: "item/completed",
    type: "FileChange",
    status: "completed",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "file-change-1",
    summary: "item completed",
    raw,
  };
}

describe("EventDetails command actions", () => {
  it("labels unclassified shell actions as commands instead of unknown", () => {
    const markup = renderToStaticMarkup(createElement(EventDetails, {
      event: {
        ...fileChangeEvent({}),
        type: "CommandExecution",
        raw: {
          command: "/opt/homebrew/bin/fnm exec --using=22.22.0 npm test",
          commandActions: [{ type: "unknown", command: "/opt/homebrew/bin/fnm exec --using=22.22.0 npm test" }],
          exitCode: 0,
        },
      },
      fallback: "No additional detail",
    }));

    expect(markup).toContain("<strong>command</strong>");
    expect(markup).not.toContain("<strong>unknown</strong>");
  });
});

describe("EventDetails file changes", () => {
  it("renders current App Server path-keyed changes with their unified diff", () => {
    const markup = renderToStaticMarkup(createElement(EventDetails, {
      event: fileChangeEvent({
        type: "FileChange",
        changes: {
          "/workspace/src/App.tsx": {
            type: "update",
            unified_diff: "@@ -1 +1 @@\n-old\n+new",
            move_path: null,
          },
        },
      }),
      fallback: "No additional detail",
    }));
    const visibleText = markup.replace(/<[^>]+>/g, "");

    expect(markup).toContain("update");
    expect(markup).toContain("/workspace/src/App.tsx");
    expect(markup).toContain("@@ -1 +1 @@");
    expect(visibleText).toContain("-old");
    expect(visibleText).toContain("+new");
    expect(markup).toContain('data-language="diff"');
    expect(markup).toContain("hljs-diff-line--hunk");
    expect(markup).toContain("hljs-diff-line--deletion");
    expect(markup).toContain("hljs-diff-line--addition");
  });

  it("keeps the legacy array shape visible and avoids an empty panel", () => {
    const legacyMarkup = renderToStaticMarkup(createElement(EventDetails, {
      event: fileChangeEvent({ changes: [{ path: "src/old.ts", kind: { type: "delete" }, diff: "-old" }] }),
      fallback: "No additional detail",
    }));
    const emptyMarkup = renderToStaticMarkup(createElement(EventDetails, {
      event: fileChangeEvent({ changes: [] }),
      fallback: "No file change details available",
    }));

    expect(legacyMarkup).toContain("src/old.ts");
    expect(legacyMarkup).toContain("delete");
    expect(legacyMarkup.replace(/<[^>]+>/g, "")).toContain("-old");
    expect(emptyMarkup).toContain("No file change details available");
  });
});
