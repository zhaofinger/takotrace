import { useState } from "react";
import { formatDateTimeWithMilliseconds } from "../formatters";
import { handleRovingTabKey } from "../roving-tabs";
import { eventRaw } from "../trace-event";
import type { TraceStatus } from "../types";
import { EventDetails, type OpenSubagentHandler, type SubagentDetailView } from "./EventDetails";
import { ExecutionMetaSummary } from "./ExecutionMetaSummary";
import { HighlightedCode } from "./HighlightedCode";
import { flowNode, type FlowEvent, type FlowKind } from "./InteractionFlow";
import { Icon } from "./Icon";
import { StatusMark } from "./StatusMark";

export interface ExecutionInspectorItem {
  seq: number;
  kind: FlowKind;
  title: string;
  fullTitle?: string;
  detail: string;
  status: TraceStatus;
  durationMs?: number;
  at: string;
  from: string;
  to: string;
  type: string;
  event: FlowEvent;
}

export function restoreFocusAfterInspectorClose(elementId: string) {
  window.requestAnimationFrame(() => document.getElementById(elementId)?.focus());
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
  onOpenSubagent,
  subagentView = "trace",
}: {
  item: ExecutionInspectorItem;
  onClose: () => void;
  onOpenSubagent?: OpenSubagentHandler;
  subagentView?: SubagentDetailView;
}) {
  const titleId = `execution-inspector-title-${item.seq}`;
  const [activeTab, setActiveTab] = useState<"overview" | "raw">("overview");
  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "raw" as const, label: "Raw event" },
  ];
  const kind = item.kind === "file" || item.kind === "web" ? "tool" : item.kind;
  const kindLabel = kind === "reasoning" ? "Agent" : kind;
  const isSubagent = kind === "subagent";
  const statusLabel = flowNode(item.event).statusLabel ?? item.status;
  const startedAt = item.event.startedAt ?? item.at;
  return (
    <aside
      className="vbg-custom-sequence__inspector vbg-custom-sequence__inspector--tabbed"
      id="execution-inspector"
      aria-labelledby={titleId}
    >
      <header className="vbg-custom-sequence__inspector-header">
        <div className="vbg-custom-sequence__inspector-title" id={titleId} aria-live="polite">
          <div className="vbg-custom-sequence__inspector-title-meta">
            <span className={`vbg-custom-sequence__inspector-kind vbg-custom-sequence__inspector-kind--${kind}`}>
              {kindLabel.toUpperCase()}
            </span>
            <span className="vbg-custom-sequence__step-num">Step {item.seq}</span>
          </div>
          <strong title={item.fullTitle ?? item.title}>{item.title}</strong>
        </div>
        <div className="vbg-custom-sequence__inspector-actions">
          <StatusMark status={statusLabel} />
          <button
            autoFocus
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
      {!isSubagent && (
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
      )}
      <div
        aria-labelledby={isSubagent ? titleId : `execution-inspector-tab-${activeTab}`}
        className="vbg-custom-sequence__inspector-panel"
        id="execution-inspector-panel"
        role={isSubagent ? undefined : "tabpanel"}
      >
        {isSubagent ? (
          <div className="vbg-custom-sequence__inspector-summary vbg-custom-sequence__inspector-summary--subagent">
            <ExecutionMetaSummary
              duration={item.durationMs === undefined ? undefined : `${item.durationMs}ms`}
              durationLabel="Event latency"
              startedAt={startedAt}
              startedAtLabel={formatDateTimeWithMilliseconds(startedAt)}
            />
            <EventDetails
              autoLoadSubagent
              event={item.event}
              expandResult
              fallback={item.detail}
              onOpenSubagent={onOpenSubagent}
              subagentView={subagentView}
            />
          </div>
        ) : activeTab === "overview" ? (
          <div className="vbg-custom-sequence__inspector-summary">
            <ExecutionMetaSummary
              duration={item.durationMs === undefined ? undefined : `${item.durationMs}ms`}
              from={item.from}
              startedAt={startedAt}
              startedAtLabel={formatDateTimeWithMilliseconds(startedAt)}
              to={item.to}
              type={item.type}
            />
            <section className="vbg-custom-sequence__inspector-section" aria-label="Execution content">
              <h3>Content</h3>
              <EventDetails
                autoLoadSubagent
                event={item.event}
                expandResult
                fallback={item.detail}
                onOpenSubagent={onOpenSubagent}
                subagentView={subagentView}
              />
            </section>
          </div>
        ) : (
          <InspectorValue value={eventRaw(item.event)} />
        )}
      </div>
    </aside>
  );
}
