import { Graph, NodeEvent } from "@antv/g6";
import { useEffect, useMemo, useRef, useState } from "react";
import { DensitySwitch } from "./DensitySwitch";
import { EventDetails } from "./EventDetails";
import { flowNode } from "./InteractionFlow";
import type { FlowEvent } from "./InteractionFlow";
import { traceGraphModel } from "./trace-graph-model";
import type { GraphDensity, TraceGraphNode } from "./trace-graph-model";
import { graphNodeVisual, isPrimaryGraphKind } from "./trace-graph-visual";
import { StatusMark } from "./StatusMark";

interface GraphPalette {
  background: string;
  border: string;
  error: string;
  focus: string;
  roleAgent: string;
  roleMcp: string;
  roleSubagent: string;
  roleTool: string;
  roleUser: string;
  primary: string;
  surface: string;
  success: string;
  warning: string;
}

function cssColor(container: HTMLElement, variable: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${variable})`;
  probe.hidden = true;
  container.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}

function palette(container: HTMLElement): GraphPalette {
  return {
    background: cssColor(container, "--vbg-surface-primary"),
    border: cssColor(container, "--vbg-border-strong"),
    error: cssColor(container, "--vbg-color-error"),
    focus: cssColor(container, "--vbg-focus"),
    roleAgent: cssColor(container, "--vbg-role-agent-bg"),
    roleMcp: cssColor(container, "--vbg-role-mcp-bg"),
    roleSubagent: cssColor(container, "--vbg-role-subagent-bg"),
    roleTool: cssColor(container, "--vbg-role-tool-bg"),
    roleUser: cssColor(container, "--vbg-role-user-bg"),
    primary: cssColor(container, "--vbg-text-primary"),
    surface: cssColor(container, "--vbg-surface-secondary"),
    success: cssColor(container, "--vbg-color-success"),
    warning: cssColor(container, "--vbg-color-warning"),
  };
}

function statusColor(status: string, colors: GraphPalette): string {
  if (status === "completed" || status === "approved") return colors.success;
  if (status === "failed" || status === "error") return colors.error;
  if (status === "running" || status === "pending") return colors.warning;
  return colors.border;
}

function label(node: TraceGraphNode): string {
  return `${node.label} · ${node.title}`;
}

function typeFill(kind: TraceGraphNode["kind"], colors: GraphPalette): string {
  if (kind === "user") return colors.roleUser;
  if (kind === "agent" || kind === "reasoning") return colors.roleAgent;
  if (kind === "mcp" || kind === "skill") return colors.roleMcp;
  if (kind === "subagent") return colors.roleSubagent;
  if (kind === "tool" || kind === "file" || kind === "web") return colors.roleTool;
  return colors.background;
}

const LEGEND = [
  ["user", "User"],
  ["agent", "Agent"],
  ["tool", "Agent execution"],
  ["subagent", "Nested agent"],
] as const;

export default function TraceGraph({ items }: { items: FlowEvent[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | undefined>(undefined);
  const [density, setDensity] = useState<GraphDensity>("key");
  const liveModel = useMemo(() => traceGraphModel(items, density), [density, items]);
  const [deferredModel, setDeferredModel] = useState<typeof liveModel>();
  const model = deferredModel ?? { nodes: [], edges: [], total: liveModel.total };
  const [selectedId, setSelectedId] = useState<string>();
  const [themeRevision, setThemeRevision] = useState(0);
  const selected = model.nodes.find((node) => node.id === selectedId) ?? model.nodes[0];

  useEffect(() => {
    const handleThemeChange = () => setThemeRevision((current) => current + 1);
    window.addEventListener("threadscope:themechange", handleThemeChange);
    return () => window.removeEventListener("threadscope:themechange", handleThemeChange);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDeferredModel(liveModel), 120);
    return () => window.clearTimeout(timer);
  }, [liveModel]);

  useEffect(() => {
    if (!model.nodes.some((node) => node.id === selectedId)) setSelectedId(model.nodes[0]?.id);
  }, [model.nodes, selectedId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !model.nodes.length) return;
    const colors = palette(container);
    const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
    const graph = new Graph({
      container,
      animation: false,
      autoFit: "center",
      padding: 40,
      zoom: 1,
      zoomRange: [0.35, 2],
      data: {
        nodes: model.nodes.map((node) => ({
          id: node.id,
          data: { kind: node.kind, label: label(node), status: node.status, tier: node.tier },
          style: { x: node.x, y: node.y },
        })),
        edges: model.edges.map((edge) => ({
          ...edge,
          data: {
            relation: edge.relation,
          },
        })),
      },
      layout: { type: "preset" },
      node: {
        type: (datum) => graphNodeVisual(String(datum.data?.kind) as TraceGraphNode["kind"]).shape,
        style: {
          size: (datum) => graphNodeVisual(String(datum.data?.kind) as TraceGraphNode["kind"]).size,
          radius: 6,
          fill: (datum) => typeFill(String(datum.data?.kind) as TraceGraphNode["kind"], colors),
          fillOpacity: (datum) => {
            const emphasis = graphNodeVisual(String(datum.data?.kind) as TraceGraphNode["kind"]).emphasis;
            return emphasis === "primary" ? 1 : emphasis === "secondary" ? 0.82 : 0.45;
          },
          stroke: (datum) => statusColor(String(datum.data?.status), colors),
          strokeOpacity: (datum) => graphNodeVisual(String(datum.data?.kind) as TraceGraphNode["kind"]).emphasis === "muted" ? 0.45 : 0.9,
          lineWidth: (datum) => isPrimaryGraphKind(String(datum.data?.kind) as TraceGraphNode["kind"]) ? 2 : 1,
          labelText: (datum) => String(datum.data?.label ?? "Event"),
          labelFill: colors.primary,
          labelFillOpacity: (datum) => graphNodeVisual(String(datum.data?.kind) as TraceGraphNode["kind"]).emphasis === "muted" ? 0.55 : 1,
          labelFontFamily: "Geist Mono, SFMono-Regular, Consolas, monospace",
          labelFontSize: (datum) => isPrimaryGraphKind(String(datum.data?.kind) as TraceGraphNode["kind"]) ? 13 : 11,
          labelLineHeight: 18,
          labelPlacement: "center",
          labelTextAlign: "left",
          labelWordWrap: true,
          labelMaxWidth: (datum) => isPrimaryGraphKind(String(datum.data?.kind) as TraceGraphNode["kind"]) ? 208 : 136,
          cursor: "pointer",
        },
        state: {
          selected: { lineWidth: 3, stroke: colors.focus, strokeOpacity: 1 },
          active: { lineWidth: 2, shadowBlur: 6, shadowColor: colors.border },
        },
      },
      edge: {
        type: "polyline",
        style: {
          stroke: colors.border,
          strokeOpacity: (datum) => datum.data?.relation === "main" ? 0.85 : 0.42,
          lineWidth: (datum) => datum.data?.relation === "main" ? 1.5 : 1,
          lineDash: (datum) => datum.data?.relation === "child" ? [4, 4] : undefined,
          radius: 8,
          endArrow: (datum) => datum.data?.relation === "main",
        },
      },
      behaviors: [
        "drag-canvas",
        "click-select",
        { type: "zoom-canvas", trigger: ["Control"] },
        { type: "hover-activate", degree: 1 },
      ],
      plugins: [{
        type: "minimap",
        key: "trace-minimap",
        size: [120, 80],
        containerStyle: {
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: "6px",
        },
        maskStyle: {
          background: "transparent",
          border: `1px solid ${colors.focus}`,
        },
      }],
    });
    graphRef.current = graph;
    graph.on(NodeEvent.CLICK, (event) => {
      const id = String((event as { target: { id: string } }).target.id);
      if (nodeById.has(id)) setSelectedId(id);
    });
    let disposed = false;
    let renderSettled = false;
    void graph.render().then(async () => {
      if (disposed) return;
      const initialIds = model.nodes.slice(0, 5).map((node) => node.id);
      if (initialIds[0]) {
        await graph.setElementState(initialIds[0], "selected", false);
        await graph.focusElement(initialIds, { duration: 0 });
        if (!disposed) await graph.zoomBy(0.9, { duration: 0 });
      }
    }).catch((error: unknown) => {
      if (!disposed) console.error(error);
    }).finally(() => {
      renderSettled = true;
      if (disposed) graph.destroy();
    });
    const observer = new ResizeObserver(() => graph.resize());
    observer.observe(container);
    return () => {
      disposed = true;
      observer.disconnect();
      if (renderSettled) graph.destroy();
      graphRef.current = undefined;
    };
  }, [model, themeRevision]);

  const zoom = (ratio: number) => {
    const graph = graphRef.current;
    if (graph) void graph.zoomBy(ratio, { duration: 180 });
  };

  return (
    <section className="vbg-custom-trace-graph" aria-label="Conversation graph">
      <div className="vbg-custom-graph-toolbar">
        <DensitySwitch
          checked={density === "all"}
          label="Show all graph events"
          onChange={(checked) => setDensity(checked ? "all" : "key")}
          total={model.total}
          visible={model.nodes.length}
        />
        <div className="vbg-custom-graph-controls">
          <button aria-label="Zoom out" onClick={() => zoom(0.8)} type="button">−</button>
          <button aria-label="Fit graph" onClick={() => void graphRef.current?.fitView({}, { duration: 180 })} type="button">Fit</button>
          <button aria-label="Zoom in" onClick={() => zoom(1.25)} type="button">+</button>
        </div>
      </div>
      <div aria-label="Graph node legend" className="vbg-custom-graph-legend">
        {LEGEND.map(([kind, text]) => (
          <span className={isPrimaryGraphKind(kind) ? "vbg-custom-is-primary" : undefined} key={kind}>
            <i className={`vbg-custom-graph-shape vbg-custom-graph-shape--${graphNodeVisual(kind).shape} vbg-custom-graph-kind--${kind}`} />
            {text}
          </span>
        ))}
      </div>
      <div className="vbg-custom-graph-canvas" ref={containerRef} />
      {selected && (
        <article className="vbg-custom-graph-inspector">
          <header>
            <div><span>{selected.label}</span><strong>{selected.title}</strong></div>
            <StatusMark status={selected.status} />
          </header>
          <EventDetails event={selected.event} fallback={flowNode(selected.event).detail} />
        </article>
      )}
    </section>
  );
}
