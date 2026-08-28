import { describe, expect, it } from "vitest";
import { nextRovingTabIndex } from "../../src/web/roving-tabs";

describe("roving tab navigation", () => {
  it("wraps horizontal arrows and supports Home and End", () => {
    expect(nextRovingTabIndex(0, 3, "ArrowLeft")).toBe(2);
    expect(nextRovingTabIndex(2, 3, "ArrowRight")).toBe(0);
    expect(nextRovingTabIndex(1, 3, "Home")).toBe(0);
    expect(nextRovingTabIndex(1, 3, "End")).toBe(2);
  });

  it("ignores unrelated keys and invalid tab sets", () => {
    expect(nextRovingTabIndex(1, 3, "ArrowDown")).toBeNull();
    expect(nextRovingTabIndex(-1, 3, "ArrowRight")).toBeNull();
    expect(nextRovingTabIndex(0, 0, "ArrowRight")).toBeNull();
  });
});
