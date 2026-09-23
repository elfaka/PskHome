"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MusicBox } from "@/lib/wedding/musicBox";

/**
 * LP 재생 상태. `playing` 은 "LP 가 돌고 있는가" 이며 소리 여부와 별개다 —
 * Web Audio 를 못 쓰는 환경에서도 LP 는 돌고 멈춘다.
 *
 * start()/toggle() 은 반드시 사용자 터치 이벤트 안에서 불러야 한다(브라우저 자동재생 정책).
 * 청첩장은 봉투를 터치할 때 start() 를 부른다.
 */
export function useMusicBox() {
  const [playing, setPlaying] = useState(false);
  // undefined: 아직 만들지 않음 / null: 만들 수 없는 환경
  const boxRef = useRef<MusicBox | null | undefined>(undefined);
  const playingRef = useRef(false);
  const resumeOnVisible = useRef(false);

  const set = useCallback((next: boolean) => {
    playingRef.current = next;
    setPlaying(next);
  }, []);

  const play = useCallback(() => {
    // AudioContext 생성과 resume 은 탭 이벤트 안에서 동기적으로 시작돼야 한다
    if (boxRef.current === undefined) boxRef.current = MusicBox.create();
    set(true);
    boxRef.current?.play().catch(() => {
      // 재생 실패여도 LP 는 계속 돈다 (소리만 없음)
    });
  }, [set]);

  /** 이미 재생 중이면 아무것도 하지 않는다 */
  const start = useCallback(() => {
    if (!playingRef.current) play();
  }, [play]);

  const toggle = useCallback(() => {
    if (playingRef.current) {
      boxRef.current?.pause();
      set(false);
      return;
    }
    play();
  }, [play, set]);

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

  return { playing, start, toggle };
}
