import { Icon } from "./Icon";
import { useClipboardCopy } from "../useClipboardCopy";

export function CopyIconButton({
  copiedLabel,
  copyLabel,
  errorLabel = "Copy failed",
  value,
}: {
  copiedLabel: string;
  copyLabel: string;
  errorLabel?: string;
  value: string;
}) {
  const { copy, state } = useClipboardCopy(value);
  const copied = state === "copied";
  return (
    <button
      aria-label={copied ? copiedLabel : state === "error" ? errorLabel : copyLabel}
      aria-live="polite"
      className={`vbg-custom-id-copy${copied ? " vbg-custom-is-copied" : ""}`}
      onClick={() => void copy(value)}
      title={copied ? "Copied" : state === "error" ? "Copy failed" : copyLabel}
      type="button"
    >
      <Icon key={state} name={copied ? "check" : state === "error" ? "alert" : "copy"} />
    </button>
  );
}
