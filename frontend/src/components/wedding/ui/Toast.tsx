"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

const TOAST_MS = 2600;

/** 짧은 알림 하나. 같은 문구가 연달아 와도 다시 보이도록 매번 id 를 새로 준다. */
export function useToast() {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const notify = useCallback((message: string) => {
    window.clearTimeout(timer.current);
    setToast({ id: Date.now(), message });
    timer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { toast, notify };
}

/**
 * `@container` 안에 두면 컨테이너가 fixed 요소의 기준이 되어 화면 하단에 붙지 않는다.
 * 그래서 컨테이너 밖(WeddingInvitation 최상위)에서 렌더한다.
 */
export function Toast({ toast }: { toast: { id: number; message: string } | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,calc(env(safe-area-inset-bottom)+1rem))] z-40 flex justify-center px-6"
    >
      <AnimatePresence>
        {toast && (
          <motion.p
            key={toast.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.25 }}
            className="max-w-[22rem] rounded-full bg-wd-ink px-5 py-3 text-center text-sm break-keep text-wd-paper shadow-wd-card"
          >
            {toast.message}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
