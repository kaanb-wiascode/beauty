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
        <section className="relative hidden overflow-hidden border-r border-[rgba(0,191,99,.10)] bg-[linear-gradient(155deg,#fbfefc_0%,#f4faf6_45%,#edf8f1_100%)] lg:block">
          <div className="absolute inset-0 opacity-[.35]" style={{ backgroundImage: "linear-gradient(rgba(0,191,99,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(0,191,99,.055) 1px, transparent 1px)", backgroundSize: "34px 34px" }} />
          <div className="absolute -left-32 top-24 h-80 w-80 rounded-full bg-[rgba(0,191,99,.09)] blur-3xl" />
          <div className="absolute -right-24 bottom-8 h-96 w-96 rounded-full bg-[rgba(67,217,139,.11)] blur-3xl" />

          <div className="relative z-10 flex h-full min-h-[900px] flex-col px-10 pb-10 pt-9 xl:px-14">
            <ValooLogo className="w-[150px]" priority />

            <div className="mt-14 max-w-[620px]">
              <p className="text-[13px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">VALOO ile gün daha kolay</p>
              <h2 className="mt-4 max-w-[600px] text-[46px] font-semibold leading-[.98] tracking-[-.055em] text-[#15231a] xl:text-[60px]">
                İşler yolunda,
                <span className="block text-[var(--accent)]">sen keyfinde.</span>
              </h2>
              <p className="mt-6 max-w-[540px] text-[15px] leading-7 text-[#56645b]">
                Randevular, ekip, müşteriler, finans ve operasyon aynı ritimde ilerlesin.
                VALOO gününü sadeleştirir, sen kararlarına odaklanırsın.
              </p>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <div className="rounded-[18px] border border-white/90 bg-white/88 px-4 py-3 shadow-[0_10px_28px_rgba(18,93,53,.07)] backdrop-blur-xl">
                <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--muted)]">Bugünkü randevular</p>
                <div className="mt-1 flex items-end gap-2"><strong className="text-[24px] tracking-[-.04em]">18</strong><span className="pb-1 text-[10px] font-semibold text-[var(--accent)]">planlandı</span></div>
              </div>
              <div className="rounded-[18px] border border-white/90 bg-white/88 px-4 py-3 shadow-[0_10px_28px_rgba(18,93,53,.07)] backdrop-blur-xl">
                <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--muted)]">Ekip durumu</p>
                <div className="mt-1 flex items-end gap-2"><strong className="text-[24px] tracking-[-.04em]">7</strong><span className="pb-1 text-[10px] font-semibold text-[var(--accent)]">aktif personel</span></div>
              </div>
              <div className="rounded-[18px] border border-white/90 bg-white/88 px-4 py-3 shadow-[0_10px_28px_rgba(18,93,53,.07)] backdrop-blur-xl">
                <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--muted)]">Günlük ciro</p>
                <div className="mt-1 flex items-end gap-2"><strong className="text-[24px] tracking-[-.04em]">₺84.250</strong><span className="pb-1 text-[10px] font-semibold text-[var(--accent)]">bugün</span></div>
              </div>
            </div>

            <div className="relative mt-auto pt-12">
              <div className="relative mx-auto max-w-[820px]">
                <div className="relative z-10 overflow-hidden rounded-[30px] border border-white/95 bg-white shadow-[0_36px_90px_rgba(18,93,53,.18)]">
                  <div className="flex h-8 items-center gap-1.5 border-b border-[#e6eee9] bg-[#f7faf8] px-4">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#dbe5de]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#dbe5de]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#dbe5de]" />
                    <span className="ml-3 rounded-full bg-white px-3 py-1 text-[7px] font-medium text-[var(--muted)]">valoo.app/dashboard</span>
                  </div>

                  <div className="grid min-h-[390px] grid-cols-[150px_minmax(0,1fr)]">
                    <aside className="bg-[#163225] px-3 py-4 text-white">
                      <ValooLogo className="w-[82px] brightness-0 invert" alt="VALOO" />
                      <div className="mt-6 space-y-1 text-[9px]">
                        {["Bugün","Yönetim Özeti","Müşteri İlişkileri","Operasyon Merkezi","Finans Yönetimi","İnsan Kaynakları","Envanter","Raporlar"].map((label,index)=>(
                          <div key={label} className={`rounded-[9px] px-2.5 py-2 ${index===0?"bg-[#00bf63] font-semibold":"text-white/68"}`}>{label}</div>
                        ))}
                      </div>
                    </aside>

                    <div className="bg-[#fbfdfb] p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-[9px] font-medium text-[var(--muted)]">5 Ekim · Pazartesi</p>
                          <h3 className="mt-1 text-[20px] font-semibold tracking-[-.04em]">Bugünün özeti</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-[10px] border border-[#dfe9e2] bg-white px-3 py-2 text-[8px] font-medium text-[var(--muted)]">Tüm Şubeler</span>
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[9px] font-semibold text-[var(--accent)]">KA</span>
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-4 gap-2">
                        {[
                          ["Randevular","18","+4"],
                          ["Tahsilat","₺84.250","+12%"],
                          ["Aktif Personel","7","7/8"],
                          ["Yeni Müşteri","5","+2"],
                        ].map(([label,value,meta])=>(
                          <div key={label} className="rounded-[14px] border border-[#e3ece6] bg-white p-3">
                            <p className="text-[7px] font-medium uppercase tracking-[.05em] text-[var(--muted)]">{label}</p>
                            <div className="mt-2 flex items-end justify-between gap-1"><strong className="text-[14px]">{value}</strong><span className="text-[7px] font-semibold text-[var(--accent)]">{meta}</span></div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 grid grid-cols-[1.15fr_.85fr] gap-3">
                        <div className="rounded-[15px] border border-[#e3ece6] bg-white p-3">
                          <div className="flex items-center justify-between">
                            <div><p className="text-[10px] font-semibold">Canlı Operasyon</p><p className="mt-0.5 text-[7px] text-[var(--muted)]">Bugünkü randevu akışı</p></div>
                            <span className="text-[7px] font-semibold text-[var(--accent)]">Operasyon Merkezi →</span>
                          </div>
                          <div className="mt-3 space-y-2">
                            {[
                              ["09:00","Ayşe Demir","Cilt Bakımı","Tamamlandı"],
                              ["10:30","Zeynep Yılmaz","Lazer Epilasyon","İşlemde"],
                              ["12:00","Melis Kaya","Hydrafacial","Bekliyor"],
                              ["14:30","Ece Arslan","Bölgesel İncelme","Bekliyor"],
                            ].map(([time,name,service,status])=>(
                              <div key={time} className="grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-2 rounded-[10px] bg-[#f8fbf9] px-2 py-2 text-[7px]">
                                <span className="font-semibold text-[var(--muted)]">{time}</span>
                                <span className="min-w-0"><strong className="block truncate text-[8px]">{name}</strong><span className="block truncate text-[6px] text-[var(--muted)]">{service}</span></span>
                                <span className="rounded-full bg-[var(--accent-soft)] px-2 py-1 font-semibold text-[var(--accent)]">{status}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="rounded-[15px] border border-[#e3ece6] bg-white p-3">
                            <p className="text-[10px] font-semibold">Tahsilat Eğilimi</p>
                            <p className="mt-1 text-[7px] text-[var(--muted)]">Son 7 gün</p>
                            <div className="mt-4 flex h-20 items-end gap-1.5">
                              {[42,52,47,66,71,84,95].map((height,index)=><span key={index} className="flex-1 rounded-t-[4px] bg-[linear-gradient(180deg,#55dfa0,#00bf63)]" style={{height:`${height}%`}} />)}
                            </div>
                          </div>
                          <div className="rounded-[15px] border border-[#e3ece6] bg-white p-3">
                            <div className="flex items-center justify-between"><p className="text-[9px] font-semibold">Ekip Durumu</p><span className="text-[7px] text-[var(--accent)]">7 aktif</span></div>
                            <div className="mt-3 flex -space-x-1.5">
                              {["AK","EY","MS","BD","SA"].map((initials,index)=><span key={initials} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[var(--accent-soft)] text-[6px] font-semibold text-[var(--accent)]" style={{zIndex:10-index}}>{initials}</span>)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="absolute -bottom-5 -right-3 z-20 w-[170px] rounded-[26px] border-[6px] border-[#183326] bg-white p-2 shadow-[0_24px_60px_rgba(18,93,53,.2)] xl:-right-8">
                  <div className="rounded-[18px] bg-[#f7fbf8] p-3">
                    <div className="flex items-center justify-between"><ValooLogo className="w-[58px]" alt="VALOO" /><span className="text-[7px] text-[var(--muted)]">09:41</span></div>
                    <p className="mt-4 text-[8px] font-semibold">Bugün</p>
                    <div className="mt-2 rounded-[12px] bg-white p-2.5 shadow-sm">
                      <p className="text-[6px] text-[var(--muted)]">Sonraki randevu</p>
                      <p className="mt-1 text-[9px] font-semibold">10:30 · Zeynep</p>
                      <span className="mt-2 inline-flex rounded-full bg-[var(--accent-soft)] px-2 py-1 text-[6px] font-semibold text-[var(--accent)]">Hazır</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="rounded-[10px] bg-white p-2"><p className="text-[5px] text-[var(--muted)]">Tahsilat</p><p className="mt-1 text-[8px] font-semibold">₺84K</p></div>
                      <div className="rounded-[10px] bg-white p-2"><p className="text-[5px] text-[var(--muted)]">Ekip</p><p className="mt-1 text-[8px] font-semibold">7 aktif</p></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex items-center gap-6 text-[10px] text-[var(--muted)]">
                <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[var(--accent)]" /> Gerçek zamanlı operasyon</span>
                <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[var(--accent)]" /> Tek merkezden görünürlük</span>
                <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[var(--accent)]" /> Mobil uyumlu</span>
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
