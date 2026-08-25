"use client";

import { useSyncExternalStore } from "react";

import {
  getServerSnapshot,
  getSnapshot,
  parseSnapshot,
  setPreference,
  subscribe,
} from "./themeStore";

/**
 * 현재 테마를 읽고 바꾸는 훅.
 *
 * `mounted` 는 브라우저 저장값을 아직 못 읽은 상태(서버 렌더 / hydration 직전)를
 * 뜻한다. 이때 아이콘을 그리면 hydration 후 바뀌면서 깜빡이므로 호출부는
 * 빈 자리만 잡아둬야 한다.
 */
export function useTheme() {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  return { ...parseSnapshot(snapshot), setPreference };
}
