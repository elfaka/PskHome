"use client";

import { useMemo, useState } from "react";

import { buttonClass } from "@/components/ui/Button";

/**
 * TextRenderer
 *
 * [역할]
 * - 주관식(TEXT) 문항의 응답 샘플을 리스트로 표시
 * - 응답이 많을 수 있으므로 "펼치기/접기"로 UX를 단순화
 * - "전체 복사(엑셀)" 기능으로 결과를 빠르게 정리할 수 있게 지원
 *
 * [입력 props]
 * - text:
 *   { count: 전체 응답 개수, samples: 응답 샘플 문자열 배열 }
 * - maxShow:
 *   화면에 표시/복사에 포함할 최대 샘플 수(기본 200)
 *
 * [왜 maxShow가 필요한가?]
 * - 샘플이 수천 개일 경우 렌더링/복사 비용이 커질 수 있으므로
 *   UI/성능 보호 장치로 제한을 둔다.
 */
export default function TextRenderer({
  text,
  maxShow = 200,
}: {
  text?: { count: number; samples: string[] } | null;
  maxShow?: number;
}) {
  /**
   * 펼치기/접기 상태
   * - false: 목록 숨김(요약만 표시)
   * - true : 샘플 리스트 표시
   */
  const [open, setOpen] = useState(false);

  /**
   * samples: text?.samples를 안전하게 배열로 처리
   * - text가 null/undefined일 수 있으므로 기본값 []
   * - useMemo로 불필요한 재계산/재렌더 최소화
   */
  const samples = useMemo(() => text?.samples ?? [], [text]);

  /**
   * count: 전체 응답 개수 (요약 표시용)
   * - text가 없으면 0
   */
  const count = text?.count ?? 0;

  /**
   * copyAllExcel
   *
   * [역할]
   * - 현재 샘플 목록을 "엑셀에 한 셀씩" 붙여넣기 좋게 복사한다.
   *
   * [핵심 아이디어]
   * - 응답을 줄바꿈(\n)으로 연결해서 clipboard에 넣으면
   *   Excel에서 붙여넣을 때 "한 줄 = 한 셀"로 세로 방향으로 들어간다.
   *
   * [개행 정규화]
   * - \r\n / \r 등을 \n으로 통일해 엑셀 붙여넣기 결과를 안정화
   */
  async function copyAllExcel() {
    const payload = samples
      .slice(0, maxShow)
      .map((s) => String(s ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n"))
      .join("\n");

    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      // 일부 브라우저/보안 정책에서 clipboard API가 막힐 수 있음
      // UX상 굳이 alert를 띄우지 않고 조용히 실패 처리(필요하면 토스트 추가 가능)
    }
  }

  // 응답이 없으면 안내만 표시
  if (!count) return <div className="text-sm text-fg-subtle">응답 없음</div>;

  return (
    <div className="space-y-3">
      {/* 상단: 응답 수 + 액션 버튼(전체복사/펼치기) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-fg-muted">
          응답 수: <span className="font-semibold text-fg">{count}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* 전체 복사(엑셀) */}
          <button
            onClick={copyAllExcel}
            className={buttonClass({ size: "sm" })}
            title="엑셀에 붙여넣기 하면 한 줄이 한 셀(세로)로 들어갑니다."
          >
            전체 복사(엑셀)
          </button>

          {/* 펼치기/접기 */}
          <button
            onClick={() => setOpen((v) => !v)}
            className={buttonClass({ variant: "primary", size: "sm" })}
          >
            {open ? "접기" : "펼치기"}
          </button>
        </div>
      </div>

      {/* 펼친 상태일 때만 샘플 리스트 렌더링 (성능/가독성 고려) */}
      {open && (
        <ul className="space-y-2">
          {samples.slice(0, maxShow).map((s, idx) => (
            <li
              key={idx}
              className="rounded-control border border-line bg-surface p-3"
            >
              <div className="text-xs font-medium text-fg-subtle">
                샘플 {idx + 1}
              </div>
              <div className="mt-1 text-sm break-words whitespace-pre-wrap text-fg">
                {s}
              </div>
            </li>
          ))}

          {/* 샘플이 maxShow를 넘으면 안내 문구 */}
          {samples.length > maxShow && (
            <li className="text-xs text-fg-subtle">
              (샘플이 많아 상위 {maxShow}개만 표시 중)
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
