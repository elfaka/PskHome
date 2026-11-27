"use client";

import axios from "axios";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

import { traderStepUp } from "@/api/trader";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { errorMessage } from "@/lib/errorMessage";

import { Modal } from "./ui";

/**
 * 2단계 인증(Google Authenticator) — 재개·전략 켜기·설정 변경 전에 6자리 코드를 받는다.
 * 코드를 한 번 맞히면 서버가 5분 동안 다시 묻지 않는다 (로그인 직후 5분 포함).
 * 실제 확인은 서버가 한다. 화면은 403 STEP_UP_REQUIRED 를 받으면 코드를 묻고 한 번 다시 시도한다.
 */

type StepUpApi = {
  totpEnabled: boolean;
  /** 위험이 커지는 조작을 감싼다. 코드가 필요하면 묻고 다시 시도한다. 사용자가 취소하면 false */
  guarded: (action: () => Promise<void>) => Promise<boolean>;
};

const Ctx = createContext<StepUpApi>({ totpEnabled: false, guarded: async (a) => (await a(), true) });

export function useStepUp() {
  return useContext(Ctx);
}

function errorCode(e: unknown): string | undefined {
  if (!axios.isAxiosError(e)) return undefined;
  return (e.response?.data as { error?: { code?: string } } | undefined)?.error?.code;
}

export function StepUpProvider({
  totpEnabled,
  initialUntil,
  children,
}: {
  totpEnabled: boolean;
  initialUntil: string | null;
  children: React.ReactNode;
}) {
  const [until, setUntil] = useState<number>(initialUntil ? new Date(initialUntil).getTime() : 0);
  const [open, setOpen] = useState(false);
  const pending = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        pending.current = resolve;
        setOpen(true);
      }),
    []
  );

  const finish = useCallback((ok: boolean) => {
    setOpen(false);
    pending.current?.(ok);
    pending.current = null;
  }, []);

  const guarded = useCallback(
    async (action: () => Promise<void>) => {
      // 비밀키가 없으면 서버가 403 TOTP_NOT_CONFIGURED 로 거절한다 — 그 메시지를 그대로 보여준다
      if (totpEnabled && until <= Date.now()) {
        if (!(await ask())) return false;
      }
      try {
        await action();
        return true;
      } catch (e) {
        if (errorCode(e) !== "STEP_UP_REQUIRED") throw e;
        if (!(await ask())) return false;
        await action();
        return true;
      }
    },
    [ask, totpEnabled, until]
  );

  const value = useMemo(() => ({ totpEnabled, guarded }), [totpEnabled, guarded]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {open && (
        <CodeDialog
          onCancel={() => finish(false)}
          onVerified={(u) => {
            setUntil(new Date(u).getTime());
            finish(true);
          }}
        />
      )}
    </Ctx.Provider>
  );
}

function CodeDialog({ onCancel, onVerified }: { onCancel: () => void; onVerified: (until: string) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await traderStepUp(code.replace(/\s/g, ""));
      onVerified(r.stepUpUntil);
    } catch (err) {
      setError(errorMessage(err, "코드를 확인하지 못했습니다."));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="2단계 인증" onClose={onCancel}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-fg-muted">
          Google Authenticator 의 6자리 코드를 입력하세요. 확인되면 5분 동안 다시 묻지 않습니다.
        </p>
        <Field label="인증 코드" htmlFor="trader-stepup-code">
          <Input
            id="trader-stepup-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="text-center text-lg tracking-[0.4em] tabular-nums"
            required
          />
        </Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            취소
          </Button>
          <Button type="submit" variant="primary" disabled={busy || code.length !== 6}>
            {busy ? "확인 중…" : "확인"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
