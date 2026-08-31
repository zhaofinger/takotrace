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
import { ExecutionOverview } from "./ExecutionOverview";
import {
  ExecutionInspector,
  restoreFocusAfterInspectorClose,
  type ExecutionInspectorItem,
} from "./ExecutionInspector";
import type { OpenSubagentHandler } from "./EventDetails";
import type { FlowEvent } from "./InteractionFlow";
import { Icon } from "./Icon";
import { MarkdownContent } from "./MarkdownContent";
import { StatusMark } from "./StatusMark";
import {
  buildSequenceDiagramModel,
  exportMermaidSequence,
  type SequenceDiagramScope,
  type SequenceParticipant,
  type SequenceStep,
  type SequenceThreadContext,
} from "./sequence-diagram-model";

function sequenceInspectorItem(
  step: SequenceStep,
  participantLabels: Map<SequenceParticipant, string>,
): ExecutionInspectorItem {
  return {
    seq: step.seq,
    kind: step.node.kind,
    title: step.displayTitle,
    fullTitle: step.detailTitle,
    detail: step.detail,
    status: step.status,
    durationMs: step.durationMs,
    at: step.at,
    from: participantLabels.get(step.from) ?? step.from,
    to: step.toLabel ?? participantLabels.get(step.to) ?? step.to,
    type: step.type,
    event: step.event,
  };
}

interface SequenceStepTooltipState {
  above: boolean;
  left: number;
  maxHeight: number;
  stepId: string;
  text: string;
  top: number;
}

export function sequenceTooltipLayout(
  rect: Pick<DOMRect, "bottom" | "left" | "top" | "width">,
  viewport: { height: number; width: number },
) {
  const edgePadding = 12;
  const maxWidth = Math.max(1, Math.min(480, viewport.width - edgePadding * 2));
  const halfWidth = maxWidth / 2;
  const belowSpace = Math.max(0, viewport.height - rect.bottom - edgePadding);
  const aboveSpace = Math.max(0, rect.top - edgePadding);
  const above = belowSpace < Math.min(240, aboveSpace);
  return {
    above,
    left: Math.min(
      Math.max(rect.left + rect.width / 2, edgePadding + halfWidth),
      viewport.width - edgePadding - halfWidth,
    ),
    maxHeight: Math.max(24, Math.min(320, above ? aboveSpace : belowSpace)),
    top: above ? rect.top - 8 : rect.bottom + 8,
  };
}

export function sequenceTooltipContent(
  step: Pick<SequenceStep, "detail" | "detailTitle">,
): string {
  return step.detail.trim() || step.detailTitle;
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

export function SequenceDiagram({
  initialSelectedStepId,
  items,
  onOpenSubagent,
  scope = "main",
  threadContext,
}: {
  initialSelectedStepId?: string;
  items: FlowEvent[];
  onOpenSubagent?: OpenSubagentHandler;
  scope?: SequenceDiagramScope;
  threadContext?: SequenceThreadContext;
}) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(initialSelectedStepId ?? null);
  const { copy: copyToClipboard, state: copyState } = useClipboardCopy(items, 2_000);
  const [stepTooltip, setStepTooltip] = useState<SequenceStepTooltipState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const tooltipCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const model = useMemo(
    () => buildSequenceDiagramModel(items, scope, threadContext),
    [items, scope, threadContext],
  );

  const selectedStep = useMemo(
    () => model.steps.find((step) => step.id === selectedStepId),
    [model.steps, selectedStepId],
  );

  const selectOverviewItem = (eventId: string) => {
    const step = model.steps.find((item) => item.id === `seq-${eventId}`);
    if (!step) return;
    setStepTooltip(null);
    setSelectedStepId((current) => current === step.id ? null : step.id);
  };

  useEffect(() => {
    if (selectedStepId && !selectedStep) setSelectedStepId(null);
  }, [selectedStep, selectedStepId]);

  useEffect(() => () => {
    if (tooltipCloseTimerRef.current) clearTimeout(tooltipCloseTimerRef.current);
  }, []);

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
    restoreFocusAfterInspectorClose(stepButtonId);
  };

  const cancelTooltipClose = () => {
    if (!tooltipCloseTimerRef.current) return;
    clearTimeout(tooltipCloseTimerRef.current);
    tooltipCloseTimerRef.current = null;
  };

  const closeStepTooltip = (delay = 0) => {
    cancelTooltipClose();
    if (delay === 0) {
      setStepTooltip(null);
      return;
    }
    tooltipCloseTimerRef.current = setTimeout(() => {
      tooltipCloseTimerRef.current = null;
      setStepTooltip(null);
    }, delay);
  };

  const showStepTooltip = (target: HTMLElement, step: SequenceStep) => {
    cancelTooltipClose();
    const rect = target.getBoundingClientRect();
    const layout = sequenceTooltipLayout(rect, { height: window.innerHeight, width: window.innerWidth });
    setStepTooltip({
      stepId: step.id,
      text: sequenceTooltipContent(step),
      ...layout,
    });
  };

  const participantIndices = useMemo(() => {
    const map = new Map<SequenceParticipant, number>();
    model.participants.forEach((p, index) => {
      map.set(p.key, index);
    });
    return map;
  }, [model.participants]);

  const participantLabels = useMemo(
    () => new Map(model.participants.map((participant) => [participant.key, participant.label])),
    [model.participants],
  );

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
      {model.steps.length === 0 ? (
        <div className="vbg-custom-sequence__empty">
          <p>No sequence events to display for this run.</p>
        </div>
      ) : (
        <>
        <div className="vbg-custom-sequence__overview">
          <ExecutionOverview
            items={items}
            onSelect={selectOverviewItem}
            selectedId={selectedStep?.id.replace(/^seq-/, "")}
          />
        </div>
        <div className={`vbg-custom-sequence__workspace${selectedStep ? " vbg-custom-sequence__workspace--with-inspector" : ""}`}>
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
          <div
            ref={canvasRef}
            className="vbg-custom-sequence__canvas"
            aria-label="Sequence interaction flow"
            onScroll={() => closeStepTooltip()}
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
                        aria-label={`Step ${step.seq}: ${step.label} - ${step.detailTitle}, ${participantLabels.get(step.from) ?? step.from} to ${step.toLabel ?? participantLabels.get(step.to) ?? step.to}${parallelGroup ? `, ${parallelGroup.label}` : ""}`}
                        onBlur={() => closeStepTooltip()}
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
                                  data-tooltip={sequenceTooltipContent(step)}
                                  onMouseEnter={(event) => showStepTooltip(event.currentTarget, step)}
                                  onMouseLeave={() => closeStepTooltip(100)}
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
                                  data-tooltip={sequenceTooltipContent(step)}
                                  onMouseEnter={(event) => showStepTooltip(event.currentTarget, step)}
                                  onMouseLeave={() => closeStepTooltip(100)}
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
              autoFocusClose={false}
              item={sequenceInspectorItem(selectedStep, participantLabels)}
              onClose={closeInspector}
              onOpenSubagent={onOpenSubagent}
              subagentView="sequence"
            />
          )}
        </div>
        </>
      )}
      {stepTooltip && typeof document !== "undefined" && createPortal(
        <div
          className={`vbg-custom-sequence__tooltip${stepTooltip.above ? " vbg-custom-sequence__tooltip--above" : ""}`}
          id="sequence-step-tooltip"
          onMouseEnter={cancelTooltipClose}
          onMouseLeave={() => closeStepTooltip()}
          role="tooltip"
          style={{ left: stepTooltip.left, maxHeight: stepTooltip.maxHeight, top: stepTooltip.top }}
        >
          <MarkdownContent>{stepTooltip.text}</MarkdownContent>
        </div>,
        document.body,
      )}
    </section>
  );
}
