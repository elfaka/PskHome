"use client";

import { useId } from "react";

import { cn } from "@/lib/cn";

import {
  Amaranthus,
  Astilbe,
  BabyBreath,
  Bloom,
  Eucalyptus,
  FloraDefs,
  floraIds,
  Hydrangea,
  Leaf,
  PhotoCalla,
  PhotoRose,
} from "./flora";

/*
  장면 좌표(100 × 150) 그대로의 SVG 층. 카드 윗변 y=22, 카드 x 26‥84(가운데 55), 봉투 윗변 y=70.
  층 순서(뒤 → 앞): 봉투 뒤판 · 덮개 · 사진 · [BouquetBack] · 카드 · [BouquetMid] · 앞주머니 · [BouquetFront] · LP

  꽃다발 구성: 카드 윗부분 가운데(x≈55)를 중심으로 사진 장미를 돔처럼 촘촘히 모으고,
  그 위로 칼라가 부채꼴로 솟는다. 틈은 수국·안개꽃, 바깥은 좌우 대칭 그린.
  delay 는 초 단위. 뒤(그린)에서 앞(장미)으로, 가운데에서 바깥으로 피어난다.
*/

/** 부케 중심선 — 좌우 대칭 그린은 이 선을 기준으로 거울상이다 */
const AXIS = 55;

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

/** AXIS 기준 좌우 한 쌍 — 오른쪽은 왼쪽의 거울상 */
function Mirrored({ children }: { children: React.ReactNode }) {
  return (
    <>
      <g>{children}</g>
      <g transform={`translate(${AXIS * 2} 0) scale(-1 1)`}>{children}</g>
    </>
  );
}

/** 카드 뒤로 솟은 꽃다발 */
export function BouquetBack({ show, className }: { show: boolean; className?: string }) {
  return (
    <Layer className={className}>
      {(f) => (
        <>
          {/* 그린 — 꽃다발을 감싸며 바깥으로 뻗는다 (좌우 대칭) */}
          <Bloom show={show} delay={0}>
            <Mirrored>
              <Eucalyptus f={f} from={[50, 30]} ctrl={[36, 14]} to={[20, 10]} count={9} size={2.6} seed={3} />
              <Leaf f={f} x={42} y={28} len={11} rot={200} />
            </Mirrored>
          </Bloom>

          {/* 아스틸베 꽃대 — 칼라 사이로 */}
          <Bloom show={show} delay={0.1}>
            <Mirrored>
              <Astilbe x1={47} y1={26} x2={39} y2={4} width={3} seed={11} />
            </Mirrored>
          </Bloom>

          {/* 칼라 — 꽃다발 가운데에서 부채꼴로 솟는다. 줄기 아래는 장미·카드에 가려진다 */}
          {/* 꽃 머리가 장미 돔(윗면 y≈3) 위로 올라오도록 줄기를 길게 */}
          <Bloom show={show} delay={0.2}>
            <PhotoCalla f={f} x={57} y={40} height={52} rot={-3} />
          </Bloom>
          <Bloom show={show} delay={0.25}>
            <PhotoCalla f={f} x={52} y={40} height={46} rot={-27} flip />
          </Bloom>
          <Bloom show={show} delay={0.3}>
            <PhotoCalla f={f} x={60} y={40} height={46} rot={25} />
          </Bloom>

          {/* 수국 — 장미 사이 틈을 메운다 */}
          <Bloom show={show} delay={0.35}>
            <Hydrangea f={f} x={40} y={24} R={6.5} seed={21} />
            <Hydrangea f={f} x={70} y={24} R={6.5} seed={22} />
          </Bloom>

          {/* 장미 돔 — 뒤·바깥 송이부터, 가운데 가장 큰 송이가 맨 앞 */}
          <Bloom show={show} delay={0.4}>
            <PhotoRose f={f} x={48} y={12} size={12} rot={28} />
          </Bloom>
          <Bloom show={show} delay={0.45}>
            <PhotoRose f={f} x={63} y={12} size={12} rot={-24} flip />
          </Bloom>
          <Bloom show={show} delay={0.5}>
            <PhotoRose f={f} x={36} y={24} size={12} rot={-32} />
          </Bloom>
          <Bloom show={show} delay={0.55}>
            <PhotoRose f={f} x={75} y={24} size={12} rot={30} flip />
          </Bloom>
          <Bloom show={show} delay={0.6}>
            <PhotoRose f={f} x={45} y={20} size={15} rot={-14} flip />
          </Bloom>
          <Bloom show={show} delay={0.65}>
            <PhotoRose f={f} x={66} y={20} size={15} rot={12} />
          </Bloom>
          <Bloom show={show} delay={0.7}>
            <PhotoRose f={f} x={55.5} y={16} size={18} rot={4} />
          </Bloom>

          <Bloom show={show} delay={0.8}>
            <BabyBreath x={30} y={17} spread={1.3} />
            <BabyBreath x={80} y={17} spread={1.3} />
            <BabyBreath x={55} y={4} spread={1.1} />
            <BabyBreath x={41} y={9} spread={1} />
            <BabyBreath x={69} y={9} spread={1} />
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
            <Hydrangea f={f} x={37} y={99} R={6} seed={31} />
          </Bloom>
          <Bloom show={show} delay={0.6}>
            <PhotoCalla f={f} x={46} y={114} height={26} rot={-34} />
          </Bloom>
          <Bloom show={show} delay={0.7}>
            <PhotoRose f={f} x={31} y={91} size={10} rot={-18} />
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
            <PhotoRose f={f} x={15} y={52} size={10} rot={-22} />
          </Bloom>
        </>
      )}
    </Layer>
  );
}
