import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { DensitySwitch } from "./DensitySwitch";
import { ExecutionMetaSummary } from "./ExecutionMetaSummary";
import type { FlowEvent } from "./InteractionFlow";
import { EventDetails, eventRaw } from "./EventDetails";
import { HighlightedCode } from "./HighlightedCode";
import { Icon } from "./Icon";
import { StatusMark } from "./StatusMark";
import {
  buildSequenceDiagramModel,
  exportMermaidSequence,
  type SequenceParticipant,
  type SequenceStep,
} from "./sequence-diagram-model";

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : `${date.toLocaleTimeString([], { hour12: false })}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

function compactRecord(entries: Array<[string, unknown]>): Record<string, unknown> | undefined {
  const value = Object.fromEntries(entries.filter(([, item]) => item !== undefined && item !== null && item !== ""));
  return Object.keys(value).length ? value : undefined;
}

function inspectorData(step: SequenceStep): { payload?: unknown; result?: unknown } {
  const raw = eventRaw(step.event);
  const result = compactRecord([
    ["result", raw.result],
    ["output", raw.aggregatedOutput ?? raw.output],
    ["results", raw.results],
    ["exitCode", raw.exitCode],
    ["processId", raw.processId],
    ["error", raw.error],
  ]);

  if (step.node.kind === "mcp") {
    return { payload: raw.arguments, result };
  }
  if (step.node.kind === "tool" && step.isCommand) {
    return {
      payload: compactRecord([
        ["command", raw.command],
        ["cwd", raw.cwd],
        ["actions", raw.commandActions],
      ]),
      result,
    };
  }
  if (step.node.kind === "web") {
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

interface SequenceStepTooltipState {
  above: boolean;
  left: number;
  stepId: string;
  text: string;
  top: number;
}

export function SequenceStepInspector({
  step,
  onClose,
}: {
  step: SequenceStep;
  onClose: () => void;
}) {
  const titleId = `sequence-step-inspector-title-${step.seq}`;
  const [activeTab, setActiveTab] = useState<"summary" | "payload" | "result" | "timing">("summary");
  const data = inspectorData(step);
  const tabs = [
    { id: "summary" as const, label: "Summary" },
    ...(data.payload === undefined ? [] : [{ id: "payload" as const, label: "Payload" }]),
    ...(data.result === undefined ? [] : [{ id: "result" as const, label: "Result" }]),
    { id: "timing" as const, label: "Timing" },
  ];
  const kind = step.node.kind === "file" || step.node.kind === "web" ? "tool" : step.node.kind;
  const kindLabel = kind === "reasoning" ? "Agent" : kind;
  const selectTab = (tabId: typeof activeTab) => {
    setActiveTab(tabId);
    window.requestAnimationFrame(() => document.getElementById(`sequence-step-tab-${tabId}`)?.focus());
  };

  return (
    <aside
      className="vbg-custom-sequence__inspector vbg-custom-sequence__inspector--tabbed"
      id="sequence-step-inspector"
      aria-labelledby={titleId}
    >
      <header className="vbg-custom-sequence__inspector-header">
        <div className="vbg-custom-sequence__inspector-title" id={titleId} aria-live="polite">
          <span className={`vbg-custom-sequence__inspector-kind vbg-custom-sequence__inspector-kind--${kind}`}>
            {kindLabel.toUpperCase()}
          </span>
          <span className="vbg-custom-sequence__step-num">Step {step.seq}</span>
          <strong title={step.detailTitle}>{step.detailTitle}</strong>
          <StatusMark status={step.status} />
        </div>
        <div className="vbg-custom-sequence__inspector-actions">
          <button
            type="button"
            className="vbg-custom-sequence__inspector-close"
            onClick={onClose}
            aria-label="Close step details"
            title="Close details"
          >
            <Icon name="close" />
          </button>
        </div>
      </header>
      <div aria-label="Step details" className="vbg-custom-sequence__inspector-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            aria-controls="sequence-step-panel"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "is-active" : undefined}
            id={`sequence-step-tab-${tab.id}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const currentIndex = tabs.findIndex((item) => item.id === tab.id);
              const nextIndex = event.key === "Home"
                ? 0
                : event.key === "End"
                  ? tabs.length - 1
                  : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
              selectTab(tabs[nextIndex].id);
            }}
            role="tab"
            tabIndex={activeTab === tab.id ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`sequence-step-tab-${activeTab}`}
        className="vbg-custom-sequence__inspector-panel"
        id="sequence-step-panel"
        role="tabpanel"
      >
        {activeTab === "summary" && (
          <div className="vbg-custom-sequence__inspector-summary">
            <ExecutionMetaSummary
              duration={step.durationMs === undefined ? undefined : `${step.durationMs}ms`}
              from={step.from}
              startedAt={step.at}
              startedAtLabel={formatTime(step.at)}
              to={step.toLabel ?? step.to}
              type={step.type}
            />
            <section className="vbg-custom-sequence__inspector-section" aria-label="Step content">
              <h3>Details</h3>
              <EventDetails event={step.event} fallback={step.detail} />
            </section>
          </div>
        )}
        {activeTab === "payload" && data.payload !== undefined && <InspectorValue value={data.payload} />}
        {activeTab === "result" && data.result !== undefined && <InspectorValue value={data.result} />}
        {activeTab === "timing" && (
          <dl className="vbg-custom-sequence__inspector-timing">
            <div><dt>Started</dt><dd><time dateTime={step.at}>{step.at}</time></dd></div>
            <div><dt>Duration</dt><dd>{step.durationMs === undefined ? "Not recorded" : `${step.durationMs}ms`}</dd></div>
            <div><dt>Direction</dt><dd><code>{step.from}</code><span aria-hidden="true"> → </span><code>{step.toLabel ?? step.to}</code></dd></div>
          </dl>
        )}
      </div>
    </aside>
  );
}

export function SequenceDiagram({ items }: { items: FlowEvent[] }) {
  const [density, setDensity] = useState<"key" | "all">("key");
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [stepTooltip, setStepTooltip] = useState<SequenceStepTooltipState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const model = useMemo(
    () => buildSequenceDiagramModel(items, density),
    [items, density],
  );

  const selectedStep = useMemo(
    () => model.steps.find((step) => step.id === selectedStepId),
    [model.steps, selectedStepId],
  );

  useEffect(() => {
    if (selectedStepId && !selectedStep) setSelectedStepId(null);
  }, [selectedStep, selectedStepId]);

  useLayoutEffect(() => {
    if (!selectedStep) return;
    const canvas = canvasRef.current;
    const stepButton = document.getElementById(`sequence-step-${selectedStep.seq}`);
    if (!canvas || !stepButton) return;
    const canvasRect = canvas.getBoundingClientRect();
    const stepRect = stepButton.getBoundingClientRect();
    const edgePadding = 12;
    if (stepRect.bottom > canvasRect.bottom - edgePadding) {
      canvas.scrollTop += stepRect.bottom - canvasRect.bottom + edgePadding;
    } else if (stepRect.top < canvasRect.top + edgePadding) {
      canvas.scrollTop -= canvasRect.top - stepRect.top + edgePadding;
    }
  }, [selectedStep]);

  const closeInspector = () => {
    if (!selectedStep) return;
    const stepButtonId = `sequence-step-${selectedStep.seq}`;
    setSelectedStepId(null);
    window.requestAnimationFrame(() => document.getElementById(stepButtonId)?.focus());
  };

  const handleCopyMermaid = async () => {
    const code = exportMermaidSequence(model);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(code);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    window.setTimeout(() => setCopyState("idle"), 2000);
  };

  const showStepTooltip = (target: HTMLElement, step: SequenceStep) => {
    if (step.detailTitle === step.displayTitle && target.scrollWidth <= target.clientWidth) return;
    const rect = target.getBoundingClientRect();
    const maxWidth = Math.min(480, window.innerWidth - 24);
    const halfWidth = maxWidth / 2;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2, 12 + halfWidth),
      window.innerWidth - 12 - halfWidth,
    );
    const above = rect.bottom + 96 > window.innerHeight;
    setStepTooltip({
      above,
      left,
      stepId: step.id,
      text: step.detailTitle,
      top: above ? rect.top - 8 : rect.bottom + 8,
    });
  };

  const participantIndices = useMemo(() => {
    const map = new Map<SequenceParticipant, number>();
    model.participants.forEach((p, index) => {
      map.set(p.key, index);
    });
    return map;
  }, [model.participants]);

  const parallelByStepId = useMemo(() => new Map(
    model.parallelGroups.flatMap((group) => group.stepIds.map((id) => [id, group] as const)),
  ), [model.parallelGroups]);

  const diagramStyle = {
    "--vbg-sequence-columns": model.participants.length,
    minWidth: `${Math.max(420, model.participants.length * 156)}px`,
  } as CSSProperties;

  return (
    <section
      aria-label="Run sequence diagram"
      className="vbg-custom-sequence"
      onKeyDown={(event) => {
        if (event.key === "Escape" && selectedStep) {
          event.preventDefault();
          closeInspector();
        }
      }}
    >
      <div className="vbg-custom-sequence__toolbar">
        <DensitySwitch
          checked={density === "all"}
          label="Show all sequence steps"
          onChange={(checked) => setDensity(checked ? "all" : "key")}
          total={model.totalSteps}
          visible={model.visibleSteps}
        />

        <div className="vbg-custom-sequence__actions">
          <button
            type="button"
            aria-label={copyState === "copied" ? "Mermaid copied" : copyState === "error" ? "Copy Mermaid failed" : "Copy Mermaid"}
            className="vbg-custom-sequence__copy-btn"
            onClick={handleCopyMermaid}
            title={copyState === "copied" ? "Mermaid copied" : copyState === "error" ? "Copy failed" : "Copy Mermaid sequence syntax"}
          >
            <Icon name={copyState === "copied" ? "check" : copyState === "error" ? "alert" : "copy"} />
            <span aria-live="polite" className="vbg-custom-sr-only">
              {copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy Mermaid"}
            </span>
          </button>
        </div>
      </div>

      {model.steps.length === 0 ? (
        <div className="vbg-custom-sequence__empty">
          <p>No sequence events to display for this run.</p>
        </div>
      ) : (
        <div className={`vbg-custom-sequence__workspace${selectedStep ? " vbg-custom-sequence__workspace--with-inspector" : ""}`}>
          <div
            ref={canvasRef}
            className="vbg-custom-sequence__canvas"
            aria-label="Sequence interaction flow"
            onScroll={() => setStepTooltip(null)}
          >
            <div className="vbg-custom-sequence__diagram" style={diagramStyle}>
            <div className="vbg-custom-sequence__lifelines-header">
              {model.participants.map((p) => (
                <div key={p.key} className={`vbg-custom-sequence__participant vbg-custom-sequence__participant--${p.key}`}>
                  <div className="vbg-custom-sequence__participant-box">
                    <span className="vbg-custom-sequence__participant-icon">
                      <Icon name={p.iconName} />
                    </span>
                    <div className="vbg-custom-sequence__participant-info">
                      <strong>{p.label}</strong>
                      <span>{p.subtext}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="vbg-custom-sequence__body">
              <div className="vbg-custom-sequence__lifelines-bg">
                {model.participants.map((p) => (
                  <div key={p.key} className="vbg-custom-sequence__lifeline-col">
                    <div className="vbg-custom-sequence__lifeline-wire" />
                  </div>
                ))}
              </div>

              <div className="vbg-custom-sequence__steps">
                {model.steps.map((step, stepIndex) => {
                  const parallelGroup = parallelByStepId.get(step.id);
                  const parallelStart = parallelGroup?.startStepIndex === stepIndex;
                  const parallelEnd = parallelGroup?.endStepIndex === stepIndex;
                  const fromIdx = participantIndices.get(step.from) ?? 0;
                  const toIdx = participantIndices.get(step.to) ?? 0;
                  const isSelf = step.type === "self" || fromIdx === toIdx;
                  const isReturn = step.type === "return";
                  const numParticipants = model.participants.length;
                  const colWidthPercent = 100 / numParticipants;
                  const isSelected = selectedStepId === step.id;
                  const isComplete = step.status === "completed" || step.status === "complete" || step.status === "approved";
                  const stepButtonId = `sequence-step-${step.seq}`;
                  const stepRole = step.node.kind === "file" || step.node.kind === "web"
                    ? "tool"
                    : step.node.kind === "reasoning"
                      ? "agent"
                      : step.node.kind;

                  // 计算箭头位置百分比
                  const startX = (fromIdx + 0.5) * colWidthPercent;
                  const endX = (toIdx + 0.5) * colWidthPercent;
                  const spanLeft = Math.min(startX, endX);
                  const spanWidth = Math.abs(endX - startX);
                  const direction = toIdx >= fromIdx ? "right" : "left";

                  return (
                      <button
                        key={step.id}
                        id={stepButtonId}
                        className={`vbg-custom-sequence__step-row vbg-custom-sequence__step-row--role-${stepRole} vbg-custom-sequence__step-row--status-${step.status}${parallelGroup ? " vbg-custom-sequence__step-row--parallel" : ""}${parallelStart ? " vbg-custom-sequence__step-row--parallel-start" : ""}${parallelEnd ? " vbg-custom-sequence__step-row--parallel-end" : ""} ${
                          isSelected ? "vbg-custom-sequence__step-row--selected" : ""
                        }`}
                        onClick={() => {
                          if (isSelected) {
                            closeInspector();
                            return;
                          }
                          setSelectedStepId(step.id);
                        }}
                        type="button"
                        aria-expanded={isSelected}
                        aria-controls={isSelected ? "sequence-step-inspector" : undefined}
                        aria-describedby={stepTooltip?.stepId === step.id ? "sequence-step-tooltip" : undefined}
                        aria-label={`Step ${step.seq}: ${step.label} - ${step.detailTitle}, ${step.from} to ${step.toLabel ?? step.to}${parallelGroup ? `, ${parallelGroup.label}` : ""}`}
                        onBlur={() => setStepTooltip(null)}
                        onFocus={(event) => {
                          if (!event.currentTarget.matches(":focus-visible")) return;
                          const title = event.currentTarget.querySelector<HTMLElement>(".vbg-custom-sequence__step-title");
                          if (title) showStepTooltip(title, step);
                        }}
                      >
                        {parallelGroup && parallelStart && (
                          <span className="vbg-custom-sequence__parallel-label">
                            <strong>{parallelGroup.label}</strong>
                            <small>{parallelGroup.evidence === "lifecycle" ? "lifecycle overlap" : parallelGroup.evidence.replace("-", " ")}</small>
                          </span>
                        )}
                        <div className="vbg-custom-sequence__step-line-container">
                          {isSelf ? (
                            <div
                              className="vbg-custom-sequence__self-loop"
                              style={{ left: `${startX}%` }}
                            >
                              <span aria-hidden="true" className="vbg-custom-sequence__self-path" />
                              <span className="vbg-custom-sequence__self-badge">
                                <span className="vbg-custom-sequence__step-num">{step.seq}</span>
                                {step.displayIcon && (
                                  <span aria-hidden="true" className="vbg-custom-sequence__step-icon">
                                    <Icon name={step.displayIcon} />
                                  </span>
                                )}
                                <strong
                                  className={`vbg-custom-sequence__step-title${step.isCommand ? " vbg-custom-sequence__step-title--command" : ""}`}
                                  data-tooltip={step.detailTitle}
                                  onMouseEnter={(event) => showStepTooltip(event.currentTarget, step)}
                                  onMouseLeave={() => setStepTooltip(null)}
                                >
                                  {step.displayTitle}
                                </strong>
                                {!isComplete && <StatusMark status={step.status} />}
                              </span>
                            </div>
                          ) : (
                            <div
                              className={`vbg-custom-sequence__arrow vbg-custom-sequence__arrow--${direction} ${
                                isReturn ? "vbg-custom-sequence__arrow--return" : "vbg-custom-sequence__arrow--call"
                              } vbg-custom-sequence__arrow--status-${step.status}`}
                              style={{
                                left: `${spanLeft}%`,
                                width: `${spanWidth}%`,
                              }}
                            >
                              <div className="vbg-custom-sequence__arrow-line" />
                              <div className="vbg-custom-sequence__arrow-head" />
                              <div className="vbg-custom-sequence__arrow-label">
                                <span className="vbg-custom-sequence__step-num">{step.seq}</span>
                                {step.displayIcon && (
                                  <span aria-hidden="true" className="vbg-custom-sequence__step-icon">
                                    <Icon name={step.displayIcon} />
                                  </span>
                                )}
                                <strong
                                  className={`vbg-custom-sequence__step-title${step.isCommand ? " vbg-custom-sequence__step-title--command" : ""}`}
                                  data-tooltip={step.detailTitle}
                                  onMouseEnter={(event) => showStepTooltip(event.currentTarget, step)}
                                  onMouseLeave={() => setStepTooltip(null)}
                                >
                                  {step.displayTitle}
                                </strong>
                                {!isComplete && <StatusMark status={step.status} />}
                              </div>
                            </div>
                          )}
                        </div>
                      </button>
                  );
                })}
              </div>
            </div>
          </div>
          </div>
          {selectedStep && (
            <SequenceStepInspector
              key={selectedStep.id}
              step={selectedStep}
              onClose={closeInspector}
            />
          )}
        </div>
      )}
      {stepTooltip && typeof document !== "undefined" && createPortal(
        <div
          className={`vbg-custom-sequence__tooltip${stepTooltip.above ? " vbg-custom-sequence__tooltip--above" : ""}`}
          id="sequence-step-tooltip"
          role="tooltip"
          style={{ left: stepTooltip.left, top: stepTooltip.top }}
        >
          {stepTooltip.text}
        </div>,
        document.body,
      )}
    </section>
  );
}
