"use client";

import { useEffect, useRef, useState } from "react";

import { errorMessage } from "@/lib/errorMessage";

/**
 * `key` 가 바뀔 때 다시 불러오고, 탭이 보이는 동안 `intervalMs` 마다 새로 받는다.
 *
 * - 토스 시세는 REST 만 있어 화면이 폴링한다. 백엔드가 짧게 캐시하므로 여러 패널이 같은 종목을 불러도 괜찮다.
 * - 결과를 key 와 함께 저장해, 종목을 바꾼 직후 이전 종목 데이터가 잠깐 보이지 않게 한다
 *   (effect 안에서 상태를 동기적으로 비우지 않으려는 구조다).
 * - 새로고침이 실패해도 마지막으로 받은 데이터는 유지하고 오류만 알린다.
 */
export function usePolling<T>(
  key: string | null,
  load: () => Promise<T>,
  intervalMs: number | null,
  fallbackError = "데이터를 불러오지 못했습니다."
) {
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null }>({
    key: null,
    data: null,
    error: null,
  });
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  const fallbackRef = useRef(fallbackError);

  useEffect(() => {
    loadRef.current = load;
    fallbackRef.current = fallbackError;
  });

  useEffect(() => {
    if (key == null) return;
    let cancelled = false;

    const run = async () => {
      try {
        const data = await loadRef.current();
        if (!cancelled) setState({ key, data, error: null });
      } catch (e) {
        if (cancelled) return;
        const error = errorMessage(e, fallbackRef.current);
        setState((prev) => ({ key, data: prev.key === key ? prev.data : null, error }));
      }
    };

    void run();
    if (!intervalMs) {
      return () => {
        cancelled = true;
      };
    }

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void run();
    }, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [key, intervalMs, nonce]);

  const current = state.key === key ? state : null;

  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: key != null && current == null,
    refresh: () => setNonce((n) => n + 1),
  };
}
