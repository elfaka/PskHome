"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import { cardClass } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { TONE_TEXT } from "@/lib/stocksim/format";
import { formatDec, formatRatioPct, signOf } from "@/lib/trader/decimal";

/**
 * /trader 화면 공용 조각 — 카드 섹션, 표, 핵심 숫자 카드, 상태 점, 게이지, 스위치, 모달, 추이 차트.
 * 숫자는 Decimal 문자열을 그대로 포맷한다. (차트의 픽셀 좌표 계산만 예외로 number 를 쓴다)
 */

export const td = "px-3 py-2 align-top whitespace-nowrap";
export const num = cn(td, "text-right tabular-nums");

export function Section({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cardClass({ className: cn("min-w-0 p-4", className) })}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-sm font-semibold text-fg">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function DataTable({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-line text-left text-fg-subtle">
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-fg">{children}</tbody>
      </table>
      {empty && <p className="py-6 text-center text-xs text-fg-subtle">기록이 없습니다.</p>}
    </div>
  );
}

export function Signed({ value, digits = 0, pct = false }: { value: string | null | undefined; digits?: number; pct?: boolean }) {
  const s = signOf(value);
  const text = pct ? formatRatioPct(value ?? null, digits) : formatDec(value ?? null, digits, true);
  return <span className={cn("tabular-nums", TONE_TEXT[s])}>{text}</span>;
}

/** 핵심 숫자 카드 (Grafana stat 패널 형태) */
export function Kpi({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className={cardClass({ className: "min-w-0 p-4" })}>
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-1 truncate text-2xl font-semibold tracking-tight tabular-nums text-fg">{children}</p>
      {hint && <p className="mt-1 truncate text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

export type DotTone = "ok" | "warn" | "error" | "off";

const DOT: Record<DotTone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  error: "bg-danger",
  off: "bg-fg-subtle",
};

/** 상태 점 (Uptime Kuma 형태). ok 는 은은하게 깜빡인다. */
export function StatusDot({ tone, label }: { tone: DotTone; label?: string }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5 shrink-0" aria-hidden={label ? undefined : true} aria-label={label} role={label ? "img" : undefined}>
      {tone === "ok" && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-40", DOT[tone])} />}
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", DOT[tone])} />
    </span>
  );
}

/** 비율 문자열("0.4523")을 막대로. 0.8 이상 경고, 1 이상 위험. */
export function Gauge({ ratio, label, detail }: { ratio: string | null | undefined; label: string; detail?: React.ReactNode }) {
  const pct = ratioToPercentNumber(ratio);
  const tone = pct == null ? "bg-fg-subtle" : pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-success";
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate text-fg-muted">{label}</span>
        <span className="shrink-0 tabular-nums text-fg">{ratio == null ? "—" : formatRatioPct(ratio, 1, false)}</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-surface-2"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
      >
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${Math.min(pct ?? 0, 100)}%` }} />
      </div>
      {detail && <p className="mt-1 text-[11px] text-fg-subtle">{detail}</p>}
    </div>
  );
}

/** 막대 너비용 (화면 표시만) */
function ratioToPercentNumber(ratio: string | null | undefined): number | null {
  if (ratio == null || !/^-?\d+(\.\d+)?$/.test(ratio)) return null;
  return Math.max(0, Math.round(Number(ratio) * 1000) / 10);
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50",
        checked ? "border-success bg-success" : "border-line-strong bg-surface-2"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-surface shadow-card transition",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [onClose]);
  // body 로 띄운다 — 상단 바처럼 backdrop-filter 가 있는 조상 안에서는 fixed 가 그 조상 기준이 돼 잘린다
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 p-4 backdrop-blur-sm sm:items-center">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={cardClass({ className: "w-full max-w-md p-5 shadow-overlay" })}
      >
        <h2 id={id} className="mb-3 text-base font-semibold text-fg">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body
  );
}

/** "3초 전", "2분 전" — 기준 시각(now)은 화면이 넘긴다 */
export function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

/** 평가금액 추이 (일별 시작 평가금액 + 현재). SVG 라 테마 토큰 색을 그대로 쓴다. */
export function EquityChart({ points }: { points: { label: string; value: string }[] }) {
  if (points.length < 2) {
    return <p className="py-10 text-center text-xs text-fg-subtle">추이를 그리려면 거래일이 이틀 이상 쌓여야 합니다.</p>;
  }
  const W = 600;
  const H = 160;
  const P = 8;
  const values = points.map((p) => Number(p.value)); // 픽셀 좌표용 (표시는 문자열 그대로)
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => P + (i * (W - P * 2)) / (points.length - 1);
  const y = (v: number) => H - P - ((v - min) * (H - P * 2)) / span;
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - P} L${x(0).toFixed(1)},${H - P} Z`;
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <figure className="min-w-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" preserveAspectRatio="none" role="img" aria-label="평가금액 추이">
        <path d={area} className="fill-accent-soft" />
        <path d={line} className="fill-none stroke-accent" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex justify-between text-[11px] text-fg-subtle tabular-nums">
        <span>
          {first.label} · {formatDec(first.value)}
        </span>
        <span>
          {last.label} · {formatDec(last.value)}
        </span>
      </figcaption>
    </figure>
  );
}
