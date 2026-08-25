import { cn } from "@/lib/cn";

/**
 * 페이지 상단 제목 블록.
 *
 * 제목 크기가 화면마다 `text-xl`~`text-3xl` 로 달랐다. 여기서 한 단계로 고정하고
 * 우측 액션 영역만 화면이 채운다.
 */
export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 text-xs font-semibold tracking-widest text-accent-soft-fg uppercase">
            {eyebrow}
          </p>
        )}

        <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
          {title}
        </h1>

        {description && (
          <p className="mt-2 text-sm text-fg-muted md:text-base">{description}</p>
        )}
      </div>

      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
