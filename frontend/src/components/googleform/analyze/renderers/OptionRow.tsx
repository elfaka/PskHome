import { cn } from "@/lib/cn";

/**
 * 보기 한 줄 — 라벨 + 비율 막대 + 수치.
 *
 * ChoiceRenderer 와 ScaleRenderer 가 같은 마크업을 각각 들고 있었다.
 * 막대 색을 바꾸려면 두 곳을 고쳐야 했으므로 하나로 모은다.
 */
export default function OptionRow({
  label,
  rate,
  count,
}: {
  label: string;
  rate: number;
  count: number;
}) {
  // 백엔드 값이 튀어도 막대가 컨테이너를 넘지 않도록 0~100 으로 자른다.
  const width = Math.min(100, Math.max(0, rate));

  return (
    <li className="rounded-control border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-fg">{label}</div>

          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
            role="meter"
            aria-valuenow={width}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label} 비율`}
          >
            <div
              className={cn("h-full rounded-full bg-accent transition-[width]")}
              style={{ width: `${width}%` }}
            />
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold text-fg">{rate}%</div>
          <div className="text-xs text-fg-subtle">{count}명</div>
        </div>
      </div>
    </li>
  );
}
