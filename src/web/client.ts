import type { AppState, SnapshotEvent, ThreadDetail, TraceEvent, Turn } from "./types";

export async function fetchState(signal?: AbortSignal): Promise<AppState> {
  const response = await fetch("/api/state", { signal });
  if (!response.ok) {
    throw new Error(`State request failed (${response.status})`);
  }
  return response.json() as Promise<AppState>;
}

export async function syncThread(threadId: string): Promise<void> {
  const response = await fetch(`/api/threads/${encodeURIComponent(threadId)}/sync`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response, `Thread sync failed (${response.status})`));
  }
}

export async function fetchTurnDetail(
  threadId: string,
  turnId: string,
  signal?: AbortSignal,
): Promise<Turn> {
  const response = await fetch(
    `/api/threads/${encodeURIComponent(threadId)}/turns/${encodeURIComponent(turnId)}`,
    { signal },
  );
  if (!response.ok) {
    throw new Error(`Turn detail request failed (${response.status})`);
  }
  const payload = await response.json() as Turn | { turn: Turn };
  return "turn" in payload ? payload.turn : payload;
}

export async function fetchSubagentThread(threadId: string): Promise<ThreadDetail> {
  const response = await fetch(`/api/subagents/${encodeURIComponent(threadId)}`);
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response, `Subagent request failed (${response.status})`));
  }
  const payload = await response.json() as { thread: ThreadDetail };
  return payload.thread;
}

async function responseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: { message?: unknown } };
    if (typeof payload.error?.message === "string" && payload.error.message.trim()) {
      return payload.error.message.trim();
    }
  } catch {
    // Keep the status-based fallback when the response is not JSON.
  }
  return fallback;
}

export function subscribeToEvents({
  onEvent,
  onError,
  onOpen,
}: {
  onEvent: (event: TraceEvent | SnapshotEvent) => void;
  onError: () => void;
  onOpen: () => void;
}): () => void {
  const source = new EventSource("/api/events");
  source.onopen = onOpen;
  source.onerror = onError;
  source.onmessage = (message) => {
    try {
      onEvent(JSON.parse(message.data) as TraceEvent | SnapshotEvent);
    } catch {
      onError();
    }
  };
  return () => source.close();
}
