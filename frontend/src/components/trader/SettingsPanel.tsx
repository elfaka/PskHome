"use client";

import { useMemo, useState } from "react";

import { traderUpdateSettings, type TraderStatus } from "@/api/trader";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errorMessage";
import { formatDec, formatKst, formatRatioPct } from "@/lib/trader/decimal";
import { looksLikeDecimal, SETTING_GROUPS, SETTING_KEYS, UNIT_SUFFIX, type SettingMeta } from "@/lib/trader/settingsMeta";

import { useStepUp } from "./stepUp";
import { Modal, Section } from "./ui";

/**
 * 설정 — trader.env 기본값 위에 화면에서 덮어쓴다 (3Commas 설정 흐름: 고치기 → 검토 → 적용 → 이력).
 * 저장은 서버(검증) → engine_state → 엔진(다시 검증, 약 5초 안에 다음 판단부터 적용) 순서다.
 * 설정 변경은 2단계 인증이 필요하다.
 */

function normalize(v: string): string {
  const t = v.trim();
  if (!looksLikeDecimal(t)) return t;
  const [i, f = ""] = t.split(".");
  const int = i.replace(/^0+(?=\d)/, "");
  const frac = f.replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

function show(meta: SettingMeta, v: string | null | undefined): string {
  if (v == null || v === "") return "—";
  if (meta.unit === "rate") return `${formatRatioPct(v, 3, false)}`;
  if (meta.unit === "krw") return `${formatDec(v)}원`;
  if (meta.unit === "enum") return meta.options?.find((o) => o.value === v)?.label ?? v;
  return `${v}${UNIT_SUFFIX[meta.unit]}`;
}

export default function SettingsPanel({ status, onSaved }: { status: TraderStatus | null; onSaved: () => void }) {
  const settings = status?.settings ?? null;
  const { guarded, totpEnabled } = useStepUp();
  // 사용자가 고친 값 (키 → 원하는 값). 기본값과 같게 만들면 덮어쓰기를 지운다
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const metaByKey = useMemo(() => new Map(SETTING_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i] as const))), []);

  if (!settings) {
    return (
      <Section title="설정">
        <p className="text-sm text-fg-muted">
          엔진이 아직 설정을 기록하지 않았습니다. 새 버전 엔진이 한 번 기동하면 trader.env 기본값과 적용값이 여기에 나타납니다.
        </p>
      </Section>
    );
  }

  // 지금 서버에 저장된 덮어쓰기 (적용 대기 중이면 그 값)
  const stored: Record<string, string> = settings.pending?.values ?? settings.overrides;
  const desired = (key: string): string => draft[key] ?? stored[key] ?? settings.base[key] ?? "";
  const changes = SETTING_KEYS.filter((k) => {
    if (!(k in draft)) return false;
    const before = stored[k] ?? settings.base[k] ?? "";
    return normalize(draft[k]) !== normalize(before);
  });
  const invalid = changes.filter((k) => metaByKey.get(k)?.unit !== "enum" && !looksLikeDecimal(draft[k]));

  function nextOverrides(): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (const k of SETTING_KEYS) {
      const v = normalize(desired(k));
      const base = settings!.base[k];
      out[k] = base != null && normalize(base) === v ? null : v;
    }
    return out;
  }

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      let version = 0;
      const ok = await guarded(async () => {
        version = (await traderUpdateSettings(nextOverrides())).version;
      });
      if (ok) {
        setDraft({});
        setReview(false);
        setSaved(`v${version} 저장됨 — 엔진이 약 5초 안에 검증 후 적용합니다.`);
        onSaved();
      }
    } catch (e) {
      setError(errorMessage(e, "설정을 저장하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  function resetAll() {
    const d: Record<string, string> = {};
    for (const k of Object.keys(stored)) d[k] = settings!.base[k] ?? "";
    setDraft(d);
  }

  const info = settings.info;

  return (
    <div className="space-y-4">
      <Section
        title="적용 상태"
        aside={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone={totpEnabled ? "success" : "warning"}>{totpEnabled ? "2단계 인증 켜짐" : "2단계 인증 꺼짐 — 변경 불가"}</Badge>
            <Badge tone="neutral">적용 v{settings.appliedVersion}</Badge>
            {settings.pending && <Badge tone="info">v{settings.pending.version} 적용 대기</Badge>}
          </div>
        }
      >
        <div className="space-y-2 text-sm">
          {settings.rejected && (
            <Alert>
              v{settings.rejected.version} 을(를) 엔진이 거부했습니다 ({formatKst(settings.rejected.at)}): {settings.rejected.reason}
            </Alert>
          )}
          {saved && <p className="text-success-soft-fg">{saved}</p>}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
            <Info label="모드" value={info?.mode === "live" ? "실거래" : "모의"} />
            <Info label="시세" value={info?.feed ?? "—"} />
            <Info label="종목" value={info?.symbols?.join(", ") ?? "—"} />
            <Info label="시작 현금" value={info?.paper_initial_cash ? `${formatDec(info.paper_initial_cash)}원` : "—"} />
            <Info label="봉 주기" value={info?.bar_interval_seconds ? `${info.bar_interval_seconds}초` : "—"} />
            <Info label="신규 매수 마감" value={info?.entry_cutoff?.slice(0, 5) ?? "끔"} />
            <Info label="장마감 청산" value={info?.eod_exit?.slice(0, 5) ?? "끔"} />
            <Info
              label="전략"
              value={info?.strategies?.map((s) => `${s.id}${s.shadow ? "(그림자)" : ""}`).join(", ") ?? "—"}
            />
          </dl>
          <p className="text-[11px] text-fg-subtle">
            위 항목과 DB 접속 정보는 서버의 server/trader.env 에서만 바꿀 수 있습니다 (엔진 재배포 필요).
          </p>
        </div>
      </Section>

      <div className="grid gap-4 2xl:grid-cols-2">
        {SETTING_GROUPS.map((g) => (
          <Section key={g.title} title={g.title}>
            {g.hint && <p className="mb-3 text-xs text-fg-subtle">{g.hint}</p>}
            <ul className="divide-y divide-line/60">
              {g.items.map((m) => {
                const changed = changes.includes(m.key);
                const overridden = stored[m.key] != null;
                return (
                  <li key={m.key} className="grid gap-3 py-3 md:grid-cols-[minmax(0,1fr)_14rem]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <label htmlFor={`setting-${m.key}`} className="text-sm font-medium text-fg">
                          {m.label}
                        </label>
                        {overridden && <Badge tone="accent">화면 설정</Badge>}
                        {changed && <Badge tone="info">변경 예정</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-fg-muted">{m.meaning}</p>
                      <p className="mt-1 text-[11px] text-fg-subtle">
                        <span className="text-danger-soft-fg">↑</span> {m.up}
                        <br />
                        <span className="text-info-soft-fg">↓</span> {m.down}
                      </p>
                      <p className="mt-1 text-[11px] text-fg-subtle tabular-nums">
                        기본값(trader.env) {show(m, settings.base[m.key])} · 지금 적용 {show(m, settings.effective[m.key])}
                      </p>
                    </div>
                    <div className="self-center">
                      {m.unit === "enum" ? (
                        <Select
                          id={`setting-${m.key}`}
                          value={desired(m.key)}
                          onChange={(e) => setDraft((d) => ({ ...d, [m.key]: e.target.value }))}
                        >
                          {m.options?.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Input
                            id={`setting-${m.key}`}
                            inputMode="decimal"
                            value={desired(m.key)}
                            onChange={(e) => setDraft((d) => ({ ...d, [m.key]: e.target.value }))}
                            aria-invalid={invalid.includes(m.key) || undefined}
                            className={cn("text-right tabular-nums", invalid.includes(m.key) && "border-danger")}
                          />
                          <span className="w-6 shrink-0 text-xs text-fg-subtle">{UNIT_SUFFIX[m.unit]}</span>
                        </div>
                      )}
                      {m.unit === "rate" && looksLikeDecimal(desired(m.key)) && (
                        <p className="mt-1 text-right text-[11px] text-fg-subtle">= {formatRatioPct(normalize(desired(m.key)), 3, false)}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
        ))}
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-fg-muted">
            {changes.length ? `${changes.length}개 항목 변경 예정` : "바뀐 항목이 없습니다."}
            {invalid.length > 0 && <span className="ml-2 text-danger-soft-fg">숫자 형식이 아닌 값이 있습니다.</span>}
          </p>
          <div className="flex gap-2">
            {Object.keys(stored).length > 0 && (
              <Button variant="ghost" size="sm" onClick={resetAll}>
                모두 기본값으로
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setDraft({})} disabled={changes.length === 0}>
              되돌리기
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setReview(true)}
              disabled={changes.length === 0 || invalid.length > 0 || !totpEnabled}
            >
              변경 검토
            </Button>
          </div>
        </div>
      </div>

      {review && (
        <Modal title="설정 변경 검토" onClose={() => setReview(false)}>
          <div className="space-y-4">
            <ul className="space-y-2 text-sm">
              {changes.map((k) => {
                const m = metaByKey.get(k)!;
                return (
                  <li key={k} className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-fg-muted">{m.label}</span>
                    <span className="tabular-nums">
                      <span className="text-fg-subtle line-through">{show(m, stored[k] ?? settings.base[k])}</span>
                      <span className="mx-1.5 text-fg-subtle">→</span>
                      <span className="font-medium text-fg">{show(m, normalize(draft[k]))}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-fg-subtle">
              서버와 엔진이 범위와 값 사이 관계를 다시 검증합니다. 통과하면 다음 판단부터 적용되고, 거부되면 이전 값이 유지됩니다. 변경은 활동 로그에 남습니다.
            </p>
            {error && <Alert>{error}</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReview(false)}>
                취소
              </Button>
              <Button variant="primary" onClick={() => void apply()} disabled={busy}>
                {busy ? "저장 중…" : "적용"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="truncate text-fg">{value}</dd>
    </div>
  );
}
