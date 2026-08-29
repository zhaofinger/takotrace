import { fetchSubagentThread } from "./client";
import type { SubagentDetail } from "./types";

export type SubagentDetailSnapshot =
  | { status: "idle" }
  | { status: "loading" }
  | ({ status: "success" } & SubagentDetail)
  | { status: "error"; error: string };

const idleSnapshot: SubagentDetailSnapshot = { status: "idle" };
const entries = new Map<string, SubagentDetailSnapshot>();
const inFlight = new Map<string, Promise<SubagentDetail>>();
const listeners = new Map<string, Set<() => void>>();

export function getSubagentDetailSnapshot(threadId: string): SubagentDetailSnapshot {
  return entries.get(threadId) ?? idleSnapshot;
}

export function subscribeToSubagentDetail(threadId: string, listener: () => void): () => void {
  const targetListeners = listeners.get(threadId) ?? new Set<() => void>();
  targetListeners.add(listener);
  listeners.set(threadId, targetListeners);
  return () => {
    targetListeners.delete(listener);
    if (targetListeners.size === 0) listeners.delete(threadId);
  };
}

export function loadSubagentDetail(threadId: string, retry = false): Promise<SubagentDetail> {
  const pending = inFlight.get(threadId);
  if (pending) return pending;

  const cached = entries.get(threadId);
  if (!retry && cached?.status === "success") {
    return Promise.resolve({ thread: cached.thread, assignment: cached.assignment });
  }

  setEntry(threadId, { status: "loading" });
  const request = fetchSubagentThread(threadId)
    .then((detail) => {
      setEntry(threadId, { status: "success", ...detail });
      return detail;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      setEntry(threadId, { status: "error", error: message });
      throw error;
    })
    .finally(() => inFlight.delete(threadId));
  inFlight.set(threadId, request);
  return request;
}

function setEntry(threadId: string, entry: SubagentDetailSnapshot): void {
  entries.set(threadId, entry);
  for (const listener of listeners.get(threadId) ?? []) listener();
}

export function resetSubagentDetailCache(): void {
  entries.clear();
  inFlight.clear();
  listeners.clear();
}
