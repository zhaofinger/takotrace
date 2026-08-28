import type { TraceStatus } from "../types";
import { flowKindIconName, flowNode, mergeFlowEvents } from "./InteractionFlow";
import type { FlowEvent, FlowKind, FlowNode } from "./InteractionFlow";
import type { IconName } from "./Icon";
import { nodeReplExecution } from "./mcp-execution";
import { parallelEvidenceLabel, parallelEventId, parallelExecutionGroups } from "./parallel-execution-model";
import type { ParallelEvidence } from "./parallel-execution-model";

export type SequenceParticipant = "user" | "agent" | "tool" | "mcp" | "subagent";
export type SequenceStepType = "call" | "return" | "self" | "note";

export interface ParticipantInfo {
  key: SequenceParticipant;
  label: string;
  subtext: string;
  iconName: IconName;
}

export const SEQUENCE_PARTICIPANTS: Record<SequenceParticipant, ParticipantInfo> = {
  user: { key: "user", label: "User", subtext: "Prompt / Feedback", iconName: flowKindIconName("user") },
  agent: { key: "agent", label: "Agent", subtext: "Orchestrator", iconName: flowKindIconName("agent") },
  tool: { key: "tool", label: "Tools", subtext: "Shell / Files", iconName: flowKindIconName("tool") },
  mcp: { key: "mcp", label: "MCP", subtext: "Protocol Tools", iconName: flowKindIconName("mcp") },
  subagent: { key: "subagent", label: "Subagent", subtext: "Collaborators", iconName: flowKindIconName("subagent") },
};

export interface SequenceStep {
  id: string;
  seq: number;
  from: SequenceParticipant;
  to: SequenceParticipant;
  toLabel?: string;
  type: SequenceStepType;
  label: string;
  title: string;
  displayIcon?: IconName;
  displayTitle: string;
  detailTitle: string;
  exportTitle: string;
  isCommand: boolean;
  detail: string;
  meta?: string;
  status: TraceStatus;
  durationMs?: number;
  at: string;
  event: FlowEvent;
  node: FlowNode;
  isKey: boolean;
}

export interface SequenceActivation {
  participant: SequenceParticipant;
  startStepIndex: number;
  endStepIndex: number;
  status: TraceStatus;
}

export interface SequenceDiagramModel {
  participants: ParticipantInfo[];
  steps: SequenceStep[];
  activations: SequenceActivation[];
  totalSteps: number;
  visibleSteps: number;
  keyStepsCount: number;
  parallelGroups: SequenceParallelGroup[];
}

export interface SequenceParallelGroup {
  id: string;
  stepIds: string[];
  startStepIndex: number;
  endStepIndex: number;
  maxConcurrency: number;
  evidence: ParallelEvidence;
  label: string;
}

function eventId(event: FlowEvent): string {
  return event.itemId ? `item-${event.itemId}` : `event-${event.seq}`;
}

function participantFromKind(kind: FlowKind): SequenceParticipant {
  if (kind === "user") return "user";
  if (kind === "agent" || kind === "reasoning") return "agent";
  if (kind === "mcp") return "mcp";
  if (kind === "subagent") return "subagent";
  return "tool";
}

const SHELL_WRAPPER = /^(?:(?:\/usr)?\/bin\/)?(?:zsh|bash|sh)\s+-(?:lc|c)\s+/i;

function unwrapShellValue(value: string): string | undefined {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote !== '"' && quote !== "'") || trimmed.at(-1) !== quote) return undefined;
  if (quote === '"') {
    let precedingBackslashes = 0;
    for (let index = trimmed.length - 2; index >= 0 && trimmed[index] === "\\"; index -= 1) precedingBackslashes += 1;
    if (precedingBackslashes % 2 === 1) return undefined;
  }
  const inner = trimmed.slice(1, -1);
  return quote === '"'
    ? inner.replace(/\\(["'\\])/g, "$1")
    : inner.replace(/'\\''/g, "'");
}

function compactEntryPath(command: string): string {
  const match = command.match(
    /^((?:node|cat)\s+)(["']?)([^"'\s]*\/)([^/"'\s]+)\2(?=$|\s)/,
  );
  if (!match || (match[3].match(/\//g)?.length ?? 0) < 2) return command;
  return command.replace(match[0], `${match[1]}${match[2]}…/${match[4]}${match[2]}`);
}

function normalizeShellCommand(command: string): string {
  let normalized = command.trim().split(/\r?\n/, 1)[0] ?? "";
  for (let depth = 0; depth < 4; depth += 1) {
    const wrapper = normalized.match(SHELL_WRAPPER);
    if (!wrapper) break;
    const unwrapped = unwrapShellValue(normalized.slice(wrapper[0].length));
    if (unwrapped === undefined) break;
    normalized = unwrapped;
  }
  return normalized.replace(/\s+/g, " ").trim() || command.trim();
}

export function compactShellCommand(command: string, cwd?: string): string {
  let compact = normalizeShellCommand(command);
  if (cwd?.startsWith("/")) {
    const escapedCwd = cwd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    compact = compact.replace(new RegExp(`${escapedCwd}(?=$|[\\s/"'])`, "g"), ".");
  }
  compact = compact.replace(/\/Users\/[^/\s"'\\]+/g, "~");
  compact = compactEntryPath(compact);
  return compact || command.trim();
}

function isCommandExecution(event: FlowEvent): boolean {
  return event.type.toLowerCase() === "commandexecution"
    || event.method.toLowerCase().includes("commandexecution");
}

function eventPayload(event: FlowEvent): unknown {
  if (!("raw" in event) || !event.raw || typeof event.raw !== "object" || Array.isArray(event.raw)) return undefined;
  const raw = event.raw as Record<string, unknown>;
  const params = raw.params && typeof raw.params === "object" && !Array.isArray(raw.params)
    ? raw.params as Record<string, unknown>
    : undefined;
  const item = params?.item && typeof params.item === "object" && !Array.isArray(params.item)
    ? params.item as Record<string, unknown>
    : undefined;
  return item && Object.keys(item).length ? item : raw;
}

function compactSkillTitle(title: string): string {
  return title
    .replace(/^Skill(?: load)? · /, "")
    .replace(/ \(inferred\)$/, "");
}

function stepDisplay(
  node: FlowNode,
  event: FlowEvent,
): Pick<SequenceStep, "displayIcon" | "displayTitle" | "detailTitle" | "exportTitle" | "isCommand"> {
  const isCommand = node.kind === "tool" && isCommandExecution(event);
  const isSkill = node.kind === "skill";
  const nodeRepl = node.kind === "mcp" ? nodeReplExecution(eventPayload(event)) : undefined;
  const nodeReplIcon: IconName | undefined = nodeRepl?.kind === "browser"
    ? "web"
    : nodeRepl?.kind === "computer-use"
      ? "monitor"
      : nodeRepl?.kind === "javascript"
        ? "braces"
        : undefined;
  const cwd = node.meta?.split(" · ", 1)[0];
  const compactCommand = isCommand ? compactShellCommand(node.detail, cwd) : undefined;
  const detailCommand = isCommand ? normalizeShellCommand(node.detail) : undefined;
  return {
    displayIcon: isCommand ? "terminal" : isSkill ? "skill" : nodeReplIcon,
    displayTitle: compactCommand ?? (isSkill ? compactSkillTitle(node.title) : nodeRepl?.title ?? node.title),
    detailTitle: detailCommand ? `Shell · ${detailCommand}` : node.title,
    exportTitle: compactCommand ? `Shell · ${compactCommand}` : node.title,
    isCommand,
  };
}

export function buildSequenceDiagramModel(
  items: FlowEvent[],
  density: "key" | "all" = "all",
): SequenceDiagramModel {
  const merged = mergeFlowEvents(items).map((event) => ({
    event,
    node: flowNode(event),
  }));

  const steps: SequenceStep[] = [];
  const activeParticipants = new Set<SequenceParticipant>(["user", "agent"]);

  let stepSeq = 1;

  for (const { event, node } of merged) {
    const isReasoningOrSystem = node.kind === "reasoning" || node.kind === "system";
    const isKey = !isReasoningOrSystem;

    if (density === "key" && !isKey) {
      continue;
    }

    if (node.kind === "user") {
      activeParticipants.add("user");
      activeParticipants.add("agent");
      steps.push({
        id: `seq-${eventId(event)}`,
        seq: stepSeq++,
        from: "user",
        to: "agent",
        type: "call",
        label: "User prompt",
        title: node.title,
        ...stepDisplay(node, event),
        detail: node.detail,
        meta: node.meta,
        status: event.status,
        durationMs: event.durationMs,
        at: event.at,
        event,
        node,
        isKey: true,
      });
    } else if (node.kind === "agent") {
      activeParticipants.add("agent");
      activeParticipants.add("user");
      const isFinal = node.meta === "final_answer";
      steps.push({
        id: `seq-${eventId(event)}`,
        seq: stepSeq++,
        from: "agent",
        to: "user",
        type: isFinal ? "return" : "call",
        label: isFinal ? "Final Answer" : "Commentary / Update",
        title: node.title,
        ...stepDisplay(node, event),
        detail: node.detail,
        meta: node.meta,
        status: event.status,
        durationMs: event.durationMs,
        at: event.at,
        event,
        node,
        isKey: true,
      });
    } else if (node.kind === "reasoning" || node.kind === "skill") {
      activeParticipants.add("agent");
      const isSkill = node.kind === "skill";
      steps.push({
        id: `seq-${eventId(event)}`,
        seq: stepSeq++,
        from: "agent",
        to: "agent",
        type: "self",
        label: isSkill ? "Skill load" : "Think & Plan",
        title: node.title,
        ...stepDisplay(node, event),
        detail: node.detail,
        meta: node.meta,
        status: event.status,
        durationMs: event.durationMs,
        at: event.at,
        event,
        node,
        isKey: isSkill,
      });
    } else {
      const targetParticipant = participantFromKind(node.kind);
      activeParticipants.add(targetParticipant);
      activeParticipants.add("agent");

      const isSubagentReturn = targetParticipant === "subagent" && node.sequenceDirection === "return";
      const from = isSubagentReturn ? "subagent" : "agent";
      const to = isSubagentReturn ? "agent" : targetParticipant;

      steps.push({
        id: `seq-${eventId(event)}`,
        seq: stepSeq++,
        from,
        to,
        toLabel: to === "mcp" ? node.participantName : undefined,
        type: isSubagentReturn ? "return" : "call",
        label: `${node.label} execution`,
        title: node.title,
        ...stepDisplay(node, event),
        detail: node.detail,
        meta: node.meta,
        status: event.status,
        durationMs: event.durationMs,
        at: event.at,
        event,
        node,
        isKey: true,
      });
    }
  }

  // 计算参与者生命线激活条 (Activations)
  const activations: SequenceActivation[] = [];
  if (steps.length > 0) {
    activations.push({
      participant: "agent",
      startStepIndex: 0,
      endStepIndex: steps.length - 1,
      status: "completed",
    });

    const targetLastIndices = new Map<SequenceParticipant, { start: number; end: number; status: TraceStatus }>();
    steps.forEach((step, idx) => {
      const p = step.to !== "agent" && step.to !== "user" ? step.to : step.from !== "agent" && step.from !== "user" ? step.from : null;
      if (p) {
        const existing = targetLastIndices.get(p);
        if (!existing) {
          targetLastIndices.set(p, { start: idx, end: idx, status: step.status });
        } else {
          existing.end = idx;
          if (step.status === "failed" || step.status === "error") existing.status = "failed";
        }
      }
    });

    targetLastIndices.forEach((val, participant) => {
      activations.push({
        participant,
        startStepIndex: val.start,
        endStepIndex: val.end,
        status: val.status,
      });
    });
  }

  // 保证基本参与者顺序: User -> Agent -> Tools -> MCP -> Subagent
  const participantOrder: SequenceParticipant[] = ["user", "agent", "tool", "mcp", "subagent"];
  const participants = participantOrder
    .filter((key) => activeParticipants.has(key))
    .map((key) => SEQUENCE_PARTICIPANTS[key]);

  const keyStepsCount = merged.filter((item) => item.node.kind !== "reasoning" && item.node.kind !== "system").length;
  const stepIndexByEventId = new Map(steps.map((step, index) => [parallelEventId(step.event), index]));
  const parallelGroups = parallelExecutionGroups(merged.map(({ event }) => event)).flatMap((group) => {
    const indices = group.eventIds.flatMap((id) => {
      const index = stepIndexByEventId.get(id);
      return index === undefined ? [] : [index];
    });
    if (!indices.length) return [];
    const startStepIndex = Math.min(...indices);
    const endStepIndex = Math.max(...indices);
    return [{
      id: group.id,
      stepIds: indices.map((index) => steps[index].id),
      startStepIndex,
      endStepIndex,
      maxConcurrency: group.maxConcurrency,
      evidence: group.evidence,
      label: parallelEvidenceLabel(group),
    }];
  });

  return {
    participants,
    steps,
    activations,
    totalSteps: merged.length,
    visibleSteps: steps.length,
    keyStepsCount,
    parallelGroups,
  };
}

function sanitizeMermaidText(str: string): string {
  return str.replace(/["\n\r;]/g, " ").slice(0, 80).trim();
}

export function exportMermaidSequence(model: SequenceDiagramModel): string {
  const lines: string[] = ["sequenceDiagram", "  autonumber"];

  // 参与者声明
  for (const p of model.participants) {
    lines.push(`  participant ${p.key} as ${p.label}`);
  }

  lines.push("");

  const parallelStart = new Map(model.parallelGroups.map((group) => [group.startStepIndex, group]));
  const parallelEnd = new Map(model.parallelGroups.map((group) => [group.endStepIndex, group]));
  const parallelMember = new Map(model.parallelGroups.flatMap((group) => group.stepIds.map((id, index) => [id, { group, index }] as const)));

  for (const [index, step] of model.steps.entries()) {
    const startingGroup = parallelStart.get(index);
    const membership = parallelMember.get(step.id);
    if (startingGroup) lines.push(`  par ${sanitizeMermaidText(startingGroup.label)}`);
    else if (membership && membership.index > 0) lines.push(`  and ${sanitizeMermaidText(step.exportTitle)}`);
    const title = sanitizeMermaidText(step.exportTitle || step.label);
    const duration = step.durationMs !== undefined ? ` (${step.durationMs}ms)` : "";
    const msg = `${title}${duration}`;

    if (step.type === "self") {
      lines.push(`  ${step.from}->>${step.to}: ${msg}`);
    } else if (step.type === "return") {
      lines.push(`  ${step.from}-->>${step.to}: ${msg}`);
    } else {
      lines.push(`  ${step.from}->>+${step.to}: ${msg}`);
    }
    if (parallelEnd.has(index)) lines.push("  end");
  }

  return lines.join("\n");
}
