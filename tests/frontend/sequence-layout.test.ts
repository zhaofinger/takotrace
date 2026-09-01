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
    const arrowLabelRule = styles.match(/\.vbg-custom-sequence__arrow-label \{([^}]*)\}/)?.[1] ?? "";
    const selfBadgeRule = styles.match(/\.vbg-custom-sequence__self-badge \{([^}]*)\}/)?.[1] ?? "";

    expect(stepRowRule).toContain("min-height: 56px");
    expect(stepRowRule).toContain("contain-intrinsic-size: auto 56px");
    expect(parallelStartRule).toContain("min-height: 80px");
    expect(arrowRule).toContain("--vbg-sequence-arrow-y: 36px");
    expect(arrowRule).toContain("height: 44px");
    expect(lineContainerRule).toContain("height: 44px");
    expect(selfLoopRule).toContain("height: 44px");
    expect(selfPathRule).toContain("top: 28px");
    expect(selfPathRule).toContain("height: 16px");
    expect(arrowLabelRule).toContain("width: max-content");
    expect(arrowLabelRule).toContain("max-width: min(360px, calc(100vw - 96px))");
    expect(selfBadgeRule).toContain("width: max-content");
    expect(selfBadgeRule).toContain("max-width: min(320px, calc(100vw - 96px))");
  });

  it("keeps the shared inspector overlaying the sequence canvas", () => {
    const sequenceWorkspaceRule = styles.match(/\.vbg-custom-sequence__workspace--with-inspector \{([^}]*)\}/)?.[1] ?? "";
    const inspectorRule = styles.match(/\.vbg-custom-sequence__inspector \{([^}]*)\}/)?.[1] ?? "";

    expect(sequenceWorkspaceRule).toContain("grid-template-rows: minmax(0, 1fr)");
    expect(inspectorRule).toContain("position: absolute");
    expect(inspectorRule).toContain("right: 0");
    expect(inspectorRule).toContain("width: min(560px, max(420px, 42%))");
  });

  it("keeps the inspector title compact on one line", () => {
    const titleContainerRule = styles.match(/\.vbg-custom-sequence__inspector-title \{([^}]*)\}/)?.[1] ?? "";
    const titleRule = styles.match(/\.vbg-custom-sequence__inspector-title strong \{([^}]*)\}/)?.[1] ?? "";

    const stepRule = styles.match(/\.vbg-custom-sequence__inspector-step \{([^}]*)\}/)?.[1] ?? "";

    expect(titleContainerRule).toContain("align-items: center");
    expect(titleContainerRule).not.toContain("flex-direction: column");
    expect(titleRule).toContain("overflow: hidden");
    expect(titleRule).toContain("font-weight: var(--vbg-weight-medium)");
    expect(titleRule).toContain("text-overflow: ellipsis");
    expect(titleRule).toContain("white-space: nowrap");
    expect(titleRule).not.toContain("line-clamp");
    expect(stepRule).toContain("font-size: var(--vbg-type-step-number)");
    expect(stepRule).toContain("white-space: nowrap");
  });

  it("anchors the copy action to the canvas viewport", () => {
    const copyRule = styles.match(/\.vbg-custom-sequence__copy-btn \{([^}]*)\}/)?.[1] ?? "";
    const diagramRule = styles.match(/\.vbg-custom-sequence__diagram \{([^}]*)\}/)?.[1] ?? "";
    const headerRule = styles.match(/\.vbg-custom-sequence__lifelines-header \{([^}]*)\}/)?.[1] ?? "";
    const bodyRule = styles.match(/\.vbg-custom-sequence__body \{([^}]*)\}/)?.[1] ?? "";

    expect(copyRule).toContain("position: absolute");
    expect(copyRule).toContain("z-index: calc(var(--vbg-z-sticky) + 3)");
    expect(copyRule).toContain("top: var(--vbg-space-2)");
    expect(copyRule).toContain("right: var(--vbg-space-2)");
    expect(diagramRule).toContain("--vbg-sequence-inline-end: calc(var(--vbg-space-3) + 38px)");
    expect(headerRule).toContain("padding: 0 var(--vbg-sequence-inline-end) 0 var(--vbg-sequence-inline-start)");
    expect(bodyRule).toContain("padding: 0 var(--vbg-sequence-inline-end) 0 var(--vbg-sequence-inline-start)");
  });

  it("shows complete tooltip content across multiple lines", () => {
    const tooltipTextRule = styles.match(/\.vbg-custom-sequence__tooltip \.vbg-custom-inline-markdown \{([^}]*)\}/)?.[1] ?? "";

    expect(tooltipTextRule).toContain("overflow: visible");
    expect(tooltipTextRule).toContain("overflow-wrap: anywhere");
    expect(tooltipTextRule).toContain("text-overflow: clip");
    expect(tooltipTextRule).toContain("white-space: pre-wrap");
  });

});
