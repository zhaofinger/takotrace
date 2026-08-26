import { useMemo } from "react";
import type { CompactTraceEvent, TraceEvent } from "../types";
import { EventDetails } from "./EventDetails";
import { Icon } from "./Icon";
import { StatusMark } from "./StatusMark";

export type FlowEvent = CompactTraceEvent | TraceEvent;
export type FlowKind = "user" | "agent" | "reasoning" | "skill" | "mcp" | "tool" | "subagent" | "file" | "web" | "system";
type FlowLane = "user" | "agent" | "skill" | "mcp" | "tool" | "subagent";

const FLOW_LANES: Array<{ key: FlowLane; label: string }> = [
  { key: "user", label: "User" },
  { key: "agent", label: "Agent" },
  { key: "skill", label: "Skills" },
  { key: "mcp", label: "MCP" },
  { key: "tool", label: "Tools" },
  { key: "subagent", label: "Subagents" },
];

export interface FlowNode {
  kind: FlowKind;
  label: string;
  title: string;
  detail: string;
  meta?: string;
  showStatus?: boolean;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function rawOf(event: FlowEvent): Record<string, unknown> {
  if (!("raw" in event)) return {};
  const raw = record(event.raw);
  const item = record(record(raw.params).item);
  return Object.keys(item).length ? item : raw;
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
  if (!Array.isArray(raw.changes)) return undefined;
  const changes = raw.changes.map((entry) => {
    const change = record(entry);
    const kind = text(record(change.kind).type) ?? text(change.kind) ?? "changed";
    const path = text(change.path);
    return path ? `${kind} · ${path}` : undefined;
  }).filter(Boolean);
  return changes.join("\n") || undefined;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : `${date.toLocaleTimeString([], { hour12: false })}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

export function flowNode(event: FlowEvent): FlowNode {
  const raw = rawOf(event);
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
    const path = text(raw.agentPath) ?? "Subagent";
    return { kind: "subagent", label: "Subagent", title: `${kind[0].toUpperCase()}${kind.slice(1)} · ${path.split("/").pop()}`, detail: path, meta: text(raw.agentThreadId) };
  }
  if (type === "collabagenttoolcall") {
    const tool = text(raw.tool) ?? "collaboration";
    const action = ({ spawnagent: "Fork", sendinput: "Message", resumeagent: "Resume", wait: "Join", closeagent: "Close" } as Record<string, string>)[tool.toLowerCase()] ?? tool;
    const receivers = Array.isArray(raw.receiverThreadIds) ? raw.receiverThreadIds.filter((value): value is string => typeof value === "string") : [];
    return {
      kind: "subagent",
      label: action,
      title: "Subagent · collaboration",
      detail: text(raw.prompt) ?? (receivers.length ? `Targets: ${receivers.join(", ")}` : fallback),
      meta: text(raw.model) ?? undefined,
      showStatus: true,
    };
  }
  if (type === "commandexecution") {
    const exitCode = typeof raw.exitCode === "number" ? `exit ${raw.exitCode}` : undefined;
    const command = text(raw.command);
    const title = command ? command.split("\n", 1)[0].slice(0, 120) : "Command";
    return { kind: "tool", label: "Tool", title, detail: command ?? fallback, meta: [text(raw.cwd), exitCode].filter(Boolean).join(" · ") || undefined, showStatus: true };
  }
  if (type.includes("skill")) {
    const name = text(raw.name) ?? text(raw.skill) ?? event.summary ?? "Skill";
    return { kind: "skill", label: "Skill", title: name, detail: text(raw.prompt) ?? text(raw.path) ?? fallback, showStatus: true };
  }
  if (type === "mcptoolcall") {
    const server = text(raw.server);
    const tool = text(raw.tool) ?? event.summary ?? "MCP tool";
    return { kind: "mcp", label: "MCP", title: [server, tool].filter(Boolean).join(" · "), detail: jsonPreview(raw.arguments) ?? fallback, showStatus: true };
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
    const event: FlowEvent = {
      ...input,
      startedAt: input.startedAt ?? (input.method.includes("started") ? input.at : undefined),
      completedAt: input.completedAt ?? (input.method.includes("completed") || input.method.includes("failed") ? input.at : undefined),
    };
    const key = event.itemId ? `item:${event.itemId}` : `event:${event.seq}`;
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
      startedAt: previous.startedAt ?? event.startedAt,
      completedAt: event.completedAt ?? previous.completedAt,
      parentItemId: event.parentItemId ?? previous.parentItemId,
      durationMs: event.durationMs ?? previous.durationMs,
    } as FlowEvent);
  }
  return [...merged.values()].sort((left, right) => left.seq - right.seq);
}

function iconName(kind: FlowKind): "activity" | "chevron" | "code" | "message" | "search" | "tool" {
  if (kind === "user" || kind === "agent") return "message";
  if (kind === "reasoning") return "activity";
  if (kind === "subagent") return "chevron";
  if (kind === "skill") return "code";
  if (kind === "file") return "code";
  if (kind === "web") return "search";
  return "tool";
}

export function flowLane(kind: FlowKind): FlowLane {
  if (kind === "user") return "user";
  if (kind === "agent" || kind === "reasoning") return "agent";
  if (kind === "skill") return "skill";
  if (kind === "mcp") return "mcp";
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
            <div className="vbg-custom-flow-node__rail"><span><Icon name={iconName(node.kind)} /></span></div>
            <article>
              <header>
                <span className="vbg-custom-flow-node__step">{index + 1}</span>
                <span className="vbg-custom-flow-node__label">{node.label}</span>
                <strong>{node.title}</strong>
                <time dateTime={event.at}>{formatTime(event.at)}</time>
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
