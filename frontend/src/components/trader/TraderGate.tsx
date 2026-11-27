"use client";

import { useEffect, useState } from "react";

import { getTraderMe, traderLogin, traderLogout, type TraderMe } from "@/api/trader";
import ThemeToggle from "@/components/theme/ThemeToggle";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { cardClass } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { errorMessage } from "@/lib/errorMessage";

import TraderDashboard from "./TraderDashboard";

/**
 * /trader 진입 게이트.
 *
 * 로그인 전에는 로그인 양식만 보인다. 실제 보호는 백엔드(`/api/trader/**` 의 requireTraderAuth)가 하고,
 * 이 화면은 그 결과(`/api/trader/auth/me`)에 따라 무엇을 보여줄지만 정한다.
 * 2단계 인증이 켜져 있으면(totpRequired) 인증 코드 칸이 함께 나온다.
 */
export default function TraderGate() {
  const [me, setMe] = useState<TraderMe | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function reload() {
    try {
      setMe(await getTraderMe());
    } catch (e) {
      setLoadError(errorMessage(e, "로그인 상태를 확인하지 못했습니다."));
    }
  }

  useEffect(() => {
    let alive = true;
    getTraderMe()
      .then((m) => {
        if (alive) setMe(m);
      })
      .catch((e: unknown) => {
        if (alive) setLoadError(errorMessage(e, "로그인 상태를 확인하지 못했습니다."));
      });
    return () => {
      alive = false;
    };
  }, []);

  if (loadError) {
    return (
      <Shell>
        <Alert>{loadError}</Alert>
      </Shell>
    );
  }
  if (me === null) {
    return (
      <Shell>
        <p className="text-center text-sm text-fg-muted" aria-live="polite">
          확인 중…
        </p>
      </Shell>
    );
  }
  if (!me.authenticated) {
    return (
      <Shell>
        <LoginForm totpRequired={Boolean(me.totpRequired)} onLoggedIn={() => void reload()} />
      </Shell>
    );
  }
  return (
    <TraderDashboard
      username={me.username}
      totpEnabled={Boolean(me.totpEnabled)}
      stepUpUntil={me.stepUpUntil ?? null}
      onSessionExpired={() => void reload()}
      onLogout={async () => {
        await traderLogout();
        await reload();
      }}
    />
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-bg px-4 py-12">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}

function LockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function LoginForm({ totpRequired, onLoggedIn }: { totpRequired: boolean; onLoggedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await traderLogin(username, password, totpRequired ? code : undefined);
      onLoggedIn();
    } catch (err) {
      setError(errorMessage(err, "로그인하지 못했습니다."));
      setPassword("");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={cardClass({ className: "space-y-5 p-6 shadow-raised sm:p-8" })} aria-label="로그인">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent-soft-fg">
          <LockIcon />
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-fg">로그인</h1>
        <p className="text-xs text-fg-subtle">본인 전용 영역입니다.</p>
      </div>
      <Field label="아이디" htmlFor="trader-username">
        <Input
          id="trader-username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </Field>
      <Field label="비밀번호" htmlFor="trader-password">
        <Input
          id="trader-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>
      {totpRequired && (
        <Field label="인증 코드 (Google Authenticator)" htmlFor="trader-code">
          <Input
            id="trader-code"
            name="code"
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
      )}
      {error && <Alert>{error}</Alert>}
      <Button type="submit" variant="primary" size="lg" full disabled={busy}>
        {busy ? "확인 중…" : "로그인"}
      </Button>
      <p className="text-center text-[11px] text-fg-subtle">5번 연속 실패하면 15분 동안 잠깁니다.</p>
    </form>
  );
}
