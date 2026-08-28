import { Icon } from "./Icon";

export function statusTone(status: string): string {
  const normalized = status.toLowerCase();
  if (["completed", "complete", "approved", "connected"].includes(normalized)) return "success";
  if (["pending", "blocked", "approval", "review_required"].includes(normalized)) return "warning";
  if (["error", "failed", "disconnected"].includes(normalized)) return "danger";
  return "active";
}

export function StatusMark({ status, label = true }: { status: string; label?: boolean }) {
  const tone = statusTone(status);
  return (
    <span className={`vbg-custom-status vbg-custom-status--${tone}`}>
      <span aria-hidden="true" className="vbg-custom-status__icon">
        <Icon name={tone === "success"
          ? "statusSuccess"
          : tone === "danger"
            ? "statusDanger"
            : tone === "warning"
              ? "statusWarning"
              : "statusActive"} />
      </span>
      {label && <span>{status || "unknown"}</span>}
      {!label && <span className="vbg-visually-hidden">{status || "unknown"}</span>}
    </span>
  );
}
