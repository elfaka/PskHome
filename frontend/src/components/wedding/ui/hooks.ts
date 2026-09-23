"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** 서버·하이드레이션 중에는 false, 이후 true. 서버 HTML 과 첫 클라이언트 렌더를 일치시킨다. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * 구형 인앱 WebView 에는 IntersectionObserver 가 없다.
 * 서버 스냅샷은 true(있다고 가정)로 두고, 없으면 하이드레이션 직후 다시 그린다.
 */
export function useCanObserve(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => typeof IntersectionObserver !== "undefined",
    () => true,
  );
}

function subscribeClock(onChange: () => void) {
  const id = window.setInterval(onChange, 1000);
  // 백그라운드 탭에서는 타이머가 늦게 돈다. 돌아오는 즉시 한 번 갱신한다.
  const onVisible = () => {
    if (document.visibilityState === "visible") onChange();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/** 초 단위 현재 시각(ms). 서버에서는 null — 시각이 다르면 하이드레이션이 어긋나기 때문이다. */
export function useNowSeconds(): number | null {
  const sec = useSyncExternalStore(
    subscribeClock,
    () => Math.floor(Date.now() / 1000),
    () => null,
  );
  return sec === null ? null : sec * 1000;
}
