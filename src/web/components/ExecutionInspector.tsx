import { useState } from "react";
import { formatClockTimeWithMilliseconds } from "../formatters";
import { handleRovingTabKey } from "../roving-tabs";
import { eventRaw } from "../trace-event";
import type { TraceStatus } from "../types";
import { EventDetails } from "./EventDetails";
import { ExecutionMetaSummary } from "./ExecutionMetaSummary";
import { HighlightedCode } from "./HighlightedCode";
import type { FlowEvent, FlowKind } from "./InteractionFlow";
import { Icon } from "./Icon";
import { StatusMark } from "./StatusMark";

export interface ExecutionInspectorItem {
  seq: number;
  kind: FlowKind;
  title: string;
  detail: string;
  status: TraceStatus;
  durationMs?: number;
  at: string;
  from: string;
  to: string;
  type: string;
  event: FlowEvent;
}

function compactRecord(entries: Array<[string, unknown]>): Record<string, unknown> | undefined {
  const value = Object.fromEntries(entries.filter(([, item]) => item !== undefined && item !== null && item !== ""));
  return Object.keys(value).length ? value : undefined;
}

function inspectorData(item: ExecutionInspectorItem): { payload?: unknown; result?: unknown } {
  const raw = eventRaw(item.event);
  const result = compactRecord([
    ["result", raw.result],
    ["output", raw.aggregatedOutput ?? raw.output],
    ["results", raw.results],
    ["exitCode", raw.exitCode],
    ["processId", raw.processId],
    ["error", raw.error],
  ]);
  const eventType = item.event.type.toLowerCase();
  const eventMethod = item.event.method.toLowerCase();
  const isCommand = item.kind === "tool"
    && (eventType === "commandexecution" || eventMethod.includes("commandexecution"));

  if (item.kind === "mcp") {
    return { payload: raw.arguments, result };
  }
  if (isCommand) {
    return {
      payload: compactRecord([
        ["command", raw.command],
        ["cwd", raw.cwd],
        ["actions", raw.commandActions],
      ]),
      result,
    };
  }
  if (item.kind === "web") {
    return {
      payload: raw.action ?? compactRecord([["query", raw.query]]),
      result,
    };
  }

  const payload = Object.fromEntries(Object.entries(raw).filter(([key]) => ![
    "aggregatedOutput", "error", "exitCode", "output", "processId", "result", "results",
  ].includes(key)));
  return {
    payload: Object.keys(payload).length ? payload : undefined,
    result,
  };
}

function InspectorValue({ value }: { value: unknown }) {
  const isText = typeof value === "string";
  let code: string;
  try {
    code = isText ? value : JSON.stringify(value, null, 2);
  } catch {
    code = String(value);
  }
  return (
    <HighlightedCode
      className="vbg-custom-sequence__inspector-value"
      code={code}
      language={isText ? "plaintext" : "json"}
    />
  );
}

export function ExecutionInspector({
  item,
  onClose,
}: {
  item: ExecutionInspectorItem;
  onClose: () => void;
}) {
  const titleId = `execution-inspector-title-${item.seq}`;
  const [activeTab, setActiveTab] = useState<"summary" | "payload" | "result" | "timing">("summary");
  const data = inspectorData(item);
  const tabs = [
    { id: "summary" as const, label: "Summary" },
    ...(data.payload === undefined ? [] : [{ id: "payload" as const, label: "Payload" }]),
    ...(data.result === undefined ? [] : [{ id: "result" as const, label: "Result" }]),
    { id: "timing" as const, label: "Timing" },
  ];
  const kind = item.kind === "file" || item.kind === "web" ? "tool" : item.kind;
  const kindLabel = kind === "reasoning" ? "Agent" : kind;
  return (
    <aside
      className="vbg-custom-sequence__inspector vbg-custom-sequence__inspector--tabbed"
      id="execution-inspector"
      aria-labelledby={titleId}
    >
      <header className="vbg-custom-sequence__inspector-header">
        <div className="vbg-custom-sequence__inspector-title" id={titleId} aria-live="polite">
          <span className={`vbg-custom-sequence__inspector-kind vbg-custom-sequence__inspector-kind--${kind}`}>
            {kindLabel.toUpperCase()}
          </span>
          <span className="vbg-custom-sequence__step-num">Step {item.seq}</span>
          <strong title={item.title}>{item.title}</strong>
          <StatusMark status={item.status} />
        </div>
        <div className="vbg-custom-sequence__inspector-actions">
          <button
            type="button"
            className="vbg-custom-sequence__inspector-close"
            onClick={onClose}
            aria-label="Close execution details"
            title="Close details"
          >
            <Icon name="close" />
          </button>
        </div>
      </header>
      <div aria-label="Execution details" className="vbg-custom-sequence__inspector-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            aria-controls="execution-inspector-panel"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "is-active" : undefined}
            id={`execution-inspector-tab-${tab.id}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={handleRovingTabKey}
            role="tab"
            tabIndex={activeTab === tab.id ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`execution-inspector-tab-${activeTab}`}
        className="vbg-custom-sequence__inspector-panel"
        id="execution-inspector-panel"
        role="tabpanel"
      >
        {activeTab === "summary" && (
          <div className="vbg-custom-sequence__inspector-summary">
            <ExecutionMetaSummary
              duration={item.durationMs === undefined ? undefined : `${item.durationMs}ms`}
              from={item.from}
              startedAt={item.at}
              startedAtLabel={formatClockTimeWithMilliseconds(item.at)}
              to={item.to}
              type={item.type}
            />
            <section className="vbg-custom-sequence__inspector-section" aria-label="Execution content">
              <h3>Details</h3>
              <EventDetails event={item.event} fallback={item.detail} />
            </section>
          </div>
        )}
        {activeTab === "payload" && data.payload !== undefined && <InspectorValue value={data.payload} />}
        {activeTab === "result" && data.result !== undefined && <InspectorValue value={data.result} />}
        {activeTab === "timing" && (
          <dl className="vbg-custom-sequence__inspector-timing">
            <div><dt>Started</dt><dd><time dateTime={item.at}>{item.at}</time></dd></div>
            <div><dt>Duration</dt><dd>{item.durationMs === undefined ? "Not recorded" : `${item.durationMs}ms`}</dd></div>
            <div><dt>Direction</dt><dd><code>{item.from}</code><span aria-hidden="true"> → </span><code>{item.to}</code></dd></div>
          </dl>
        )}
      </div>
    </aside>
  );
}
