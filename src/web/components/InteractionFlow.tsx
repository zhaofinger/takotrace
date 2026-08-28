import { useMemo } from "react";
import type { CompactTraceEvent, TraceEvent } from "../types";
import { formatClockTimeWithMilliseconds } from "../formatters";
import { eventRaw } from "../trace-event";
import { asRecord as record, nonEmptyText as text, normalizedToken } from "../value-utils";
import { EventDetails } from "./EventDetails";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { commandText, workingDirectoryText } from "./command-display";
import { nodeReplExecution } from "./mcp-execution";
import { inferredSkillLoad } from "./skill-display";
import { StatusMark } from "./StatusMark";

export type FlowEvent = CompactTraceEvent | TraceEvent;
export type FlowKind = "user" | "agent" | "reasoning" | "skill" | "mcp" | "tool" | "subagent" | "file" | "web" | "system";
type FlowLane = "user" | "agent" | "tool" | "subagent";

const FLOW_LANES: Array<{ key: FlowLane; label: string }> = [
  { key: "user", label: "Input" },
  { key: "agent", label: "Agent" },
  { key: "tool", label: "Tools" },
  { key: "subagent", label: "Subagents" },
];

export interface FlowNode {
  kind: FlowKind;
  label: string;
  title: string;
  participantName?: string;
  detail: string;
  meta?: string;
  showStatus?: boolean;
  sequenceDirection?: "call" | "return";
}

function subagentName(raw: Record<string, unknown>): string | undefined {
  const agents = Array.isArray(raw.receiverAgents)
    ? raw.receiverAgents
    : Array.isArray(raw.receiver_agents)
      ? raw.receiver_agents
      : [];
  const namedAgent = agents.map(record).map((agent) => (
    text(agent.agentNickname)
    ?? text(agent.agent_nickname)
    ?? text(agent.agentPath)
    ?? text(agent.agent_path)
  )).find(Boolean);
  const path = namedAgent ?? text(raw.agentPath) ?? text(raw.agent_path);
  return path?.split("/").filter(Boolean).pop();
}

function userText(raw: Record<string, unknown>): string | undefined {
  const content = raw.content;
  if (!Array.isArray(content)) return undefined;
  const value = content.map((entry) => text(record(entry).text)).filter(Boolean).join("\n\n");
  const marker = "## My request:";
  const markerIndex = value.indexOf(marker);
  return (markerIndex >= 0 ? value.slice(markerIndex + marker.length) : value).trim() || undefined;
}

function reasoningText(raw: Record<string, unknown>): string | undefined {
  if (!Array.isArray(raw.summary)) return undefined;
  return raw.summary.map(text).filter(Boolean).join("\n") || undefined;
}

function jsonPreview(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized.length > 1_200 ? `${serialized.slice(0, 1_200)}\n…` : serialized;
  } catch {
    return String(value);
  }
}

function fileChanges(raw: Record<string, unknown>): string | undefined {
  const changes = Array.isArray(raw.changes)
    ? raw.changes.map((entry) => {
      const change = record(entry);
      const kind = text(record(change.kind).type) ?? text(change.kind) ?? text(change.type) ?? "changed";
      const path = text(change.path);
      return path ? `${kind} · ${path}` : undefined;
    })
    : Object.entries(record(raw.changes)).map(([path, value]) => {
      const change = record(value);
      const kind = text(change.type) ?? text(record(change.kind).type) ?? text(change.kind) ?? "changed";
      return `${kind} · ${path}`;
    });
  return changes.join("\n") || undefined;
}

export function flowNode(event: FlowEvent): FlowNode {
  const raw = eventRaw(event);
  const rawType = text(raw.type);
  let type = (rawType ?? event.type).toLowerCase();
  if (type === "item") {
    if (event.method.includes("agentMessage")) type = "agentmessage";
    else if (event.method.includes("reasoning")) type = "reasoning";
    else if (event.method.includes("commandExecution")) type = "commandexecution";
    else if (event.method.includes("mcpToolCall")) type = "mcptoolcall";
  }
  const fallback = event.summary && event.summary !== "item started" && event.summary !== "item completed"
    ? event.summary
    : "No additional detail";

  if (type === "usermessage") {
    return { kind: "user", label: "User", title: "Request", detail: userText(raw) ?? fallback };
  }
  if (type === "agentmessage") {
    const phase = text(raw.phase);
    const title = phase === "commentary" ? "Update" : phase === "final_answer" ? "Final response" : "Message";
    return { kind: "agent", label: "Agent", title, detail: text(raw.text) ?? fallback, meta: phase };
  }
  if (type === "reasoning") {
    return { kind: "reasoning", label: "Agent", title: "Reasoning", detail: reasoningText(raw) ?? fallback };
  }
  if (type === "subagentactivity") {
    const kind = text(raw.kind) ?? "activity";
    const normalizedKind = normalizedToken(kind);
    const path = text(raw.agentPath) ?? text(raw.agent_path) ?? "Subagent";
    const name = subagentName(raw) ?? "Subagent";
    const activity = ({
      started: { label: "Start", title: "Started", direction: "call" },
      interacted: { label: "Update", title: "Update", direction: "return" },
      completed: { label: "Result", title: "Result", direction: "return" },
      interrupted: { label: "Interrupted", title: "Interrupted", direction: "return" },
      failed: { label: "Failed", title: "Failed", direction: "return" },
    } as Record<string, { label: string; title: string; direction: "call" | "return" }>)[normalizedKind];
    const fallbackTitle = `${kind[0].toUpperCase()}${kind.slice(1)}`;
    return {
      kind: "subagent",
      label: activity?.label ?? "Subagent",
      title: `${activity?.title ?? fallbackTitle} · ${name}`,
      detail: path,
      meta: text(raw.agentThreadId) ?? text(raw.agent_thread_id),
      sequenceDirection: activity?.direction ?? "call",
    };
  }
  if (type === "collabagenttoolcall") {
    const tool = text(raw.tool) ?? "collaboration";
    const normalizedTool = normalizedToken(tool);
    const action = ({
      spawnagent: "Fork",
      sendinput: "Message",
      sendmessage: "Message",
      followuptask: "Message",
      resumeagent: "Resume",
      wait: "Join",
      waitagent: "Join",
      interruptagent: "Interrupt",
      closeagent: "Close",
    } as Record<string, string>)[normalizedTool] ?? tool;
    const receiverValues = Array.isArray(raw.receiverThreadIds)
      ? raw.receiverThreadIds
      : Array.isArray(raw.receiver_thread_ids)
        ? raw.receiver_thread_ids
        : [];
    const receivers = receiverValues.filter((value): value is string => typeof value === "string");
    const name = subagentName(raw);
    const target = name ?? (receivers.length > 1 ? `${receivers.length} subagents` : undefined);
    const title = action === "Join"
      ? target ? `Join · ${target}` : "Join subagents"
      : target ? `${action} · ${target}` : action;
    return {
      kind: "subagent",
      label: action,
      title,
      detail: text(raw.prompt) ?? (receivers.length ? `Targets: ${receivers.join(", ")}` : fallback),
      meta: text(raw.model) ?? undefined,
      showStatus: true,
      sequenceDirection: "call",
    };
  }
  if (type === "commandexecution") {
    const exitCode = typeof raw.exitCode === "number" ? `exit ${raw.exitCode}` : undefined;
    const command = commandText(raw.command);
    const skillLoad = inferredSkillLoad(raw);
    if (skillLoad) {
      return {
        kind: "skill",
        label: "Skill",
        title: skillLoad.displayTitle,
        detail: command ?? fallback,
        meta: [workingDirectoryText(raw.cwd), exitCode].filter(Boolean).join(" · ") || undefined,
        showStatus: true,
      };
    }
    const title = command ? `Shell · ${command.split("\n", 1)[0].slice(0, 112)}` : "Shell";
    return { kind: "tool", label: "Tool", title, detail: command ?? fallback, meta: [workingDirectoryText(raw.cwd), exitCode].filter(Boolean).join(" · ") || undefined, showStatus: true };
  }
  if (type.includes("skill")) {
    const name = text(raw.name) ?? text(raw.skill) ?? event.summary ?? "Skill";
    return { kind: "skill", label: "Skill", title: `Skill · ${name}`, detail: text(raw.prompt) ?? text(raw.path) ?? fallback, showStatus: true };
  }
  if (type === "mcptoolcall") {
    const server = text(raw.server);
    const tool = text(raw.tool) ?? event.summary ?? "MCP tool";
    const execution = nodeReplExecution(raw);
    return { kind: "mcp", label: "MCP", title: execution?.displayTitle ?? [server, tool].filter(Boolean).join(" · "), participantName: server, detail: jsonPreview(raw.arguments) ?? fallback, showStatus: true };
  }
  if (type === "filechange") {
    return { kind: "file", label: "Tool", title: "File change", detail: fileChanges(raw) ?? fallback, showStatus: true };
  }
  if (type.includes("websearch")) {
    return { kind: "web", label: "Tool", title: "Web search", detail: fallback, showStatus: true };
  }
  if (type.includes("tool") || type.includes("image") || type.includes("browser")) {
    return { kind: "tool", label: "Tool", title: event.type, detail: fallback, showStatus: true };
  }
  return { kind: "system", label: "System", title: event.type || event.method, detail: fallback };
}

export function mergeFlowEvents(items: FlowEvent[]): FlowEvent[] {
  const merged = new Map<string, FlowEvent>();
  for (const input of items) {
    const isStarted = input.method.includes("started");
    const isCompleted = input.method.includes("completed") || input.method.includes("failed");
    const event: FlowEvent = {
      ...input,
      startedSeq: input.startedSeq ?? (isStarted ? input.seq : undefined),
      completedSeq: input.completedSeq ?? (isCompleted ? input.seq : undefined),
      startedAt: input.startedAt ?? (isStarted ? input.at : undefined),
      completedAt: input.completedAt ?? (isCompleted ? input.at : undefined),
    };
    const key = event.itemId
      ? `item:${event.threadId}:${event.turnId ?? ""}:${event.itemId}`
      : `event:${event.threadId}:${event.turnId ?? ""}:${event.seq}`;
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, event);
      continue;
    }
    const eventIsFinal = event.method.includes("completed") || event.method.includes("failed");
    const previousIsFinal = previous.method.includes("completed") || previous.method.includes("failed");
    const primary = eventIsFinal || !previousIsFinal ? event : previous;
    const secondary = primary === event ? previous : event;
    merged.set(key, {
      ...secondary,
      ...primary,
      seq: Math.min(previous.seq, event.seq),
      at: previous.at < event.at ? previous.at : event.at,
      startedSeq: previous.startedSeq ?? event.startedSeq,
      completedSeq: event.completedSeq ?? previous.completedSeq,
      startedAt: previous.startedAt ?? event.startedAt,
      completedAt: event.completedAt ?? previous.completedAt,
      parentItemId: event.parentItemId ?? previous.parentItemId,
      durationMs: event.durationMs ?? previous.durationMs,
    } as FlowEvent);
  }
  return [...merged.values()].sort((left, right) => left.seq - right.seq);
}

export function flowKindIconName(kind: FlowKind): IconName {
  if (kind === "user") return "user";
  if (kind === "agent" || kind === "reasoning") return "agent";
  if (kind === "mcp") return "mcp";
  if (kind === "subagent") return "subagent";
  if (kind === "skill") return "skill";
  if (kind === "file") return "file";
  if (kind === "web") return "web";
  if (kind === "tool") return "tool";
  return "activity";
}

export function flowLane(kind: FlowKind): FlowLane {
  if (kind === "user") return "user";
  if (kind === "agent" || kind === "reasoning") return "agent";
  if (kind === "subagent") return "subagent";
  return "tool";
}

export function InteractionFlow({ items }: { items: FlowEvent[] }) {
  const nodes = useMemo(
    () => mergeFlowEvents(items).map((event) => {
      const node = flowNode(event);
      return { event, node };
    }),
    [items],
  );

  return (
    <section aria-label="Interaction flow" className="vbg-custom-flow">
      <div className="vbg-custom-flow__heading">
        <h3>Structured events</h3>
        <span>{nodes.length} events</span>
      </div>
      <ol className="vbg-custom-flow__list">
        {nodes.map(({ event, node }, index) => (
          <li
            aria-label={`${node.label}: ${node.title}`}
            className={`vbg-custom-flow-node vbg-custom-flow-node--${node.kind}`}
            key={event.seq}
          >
            <div className="vbg-custom-flow-node__rail"><span><Icon name={flowKindIconName(node.kind)} /></span></div>
            <article>
              <header>
                <span className="vbg-custom-flow-node__step">{index + 1}</span>
                <span className="vbg-custom-flow-node__label">{node.label}</span>
                <strong>{node.title}</strong>
                <time dateTime={event.at}>{formatClockTimeWithMilliseconds(event.at)}</time>
              </header>
              <EventDetails event={event} fallback={node.detail} />
              <footer>
                {node.meta && <code>{node.meta}</code>}
                {node.showStatus && <StatusMark status={event.status} />}
                {event.durationMs !== undefined && <span>{event.durationMs}ms</span>}
              </footer>
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}
