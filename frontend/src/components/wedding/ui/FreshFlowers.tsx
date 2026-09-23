"use client";

import { useId } from "react";

import { cn } from "@/lib/cn";

/*
  봉투 뒤에 깔리는 흰 생화 — 원본 에셋 없이 직접 그린 SVG.

  좌표계: 1 단위 = 봉투 폭의 1%. viewBox 144 × 110.3 을 봉투보다 사방으로 크게 깔아
  (left -22%, top -30%, width 144%) 봉투는 x 22‥122, y 20.7‥89.7 에 놓인다.
  꽃은 봉투 뒤에 있으므로 봉투 밖으로 나온 부분만 보인다.
  봉투 위 문구·아래 안내와 겹치지 않도록 대각선 두 모서리(오른쪽 위, 왼쪽 아래)에만 둔다.
*/

type Ids = { petal: string; leaf: string; euc: string; shadow: string };

function petalPath(s: number) {
  // 끝이 넓고 둥근 꽃잎. 원점(밑동)에서 위(-y)로 자란다
  return `M0 0 C ${-0.92 * s} ${-0.14 * s} ${-0.98 * s} ${-0.96 * s} 0 ${-s} C ${0.98 * s} ${-0.96 * s} ${0.92 * s} ${-0.14 * s} 0 0 Z`;
}

function Rose({ x, y, r, rot = 0, ids }: { x: number; y: number; r: number; rot?: number; ids: Ids }) {
  const ring = (angles: number[], scale: number, stroke: string) =>
    angles.map((a) => (
      <path
        key={`${scale}-${a}`}
        d={petalPath(r * scale)}
        transform={`rotate(${a})`}
        fill={`url(#${ids.petal})`}
        stroke={stroke}
        strokeWidth={0.16}
      />
    ));

  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`} filter={`url(#${ids.shadow})`}>
      {ring([0, 60, 120, 180, 240, 300], 1, "#e2dccf")}
      {ring([28, 100, 172, 244, 316], 0.74, "#dcd4c4")}
      {ring([12, 102, 192, 282], 0.5, "#d6cdbb")}
      {ring([50, 170, 290], 0.3, "#d2c8b4")}
      <g fill="none" stroke="#cbc1ab" strokeWidth={0.22} strokeLinecap="round">
        <path d={`M ${-0.2 * r} ${0.02 * r} A ${0.2 * r} ${0.18 * r} 0 0 1 ${0.18 * r} ${-0.06 * r}`} />
        <path d={`M ${0.14 * r} ${0.09 * r} A ${0.15 * r} ${0.13 * r} 0 0 1 ${-0.11 * r} ${0.11 * r}`} />
        <path d={`M ${-0.05 * r} ${-0.07 * r} A ${0.07 * r} ${0.06 * r} 0 0 1 ${0.06 * r} ${0.02 * r}`} />
      </g>
    </g>
  );
}

/** 오므린 봉오리 + 꽃받침 */
function Bud({ x, y, s, rot = 0, ids }: { x: number; y: number; s: number; rot?: number; ids: Ids }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`} filter={`url(#${ids.shadow})`}>
      <path d={`M0 ${1.4 * s} C ${0.1 * s} ${2.4 * s} ${0.2 * s} ${3.4 * s} ${0.4 * s} ${4.4 * s}`} stroke="#7d8a64" strokeWidth={0.5} fill="none" />
      <path d={petalPath(s * 1.5)} transform={`translate(0 ${1.2 * s}) scale(0.62 1)`} fill={`url(#${ids.petal})`} stroke="#dcd4c4" strokeWidth={0.16} />
      <path d={petalPath(s * 1.3)} transform={`translate(${0.1 * s} ${1.25 * s}) rotate(14) scale(0.5 1)`} fill={`url(#${ids.petal})`} stroke="#d6cdbb" strokeWidth={0.16} />
      <g fill={`url(#${ids.leaf})`}>
        <path d={`M0 ${1.3 * s} C ${-0.5 * s} ${0.9 * s} ${-0.9 * s} ${0.2 * s} ${-0.8 * s} ${-0.2 * s} C ${-0.4 * s} ${0.3 * s} ${-0.2 * s} ${0.8 * s} 0 ${1.3 * s} Z`} />
        <path d={`M0 ${1.3 * s} C ${0.5 * s} ${0.9 * s} ${0.9 * s} ${0.3 * s} ${0.85 * s} ${-0.1 * s} C ${0.4 * s} ${0.35 * s} ${0.2 * s} ${0.8 * s} 0 ${1.3 * s} Z`} />
      </g>
    </g>
  );
}

/** 끝이 뾰족한 장미 잎. 원점에서 +x 방향으로 자란다 */
function Leaf({ x, y, len, rot, ids }: { x: number; y: number; len: number; rot: number; ids: Ids }) {
  const l = len;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path
        d={`M0 0 C ${0.3 * l} ${-0.3 * l} ${0.72 * l} ${-0.27 * l} ${l} 0 C ${0.72 * l} ${0.27 * l} ${0.3 * l} ${0.3 * l} 0 0 Z`}
        fill={`url(#${ids.leaf})`}
      />
      <path d={`M${0.04 * l} 0 L ${0.9 * l} 0`} stroke="#56613f" strokeOpacity={0.45} strokeWidth={0.22} />
    </g>
  );
}

/** 유칼립투스 — 휘어진 줄기에 동그란 잎이 어긋나게 달린다 */
function Eucalyptus({ stem, leaves, ids }: { stem: string; leaves: [number, number, number][]; ids: Ids }) {
  return (
    <g>
      <path d={stem} stroke="#7d8a64" strokeWidth={0.45} fill="none" strokeLinecap="round" />
      {leaves.map(([cx, cy, r]) => (
        <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx={r} ry={r * 0.88} fill={`url(#${ids.euc})`} opacity={0.92} />
      ))}
    </g>
  );
}

/** 안개꽃 — 가는 줄기 끝의 작은 흰 꽃송이들 */
function BabyBreath({ x, y, spread }: { x: number; y: number; spread: number }) {
  const dots: [number, number, number][] = [
    [0, 0, 1.2],
    [-1.1, -0.7, 0.9],
    [1.2, -0.5, 1],
    [-0.4, 0.9, 0.95],
    [0.9, 0.8, 0.85],
    [-1.3, 0.5, 0.8],
    [0.2, -1.3, 0.9],
  ];
  return (
    <g transform={`translate(${x} ${y})`}>
      <g stroke="#8e9a78" strokeWidth={0.18} fill="none">
        {dots.map(([dx, dy]) => (
          <path key={`s${dx}${dy}`} d={`M0 ${spread * 1.8} L ${dx * spread} ${dy * spread}`} />
        ))}
      </g>
      {dots.map(([dx, dy, r]) => (
        <circle key={`d${dx}${dy}`} cx={dx * spread} cy={dy * spread} r={r} fill="#fffefb" stroke="#d9d2c3" strokeWidth={0.15} />
      ))}
    </g>
  );
}

export default function FreshFlowers({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const ids: Ids = {
    petal: `${uid}-petal`,
    leaf: `${uid}-leaf`,
    euc: `${uid}-euc`,
    shadow: `${uid}-shadow`,
  };

  return (
    <svg viewBox="0 0 144 110.3" aria-hidden="true" className={cn("h-auto overflow-visible", className)}>
      <defs>
        {/* 밑동(꽃잎 bbox 아래 가운데)은 그늘지고 끝으로 갈수록 하얗다 */}
        <radialGradient id={ids.petal} cx="0.5" cy="1" r="1.05">
          <stop offset="0" stopColor="#e4dccb" />
          <stop offset="0.38" stopColor="#f4f0e7" />
          <stop offset="0.78" stopColor="#fffefb" />
          <stop offset="1" stopColor="#f9f6ef" />
        </radialGradient>
        <linearGradient id={ids.leaf} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#95a27d" />
          <stop offset="1" stopColor="#6c7955" />
        </linearGradient>
        <radialGradient id={ids.euc} cx="0.35" cy="0.3" r="0.9">
          <stop offset="0" stopColor="#b7c0a6" />
          <stop offset="1" stopColor="#8a9679" />
        </radialGradient>
        <filter id={ids.shadow} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0.5" stdDeviation="0.6" floodColor="#3b2f22" floodOpacity="0.22" />
        </filter>
      </defs>

      {/* 오른쪽 위 모서리 (122, 20.7) */}
      <Eucalyptus
        ids={ids}
        stem="M112 31 C 124 25, 133 19, 143 13"
        leaves={[
          [117, 26.5, 2.8],
          [122, 30.5, 2.6],
          [126, 21, 3],
          [131, 25, 2.7],
          [134.5, 15.5, 2.8],
          [138.5, 19.5, 2.4],
          [141.5, 12, 2.2],
        ]}
      />
      <Leaf ids={ids} x={127} y={27} len={14} rot={18} />
      <Leaf ids={ids} x={118} y={21} len={10} rot={-138} />
      <BabyBreath x={135} y={15.5} spread={1.5} />
      <BabyBreath x={109} y={18} spread={1.3} />
      <Rose ids={ids} x={127.5} y={22} r={9.5} rot={12} />
      <Rose ids={ids} x={116.5} y={22.5} r={6} rot={-20} />

      {/* 왼쪽 아래 모서리 (22, 89.7) */}
      <Eucalyptus
        ids={ids}
        stem="M30 85 C 18 92, 10 98, 1 106"
        leaves={[
          [25.5, 91, 2.7],
          [20, 86.5, 2.5],
          [16, 96, 2.9],
          [10.5, 93, 2.6],
          [7, 101.5, 2.6],
          [2.5, 99, 2.2],
        ]}
      />
      <Leaf ids={ids} x={18} y={81} len={13} rot={196} />
      <Leaf ids={ids} x={28} y={91} len={11} rot={128} />
      <BabyBreath x={30} y={96.5} spread={1.3} />
      <BabyBreath x={7.5} y={84} spread={1.4} />
      <Bud ids={ids} x={10} y={72} s={4.2} rot={-32} />
      <Rose ids={ids} x={21} y={86} r={10} rot={-8} />
    </svg>
  );
}
