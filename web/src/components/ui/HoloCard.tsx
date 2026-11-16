import type { ReactNode } from "react";
import { classNames } from "../../lib/format";

interface HoloCardProps {
  children: ReactNode;
  className?: string;
  glow?: "none" | "cyan" | "amber" | "danger" | "green";
  interactive?: boolean;
  as?: "div" | "section" | "article";
}

export function HoloCard({
  children,
  className,
  glow = "none",
  interactive = false,
  as: Tag = "div",
}: HoloCardProps) {
  return (
    <Tag
      className={classNames(
        "holo-card",
        glow !== "none" && `holo-glow-${glow}`,
        interactive && "holo-card-interactive",
        className,
      )}
    >
      <span className="holo-corner holo-corner-tl" />
      <span className="holo-corner holo-corner-tr" />
      <span className="holo-corner holo-corner-bl" />
      <span className="holo-corner holo-corner-br" />
      {children}
    </Tag>
  );
}
