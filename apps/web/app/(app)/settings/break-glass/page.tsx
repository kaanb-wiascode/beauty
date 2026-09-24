"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Alert, Button, Spinner, TextInput, Select } from "@/components/ui";
import { userPermissionLabel, userLabel } from "@/lib/user-language";

type Permission = { id: string; resource: string; action: string; description?: string | null };
type EventRow = {
  id: string;
  permissionResource: string;
  permissionAction: string;
  branchName: string | null;
  reason: string;
  startsAt: string;
  endsAt: string;
  revokedAt: string | null;
  actorEmail: string;
};

export default function BreakGlassPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [proofId, setProofId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [permissionId, setPermissionId] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  const load = async () => {
    const [p, e] = await Promise.all([
      api<Permission[]>("/roles/permissions"),
      api<EventRow[]>("/admin/break-glass"),
    ]);
    setPermissions(p);
    setEvents(e);
    if (!permissionId && p[0]) setPermissionId(p[0].id);
  };

  useEffect(() => {
    load().catch((e) => setError(e instanceof ApiError ? e.message : "Acil erişim verileri yüklenemedi."));
  }, []);

  useEffect(() => {
    const refreshNow = () => setNow(Date.now());
    refreshNow();
    const timer = window.setInterval(refreshNow, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const reauthenticate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const result = await api<{ proofId: string }>("/admin/break-glass/reauthenticate", {
        method: "POST",
        body: JSON.stringify({ password, mfaCode }),
      });
      setProofId(result.proofId);
      setPassword(""); setMfaCode("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Yeniden doğrulama başarısız.");
    } finally { setBusy(false); }
  };

  const activate = async (event: FormEvent) => {
    event.preventDefault();
    if (!proofId) return;
    setBusy(true); setError(null);
    try {
      await api("/admin/break-glass/activate", {
        method: "POST",
        body: JSON.stringify({ proofId, permissionId, durationMinutes, reason, branchId: null }),
      });
      setProofId(null); setReason("");
      await load();
    } catch (e) {
      setProofId(null);
      setError(e instanceof ApiError ? e.message : "Acil erişim açılamadı.");
    } finally { setBusy(false); }
  };

  const revoke = async (id: string) => {
    setBusy(true); setError(null);
    try {
      await api(`/admin/break-glass/${id}/revoke`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Acil erişim kapatılamadı.");
    } finally { setBusy(false); }
  };

  if (!permissions.length && !error) return <Spinner />;

  return (
    <main className="mx-auto w-full max-w-[1180px] space-y-6 pb-10">
      <header className="border-b border-[var(--line)] pb-5">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">Yönetim / Güvenlik</div>
        <h1 className="text-[28px] font-semibold tracking-[-.04em] text-[var(--ink)]">Acil Erişim</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">Acil erişim yalnızca tüm şirketi yönetme yetkisi bulunan yöneticiler için, parola ve iki aşamalı doğrulama sonrasında en fazla 60 dakika süreyle açılır. Her açma ve kapatma işlemi denetim kaydına yazılır.</p>
      </header>

      {error && <Alert tone="error">{error}</Alert>}

      {!proofId ? (
        <form onSubmit={reauthenticate} className="max-w-xl space-y-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ink)]">1. Güçlü Yeniden Doğrulama</h2>
          <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mevcut parolanız" required />
          <TextInput value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6 haneli doğrulama kodu" required />
          <Button type="submit" disabled={busy || !password || mfaCode.length !== 6}>{busy ? "Doğrulanıyor…" : "Yeniden Doğrula"}</Button>
        </form>
      ) : (
        <form onSubmit={activate} className="max-w-2xl space-y-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ink)]">2. Acil Yetki</h2>
          <label className="block text-xs text-[var(--muted)]">Yetki
            <Select className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]" value={permissionId} onChange={(e) => setPermissionId(e.target.value)}>
              {permissions.map((p) => <option key={p.id} value={p.id}>{userPermissionLabel(p.resource, p.action)}</option>)}
            </Select>
          </label>
          <label className="block text-xs text-[var(--muted)]">Süre
            <Select className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}>
              {[5, 10, 15, 30, 45, 60].map((v) => <option key={v} value={v}>{v} dakika</option>)}
            </Select>
          </label>
          <label className="block text-xs text-[var(--muted)]">Zorunlu gerekçe
            <textarea className="mt-1 min-h-24 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Acil erişimin neden gerekli olduğunu açıklayın…" required minLength={10} />
          </label>
          <div className="flex gap-2"><Button type="submit" disabled={busy || !permissionId || reason.trim().length < 10}>Erişimi Aç</Button><Button type="button" variant="secondary" onClick={() => setProofId(null)}>İptal</Button></div>
        </form>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Acil Erişim Geçmişi</h2>
        {events.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--line)] p-6 text-sm text-[var(--muted)]">Henüz acil erişim kaydı yok.</div> : events.map((row) => {
          const active = now !== null && !row.revokedAt && new Date(row.endsAt).getTime() > now;
          return <article key={row.id} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div><div className="text-sm font-semibold text-[var(--ink)]">{userPermissionLabel(row.permissionResource, row.permissionAction)}</div><div className="mt-1 text-xs text-[var(--muted)]">{new Date(row.startsAt).toLocaleString("tr-TR")} → {new Date(row.endsAt).toLocaleString("tr-TR")} · {row.branchName ?? "Şirket geneli"}</div><div className="mt-2 text-xs text-[var(--muted)]">{row.reason}</div></div>
              <div className="flex items-center gap-2"><span className="rounded-full border border-[var(--line)] px-2 py-1 text-xs">{row.revokedAt ? "Kapatıldı" : now === null ? "…" : userLabel(active ? "ACTIVE" : "EXPIRED")}</span>{active && <Button className="min-h-8 px-2.5 py-1 text-xs" variant="secondary" disabled={busy} onClick={() => revoke(row.id)}>Erken Kapat</Button>}</div>
            </div>
          </article>;
        })}
      </section>
    </main>
  );
}
