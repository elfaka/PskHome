"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MusicBox } from "@/lib/wedding/musicBox";

/** 브라우저가 "사용자가 페이지와 상호작용했다"고 인정하는 이벤트 — 이 안에서만 소리를 켤 수 있다 */
const GESTURES = ["touchend", "click", "keydown"] as const;

/** LP 버튼에 붙이는 표시. 첫 탭이 LP 면 자동 재생 대신 LP 의 토글이 처리한다 */
export const BGM_TOGGLE_ATTR = "data-bgm-toggle";

/**
 * LP 재생 상태. `playing` 은 "LP 가 돌고 있는가" 이며 소리 여부와 별개다 —
 * Web Audio 를 못 쓰는 환경에서도 LP 는 돌고 멈춘다.
 *
 * autoplay: 페이지에 들어오자마자 재생을 시도한다. 대부분의 모바일 브라우저는 사용자 동작 없는
 * 소리 재생을 막으므로, 그때는 화면 어디든(봉투 포함) 처음 탭하는 순간 재생한다.
 * 사용자가 LP 로 직접 멈췄다면 다시 자동으로 켜지 않는다.
 */
export function useMusicBox({ autoplay = false }: { autoplay?: boolean } = {}) {
  const [playing, setPlaying] = useState(false);
  // undefined: 아직 만들지 않음 / null: 만들 수 없는 환경
  const boxRef = useRef<MusicBox | null | undefined>(undefined);
  const playingRef = useRef(false);
  const userPaused = useRef(false);
  const resumeOnVisible = useRef(false);

  const set = useCallback((next: boolean) => {
    playingRef.current = next;
    setPlaying(next);
  }, []);

  const ensureBox = useCallback(() => {
    if (boxRef.current === undefined) boxRef.current = MusicBox.create();
    return boxRef.current;
  }, []);

  const toggle = useCallback(() => {
    // AudioContext 생성과 resume 은 탭 이벤트 안에서 동기적으로 시작돼야 한다
    const box = ensureBox();

    if (playingRef.current) {
      userPaused.current = true;
      box?.pause();
      set(false);
      return;
    }

    userPaused.current = false;
    set(true);
    box?.play().catch(() => {
      // 재생 실패여도 LP 는 계속 돈다 (소리만 없음)
    });
  }, [ensureBox, set]);

  useEffect(() => {
    const onVisibility = () => {
      const box = boxRef.current;
      if (!box) return;
      if (document.visibilityState === "hidden") {
        resumeOnVisible.current = playingRef.current;
        box.suspend();
      } else if (resumeOnVisible.current) {
        resumeOnVisible.current = false;
        void box.resume().then((ok) => {
          // iOS 등에서 제스처 없이 재개를 거부하면 멈춘 상태로 보여 다시 누르게 한다
          if (!ok) {
            box.pause();
            set(false);
          }
        });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      boxRef.current?.dispose();
      boxRef.current = undefined;
    };
  }, [set]);

  useEffect(() => {
    if (!autoplay) return;
    const box = ensureBox();
    if (!box) return;

    let armed = true;
    const disarm = () => {
      if (!armed) return;
      armed = false;
      for (const t of GESTURES) document.removeEventListener(t, onGesture, true);
    };
    function onGesture(e: Event) {
      disarm();
      if (userPaused.current || playingRef.current) return;
      if (e.target instanceof Element && e.target.closest(`[${BGM_TOGGLE_ATTR}]`)) return;
      set(true);
      box?.play().catch(() => {});
    }
    for (const t of GESTURES) document.addEventListener(t, onGesture, true);

    // 진입 즉시 시도 — 자동재생이 허용된 환경(데스크톱 재방문 등)이면 바로 소리가 난다.
    // 막히면 resume 이 끝나지 않거나 실패하므로 아무것도 하지 않고 첫 탭을 기다린다.
    box
      .play()
      .then((ok) => {
        if (ok && !userPaused.current) {
          set(true);
          disarm();
        }
      })
      .catch(() => {});

    return disarm;
  }, [autoplay, ensureBox, set]);

  return { playing, toggle };
}
