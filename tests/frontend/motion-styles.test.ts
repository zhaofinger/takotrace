import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../../src/web/styles.css", import.meta.url), "utf8");
const executionReplay = readFileSync(new URL("../../src/web/components/ExecutionReplay.tsx", import.meta.url), "utf8");
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
    expect(styles).toContain("transform: translateY(12px)");
    expect(styles).toContain("transform: scale(0.96)");
    expect(styles).toContain("@keyframes vbg-custom-popover-enter");
    expect(styles).toContain("@keyframes vbg-custom-panel-enter");
    expect(styles).toContain("animation: vbg-custom-popover-enter var(--vbg-motion-ui) var(--vbg-ease-out) both");
    expect(styles).toContain("animation: vbg-custom-panel-enter var(--vbg-motion-panel) var(--vbg-ease-out) both");
    expect(styles).not.toContain("scale(0)");
  });

  it("replays the shared inspector entrance when either selection changes", () => {
    expect(executionReplay).toMatch(/<ExecutionInspector\s+key=\{selectedAction\.id\}/);
    expect(sequenceDiagram).toMatch(/<ExecutionInspector\s+key=\{selectedStep\.id\}/);
  });

  it("adds visible press and selection feedback to bounded controls", () => {
    expect(styles).toContain(".vbg-custom-theme-toggle:active { transform: scale(0.97); }");
    expect(styles).toContain(".vbg-custom-sequence__inspector-close:active { transform: scale(0.97); }");
    expect(styles).toContain("box-shadow var(--vbg-motion-ui) var(--vbg-ease-out)");
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
