import { cn } from "@/lib/cn";

/**
 * 로딩 자리표시자.
 *
 * 기존에는 "불러오는 중…" 텍스트 한 줄만 보여줘서 목록이 들어오는 순간
 * 레이아웃이 크게 튀었다. 실제 카드와 비슷한 덩치를 미리 잡아둔다.
 */
export default function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-control bg-surface-2", className)}
    />
  );
}
