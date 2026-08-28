export function ExecutionMetaSummary({
  duration,
  from,
  startedAt,
  startedAtLabel,
  to,
  type,
}: {
  duration?: string;
  from: string;
  startedAt: string;
  startedAtLabel: string;
  to: string;
  type: string;
}) {
  return (
    <section aria-label={`Execution from ${from} to ${to}`} className="vbg-custom-execution-meta">
      <div className="vbg-custom-execution-meta__primary">
        <div className="vbg-custom-execution-meta__eyebrow">
          <span>Direction</span>
          <span className="vbg-custom-execution-meta__type">{type}</span>
        </div>
        <div className="vbg-custom-execution-meta__route">
          <code title={from}>{from}</code>
          <span aria-hidden="true" className="vbg-custom-execution-meta__arrow">→</span>
          <code title={to}>{to}</code>
        </div>
      </div>
      <dl className="vbg-custom-execution-meta__facts">
        <div>
          <dt>Started</dt>
          <dd><time dateTime={startedAt}>{startedAtLabel}</time></dd>
        </div>
        {duration && (
          <div>
            <dt>Duration</dt>
            <dd>{duration}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
