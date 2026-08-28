import { useCallback, useEffect, useRef, useState } from "react";

export type ClipboardCopyState = "idle" | "copied" | "error";

export function useClipboardCopy(resetKey?: unknown, resetDelay = 1_500) {
  const [state, setState] = useState<ClipboardCopyState>("idle");
  const resetTimer = useRef<number | undefined>(undefined);

  const reset = useCallback(() => {
    window.clearTimeout(resetTimer.current);
    resetTimer.current = undefined;
    setState("idle");
  }, []);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);
  useEffect(() => reset(), [reset, resetKey]);

  const copy = useCallback(async (value: string) => {
    window.clearTimeout(resetTimer.current);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("error");
    }
    resetTimer.current = window.setTimeout(() => setState("idle"), resetDelay);
  }, [resetDelay]);

  return { copy, state };
}
