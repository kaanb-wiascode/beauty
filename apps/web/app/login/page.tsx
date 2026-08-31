"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { getAccessToken, persistSession } from "@/lib/auth";
import type { LoginResponse } from "@/lib/types";
import { Alert, Button, TextInput } from "@/components/ui";

function BeautyMark() {
  return (
    <div className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-full" style={{ background: "conic-gradient(from 205deg, #ffb5bd, #ffcfa8, #9ddcf1, #8f9cff, #c48bff, #f48bda, #ffb5bd)" }}>
      <div className="absolute inset-[7px] rounded-full bg-white" />
      <span className="relative bg-gradient-to-br from-[#8f7cff] via-[#a55cff] to-[#e38bdc] bg-clip-text text-[42px] font-semibold leading-none tracking-[-0.08em] text-transparent">B</span>
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

      persistSession({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user, tenant: data.tenant, membership: data.membership });
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Giriş yapılamadı. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white text-[#1d1d1f]">
      <header className="mx-auto flex h-[72px] max-w-[1200px] items-center justify-between border-b border-[#e8e8ed] px-6 sm:px-8">
        <a href="/login" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.02em]">
          <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#1d1d1f] text-[12px] font-semibold text-white">B</span>
          Beauty ERP
        </a>
        <nav className="flex items-center gap-5 text-[13px] text-[#6e6e73]">
          <button type="button" className="hidden hover:text-[#1d1d1f] sm:block">Yardım</button>
          <span className="h-4 w-px bg-[#e8e8ed]" />
          <button type="button" className="hover:text-[#1d1d1f]">TR⌄</button>
        </nav>
      </header>

      <section className="mx-auto flex min-h-[calc(100vh-160px)] w-full max-w-[760px] flex-col items-center px-6 pb-16 pt-20 sm:pt-24">
        <BeautyMark />
        <div className="mt-8 text-center">
          <h1 className="text-[38px] font-semibold leading-tight tracking-[-0.045em] sm:text-[46px]">Beauty ERP</h1>
          <p className="mt-2 text-[17px] text-[#6e6e73]">Hesabınıza giriş yapın</p>
        </div>

        <form onSubmit={onSubmit} className="mt-10 w-full max-w-[430px]">
          <div className="space-y-3">
            <TextInput type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-posta adresi" className="h-[54px] rounded-[12px] border-[#d2d2d7] bg-white px-4 text-[16px] shadow-none" />
            <TextInput type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Şifre" className="h-[54px] rounded-[12px] border-[#d2d2d7] bg-white px-4 text-[16px] shadow-none" />
          </div>

          {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}

          <label className="mt-5 flex cursor-pointer items-center justify-center gap-2 text-[14px] text-[#6e6e73]">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="h-4 w-4 rounded border-[#c7c7cc] accent-[#1d1d1f]" />
            Oturumumu açık tut
          </label>

          <Button type="submit" disabled={loading} className="mt-6 h-[52px] w-full rounded-[12px] bg-[#1d1d1f] text-[16px] font-medium text-white shadow-none hover:bg-[#000]">
            {loading ? "Giriş yapılıyor..." : "Devam et"}
          </Button>

          <div className="my-7 flex items-center gap-4 text-[13px] text-[#86868b]">
            <span className="h-px flex-1 bg-[#e8e8ed]" /><span>veya</span><span className="h-px flex-1 bg-[#e8e8ed]" />
          </div>

          <button type="button" className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[12px] border border-[#d2d2d7] bg-white text-[16px] font-medium text-[#1d1d1f] hover:bg-[#f5f5f7]" onClick={() => setError("Apple ile giriş bu hesap için henüz etkin değil.")}>
            <span aria-hidden="true" className="text-[17px]">●</span> Apple ile devam et
          </button>

          <div className="mt-9 flex items-start gap-3 rounded-[12px] bg-[#f5f5f7] px-4 py-4 text-left">
            <span className="mt-0.5 text-[18px]">⌾</span>
            <div><p className="text-[13px] font-medium text-[#1d1d1f]">Güvenli ve korumalı</p><p className="mt-1 text-[12px] leading-5 text-[#6e6e73]">Hesap bilgileriniz güvenli bağlantı üzerinden korunur.</p></div>
          </div>
        </form>
      </section>

      <footer className="mx-auto flex min-h-[88px] max-w-[1200px] flex-col items-center justify-between gap-4 border-t border-[#e8e8ed] px-6 py-6 text-[12px] text-[#6e6e73] sm:flex-row sm:px-8">
        <span>© 2026 Beauty ERP. Tüm hakları saklıdır.</span>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2"><a href="#" className="hover:text-[#1d1d1f]">Gizlilik Politikası</a><a href="#" className="hover:text-[#1d1d1f]">Kullanım Şartları</a><a href="#" className="hover:text-[#1d1d1f]">KVKK</a><a href="#" className="hover:text-[#1d1d1f]">İletişim</a></div>
        <span>Türkiye⌄</span>
      </footer>
    </main>
  );
}
