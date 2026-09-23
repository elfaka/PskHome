import type { WeddingData } from "@/data/wedding";

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
    </footer>
  );
}
