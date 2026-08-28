import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../../src/web/styles.css", import.meta.url), "utf8");

describe("sequence step spacing", () => {
  it("keeps compact rows while aligning horizontal and self-loop paths", () => {
    const stepRowRule = styles.match(/\.vbg-custom-sequence__step-row \{([^}]*)\}/)?.[1] ?? "";
    const parallelStartRule = styles.match(/\.vbg-custom-sequence__step-row--parallel-start \{([^}]*)\}/)?.[1] ?? "";
    const arrowRule = styles.match(/\.vbg-custom-sequence__arrow \{([^}]*)\}/)?.[1] ?? "";
    const lineContainerRule = styles.match(/\.vbg-custom-sequence__step-line-container \{([^}]*)\}/)?.[1] ?? "";
    const selfLoopRule = styles.match(/\.vbg-custom-sequence__self-loop \{([^}]*)\}/)?.[1] ?? "";
    const selfPathRule = styles.match(/\.vbg-custom-sequence__self-path \{([^}]*)\}/)?.[1] ?? "";

    expect(stepRowRule).toContain("min-height: 56px");
    expect(stepRowRule).toContain("contain-intrinsic-size: auto 56px");
    expect(parallelStartRule).toContain("min-height: 80px");
    expect(arrowRule).toContain("--vbg-sequence-arrow-y: 40px");
    expect(arrowRule).toContain("height: 44px");
    expect(lineContainerRule).toContain("height: 44px");
    expect(selfLoopRule).toContain("height: 44px");
    expect(selfPathRule).toContain("top: 28px");
    expect(selfPathRule).toContain("height: 16px");
  });

  it("keeps timing metadata compact", () => {
    const timingRule = styles.match(/\.vbg-custom-sequence__inspector-timing \{([^}]*)\}/)?.[1] ?? "";
    const timingCodeRule = styles.match(/\.vbg-custom-sequence__inspector-timing code \{([^}]*)\}/)?.[1] ?? "";

    expect(timingRule).toContain("font-size: var(--vbg-type-metadata)");
    expect(timingRule).toContain("line-height: var(--vbg-leading-caption)");
    expect(timingCodeRule).toContain("font-size: inherit");
  });
});
