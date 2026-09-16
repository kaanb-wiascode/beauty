"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Alert, Button, Spinner } from "@/components/ui";

type Permission = { id: string; resource: string; action: string; description?: string | null };
type Policy = { id: string; fieldGroup: string; requiredResource: string; requiredAction: string; description: string | null; updatedAt: string };
type Starter = { fieldGroup: string; title: string; description: string; fallback: string };

const starters: Starter[] = [
  { fieldGroup: "hr.employee.identity-banking", title: "Personel Kimlik & Banka", description: "TCKN, doğum tarihi, kişisel iletişim, adres, banka ve IBAN alanlarını korur.", fallback: "hr_sensitive.read" },
  { fieldGroup: "hr.employee.compensation-payroll", title: "Ücret & Bordro", description: "Brüt ücret, ücret tipi, bordro dönemleri ve maaş ödeme geçmişini korur.", fallback: "hr_sensitive.read" },
];

export default function FieldSecurityPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [busyGroup, setBusyGroup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const permissionKeys = useMemo(() => permissions.map((p) => `${p.resource}.${p.action}`).sort(), [permissions]);

  const load = async () => {
    const [policyRows, permissionRows] = await Promise.all([
      api<Policy[]>("/admin/field-security-policies"),
      api<Permission[]>("/roles/permissions"),
    ]);
    setPolicies(policyRows);
    setPermissions(permissionRows);
    const next: Record<string, string> = {};
    for (const starter of starters) {
      const current = policyRows.find((row) => row.fieldGroup === starter.fieldGroup);
      next[starter.fieldGroup] = current ? `${current.requiredResource}.${current.requiredAction}` : starter.fallback;
    }
    setSelection(next);
  };

  useEffect(() => { load().catch((e) => setError(e instanceof ApiError ? e.message : "Alan güvenliği politikaları yüklenemedi.")); }, []);

  const save = async (event: FormEvent, starter: Starter) => {
    event.preventDefault();
    const value = selection[starter.fieldGroup] || starter.fallback;
    const splitAt = value.lastIndexOf(".");
    if (splitAt < 1) return;
    setBusyGroup(starter.fieldGroup); setError(null); setNotice(null);
    try {
      await api("/admin/field-security-policies", {
        method: "PUT",
        body: JSON.stringify({ fieldGroup: starter.fieldGroup, requiredResource: value.slice(0, splitAt), requiredAction: value.slice(splitAt + 1), description: starter.description }),
      });
      await load();
      setNotice(`${starter.title} politikası kaydedildi.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Alan güvenliği politikası kaydedilemedi.");
    } finally { setBusyGroup(null); }
  };

  if (!permissions.length && !error) return <Spinner label="Alan güvenliği yükleniyor..." />;

  return <main className="mx-auto w-full max-w-[1120px] space-y-6 pb-10">
    <header className="border-b border-[var(--line)] pb-5">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">Yönetim / Erişim</div>
      <h1 className="text-[28px] font-semibold tracking-[-.04em] text-[var(--ink)]">Alan Güvenliği</h1>
      <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">Yüksek riskli veri gruplarını ayrı permission kurallarıyla koruyun. Karar API response oluşturulurken server-side uygulanır; yalnız arayüz gizleme değildir.</p>
    </header>
    {error ? <Alert tone="error">{error}</Alert> : null}{notice ? <Alert>{notice}</Alert> : null}
    <section className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5">
      <h2 className="text-sm font-semibold text-[var(--ink)]">Aktif enforcement kapsamı</h2>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">İlk yüksek riskli dilim Employee 360 üzerinde aktiftir. Kimlik/banka ve ücret/bordro alanları birbirinden bağımsız değerlendirilir; geçici permission grant’leri de aynı karara dahildir.</p>
    </section>
    <section className="grid gap-4 lg:grid-cols-2">
      {starters.map((starter) => {
        const current = policies.find((row) => row.fieldGroup === starter.fieldGroup);
        return <form key={starter.fieldGroup} onSubmit={(e) => save(e, starter)} className="space-y-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-[var(--ink)]">{starter.title}</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{starter.description}</p></div><span className="rounded-full border border-[var(--line)] px-2 py-1 text-[10px] font-semibold text-[var(--muted)]">{current ? "CUSTOM" : "DEFAULT"}</span></div>
          <code className="block rounded-lg bg-[var(--surface-2)] px-3 py-2 text-[11px] text-[var(--muted)]">{starter.fieldGroup}</code>
          <label className="block text-xs text-[var(--muted)]">Gerekli permission<select value={selection[starter.fieldGroup] ?? starter.fallback} onChange={(e) => setSelection((old) => ({ ...old, [starter.fieldGroup]: e.target.value }))} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]">{permissionKeys.map((permission) => <option key={permission} value={permission}>{permission}</option>)}</select></label>
          <div className="flex items-center justify-between gap-3"><div className="text-[11px] text-[var(--muted)]">{current ? `Son güncelleme: ${new Date(current.updatedAt).toLocaleString("tr-TR")}` : `Varsayılan: ${starter.fallback}`}</div><Button type="submit" disabled={busyGroup === starter.fieldGroup}>{busyGroup === starter.fieldGroup ? "Kaydediliyor..." : "Politikayı Kaydet"}</Button></div>
        </form>;
      })}
    </section>
  </main>;
}
