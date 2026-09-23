import { cn } from "@/lib/cn";

type SvgProps = { className?: string };

/** 가로 구분선 — 가운데서 양쪽으로 뻗는 잎 줄기 */
export function Sprig({ className }: SvgProps) {
  const leaf = "M0 0 C3 -4.5 8 -5.5 12 -4 C9 0.5 4 1.5 0 0 Z";
  return (
    <svg
      viewBox="0 0 120 16"
      aria-hidden="true"
      className={cn("h-auto overflow-visible", className)}
    >
      <path
        d="M8 8 H112"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinecap="round"
        fill="none"
      />
      {[18, 34, 50].map((x) => (
        <g key={`l${x}`}>
          <path d={leaf} transform={`translate(${x} 8) rotate(-18)`} fill="currentColor" />
          <path d={leaf} transform={`translate(${x} 8) scale(1 -1) rotate(-18)`} fill="currentColor" opacity="0.7" />
        </g>
      ))}
      {[102, 86, 70].map((x) => (
        <g key={`r${x}`}>
          <path d={leaf} transform={`translate(${x} 8) scale(-1 1) rotate(-18)`} fill="currentColor" />
          <path d={leaf} transform={`translate(${x} 8) scale(-1 -1) rotate(-18)`} fill="currentColor" opacity="0.7" />
        </g>
      ))}
      <circle cx="60" cy="8" r="2.2" fill="currentColor" />
    </svg>
  );
}

/** 칼라 릴리 두 송이 — 봉투·카드 모서리 포인트 */
export function CallaLily({ className }: SvgProps) {
  return (
    <svg
      viewBox="0 0 70 120"
      aria-hidden="true"
      className={cn("h-auto overflow-visible", className)}
    >
      <g fill="none" strokeLinecap="round" className="stroke-wd-sage">
        <path d="M22 118 C24 90 26 62 36 34" strokeWidth="1.6" />
        <path d="M30 118 C34 96 42 78 54 62" strokeWidth="1.4" />
      </g>
      <g className="fill-wd-paper stroke-wd-sage-light" strokeWidth="0.9">
        <path d="M36 34 C24 28 19 13 27 3 C31 11 42 13 48 9 C46 21 42 30 36 34 Z" />
        <path d="M54 62 C46 60 41 51 45 43 C48 48 55 49 59 46 C60 53 58 59 54 62 Z" />
      </g>
      <g className="stroke-wd-sage-light" strokeWidth="1.4" strokeLinecap="round">
        <path d="M36 33 L32 15" />
        <path d="M54 61 L50 50" />
      </g>
    </svg>
  );
}

/** 타원 실링 모노그램 */
export function Monogram({
  text,
  className,
}: SvgProps & { text: string }) {
  return (
    <svg viewBox="0 0 60 80" aria-hidden="true" className={cn("h-auto", className)}>
      <ellipse cx="30" cy="40" rx="27" ry="37" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <ellipse cx="30" cy="40" rx="23" ry="33" fill="none" stroke="currentColor" strokeWidth="0.5" />
      <text
        x="30"
        y="47"
        textAnchor="middle"
        fill="currentColor"
        fontSize="19"
        style={{ fontFamily: "var(--wd-font-script), cursive" }}
      >
        {text}
      </text>
    </svg>
  );
}
