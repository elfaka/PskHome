import type { WeddingData } from "@/data/wedding";
import { cn } from "@/lib/cn";
import {
  formatTimeKo,
  pad2,
  parseCeremonyDate,
  WEEKDAYS_EN,
} from "@/lib/wedding/ceremony";

import { Monogram, Sprig } from "./ui/Ornaments";

/**
 * 봉투에서 꺼내는 카드이자 첫 화면의 청첩장 카드.
 *
 * 인트로는 같은 카드를 "copy" 로 하나 더 그려 봉투에서 꺼낸 뒤 첫 화면 카드 자리로 옮긴다.
 * 두 장이 정확히 겹쳐야 하므로 이 안의 치수는 부모 컨테이너(cqi 등)에 의존하면 안 된다.
 * 폭은 부모가 정하고(같은 값), 나머지는 전부 고정 rem.
 */
export default function InvitationCard({
  data,
  variant,
  cardRef,
  headingRef,
  className,
  style,
}: {
  data: WeddingData;
  /** page: 실제 본문(h1, 포커스 대상) / copy: 인트로 연출용 사본(스크린리더에서 숨김) */
  variant: "page" | "copy";
  cardRef?: React.Ref<HTMLDivElement>;
  headingRef?: React.Ref<HTMLHeadingElement>;
  className?: string;
  style?: React.CSSProperties;
}) {
  const date = parseCeremonyDate(data.ceremony.date);
  const { venue } = data;

  const names = (
    <>
      <span lang="en" className="block font-wd-script text-[2.5rem] leading-[1.08] text-wd-ink wd-cover:text-[2.15rem]">
        {data.groom.nameEn}
      </span>
      <span lang="en" className="block font-wd-script text-2xl leading-none text-wd-sage-deep">
        &amp;
      </span>
      <span lang="en" className="block font-wd-script text-[2.5rem] leading-[1.08] text-wd-ink wd-cover:text-[2.15rem]">
        {data.bride.nameEn}
      </span>
      <span className="wd-press mt-3 block text-[0.95rem] tracking-[0.2em] break-keep text-wd-ink">
        {data.groom.name} <span className="text-wd-sage-deep">·</span> {data.bride.name}
      </span>
    </>
  );

  return (
    <div
      ref={cardRef}
      aria-hidden={variant === "copy" || undefined}
      className={cn(
        // 커버 화면(접은 폴더블)은 세로가 짧아 여백을 줄인다 — 미디어 쿼리라 인트로 사본에도 똑같이 적용된다
        "wd-paper-texture relative rounded-[3px] bg-wd-paper px-7 pt-7 pb-8 text-center shadow-wd-letter wd-cover:px-6 wd-cover:pt-5 wd-cover:pb-6",
        className,
      )}
      style={style}
    >
      {/* 인쇄된 이중 괘선 */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-2.5 border border-wd-line" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-[13px] border border-wd-line/50" />

      <Monogram text={data.monogram} className="relative mx-auto w-9 text-wd-sage-deep drop-shadow-[0_1px_0_rgb(255_255_255/0.8)]" />
      <p lang="en" className="wd-press relative mt-3 font-wd-display text-[0.7rem] font-medium tracking-[0.3em] text-wd-sage-deep">
        JOIN US FOR THE WEDDING OF
      </p>

      {variant === "page" ? (
        <h1 id="wd-hero-title" ref={headingRef} tabIndex={-1} className="relative mt-2 outline-none">
          {names}
        </h1>
      ) : (
        <div className="relative mt-2">{names}</div>
      )}

      <Sprig className="relative mx-auto mt-4 w-20 text-wd-sage wd-cover:mt-3" />

      <p className="wd-press relative mt-4 font-wd-display text-lg tracking-[0.18em] text-wd-ink wd-cover:mt-3">
        {date.year}. {pad2(date.month)}. {pad2(date.day)}
        <span lang="en" className="mt-0.5 block text-xs tracking-[0.35em] text-wd-ink-muted">
          {WEEKDAYS_EN[date.weekday]}
          {data.ceremony.time && ` · ${formatTimeKo(data.ceremony.time)}`}
        </span>
      </p>

      <p className="wd-press relative mt-3 text-sm leading-relaxed break-keep text-wd-ink-muted">
        {venue.name}
        {venue.hall && <span className="block">{venue.hall}</span>}
      </p>
    </div>
  );
}
