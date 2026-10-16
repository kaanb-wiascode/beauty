"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, Modal, TextArea, TextInput } from "@/components/ui";
import { ValooLogo } from "@/components/valoo-logo";
import { api, ApiError } from "@/lib/api";
import { clearSession, getAccessToken, persistSession } from "@/lib/auth";
import type { LoginResponse } from "@/lib/types";
import { userErrorMessage } from "@/lib/user-language";

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureApiReady() {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 45; attempt += 1) {
    try {
      await api<{ status?: string }>("/health/live", {
        method: "GET",
        auth: false,
      });
      return;
    } catch (error) {
      lastError = error;
      if (error instanceof ApiError && error.status === 401) throw error;
      if (attempt < 44) await sleep(2000);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new ApiError("Sunucu şu anda hazırlanıyor.", 503);
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
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [supportForm, setSupportForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [flowNotice, setFlowNotice] = useState("");

  useEffect(() => {
    let active = true;

    async function validateExistingSession() {
      if (!getAccessToken()) return;

      try {
        await api<{ authenticated: boolean }>("/auth/me");
        if (active) router.replace("/dashboard");
      } catch {
        clearSession();
      }
    }

    void validateExistingSession();

    return () => {
      active = false;
    };
  }, [router]);

  const finishLogin = (data: LoginResponse) => {
    persistSession({
      accessToken: data.accessToken,
      user: data.user,
      tenant: data.tenant,
      membership: data.membership,
    });
    if (!remember) {
      try {
        window.sessionStorage.setItem("valoo-session-preference", "temporary");
      } catch {}
    }
    router.replace("/dashboard");
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await ensureApiReady();

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
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError("E-posta adresi veya şifre hatalı.");
        } else if (err.status === 0 || err.status >= 500) {
          setError("VALOO hazırlanıyor. Lütfen kısa bir süre sonra tekrar deneyin.");
        } else {
          setError(userErrorMessage(err.message, "Giriş yapılamadı. Lütfen tekrar deneyin."));
        }
      } else {
        setError("Giriş yapılamadı. Lütfen tekrar deneyin.");
      }
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
      setError(err instanceof ApiError ? userErrorMessage(err.message, "Doğrulama tamamlanamadı.") : "Doğrulama tamamlanamadı.");
    } finally {
      setLoading(false);
    }
  }

  function submitForgot(event: FormEvent) {
    event.preventDefault();
    setFlowNotice("Şifre sıfırlama servis bağlantısı bir sonraki adımda etkinleştirilecek. E-posta adresiniz kaydedildi.");
  }

  function submitSupport(event: FormEvent) {
    event.preventDefault();
    setFlowNotice("Destek talebi arayüzü hazır. Talep gönderim servisi bir sonraki adımda bağlanacak.");
  }


  return (
    <main className="min-h-screen bg-white text-[#1d1d1f]">
      <header className="border-b border-[#e8e8ed] bg-white">
        <div className="mx-auto flex h-[72px] max-w-[1180px] items-center justify-between px-5 sm:px-8">
          <a href="/login" aria-label="VALOO giriş" className="flex items-center">
            <ValooLogo className="w-[118px]" priority />
          </a>
          <div className="flex items-center gap-5 text-[12px] text-[#6e6e73]">
            <span className="hidden sm:inline">Güvenli giriş</span>
            <span className="rounded-full border border-[#d2d2d7] px-3 py-1.5 font-medium text-[#1d1d1f]">TR</span>
          </div>
        </div>
      </header>

      <section className="mx-auto flex min-h-[calc(100vh-145px)] w-full max-w-[560px] flex-col items-center justify-center px-6 py-14 sm:py-20">
        <div className="w-full text-center">
          <ValooLogo className="mx-auto w-[168px] sm:w-[184px]" priority />

          <h1 className="mt-10 text-[34px] font-semibold leading-[1.08] tracking-[-.045em] text-[#1d1d1f] sm:text-[42px]">
            {challenge ? "Güvenli doğrulamayı tamamla." : "VALOO hesabına giriş yap."}
          </h1>

          <p className="mx-auto mt-4 max-w-[430px] text-[15px] leading-6 text-[#6e6e73]">
            {challenge
              ? "Hesabını korumak için iki aşamalı doğrulama kodunu gir."
              : "Randevuların, ekibin, müşterilerin ve iş akışların seni bekliyor."}
          </p>
        </div>

        {!challenge ? (
          <form onSubmit={onSubmit} className="mt-10 w-full">
            <div className="overflow-hidden rounded-[16px] border border-[#d2d2d7] bg-white transition focus-within:border-[#86868b] focus-within:shadow-[0_0_0_3px_rgba(0,191,99,.11)]">
              <label className="block border-b border-[#e8e8ed] px-4 py-3">
                <span className="mb-1 block text-[11px] font-medium text-[#6e6e73]">E-posta adresi</span>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="ornek@firma.com"
                  className="h-8 w-full border-0 bg-transparent p-0 text-[16px] text-[#1d1d1f] outline-none placeholder:text-[#a1a1a6]"
                />
              </label>

              <label className="relative block px-4 py-3">
                <span className="mb-1 block text-[11px] font-medium text-[#6e6e73]">Şifre</span>
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Şifrenizi girin"
                  className="h-8 w-full border-0 bg-transparent p-0 pr-12 text-[16px] text-[#1d1d1f] outline-none placeholder:text-[#a1a1a6]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                  className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full text-[14px] text-[#6e6e73] transition hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
                >
                  {showPassword ? "◉" : "◎"}
                </button>
              </label>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <label className="flex items-center gap-2 text-[12px] text-[#6e6e73]">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                Beni hatırla
              </label>

              <button
                type="button"
                onClick={() => {
                  setForgotEmail(email);
                  setFlowNotice("");
                  setForgotOpen(true);
                }}
                className="text-[12px] font-medium text-[#007a3d] hover:underline"
              >
                Şifremi unuttum
              </button>
            </div>

            {error ? <div className="mt-5"><Alert>{error}</Alert></div> : null}

            <Button
              type="submit"
              disabled={loading}
              className="mt-7 h-[52px] w-full rounded-[12px] bg-[#1d1d1f] text-[15px] font-semibold text-white shadow-none hover:bg-[#2c2c2e]"
            >
              {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
            </Button>

            <div className="mt-8 flex items-center gap-4">
              <span className="h-px flex-1 bg-[#e8e8ed]" />
              <span className="text-[11px] text-[#a1a1a6]">veya</span>
              <span className="h-px flex-1 bg-[#e8e8ed]" />
            </div>

            <button
              type="button"
              onClick={() => {
                setFlowNotice("");
                setSupportOpen(true);
              }}
              className="mt-6 w-full text-center text-[13px] font-medium text-[#007a3d] hover:underline"
            >
              Giriş yapmakta sorun mu yaşıyorsun? Destek talebi oluştur
            </button>

            <div className="mt-8 rounded-[14px] bg-[#f5f5f7] px-4 py-4 text-left">
              <p className="text-[12px] font-medium text-[#1d1d1f]">Hesabın güvende</p>
              <p className="mt-1 text-[11px] leading-5 text-[#6e6e73]">
                Güvenli bağlantı ve iki aşamalı doğrulama desteğiyle hesabını koruyoruz.
              </p>
            </div>
          </form>
        ) : (
          <form onSubmit={onMfaSubmit} className="mt-10 w-full">
            {challenge.enrollmentRequired && mfaSetup ? (
              <div className="mb-6 rounded-[16px] border border-[#d2d2d7] bg-[#f5f5f7] p-5 text-left">
                <p className="text-[13px] font-semibold text-[#1d1d1f]">Doğrulama uygulaması kurulumu</p>
                <p className="mt-2 text-[12px] leading-5 text-[#6e6e73]">
                  Doğrulama uygulamanızda yeni hesap ekleyin ve aşağıdaki anahtarı girin.
                </p>
                <div className="mt-4 break-all rounded-[10px] border border-[#d2d2d7] bg-white px-3 py-3 font-mono text-[13px] font-semibold tracking-[.08em] text-[#1d1d1f]">
                  {mfaSetup.secret}
                </div>
                <a href={mfaSetup.otpauthUri} className="mt-3 inline-flex text-[12px] font-medium text-[#007a3d] hover:underline">
                  Doğrulama uygulamasıyla aç
                </a>
              </div>
            ) : null}

            <div className="rounded-[16px] border border-[#d2d2d7] bg-white px-4 py-3 focus-within:border-[#86868b] focus-within:shadow-[0_0_0_3px_rgba(0,191,99,.11)]">
              <span className="mb-1 block text-[11px] font-medium text-[#6e6e73]">6 haneli doğrulama kodu</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="h-9 w-full border-0 bg-transparent p-0 text-center font-mono text-[22px] tracking-[.3em] text-[#1d1d1f] outline-none"
              />
            </div>

            {error ? <div className="mt-5"><Alert>{error}</Alert></div> : null}

            <Button
              type="submit"
              disabled={loading || mfaCode.length !== 6}
              className="mt-7 h-[52px] w-full rounded-[12px] bg-[#1d1d1f] text-[15px] font-semibold text-white shadow-none hover:bg-[#2c2c2e]"
            >
              {loading ? "Doğrulanıyor..." : challenge.enrollmentRequired ? "Kurulumu tamamla" : "Doğrula ve giriş yap"}
            </Button>

            <button
              type="button"
              onClick={() => {
                setChallenge(null);
                setMfaSetup(null);
                setMfaCode("");
                setError("");
              }}
              className="mt-5 w-full text-center text-[12px] font-medium text-[#007a3d] hover:underline"
            >
              Giriş ekranına dön
            </button>
          </form>
        )}
      </section>

      <footer className="border-t border-[#e8e8ed] bg-[#f5f5f7]">
        <div className="mx-auto flex min-h-[72px] max-w-[1180px] flex-col items-center justify-between gap-2 px-5 py-5 text-[11px] text-[#6e6e73] sm:flex-row sm:px-8">
          <span>© 2026 VALOO. Tüm hakları saklıdır.</span>
          <div className="flex items-center gap-5">
            <span>Gizlilik</span>
            <span>Güvenlik</span>
            <span>Türkiye</span>
          </div>
        </div>
      </footer>

      <Modal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title="Şifreni mi unuttun?"
        description="E-posta adresini gir. Şifre sıfırlama akışını buradan başlatacağız."
      >
        <form onSubmit={submitForgot}>
          <label className="block">
            <span className="mb-2 block text-[13px] font-semibold">E-posta adresi</span>
            <TextInput
              type="email"
              required
              value={forgotEmail}
              onChange={(event) => setForgotEmail(event.target.value)}
              placeholder="ornek@firma.com"
            />
          </label>
          {flowNotice ? <div className="mt-4"><Alert>{flowNotice}</Alert></div> : null}
          <Button type="submit" className="mt-5 w-full">Sıfırlama bağlantısı iste</Button>
        </form>
      </Modal>

      <Modal
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        title="Destek talebi"
        description="Giriş sorununuzu kısaca iletin. Destek ekibi akışını buradan başlatacağız."
      >
        <form onSubmit={submitSupport} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold">Ad Soyad</span>
              <TextInput
                required
                value={supportForm.name}
                onChange={(event) => setSupportForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold">E-posta</span>
              <TextInput
                type="email"
                required
                value={supportForm.email}
                onChange={(event) => setSupportForm((current) => ({ ...current, email: event.target.value }))}
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-2 block text-[13px] font-semibold">Konu</span>
            <TextInput
              required
              value={supportForm.subject}
              onChange={(event) => setSupportForm((current) => ({ ...current, subject: event.target.value }))}
              placeholder="Giriş yapamıyorum"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[13px] font-semibold">Mesaj</span>
            <TextArea
              required
              rows={5}
              value={supportForm.message}
              onChange={(event) => setSupportForm((current) => ({ ...current, message: event.target.value }))}
              placeholder="Sorunu kısaca anlatın."
            />
          </label>
          {flowNotice ? <Alert>{flowNotice}</Alert> : null}
          <Button type="submit" className="w-full">Destek talebi oluştur</Button>
        </form>
      </Modal>
    </main>
  );
}
