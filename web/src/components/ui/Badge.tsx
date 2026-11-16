import type { ReactNode } from "react";
import { classNames } from "../../lib/format";

type Tone = "cyan" | "blue" | "green" | "amber" | "red" | "muted" | "violet";

interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}

export function Badge({ children, tone = "muted", dot = false, className }: BadgeProps) {
  return (
    <span className={classNames("badge", `badge-${tone}`, className)}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}
