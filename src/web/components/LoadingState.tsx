export function LoadingState({
  className = "vbg-custom-loading-state",
  description,
  label,
}: {
  className?: string;
  description?: string;
  label: string;
}) {
  return (
    <div aria-live="polite" className={className} role="status">
      <span aria-hidden="true" className="vbg-custom-spinner" />
      <strong>{label}</strong>
      {description && <span>{description}</span>}
    </div>
  );
}
