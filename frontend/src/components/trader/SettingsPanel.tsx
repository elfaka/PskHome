"use client";

import { useMemo, useState } from "react";

import { traderRevertSettings, traderUpdateSettings, type TraderStatus } from "@/api/trader";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errorMessage";
import { formatDec, formatKst, formatRatioPct } from "@/lib/trader/decimal";
import {
  formatSettingValue,
  looksLikeCount,
  looksLikeDecimal,
  looksLikeSymbols,
  looksLikeTime,
  SETTING_GROUPS,
  SETTING_KEYS,
  UNIT_SUFFIX,
  type SettingMeta,
} from "@/lib/trader/settingsMeta";

import { useStepUp } from "./stepUp";
import { Modal, Section } from "./ui";

/**
 * 운영 설정 — 원본은 DB(engine_state settings)다. trader.env 는 엔진이 처음 뜰 때 한 번 옮길 때만 쓴다.
 * 흐름(3Commas 설정 흐름): 고치기 → 검토 → 적용(2단계 인증) → 이력(활동 로그) · 직전 설정으로 되돌리기.
 * 저장은 서버(검증) → engine_state → 엔진(다시 검증, 약 5초 안에 다음 판단부터 적용) 순서다.
 */

/** 비교·전송용 정규화. 숫자는 "0010.50" → "10.5", 시각은 "15:00" → "15:00:00", 빈 시각은 null(끔) */
function normalize(meta: SettingMeta | undefined, v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  if (meta?.unit === "time") {
    if (!t) return null;
    return looksLikeTime(t) && t.length === 5 ? `${t}:00` : t;
  }
  if (meta?.unit === "symbols") {
    const list = [...new Set(t.split(",").map((x) => x.trim()).filter(Boolean))];
    return list.length ? list.join(",") : null;
  }
  if (meta?.unit === "count") {
    if (!t) return meta.emptyLabel ? null : t;
    return looksLikeCount(t) ? String(Number(t)) : t;
  }
  if (!looksLikeDecimal(t)) return t;
  const [i, f = ""] = t.split(".");
  const int = i.replace(/^0+(?=\d)/, "");
  const frac = f.replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

const show = formatSettingValue;

/** 입력칸에 보여줄 값 (시각은 HH:MM, 끔은 빈칸) */
function editable(meta: SettingMeta, v: string | null | undefined): string {
  if (v == null) return "";
  return meta.unit === "time" ? v.slice(0, 5) : v;
}

export default function SettingsPanel({ status, onSaved }: { status: TraderStatus | null; onSaved: () => void }) {
  const settings = status?.settings ?? null;
  const { guarded, totpEnabled } = useStepUp();
  // 사용자가 고친 값 (키 → 입력값)
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [review, setReview] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const metaByKey = useMemo(() => new Map(SETTING_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i] as const))), []);

  if (!settings) {
    return (
      <Section title="설정">
        <p className="text-sm text-fg-muted">엔진이 아직 설정을 기록하지 않았습니다. 엔진이 한 번 기동하면 여기에 나타납니다.</p>
      </Section>
    );
  }

  // DB 설정에 아직 없는 새 키(예전 엔진이 옮긴 설정)는 엔진 적용값으로 보여준다 — 서버도 같은 값으로 채워 검증한다
  const stored: Record<string, string | null> = { ...settings.effective, ...settings.values };
  const canEdit = settings.ready && totpEnabled;
  const desired = (key: string): string => draft[key] ?? editable(metaByKey.get(key)!, stored[key]);
  const changes = SETTING_KEYS.filter((k) => {
    if (!(k in draft)) return false;
    const m = metaByKey.get(k);
    return normalize(m, draft[k]) !== normalize(m, stored[k]);
  });
  const invalid = changes.filter((k) => {
    const m = metaByKey.get(k)!;
    const v = draft[k].trim();
    if (m.unit === "enum") return false;
    if (m.unit === "time") return v !== "" && !looksLikeTime(v);
    if (m.unit === "count") return v === "" ? !m.emptyLabel : !looksLikeCount(v);
    if (m.unit === "symbols") return !looksLikeSymbols(v);
    return !looksLikeDecimal(v);
  });

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      let version = 0;
      // 바꾼 항목만 보낸다 (서버가 지금 값에 합쳐 전체를 검증한다)
      const body = Object.fromEntries(changes.map((k) => [k, normalize(metaByKey.get(k), draft[k])]));
      const ok = await guarded(async () => {
        version = (await traderUpdateSettings(body)).version;
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

  async function revert() {
    setBusy(true);
    setError(null);
    try {
      let r = { version: 0, restored: 0 };
      const ok = await guarded(async () => {
        r = await traderRevertSettings();
      });
      if (ok) {
        setDraft({});
        setConfirmRevert(false);
        setSaved(`v${r.restored} 값으로 되돌려 v${r.version} 저장됨 — 엔진이 약 5초 안에 적용합니다.`);
        onSaved();
      }
    } catch (e) {
      setError(errorMessage(e, "되돌리지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  const info = settings.info;

  return (
    <div className="space-y-4">
      <Section
        title="적용 상태"
        aside={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone={totpEnabled ? "success" : "warning"}>{totpEnabled ? "2단계 인증 켜짐" : "2단계 인증 꺼짐 — 변경 불가"}</Badge>
            {settings.ready && <Badge tone="neutral">저장 v{settings.savedVersion}</Badge>}
            <Badge tone="neutral">엔진 적용 v{settings.appliedVersion}</Badge>
            {settings.pending && <Badge tone="info">v{settings.pending.version} 적용 대기</Badge>}
          </div>
        }
      >
        <div className="space-y-2 text-sm">
          {!settings.ready && (
            <Alert>
              엔진이 아직 운영 설정을 DB 로 옮기지 않았습니다. 새 엔진을 배포하면 처음 기동할 때 trader.env 값을 DB 로 옮기고, 그 뒤부터 여기서
              바꿉니다.
            </Alert>
          )}
          {settings.rejected && (
            <Alert>
              v{settings.rejected.version} 을(를) 엔진이 거부했습니다 ({formatKst(settings.rejected.at)}): {settings.rejected.reason}
            </Alert>
          )}
          {saved && <p className="text-success-soft-fg">{saved}</p>}
          {settings.ready && (
            <p className="text-xs text-fg-muted">
              운영 설정은 DB 에 저장됩니다 (trader.env 아님). 마지막 저장 v{settings.savedVersion} · {settings.savedBy ?? "—"} ·{" "}
              {formatKst(settings.savedAt)}
            </p>
          )}
          {settings.envIgnored.length > 0 && (
            <p className="rounded-control border border-line bg-surface-2 px-3 py-2 text-xs text-fg-muted">
              서버 trader.env 에 남아 있지만 쓰이지 않는 값: {settings.envIgnored.map((k) => metaByKey.get(k)?.label ?? k).join(", ")}. DB 값을
              쓰므로 trader.env 에서 지워도 됩니다.
            </p>
          )}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
            <Info label="모드" value={info?.mode === "live" ? "실거래" : "모의"} />
            <Info label="시세" value={info?.feed ?? "—"} />
            <Info label="종목" value={info?.symbols?.join(", ") ?? "—"} />
            <Info label="시작 현금" value={info?.paper_initial_cash ? `${formatDec(info.paper_initial_cash)}원` : "—"} />
            <Info label="봉 주기" value={info?.bar_interval_seconds ? `${info.bar_interval_seconds}초` : "—"} />
            <Info
              label="장 시간"
              value={info?.market_open && info?.market_close ? `${info.market_open.slice(0, 5)}~${info.market_close.slice(0, 5)}` : "—"}
            />
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
                const notApplied = settings.ready && normalize(m, stored[m.key]) !== normalize(m, settings.effective[m.key]);
                return (
                  <li key={m.key} className="grid gap-3 py-3 md:grid-cols-[minmax(0,1fr)_14rem]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <label htmlFor={`setting-${m.key}`} className="text-sm font-medium text-fg">
                          {m.label}
                        </label>
                        {changed && <Badge tone="info">변경 예정</Badge>}
                        {notApplied && <Badge tone="warning">엔진 적용 전</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-fg-muted">{m.meaning}</p>
                      <p className="mt-1 text-[11px] text-fg-subtle">
                        <span className="text-danger-soft-fg">↑</span> {m.up}
                        <br />
                        <span className="text-info-soft-fg">↓</span> {m.down}
                      </p>
                      <p className="mt-1 text-[11px] text-fg-subtle tabular-nums">
                        저장된 값 {show(m, stored[m.key])} · 엔진 적용 {show(m, settings.effective[m.key])}
                      </p>
                    </div>
                    <div className="self-center">
                      {m.unit === "enum" ? (
                        <Select
                          id={`setting-${m.key}`}
                          value={desired(m.key)}
                          disabled={!settings.ready}
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
                            inputMode={m.unit === "time" || m.unit === "count" ? "numeric" : m.unit === "symbols" ? "text" : "decimal"}
                            placeholder={m.placeholder ?? (m.unit === "time" ? "HH:MM (비우면 끔)" : undefined)}
                            value={desired(m.key)}
                            disabled={!settings.ready}
                            onChange={(e) => setDraft((d) => ({ ...d, [m.key]: e.target.value }))}
                            aria-invalid={invalid.includes(m.key) || undefined}
                            className={cn("text-right tabular-nums", invalid.includes(m.key) && "border-danger")}
                          />
                          <span className="w-6 shrink-0 text-xs text-fg-subtle">{UNIT_SUFFIX[m.unit]}</span>
                        </div>
                      )}
                      {m.unit === "rate" && looksLikeDecimal(desired(m.key)) && (
                        <p className="mt-1 text-right text-[11px] text-fg-subtle">
                          = {formatRatioPct(normalize(m, desired(m.key)), 3, false)}
                        </p>
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
            {invalid.length > 0 && <span className="ml-2 text-danger-soft-fg">형식이 맞지 않는 값이 있습니다.</span>}
          </p>
          <div className="flex gap-2">
            {settings.previousVersion != null && (
              <Button variant="ghost" size="sm" onClick={() => setConfirmRevert(true)} disabled={!canEdit || busy}>
                직전 설정으로 되돌리기
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setDraft({})} disabled={changes.length === 0}>
              입력 취소
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setReview(true)}
              disabled={changes.length === 0 || invalid.length > 0 || !canEdit}
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
                      <span className="text-fg-subtle line-through">{show(m, stored[k])}</span>
                      <span className="mx-1.5 text-fg-subtle">→</span>
                      <span className="font-medium text-fg">{show(m, normalize(m, draft[k]))}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-fg-subtle">
              DB 에 새 버전으로 저장합니다. 서버와 엔진이 범위와 값 사이 관계를 다시 검증하고, 통과하면 다음 판단부터 적용됩니다. 거부되면 이전 값이
              유지됩니다. 변경은 활동 로그에 남습니다.
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

      {confirmRevert && (
        <Modal title="직전 설정으로 되돌리기" onClose={() => setConfirmRevert(false)}>
          <div className="space-y-4">
            <p className="text-sm text-fg-muted">
              지금 저장된 v{settings.savedVersion} 대신 v{settings.previousVersion} 의 값을 새 버전으로 저장합니다. 엔진이 약 5초 안에 검증 후
              적용합니다.
            </p>
            {error && <Alert>{error}</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmRevert(false)}>
                취소
              </Button>
              <Button variant="primary" onClick={() => void revert()} disabled={busy}>
                {busy ? "되돌리는 중…" : "되돌리기"}
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
