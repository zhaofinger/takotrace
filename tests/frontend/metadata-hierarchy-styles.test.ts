import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const brand = readFileSync(new URL("../../src/web/assets/vercel-brand.css", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../src/web/styles.css", import.meta.url), "utf8");

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("metadata label and value hierarchy", () => {
  it("defines an AA-safe tertiary text level for both themes", () => {
    expect(brand).toContain("--vbg-text-tertiary: light-dark(oklch(0.5 0 0), oklch(0.64 0 0))");
  });

  it.each([
    ".vbg-custom-topbar__connection dt",
    ".vbg-custom-session-tooltip dt",
    ".vbg-custom-turn-overview dt",
    ".vbg-custom-turn-token-popover dt",
    ".vbg-custom-event-fields dt",
    ".vbg-custom-subagent-thread__model dt",
    ".vbg-custom-subagent-thread__run-meta dt",
    ".vbg-custom-execution-meta__facts dt",
  ])("uses the tertiary text level for %s", (selector) => {
    expect(declarations(selector)).toContain("color: var(--vbg-text-tertiary)");
    expect(declarations(selector)).toContain("font-size: var(--vbg-type-metadata)");
    expect(declarations(selector)).toContain("font-weight: var(--vbg-weight-regular)");
  });

  it("lets command action targets fill the detail width", () => {
    expect(declarations(".vbg-custom-event-actions")).toContain("display: grid");
    expect(declarations(".vbg-custom-event-actions > span")).toContain("width: 100%");
    expect(declarations(".vbg-custom-event-actions code")).toContain("flex: 1");
    expect(declarations(".vbg-custom-event-actions code")).toContain("max-width: none");
  });

  it.each([
    ".vbg-custom-topbar__connection dd",
    ".vbg-custom-session-tooltip dd",
    ".vbg-custom-turn-overview dd",
    ".vbg-custom-turn-token-popover dd",
    ".vbg-custom-event-fields dd",
    ".vbg-custom-subagent-thread__run-meta dd",
    ".vbg-custom-execution-meta__facts dd",
  ])("uses a stronger compact value style for %s", (selector) => {
    expect(declarations(selector)).toContain("color: var(--vbg-text-primary)");
    expect(declarations(selector)).toContain("font-size: var(--vbg-type-compact)");
    expect(declarations(selector)).toContain("font-weight: var(--vbg-weight-medium)");
  });

  it("lets model values inherit the surrounding value hierarchy", () => {
    const model = declarations(".vbg-custom-model-name");
    expect(model).toContain("color: inherit");
    expect(model).toContain("font-weight: inherit");
  });
});
