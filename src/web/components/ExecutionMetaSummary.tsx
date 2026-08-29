export function ExecutionMetaSummary({
  duration,
  durationLabel = "Duration",
  from,
  startedAt,
  startedAtLabel,
  to,
  type,
}: {
  duration?: string;
  durationLabel?: string;
  from?: string;
  startedAt: string;
  startedAtLabel: string;
  to?: string;
  type?: string;
}) {
  const hasDirection = Boolean(from && to);
  return (
    <section aria-label={hasDirection ? `Execution from ${from} to ${to}` : "Execution timing"} className="vbg-custom-execution-meta">
      <dl className="vbg-custom-execution-meta__facts">
        <div>
          <dt>Started</dt>
          <dd><time dateTime={startedAt}>{startedAtLabel}</time></dd>
        </div>
        <div>
          <dt>{durationLabel}</dt>
          <dd>{duration ?? "Not recorded"}</dd>
        </div>
        {hasDirection && (
          <div>
            <dt>Direction</dt>
            <dd className="vbg-custom-execution-meta__route">
              <code title={from}>{from}</code>
              <span aria-hidden="true" className="vbg-custom-execution-meta__arrow">→</span>
              <code title={to}>{to}</code>
            </dd>
          </div>
        )}
        {type && (
          <div>
            <dt>Type</dt>
            <dd><span className="vbg-custom-execution-meta__type">{type}</span></dd>
          </div>
        )}
      </dl>
    </section>
  );
}
