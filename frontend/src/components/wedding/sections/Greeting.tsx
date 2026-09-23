import type { Person, WeddingData } from "@/data/wedding";

import { Sprig } from "../ui/Ornaments";
import Reveal from "../ui/Reveal";

function ParentsLine({ person }: { person: Person }) {
  const { father, mother } = person.parents ?? {};
  const parents = [father, mother].filter(Boolean).join(" · ");
  return (
    <p className="break-keep">
      {parents && (
        <>
          <span className="text-wd-ink">{parents}</span>
          <span className="text-wd-ink-muted">의 {person.relation} </span>
        </>
      )}
      <span className="font-medium text-wd-ink">{person.name}</span>
    </p>
  );
}

export default function Greeting({ data }: { data: WeddingData }) {
  return (
    <section aria-labelledby="wd-greeting-title" className="@container px-6 py-20 text-center wd-cover:py-14">
      <Reveal>
        <h2 id="wd-greeting-title" className="text-xs font-medium tracking-[0.35em] text-wd-sage-deep">
          초대합니다
        </h2>
        <div className="mx-auto mt-8 max-w-[26rem] text-[0.95rem] leading-[2.1] break-keep text-wd-ink">
          {data.greeting.map((line, i) =>
            line ? <p key={i}>{line}</p> : <p key={i} aria-hidden="true" className="h-4" />,
          )}
        </div>
      </Reveal>

      <Reveal delay={0.1} className="mx-auto mt-12 max-w-[26rem]">
        <Sprig className="mx-auto w-16 text-wd-sage" />
        <div className="mt-8 grid gap-3 text-[0.95rem] @[30rem]:grid-cols-2 @[30rem]:gap-x-10">
          <ParentsLine person={data.groom} />
          <ParentsLine person={data.bride} />
        </div>
      </Reveal>
    </section>
  );
}
