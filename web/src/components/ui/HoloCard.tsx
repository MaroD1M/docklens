import type { KeyboardEvent, ReactNode } from "react";
import { classNames } from "../../lib/format";

interface HoloCardProps {
  children: ReactNode;
  className?: string;
  glow?: "none" | "cyan" | "amber" | "danger" | "green";
  interactive?: boolean;
  as?: "div" | "section" | "article";
  onClick?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  role?: string;
  tabIndex?: number;
  ariaPressed?: boolean;
  ariaLabel?: string;
}

export function HoloCard({
  children,
  className,
  glow = "none",
  interactive = false,
  as: Tag = "div",
  onClick,
  onKeyDown,
  role,
  tabIndex,
  ariaPressed,
  ariaLabel,
}: HoloCardProps) {
  return (
    <Tag
      className={classNames(
        "holo-card",
        glow !== "none" && `holo-glow-${glow}`,
        interactive && "holo-card-interactive",
        className,
      )}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={role}
      tabIndex={tabIndex}
      aria-pressed={ariaPressed}
      aria-label={ariaLabel}
    >
      <span className="holo-corner holo-corner-tl" />
      <span className="holo-corner holo-corner-tr" />
      <span className="holo-corner holo-corner-bl" />
      <span className="holo-corner holo-corner-br" />
      {children}
    </Tag>
  );
}
