"use client";

import { useEffect, useState } from "react";

import { searchStocks, type StockSearchItem } from "@/api/stockSim";
import Badge from "@/components/ui/Badge";
import { Input } from "@/components/ui/Field";
import { errorMessage } from "@/lib/errorMessage";

const DEBOUNCE_MS = 250;

/**
 * 종목명·종목코드 검색. 고르면 `onSelect` 로 알리고 입력을 비운다.
 * 첫 검색은 백엔드가 토스에서 전체 종목 목록을 받아오느라 1~2초 걸린다 (이후 하루 캐시).
 */
export default function StockSearch({
  id,
  onSelect,
}: {
  /** 넓은/좁은 화면용으로 두 번 그려지므로 라벨 연결용 id 를 따로 받는다 */
  id: string;
  onSelect: (item: StockSearchItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchStocks(q);
        if (!cancelled) {
          setResults(found);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(errorMessage(e, "종목을 검색하지 못했습니다."));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const changeQuery = (value: string) => {
    setQuery(value);
    if (!value.trim()) {
      setResults([]);
      setError(null);
    }
  };

  const select = (item: StockSearchItem) => {
    onSelect(item);
    changeQuery("");
  };

  const open = query.trim().length > 0;

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        종목 검색
      </label>
      <Input
        id={id}
        type="search"
        value={query}
        onChange={(e) => changeQuery(e.target.value)}
        placeholder="종목명 또는 코드 (예: 삼성전자, 005930)"
        autoComplete="off"
      />

      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-auto rounded-card border border-line bg-surface shadow-overlay">
          {error ? (
            <div className="p-3 text-sm text-danger-soft-fg">{error}</div>
          ) : searching && results.length === 0 ? (
            <div className="p-3 text-sm text-fg-muted">검색 중...</div>
          ) : results.length === 0 ? (
            <div className="p-3 text-sm text-fg-muted">검색 결과가 없습니다.</div>
          ) : (
            <ul aria-label="검색 결과">
              {results.map((item) => (
                <li key={item.symbol}>
                  <button
                    type="button"
                    onClick={() => select(item)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-surface-hover"
                  >
                    <span className="min-w-0 truncate text-fg">{item.name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-xs text-fg-subtle">{item.symbol}</span>
                      <Badge>{item.market}</Badge>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
