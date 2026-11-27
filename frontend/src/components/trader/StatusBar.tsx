"use client";

import { useState } from "react";

import { traderHalt, traderResume, type TraderStatus } from "@/api/trader";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errorMessage";
import { formatKst } from "@/lib/trader/decimal";

import { useStepUp } from "./stepUp";
import { ago, Modal, StatusDot, type DotTone } from "./ui";

/**
 * 상단 상태 바 — 실행/중지, 모의/실거래, 시세·DB 연결, 마지막 갱신, 긴급 정지·재개.
 * 긴급 정지는 코드 없이 (위험을 줄이는 방향), 재개는 2단계 인증 후.
 */

export function engineTone(s: TraderStatus | null): { tone: DotTone; label: string } {
  if (!s) return { tone: "off", label: "확인 중" };
  if (s.killswitch.halted) return { tone: "error", label: "긴급 정지" };
  if (s.engine.state === "stale") return { tone: "error", label: "응답 없음" };
  if (s.engine.state === "unknown") return { tone: "off", label: "신호 없음" };
  if (s.engine.dbOk === false) return { tone: "warn", label: "DB 오류" };
  return { tone: "ok", label: "실행 중" };
}

export default function StatusBar({
  status,
  now,
  refreshedAt,
  username,
  onChanged,
  onLogout,
  themeToggle,
}: {
  status: TraderStatus | null;
  now: number;
  refreshedAt: number | null;
  username: string;
  onChanged: () => void;
  onLogout: () => void;
  themeToggle?: React.ReactNode;
}) {
  const [dialog, setDialog] = useState<"halt" | "resume" | null>(null);
  const eng = engineTone(status);
  const quoteAge = status?.lastQuoteAt ? now - new Date(status.lastQuoteAt).getTime() : null;
  const quoteTone: DotTone =
    quoteAge == null ? "off" : !status?.marketOpen ? "off" : quoteAge > 60_000 ? "warn" : "ok";
  const dbTone: DotTone = status?.engine.dbOk == null ? "off" : status.engine.dbOk ? "ok" : "error";
  const live = status?.engine.mode === "live";
  const halted = status?.killswitch.halted ?? false;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="text-sm font-semibold tracking-tight text-fg">자동매매</h1>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
              eng.tone === "ok" && "border-success/40 text-success-soft-fg bg-success-soft",
              eng.tone === "warn" && "border-warning/40 text-warning-soft-fg bg-warning-soft",
              eng.tone === "error" && "border-danger/40 text-danger-soft-fg bg-danger-soft",
              eng.tone === "off" && "border-line text-fg-muted bg-surface-2"
            )}
            title={status?.engine.heartbeatAt ? `상태 신호 ${formatKst(status.engine.heartbeatAt)}` : undefined}
          >
            <StatusDot tone={eng.tone} />
            {eng.label}
          </span>
          <Badge tone={live ? "danger" : "info"}>{live ? "실거래" : "모의"}</Badge>
        </div>

        <dl className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
          <div className="flex items-center gap-1.5" title={status?.lastQuoteAt ? formatKst(status.lastQuoteAt) : undefined}>
            <StatusDot tone={quoteTone} />
            <dt>시세</dt>
            <dd className="tabular-nums text-fg">{ago(status?.lastQuoteAt, now)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusDot tone={dbTone} />
            <dt>DB</dt>
            <dd className="text-fg">{status?.engine.dbOk == null ? "—" : status.engine.dbOk ? "정상" : "오류"}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt>장</dt>
            <dd className="text-fg">{status == null ? "—" : status.marketOpen ? "장중" : "장 외"}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt>갱신</dt>
            <dd className="tabular-nums text-fg">{refreshedAt ? ago(new Date(refreshedAt).toISOString(), now) : "—"}</dd>
          </div>
        </dl>

        <div className="ml-auto flex items-center gap-2">
          {halted ? (
            <Button variant="secondary" size="sm" onClick={() => setDialog("resume")}>
              재개…
            </Button>
          ) : (
            <Button variant="danger" size="sm" onClick={() => setDialog("halt")} disabled={!status}>
              긴급 정지
            </Button>
          )}
          {themeToggle}
          <span className="hidden text-xs text-fg-subtle sm:inline">{username}</span>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            로그아웃
          </Button>
        </div>
      </div>

      {dialog === "halt" && (
        <HaltDialog
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            onChanged();
          }}
        />
      )}
      {dialog === "resume" && (
        <ResumeDialog
          reason={status?.killswitch.reason ?? null}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            onChanged();
          }}
        />
      )}
    </header>
  );
}

function HaltDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await traderHalt(reason);
      onDone();
    } catch (err) {
      setError(errorMessage(err, "긴급 정지하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="긴급 정지" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">
          <li>신규 주문을 모두 막고, 미체결 주문을 일괄 취소합니다.</li>
          <li>엔진이 약 5초 안에 반영합니다. 보유 종목은 그대로 둡니다.</li>
          <li>재개하려면 2단계 인증이 필요합니다.</li>
        </ul>
        <Field label="사유 (기록에 남습니다)" htmlFor="trader-halt-reason">
          <Input
            id="trader-halt-reason"
            value={reason}
            maxLength={200}
            placeholder="예: 시세 이상, 점검"
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" variant="danger" disabled={busy}>
            {busy ? "정지 중…" : "지금 정지"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ResumeDialog({ reason, onClose, onDone }: { reason: string | null; onClose: () => void; onDone: () => void }) {
  const { guarded } = useStepUp();
  const [note, setNote] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (await guarded(() => traderResume(note))) onDone();
    } catch (err) {
      setError(errorMessage(err, "재개하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="엔진 재개" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-fg-muted">
          정지 사유: <span className="text-fg">{reason ?? "—"}</span>
        </p>
        <p className="text-sm text-fg-muted">
          원인을 확인했는지 다시 봐 주세요. 재개하면 신규 주문이 다시 나갈 수 있습니다 (모든 주문은 위험 관리를 거칩니다).
        </p>
        <Field label="확인 메모 (선택)" htmlFor="trader-resume-note">
          <Input id="trader-resume-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Field label='확인을 위해 "재개" 를 입력하세요' htmlFor="trader-resume-confirm">
          <Input id="trader-resume-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" variant="primary" disabled={busy || confirmText.trim() !== "재개"}>
            {busy ? "재개 중…" : "재개"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
