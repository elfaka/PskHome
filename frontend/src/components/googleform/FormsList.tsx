"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/api/client";
import Alert from "@/components/ui/Alert";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Field";
import { cardClass } from "@/components/ui/Card";
import { errorMessage } from "@/lib/errorMessage";

/**
 * 백엔드 FormListItemDto와 구조가 동일
 * - formId: 설문 ID
 * - name: 설문 제목
 * - modifiedTime: 마지막 수정 시각(RFC3339 문자열)
 */
type FormItem = {
  formId: string;
  name: string;
  modifiedTime?: string | null;
};

/**
 * FormsList
 *
 * [역할]
 * - 로그인된 사용자의 Google Forms 설문 목록을 조회해 카드 형태로 표시
 * - 검색어로 목록 필터링
 * - 설문 선택 시 분석 페이지로 라우팅 이동
 *
 * [API]
 * - GET /api/forms
 *
 * [UX 포인트]
 * - 검색은 서버 요청 없이 클라이언트에서 즉시 필터링(useMemo)
 * - 에러 발생 시 사용자에게 메시지 표시
 */
export default function FormsList() {
  // 설문 목록
  const [items, setItems] = useState<FormItem[]>([]);

  // 검색어(필터)
  const [q, setQ] = useState("");

  // 에러 메시지
  const [err, setErr] = useState<string | null>(null);

  /**
   * 컴포넌트 마운트 시 설문 목록 로드
   *
   * - /api/forms는 SecurityConfig에서 authenticated() 대상이므로
   *   세션이 만료/로그아웃 상태면 401 등이 발생할 수 있음
   * - 현재는 에러 메시지만 표시하지만,
   *   원하면 401일 때 /googleform/login으로 보내는 처리도 추가 가능
   */
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<FormItem[]>("/api/forms");
        setItems(res.data);
      } catch (e) {
        setErr(errorMessage(e, "Failed to load forms"));
      }
    })();
  }, []);

  /**
   * 검색어 기반 클라이언트 필터링
   *
   * - items가 바뀌거나(q 포함) q가 바뀔 때만 재계산(useMemo)
   * - 검색은 대소문자 무시
   */
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((x) => x.name.toLowerCase().includes(t));
  }, [items, q]);

  return (
    <div>
      {/* 상단 타이틀 + 검색창 */}
      <PageHeader
        eyebrow="Google Forms"
        title="내 설문 목록"
        description="설문을 선택하면 분석 페이지로 이동합니다."
        actions={
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="설문 제목 검색..."
            aria-label="설문 검색"
            className="sm:w-64"
          />
        }
      />

      {/* 에러 표시 */}
      {err && <Alert className="mt-6">{err}</Alert>}

      {/* 설문 카드 리스트 */}
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((f) => (
          <Link
            key={f.formId}
            // 설문 선택 시 분석 페이지로 이동
            href={`/googleform/forms/${f.formId}/analyze`}
            className={cardClass({
              interactive: true,
              className: "group block p-4",
            })}
          >
            {/* 설문 제목 */}
            <div className="font-medium text-fg transition group-hover:text-accent-soft-fg">
              {f.name}
            </div>

            {/* 수정 시각 */}
            <div className="mt-2 font-mono text-xs text-fg-subtle">
              modified: {f.modifiedTime ?? "-"}
            </div>

            {/* CTA */}
            <div className="mt-4 text-sm text-fg-muted">
              분석 보기{" "}
              <span
                aria-hidden
                className="inline-block transition group-hover:translate-x-0.5"
              >
                →
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* 목록이 비었을 때 — 검색 때문인지 설문이 없는 건지 구분해 안내한다 */}
      {!err && filtered.length === 0 && (
        <EmptyState
          className="mt-8"
          title={items.length === 0 ? "설문이 없습니다" : "검색 결과가 없습니다"}
          description={
            items.length === 0
              ? "이 계정의 Google Drive 에서 Forms 를 찾지 못했습니다."
              : `"${q}" 와 맞는 설문을 찾지 못했습니다.`
          }
        />
      )}
    </div>
  );
}
