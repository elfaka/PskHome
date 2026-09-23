"use client";

import { useId } from "react";

import { cn } from "@/lib/cn";

import {
  Amaranthus,
  Astilbe,
  BabyBreath,
  Bloom,
  Calla,
  Eucalyptus,
  FloraDefs,
  floraIds,
  Hydrangea,
  Leaf,
  Rose,
} from "./flora";

/*
  장면 좌표(100 × 150) 그대로의 SVG 층. 카드 윗변 y=22, 카드 x 26‥84, 봉투 윗변 y=70.
  층 순서(뒤 → 앞): 봉투 뒤판 · 덮개 · 사진 · [BouquetBack] · 카드 · [BouquetMid] · 앞주머니 · [BouquetFront] · LP
  delay 는 초 단위. 뒤에서 앞으로, 가운데에서 바깥으로 피어난다.
*/

function Layer({ className, children }: { className?: string; children: (f: ReturnType<typeof floraIds>) => React.ReactNode }) {
  const f = floraIds(useId());
  return (
    <svg
      viewBox="0 0 100 150"
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 h-full w-full overflow-visible", className)}
    >
      <FloraDefs f={f} />
      {children(f)}
    </svg>
  );
}

/** 카드 뒤로 솟은 부케 */
export function BouquetBack({ show, className }: { show: boolean; className?: string }) {
  return (
    <Layer className={className}>
      {(f) => (
        <>
          {/* 그린 — 가장 뒤에서 바깥으로 뻗는다 */}
          <Bloom show={show} delay={0}>
            <Eucalyptus f={f} from={[56, 32]} ctrl={[40, 16]} to={[20, 8]} count={9} size={2.6} seed={3} />
          </Bloom>
          <Bloom show={show} delay={0.05}>
            <Eucalyptus f={f} from={[66, 30]} ctrl={[84, 14]} to={[99, 12]} count={8} size={2.5} seed={8} />
          </Bloom>
          <Bloom show={show} delay={0.1}>
            <Leaf f={f} x={40} y={30} len={11} rot={205} />
            <Leaf f={f} x={82} y={30} len={11} rot={-25} />
            <Leaf f={f} x={60} y={30} len={9} rot={-100} />
          </Bloom>

          {/* 아스틸베 꽃대 */}
          <Bloom show={show} delay={0.15}>
            <Astilbe x1={45} y1={32} x2={35} y2={4} width={3.3} seed={11} />
          </Bloom>
          <Bloom show={show} delay={0.2}>
            <Astilbe x1={75} y1={30} x2={86} y2={3} width={3.1} seed={12} />
          </Bloom>
          <Bloom show={show} delay={0.25}>
            <Astilbe x1={60} y1={28} x2={61} y2={2} width={2.7} seed={13} />
          </Bloom>

          {/* 칼라 릴리 — 부케 위로 높이 솟는다 */}
          <Bloom show={show} delay={0.3}>
            <Calla f={f} x1={62} y1={36} x2={54} y2={12} s={6.4} rot={-12} bend={-2} />
          </Bloom>
          <Bloom show={show} delay={0.35}>
            <Calla f={f} x1={72} y1={36} x2={86} y2={14} s={5.8} rot={26} bend={3} />
          </Bloom>
          <Bloom show={show} delay={0.4}>
            <Calla f={f} x1={48} y1={36} x2={34} y2={19} s={5.2} rot={-38} bend={-2} />
          </Bloom>

          {/* 수국 */}
          <Bloom show={show} delay={0.45}>
            <Hydrangea f={f} x={43} y={25} R={7.5} seed={21} />
          </Bloom>
          <Bloom show={show} delay={0.5}>
            <Hydrangea f={f} x={77} y={27} R={7} seed={22} />
          </Bloom>
          <Bloom show={show} delay={0.55}>
            <Hydrangea f={f} x={91} y={35} R={5.2} seed={23} />
          </Bloom>

          {/* 장미 — 가장 앞 */}
          <Bloom show={show} delay={0.6}>
            <Rose f={f} x={67} y={9} r={5.6} rot={10} />
          </Bloom>
          <Bloom show={show} delay={0.65}>
            <Rose f={f} x={57} y={17} r={8.6} rot={-4} />
          </Bloom>
          <Bloom show={show} delay={0.7}>
            <Rose f={f} x={41} y={22} r={7} rot={-14} />
          </Bloom>
          <Bloom show={show} delay={0.75}>
            <Rose f={f} x={79} y={19} r={7.4} rot={12} />
          </Bloom>
          <Bloom show={show} delay={0.8}>
            <Rose f={f} x={93} y={27} r={5.4} rot={18} tilt={0.8} />
          </Bloom>

          <Bloom show={show} delay={0.85}>
            <BabyBreath x={30} y={17} spread={1.3} />
            <BabyBreath x={96} y={16} spread={1.2} />
            <BabyBreath x={49} y={6} spread={1.1} />
            <BabyBreath x={84} y={5} spread={1.1} />
          </Bloom>
        </>
      )}
    </Layer>
  );
}

/** 카드 앞, 앞주머니 뒤 — 봉투 속에 함께 꽂힌 꽃 (아랫부분은 앞주머니에 가려진다) */
export function BouquetMid({ show, className }: { show: boolean; className?: string }) {
  return (
    <Layer className={className}>
      {(f) => (
        <>
          <Bloom show={show} delay={0.5}>
            <Hydrangea f={f} x={36} y={98} R={6} seed={31} />
          </Bloom>
          <Bloom show={show} delay={0.6}>
            <Calla f={f} x1={46} y1={110} x2={30} y2={86} s={4.6} rot={-30} bend={-3} />
          </Bloom>
          <Bloom show={show} delay={0.7}>
            <Rose f={f} x={31} y={91} r={4.6} rot={-10} />
            <BabyBreath x={48} y={100} spread={1.1} />
            <BabyBreath x={70} y={92} spread={1} />
          </Bloom>
        </>
      )}
    </Layer>
  );
}

/** 맨 앞 — 봉투 양옆으로 늘어진 아마란서스, 사진 위 장미 */
export function BouquetFront({ show, className }: { show: boolean; className?: string }) {
  return (
    <Layer className={className}>
      {(f) => (
        <>
          {/* 양옆 아마란서스 — 오른쪽은 봉투 중심선(x=50) 기준 왼쪽의 거울상이라 모양·길이·알갱이까지 대칭이다 */}
          {[false, true].map((mirror) => (
            <g key={String(mirror)} transform={mirror ? "translate(100 0) scale(-1 1)" : undefined}>
              <Bloom show={show} delay={0.7}>
                <Amaranthus f={f} from={[14, 38]} ctrl={[1, 57]} to={[3, 96]} thick={2.6} seed={41} />
              </Bloom>
            </g>
          ))}
          <Bloom show={show} delay={0.8}>
            <Leaf f={f} x={14} y={54} len={8} rot={150} />
            <Rose f={f} x={15} y={52} r={5} rot={-18} />
          </Bloom>
        </>
      )}
    </Layer>
  );
}
