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

function formatExpiry(seconds: number | null) {
  if (seconds === null) return "Süre bilgisi yok";
  if (seconds <= 0) return "Süresi dolmak üzere";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days} gün ${hours} saat`;
  const minutes = Math.max(1, Math.floor(seconds / 60));
  return `${minutes} dakika`;
}

export default function SecuritySettingsPage() {
  const toast = useToast();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [policy, setPolicy] = useState<SecurityPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const loadSecurity = useCallback(async () => {
    try {
      setLoading(true);
      const [sessionItems, policyItem] = await Promise.all([
        api<SessionItem[]>("/auth/sessions"),
        api<SecurityPolicy>("/auth/security-policy"),
      ]);
      setSessions(sessionItems);
      setPolicy(policyItem);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Güvenlik bilgileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadSecurity();
  }, [loadSecurity]);

  const revoke = async (id: string) => {
    try {
      setRevoking(id);
      await api(`/auth/sessions/${id}/revoke`, { method: "POST" });
      toast.success("Oturum kapatıldı.");
      await loadSecurity();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Oturum kapatılamadı.");
    } finally {
      setRevoking(null);
    }
  };

  const revokeAll = async () => {
    if (!window.confirm("Bu tenant içindeki kayıtlı tüm oturumlarınız kapatılacak. Devam edilsin mi?")) return;
    try {
      setRevokingAll(true);
      const result = await api<{ revokedCount: number }>("/auth/sessions/revoke-all", { method: "POST" });
      toast.success(`${result.revokedCount} oturum kapatıldı.`);
      await loadSecurity();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Oturumlar kapatılamadı.");
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
      toast.success("Güvenlik politikası kaydedildi.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Güvenlik politikası kaydedilemedi.");
    } finally {
      setSavingPolicy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[1240px] space-y-6 pb-10">
      <header className="border-b border-[var(--line)] pb-5">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Yönetim / Güvenlik</div>
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">Güvenlik Merkezi</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">Oturumları ve şirket güvenlik politikalarını merkezi olarak yönetin.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Aktif Oturum</div>
          <div className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">{loading ? "—" : sessions.length}</div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Refresh oturumları yalnız güvenli fingerprint kimliğiyle görüntülenir.</p>
        </article>

        <article className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)] md:col-span-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-[var(--ink)]">Session Security</div>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Refresh oturumu iptal edildiğinde cihaz yeni access token alamaz. Access tokenlar kısa ömürlü kalır.</p>
            </div>
            <button type="button" disabled={revokingAll || sessions.length === 0} onClick={() => void revokeAll()} className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-strong)] disabled:cursor-not-allowed disabled:opacity-50">
              {revokingAll ? "Kapatılıyor…" : "Tüm Oturumları Kapat"}
            </button>
          </div>
        </article>
      </section>

      <section className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--ink)]">Şirket Güvenlik Politikası</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">Bu değerler merkezi policy kaydıdır. MFA enforcement sonraki güvenlik katmanında bu policy üzerinden çalışacaktır.</p>
          </div>
          <button type="button" disabled={!policy || savingPolicy} onClick={() => void savePolicy()} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {savingPolicy ? "Kaydediliyor…" : "Politikayı Kaydet"}
          </button>
        </div>

        {policy ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="rounded-xl border border-[var(--line)] p-4 text-xs text-[var(--muted)]">
              <span className="flex items-center justify-between gap-3">
                <span><strong className="block text-sm text-[var(--ink)]">MFA Zorunlu</strong>Şirket kullanıcıları için MFA policy flag.</span>
                <input type="checkbox" checked={policy.requireMfa} onChange={(event) => setPolicy({ ...policy, requireMfa: event.target.checked })} />
              </span>
            </label>
            <label className="text-xs font-medium text-[var(--muted)]">Maksimum oturum süresi (dk)
              <input type="number" min={15} max={43200} value={policy.sessionMaxAgeMinutes} onChange={(event) => setPolicy({ ...policy, sessionMaxAgeMinutes: Number(event.target.value) })} className="mt-2 w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--ink)]" />
            </label>
            <label className="text-xs font-medium text-[var(--muted)]">Boşta kalma süresi (dk)
              <input type="number" min={5} max={10080} value={policy.idleTimeoutMinutes} onChange={(event) => setPolicy({ ...policy, idleTimeoutMinutes: Number(event.target.value) })} className="mt-2 w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--ink)]" />
            </label>
            <label className="text-xs font-medium text-[var(--muted)]">Minimum parola uzunluğu
              <input type="number" min={8} max={128} value={policy.passwordMinLength} onChange={(event) => setPolicy({ ...policy, passwordMinLength: Number(event.target.value) })} className="mt-2 w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--ink)]" />
            </label>
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--ink)]">Aktif Oturumlar</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">Şirket, şube ve rol kapsamına göre oluşturulmuş mevcut refresh oturumları.</p>
          </div>
          <button type="button" onClick={() => void loadSecurity()} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--line-strong)]">Yenile</button>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-sm text-[var(--muted)]">Oturumlar yükleniyor…</div>
        ) : sessions.length === 0 ? (
          <div className="px-5 py-10 text-sm text-[var(--muted)]">Registry üzerinde aktif oturum bulunamadı. Yeni girişlerden itibaren oturumlar burada görünür.</div>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {sessions.map((session) => (
              <article key={session.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)]">{session.roleScope ?? "Kapsam bilinmiyor"}</span>
                    <span className="font-mono text-[11px] text-[var(--muted)]">{session.id.slice(0, 12)}…</span>
                  </div>
                  <p className="text-sm font-medium text-[var(--ink)]">{session.branchId ? "Şube bağlamlı oturum" : "Şirket / merkezi oturum"}</p>
                  <p className="text-xs text-[var(--muted)]">Son yenileme: {new Date(session.rotatedAt).toLocaleString("tr-TR")} · Kalan süre: {formatExpiry(session.expiresInSeconds)}</p>
                </div>
                <button type="button" disabled={revoking === session.id || revokingAll} onClick={() => void revoke(session.id)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--line-strong)] disabled:cursor-not-allowed disabled:opacity-50">
                  {revoking === session.id ? "Kapatılıyor…" : "Oturumu Kapat"}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
