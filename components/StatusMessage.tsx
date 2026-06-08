import type { ReactNode } from "react";
import { cn } from "../lib/ui";

type StatusTone = "neutral" | "success" | "warning" | "error";

interface StatusMessageProps {
  children: ReactNode;
  className?: string;
  tone?: StatusTone;
}

const toneClassName: Record<StatusTone, string> = {
  neutral: "border-neutral-200 bg-neutral-50 text-neutral-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-red-200 bg-red-50 text-red-800",
};

export function StatusMessage({ children, className, tone = "neutral" }: StatusMessageProps) {
  return (
    <p
      aria-live="polite"
      className={cn("rounded-md border px-3 py-2 text-sm leading-6", toneClassName[tone], className)}
      role="status"
    >
      {children}
    </p>
  );
}
