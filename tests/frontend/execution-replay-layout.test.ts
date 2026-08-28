import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../../src/web/styles.css", import.meta.url), "utf8");

describe("execution replay message spacing", () => {
  it("keeps message cards compact without changing typography", () => {
    const streamRule = styles.match(/\.vbg-custom-replay-stream \{([^}]*)\}/g)?.at(-1) ?? "";
    const articleRule = styles.match(/\.vbg-custom-replay-message > article \{([^}]*)\}/)?.[1] ?? "";
    const contentRule = styles.match(/\.vbg-custom-replay-message > article > \.vbg-custom-event-copy,[^{]+\{([^}]*)\}/)?.[1] ?? "";
    const markdownBlockRule = styles.match(/\.vbg-custom-replay-message > article > \.vbg-custom-markdown :is\(p, ul, ol\) \{([^}]*)\}/)?.[1] ?? "";

    expect(streamRule).toContain("gap: var(--vbg-space-2)");
    expect(articleRule).toContain("padding: var(--vbg-space-2) var(--vbg-space-3)");
    expect(contentRule).toContain("margin: var(--vbg-space-2) 0 0");
    expect(markdownBlockRule).toContain("margin-block: var(--vbg-space-1)");
  });
});
