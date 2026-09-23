"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { getAccessToken, persistSession } from "@/lib/auth";
import type { LoginResponse } from "@/lib/types";
import { Alert, Button, TextInput } from "@/components/ui";

type MfaChallenge = {
  mfaRequired: true;
  enrollmentRequired: boolean;
  challengeId: string;
  expiresInSeconds: number;
  user: { id: string; email: string; firstName: string; lastName: string };
  tenant: { id: string; name: string; slug: string };
  company: { id: string; name: string; slug: string };
};

type MfaSetup = { secret: string; otpauthUri: string };

function ValooMark() {
  return (
    <div
      className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-[28px] shadow-[0_18px_45px_rgba(22,116,189,0.18)]"
      style={{ background: "linear-gradient(135deg, #55D4E1 0%, #369FCB 48%, #0551B0 100%)" }}
      aria-hidden="true"
    >
      <div className="absolute inset-[7px] rounded-[22px] bg-white/95" />
      <span className="relative bg-gradient-to-br from-[#55D4E1] via-[#369FCB] to-[#0551B0] bg-clip-text text-[42px] font-semibold leading-none tracking-[-0.08em] text-transparent">V</span>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const [mfaSetup, setMfaSetup] = useState<MfaSetup | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getAccessToken()) router.replace("/dashboard");
  }, [router]);

  const finishLogin = (data: LoginResponse) => {
    persistSession({
      accessToken: data.accessToken,
      user: data.user,
      tenant: data.tenant,
      membership: data.membership,
    });
    router.replace("/dashboard");
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await api<LoginResponse | MfaChallenge>("/auth/login", {
        method: "POST",
        body: { email, password },
        auth: false,
      });

      if ("mfaRequired" in data) {
        setChallenge(data);
        setMfaCode("");
        if (data.enrollmentRequired) {
          const setup = await api<MfaSetup>(`/auth/mfa/challenge/${data.challengeId}/setup`, {
            method: "POST",
            auth: false,
          });
          setMfaSetup(setup);
        }
        return;
      }

      finishLogin(data);
    } catch (err) {
      setError(err instanceof ApiError ? "Giriş Bilgileri Doğrulanamadı. Lütfen Bilgilerinizi Kontrol Edin." : "Giriş Yapılamadı. Lütfen Tekrar Deneyin.");
    } finally {
      setLoading(false);
    }
  }

  async function onMfaSubmit(event: FormEvent) {
    event.preventDefault();
    if (!challenge) return;
    setError("");
    setLoading(true);

    try {
      const data = challenge.enrollmentRequired
        ? await api<LoginResponse>(`/auth/mfa/challenge/${challenge.challengeId}/enroll`, {
            method: "POST",
            body: { code: mfaCode },
            auth: false,
          })
        : await api<LoginResponse>("/auth/mfa/verify", {
            method: "POST",
            body: { challengeId: challenge.challengeId, code: mfaCode },
            auth: false,
          });
      finishLogin(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Doğrulama tamamlanamadı.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--ink)]">
      <header className="mx-auto flex h-[72px] max-w-[1200px] items-center justify-between border-b border-[var(--line)] px-6 sm:px-8">
        <a href="/login" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.02em]">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[12px] font-semibold text-white shadow-[0_6px_18px_rgba(22,116,189,0.18)]" style={{ background: "linear-gradient(135deg, #55D4E1 0%, #369FCB 48%, #0551B0 100%)" }} aria-hidden="true">V</span>
          VALOO
        </a>
        <span className="text-[12px] font-medium text-[var(--muted)]">Güvenli Giriş</span>
      </header>

      <section className="mx-auto flex min-h-[calc(100vh-160px)] w-full max-w-[760px] flex-col items-center px-6 pb-16 pt-20 sm:pt-24">
        <ValooMark />
        <div className="mt-8 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--muted)]">İşletme Yönetimi</p>
          <h1 className="mt-2 text-[38px] font-semibold leading-tight tracking-[-0.045em] sm:text-[46px]">VALOO</h1>
          <p className="mt-2 text-[17px] text-[var(--muted)]">{challenge ? "İki Aşamalı Doğrulama" : "Hesabınıza Giriş Yapın"}</p>
        </div>

        {!challenge ? (
          <form onSubmit={onSubmit} className="mt-10 w-full max-w-[430px] rounded-[22px] border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6">
            <div className="space-y-3">
              <TextInput type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-Posta Adresi" aria-label="E-Posta Adresi" className="h-[54px] px-4 text-[16px] shadow-none" />
              <TextInput type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Şifre" aria-label="Şifre" className="h-[54px] px-4 text-[16px] shadow-none" />
            </div>
            {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
            <Button type="submit" disabled={loading} className="mt-6 h-[52px] w-full rounded-[14px] text-[16px] font-medium">{loading ? "Giriş Yapılıyor..." : "Devam Et"}</Button>
            <div className="mt-9 flex items-start gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] px-4 py-4 text-left">
              <span className="mt-0.5 text-[18px] text-[var(--accent)]" aria-hidden="true">⌾</span>
              <div><p className="text-[13px] font-medium text-[var(--ink)]">Güvenli Ve Korumalı</p><p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">Hesap Bilgileriniz Güvenli Bağlantı Üzerinden Korunur.</p></div>
            </div>
          </form>
        ) : (
          <form onSubmit={onMfaSubmit} className="mt-10 w-full max-w-[430px] rounded-[22px] border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6">
            {challenge.enrollmentRequired && mfaSetup ? (
              <div className="mb-5 rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4">
                <p className="text-sm font-semibold text-[var(--ink)]">Authenticator Kurulumu</p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Authenticator uygulamanızda yeni hesap ekleyin ve aşağıdaki anahtarı manuel girin. Bu anahtar yalnız kurulum sırasında gösterilir.</p>
                <div className="mt-3 break-all rounded-lg border border-[var(--line)] bg-white px-3 py-2 font-mono text-sm font-semibold tracking-[0.08em] text-[var(--ink)]">{mfaSetup.secret}</div>
                <a href={mfaSetup.otpauthUri} className="mt-3 inline-flex text-xs font-semibold text-[var(--accent)]">Authenticator ile aç</a>
              </div>
            ) : (
              <p className="mb-5 text-sm leading-6 text-[var(--muted)]">Authenticator uygulamanızdaki 6 haneli doğrulama kodunu girin.</p>
            )}

            <TextInput inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" aria-label="Doğrulama Kodu" className="h-[54px] px-4 text-center font-mono text-[20px] tracking-[0.3em] shadow-none" />
            {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
            <Button type="submit" disabled={loading || mfaCode.length !== 6} className="mt-6 h-[52px] w-full rounded-[14px] text-[16px] font-medium">{loading ? "Doğrulanıyor..." : challenge.enrollmentRequired ? "Kurulumu Tamamla" : "Doğrula ve Giriş Yap"}</Button>
            <button type="button" onClick={() => { setChallenge(null); setMfaSetup(null); setMfaCode(""); setError(""); }} className="mt-4 w-full text-center text-xs font-semibold text-[var(--muted)]">Giriş ekranına dön</button>
          </form>
        )}
      </section>

      <footer className="mx-auto flex min-h-[88px] max-w-[1200px] flex-col items-center justify-between gap-3 border-t border-[var(--line)] px-6 py-6 text-[12px] text-[var(--muted)] sm:flex-row sm:px-8">
        <span>© 2026 VALOO. Tüm Hakları Saklıdır.</span><span>Türkiye</span>
      </footer>
    </main>
  );
}
