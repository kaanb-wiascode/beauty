"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { getAccessToken, persistSession } from "@/lib/auth";
import type { LoginResponse } from "@/lib/types";
import { Alert, Button, TextInput } from "@/components/ui";

function ValooMark() {
  return (
    <div
      className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-[28px] shadow-[0_18px_45px_rgba(22,116,189,0.18)]"
      style={{ background: "linear-gradient(135deg, #55D4E1 0%, #369FCB 48%, #0551B0 100%)" }}
      aria-hidden="true"
    >
      <div className="absolute inset-[7px] rounded-[22px] bg-white/95" />
      <span className="relative bg-gradient-to-br from-[#55D4E1] via-[#369FCB] to-[#0551B0] bg-clip-text text-[42px] font-semibold leading-none tracking-[-0.08em] text-transparent">
        V
      </span>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getAccessToken()) router.replace("/dashboard");
  }, [router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await api<LoginResponse>("/auth/login", {
        method: "POST",
        body: { email, password },
        auth: false,
      });

      persistSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
        tenant: data.tenant,
        membership: data.membership,
      });
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Giriş yapılamadı. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7fafc] text-[#17212b]">
      <header className="mx-auto flex h-[72px] max-w-[1200px] items-center justify-between border-b border-[#dfe7ed] px-6 sm:px-8">
        <a href="/login" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.02em]">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[12px] font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #55D4E1 0%, #369FCB 48%, #0551B0 100%)" }}
            aria-hidden="true"
          >
            V
          </span>
          VALOO
        </a>
        <span className="text-[12px] font-medium text-[#667482]">Güvenli giriş</span>
      </header>

      <section className="mx-auto flex min-h-[calc(100vh-160px)] w-full max-w-[760px] flex-col items-center px-6 pb-16 pt-20 sm:pt-24">
        <ValooMark />
        <div className="mt-8 text-center">
          <h1 className="text-[38px] font-semibold leading-tight tracking-[-0.045em] sm:text-[46px]">VALOO</h1>
          <p className="mt-2 text-[17px] text-[#667482]">Hesabınıza giriş yapın</p>
        </div>

        <form onSubmit={onSubmit} className="mt-10 w-full max-w-[430px]">
          <div className="space-y-3">
            <TextInput
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="E-posta adresi"
              aria-label="E-posta adresi"
              className="h-[54px] rounded-[14px] border-[#dfe7ed] bg-white px-4 text-[16px] shadow-none"
            />
            <TextInput
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Şifre"
              aria-label="Şifre"
              className="h-[54px] rounded-[14px] border-[#dfe7ed] bg-white px-4 text-[16px] shadow-none"
            />
          </div>

          {error ? (
            <div className="mt-4">
              <Alert>{error}</Alert>
            </div>
          ) : null}

          <label className="mt-5 flex cursor-pointer items-center justify-center gap-2 text-[14px] text-[#667482]">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="h-4 w-4 rounded border-[#bfcbd4] accent-[#1674bd]"
            />
            Oturumumu açık tut
          </label>

          <Button
            type="submit"
            disabled={loading}
            className="mt-6 h-[52px] w-full rounded-[14px] bg-[#1674bd] text-[16px] font-medium text-white shadow-none hover:bg-[#0b5fa9]"
          >
            {loading ? "Giriş yapılıyor..." : "Devam et"}
          </Button>

          <div className="my-7 flex items-center gap-4 text-[13px] text-[#8a98a5]">
            <span className="h-px flex-1 bg-[#dfe7ed]" />
            <span>veya</span>
            <span className="h-px flex-1 bg-[#dfe7ed]" />
          </div>

          <button
            type="button"
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] border border-[#dfe7ed] bg-white text-[16px] font-medium text-[#17212b] transition hover:bg-[#f1f6fa]"
            onClick={() => setError("Apple ile giriş bu hesap için henüz etkin değil.")}
          >
            <span aria-hidden="true" className="text-[17px]">●</span>
            Apple ile devam et
          </button>

          <div className="mt-9 flex items-start gap-3 rounded-[14px] border border-[#dfe7ed] bg-white px-4 py-4 text-left">
            <span className="mt-0.5 text-[18px] text-[#1674bd]" aria-hidden="true">⌾</span>
            <div>
              <p className="text-[13px] font-medium text-[#17212b]">Güvenli ve korumalı</p>
              <p className="mt-1 text-[12px] leading-5 text-[#667482]">
                Hesap bilgileriniz güvenli bağlantı üzerinden korunur.
              </p>
            </div>
          </div>
        </form>
      </section>

      <footer className="mx-auto flex min-h-[88px] max-w-[1200px] flex-col items-center justify-between gap-3 border-t border-[#dfe7ed] px-6 py-6 text-[12px] text-[#667482] sm:flex-row sm:px-8">
        <span>© 2026 VALOO. Tüm hakları saklıdır.</span>
        <span>Türkiye</span>
      </footer>
    </main>
  );
}
