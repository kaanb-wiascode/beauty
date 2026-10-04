"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, Modal, TextArea, TextInput } from "@/components/ui";
import { ValooLogo } from "@/components/valoo-logo";
import { api, ApiError } from "@/lib/api";
import { getAccessToken, persistSession } from "@/lib/auth";
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

const bubbleItems = [
  { text: "Bugünkü randevular hazır!", icon: "▣", className: "left-[47%] top-[8%] rotate-[2deg]" },
  { text: "Ekip planı tıkırında.", icon: "♧", className: "right-[7%] top-[24%] -rotate-[2deg]" },
  { text: "Tahsilatlar kontrol altında.", icon: "▤", className: "right-[8%] top-[39%] rotate-[1deg]" },
  { text: "Müşteriler hep yanında.", icon: "♡", className: "left-[12%] top-[47%] -rotate-[3deg]" },
  { text: "Stoklar düzenli.", icon: "◇", className: "left-[43%] top-[49%] rotate-[2deg]" },
] as const;

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
    if (getAccessToken()) router.replace("/dashboard");
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

  const currentTimeLabel = useMemo(
    () => new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(new Date()),
    [],
  );

  return (
    <main className="min-h-screen bg-[#eef8f1] p-0 text-[var(--ink)] lg:p-5">
      <div className="mx-auto grid min-h-screen max-w-[1600px] overflow-hidden bg-white shadow-[0_28px_90px_rgba(18,93,53,.12)] lg:min-h-[calc(100vh-40px)] lg:grid-cols-[minmax(0,1.18fr)_minmax(440px,.82fr)] lg:rounded-[34px]">
        <section className="relative hidden overflow-hidden border-r border-[rgba(0,191,99,.10)] bg-[linear-gradient(145deg,#fffdf8_0%,#f6fbf7_44%,#eaf8ef_100%)] lg:block">
          <div className="absolute -left-24 top-20 h-72 w-72 rounded-full bg-[rgba(0,191,99,.08)] blur-3xl" />
          <div className="absolute -right-28 bottom-16 h-80 w-80 rounded-full bg-[rgba(67,217,139,.12)] blur-3xl" />

          <div className="relative z-10 flex h-full min-h-[900px] flex-col px-10 pb-8 pt-9 xl:px-14">
            <ValooLogo className="w-[150px]" priority />

            <div className="mt-12 max-w-[560px]">
              <p className="font-[cursive] text-[42px] font-semibold leading-[1.02] tracking-[-0.05em] text-[#15231a] xl:text-[56px]">
                İşler yolunda,
                <span className="block text-[var(--accent)]">sen keyfinde. ♡</span>
              </p>
              <p className="mt-6 max-w-[500px] text-[15px] leading-7 text-[#56645b]">
                Randevular, ekip, müşteriler, finans ve daha fazlası VALOO&apos;da bir arada.
                Günün karmaşasını bize bırak, sen işine odaklan.
              </p>
            </div>

            {bubbleItems.map((item) => (
              <div
                key={item.text}
                className={`absolute z-20 flex max-w-[240px] items-center gap-3 rounded-[22px] border border-white/90 bg-white/88 px-4 py-3 shadow-[0_12px_35px_rgba(18,93,53,.09)] backdrop-blur-xl ${item.className}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[var(--accent-soft)] text-[18px] font-semibold text-[var(--accent)]">
                  {item.icon}
                </span>
                <span className="text-[12px] font-semibold leading-4 text-[#263329]">{item.text}</span>
              </div>
            ))}

            <div className="absolute right-[7%] top-[56%] z-20 rounded-[26px] bg-[#08723f] px-6 py-5 text-center text-[14px] font-semibold leading-5 text-white shadow-[0_20px_48px_rgba(0,105,54,.22)]">
              Daha az stres,
              <br />
              daha çok başarı. ♡
            </div>

            <div className="relative mt-auto pt-40">
              <div className="relative mx-auto max-w-[760px] rounded-[28px] border border-white/90 bg-white/85 p-3 shadow-[0_30px_70px_rgba(18,93,53,.18)] backdrop-blur-xl">
                <div className="overflow-hidden rounded-[22px] border border-[#dfe9e2] bg-[#f8fbf9]">
                  <div className="grid min-h-[350px] grid-cols-[145px_minmax(0,1fr)]">
                    <aside className="bg-[#173225] px-3 py-4 text-white">
                      <ValooLogo className="w-[84px] brightness-0 invert" alt="VALOO" />
                      <div className="mt-6 space-y-1 text-[9px]">
                        {["Bugün", "Randevular", "Müşteriler", "Operasyon Merkezi", "Finans", "Stok", "İK", "Raporlar"].map((label, index) => (
                          <div key={label} className={`rounded-[8px] px-2.5 py-2 ${index === 0 ? "bg-[#00bf63] font-semibold" : "text-white/70"}`}>
                            {label}
                          </div>
                        ))}
                      </div>
                    </aside>

                    <div className="bg-white p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-[10px] text-[var(--muted)]">Günaydın 👋</p>
                          <h2 className="mt-1 text-[18px] font-semibold tracking-[-.03em]">Bugünün özeti</h2>
                        </div>
                        <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-[9px] font-semibold text-[var(--accent)]">{currentTimeLabel}</span>
                      </div>

                      <div className="mt-5 grid grid-cols-4 gap-2">
                        {[
                          ["Randevular", "18"],
                          ["Günlük Ciro", "₺84.250"],
                          ["Aktif Personel", "7"],
                          ["Yeni Müşteri", "5"],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-[12px] border border-[#e4ece7] bg-[#fbfdfb] p-3">
                            <p className="text-[8px] text-[var(--muted)]">{label}</p>
                            <p className="mt-1.5 text-[14px] font-semibold">{value}</p>
                            <p className="mt-1 text-[7px] font-semibold text-[var(--accent)]">↑ bugün</p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 grid grid-cols-[1.18fr_.82fr] gap-3">
                        <div className="rounded-[14px] border border-[#e4ece7] p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-semibold">Bugünkü Randevular</p>
                            <span className="text-[8px] font-semibold text-[var(--accent)]">Tümünü gör</span>
                          </div>
                          <div className="mt-3 space-y-2">
                            {[
                              ["09:00", "Ayşe Demir", "Tamamlandı"],
                              ["10:30", "Zeynep Yılmaz", "Şu anda"],
                              ["12:00", "Melis Kaya", "Bekliyor"],
                              ["14:30", "Ece Arslan", "Bekliyor"],
                            ].map(([time, name, status]) => (
                              <div key={time} className="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-2 text-[8px]">
                                <span className="text-[var(--muted)]">{time}</span>
                                <span className="font-medium">{name}</span>
                                <span className="rounded-full bg-[var(--accent-soft)] px-2 py-1 text-[7px] font-semibold text-[var(--accent)]">{status}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-[14px] border border-[#e4ece7] p-3">
                          <p className="text-[10px] font-semibold">Günlük Ciro</p>
                          <p className="mt-2 text-[18px] font-semibold">₺84.250</p>
                          <div className="mt-5 flex h-24 items-end gap-1.5">
                            {[32, 44, 38, 57, 64, 75, 89].map((height, index) => (
                              <span key={index} className="flex-1 rounded-t bg-[linear-gradient(180deg,#43d98b,#00bf63)]" style={{ height: `${height}%` }} />
                            ))}
                          </div>
                          <div className="mt-2 flex justify-between text-[6px] text-[var(--muted)]">
                            <span>Pzt</span><span>Sal</span><span>Çar</span><span>Per</span><span>Cum</span><span>Cmt</span><span>Paz</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#ffffff_0%,#fbfefc_100%)] px-5 py-8 sm:px-8 lg:min-h-0 lg:px-12 xl:px-16">
          <div className="absolute right-6 top-6 rounded-full border border-[var(--line)] bg-white/90 px-3 py-2 text-[11px] font-semibold text-[var(--muted)] shadow-sm">
            TR⌄
          </div>

          <div className="w-full max-w-[470px]">
            <div className="lg:hidden">
              <ValooLogo className="w-[130px]" priority />
              <div className="mt-7 rounded-[22px] border border-[var(--line)] bg-[var(--accent-soft)] px-5 py-4">
                <p className="text-[21px] font-semibold tracking-[-.035em]">İşler yolunda, sen keyfinde. ♡</p>
                <p className="mt-2 text-[12px] leading-5 text-[var(--muted)]">Günün karmaşasını VALOO&apos;ya bırak.</p>
              </div>
            </div>

            <ValooLogo className="hidden w-[180px] lg:block" priority />

            <div className="mt-10">
              <h1 className="text-[34px] font-semibold tracking-[-.045em] text-[var(--ink)] sm:text-[40px]">
                {challenge ? "Bir adım kaldı." : "Tekrar hoş geldin. 👋"}
              </h1>
              <p className="mt-2 text-[14px] leading-6 text-[var(--muted)]">
                {challenge ? "Güvenli doğrulamanı tamamla ve devam et." : "VALOO hesabına giriş yap ve güne kolay başla."}
              </p>
            </div>

            {!challenge ? (
              <form onSubmit={onSubmit} className="mt-9">
                <div className="space-y-5">
                  <label className="block">
                    <span className="mb-2 block text-[13px] font-semibold">E-posta adresi</span>
                    <TextInput type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ornek@firma.com" className="h-[56px] rounded-[15px] px-4 text-[15px] shadow-none" />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-[13px] font-semibold">Şifre</span>
                    <div className="relative">
                      <TextInput type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Şifrenizi girin" className="h-[56px] rounded-[15px] px-4 pr-14 text-[15px] shadow-none" />
                      <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"} className="absolute right-2.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-[10px] text-[16px] text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]">
                        {showPassword ? "◉" : "◎"}
                      </button>
                    </div>
                  </label>
                </div>

                <div className="mt-4 flex items-center justify-between gap-4">
                  <label className="flex items-center gap-2 text-[12px] text-[var(--muted)]">
                    <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                    Beni hatırla
                  </label>
                  <button type="button" onClick={() => { setForgotEmail(email); setFlowNotice(""); setForgotOpen(true); }} className="text-[12px] font-semibold text-[var(--accent)] hover:text-[var(--accent-strong)]">
                    Şifremi Unuttum?
                  </button>
                </div>

                {error ? <div className="mt-5"><Alert>{error}</Alert></div> : null}

                <Button type="submit" disabled={loading} className="mt-6 h-[56px] w-full rounded-[15px] text-[16px] font-semibold">
                  {loading ? "VALOO hazırlanıyor..." : "Giriş Yap  →"}
                </Button>

                <div className="my-7 flex items-center gap-3 text-[11px] text-[var(--muted-soft)]">
                  <span className="h-px flex-1 bg-[var(--line)]" />
                  <span>veya</span>
                  <span className="h-px flex-1 bg-[var(--line)]" />
                </div>

                <button type="button" disabled className="flex h-[54px] w-full items-center justify-center gap-3 rounded-[15px] border border-[var(--line)] bg-white text-[13px] font-semibold text-[var(--ink)] opacity-60">
                  <span className="text-[17px]">⌗</span>
                  Tek kullanımlık kod ile giriş yap
                </button>

                <button type="button" onClick={() => { setFlowNotice(""); setSupportOpen(true); }} className="mt-7 flex w-full items-center gap-4 rounded-[18px] border border-[#dff0e5] bg-[linear-gradient(135deg,#f2fbf5,#eaf8ef)] px-4 py-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(18,93,53,.08)]">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[20px] text-[var(--accent)] shadow-sm">◉</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] text-[var(--muted)]">Giriş yapmakta sorun mu yaşıyorsun?</span>
                    <span className="mt-1 block text-[13px] font-semibold text-[var(--accent)]">Destek Talebinde Bulunun →</span>
                  </span>
                </button>
              </form>
            ) : (
              <form onSubmit={onMfaSubmit} className="mt-9 rounded-[22px] border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6">
                {challenge.enrollmentRequired && mfaSetup ? (
                  <div className="mb-5 rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4">
                    <p className="text-sm font-semibold text-[var(--ink)]">Doğrulama uygulaması kurulumu</p>
                    <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Doğrulama uygulamanızda yeni bir hesap ekleyin ve aşağıdaki anahtarı elle girin.</p>
                    <div className="mt-3 break-all rounded-lg border border-[var(--line)] bg-white px-3 py-2 font-mono text-sm font-semibold tracking-[0.08em] text-[var(--ink)]">{mfaSetup.secret}</div>
                    <a href={mfaSetup.otpauthUri} className="mt-3 inline-flex text-xs font-semibold text-[var(--accent)]">Doğrulama uygulamasıyla aç</a>
                  </div>
                ) : (
                  <p className="mb-5 text-sm leading-6 text-[var(--muted)]">Doğrulama uygulamanızdaki 6 haneli kodu girin.</p>
                )}

                <TextInput inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" aria-label="Doğrulama kodu" className="h-[56px] rounded-[15px] px-4 text-center font-mono text-[20px] tracking-[0.3em] shadow-none" />
                {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
                <Button type="submit" disabled={loading || mfaCode.length !== 6} className="mt-6 h-[54px] w-full rounded-[15px] text-[15px] font-semibold">{loading ? "Doğrulanıyor..." : challenge.enrollmentRequired ? "Kurulumu tamamla" : "Doğrula ve giriş yap"}</Button>
                <button type="button" onClick={() => { setChallenge(null); setMfaSetup(null); setMfaCode(""); setError(""); }} className="mt-4 w-full text-center text-xs font-semibold text-[var(--muted)]">Giriş ekranına dön</button>
              </form>
            )}

            <div className="mt-8 flex items-center gap-2 text-[11px] text-[var(--muted-soft)]">
              <span>⌾</span>
              <span>Güvenli bağlantı</span>
              <span>•</span>
              <span>İki aşamalı doğrulama desteklenir</span>
            </div>
          </div>
        </section>
      </div>

      <Modal open={forgotOpen} onClose={() => setForgotOpen(false)} title="Şifreni mi unuttun?" description="E-posta adresini bırak, sıfırlama akışını buradan başlatalım.">
        <form onSubmit={submitForgot}>
          <label className="block">
            <span className="mb-2 block text-[13px] font-semibold">E-posta adresi</span>
            <TextInput type="email" required value={forgotEmail} onChange={(event) => setForgotEmail(event.target.value)} placeholder="ornek@firma.com" />
          </label>
          {flowNotice ? <div className="mt-4"><Alert>{flowNotice}</Alert></div> : null}
          <Button type="submit" className="mt-5 w-full">Sıfırlama bağlantısı iste</Button>
        </form>
      </Modal>

      <Modal open={supportOpen} onClose={() => setSupportOpen(false)} title="Bir şeye mi takıldın?" description="Bize birkaç detay bırak. Destek ekibi akışını buradan başlatacağız.">
        <form onSubmit={submitSupport} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold">Ad Soyad</span>
              <TextInput required value={supportForm.name} onChange={(event) => setSupportForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold">E-posta</span>
              <TextInput type="email" required value={supportForm.email} onChange={(event) => setSupportForm((current) => ({ ...current, email: event.target.value }))} />
            </label>
          </div>
          <label className="block">
            <span className="mb-2 block text-[13px] font-semibold">Konu</span>
            <TextInput required value={supportForm.subject} onChange={(event) => setSupportForm((current) => ({ ...current, subject: event.target.value }))} placeholder="Giriş yapamıyorum" />
          </label>
          <label className="block">
            <span className="mb-2 block text-[13px] font-semibold">Ne oldu?</span>
            <TextArea required rows={5} value={supportForm.message} onChange={(event) => setSupportForm((current) => ({ ...current, message: event.target.value }))} placeholder="Sorunu mümkün olduğunca kısa anlatın." />
          </label>
          {flowNotice ? <Alert>{flowNotice}</Alert> : null}
          <Button type="submit" className="w-full">Destek talebi oluştur</Button>
        </form>
      </Modal>
    </main>
  );
}
