import Link from "next/link";

import Container from "@/components/ui/Container";
import { cardClass } from "@/components/ui/Card";

type Destination = {
  href: string;
  title: string;
  description: string;
};

/**
 * 홈에서 갈 수 있는 곳들.
 *
 * 기존 홈은 "제 소개는 About 에 있습니다" 같은 문장 안에 링크를 심어 둔
 * 텍스트 목록이었다. 목적지를 카드로 세워 첫 화면에서 사이트 구조가 보이게 한다.
 */
const DESTINATIONS: Destination[] = [
  {
    href: "/about",
    title: "About",
    description: "어떤 개발자인지, 무엇을 다루는지.",
  },
  {
    href: "/career",
    title: "Career",
    description: "어디에서 무엇을 맡아 왔는지.",
  },
  {
    href: "/pspost",
    title: "PS 기록",
    description: "풀었던 알고리즘 문제와 풀이 아카이브.",
  },
  {
    href: "/project",
    title: "Project",
    description: "만들었거나 만들 예정인 토이 프로젝트 목록.",
  },
];

function DestinationCard({ item }: { item: Destination }) {
  return (
    <Link
      href={item.href}
      className={cardClass({ interactive: true, className: "group block p-5" })}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-fg">{item.title}</h2>

        <span
          aria-hidden
          className="text-fg-subtle transition group-hover:translate-x-0.5 group-hover:text-accent-soft-fg"
        >
          →
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-fg-muted">
        {item.description}
      </p>
    </Link>
  );
}

export default function Home() {
  return (
    <>
      {/* 히어로 */}
      <section className="relative overflow-hidden border-b border-line">
        {/* accent 를 아주 옅게 깐 후광. 배경 이미지 없이 첫 화면에 깊이를 준다. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[42rem] -translate-x-1/2 rounded-full bg-accent-soft blur-3xl"
        />

        <Container className="relative py-16 sm:py-20 lg:py-24">
          <p className="text-xs font-semibold tracking-widest text-accent-soft-fg uppercase">
            Dev log
          </p>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-balance text-fg sm:text-4xl lg:text-5xl">
            만나서 반갑습니다.
            <br />
            <span className="text-accent-soft-fg">ELFAKA</span> 입니다.
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-fg-muted sm:text-lg">
            그동안 공부한 흔적을 기록하고, 토이 프로젝트를 만들어 두는
            공간입니다.
          </p>
        </Container>
      </section>

      {/* 목적지 카드 */}
      <Container className="py-12 sm:py-16">
        <h2 className="text-sm font-semibold tracking-widest text-fg-subtle uppercase">
          둘러보기
        </h2>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DESTINATIONS.map((item) => (
            <DestinationCard key={item.href} item={item} />
          ))}
        </div>
      </Container>
    </>
  );
}
