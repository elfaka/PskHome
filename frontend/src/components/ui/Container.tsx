import { cn } from "@/lib/cn";

/**
 * 페이지 가로 폭 컨테이너.
 *
 * 기존에는 화면마다 `max-w-5xl` / `max-w-6xl` / `max-w-xl` 을 직접 적어
 * 라우트를 옮겨 다닐 때 본문 폭이 들쭉날쭉했다. 여기서 단계로 고정한다.
 */
const WIDTH = {
  /** 글 읽기용 — 한 줄이 너무 길어지지 않는 폭 */
  prose: "max-w-3xl",
  /** 기본 콘텐츠 폭 */
  content: "max-w-5xl",
  /** 도구 화면처럼 좌우로 넓게 쓰는 경우 */
  wide: "max-w-6xl",
  /** 화면 폭 전체 — 증권사 시세 화면처럼 정보를 빽빽하게 펼치는 경우 (/stocksim 전용) */
  full: "max-w-none",
} as const;

export default function Container({
  size = "content",
  className,
  children,
}: {
  size?: keyof typeof WIDTH;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full",
        // 전체 폭 화면은 양옆 여백도 최소로 둔다.
        size === "full" ? "px-2 sm:px-3" : "px-4 sm:px-6 lg:px-8",
        WIDTH[size],
        className
      )}
    >
      {children}
    </div>
  );
}
