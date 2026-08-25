"use client";

import axios from "axios";
import React, { useMemo, useRef, useState } from "react";

import {
  formatJson,
  type JsonFormatMode,
  type JsonFormatResponse,
} from "@/api/jsonPrettierApi";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Container from "@/components/ui/Container";
import PageHeader from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Field";
import { cardClass } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errorMessage";

/** axios 에러에서 JSON Prettier 응답 본문을 꺼낸다. */
function axiosErrorBody(e: unknown): JsonFormatResponse | null {
  if (!axios.isAxiosError(e)) return null;

  const data = e.response?.data as JsonFormatResponse | undefined;
  return data && typeof data === "object" ? data : null;
}

function clampIndent(v: number): 2 | 4 {
  return v === 4 ? 4 : 2;
}

function indexFromLineCol(
  text: string,
  line?: number,
  col?: number
): number | null {
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

/** 체크박스 옵션 — 라벨 전체가 클릭 영역이다. */
function CheckOption({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-control border border-line bg-surface px-3 text-sm text-fg-muted transition hover:border-line-strong hover:bg-surface-hover">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-accent"
      />
      <span className="font-mono text-xs">{label}</span>
    </label>
  );
}

/** 등폭 텍스트 패널 — Input/Output 이 같은 껍데기를 쓴다. */
function CodePanel({
  title,
  hint,
  actions,
  children,
}: {
  title: string;
  hint?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={cardClass({ className: "flex min-w-0 flex-col p-4" })}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-fg">{title}</div>
          {hint && <div className="mt-0.5 text-xs text-fg-subtle">{hint}</div>}
        </div>

        {actions}
      </div>

      {children}
    </div>
  );
}

const TEXTAREA_CLASS =
  "h-[26rem] w-full resize-none rounded-control border border-line p-3 font-mono text-sm leading-6 text-fg outline-none";

export default function JsonPrettierPage() {
  const [mode, setMode] = useState<JsonFormatMode>("prettify");
  const [indent, setIndent] = useState<2 | 4>(2);
  const [sortKeys, setSortKeys] = useState(false);
  const [ensureAscii, setEnsureAscii] = useState(false);

  const [input, setInput] = useState(SAMPLE);
  const [output, setOutput] = useState("");
  const [stats, setStats] = useState<{
    inputLength: number;
    outputLength: number;
  } | null>(null);
  const [error, setError] = useState<{
    message: string;
    line?: number;
    column?: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [restoreAlsoInput, setRestoreAlsoInput] = useState<boolean>(true);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const canRun = useMemo(
    () => input.trim().length > 0 && !loading,
    [input, loading]
  );

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
    } catch (e) {
      setOutput("");
      setStats(null);

      // 백엔드는 잘못된 JSON 을 400 + { ok:false, error:{ message, line, column } } 로 알려준다.
      // axios 는 4xx 를 reject 하므로 위의 `!res.ok` 분기가 아니라 여기로 온다.
      // 위치정보(line/column)를 살려야 "에러 위치로 이동" 버튼이 동작한다.
      const body = axiosErrorBody(e);

      if (body?.error) {
        setError({
          message: body.error.message ?? "Invalid JSON",
          line: body.error.line,
          column: body.error.column,
        });
        return;
      }

      setError({ message: errorMessage(e, "Network error") });
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
    <Container size="wide" className="py-10 sm:py-14">
      <PageHeader
        eyebrow="Tool"
        title="JSON Prettier"
        description="JSON을 검증하고 포맷팅(prettify) 또는 압축(minify)합니다. 결과는 히스토리에 저장됩니다."
        actions={
          <>
            {/* 실제 구현 스택. 예전 표기(React / Spring Boot)는 이관 전 잔재였다. */}
            <Badge>FE: Next.js / TS</Badge>
            <Badge>BE: Express</Badge>
          </>
        }
      />

      {/* 옵션 바 */}
      <div
        className={cardClass({
          className: "mt-8 flex flex-wrap items-center gap-2 p-3",
        })}
      >
        {/* 모드 — 둘 중 하나만 켜지는 세그먼트 */}
        <div
          role="group"
          aria-label="출력 모드"
          className="flex items-center gap-1 rounded-control bg-surface-2 p-1"
        >
          {(["prettify", "minify"] as JsonFormatMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn(
                "h-8 rounded-control px-3 text-sm font-medium capitalize transition",
                mode === m
                  ? "bg-accent text-accent-fg shadow-card"
                  : "text-fg-muted hover:text-fg"
              )}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:ml-2">
          <label htmlFor="json-indent" className="text-sm text-fg-muted">
            Indent
          </label>

          <Select
            id="json-indent"
            className="h-10 w-32"
            value={indent}
            onChange={(e) => setIndent(clampIndent(Number(e.target.value)))}
            // minify 는 들여쓰기를 쓰지 않는다.
            disabled={mode === "minify"}
          >
            <option value={2}>2 spaces</option>
            <option value={4}>4 spaces</option>
          </Select>
        </div>

        <CheckOption
          label="sortKeys"
          checked={sortKeys}
          onChange={setSortKeys}
        />

        <CheckOption
          label="ensureAscii"
          checked={ensureAscii}
          onChange={setEnsureAscii}
        />

        <div className="ml-auto flex flex-wrap gap-2">
          <Button onClick={() => setInput(SAMPLE)}>샘플 로드</Button>
          <Button onClick={clearAll}>비우기</Button>

          <Button variant="primary" onClick={run} disabled={!canRun}>
            {loading ? "처리 중..." : "실행"}
          </Button>
        </div>
      </div>

      {/* 에러 표시 — 위치 정보가 있으면 해당 지점으로 커서를 옮길 수 있다 */}
      {error && (
        <div
          role="alert"
          className="mt-4 rounded-card border border-danger/30 bg-danger-soft p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-danger-soft-fg">
                JSON 파싱 오류
              </div>

              <div className="mt-1 text-sm text-danger-soft-fg">
                {error.message}
              </div>

              {(error.line || error.column) && (
                <div className="mt-1 font-mono text-xs text-danger-soft-fg">
                  위치: line {error.line ?? "-"}, column {error.column ?? "-"}
                </div>
              )}
            </div>

            <Button
              size="sm"
              onClick={moveToError}
              disabled={!error.line || !error.column}
            >
              에러 위치로 이동
            </Button>
          </div>
        </div>
      )}

      {/* Input / Output */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CodePanel
          title="Input"
          hint="붙여넣고 실행하세요."
          actions={
            <Button size="sm" onClick={() => copy(input, "입력을 복사했어요.")}>
              복사
            </Button>
          }
        >
          <textarea
            ref={inputRef}
            className={cn(TEXTAREA_CLASS, "bg-surface")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={'{"hello":"world"}'}
            spellCheck={false}
            aria-label="JSON 입력"
          />
        </CodePanel>

        <CodePanel
          title="Output"
          hint={
            stats
              ? `${stats.inputLength} → ${stats.outputLength}`
              : "결과가 여기에 표시됩니다."
          }
          actions={
            <Button
              size="sm"
              onClick={() => copy(output, "결과를 복사했어요.")}
              disabled={!output}
            >
              복사
            </Button>
          }
        >
          <textarea
            className={cn(TEXTAREA_CLASS, "bg-surface-2")}
            value={output}
            readOnly
            placeholder="실행 후 결과가 표시됩니다."
            spellCheck={false}
            aria-label="JSON 결과"
          />
        </CodePanel>
      </div>

      {/* History */}
      <div className={cardClass({ className: "mt-6 p-4" })}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-fg">History</div>

            <div className="mt-0.5 text-xs text-fg-subtle">
              최근 실행 결과가 누적됩니다 (최대 30개).
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <CheckOption
              label="복원 시 입력/옵션도 함께"
              checked={restoreAlsoInput}
              onChange={setRestoreAlsoInput}
            />

            <Button onClick={clearHistory} disabled={history.length === 0}>
              히스토리 비우기
            </Button>
          </div>
        </div>

        {history.length === 0 ? (
          <div className="rounded-card border border-dashed border-line px-6 py-10 text-center text-sm text-fg-muted">
            아직 저장된 결과가 없습니다. 위에서 실행을 눌러 결과를 만들어보세요.
          </div>
        ) : (
          <div className="max-h-[45rem] space-y-3 overflow-auto pr-1">
            {history.map((h) => (
              <div
                key={h.id}
                className="rounded-card border border-line bg-surface-2 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-fg-subtle">
                      {formatTime(h.createdAt)}
                    </span>

                    <Badge tone="accent">{h.mode}</Badge>
                    <Badge>indent:{h.indent}</Badge>
                    {h.sortKeys && <Badge>sortKeys</Badge>}
                    {h.ensureAscii && <Badge>ensureAscii</Badge>}

                    {h.stats && (
                      <span className="font-mono text-xs text-fg-subtle">
                        {h.stats.inputLength} → {h.stats.outputLength}
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => restoreFromHistory(h)}>
                      복원
                    </Button>

                    <Button
                      size="sm"
                      onClick={() =>
                        copy(h.output, "히스토리 결과를 복사했어요.")
                      }
                    >
                      결과 복사
                    </Button>
                  </div>
                </div>

                <div className="mt-3 rounded-control border border-line bg-surface p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-semibold text-fg-muted">
                      Preview
                    </div>

                    <Button
                      size="sm"
                      onClick={() =>
                        copy(h.input, "히스토리 입력을 복사했어요.")
                      }
                    >
                      입력 복사
                    </Button>
                  </div>

                  <pre className="h-60 overflow-auto rounded-control bg-surface-2 p-3 font-mono text-xs whitespace-pre-wrap text-fg-muted">
                    {h.output}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Container>
  );
}
