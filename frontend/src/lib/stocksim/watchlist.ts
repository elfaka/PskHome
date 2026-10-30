"use client";

import { useSyncExternalStore } from "react";

/**
 * 관심종목 — 브라우저(localStorage)에만 둔다.
 *
 * 서버 렌더와 첫 hydration 에서는 기본 목록을 쓰고, 마운트 뒤 저장값으로 바뀐다.
 * (themeStore 와 같은 useSyncExternalStore 구조. effect 에서 setState 하지 않으려는 의도)
 */

export type WatchItem = { symbol: string; name: string };

const STORAGE_KEY = "stocksim.watchlist";

export const DEFAULT_WATCHLIST: WatchItem[] = [
  { symbol: "005930", name: "삼성전자" },
  { symbol: "000660", name: "SK하이닉스" },
  { symbol: "005380", name: "현대차" },
  { symbol: "035420", name: "NAVER" },
  { symbol: "035720", name: "카카오" },
];

const SERVER_SNAPSHOT = JSON.stringify(DEFAULT_WATCHLIST);
let snapshot: string | null = null;
const listeners = new Set<() => void>();

function read(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && Array.isArray(JSON.parse(stored))) return stored;
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 모드 등)이면 기본 목록
  }
  return SERVER_SNAPSHOT;
}

function getSnapshot(): string {
  snapshot ??= read();
  return snapshot;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function write(items: WatchItem[]) {
  snapshot = JSON.stringify(items);
  try {
    localStorage.setItem(STORAGE_KEY, snapshot);
  } catch {
    // 저장에 실패해도 이번 방문 동안은 유지된다.
  }
  listeners.forEach((l) => l());
}

export function useWatchlist() {
  const value = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
  const items = JSON.parse(value) as WatchItem[];

  return {
    items,
    has: (symbol: string) => items.some((i) => i.symbol === symbol),
    toggle: (item: WatchItem) =>
      write(items.some((i) => i.symbol === item.symbol) ? items.filter((i) => i.symbol !== item.symbol) : [...items, item]),
  };
}
