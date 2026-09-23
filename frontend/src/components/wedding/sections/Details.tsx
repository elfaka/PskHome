"use client";

import type { MapLinks, WeddingData } from "@/data/wedding";
import { cn } from "@/lib/cn";
import {
  formatTimeKo,
  monthGrid,
  parseCeremonyDate,
  WEEKDAYS_KO,
} from "@/lib/wedding/ceremony";
import { copyText } from "@/lib/wedding/copy";

import Reveal from "../ui/Reveal";
import SectionHeading from "../ui/SectionHeading";

const cardClass = "wd-paper-texture rounded-[1.25rem] bg-wd-paper p-6 text-center shadow-wd-card";
const pillClass =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-wd-sage-deep px-5 text-sm text-wd-sage-deep transition-colors hover:bg-wd-sage-soft";

const MAP_LABELS: Record<keyof MapLinks, string> = {
  naver: "네이버 지도",
  kakao: "카카오맵",
  tmap: "티맵",
};

function CalendarCard({ data }: { data: WeddingData }) {
  const d = parseCeremonyDate(data.ceremony.date);
  const weeks = monthGrid(d.year, d.month);

  return (
    <div className={cardClass}>
      <h3 className="text-xs font-medium tracking-[0.35em] text-wd-sage-deep">일시</h3>
      <p className="mt-4 text-lg text-wd-ink">
        {d.year}년 {d.month}월 {d.day}일 {WEEKDAYS_KO[d.weekday]}요일
      </p>
      <p className="mt-1 text-sm text-wd-ink-muted">
        {data.ceremony.time ? formatTimeKo(data.ceremony.time) : "예식 시간은 추후 안내드릴게요"}
      </p>

      <table className="mx-auto mt-6 w-full max-w-[17rem] border-collapse text-sm">
        <caption className="sr-only">
          {d.year}년 {d.month}월 달력, {d.day}일 예식
        </caption>
        <thead>
          <tr>
            {WEEKDAYS_KO.map((w, i) => (
              <th
                key={w}
                scope="col"
                className={cn("pb-2 font-normal", i === 0 ? "text-wd-danger" : "text-wd-ink-muted")}
              >
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((day, di) => (
                <td key={di} className="p-0.5 text-center">
                  {day === d.day ? (
                    <span
                      aria-current="date"
                      className="mx-auto flex size-8 items-center justify-center rounded-full bg-wd-sage-deep font-medium text-wd-paper"
                    >
                      {day}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "mx-auto flex size-8 items-center justify-center",
                        di === 0 ? "text-wd-danger" : "text-wd-ink",
                      )}
                    >
                      {day ?? ""}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VenueCard({
  venue,
  onNotify,
}: {
  venue: WeddingData["venue"];
  onNotify: (message: string) => void;
}) {
  const { address } = venue;
  const maps = (Object.keys(MAP_LABELS) as (keyof MapLinks)[]).flatMap((k) => {
    const href = venue.maps?.[k];
    return href ? [{ key: k, href }] : [];
  });

  async function copyAddress(address: string) {
    const ok = await copyText(address);
    onNotify(ok ? "주소를 복사했어요." : "복사하지 못했어요. 주소를 길게 눌러 복사해 주세요.");
  }

  return (
    <div className={cardClass}>
      <h3 className="text-xs font-medium tracking-[0.35em] text-wd-sage-deep">장소</h3>
      <p className="mt-4 text-lg break-keep text-wd-ink">{venue.name}</p>
      {venue.hall && <p className="mt-1 text-sm text-wd-ink-muted">{venue.hall}</p>}

      {address && (
        <>
          <p className="mt-4 text-sm leading-relaxed break-keep text-wd-ink select-all">
            {address}
          </p>
          <button
            type="button"
            className={cn(pillClass, "mt-4")}
            onClick={() => copyAddress(address)}
          >
            주소 복사
          </button>
        </>
      )}

      {venue.tel && (
        <p className="mt-4 text-sm">
          <a href={`tel:${venue.tel.replace(/[^\d+]/g, "")}`} className="text-wd-sage-deep underline underline-offset-4">
            {venue.tel}
          </a>
        </p>
      )}

      {maps.length > 0 && (
        <ul className="mt-5 flex flex-wrap justify-center gap-2">
          {maps.map(({ key, href }) => (
            <li key={key}>
              <a href={href} target="_blank" rel="noopener noreferrer" className={pillClass}>
                {MAP_LABELS[key]}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Details({
  data,
  onNotify,
}: {
  data: WeddingData;
  onNotify: (message: string) => void;
}) {
  const transport = data.venue.transport?.filter((t) => t.lines.length > 0) ?? [];

  return (
    <section aria-label="예식 안내" className="@container px-6 py-20 wd-cover:py-14">
      <Reveal>
        <SectionHeading label="예식 안내" script="Details" />
      </Reveal>

      <div className="mx-auto mt-12 grid max-w-[44rem] gap-5 @[34rem]:grid-cols-2 @[34rem]:gap-x-10">
        <Reveal className="grid">
          <CalendarCard data={data} />
        </Reveal>
        <Reveal delay={0.08} className="grid">
          <VenueCard venue={data.venue} onNotify={onNotify} />
        </Reveal>

        {transport.length > 0 && (
          <Reveal delay={0.12} className="@[34rem]:col-span-2">
            <div className={cn(cardClass, "text-left")}>
              <h3 className="text-center text-xs font-medium tracking-[0.35em] text-wd-sage-deep">
                오시는 길
              </h3>
              <dl className="mt-5 grid gap-4 @[34rem]:grid-cols-3 @[34rem]:gap-x-8">
                {transport.map((t) => (
                  <div key={t.label}>
                    <dt className="text-sm font-medium text-wd-ink">{t.label}</dt>
                    {t.lines.map((line) => (
                      <dd key={line} className="mt-1 text-sm leading-relaxed break-keep text-wd-ink-muted">
                        {line}
                      </dd>
                    ))}
                  </div>
                ))}
              </dl>
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}
