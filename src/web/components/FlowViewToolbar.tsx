import type { ReactNode } from "react";
import { DensitySwitch } from "./DensitySwitch";

export function FlowViewToolbar({
  checked,
  children,
  className,
  label,
  onChange,
  total,
  visible,
}: {
  checked: boolean;
  children?: ReactNode;
  className?: string;
  label: string;
  onChange: (checked: boolean) => void;
  total: number;
  visible: number;
}) {
  return (
    <header className={`vbg-custom-flow-toolbar${className ? ` ${className}` : ""}`}>
      <DensitySwitch checked={checked} label={label} onChange={onChange} total={total} visible={visible} />
      {children}
    </header>
  );
}
