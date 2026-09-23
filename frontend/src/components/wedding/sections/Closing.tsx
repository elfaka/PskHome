import type { WeddingData } from "@/data/wedding";

import { PHOTO_CREDITS } from "../scene/flora";
import { CallaLily, Monogram } from "../ui/Ornaments";
import Reveal from "../ui/Reveal";

export default function Closing({ data }: { data: WeddingData }) {
  return (
    <footer className="@container px-6 pt-20 pb-[max(3rem,env(safe-area-inset-bottom))] text-center">
      <Reveal className="relative mx-auto max-w-[24rem]">
        <CallaLily className="mx-auto w-12" />
        <p lang="en" className="wd-title mt-4 font-wd-script leading-none text-wd-ink">
          With love,
        </p>
        <p className="mt-5 text-base tracking-[0.2em] text-wd-ink">
          {data.groom.name} <span className="text-wd-sage-deep">·</span> {data.bride.name}
        </p>
        <p className="mt-6 text-[0.95rem] leading-[1.9] break-keep text-wd-ink-muted">{data.closing}</p>
        <Monogram text={data.monogram} className="mx-auto mt-10 w-12 text-wd-sage-deep" />
      </Reveal>

      {/* 꽃 사진 라이선스(CC BY / CC BY-SA)가 요구하는 저작자 표시 */}
      <p className="mx-auto mt-14 max-w-[24rem] text-[0.7rem] leading-relaxed break-keep text-wd-ink-muted">
        꽃 사진:{" "}
        {PHOTO_CREDITS.map((c, i) => (
          <span key={c.sourceUrl}>
            {i > 0 && " · "}
            <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              {c.what}
            </a>{" "}
            © {c.author},{" "}
            <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              {c.license}
            </a>
          </span>
        ))}{" "}
        (Wikimedia Commons, 배경 제거·크기 조정)
      </p>
    </footer>
  );
}
