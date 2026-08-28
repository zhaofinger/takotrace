import { useCallback, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import {
  getSubagentDetailSnapshot,
  loadSubagentDetail,
  subscribeToSubagentDetail,
} from "../subagent-detail-store";
import type { ThreadDetail, TraceEvent } from "../types";
import { MarkdownContent } from "./MarkdownContent";
import { StatusMark } from "./StatusMark";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function rawItem(event: TraceEvent): RecordValue {
  const raw = record(event.raw);
  const item = record(record(raw.params).item);
  return Object.keys(item).length ? item : raw;
}

function normalizedType(event: TraceEvent): string {
  return (text(rawItem(event).type) ?? event.type).toLowerCase().replaceAll(/[^a-z]/g, "");
}

export function subagentTargetThreadIds(raw: RecordValue): string[] {
  const values = [raw.agentThreadId, ...(Array.isArray(raw.receiverThreadIds) ? raw.receiverThreadIds : [])];
  return [...new Set(values.flatMap((value) => text(value) ? [text(value)!] : []))];
}

export function subagentEventLabel(event: TraceEvent): string {
  const raw = rawItem(event);
  const type = normalizedType(event);
  if (type === "usermessage") return "Prompt";
  if (type === "reasoning") return "Reasoning";
  if (type === "agentmessage") {
    const phase = (text(raw.phase) ?? "").toLowerCase().replaceAll(/[^a-z]/g, "");
    return phase === "finalanswer" || phase === "final" ? "Final" : "Commentary";
  }
  if (type === "filechange") return "Files";
  if (event.status === "error" || event.status === "failed") return "Error";
  if (["commandexecution", "mcptoolcall", "collabagenttoolcall", "subagentactivity"].includes(type) || type.includes("websearch")) return "Tool";
  return "Event";
}

function visibleItems(thread: ThreadDetail): TraceEvent[] {
  return thread.turns.flatMap((turn) => turn.items);
}

function displaySummary(event: TraceEvent): string {
  const raw = rawItem(event);
  const reasoning = Array.isArray(raw.summary)
    ? raw.summary.flatMap((entry) => text(entry) ? [text(entry)!] : []).join("\n")
    : text(raw.summary);
  return text(raw.text) ?? text(raw.command) ?? text(raw.error) ?? reasoning ?? event.summary;
}

export function SubagentThreadContent({
  thread,
  renderEventDetails,
  onRefresh,
}: {
  thread: ThreadDetail;
  renderEventDetails?: (event: TraceEvent) => ReactNode;
  onRefresh?: () => void;
}) {
  const items = visibleItems(thread);
  const itemCount = thread.turns.reduce((total, turn) => total + turn.items.length, 0);
  return (
    <section className="vbg-custom-subagent-thread" aria-label={`Subagent ${thread.id} details`}>
      <header>
        <div>
          <strong>{thread.agentNickname ?? thread.title ?? "Subagent"}</strong>
          <code title={thread.id}>{thread.id}</code>
        </div>
        <div className="vbg-custom-subagent-thread__actions">
          <StatusMark status={thread.status} />
          {onRefresh && <button onClick={onRefresh} type="button">Refresh</button>}
        </div>
      </header>
      <dl className="vbg-custom-subagent-thread__meta">
        {thread.agentRole && <div><dt>Role</dt><dd>{thread.agentRole}</dd></div>}
        {thread.agentPath && <div><dt>Path</dt><dd><code>{thread.agentPath}</code></dd></div>}
        {thread.modelProvider && <div><dt>Provider</dt><dd>{thread.modelProvider}</dd></div>}
        {thread.depth !== undefined && <div><dt>Depth</dt><dd>{thread.depth}</dd></div>}
        <div><dt>Runs</dt><dd>{thread.turns.length}</dd></div>
        <div><dt>Steps</dt><dd>{itemCount}</dd></div>
      </dl>
      {items.length > 0 ? (
        <ol className="vbg-custom-subagent-events">
          {items.map((event) => (
            <li key={`${event.turnId ?? "turn"}-${event.itemId ?? event.seq}-${event.seq}`}>
              <details>
                <summary>
                  <span>{subagentEventLabel(event)}</span>
                  <strong>{displaySummary(event)}</strong>
                  <StatusMark label={false} status={event.status} />
                </summary>
                <SubagentEventBody event={event} renderEventDetails={renderEventDetails} />
              </details>
            </li>
          ))}
        </ol>
      ) : <p className="vbg-custom-subagent-thread__empty">No prompt, messages, or execution events.</p>}
    </section>
  );
}

function SubagentEventBody({
  event,
  renderEventDetails,
}: {
  event: TraceEvent;
  renderEventDetails?: (event: TraceEvent) => ReactNode;
}) {
  const type = normalizedType(event);
  if (type === "usermessage" || type === "agentmessage" || type === "reasoning" || event.status === "error" || event.status === "failed") {
    return <div className="vbg-custom-subagent-event__body"><MarkdownContent>{displaySummary(event)}</MarkdownContent></div>;
  }
  return (
    <div className="vbg-custom-subagent-event__body">
      {renderEventDetails?.(event) ?? <MarkdownContent>{event.summary}</MarkdownContent>}
    </div>
  );
}

function TargetThread({
  threadId,
  renderEventDetails,
}: {
  threadId: string;
  renderEventDetails?: (event: TraceEvent) => ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);
  const subscribe = useCallback((listener: () => void) => subscribeToSubagentDetail(threadId, listener), [threadId]);
  const snapshot = useSyncExternalStore(subscribe, () => getSubagentDetailSnapshot(threadId), () => getSubagentDetailSnapshot(threadId));

  const load = (retry = false) => {
    setRevealed(true);
    void loadSubagentDetail(threadId, retry).catch(() => undefined);
  };

  if (!revealed) {
    return (
      <button className="vbg-custom-subagent-load" onClick={() => load()} type="button">
        Load details <code>{threadId}</code>
      </button>
    );
  }
  if (snapshot.status === "loading" || snapshot.status === "idle") {
    return <p aria-live="polite" className="vbg-custom-subagent-loading">Loading <code>{threadId}</code>…</p>;
  }
  if (snapshot.status === "error") {
    return (
      <div className="vbg-custom-subagent-load-error" role="alert">
        <span>{snapshot.error}</span>
        <button onClick={() => load(true)} type="button">Retry</button>
      </div>
    );
  }
  return (
    <SubagentThreadContent
      onRefresh={() => load(true)}
      renderEventDetails={renderEventDetails}
      thread={snapshot.thread}
    />
  );
}

export function SubagentThreadDetails({
  raw,
  renderEventDetails,
}: {
  raw: RecordValue;
  renderEventDetails?: (event: TraceEvent) => ReactNode;
}) {
  const threadIds = subagentTargetThreadIds(raw);
  if (threadIds.length === 0) return null;
  return (
    <div className="vbg-custom-subagent-targets" aria-label="Subagent session details">
      {threadIds.map((threadId) => (
        <TargetThread key={threadId} renderEventDetails={renderEventDetails} threadId={threadId} />
      ))}
    </div>
  );
}
