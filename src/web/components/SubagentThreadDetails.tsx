import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import {
  getSubagentDetailSnapshot,
  loadSubagentDetail,
  subscribeToSubagentDetail,
} from "../subagent-detail-store";
import { formatDuration } from "../formatters";
import type { SubagentAssignment, ThreadDetail, TraceEvent } from "../types";
import { eventRaw, normalizedEventType } from "../trace-event";
import { nonEmptyText as text, type UnknownRecord } from "../value-utils";
import type { SubagentDetailView } from "./EventDetails";
import { MarkdownContent } from "./MarkdownContent";
import { LoadingState } from "./LoadingState";
import { StatusMark } from "./StatusMark";

type RecordValue = UnknownRecord;

export function subagentTargetThreadIds(raw: RecordValue): string[] {
  const receiverIds = Array.isArray(raw.receiverThreadIds) ? raw.receiverThreadIds
    : Array.isArray(raw.receiver_thread_ids) ? raw.receiver_thread_ids : [];
  const values = [raw.agentThreadId, raw.agent_thread_id, ...receiverIds];
  return [...new Set(values.flatMap((value) => text(value) ? [text(value)!] : []))];
}

export function subagentEventLabel(event: TraceEvent): string {
  const raw = eventRaw(event);
  const type = normalizedEventType(event);
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

function displaySummary(event: TraceEvent): string {
  const raw = eventRaw(event);
  const reasoning = Array.isArray(raw.summary)
    ? raw.summary.flatMap((entry) => text(entry) ? [text(entry)!] : []).join("\n")
    : text(raw.summary);
  return text(raw.text) ?? text(raw.command) ?? text(raw.error) ?? reasoning ?? event.summary;
}

function compactSummary(value: string, maximum = 1_200): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum)}\n…`;
}

function isFinalAgentMessage(event: TraceEvent): boolean {
  if (normalizedEventType(event) !== "agentmessage") return false;
  const phase = (text(eventRaw(event).phase) ?? "").toLowerCase().replaceAll(/[^a-z]/g, "");
  return phase === "finalanswer" || phase === "final";
}

export function subagentThreadSummary(
  thread: ThreadDetail,
  fallbackInput?: string,
  assignment?: SubagentAssignment,
): { assignedTask?: string; result?: string } {
  const items = thread.turns.at(-1)?.items ?? [];
  const input = items.find((event) => normalizedEventType(event) === "usermessage");
  const reversed = [...items].reverse();
  const result = reversed.find(isFinalAgentMessage)
    ?? reversed.find((event) => event.status === "error" || event.status === "failed")
    ?? reversed.find((event) => normalizedEventType(event) === "agentmessage");
  return {
    assignedTask: input
      ? compactSummary(displaySummary(input))
      : fallbackInput
        ? compactSummary(fallbackInput)
        : assignment?.availability === "available" && assignment.text
          ? compactSummary(assignment.text)
          : undefined,
    result: result ? compactSummary(displaySummary(result)) : undefined,
  };
}

const TERMINAL_SUBAGENT_STATUSES = new Set([
  "blocked",
  "cancelled",
  "canceled",
  "complete",
  "completed",
  "disconnected",
  "error",
  "failed",
  "interrupted",
]);

function isActiveSubagentStatus(status: string): boolean {
  return !TERMINAL_SUBAGENT_STATUSES.has(status.toLowerCase());
}

export function subagentDisplayStatus(thread: ThreadDetail): string {
  return thread.turns.at(-1)?.status || thread.status;
}

export function subagentThreadOverview(thread: ThreadDetail): {
  active: boolean;
  durationMs?: number;
  latestActivity?: string;
  steps: number;
} {
  const turn = thread.turns.at(-1);
  const items = turn?.items ?? [];
  const active = isActiveSubagentStatus(subagentDisplayStatus(thread));
  const startedAt = turn?.startedAt ? Date.parse(turn.startedAt) : undefined;
  const completedAt = turn?.completedAt ? Date.parse(turn.completedAt) : undefined;
  const timestampDuration = typeof startedAt === "number" && Number.isFinite(startedAt)
    && typeof completedAt === "number" && Number.isFinite(completedAt)
    ? completedAt - startedAt
    : undefined;
  const inferredDuration = timestampDuration !== undefined && timestampDuration >= 0
    ? timestampDuration
    : undefined;
  const latestEvent = [...items].reverse().find((event) => (
    normalizedEventType(event) !== "usermessage" && text(displaySummary(event))
  ));
  return {
    active,
    durationMs: turn?.durationMs ?? inferredDuration,
    latestActivity: latestEvent ? compactSummary(displaySummary(latestEvent)) : undefined,
    steps: items.length,
  };
}

export function SubagentThreadContent({
  assignment,
  detailView = "trace",
  fallbackInput,
  thread,
  onOpenThread,
}: {
  assignment?: SubagentAssignment;
  detailView?: SubagentDetailView;
  fallbackInput?: string;
  thread: ThreadDetail;
  onOpenThread?: (thread: ThreadDetail) => void;
}) {
  const summary = subagentThreadSummary(thread, fallbackInput, assignment);
  const overview = subagentThreadOverview(thread);
  const displayStatus = subagentDisplayStatus(thread);
  const model = thread.turns.at(-1)?.model;
  const identityMeta = [thread.agentRole, thread.agentPath].filter(Boolean);
  const activity = overview.active ? overview.latestActivity : summary.result;
  return (
    <div className="vbg-custom-subagent-thread-wrap">
      {model && (
        <dl className="vbg-custom-subagent-thread__model">
          <dt>Model</dt>
          <dd><code className="vbg-custom-model-name" title={model}>{model}</code></dd>
        </dl>
      )}
      <section className="vbg-custom-subagent-thread" aria-label={`Subagent ${thread.id} details`}>
        <header>
          <div className="vbg-custom-subagent-thread__identity">
            <strong>{thread.agentNickname ?? thread.title ?? "Subagent"}</strong>
            {identityMeta.length > 0 && (
              <span title={identityMeta.join(" · ")}>
                {thread.agentRole && <span>{thread.agentRole}</span>}
                {thread.agentRole && thread.agentPath && <span aria-hidden="true">·</span>}
                {thread.agentPath && <code>{thread.agentPath}</code>}
              </span>
            )}
          </div>
          <div className="vbg-custom-subagent-thread__actions">
            <StatusMark status={displayStatus} />
            {onOpenThread && thread.turns.length > 0 && (
              <button onClick={() => onOpenThread(thread)} type="button">Open {detailView}</button>
            )}
          </div>
        </header>
        <dl className="vbg-custom-subagent-thread__run-meta">
          <div><dt>Duration</dt><dd>{formatDuration(overview.durationMs)}</dd></div>
          <div><dt>Steps</dt><dd>{overview.steps}</dd></div>
        </dl>
        {(assignment?.taskName || assignment?.agentType || assignment?.forkTurns) && (
          <dl className="vbg-custom-subagent-thread__run-meta">
            {assignment.taskName && <div><dt>Task name</dt><dd title={assignment.taskName}>{assignment.taskName}</dd></div>}
            {assignment.agentType && <div><dt>Agent type</dt><dd title={assignment.agentType}>{assignment.agentType}</dd></div>}
            {assignment.forkTurns && <div><dt>Fork turns</dt><dd title={assignment.forkTurns}>{assignment.forkTurns}</dd></div>}
          </dl>
        )}
        {(summary.assignedTask || activity) && (
          <div className="vbg-custom-subagent-thread__summary">
            {summary.assignedTask && (
              <section>
                <h4>Assigned task</h4>
                <MarkdownContent>{summary.assignedTask}</MarkdownContent>
              </section>
            )}
            {activity && (
              <section>
                <h4>{overview.active ? "Latest activity" : "Result"}</h4>
                <MarkdownContent>{activity}</MarkdownContent>
              </section>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export function SubagentEventList({
  items,
  renderEventDetails,
}: {
  items: TraceEvent[];
  renderEventDetails?: (event: TraceEvent) => ReactNode;
}) {
  return items.length > 0 ? (
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
  ) : <p className="vbg-custom-subagent-thread__empty">No prompt, messages, or execution events.</p>;
}

function SubagentEventBody({
  event,
  renderEventDetails,
}: {
  event: TraceEvent;
  renderEventDetails?: (event: TraceEvent) => ReactNode;
}) {
  const type = normalizedEventType(event);
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
  autoLoad,
  detailView,
  fallbackInput,
  threadId,
  onOpenThread,
}: {
  autoLoad: boolean;
  detailView: SubagentDetailView;
  fallbackInput?: string;
  threadId: string;
  onOpenThread?: (thread: ThreadDetail) => void;
}) {
  const [revealed, setRevealed] = useState(() => autoLoad || getSubagentDetailSnapshot(threadId).status === "success");
  const subscribe = useCallback((listener: () => void) => subscribeToSubagentDetail(threadId, listener), [threadId]);
  const snapshot = useSyncExternalStore(subscribe, () => getSubagentDetailSnapshot(threadId), () => getSubagentDetailSnapshot(threadId));

  const load = (retry = false) => {
    setRevealed(true);
    void loadSubagentDetail(threadId, retry).catch(() => undefined);
  };

  useEffect(() => {
    if (!autoLoad || snapshot.status !== "idle") return;
    void loadSubagentDetail(threadId).catch(() => undefined);
  }, [autoLoad, snapshot.status, threadId]);

  if (!revealed) {
    return (
      <button className="vbg-custom-subagent-load" onClick={() => load()} type="button">
        Load assigned task and result <code>{threadId}</code>
      </button>
    );
  }
  if (snapshot.status === "loading" || snapshot.status === "idle") {
    return (
      <LoadingState
        className="vbg-custom-subagent-loading"
        label="Loading assigned task and result…"
      />
    );
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
      assignment={snapshot.assignment}
      detailView={detailView}
      fallbackInput={fallbackInput}
      onOpenThread={onOpenThread}
      thread={snapshot.thread}
    />
  );
}

export function SubagentThreadDetails({
  autoLoad = false,
  detailView = "trace",
  fallbackInput,
  raw,
  onOpenThread,
}: {
  autoLoad?: boolean;
  detailView?: SubagentDetailView;
  fallbackInput?: string;
  raw: RecordValue;
  onOpenThread?: (thread: ThreadDetail) => void;
}) {
  const threadIds = subagentTargetThreadIds(raw);
  if (threadIds.length === 0) return null;
  return (
    <div className="vbg-custom-subagent-targets" aria-label="Subagent session details">
      {threadIds.map((threadId) => (
        <TargetThread
          autoLoad={autoLoad}
          detailView={detailView}
          fallbackInput={fallbackInput}
          key={threadId}
          onOpenThread={onOpenThread}
          threadId={threadId}
        />
      ))}
    </div>
  );
}
