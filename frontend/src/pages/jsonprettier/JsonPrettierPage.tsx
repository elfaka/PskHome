import { useMemo, useRef, useState } from "react";
import { formatJson, JsonFormatMode } from "./jsonPrettierApi";

function clampIndent(v: number): 2 | 4 {
  return v === 4 ? 4 : 2;
}

// (line, column)을 textarea index로 변환 (line/column은 1-based라고 가정)
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

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const canRun = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

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

      setOutput(res.formatted ?? "");
      setStats(res.stats ?? null);
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

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">JSON Prettier</h1>
        <p className="mt-2 text-sm text-gray-500">JSON을 검증하고 포맷팅(prettify) 또는 압축(minify)합니다.</p>
      </div>

      {/* 옵션 바 */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            className={`rounded-xl border px-3 py-2 text-sm ${
              mode === "prettify" ? "bg-gray-900 text-white" : "bg-white"
            }`}
            onClick={() => setMode("prettify")}
            type="button"
          >
            Prettify
          </button>
          <button
            className={`rounded-xl border px-3 py-2 text-sm ${
              mode === "minify" ? "bg-gray-900 text-white" : "bg-white"
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
            className="rounded-xl border px-3 py-2 text-sm"
            value={indent}
            onChange={(e) => setIndent(clampIndent(Number(e.target.value)))}
            disabled={mode === "minify"}
          >
            <option value={2}>2 spaces</option>
            <option value={4}>4 spaces</option>
          </select>
        </div>

        <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm sm:ml-2">
          <input type="checkbox" checked={sortKeys} onChange={(e) => setSortKeys(e.target.checked)} />
          sortKeys
        </label>

        <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
          <input type="checkbox" checked={ensureAscii} onChange={(e) => setEnsureAscii(e.target.checked)} />
          ensureAscii
        </label>

        <div className="ml-auto flex gap-2">
          <button
            className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
            type="button"
            onClick={() => setInput(SAMPLE)}
          >
            샘플 로드
          </button>
          <button className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50" type="button" onClick={clearAll}>
            비우기
          </button>
          <button
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
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
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4">
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
              className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm hover:bg-red-100 disabled:opacity-50"
              type="button"
              onClick={moveToError}
              disabled={!error.line || !error.column}
            >
              에러 위치로 이동
            </button>
          </div>
        </div>
      )}

      {/* 본문 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-800">Input</div>
            <button
              className="rounded-xl border px-3 py-1.5 text-xs hover:bg-gray-50"
              type="button"
              onClick={() => copy(input, "입력을 복사했어요.")}
            >
              복사
            </button>
          </div>

          <textarea
            ref={inputRef}
            className="h-[420px] w-full resize-none rounded-xl border p-3 font-mono text-sm leading-5 outline-none focus:ring-2 focus:ring-blue-200"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='{"hello":"world"}'
          />
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-800">Output</div>
            <div className="flex items-center gap-2">
              {stats && <span className="text-xs text-gray-500">{stats.inputLength} → {stats.outputLength}</span>}
              <button
                className="rounded-xl border px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
                type="button"
                onClick={() => copy(output, "결과를 복사했어요.")}
                disabled={!output}
              >
                복사
              </button>
            </div>
          </div>

          <textarea
            className="h-[420px] w-full resize-none rounded-xl border bg-gray-50 p-3 font-mono text-sm leading-5 outline-none"
            value={output}
            readOnly
            placeholder="결과가 여기에 표시됩니다."
          />
        </div>
      </div>
    </div>
  );
}
