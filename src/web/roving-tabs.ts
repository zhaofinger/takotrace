import type { KeyboardEvent } from "react";

export function nextRovingTabIndex(currentIndex: number, total: number, key: string): number | null {
  if (total <= 0 || currentIndex < 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return total - 1;
  if (key === "ArrowRight") return (currentIndex + 1) % total;
  if (key === "ArrowLeft") return (currentIndex - 1 + total) % total;
  return null;
}

export function handleRovingTabKey(event: KeyboardEvent<HTMLButtonElement>): void {
  const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
  const nextIndex = nextRovingTabIndex(tabs.indexOf(event.currentTarget), tabs.length, event.key);
  if (nextIndex === null) return;
  event.preventDefault();
  tabs[nextIndex]?.focus();
  tabs[nextIndex]?.click();
}
