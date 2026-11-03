"use client";

import { useSyncExternalStore } from "react";

/**
 * 모의투자 화면 탭 — 주소의 `?tab=` 에 남겨 새로고침·링크 공유·뒤로 가기에도 같은 탭이 열린다.
 *
 * useSearchParams 를 쓰면 정적 페이지 전체를 Suspense 로 감싸 서버 HTML 이 비게 되므로,
 * location 을 직접 구독한다. 서버 렌더와 첫 hydration 은 기본 탭이고 마운트 뒤 주소의 탭으로 바뀐다.
 * history.pushState 는 Next App Router 가 감싸 두어 라우터와도 동기화된다 (state 가 null 일 때).
 */

export const SIM_TABS = ["trade", "valuation", "investors", "market", "account"] as const;
export type SimTab = (typeof SIM_TABS)[number];

const DEFAULT_TAB: SimTab = "trade";
const listeners = new Set<() => void>();

function read(): SimTab {
  const raw = new URLSearchParams(window.location.search).get("tab");
  return (SIM_TABS as readonly string[]).includes(raw ?? "") ? (raw as SimTab) : DEFAULT_TAB;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("popstate", onChange);
  };
}

export function useSimTab(): [SimTab, (tab: SimTab) => void] {
  const tab = useSyncExternalStore(subscribe, read, () => DEFAULT_TAB);

  const setTab = (next: SimTab) => {
    if (next === read()) return;
    const url = new URL(window.location.href);
    if (next === DEFAULT_TAB) url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    // state 는 null 로 넘긴다. Next 내부 상태(__NA)를 그대로 넘기면 라우터가 주소 동기화를 건너뛰어
    // 다음 렌더(HMR·라우터 갱신) 때 이전 주소로 되돌린다.
    window.history.pushState(null, "", url);
    listeners.forEach((l) => l());
  };

  return [tab, setTab];
}
