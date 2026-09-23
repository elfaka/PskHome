"use client";

import Image from "next/image";
import { useState } from "react";

import type { Photo } from "@/data/wedding";
import { cn } from "@/lib/cn";

import { Sprig } from "./Ornaments";

/**
 * 폴라로이드 프레임. 사진이 없거나 불러오지 못하면 같은 크기의 플레이스홀더를 보여준다.
 * 실패한 src 를 기억하므로 데이터에서 사진을 바꾸면 다시 시도한다.
 */
export default function PhotoFrame({
  photo,
  tilt = 0,
  sizes,
  caption,
  className,
}: {
  photo?: Photo;
  tilt?: number;
  /** next/image sizes — 레이아웃에서 실제로 차지하는 폭 */
  sizes: string;
  caption?: string;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = photo !== undefined && failedSrc !== photo.src;

  return (
    <figure
      className={cn("bg-wd-paper p-2.5 pb-3 shadow-wd-photo", className)}
      style={{ rotate: `${tilt}deg` }}
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-wd-sage-soft">
        {showImage ? (
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            sizes={sizes}
            className="object-cover"
            onError={() => setFailedSrc(photo.src)}
          />
        ) : (
          <div
            role="img"
            aria-label="사진 준비 중"
            className="flex h-full flex-col items-center justify-center gap-2 text-wd-sage-deep"
          >
            <Sprig className="w-14 text-wd-sage" />
            <span className="text-[0.7rem] tracking-[0.2em]">PHOTO</span>
          </div>
        )}
      </div>
      <figcaption className="min-h-5 pt-2 text-center font-wd-script text-lg leading-none text-wd-ink-muted">
        {caption}
      </figcaption>
    </figure>
  );
}
