import { cn } from "@/lib/cn";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info";

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-fg-muted",
  accent: "bg-accent-soft text-accent-soft-fg",
  success: "bg-success-soft text-success-soft-fg",
  warning: "bg-warning-soft text-warning-soft-fg",
  danger: "bg-danger-soft text-danger-soft-fg",
  info: "bg-info-soft text-info-soft-fg",
};

/**
 * 상태/메타 배지.
 *
 * 기존에 `bg-zinc-100 text-zinc-700`, `bg-emerald-50 text-emerald-700`,
 * `bg-sky-100 text-sky-700` 등으로 흩어져 있던 것을 tone 하나로 모은다.
 */
export default function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
