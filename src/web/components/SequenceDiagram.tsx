import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { DensitySwitch } from "./DensitySwitch";
import type { FlowEvent } from "./InteractionFlow";
import { EventDetails } from "./EventDetails";
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

function SequenceStepInspector({
  collapsed,
  step,
  onClose,
  onToggle,
}: {
  collapsed: boolean;
  step: SequenceStep;
  onClose: () => void;
  onToggle: () => void;
}) {
  const titleId = `sequence-step-inspector-title-${step.seq}`;
  const bodyId = `sequence-step-inspector-body-${step.seq}`;

  return (
    <aside
      className={`vbg-custom-sequence__inspector${collapsed ? " vbg-custom-sequence__inspector--collapsed" : ""}`}
      id="sequence-step-inspector"
      aria-labelledby={titleId}
    >
      <header className="vbg-custom-sequence__inspector-header">
        <div className="vbg-custom-sequence__inspector-title" id={titleId} aria-live="polite">
          <span className="vbg-custom-sequence__step-num">Step {step.seq}</span>
          <strong title={step.detailTitle}>{step.detailTitle}</strong>
          <StatusMark status={step.status} />
        </div>
        <div className="vbg-custom-sequence__inspector-actions">
          <button
            type="button"
            className="vbg-custom-sequence__inspector-toggle"
            onClick={onToggle}
            aria-controls={bodyId}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand step details" : "Collapse step details"}
            title={collapsed ? "Expand details" : "Collapse details"}
          >
            <Icon name="chevron" />
          </button>
          <button
            type="button"
            className="vbg-custom-sequence__inspector-close"
            onClick={onClose}
            aria-label="Close step details"
            title="Close details"
          >
            &times;
          </button>
        </div>
      </header>
      <div className="vbg-custom-sequence__inspector-body" id={bodyId} hidden={collapsed}>
        <dl className="vbg-custom-sequence__inspector-meta">
          <div>
            <dt>From</dt>
            <dd>{step.from}</dd>
          </div>
          <div>
            <dt>To</dt>
            <dd>{step.to}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{step.type}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{formatTime(step.at)}</dd>
          </div>
          {step.durationMs !== undefined && (
            <div>
              <dt>Duration</dt>
              <dd>{step.durationMs}ms</dd>
            </div>
          )}
        </dl>
        <EventDetails event={step.event} fallback={step.detail} />
      </div>
    </aside>
  );
}

export function SequenceDiagram({ items }: { items: FlowEvent[] }) {
  const [density, setDensity] = useState<"key" | "all">("key");
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
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

  useEffect(() => {
    if (!selectedStep) return;
    const frame = window.requestAnimationFrame(() => {
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
    });
    return () => window.cancelAnimationFrame(frame);
  }, [inspectorCollapsed, selectedStep]);

  const closeInspector = () => {
    if (!selectedStep) return;
    const stepButtonId = `sequence-step-${selectedStep.seq}`;
    setSelectedStepId(null);
    setInspectorCollapsed(false);
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

  const participantIndices = useMemo(() => {
    const map = new Map<SequenceParticipant, number>();
    model.participants.forEach((p, index) => {
      map.set(p.key, index);
    });
    return map;
  }, [model.participants]);

  const diagramStyle = {
    "--vbg-sequence-columns": model.participants.length,
    minWidth: `${Math.max(420, model.participants.length * 156)}px`,
  } as CSSProperties;

  return (
    <section
      aria-label="Turn sequence diagram"
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
            aria-label="Copy Mermaid"
            className="vbg-custom-sequence__copy-btn"
            onClick={handleCopyMermaid}
            title="Copy Mermaid sequence syntax"
          >
            <Icon name="code" />
            <span aria-live="polite">
              {copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy Mermaid"}
            </span>
          </button>
        </div>
      </div>

      {model.steps.length === 0 ? (
        <div className="vbg-custom-sequence__empty">
          <p>No sequence events to display for this turn.</p>
        </div>
      ) : (
        <div className={`vbg-custom-sequence__workspace${selectedStep ? " vbg-custom-sequence__workspace--with-inspector" : ""}`}>
          <div ref={canvasRef} className="vbg-custom-sequence__canvas" aria-label="Sequence interaction flow">
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
                {model.steps.map((step) => {
                  const fromIdx = participantIndices.get(step.from) ?? 0;
                  const toIdx = participantIndices.get(step.to) ?? 0;
                  const isSelf = step.type === "self" || fromIdx === toIdx;
                  const isReturn = step.type === "return";
                  const numParticipants = model.participants.length;
                  const colWidthPercent = 100 / numParticipants;
                  const isSelected = selectedStepId === step.id;
                  const isComplete = step.status === "completed" || step.status === "complete" || step.status === "approved";
                  const stepButtonId = `sequence-step-${step.seq}`;

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
                        className={`vbg-custom-sequence__step-row ${
                          isSelected ? "vbg-custom-sequence__step-row--selected" : ""
                        }`}
                        onClick={() => {
                          if (isSelected) {
                            closeInspector();
                            return;
                          }
                          if (!selectedStepId) setInspectorCollapsed(false);
                          setSelectedStepId(step.id);
                        }}
                        type="button"
                        aria-expanded={isSelected}
                        aria-controls={isSelected ? "sequence-step-inspector" : undefined}
                        aria-label={`Step ${step.seq}: ${step.label} - ${step.displayTitle}, ${step.from} to ${step.to}`}
                      >
                        <div className="vbg-custom-sequence__step-line-container">
                          {isSelf ? (
                            <div
                              className="vbg-custom-sequence__self-loop"
                              style={{ left: `${startX}%` }}
                            >
                              <span aria-hidden="true" className="vbg-custom-sequence__self-path" />
                              <span className="vbg-custom-sequence__self-badge">
                                <span className="vbg-custom-sequence__step-num">{step.seq}</span>
                                <strong
                                  className={`vbg-custom-sequence__step-title${step.isCommand ? " vbg-custom-sequence__step-title--command" : ""}`}
                                  title={step.title}
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
                              <div className="vbg-custom-sequence__arrow-label" title={`${step.label} · ${step.title}`}>
                                <span className="vbg-custom-sequence__step-num">{step.seq}</span>
                                <strong className={`vbg-custom-sequence__step-title${step.isCommand ? " vbg-custom-sequence__step-title--command" : ""}`}>
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
              collapsed={inspectorCollapsed}
              step={selectedStep}
              onClose={closeInspector}
              onToggle={() => setInspectorCollapsed((current) => !current)}
            />
          )}
        </div>
      )}
    </section>
  );
}
