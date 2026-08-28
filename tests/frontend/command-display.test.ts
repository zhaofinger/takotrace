import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { commandText, workingDirectoryText } from "../../src/web/components/command-display";
import { EventDetails } from "../../src/web/components/EventDetails";
import type { TraceEvent } from "../../src/web/types";

describe("command display", () => {
  it("unwraps shell argv arrays and formats ordinary argv", () => {
    expect(commandText(["/bin/zsh", "-lc", "sed -n '1,20p' README.md"])).toBe("sed -n '1,20p' README.md");
    expect(commandText(["git", "commit", "-m", "Fix command display"])).toBe('git commit -m "Fix command display"');
    expect(commandText("npm test")).toBe("npm test");
  });

  it("turns file URLs into readable working directories", () => {
    expect(workingDirectoryText("file:///Users/bytedance/workspace/thread-scope"))
      .toBe("/Users/bytedance/workspace/thread-scope");
  });

  it("renders argv commands and readable working directories in details", () => {
    const event: TraceEvent = {
      seq: 1,
      at: "2026-08-27T00:00:00.000Z",
      method: "item/completed",
      type: "commandExecution",
      status: "completed",
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      summary: "item completed",
      raw: {
        type: "commandExecution",
        command: ["/bin/zsh", "-lc", "sed -n '1,20p' README.md"],
        cwd: "file:///Users/bytedance/workspace/thread-scope",
        exitCode: 0,
      },
    };
    const markup = renderToStaticMarkup(createElement(EventDetails, { event, fallback: "No additional detail" }));

    expect(markup.replace(/<[^>]+>/g, "")).toContain("sed -n &#x27;1,20p&#x27; README.md");
    expect(markup).toContain('data-language="bash"');
    expect(markup).toContain('class="hljs-string"');
    expect(markup).toContain("/Users/bytedance/workspace/thread-scope");
    expect(markup).not.toContain("file:///");
    expect(markup).not.toContain("No additional detail");
  });
});
