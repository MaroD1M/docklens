import { classNames } from "../../lib/format";

interface StatusDotProps {
  status: "running" | "stale" | "hidden" | "warning" | "inferred";
  pulse?: boolean;
  className?: string;
}

export function StatusDot({ status, pulse = false, className }: StatusDotProps) {
  return (
    <span
      className={classNames("status-dot", `status-${status}`, pulse && "status-pulse", className)}
      aria-hidden="true"
    />
  );
}
