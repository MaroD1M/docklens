import { classNames } from "../../lib/format";

interface ProgressBarProps {
  value: number;
  tone?: "cyan" | "green" | "amber" | "red";
  className?: string;
  label?: string;
}

export function ProgressBar({ value, tone = "cyan", className, label }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div className={classNames("progress", className)}>
      <div
        className={`progress-fill progress-${tone}`}
        style={{ width: `${Math.max(clamped * 100, clamped > 0 ? 1.5 : 0)}%` }}
      />
      {label && <span className="progress-label">{label}</span>}
    </div>
  );
}
