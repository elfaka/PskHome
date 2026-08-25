import { cn } from "@/lib/cn";

/** 목록이 비었을 때 보여주는 안내. */
export default function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-dashed border-line bg-surface/60 px-6 py-14 text-center",
        className
      )}
    >
      <p className="text-sm font-medium text-fg">{title}</p>

      {description && (
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-fg-muted">
          {description}
        </p>
      )}

      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
