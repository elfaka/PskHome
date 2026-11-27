"use client";

import axios from "axios";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { getTraderActivity, getTraderStatus, getTraderStrategies, getTraderSummary } from "@/api/trader";
import Alert from "@/components/ui/Alert";
import ThemeToggle from "@/components/theme/ThemeToggle";
import { cn } from "@/lib/cn";
import { usePolling } from "@/lib/stocksim/usePolling";

import { ActivityPanel, DecisionsPanel, OverviewPanel, StrategyList, TradesPanel } from "./panels";
import { SymbolNamesProvider } from "./names";
import SettingsPanel from "./SettingsPanel";
import StatusBar from "./StatusBar";
import { StepUpProvider } from "./stepUp";
import { Section } from "./ui";

/**
 * 자동매매 대시보드.
 *
 * 구성 (참고: FreqUI 대시보드·거래 내역, Grafana 상태·숫자 카드·로그·알림, Uptime Kuma 상태 막대, 3Commas 봇 켜기/끄기·설정 흐름)
 *   상단 상태 바  실행/중지 · 모의 · 시세·DB 연결 · 마지막 갱신 · 긴급 정지/재개
 *   알림 줄      긴급 정지 · 엔진 응답 없음 · 장중 시세 끊김 · 설정 거부 · 하루 손실 한도 80%
 *   개요         총자산 · 오늘 손익 · 누적 수익률 · MDD · 추이 · 리스크 · 전략 · 최근 활동 · 보유 종목
 *   전략 / 보유·주문 / 판단·성과 / 활동 로그 / 설정
 *
 * 숫자는 Decimal 문자열 그대로 포맷한다. 상승 빨강 / 하락 파랑 (국내 관례).
 * 조작은 서버가 2단계 인증·출처를 확인한다. 화면은 결과만 보여준다.
 */

const TABS = [
  { id: "overview", label: "개요" },
  { id: "strategies", label: "전략" },
  { id: "trades", label: "보유·주문" },
  { id: "decisions", label: "판단·성과" },
  { id: "activity", label: "활동 로그" },
  { id: "settings", label: "설정" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// 탭은 주소 #해시 에 남긴다 (새로고침·뒤로 가기에도 유지)
function subscribeHash(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

function useHashTab(): TabId {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash.slice(1), () => "");
  return (TABS.find((t) => t.id === hash)?.id ?? "overview") as TabId;
}

export default function TraderDashboard({
  username,
  onLogout,
  totpEnabled = false,
  stepUpUntil = null,
  onSessionExpired,
}: {
  username: string;
  onLogout: () => Promise<void>;
  totpEnabled?: boolean;
  stepUpUntil?: string | null;
  /** 세션이 끝나 401 을 받으면 (재배포·유휴 만료) 로그인 화면으로 돌아간다 */
  onSessionExpired?: () => void;
}) {
  const tab = useHashTab();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      return await getTraderStatus();
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 401) onSessionExpired?.();
      throw e;
    }
  }, [onSessionExpired]);
  const status = usePolling("status", loadStatus, 5_000, "엔진 상태를 불러오지 못했습니다.");
  const summary = usePolling("summary", getTraderSummary, 10_000, "요약을 불러오지 못했습니다.");
  const strategies = usePolling("strategies", getTraderStrategies, 15_000, "전략 목록을 불러오지 못했습니다.");
  const activity = usePolling("activity:20", () => getTraderActivity(20), 15_000, "활동 로그를 불러오지 못했습니다.");
  // 마지막으로 상태를 받은 시각 (서버 시각)
  const refreshedAt = status.data ? new Date(status.data.serverTime).getTime() : null;

  const refreshAll = () => {
    status.refresh();
    summary.refresh();
    strategies.refresh();
    activity.refresh();
  };

  function open(id: string) {
    const t = TABS.find((x) => x.id === id)?.id;
    if (!t) return;
    // hashchange 를 직접 알려 탭 구독이 다시 읽게 한다 (replaceState 는 이벤트를 내지 않는다)
    window.history.replaceState(null, "", `#${t}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  const s = summary.data;
  const alerts = [...(status.data?.alerts ?? [])];
  if (s?.lossUsage && /^(0\.[89]|[1-9])/.test(s.lossUsage)) {
    alerts.push({ level: "warn", code: "LOSS_LIMIT", message: "하루 손실 한도의 80% 이상을 썼습니다." });
  }
  if (!totpEnabled) {
    alerts.push({
      level: "info",
      code: "TOTP_OFF",
      message: "2단계 인증이 설정되지 않았습니다 — 재개·전략 켜기·설정 변경을 할 수 없습니다 (긴급 정지는 가능).",
    });
  }

  // 종목 이름 (오늘의 종목에서) — 판단·로그·보유 표가 코드 옆에 이름을 보여준다
  const names = Object.fromEntries((status.data?.universe?.symbols ?? []).filter((p) => p.name).map((p) => [p.symbol, p.name!]));

  return (
    <StepUpProvider totpEnabled={totpEnabled} initialUntil={stepUpUntil}>
      <SymbolNamesProvider value={names}>
      <div className="min-h-screen bg-bg">
        <StatusBar
          status={status.data}
          now={now}
          refreshedAt={refreshedAt}
          username={username}
          onChanged={refreshAll}
          onLogout={() => void onLogout()}
          themeToggle={<ThemeToggle />}
        />

        <div className="flex gap-6 px-4 py-4">
          <nav aria-label="자동매매 메뉴" className="hidden w-40 shrink-0 lg:block">
            <ul className="sticky top-20 space-y-1">
              {TABS.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => open(t.id)}
                    aria-current={tab === t.id ? "page" : undefined}
                    className={cn(
                      "w-full rounded-control px-3 py-2 text-left text-sm",
                      tab === t.id ? "bg-accent-soft font-medium text-accent-soft-fg" : "text-fg-muted hover:bg-surface-hover hover:text-fg"
                    )}
                  >
                    {t.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <main className="min-w-0 flex-1 space-y-4">
            <nav aria-label="자동매매 메뉴 (좁은 화면)" className="-mx-4 overflow-x-auto px-4 lg:hidden">
              <div className="flex gap-1 border-b border-line">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => open(t.id)}
                    aria-current={tab === t.id ? "page" : undefined}
                    className={cn(
                      "shrink-0 border-b-2 px-3 py-2 text-sm",
                      tab === t.id ? "border-accent font-medium text-fg" : "border-transparent text-fg-muted"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </nav>

            {(status.error || summary.error) && <Alert>{status.error ?? summary.error}</Alert>}
            {alerts.length > 0 && (
              <ul aria-label="알림" className="space-y-1.5">
                {alerts.map((a, i) => (
                  <li
                    key={`${a.code}-${i}`}
                    className={cn(
                      "rounded-control border px-3 py-2 text-sm",
                      a.level === "error" && "border-danger/40 bg-danger-soft text-danger-soft-fg",
                      a.level === "warn" && "border-warning/40 bg-warning-soft text-warning-soft-fg",
                      a.level === "info" && "border-line bg-surface-2 text-fg-muted"
                    )}
                  >
                    {a.message}
                  </li>
                ))}
              </ul>
            )}

            {tab === "overview" && (
              <OverviewPanel summary={s} status={status.data} strategies={strategies.data} activity={activity.data} onOpen={open} />
            )}
            {tab === "strategies" && (
              <Section title="전략">
                <StrategyList rows={strategies.data} status={status.data} onChanged={refreshAll} />
              </Section>
            )}
            {tab === "trades" && <TradesPanel summary={s} />}
            {tab === "decisions" && <DecisionsPanel />}
            {tab === "activity" && <ActivityPanel />}
            {tab === "settings" && <SettingsPanel status={status.data} onSaved={refreshAll} />}
          </main>
        </div>
      </div>
      </SymbolNamesProvider>
    </StepUpProvider>
  );
}
