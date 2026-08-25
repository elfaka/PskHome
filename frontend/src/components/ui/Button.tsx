import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-fg shadow-card hover:bg-accent-hover disabled:hover:bg-accent",
  secondary:
    "border border-line bg-surface text-fg shadow-card hover:border-line-strong hover:bg-surface-hover",
  ghost: "text-fg-muted hover:bg-surface-hover hover:text-fg",
  danger:
    "border border-danger/30 bg-danger-soft text-danger-soft-fg hover:border-danger/50",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-12 gap-2 px-6 text-sm",
};

/**
 * 버튼 클래스 생성기.
 *
 * `<button>` 뿐 아니라 `next/link` 에도 붙여야 하므로(목록→작성 이동 등)
 * 컴포넌트가 아니라 클래스 함수로 뽑아 둔다. 링크를 button 으로 감싸는
 * 안티패턴을 피하려는 의도다.
 */
export function buttonClass({
  variant = "secondary",
  size = "md",
  full = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  className?: string;
} = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-control font-medium whitespace-nowrap transition",
    "disabled:cursor-not-allowed disabled:opacity-50",
    VARIANT[variant],
    SIZE[size],
    full && "w-full",
    className
  );
}

type ButtonProps = React.ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
};

export default function Button({
  variant,
  size,
  full,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      // 폼 안에서 의도치 않은 submit 을 막으려고 기본값을 button 으로 둔다.
      type={type}
      className={buttonClass({ variant, size, full, className })}
      {...rest}
    />
  );
}
