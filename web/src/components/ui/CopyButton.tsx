import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "../../lib/format";
import { useToast } from "./Toast";

interface CopyButtonProps {
  value: string;
  label?: string;
  toast?: string;
  variant?: "solid" | "ghost" | "chip";
  className?: string;
  children?: ReactNode;
  iconOnly?: boolean;
  title?: string;
}

export function CopyButton({
  value,
  label = "复制",
  toast,
  variant = "ghost",
  className = "",
  children,
  iconOnly = false,
  title,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const { push } = useToast();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleCopy = async () => {
    const ok = await copyText(value);
    if (ok) {
      setCopied(true);
      push(toast ?? `已复制 ${value}`);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1200);
    } else {
      push("浏览器阻止了剪贴板访问，请手动复制", "warning");
    }
  };

  return (
    <button
      type="button"
      className={`copy-btn copy-btn-${variant} ${copied ? "is-copied" : ""} ${className}`}
      onClick={handleCopy}
      title={title ?? `复制 ${value}`}
      aria-label={title ?? `复制 ${value}`}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {!iconOnly && <span>{children ?? (copied ? "已复制" : label)}</span>}
    </button>
  );
}
