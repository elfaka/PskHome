"use client";

import { createContext, useContext } from "react";

/**
 * 종목 코드 → 이름. 대시보드가 오늘의 종목(status.universe)에서 채워 내려준다.
 * 이름을 모르는 종목은 코드만 보인다.
 */
const Ctx = createContext<Record<string, string>>({});

export const SymbolNamesProvider = Ctx.Provider;

export function useSymbolName(): (symbol: string | null | undefined) => string | null {
  const names = useContext(Ctx);
  return (symbol) => (symbol ? (names[symbol] ?? null) : null);
}

/** "삼성전자 005930" — 이름이 없으면 코드만 */
export function SymbolText({ symbol, className }: { symbol: string | null | undefined; className?: string }) {
  const name = useSymbolName()(symbol);
  if (!symbol) return <span className={className}>—</span>;
  return (
    <span className={className}>
      {name ? (
        <>
          <span className="text-fg">{name}</span> <span className="text-fg-subtle tabular-nums">{symbol}</span>
        </>
      ) : (
        <span className="tabular-nums text-fg">{symbol}</span>
      )}
    </span>
  );
}
