"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";

export default function AcceptInvitationPage() {
  const [token, setToken] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") ?? "");
  }, []);

  async function acceptInvitation() {
    if (!token) {
      setError("Davet bağlantısı geçersiz veya eksik.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Parolalar eşleşmiyor.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await api("/auth/invitations/accept", {
        method: "POST",
        auth: false,
        body: { token, password, firstName, lastName },
      });
      setDone(true);
      setToken("");
      window.history.replaceState({}, "", "/accept-invitation");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Davet kabul edilemedi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--surface-2)] px-4 py-10">
      <section className="w-full max-w-lg rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-lift)]">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">VALOO · Güvenli Katılım</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">Davetinizi Kabul Edin</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Hesabınızı oluşturmak için adınızı ve parolanızı belirleyin. Davet bağlantısı yalnız bir kez kullanılabilir.</p>

        {error ? <div className="mt-4 rounded-xl border border-[#f0d8d8] bg-[#fff8f8] px-4 py-3 text-sm text-[#9a4545]">{error}</div> : null}

        {done ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4 text-sm text-[var(--ink)]">Hesabınız ve organizasyon erişiminiz oluşturuldu. Artık giriş yapabilirsiniz.</div>
            <Link href="/login" className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white">Giriş Yap</Link>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {!token ? <div className="rounded-xl border border-[#f0d8d8] bg-[#fff8f8] px-4 py-3 text-sm text-[#9a4545]">Davet tokenı bulunamadı. Yöneticinizden yeni bir davet bağlantısı isteyin.</div> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs font-medium text-[var(--muted)]">Ad
                <input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" className="block min-h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)]" />
              </label>
              <label className="space-y-1.5 text-xs font-medium text-[var(--muted)]">Soyad
                <input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" className="block min-h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)]" />
              </label>
            </div>
            <label className="block space-y-1.5 text-xs font-medium text-[var(--muted)]">Parola
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={8} autoComplete="new-password" className="block min-h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)]" />
            </label>
            <label className="block space-y-1.5 text-xs font-medium text-[var(--muted)]">Parola Tekrar
              <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" minLength={8} autoComplete="new-password" className="block min-h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)]" />
            </label>
            <button type="button" disabled={saving || !token || !firstName.trim() || !lastName.trim() || password.length < 8 || confirmPassword.length < 8} onClick={() => void acceptInvitation()} className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Hesap Oluşturuluyor…" : "Daveti Kabul Et"}</button>
          </div>
        )}
      </section>
    </main>
  );
}
