interface DensitySwitchProps {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  total: number;
  visible: number;
}

export function DensitySwitch({ checked, label, onChange, total, visible }: DensitySwitchProps) {
  return (
    <div className="vbg-custom-density-switch">
      <button
        aria-checked={checked}
        aria-label={label}
        className="vbg-custom-density-switch__control"
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span aria-hidden="true" className="vbg-custom-density-switch__track">
          <span className="vbg-custom-density-switch__thumb" />
        </span>
        <span>Show all</span>
      </button>
      <span aria-label={`${visible} of ${total} visible`} className="vbg-custom-density-switch__count">
        {visible} / {total}
      </span>
    </div>
  );
}
