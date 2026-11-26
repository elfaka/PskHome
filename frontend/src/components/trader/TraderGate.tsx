"use client";

import { useEffect, useState } from "react";

import { getTraderMe, traderLogin, traderLogout, type TraderMe } from "@/api/trader";
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
 * 로그인하면 대시보드(엔진 DB 읽기 전용)를 보여준다.
 */
export default function TraderGate() {
  const [me, setMe] = useState<TraderMe | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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
        <p className="text-sm text-fg-muted" aria-live="polite">
          확인 중…
        </p>
      </Shell>
    );
  }
  if (!me.authenticated) {
    return (
      <Shell>
        <LoginForm onLoggedIn={setMe} />
      </Shell>
    );
  }
  return (
    <TraderDashboard
      username={me.username}
      onLogout={async () => {
        await traderLogout();
        setMe({ authenticated: false });
      }}
    />
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">{children}</main>;
}

function LoginForm({ onLoggedIn }: { onLoggedIn: (me: TraderMe) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLoggedIn(await traderLogin(username, password));
    } catch (err) {
      setError(errorMessage(err, "로그인하지 못했습니다."));
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={cardClass({ className: "space-y-4 p-6 sm:p-8" })} aria-label="로그인">
      <h1 className="text-xl font-semibold tracking-tight text-fg">로그인</h1>
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
      {error && <Alert>{error}</Alert>}
      <Button type="submit" variant="primary" size="lg" full disabled={busy}>
        {busy ? "확인 중…" : "로그인"}
      </Button>
    </form>
  );
}
