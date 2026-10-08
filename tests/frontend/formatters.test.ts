import { describe, expect, it } from "vitest";
import {
  formatFileSize,
  formatCompactDuration,
  formatDateTime,
  formatDateTimeWithMilliseconds,
  formatDuration,
  formatExactNumber,
  formatPercentage,
  formatShortId,
  formatTokenCount,
  projectName,
} from "../../src/web/formatters";

describe("shared display formatters", () => {
  it('formats local bytes with binary units and keeps unknown distinct from zero', () => {
    expect(formatFileSize()).toBe('—');
    expect(formatFileSize(-1)).toBe('—');
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1023)).toBe('1023 B');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(1024 ** 2)).toBe('1 MB');
    expect(formatFileSize(1024 ** 3)).toBe('1 GB');
  });

  it("keeps compact and exact numeric formats distinct", () => {
    expect(formatTokenCount(16_000_000)).toBe("16M");
    expect(formatExactNumber(16_000_000)).toBe("16,000,000");
    expect(formatPercentage(0.635)).toBe("63.5%");
  });

  it("preserves long and compact duration semantics", () => {
    expect(formatDuration()).toBe("—");
    expect(formatDuration(61_000)).toBe("1m 1s");
    expect(formatCompactDuration()).toBeUndefined();
    expect(formatCompactDuration(9_500)).toBe("9.5s");
    expect(formatCompactDuration(12_500)).toBe("13s");
  });

  it("handles identifiers, paths, and invalid dates without hiding source values", () => {
    expect(formatShortId("01a0461b-1dd3")).toBe("01a0461b…");
    expect(projectName("/Users/example/thread-scope/")).toBe("thread-scope");
    expect(projectName()).toBe("Unknown project");
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
    expect(formatDateTimeWithMilliseconds("not-a-date")).toBe("not-a-date");
  });

  it("keeps the local date visible for precise execution timestamps", () => {
    expect(formatDateTimeWithMilliseconds("2026-08-29T00:04:01.954")).toBe("2026-08-29 00:04:01.954");
  });
});
