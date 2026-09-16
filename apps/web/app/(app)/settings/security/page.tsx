"use client";

import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";

type SessionItem = {
  id: string;
  membershipId: string;
  companyId: string | null;
  branchId: string | null;
  roleScope: string | null;
  createdAt: string;
  rotatedAt: string;
  expiresInSeconds: number | null;
};

type SecurityPolicy = {
  companyId: string;
  requireMfa: boolean;
  sessionMaxAgeMinutes: number;
  idleTimeoutMinutes: number;
  passwordMinLength: number;
};

type MfaStatus = { enrolled: boolean };
type MfaSetup = { secret: string; otpauthUri: string };
type SecurityEvent = {
  id: string;
  resource: string;
  action: string;
  targetEntityType: string | null;
  createdAt: string;
};

function formatExpiry(seconds: number | null) {
  if (seconds === null) return "Süre bilgisi yok";
  if (seconds <= 0) return "Süresi dolmak üzere";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days} gün ${hours} saat`;
  return `${Math.max(1, Math.floor(seconds / 60))} dakika`;
}

export default function SecuritySettingsPage() {
  const { showToast } = useToast();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [policy, setPolicy] = useState<SecurityPolicy | null>(null);
  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);
  const [mfaSetup, setMfaSetup] = useState<MfaSetup | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingMfa, setSavingMfa] = useState(false);

  const loadSecurity = useCallback(async () => {
    try {
      setLoading(true);
      const [sessionItems, policyItem, mfaItem, mfaEvents, sessionEvents] = await Promise.all([
        api<SessionItem[]>("/auth/sessions"),
        api<SecurityPolicy>("/auth/security-policy"),
        api<MfaStatus>("/auth/mfa/status"),
        api<SecurityEvent[]>("/admin/audit-events?resource=security_mfa&limit=25"),
        api<SecurityEvent[]>("/admin/audit-events?resource=security_sessions&limit=25"),
      ]);
      setSessions(sessionItems);
      setPolicy(policyItem);
      setMfaStatus(mfaItem);
      setSecurityEvents(
        [...mfaEvents, ...sessionEvents]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 12),
      );
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Güvenlik bilgileri yüklenemedi.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadSecurity();
  }, [loadSecurity]);

  const revoke = async (id: string) => {
    try {
      setRevoking(id);
      await api(`/auth/sessions/${id}/revoke`, { method: "POST" });
      showToast("Oturum kapatıldı.");
      await loadSecurity();
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Oturum kapatılamadı.", "error");
    } finally {
      setRevoking(null);
    }
  };

  const revokeAll = async () => {
    if (!window.confirm("Bu tenant içindeki kayıtlı tüm oturumlarınız kapatılacak. Devam edilsin mi?")) return;
    try {
      setRevokingAll(true);
      const result = await api<{ revokedCount: number }>("/auth/sessions/revoke-all", { method: "POST" });
      showToast(`${result.revokedCount} oturum kapatıldı.`);
      await loadSecurity();
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Oturumlar kapatılamadı.", "error");
    } finally {
      setRevokingAll(false);
    }
  };

  const savePolicy = async () => {
    if (!policy) return;
    try {
      setSavingPolicy(true);
      const saved = await api<SecurityPolicy>("/auth/security-policy", {
        method: "POST",
        body: {
          requireMfa: policy.requireMfa,
          sessionMaxAgeMinutes: policy.sessionMaxAgeMinutes,
          idleTimeoutMinutes: policy.idleTimeoutMinutes,
          passwordMinLength: policy.passwordMinLength,
        },
      });
      setPolicy(saved);
      showToast("Güvenlik politikası kaydedildi.");
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Güvenlik politikası kaydedilemedi.", "error");
    } finally {
      setSavingPolicy(false);
    }
  };

  const startMfaSetup = async () => {
    try {
      setSavingMfa(true);
      setMfaSetup(await api<MfaSetup>("/auth/mfa/setup", { method: "POST" }));
      setMfaCode("");
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "MFA kurulumu başlatılamadı.", "error");
    } finally {
      setSavingMfa(false);
    }
  };

  const confirmMfa = async () => {
    try {
      setSavingMfa(true);
      await api<MfaStatus>("/auth/mfa/confirm", { method: "POST", body: { code: mfaCode } });
      setMfaStatus({ enrolled: true });
      setMfaSetup(null);
      setMfaCode("");
      showToast("MFA etkinleştirildi.");
      await loadSecurity();
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "MFA doğrulaması tamamlanamadı.", "error");
    } finally {
      setSavingMfa(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[1240px] space-y-6 pb-10">
      <header className="border-b border-[var(--line)] pb-5">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Yönetim / Güvenlik</div>
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">Güvenlik Merkezi</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">Oturumları, MFA durumunu ve şirket güvenlik politikalarını merkezi olarak yönetin.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Aktif Oturum</div>
          <div className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">{loading ? "—" : sessions.length}</div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Refresh oturumları yalnız güvenli fingerprint kimliğiyle görüntülenir.</p>
        </article>
        <article className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">MFA</div>
          <div className="mt-2 text-xl font-semibold text-[var(--ink)]">{loading ? "—" : mfaStatus?.enrolled ? "Etkin" : "Kurulmamış"}</div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">TOTP tabanlı iki aşamalı doğrulama.</p>
        </article>
        <article className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Şirket Politikası</div>
          <div className="mt-2 text-xl font-semibold text-[var(--ink)]">{loading ? "—" : policy?.requireMfa ? "MFA Zorunlu" : "MFA İsteğe Bağlı"}</div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Login enforcement aktif policy üzerinden uygulanır.</p>
        </article>
      </section>

      <section className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--ink)]">Kişisel MFA Kurulumu</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">Şirket politikası zorunlu olmadan önce de hesabınızı authenticator ile koruyabilirsiniz.</p>
          </div>
          {!mfaStatus?.enrolled && !mfaSetup ? (
            <button type="button" disabled={savingMfa} onClick={() => void startMfaSetup()} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">MFA Kur</button>
          ) : null}
        </div>
        {mfaStatus?.enrolled ? (
          <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4 text-sm font-medium text-[var(--ink)]">MFA etkin. MFA zorunlu bir policy altında sonraki girişlerde doğrulama kodu istenir.</div>
        ) : null}
        {mfaSetup ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_220px]">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
              <p className="text-xs leading-5 text-[var(--muted)]">Authenticator uygulamanıza bu secret anahtarını ekleyin. Anahtar yalnız kurulum sırasında gösterilir.</p>
              <div className="mt-3 break-all rounded-lg bg-white px-3 py-2 font-mono text-sm font-semibold tracking-[0.08em]">{mfaSetup.secret}</div>
              <a href={mfaSetup.otpauthUri} className="mt-3 inline-flex text-xs font-semibold text-[var(--accent)]">Authenticator ile aç</a>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--muted)]">6 haneli doğrulama kodu
                <input inputMode="numeric" maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} className="mt-2 w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-center font-mono text-lg tracking-[0.2em] text-[var(--ink)]" />
              </label>
              <button type="button" disabled={savingMfa || mfaCode.length !== 6} onClick={() => void confirmMfa()} className="mt-3 w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Etkinleştir</button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--ink)]">Şirket Güvenlik Politikası</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">MFA zorunluluğu login challenge akışında uygulanır; diğer değerler merkezi security policy kaydıdır.</p>
          </div>
          <button type="button" disabled={!policy || savingPolicy} onClick={() => void savePolicy()} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{savingPolicy ? "Kaydediliyor…" : "Politikayı Kaydet"}</button>
        </div>
        {policy ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="rounded-xl border border-[var(--line)] p-4 text-xs text-[var(--muted)]"><span className="flex items-center justify-between gap-3"><span><strong className="block text-sm text-[var(--ink)]">MFA Zorunlu</strong>Şirket login akışında TOTP challenge uygular.</span><input type="checkbox" checked={policy.requireMfa} onChange={(event) => setPolicy({ ...policy, requireMfa: event.target.checked })} /></span></label>
            <label className="text-xs font-medium text-[var(--muted)]">Maksimum oturum süresi (dk)<input type="number" min={15} max={43200} value={policy.sessionMaxAgeMinutes} onChange={(event) => setPolicy({ ...policy, sessionMaxAgeMinutes: Number(event.target.value) })} className="mt-2 w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--ink)]" /></label>
            <label className="text-xs font-medium text-[var(--muted)]">Boşta kalma süresi (dk)<input type="number" min={5} max={10080} value={policy.idleTimeoutMinutes} onChange={(event) => setPolicy({ ...policy, idleTimeoutMinutes: Number(event.target.value) })} className="mt-2 w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--ink)]" /></label>
            <label className="text-xs font-medium text-[var(--muted)]">Minimum parola uzunluğu<input type="number" min={8} max={128} value={policy.passwordMinLength} onChange={(event) => setPolicy({ ...policy, passwordMinLength: Number(event.target.value) })} className="mt-2 w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--ink)]" /></label>
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <div><h2 className="text-sm font-semibold text-[var(--ink)]">Aktif Oturumlar</h2><p className="mt-1 text-xs text-[var(--muted)]">Şirket, şube ve rol kapsamına göre oluşturulmuş refresh oturumları.</p></div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void loadSecurity()} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold">Yenile</button>
            <button type="button" disabled={revokingAll || sessions.length === 0} onClick={() => void revokeAll()} className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-xs font-semibold disabled:opacity-50">{revokingAll ? "Kapatılıyor…" : "Tümünü Kapat"}</button>
          </div>
        </div>
        {loading ? <div className="px-5 py-10 text-sm text-[var(--muted)]">Oturumlar yükleniyor…</div> : sessions.length === 0 ? <div className="px-5 py-10 text-sm text-[var(--muted)]">Aktif registry oturumu bulunamadı.</div> : (
          <div className="divide-y divide-[var(--line)]">{sessions.map((session) => (
            <article key={session.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 space-y-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)]">{session.roleScope ?? "Kapsam bilinmiyor"}</span><span className="font-mono text-[11px] text-[var(--muted)]">{session.id.slice(0, 12)}…</span></div><p className="text-sm font-medium text-[var(--ink)]">{session.branchId ? "Şube bağlamlı oturum" : "Şirket / merkezi oturum"}</p><p className="text-xs text-[var(--muted)]">Son yenileme: {new Date(session.rotatedAt).toLocaleString("tr-TR")} · Kalan süre: {formatExpiry(session.expiresInSeconds)}</p></div>
              <button type="button" disabled={revoking === session.id || revokingAll} onClick={() => void revoke(session.id)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold disabled:opacity-50">{revoking === session.id ? "Kapatılıyor…" : "Oturumu Kapat"}</button>
            </article>
          ))}</div>
        )}
      </section>

      <section className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
        <div className="border-b border-[var(--line)] px-5 py-4"><h2 className="text-sm font-semibold text-[var(--ink)]">Son Güvenlik Olayları</h2><p className="mt-1 text-xs text-[var(--muted)]">MFA ve session revoke olayları immutable audit kayıtlarından gösterilir.</p></div>
        <div className="divide-y divide-[var(--line)]">
          {securityEvents.length ? securityEvents.map((event) => (
            <div key={event.id} className="flex items-center justify-between gap-4 px-5 py-3 text-xs"><div><span className="font-semibold text-[var(--ink)]">{event.resource}</span><span className="ml-2 rounded-full bg-[var(--surface-2)] px-2 py-1 text-[var(--muted)]">{event.action}</span></div><span className="whitespace-nowrap text-[var(--muted)]">{new Date(event.createdAt).toLocaleString("tr-TR")}</span></div>
          )) : <div className="px-5 py-8 text-sm text-[var(--muted)]">Henüz güvenlik audit olayı bulunamadı.</div>}
        </div>
      </section>
    </main>
  );
}
