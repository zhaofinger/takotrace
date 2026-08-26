import type { TraceStatus } from "../types";
import { flowNode, mergeFlowEvents } from "./InteractionFlow";
import type { FlowEvent, FlowKind } from "./InteractionFlow";

export type GraphDensity = "key" | "all";
export type TraceGraphTier = "main" | "execution" | "nested";

export interface TraceGraphNode {
  id: string;
  event: FlowEvent;
  kind: FlowKind;
  label: string;
  title: string;
  status: TraceStatus;
  durationMs?: number;
  tier: TraceGraphTier;
  ownerId?: string;
  x: number;
  y: number;
}

export interface TraceGraphEdge {
  [key: string]: unknown;
  id: string;
  source: string;
  target: string;
  relation: "main" | "child";
}

export interface TraceGraphModel {
  nodes: TraceGraphNode[];
  edges: TraceGraphEdge[];
  total: number;
}

function nodeId(event: FlowEvent): string {
  return event.itemId ? `item-${event.itemId}` : `event-${event.seq}`;
}

export function traceGraphModel(items: FlowEvent[], density: GraphDensity): TraceGraphModel {
  const merged = mergeFlowEvents(items).map((event) => ({ event, descriptor: flowNode(event) }));
  const visible = density === "all"
    ? merged
    : merged.filter(({ descriptor }) => descriptor.kind !== "reasoning" && descriptor.kind !== "system");
  const source = visible.length ? visible : merged;
  let currentAgentId: string | undefined;
  const nodes = source.map(({ event, descriptor }, index) => {
    const id = nodeId(event);
    const isMain = descriptor.kind === "user" || descriptor.kind === "agent";
    const tier: TraceGraphTier = isMain
      ? "main"
      : descriptor.kind === "subagent" ? "nested" : "execution";
    const ownerId = isMain ? undefined : currentAgentId;
    if (descriptor.kind === "agent") currentAgentId = id;
    return {
      id,
      event,
      kind: descriptor.kind,
      label: descriptor.kind === "mcp" ? "Tool" : descriptor.label,
      title: descriptor.kind === "mcp" ? `MCP · ${descriptor.title}` : descriptor.title,
      status: event.status,
      durationMs: event.durationMs,
      tier,
      ownerId,
      x: tier === "main" ? 140 : 420,
      y: 80 + index * 104,
    };
  });
  let nextAgentId: string | undefined;
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node.kind === "agent") nextAgentId = node.id;
    else if (node.tier !== "main" && !node.ownerId) node.ownerId = nextAgentId;
  }
  const mainNodes = nodes.filter((node) => node.tier === "main");
  const mainEdges: TraceGraphEdge[] = mainNodes.slice(1).map((node, index) => ({
    id: `edge-main-${mainNodes[index].id}-${node.id}`,
    source: mainNodes[index].id,
    target: node.id,
    relation: "main",
  }));
  const lastChildByOwner = new Map<string, string>();
  const childEdges: TraceGraphEdge[] = [];
  for (const node of nodes) {
    if (!node.ownerId) continue;
    const sourceId = lastChildByOwner.get(node.ownerId) ?? node.ownerId;
    childEdges.push({
      id: `edge-child-${sourceId}-${node.id}`,
      source: sourceId,
      target: node.id,
      relation: "child",
    });
    lastChildByOwner.set(node.ownerId, node.id);
  }
  const edges = [...mainEdges, ...childEdges];
  return { nodes, edges, total: merged.length };
}
