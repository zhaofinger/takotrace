import type { FlowKind } from "./InteractionFlow";

export type GraphNodeShape = "circle" | "ellipse" | "rect";
export type GraphNodeEmphasis = "primary" | "secondary" | "muted";

export interface GraphNodeVisual {
  shape: GraphNodeShape;
  size: [number, number];
  emphasis: GraphNodeEmphasis;
}

const VISUALS: Record<FlowKind, GraphNodeVisual> = {
  user: { shape: "circle", size: [112, 112], emphasis: "primary" },
  agent: { shape: "rect", size: [240, 76], emphasis: "primary" },
  tool: { shape: "rect", size: [184, 60], emphasis: "secondary" },
  file: { shape: "rect", size: [184, 60], emphasis: "secondary" },
  skill: { shape: "rect", size: [184, 60], emphasis: "secondary" },
  mcp: { shape: "rect", size: [196, 64], emphasis: "secondary" },
  subagent: { shape: "rect", size: [196, 64], emphasis: "secondary" },
  web: { shape: "rect", size: [184, 60], emphasis: "secondary" },
  reasoning: { shape: "rect", size: [156, 48], emphasis: "muted" },
  system: { shape: "rect", size: [120, 44], emphasis: "muted" },
};

export function graphNodeVisual(kind: FlowKind): GraphNodeVisual {
  return VISUALS[kind];
}

export function isPrimaryGraphKind(kind: FlowKind): boolean {
  return VISUALS[kind].emphasis === "primary";
}
