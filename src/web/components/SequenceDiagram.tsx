import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { useClipboardCopy } from "../useClipboardCopy";
import { ExecutionInspector, type ExecutionInspectorItem } from "./ExecutionInspector";
import { FlowViewToolbar } from "./FlowViewToolbar";
import type { FlowEvent } from "./InteractionFlow";
import { Icon } from "./Icon";
import { StatusMark } from "./StatusMark";
import {
  buildSequenceDiagramModel,
  exportMermaidSequence,
  type SequenceParticipant,
  type SequenceStep,
} from "./sequence-diagram-model";

function sequenceInspectorItem(step: SequenceStep): ExecutionInspectorItem {
  return {
    seq: step.seq,
    kind: step.node.kind,
    title: step.detailTitle,
    detail: step.detail,
    status: step.status,
    durationMs: step.durationMs,
    at: step.at,
    from: step.from,
    to: step.toLabel ?? step.to,
    type: step.type,
    event: step.event,
  };
}

interface SequenceStepTooltipState {
  above: boolean;
  left: number;
  stepId: string;
  text: string;
  top: number;
}

export function nextSequenceStepIndex(
  currentIndex: number,
  total: number,
  key: string,
): number | null {
  if (total <= 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return total - 1;
  if (key === "ArrowUp") return Math.max(0, currentIndex - 1);
  if (key === "ArrowDown") return Math.min(total - 1, currentIndex + 1);
  return null;
}

export function SequenceDiagram({ items }: { items: FlowEvent[] }) {
  const [density, setDensity] = useState<"key" | "all">("key");
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const { copy: copyToClipboard, state: copyState } = useClipboardCopy(items, 2_000);
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
      <FlowViewToolbar
        checked={density === "all"}
        className="vbg-custom-sequence__toolbar"
        label="Show all sequence steps"
        onChange={(checked) => setDensity(checked ? "all" : "key")}
        total={model.totalSteps}
        visible={model.visibleSteps}
      >
        <div className="vbg-custom-sequence__actions">
          <button
            type="button"
            aria-label={copyState === "copied" ? "Mermaid copied" : copyState === "error" ? "Copy Mermaid failed" : "Copy Mermaid"}
            className="vbg-custom-sequence__copy-btn"
            onClick={() => void copyToClipboard(exportMermaidSequence(model))}
            title={copyState === "copied" ? "Mermaid copied" : copyState === "error" ? "Copy failed" : "Copy Mermaid sequence syntax"}
          >
            <Icon key={copyState} name={copyState === "copied" ? "check" : copyState === "error" ? "alert" : "copy"} />
            <span aria-live="polite" className="vbg-custom-sr-only">
              {copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy Mermaid"}
            </span>
          </button>
        </div>
      </FlowViewToolbar>

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
                        onKeyDown={(event) => {
                          const nextIndex = nextSequenceStepIndex(stepIndex, model.steps.length, event.key);
                          if (nextIndex === null) return;
                          event.preventDefault();
                          const nextStep = model.steps[nextIndex];
                          setStepTooltip(null);
                          setSelectedStepId(nextStep.id);
                          window.requestAnimationFrame(() => {
                            document.getElementById(`sequence-step-${nextStep.seq}`)?.focus();
                          });
                        }}
                        type="button"
                        tabIndex={selectedStepId ? (isSelected ? 0 : -1) : stepIndex === 0 ? 0 : -1}
                        aria-expanded={isSelected}
                        aria-controls={isSelected ? "execution-inspector" : undefined}
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
            <ExecutionInspector
              key={selectedStep.id}
              item={sequenceInspectorItem(selectedStep)}
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
