import { cn } from "@/lib/cn";

/**
 * 입력 컨트롤 공통 클래스.
 *
 * 기존에는 인풋마다 `focus:ring-2 focus:ring-emerald-200` / `ring-violet-200` /
 * `ring-zinc-300` 을 따로 적어 화면별로 포커스 색이 달랐다.
 * 포커스 링은 globals.css 의 `:focus-visible` 이 accent 로 전역 처리한다.
 */
const CONTROL_BASE =
  "w-full rounded-control border border-line bg-surface text-fg placeholder:text-fg-subtle transition " +
  "hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-60";

export function Input({ className, ...rest }: React.ComponentProps<"input">) {
  return (
    <input className={cn(CONTROL_BASE, "h-10 px-3 text-sm", className)} {...rest} />
  );
}

export function Textarea({
  className,
  ...rest
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(CONTROL_BASE, "px-3 py-2.5 text-sm leading-7", className)}
      {...rest}
    />
  );
}

export function Select({ className, ...rest }: React.ComponentProps<"select">) {
  return (
    <select className={cn(CONTROL_BASE, "h-10 px-3 text-sm", className)} {...rest} />
  );
}

/** 라벨 + 컨트롤 묶음. 라벨을 빼먹어 접근성이 깨지는 것을 막는다. */
export function Field({
  label,
  hint,
  htmlFor,
  className,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-fg-muted">
        {label}
      </label>

      {children}

      {hint && <p className="text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}
