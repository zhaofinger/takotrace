import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../../src/web/styles.css", import.meta.url), "utf8");
const executionReplay = readFileSync(new URL("../../src/web/components/ExecutionReplay.tsx", import.meta.url), "utf8");
const executionInspector = readFileSync(new URL("../../src/web/components/ExecutionInspector.tsx", import.meta.url), "utf8");
const sequenceDiagram = readFileSync(new URL("../../src/web/components/SequenceDiagram.tsx", import.meta.url), "utf8");

describe("motion styles", () => {
  it("uses one restrained motion scale and explicit properties", () => {
    expect(styles).toContain("--vbg-motion-fast: 160ms");
    expect(styles).toContain("--vbg-motion-ui: 220ms");
    expect(styles).toContain("--vbg-motion-panel: 280ms");
    expect(styles).toContain("--vbg-ease-out: cubic-bezier(0.23, 1, 0.32, 1)");
    expect(styles).not.toMatch(/transition:\s*all\b/);
  });

  it("animates contextual surfaces from a non-zero scale", () => {
    expect(styles).toContain("@starting-style");
    expect(styles).toContain("transform: translateY(-8px) scale(0.95)");
    expect(styles).toContain("transform: translateX(20px)");
    expect(styles).toContain("transform: scale(0.96)");
    expect(styles).toContain("@keyframes vbg-custom-popover-enter");
    expect(styles).toContain("@keyframes vbg-custom-drawer-enter");
    expect(styles).toContain("animation: vbg-custom-popover-enter var(--vbg-motion-ui) var(--vbg-ease-out) both");
    expect(styles).toContain("animation: vbg-custom-drawer-enter var(--vbg-motion-panel) var(--vbg-ease-out) both");
    expect(styles).not.toContain("scale(0)");
  });

  it("replays the shared inspector entrance when either selection changes", () => {
    expect(executionReplay).toMatch(/<ExecutionInspector\s+key=\{selectedAction\.id\}/);
    expect(sequenceDiagram).toMatch(/<ExecutionInspector\s+key=\{selectedStep\.id\}/);
    expect(executionReplay).toContain('subagentView="trace"');
    expect(sequenceDiagram).toContain('subagentView="sequence"');
    expect(executionInspector).toContain('const isSubagent = kind === "subagent"');
    expect(executionInspector).toContain("{!isSubagent && (");
    expect(executionInspector).toContain("vbg-custom-sequence__inspector-summary--subagent");
  });

  it("adds visible press and selection feedback to bounded controls", () => {
    expect(styles).toContain(".vbg-custom-theme-toggle:active { transform: scale(0.97); }");
    expect(styles).toContain(".vbg-custom-sequence__inspector-close:active { transform: scale(0.97); }");
    expect(styles).toContain("box-shadow var(--vbg-motion-ui) var(--vbg-ease-out)");
  });

  it("keeps the sequence copy control above the sticky participant header", () => {
    expect(styles).toMatch(/\.vbg-custom-sequence__copy-btn\s*\{[^}]*z-index:\s*calc\(var\(--vbg-z-sticky\) \+ 3\);/s);
    expect(styles).toMatch(/\.vbg-custom-sequence__lifelines-header\s*\{[^}]*z-index:\s*calc\(var\(--vbg-z-sticky\) \+ 2\);/s);
    expect(styles).toMatch(/\.vbg-custom-turn-token-popover\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*var\(--vbg-z-tooltip\);/s);
  });

  it("keeps run metadata on one line and progressively compacts narrow summaries", () => {
    expect(styles).toMatch(/\.vbg-custom-turn-summary\s*\{[^}]*flex-wrap:\s*nowrap;/s);
    expect(styles).toMatch(/\.vbg-custom-turn-overview\s*\{[^}]*flex-wrap:\s*nowrap;/s);
    expect(styles).toContain("container-type: inline-size");
    expect(styles).toContain("@container (max-width: 780px)");
    expect(styles).toContain(".vbg-custom-turn-overview__started { display: none !important; }");
  });

  it("keeps opacity feedback while removing movement for reduced motion", () => {
    const reducedMotion = styles.slice(styles.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducedMotion).toContain("transition-property: opacity");
    expect(reducedMotion).toContain("animation-name: vbg-custom-fade-enter");
    expect(reducedMotion).toContain("transform: none");
    expect(reducedMotion).toContain(".vbg-custom-theme-toggle:active");
    expect(reducedMotion).not.toContain("transition-duration: 0.01ms !important");
  });
});
