import type { WeddingData } from "@/data/wedding";
import {
  formatTimeKo,
  pad2,
  parseCeremonyDate,
  WEEKDAYS_EN,
} from "@/lib/wedding/ceremony";

/*
  위가 장식적으로 솟고 양옆에 홈이 파인 액자형 카드 (viewBox 100 × 150 = 카드 2:3).
  종이 질감은 HTML 층에 깔고 이 윤곽으로 마스크한다. 괘선은 같은 윤곽을 안으로 줄인 선이다.
  글자 크기는 장면 컨테이너 폭(cqw) 기준 — 장면 전체가 한 장의 그림처럼 같은 비율로 줄고 늘어난다.
*/
const OUTLINE =
  "M3 150 L3 58 C3 52 7 50 7 46 C7 42 3 40 3 34 C3 20 16 14 28 12 C38 10 44 6 50 2 C56 6 62 10 72 12 C84 14 97 20 97 34 C97 40 93 42 93 46 C93 50 97 52 97 58 L97 150 Z";
const INNER =
  "M7.5 150 L7.5 60 C7.5 55 11.5 52 11.5 46 C11.5 40 7.5 38.5 7.5 34.5 C7.5 23.5 18.5 18.5 29 16.5 C39 14.5 45 10.8 50 7.4 C55 10.8 61 14.5 71 16.5 C81.5 18.5 92.5 23.5 92.5 34.5 C92.5 38.5 88.5 40 88.5 46 C88.5 52 92.5 55 92.5 60 L92.5 150";
const INNER2 =
  "M10 150 L10 61 C10 56 14 53 14 46 C14 40 10 38.5 10 35 C10 25.5 20 21 30 19 C39.5 17 45.5 13.5 50 10.4 C54.5 13.5 60.5 17 70 19 C80 21 90 25.5 90 35 C90 38.5 86 40 86 46 C86 53 90 56 90 61 L90 150";

const MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 150' preserveAspectRatio='none'><path d='${OUTLINE}' fill='black'/></svg>`,
)}")`;

/** 왁스 실링 — 가장자리가 울퉁불퉁 녹아 붙은 원. 결정적 좌표라 서버/클라이언트가 같다 */
function WaxSeal({ monogram }: { monogram: string }) {
  const pts = Array.from({ length: 30 }, (_, i) => {
    const a = (i / 30) * Math.PI * 2;
    const r = 46 + Math.sin(i * 2.7) * 2.2 + Math.cos(i * 1.3) * 1.4;
    return [50 + Math.cos(a) * r, 50 + Math.sin(a) * r];
  });
  const d = `M ${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ")} Z`;
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="h-auto w-full drop-shadow-[0_1px_1.5px_rgb(59_47_34/0.3)]">
      <defs>
        <radialGradient id="wd-wax" cx="0.38" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#8b9870" />
          <stop offset="0.55" stopColor="#6c7852" />
          <stop offset="1" stopColor="#56613f" />
        </radialGradient>
      </defs>
      <path d={d} fill="url(#wd-wax)" strokeLinejoin="round" stroke="#56613f" strokeWidth="1.2" />
      <circle cx="50" cy="50" r="33" fill="none" stroke="#4d5738" strokeWidth="2.2" opacity="0.55" />
      <circle cx="50" cy="50" r="33" fill="none" stroke="#a7b38b" strokeWidth="0.8" opacity="0.7" transform="translate(0.8 0.9)" />
      {/* 눌러 찍힌 모노그램: 어두운 그림자 + 밝은 윗면 */}
      <text x="50" y="61" textAnchor="middle" fontSize="30" fill="#4a5436" style={{ fontFamily: "var(--wd-font-script), cursive" }}>
        {monogram}
      </text>
      <text x="49.3" y="60.2" textAnchor="middle" fontSize="30" fill="#b9c39d" style={{ fontFamily: "var(--wd-font-script), cursive" }}>
        {monogram}
      </text>
    </svg>
  );
}

export default function SceneCard({
  data,
  headingRef,
}: {
  data: WeddingData;
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  const date = parseCeremonyDate(data.ceremony.date);
  const { venue } = data;

  return (
    <div className="relative aspect-[2/3] w-full drop-shadow-[0_10px_16px_rgb(59_47_34/0.22)]">
      {/* 종이 — 윤곽 마스크 */}
      <div
        className="wd-paper-texture absolute inset-0 bg-wd-paper"
        style={{ maskImage: MASK, WebkitMaskImage: MASK, maskSize: "100% 100%", WebkitMaskSize: "100% 100%" }}
      />
      <svg viewBox="0 0 100 150" aria-hidden="true" className="absolute inset-0 h-full w-full">
        <path d={INNER} fill="none" className="stroke-wd-sage-deep" strokeWidth="0.7" />
        <path d={INNER2} fill="none" className="stroke-wd-sage-light" strokeWidth="0.35" />
      </svg>

      <div className="absolute top-[1.5%] left-1/2 w-[22%] -translate-x-1/2">
        <WaxSeal monogram={data.monogram} />
      </div>

      <div className="absolute inset-x-[12%] top-[19%] flex flex-col items-center text-center">
        <p lang="en" className="wd-press font-wd-display text-[2cqw] font-medium tracking-[0.2em] whitespace-nowrap text-wd-sage-deep">
          JOIN US FOR THE WEDDING OF
        </p>
        <h1 id="wd-hero-title" ref={headingRef} tabIndex={-1} className="mt-[1.5cqw] outline-none">
          <span lang="en" className="block font-wd-script text-[7.6cqw] leading-[1.05] text-wd-ink">
            {data.groom.nameEn}
          </span>
          <span lang="en" className="block font-wd-script text-[4.4cqw] leading-none text-wd-sage-deep">
            &amp;
          </span>
          <span lang="en" className="block font-wd-script text-[7.6cqw] leading-[1.05] text-wd-ink">
            {data.bride.nameEn}
          </span>
          <span className="wd-press mt-[2cqw] block text-[3.5cqw] tracking-[0.18em] break-keep text-wd-ink">
            {data.groom.name} <span className="text-wd-sage-deep">·</span> {data.bride.name}
          </span>
        </h1>

        <p className="wd-press mt-[2.2cqw] font-wd-display text-[4.1cqw] tracking-[0.16em] text-wd-ink">
          {date.year}. {pad2(date.month)}. {pad2(date.day)}
          <span lang="en" className="block text-[2.2cqw] tracking-[0.32em] text-wd-ink-muted">
            {WEEKDAYS_EN[date.weekday]}
            {data.ceremony.time && ` · ${formatTimeKo(data.ceremony.time)}`}
          </span>
        </p>
        <p className="wd-press mt-[1.4cqw] text-[3cqw] leading-snug break-keep text-wd-ink-muted">
          {venue.name}
          {venue.hall && <span className="block">{venue.hall}</span>}
        </p>
      </div>
    </div>
  );
}
