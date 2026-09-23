"use client";

import { motion } from "motion/react";

import { cn } from "@/lib/cn";

import { useCanObserve } from "./hooks";

/**
 * 스크롤 진입 시 페이드업. IntersectionObserver 가 없으면 효과 없이 바로 보여준다
 * (없는 환경에서 whileInView 는 영영 트리거되지 않아 투명한 채로 남는다).
 * `wd-reveal` 은 JS 가 없을 때 noscript 스타일이 초기 투명 상태를 풀기 위한 훅이다.
 */
export default function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const canObserve = useCanObserve();
  if (!canObserve) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={cn("wd-reveal", className)}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
