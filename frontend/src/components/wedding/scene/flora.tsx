"use client";

import { motion } from "motion/react";

/*
  생화 원형(primitive) — 원본 에셋 없이 직접 그린 SVG.
  모두 자기 원점(꽃의 밑동·중심)을 기준으로 그리고, 배치는 Bouquet 가 translate 로 한다.
  작은 꽃이 모인 꽃(수국·아스틸베·아마란서스)은 시드 난수로 흩뿌린다 — 결정적이라 서버/클라이언트 렌더가 같다.
*/

/** 꽃 색 — 여기만 바꾸면 부케 전체 톤이 바뀐다 (예: 버건디 장미면 rose 를 붉은 계열로) */
export const PALETTE = {
  rose: { light: "#fffdf8", mid: "#f2ece0", shade: "#d9ccb4", deep: "#b9a784", edge: "#d6cab5" },
  calla: { tip: "#fffefa", mid: "#f5f4ec", base: "#c9d4a4", throat: "#dcdac2", spadixLight: "#efd97c", spadixDeep: "#c6a53c" },
  hydrangea: { light: "#fbfcf3", shade: "#d9e0bf", core: "#b4bf8a" },
  astilbe: ["#f4e0da", "#ebc9c1", "#dfb2a8", "#f8ece8"],
  amaranthus: { light: "#c7cf98", deep: "#7f8a55" },
  leaf: { light: "#9ba882", deep: "#646f4e", vein: "#4f5a3c" },
  eucalyptus: { light: "#bfc8ae", deep: "#879378" },
  stem: { light: "#9aaa72", deep: "#65754a" },
  breath: { fill: "#fffefb", edge: "#d6cfbf", stem: "#8e9a78" },
} as const;

export type FloraIds = {
  rose: string;
  roseIn: string;
  calla: string;
  throat: string;
  spadix: string;
  hyd: string;
  ama: string;
  leaf: string;
  euc: string;
  stem: string;
  shadow: string;
};

export function floraIds(uid: string): FloraIds {
  const p = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  return {
    rose: `${p}-rose`,
    roseIn: `${p}-rose-in`,
    calla: `${p}-calla`,
    throat: `${p}-throat`,
    spadix: `${p}-spadix`,
    hyd: `${p}-hyd`,
    ama: `${p}-ama`,
    leaf: `${p}-leaf`,
    euc: `${p}-euc`,
    stem: `${p}-stem`,
    shadow: `${p}-shadow`,
  };
}

const P = PALETTE;
const u = (id: string) => `url(#${id})`;

/** mulberry32 — 작고 결정적인 난수 */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function FloraDefs({ f }: { f: FloraIds }) {
  return (
    <defs>
      {/* 꽃잎: 끝은 밝고 밑동으로 갈수록 그늘 (각 꽃잎 bbox 기준) */}
      <linearGradient id={f.rose} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={P.rose.light} />
        <stop offset="0.55" stopColor={P.rose.mid} />
        <stop offset="1" stopColor={P.rose.shade} />
      </linearGradient>
      <radialGradient id={f.roseIn} cx="0.5" cy="0.45" r="0.6">
        <stop offset="0" stopColor={P.rose.deep} />
        <stop offset="1" stopColor={P.rose.mid} />
      </radialGradient>
      {/* 칼라: 밑동 연두 → 몸통 → 흰 끝 */}
      <linearGradient id={f.calla} x1="0" y1="1" x2="0.2" y2="0">
        <stop offset="0" stopColor={P.calla.base} />
        <stop offset="0.4" stopColor={P.calla.mid} />
        <stop offset="1" stopColor={P.calla.tip} />
      </linearGradient>
      <radialGradient id={f.throat} cx="0.45" cy="0.7" r="0.8">
        <stop offset="0" stopColor={P.calla.throat} />
        <stop offset="1" stopColor={P.calla.mid} stopOpacity="0" />
      </radialGradient>
      <linearGradient id={f.spadix} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor={P.calla.spadixDeep} />
        <stop offset="1" stopColor={P.calla.spadixLight} />
      </linearGradient>
      <radialGradient id={f.hyd} cx="0.4" cy="0.35" r="0.8">
        <stop offset="0" stopColor={P.hydrangea.light} />
        <stop offset="1" stopColor={P.hydrangea.shade} />
      </radialGradient>
      <radialGradient id={f.ama} cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stopColor={P.amaranthus.light} />
        <stop offset="1" stopColor={P.amaranthus.deep} />
      </radialGradient>
      <linearGradient id={f.leaf} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={P.leaf.light} />
        <stop offset="1" stopColor={P.leaf.deep} />
      </linearGradient>
      <radialGradient id={f.euc} cx="0.35" cy="0.3" r="0.9">
        <stop offset="0" stopColor={P.eucalyptus.light} />
        <stop offset="1" stopColor={P.eucalyptus.deep} />
      </radialGradient>
      <linearGradient id={f.stem} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor={P.stem.deep} />
        <stop offset="0.5" stopColor={P.stem.light} />
        <stop offset="1" stopColor={P.stem.deep} />
      </linearGradient>
      <filter id={f.shadow} x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="0.45" stdDeviation="0.55" floodColor="#3b2f22" floodOpacity="0.24" />
      </filter>
    </defs>
  );
}

/** 인트로 뒤 피어나는 연출. JS 가 없으면 noscript 스타일(.wd-reveal)이 최종 상태로 푼다 */
export function Bloom({
  show,
  delay,
  children,
}: {
  show: boolean;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <motion.g
      className="wd-reveal"
      style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
      initial={{ opacity: 0, scale: 0.55, y: 3 }}
      animate={show ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.55, y: 3 }}
      transition={{ duration: 0.9, delay: show ? delay : 0, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.g>
  );
}

/** 3/4 각도의 가든 로즈 — 뒤 꽃잎, 말려 들어간 속꽃잎, 앞 컵 꽃잎 */
export function Rose({
  x,
  y,
  r,
  rot = 0,
  tilt = 0.86,
  f,
}: {
  x: number;
  y: number;
  r: number;
  rot?: number;
  /** 세로 눌림 — 1 이면 정면, 작을수록 옆에서 본 모습 */
  tilt?: number;
  f: FloraIds;
}) {
  const lobe = `M0 0 C ${-0.8 * r} ${-0.18 * r} ${-0.93 * r} ${-0.98 * r} 0 ${-1.04 * r} C ${0.93 * r} ${-0.98 * r} ${0.8 * r} ${-0.18 * r} 0 0 Z`;
  const crescent = (a: number, b: number) =>
    `M ${-a} 0 C ${-a} ${-b} ${a} ${-b} ${a} 0 C ${a * 0.55} ${b * 0.32} ${-a * 0.55} ${b * 0.32} ${-a} 0 Z`;

  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(1 ${tilt})`} filter={u(f.shadow)}>
      {[-162, -108, -54, 0, 54, 108, 162].map((a) => (
        <path key={a} d={lobe} transform={`rotate(${a})`} fill={u(f.rose)} stroke={P.rose.edge} strokeWidth={0.14} />
      ))}
      {/* 두 번째 겹 — 첫 겹 사이사이에서 조금 작게 */}
      {[-135, -81, -27, 27, 81, 135].map((a) => (
        <path key={`b${a}`} d={lobe} transform={`rotate(${a}) scale(0.8)`} fill={u(f.rose)} stroke={P.rose.edge} strokeWidth={0.16} />
      ))}
      <ellipse rx={0.66 * r} ry={0.6 * r} fill={u(f.roseIn)} />
      {[0, 1, 2, 3].map((i) => (
        <path
          key={i}
          d={crescent(r * (0.6 - i * 0.12), r * (0.62 - i * 0.12))}
          transform={`translate(${(i % 2 ? -1 : 1) * 0.05 * r} ${-0.02 * r - i * 0.07 * r}) rotate(${i % 2 ? -14 : 12})`}
          fill={u(f.rose)}
          stroke={P.rose.shade}
          strokeWidth={0.14}
        />
      ))}
      <path
        d={`M ${-0.12 * r} ${-0.24 * r} q ${0.1 * r} ${-0.15 * r} ${0.23 * r} ${-0.02 * r}`}
        fill="none"
        stroke={P.rose.deep}
        strokeWidth={0.2}
        strokeLinecap="round"
      />
      {/* 앞으로 감싸는 컵 꽃잎 세 장 */}
      <path
        d={`M ${-0.9 * r} ${0.02 * r} C ${-0.86 * r} ${0.84 * r} ${0.86 * r} ${0.84 * r} ${0.9 * r} ${0.02 * r} C ${0.5 * r} ${0.36 * r} ${-0.5 * r} ${0.36 * r} ${-0.9 * r} ${0.02 * r} Z`}
        fill={u(f.rose)}
        stroke={P.rose.edge}
        strokeWidth={0.14}
      />
      <path
        d={`M ${-1 * r} ${-0.2 * r} C ${-1.04 * r} ${0.52 * r} ${-0.3 * r} ${0.9 * r} ${0.12 * r} ${0.78 * r} C ${-0.3 * r} ${0.56 * r} ${-0.64 * r} ${0.2 * r} ${-1 * r} ${-0.2 * r} Z`}
        fill={u(f.rose)}
        stroke={P.rose.edge}
        strokeWidth={0.14}
      />
      <path
        d={`M ${r} ${-0.2 * r} C ${1.04 * r} ${0.52 * r} ${0.3 * r} ${0.9 * r} ${-0.12 * r} ${0.78 * r} C ${0.3 * r} ${0.56 * r} ${0.64 * r} ${0.2 * r} ${r} ${-0.2 * r} Z`}
        fill={u(f.rose)}
        stroke={P.rose.edge}
        strokeWidth={0.14}
      />
      {/* 꽃잎 끝에 맺힌 빛 */}
      <path
        d={`M ${-0.66 * r} ${0.34 * r} Q 0 ${0.64 * r} ${0.66 * r} ${0.34 * r}`}
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.9}
        strokeWidth={0.2}
        strokeLinecap="round"
      />
    </g>
  );
}

/** 칼라 릴리 — 휘어진 줄기 + 나팔형 포엽 + 노란 꽃술. (x1,y1) 줄기 밑 → (x2,y2) 꽃 밑동 */
export function Calla({
  x1,
  y1,
  x2,
  y2,
  s,
  rot = 0,
  bend = 0,
  f,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  s: number;
  rot?: number;
  /** 줄기가 휘는 정도(좌우) */
  bend?: number;
  f: FloraIds;
}) {
  const cx = (x1 + x2) / 2 + bend;
  const cy = (y1 + y2) / 2;
  return (
    <g>
      <path d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`} stroke={u(f.stem)} strokeWidth={0.12 * s} fill="none" strokeLinecap="round" />
      <g transform={`translate(${x2} ${y2}) rotate(${rot})`} filter={u(f.shadow)}>
        <path
          d={`M0 0 C ${-0.36 * s} ${-0.25 * s} ${-0.56 * s} ${-0.76 * s} ${-0.26 * s} ${-1.1 * s} C ${-0.05 * s} ${-1.36 * s} ${0.36 * s} ${-1.46 * s} ${0.62 * s} ${-1.72 * s} C ${0.46 * s} ${-1.26 * s} ${0.46 * s} ${-0.7 * s} ${0.2 * s} ${-0.3 * s} C ${0.12 * s} ${-0.15 * s} ${0.06 * s} ${-0.05 * s} 0 0 Z`}
          fill={u(f.calla)}
          stroke="#dedcc9"
          strokeWidth={0.05 * s}
        />
        <path
          d={`M ${-0.05 * s} ${-0.26 * s} C ${-0.31 * s} ${-0.56 * s} ${-0.3 * s} ${-0.96 * s} ${-0.1 * s} ${-1.1 * s} C ${0.1 * s} ${-1 * s} ${0.26 * s} ${-0.7 * s} ${0.15 * s} ${-0.36 * s} Z`}
          fill={u(f.throat)}
        />
        <path
          d={`M 0 ${-0.22 * s} Q ${0.06 * s} ${-0.6 * s} ${0.02 * s} ${-0.86 * s}`}
          stroke={u(f.spadix)}
          strokeWidth={0.13 * s}
          strokeLinecap="round"
          fill="none"
        />
        {/* 말려 나온 가장자리의 빛 */}
        <path
          d={`M ${-0.26 * s} ${-1.1 * s} C ${-0.05 * s} ${-1.2 * s} ${0.3 * s} ${-1.36 * s} ${0.62 * s} ${-1.72 * s}`}
          stroke="#ffffff"
          strokeWidth={0.07 * s}
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </g>
  );
}

/** 수국 — 네 잎 꽃송이가 돔처럼 모인다 */
export function Hydrangea({ x, y, R, seed, f }: { x: number; y: number; R: number; seed: number; f: FloraIds }) {
  const rand = rng(seed);
  const florets = Array.from({ length: 26 }, () => {
    const ang = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * R;
    return { fx: Math.cos(ang) * d, fy: Math.sin(ang) * d * 0.82, s: 0.85 + rand() * 0.35, rot: rand() * 90 };
  }).sort((a, b) => a.fy - b.fy);

  return (
    <g transform={`translate(${x} ${y})`} filter={u(f.shadow)}>
      <ellipse rx={R * 1.02} ry={R * 0.86} fill={P.hydrangea.shade} />
      {florets.map((p, i) => (
        <g key={i} transform={`translate(${p.fx.toFixed(2)} ${p.fy.toFixed(2)}) rotate(${p.rot.toFixed(1)}) scale(${p.s.toFixed(2)})`}>
          {[0, 90, 180, 270].map((a) => (
            <ellipse key={a} cy={-0.92} rx={0.82} ry={0.95} transform={`rotate(${a})`} fill={u(f.hyd)} stroke={P.hydrangea.shade} strokeWidth={0.08} />
          ))}
          <circle r={0.26} fill={P.hydrangea.core} />
        </g>
      ))}
    </g>
  );
}

/** 아스틸베 — 원뿔형으로 모인 작은 꽃 (x1,y1 밑 → x2,y2 끝) */
export function Astilbe({
  x1,
  y1,
  x2,
  y2,
  width,
  seed,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  seed: number;
}) {
  const rand = rng(seed);
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = -(y2 - y1) / len;
  const ny = (x2 - x1) / len;
  // 아래는 넓게, 끝으로 갈수록 좁아지는 원뿔. 곁가지처럼 좌우로 조금씩 뭉친다
  const dots = Array.from({ length: 90 }, (_, i) => {
    const t = 0.1 + (i / 89) * 0.9;
    const spread = width * (1 - t * 0.8);
    const off = (rand() - 0.5) * 2 * spread;
    const along = (rand() - 0.5) * 1.2;
    return {
      cx: x1 + (x2 - x1) * t + nx * off + ((x2 - x1) / len) * along,
      cy: y1 + (y2 - y1) * t + ny * off + ((y2 - y1) / len) * along,
      r: 0.62 * (1 - t * 0.45) + rand() * 0.28,
      c: P.astilbe[Math.floor(rand() * P.astilbe.length)],
    };
  });

  return (
    <g>
      <path d={`M ${x1} ${y1} L ${x2} ${y2}`} stroke={P.stem.deep} strokeWidth={0.28} strokeLinecap="round" />
      {dots.map((d, i) => (
        <circle key={i} cx={d.cx.toFixed(2)} cy={d.cy.toFixed(2)} r={d.r.toFixed(2)} fill={d.c} />
      ))}
    </g>
  );
}

/** 아마란서스 — 늘어진 곡선(2차 베지어)을 따라 구슬 같은 꽃이 달리고 끝으로 갈수록 가늘어진다 */
export function Amaranthus({
  from,
  ctrl,
  to,
  thick,
  seed,
  f,
}: {
  from: [number, number];
  ctrl: [number, number];
  to: [number, number];
  thick: number;
  seed: number;
  f: FloraIds;
}) {
  const rand = rng(seed);
  const at = (t: number): [number, number] => {
    const m = 1 - t;
    return [
      m * m * from[0] + 2 * m * t * ctrl[0] + t * t * to[0],
      m * m * from[1] + 2 * m * t * ctrl[1] + t * t * to[1],
    ];
  };
  // 굵은 줄기 위쪽에서 잔 알갱이가 뭉텅뭉텅 붙고, 끝으로 갈수록 가늘고 성기다
  const beads: { cx: number; cy: number; r: number; o: number }[] = [];
  for (let i = 0; i < 70; i++) {
    const t = i / 69;
    const [px, py] = at(t);
    const size = thick * (1 - t * 0.65);
    const n = t < 0.7 ? 5 : 3;
    for (let k = 0; k < n; k++) {
      beads.push({
        cx: px + (rand() - 0.5) * size * 1.7,
        cy: py + (rand() - 0.5) * size * 1.1,
        r: size * (0.22 + rand() * 0.22),
        o: 0.75 + rand() * 0.25,
      });
    }
  }

  return (
    <g filter={u(f.shadow)}>
      <path
        d={`M ${from[0]} ${from[1]} Q ${ctrl[0]} ${ctrl[1]} ${to[0]} ${to[1]}`}
        stroke={P.amaranthus.deep}
        strokeWidth={0.25}
        fill="none"
      />
      {beads.map((b, i) => (
        <circle key={i} cx={b.cx.toFixed(2)} cy={b.cy.toFixed(2)} r={b.r.toFixed(2)} fill={u(f.ama)} opacity={b.o.toFixed(2)} />
      ))}
    </g>
  );
}

/** 끝이 뾰족한 장미 잎. 원점에서 +x 방향으로 자란다 */
export function Leaf({ x, y, len, rot, f }: { x: number; y: number; len: number; rot: number; f: FloraIds }) {
  const l = len;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path
        d={`M0 0 C ${0.3 * l} ${-0.3 * l} ${0.72 * l} ${-0.27 * l} ${l} 0 C ${0.72 * l} ${0.27 * l} ${0.3 * l} ${0.3 * l} 0 0 Z`}
        fill={u(f.leaf)}
      />
      <path d={`M${0.04 * l} 0 L ${0.9 * l} 0`} stroke={P.leaf.vein} strokeOpacity={0.45} strokeWidth={0.2} />
    </g>
  );
}

/** 유칼립투스 — 휘어진 줄기에 동그란 잎이 어긋나게 달린다 */
export function Eucalyptus({
  from,
  ctrl,
  to,
  count,
  size,
  seed,
  f,
}: {
  from: [number, number];
  ctrl: [number, number];
  to: [number, number];
  count: number;
  size: number;
  seed: number;
  f: FloraIds;
}) {
  const rand = rng(seed);
  const leaves = Array.from({ length: count }, (_, i) => {
    const t = (i + 0.6) / count;
    const m = 1 - t;
    const px = m * m * from[0] + 2 * m * t * ctrl[0] + t * t * to[0];
    const py = m * m * from[1] + 2 * m * t * ctrl[1] + t * t * to[1];
    const side = i % 2 ? 1 : -1;
    const r = size * (1 - t * 0.35) * (0.85 + rand() * 0.3);
    return { cx: px + side * r * 0.7, cy: py - side * r * 0.35, r };
  });
  return (
    <g>
      <path d={`M ${from[0]} ${from[1]} Q ${ctrl[0]} ${ctrl[1]} ${to[0]} ${to[1]}`} stroke={P.stem.deep} strokeWidth={0.3} fill="none" strokeLinecap="round" />
      {leaves.map((l, i) => (
        <ellipse key={i} cx={l.cx.toFixed(2)} cy={l.cy.toFixed(2)} rx={l.r.toFixed(2)} ry={(l.r * 0.88).toFixed(2)} fill={u(f.euc)} opacity={0.94} />
      ))}
    </g>
  );
}

/** 안개꽃 — 가는 줄기 끝의 작은 흰 꽃송이들 */
export function BabyBreath({ x, y, spread }: { x: number; y: number; spread: number }) {
  const dots: [number, number, number][] = [
    [0, 0, 1],
    [-1.1, -0.7, 0.8],
    [1.2, -0.5, 0.85],
    [-0.4, 0.9, 0.8],
    [0.9, 0.8, 0.75],
    [-1.3, 0.5, 0.7],
    [0.2, -1.3, 0.8],
  ];
  return (
    <g transform={`translate(${x} ${y})`}>
      <g stroke={P.breath.stem} strokeWidth={0.16} fill="none">
        {dots.map(([dx, dy]) => (
          <path key={`s${dx}${dy}`} d={`M0 ${spread * 1.8} L ${dx * spread} ${dy * spread}`} />
        ))}
      </g>
      {dots.map(([dx, dy, r]) => (
        <circle key={`d${dx}${dy}`} cx={dx * spread} cy={dy * spread} r={r} fill={P.breath.fill} stroke={P.breath.edge} strokeWidth={0.14} />
      ))}
    </g>
  );
}
