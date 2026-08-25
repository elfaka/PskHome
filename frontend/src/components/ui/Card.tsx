import { cn } from "@/lib/cn";

/**
 * 카드 표면 클래스.
 *
 * `interactive` 는 링크/버튼 카드용이다. 다크 테마에서는 그림자가 거의 안 보이므로
 * hover 를 그림자 대신 경계선과 배경으로 표현한다.
 */
export function cardClass({
  interactive = false,
  className,
}: { interactive?: boolean; className?: string } = {}) {
  return cn(
    "rounded-card border border-line bg-surface shadow-card",
    interactive &&
      "transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised",
    className
  );
}

export default function Card({
  interactive,
  className,
  children,
  ...rest
}: React.ComponentProps<"div"> & { interactive?: boolean }) {
  return (
    <div className={cardClass({ interactive, className })} {...rest}>
      {children}
    </div>
  );
}
