import type { StoryItem } from "@/data/wedding";
import { cn } from "@/lib/cn";

import PhotoFrame from "../ui/PhotoFrame";
import Reveal from "../ui/Reveal";
import SectionHeading from "../ui/SectionHeading";

/**
 * 좁은 화면: 사진 → 글 세로 쌓기.
 * 펼친 폴더블/데스크톱(@34rem~): 2단 지그재그. 거터가 가운데라 폴더블 메인 화면의 접힘선 위에 글자가 걸리지 않는다.
 */
export default function OurStory({ items }: { items: StoryItem[] }) {
  if (items.length === 0) return null;

  return (
    <section aria-label="우리의 이야기" className="@container bg-wd-paper/60 px-6 py-20 wd-cover:py-14">
      <Reveal>
        <SectionHeading label="우리의 이야기" script="Our Story" />
      </Reveal>

      <ol className="mx-auto mt-14 grid max-w-[44rem] gap-16 @[34rem]:gap-20">
        {items.map((item, i) => {
          const flip = i % 2 === 1;
          return (
            <li key={`${item.date}-${item.title}`}>
              <Reveal
                className={cn(
                  "grid justify-items-center gap-6 text-center",
                  "@[34rem]:grid-cols-2 @[34rem]:items-center @[34rem]:gap-x-16",
                )}
              >
                <PhotoFrame
                  photo={item.photo}
                  tilt={flip ? 3 : -3}
                  sizes="(min-width: 560px) 260px, 60vw"
                  className={cn(
                    "w-[62%] max-w-[15rem] @[34rem]:w-full",
                    flip && "@[34rem]:order-2",
                  )}
                />
                <div
                  className={cn(
                    "max-w-[20rem] @[34rem]:text-left",
                    flip && "@[34rem]:order-1 @[34rem]:text-right",
                  )}
                >
                  <p className="font-wd-display text-sm tracking-[0.25em] text-wd-sage-deep">
                    {item.date}
                  </p>
                  <h3 className="mt-2 text-lg font-medium text-wd-ink">{item.title}</h3>
                  <p className="mt-3 text-[0.95rem] leading-[1.9] break-keep text-wd-ink-muted">
                    {item.body}
                  </p>
                </div>
              </Reveal>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
