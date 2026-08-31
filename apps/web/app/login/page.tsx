"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { getAccessToken, persistSession } from "@/lib/auth";
import type { LoginResponse } from "@/lib/types";
import { Alert, Button, TextInput } from "@/components/ui";

function BeautyMark() {
  return (
    <div className="relative flex h-20 w-20 items-center justify-center rounded-[24px] bg-[linear-gradient(135deg,#7c5df0_0%,#b45de8_52%,#ee9db6_100%)] p-[1px] shadow-[0_18px_40px_rgba(118,87,232,.20)]">
      <div className="flex h-full w-full items-center justify-center rounded-[23px] bg-white/92 backdrop-blur-xl">
        <span className="bg-[linear-gradient(135deg,#7657e8,#b45de8)] bg-clip-text text-[34px] font-semibold leading-none tracking-[-.08em] text-transparent">B</span>
      </div>
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

  useEffect(() => { if (getAccessToken()) router.replace("/dashboard"); }, [router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      const data = await api<LoginResponse>("/auth/login", { method: "POST", body: { email, password }, auth: false });
      persistSession({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user, tenant: data.tenant, membership: data.membership });
      router.replace("/dashboard");
    } catch (err) { setError(err instanceof ApiError ? err.message : "Giriş yapılamadı. Lütfen tekrar deneyin."); }
    finally { setLoading(false); }
  }

  return (
    <main className="relative min-h-screen overflow-hidden text-[var(--ink)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(45%_35%_at_15%_5%,rgba(118,87,232,.12),transparent_70%),radial-gradient(38%_32%_at_90%_12%,rgba(22,160,123,.10),transparent_70%)]" />
      <header className="relative mx-auto flex h-[76px] max-w-[1240px] items-center justify-between border-b border-[var(--line)] px-6 sm:px-8">
        <a href="/login" className="flex items-center gap-3 text-[15px] font-semibold tracking-[-.025em]">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[linear-gradient(135deg,#7657e8,#b45de8)] text-[12px] font-semibold text-white shadow-[0_7px_18px_rgba(118,87,232,.18)]">B</span>
          Beauty ERP
        </a>
        <nav className="flex items-center gap-4 text-[12px] text-[var(--muted)]"><button type="button" className="hidden hover:text-[var(--ink)] sm:block">Yardım</button><span className="h-4 w-px bg-[var(--line)]" /><button type="button" className="hover:text-[var(--ink)]">TR⌄</button></nav>
      </header>

      <section className="relative mx-auto flex min-h-[calc(100vh-164px)] w-full max-w-[520px] flex-col items-center px-5 pb-16 pt-16 sm:pt-20">
        <BeautyMark />
        <div className="mt-7 text-center"><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-[var(--accent)]">İşletme yönetim platformu</p><h1 className="mt-3 text-[38px] font-semibold leading-tight tracking-[-.05em] sm:text-[44px]">Tekrar hoş geldiniz</h1><p className="mt-2 text-[15px] text-[var(--muted)]">Beauty ERP hesabınıza güvenli şekilde giriş yapın.</p></div>

        <div className="glass-elevated mt-9 w-full rounded-[24px] p-5 sm:p-7">
          <form onSubmit={onSubmit}>
            <div className="space-y-4">
              <label className="block"><span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">E-posta</span><TextInput type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ornek@isletme.com" className="h-[50px] bg-white/70 text-[14px]" /></label>
              <label className="block"><div className="mb-2 flex items-center justify-between"><span className="text-[12px] font-medium text-[var(--muted)]">Şifre</span><button type="button" className="text-[11px] font-medium text-[var(--accent)] hover:underline">Şifremi unuttum</button></div><TextInput type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" className="h-[50px] bg-white/70 text-[14px]" /></label>
            </div>
            {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
            <label className="mt-5 flex cursor-pointer items-center gap-2 text-[12px] text-[var(--muted)]"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="h-4 w-4 rounded border-[var(--line)] accent-[#7657e8]" /> Oturumumu açık tut</label>
            <Button type="submit" disabled={loading} className="mt-5 h-[50px] w-full rounded-[13px] text-[14px]">{loading ? "Giriş yapılıyor..." : "Giriş yap"}</Button>
          </form>
          <div className="my-6 flex items-center gap-3 text-[11px] text-[var(--muted-soft)]"><span className="h-px flex-1 bg-[var(--line)]" /><span>veya</span><span className="h-px flex-1 bg-[var(--line)]" /></div>
          <button type="button" className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[13px] border border-[var(--line)] bg-white/65 text-[13px] font-medium text-[var(--ink)] transition hover:bg-white" onClick={() => setError("Apple ile giriş bu hesap için henüz etkin değil.")}><span className="text-[14px]">●</span> Apple ile devam et</button>
          <div className="mt-5 flex items-start gap-3 rounded-[15px] border border-[rgba(22,160,123,.10)] bg-[var(--secondary-soft)] px-4 py-3.5"><span className="mt-0.5 text-[15px] text-[var(--secondary)]">✓</span><div><p className="text-[12px] font-semibold text-[var(--ink)]">Güvenli ve korumalı</p><p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Hesap bilgileriniz güvenli bağlantı üzerinden korunur.</p></div></div>
        </div>
      </section>

      <footer className="relative mx-auto flex min-h-[88px] max-w-[1240px] flex-col items-center justify-between gap-3 border-t border-[var(--line)] px-6 py-6 text-[11px] text-[var(--muted)] sm:flex-row sm:px-8"><span>© 2026 Beauty ERP</span><div className="flex flex-wrap justify-center gap-x-5 gap-y-2"><a href="#" className="hover:text-[var(--ink)]">Gizlilik</a><a href="#" className="hover:text-[var(--ink)]">Kullanım Şartları</a><a href="#" className="hover:text-[var(--ink)]">KVKK</a><a href="#" className="hover:text-[var(--ink)]">İletişim</a></div><span>Türkiye⌄</span></footer>
    </main>
  );
}
