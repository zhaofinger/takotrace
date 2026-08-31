import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../../src/web/styles.css", import.meta.url), "utf8");

describe("sequence semantic colors", () => {
  it.each(["user", "agent", "tool", "skill", "mcp", "subagent"])(
    "defines a complete %s role palette",
    (role) => {
      const roleRule = styles.match(new RegExp(`\\.vbg-custom-sequence__step-row--role-${role} \\{([^}]*)\\}`))?.[1] ?? "";
      expect(roleRule).toContain("--vbg-sequence-step-bg:");
      expect(roleRule).toContain("--vbg-sequence-step-border:");
      expect(roleRule).toContain("--vbg-sequence-step-color:");
    },
  );

  it("uses the matching semantic border for selected and failed steps", () => {
    const selectedRule = styles.match(/\.vbg-custom-sequence__step-row--selected \{([^}]*)\}/)?.[1] ?? "";
    const failedRule = styles.match(/\.vbg-custom-sequence__step-row--status-failed,[\s\S]*?\{([^}]*)\}/)?.[1] ?? "";

    expect(selectedRule).toContain("background: var(--vbg-sequence-step-bg)");
    expect(selectedRule).toContain("box-shadow: inset 0 0 0 1px var(--vbg-selection-border)");
    expect(selectedRule).not.toContain("color-mix");
    expect(failedRule).toContain("--vbg-sequence-step-border:");
  });

  it("keeps Tool categorization distinct from amber warning semantics", () => {
    expect(styles).not.toContain("--vbg-role-tool-bg: var(--vbg-amber-");
    expect(styles).not.toContain("--vbg-role-tool-border: var(--vbg-amber-");
    expect(styles).not.toContain("--vbg-role-tool-icon: var(--vbg-amber-");
    expect(styles).toContain("--vbg-role-tool-bg: light-dark(oklch(");
  });

  it("uses the selected state alone for keyboard focus", () => {
    const focusRules = [...styles.matchAll(/\.vbg-report \.vbg-custom-sequence__step-row:focus-visible \{([^}]*)\}/g)]
      .map((match) => match[1] ?? "");
    const selectedFocusRule = styles.match(/\.vbg-report \.vbg-custom-sequence__step-row--selected:focus-visible \{([^}]*)\}/)?.[1] ?? "";

    expect(focusRules).toEqual(["\n  outline: none;\n"]);
    expect(selectedFocusRule).toBe("");
  });
});
