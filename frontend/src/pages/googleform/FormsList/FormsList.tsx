import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../api/client";

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
      } catch (e: any) {
        setErr(e?.response?.data?.message || e?.message || "Failed to load forms");
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
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-zinc-900">내 설문 목록</h2>
          <p className="mt-1 text-sm text-zinc-600">
            설문을 선택하면 분석 페이지로 이동합니다.
          </p>
        </div>

        <div className="w-full max-w-sm">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="검색..."
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300"
          />
        </div>
      </div>

      {/* 에러 표시 */}
      {err && (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {err}
        </div>
      )}

      {/* 설문 카드 리스트 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((f) => (
          <Link
            key={f.formId}
            // 설문 선택 시 분석 페이지로 이동
            to={`/googleform/forms/${f.formId}/analyze`}
            className="group rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-[1px] hover:border-zinc-300 hover:shadow"
          >
            {/* 설문 제목 */}
            <div className="text-base font-extrabold text-zinc-900">
              {f.name}
            </div>

            {/* 수정 시각 */}
            <div className="mt-2 text-xs text-zinc-500">
              modified: {f.modifiedTime ?? "-"}
            </div>

            {/* CTA */}
            <div className="mt-4 text-sm font-semibold text-zinc-800">
              분석 보기 <span className="opacity-70">→</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
