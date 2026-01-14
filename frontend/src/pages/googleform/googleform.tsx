import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, Link, useNavigate } from "react-router-dom";
import { api } from "../../api";

import Login from "./Login/Login";
import FormsList from "./FormsList/FormsList";
import AnalyzePage from "./AnalyzePage/AnalyzePage";

type Me = { authenticated: boolean; name?: string };

export default function googleform() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  const authed = !!me?.authenticated;

  async function loadMe() {
    setLoading(true);
    try {
      const res = await api.get("/api/auth/me");
      setMe(res.data);
    } catch {
      setMe({ authenticated: false });
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    try {
      await api.post("/api/auth/logout");
    } finally {
      await loadMe();
      nav("/googleform/login");
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#ffffef]">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-700 shadow-sm">
            Loading...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#ffffef]">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* 헤더 */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
            >
              ← Home
            </Link>

            <Link
              to={authed ? "/googleform/forms" : "/googleform/login"}
              className="text-lg font-black tracking-tight text-zinc-900"
            >
              GoogleForm Analyzer
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {authed ? (
              <>
                <span className="text-sm text-zinc-600">{me?.name}</span>
                <button
                  onClick={logout}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 active:scale-[0.99]"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                to="/googleform/login"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
              >
                Login
              </Link>
            )}
          </div>
        </header>

        {/* 내부 라우팅 */}
        <Routes>
          <Route
            path="login"
            element={<Login authenticated={authed} />}
          />

          <Route
            path="forms"
            element={authed ? <FormsList /> : <Navigate to="/googleform/login" replace />}
          />

          <Route
            path="forms/:formId/analyze"
            element={authed ? <AnalyzePage /> : <Navigate to="/googleform/login" replace />}
          />

          <Route
            path=""
            element={<Navigate to={authed ? "/googleform/forms" : "/googleform/login"} replace />}
          />

          <Route path="*" element={<Navigate to="" replace />} />
        </Routes>
      </div>
    </div>
  );
}
