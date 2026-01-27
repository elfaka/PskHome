import React, { useMemo, useRef, useState, useEffect } from "react";
import { formatJson, JsonFormatMode } from "../../api/jsonPrettierApi";



function clampIndent(v: number): 2 | 4 {
  return v === 4 ? 4 : 2;
}

function indexFromLineCol(text: string, line?: number, col?: number): number | null {
  if (!line || !col || line < 1 || col < 1) return null;

  let curLine = 1;
  let idx = 0;

  while (idx < text.length && curLine < line) {
    if (text[idx] === "\n") curLine++;
    idx++;
  }

  const target = idx + (col - 1);
  return Math.min(target, text.length);
}

const SAMPLE = `{
  "b": 1,
  "a": 2,
  "nested": {
    "z": "마지막",
    "y": "중간",
    "x": "처음"
  },
  "arr": [3, 2, 1]
}`;

type HistoryItem = {
  id: string;
  createdAt: number;
  mode: JsonFormatMode;
  indent: 2 | 4;
  sortKeys: boolean;
  ensureAscii: boolean;
  input: string;
  output: string;
  stats?: { inputLength: number; outputLength: number };
};

function formatTime(ts: number) {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border bg-white/70 px-2 py-0.5 text-xs text-gray-700 shadow-sm">
      {children}
    </span>
  );
}

export default function JsonPrettierPage() {
  const [mode, setMode] = useState<JsonFormatMode>("prettify");
  const [indent, setIndent] = useState<2 | 4>(2);
  const [sortKeys, setSortKeys] = useState(false);
  const [ensureAscii, setEnsureAscii] = useState(false);

  const [input, setInput] = useState(SAMPLE);
  const [output, setOutput] = useState("");
  const [stats, setStats] = useState<{ inputLength: number; outputLength: number } | null>(null);
  const [error, setError] = useState<{ message: string; line?: number; column?: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [restoreAlsoInput, setRestoreAlsoInput] = useState<boolean>(true);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    document.title = "JSON Prettier";
  }, []);
  const canRun = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  const pushHistory = (item: Omit<HistoryItem, "id" | "createdAt">) => {
    const newItem: HistoryItem = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      createdAt: Date.now(),
      ...item,
    };
    setHistory((prev) => [newItem, ...prev].slice(0, 30));
  };

  const run = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await formatJson({
        input,
        mode,
        indent,
        sortKeys,
        ensureAscii,
      });

      if (!res.ok) {
        setOutput("");
        setStats(null);
        setError({
          message: res.error?.message ?? "Invalid JSON",
          line: res.error?.line,
          column: res.error?.column,
        });
        return;
      }

      const nextOutput = res.formatted ?? "";
      const nextStats = res.stats ?? undefined;

      setOutput(nextOutput);
      setStats(nextStats ?? null);

      pushHistory({
        mode,
        indent,
        sortKeys,
        ensureAscii,
        input,
        output: nextOutput,
        stats: nextStats,
      });
    } catch (e: any) {
      setOutput("");
      setStats(null);
      setError({ message: e?.message ?? "Network error" });
    } finally {
      setLoading(false);
    }
  };

  const moveToError = () => {
    if (!inputRef.current) return;
    const idx = indexFromLineCol(input, error?.line, error?.column);
    if (idx == null) return;

    inputRef.current.focus();
    inputRef.current.setSelectionRange(idx, idx);
  };

  const copy = async (text: string, msg: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    alert(msg);
  };

  const clearAll = () => {
    setInput("");
    setOutput("");
    setError(null);
    setStats(null);
  };

  const clearHistory = () => setHistory([]);

  const restoreFromHistory = (item: HistoryItem) => {
    if (restoreAlsoInput) {
      setMode(item.mode);
      setIndent(item.indent);
      setSortKeys(item.sortKeys);
      setEnsureAscii(item.ensureAscii);
      setInput(item.input);
    }
    setOutput(item.output);
    setStats(item.stats ?? null);
    setError(null);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* 헤더 */}
      <div className="mb-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-white to-gray-50 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">JSON Prettier</h1>
            <p className="mt-2 text-sm text-gray-600">
              JSON을 검증하고 포맷팅(prettify) 또는 압축(minify)합니다. 결과는 히스토리에 저장됩니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge>FE: React/TS</Badge>
            <Badge>BE: Spring Boot</Badge>
          </div>
        </div>
      </div>

      {/* 옵션 바 */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-3xl border bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            className={`rounded-2xl px-3 py-2 text-sm transition ${
              mode === "prettify"
                ? "bg-gray-900 text-white shadow-sm"
                : "border bg-white text-gray-700 hover:bg-gray-50"
            }`}
            onClick={() => setMode("prettify")}
            type="button"
          >
            Prettify
          </button>
          <button
            className={`rounded-2xl px-3 py-2 text-sm transition ${
              mode === "minify"
                ? "bg-gray-900 text-white shadow-sm"
                : "border bg-white text-gray-700 hover:bg-gray-50"
            }`}
            onClick={() => setMode("minify")}
            type="button"
          >
            Minify
          </button>
        </div>

        <div className="flex items-center gap-2 sm:ml-2">
          <label className="text-sm text-gray-600">Indent</label>
          <select
            className="rounded-2xl border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            value={indent}
            onChange={(e) => setIndent(clampIndent(Number(e.target.value)))}
            disabled={mode === "minify"}
          >
            <option value={2}>2 spaces</option>
            <option value={4}>4 spaces</option>
          </select>
        </div>

        <label className="flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 sm:ml-2">
          <input type="checkbox" checked={sortKeys} onChange={(e) => setSortKeys(e.target.checked)} />
          sortKeys
        </label>

        <label className="flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
          <input type="checkbox" checked={ensureAscii} onChange={(e) => setEnsureAscii(e.target.checked)} />
          ensureAscii
        </label>

        <div className="ml-auto flex flex-wrap gap-2">
          <button
            className="rounded-2xl border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            type="button"
            onClick={() => setInput(SAMPLE)}
          >
            샘플 로드
          </button>
          <button
            className="rounded-2xl border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            type="button"
            onClick={clearAll}
          >
            비우기
          </button>
          <button
            className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
            type="button"
            onClick={run}
            disabled={!canRun}
          >
            {loading ? "처리 중..." : "실행"}
          </button>
        </div>
      </div>

      {/* 에러 표시 */}
      {error && (
        <div className="mb-4 rounded-3xl border border-red-200 bg-red-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-red-700">JSON 파싱 오류</div>
              <div className="mt-1 text-sm text-red-700">{error.message}</div>
              {(error.line || error.column) && (
                <div className="mt-1 text-xs text-red-700">
                  위치: line {error.line ?? "-"}, column {error.column ?? "-"}
                </div>
              )}
            </div>
            <button
              className="rounded-2xl border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-100 disabled:opacity-50"
              type="button"
              onClick={moveToError}
              disabled={!error.line || !error.column}
            >
              에러 위치로 이동
            </button>
          </div>
        </div>
      )}

      {/* Input / Output */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Input 카드: 카드 내부가 스크롤 가능한 레이아웃 */}
        <div className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-800">Input</div>
              <div className="text-xs text-gray-500">붙여넣고 실행하세요.</div>
            </div>
            <button
              className="rounded-2xl border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              type="button"
              onClick={() => copy(input, "입력을 복사했어요.")}
            >
              복사
            </button>
          </div>

          <div className="h-[420px] overflow-auto rounded-2xl border">
            <textarea
              ref={inputRef}
              className="h-full w-full resize-none bg-white p-3 font-mono text-sm leading-5 outline-none focus:ring-2 focus:ring-blue-200"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='{"hello":"world"}'
            />
          </div>
        </div>

        {/* Output 카드 */}
        <div className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-800">Output</div>
              <div className="text-xs text-gray-500">
                {stats ? `${stats.inputLength} → ${stats.outputLength}` : "결과가 여기에 표시됩니다."}
              </div>
            </div>

            <button
              className="rounded-2xl border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              type="button"
              onClick={() => copy(output, "결과를 복사했어요.")}
              disabled={!output}
            >
              복사
            </button>
          </div>

          <div className="h-[420px] overflow-auto rounded-2xl border bg-gray-50">
            <textarea
              className="h-full w-full resize-none bg-gray-50 p-3 font-mono text-sm leading-5 outline-none"
              value={output}
              readOnly
              placeholder="실행 후 결과가 표시됩니다."
            />
          </div>
        </div>
      </div>

      {/* History */}
      <div className="mt-6 rounded-3xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-gray-800">History</div>
            <div className="text-xs text-gray-500">최근 실행 결과가 누적됩니다(최대 30개).</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={restoreAlsoInput}
                onChange={(e) => setRestoreAlsoInput(e.target.checked)}
              />
              복원 시 입력/옵션도 함께
            </label>

            <button
              className="rounded-2xl border px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              type="button"
              onClick={clearHistory}
              disabled={history.length === 0}
            >
              히스토리 비우기
            </button>
          </div>
        </div>

        {history.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-gray-500">
            아직 저장된 결과가 없습니다. 위에서 실행을 눌러 결과를 만들어보세요.
          </div>
        ) : (
          // ✅ History 전체도 길어지면 스크롤
          <div className="max-h-[720px] overflow-auto pr-1">
            <div className="space-y-3">
              {history.map((h) => (
                <div key={h.id} className="rounded-2xl border bg-gray-50 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-gray-500">{formatTime(h.createdAt)}</span>
                      <Badge>{h.mode}</Badge>
                      <Badge>indent:{h.indent}</Badge>
                      {h.sortKeys && <Badge>sortKeys</Badge>}
                      {h.ensureAscii && <Badge>ensureAscii</Badge>}
                      {h.stats && (
                        <span className="text-xs text-gray-500">
                          {h.stats.inputLength} → {h.stats.outputLength}
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        className="rounded-2xl border bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                        type="button"
                        onClick={() => restoreFromHistory(h)}
                      >
                        복원
                      </button>
                      <button
                        className="rounded-2xl border bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                        type="button"
                        onClick={() => copy(h.output, "히스토리 결과를 복사했어요.")}
                      >
                        결과 복사
                      </button>
                    </div>
                  </div>

                  {/* ✅ 각 history 높이를 크게 + 내부 스크롤 */}
                  <div className="mt-2 rounded-xl border bg-white p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-xs font-semibold text-gray-700">Preview</div>
                      <button
                        className="rounded-lg border px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
                        type="button"
                        onClick={() => copy(h.input, "히스토리 입력을 복사했어요.")}
                      >
                        입력 복사
                      </button>
                    </div>

                    {/* 높이를 3배 정도: 기존 line-clamp 대신 고정 높이 + scroll */}
                    <pre className="h-[240px] overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-700">
{h.output}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
