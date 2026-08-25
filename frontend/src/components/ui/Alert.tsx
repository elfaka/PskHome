import { cn } from "@/lib/cn";

const TONE = {
  danger: "border-danger/30 bg-danger-soft text-danger-soft-fg",
  warning: "border-warning/30 bg-warning-soft text-warning-soft-fg",
  info: "border-info/30 bg-info-soft text-info-soft-fg",
} as const;

/**
 * 인라인 알림 박스.
 *
 * 에러 표시가 화면마다 `border-red-200 bg-red-50` / `border-rose-200 bg-rose-50`
 * 로 갈려 있던 것을 하나로 모은다.
 */
export default function Alert({
  tone = "danger",
  title,
  className,
  children,
}: {
  tone?: keyof typeof TONE;
  title?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-card border px-4 py-3 text-sm",
        TONE[tone],
        className
      )}
    >
      {title && <div className="font-semibold">{title}</div>}
      {children && <div className={cn(title && "mt-1")}>{children}</div>}
    </div>
  );
}
