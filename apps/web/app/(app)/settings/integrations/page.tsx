"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Alert, Spinner } from "@/components/ui";

type Item = {
  id: string;
  category: string;
  kind: string;
  provider: string;
  displayName: string;
  branchId: string | null;
  status: "CONNECTED" | "DEGRADED" | "ERROR" | "DISCONNECTED";
  healthy: boolean;
  runtimeReady: boolean;
  hasCredentials: boolean | null;
  consentExpiresAt: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastError: string | null;
  issues: string[];
};

type Payload = { summary: Record<string, number>; items: Item[] };

export default function IntegrationsAdminPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Payload>("/admin/integrations")
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Entegrasyon kataloğu yüklenemedi."));
  }, []);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <Spinner />;

  return (
    <main className="mx-auto w-full max-w-[1240px] space-y-6 pb-10">
      <header className="border-b border-[var(--line)] pb-5">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">Yönetim / Sistem</div>
        <h1 className="text-[28px] font-semibold tracking-[-.04em] text-[var(--ink)]">Entegrasyonlar</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">Bağlantı sağlığını, senkronizasyon durumunu ve yapılandırma sorunlarını tek merkezden izleyin. Gizli bilgiler ve credential değerleri bu görünümde gösterilmez.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Toplam", data.summary.total ?? 0],
          ["Bağlı", data.summary.CONNECTED ?? 0],
          ["Degraded", data.summary.DEGRADED ?? 0],
          ["Hata", data.summary.ERROR ?? 0],
          ["Sorunlu", data.summary.withIssues ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="text-xs text-[var(--muted)]">{label}</div>
            <div className="mt-2 text-2xl font-semibold text-[var(--ink)]">{value}</div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        {data.items.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--line)] p-8 text-sm text-[var(--muted)]">Henüz kayıtlı entegrasyon bulunmuyor.</div>
        ) : data.items.map((item) => (
          <article key={item.id} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">{item.category} · {item.kind}</div>
                <h2 className="mt-1 text-base font-semibold text-[var(--ink)]">{item.displayName}</h2>
                <div className="mt-1 text-xs text-[var(--muted)]">Provider: {item.provider}</div>
              </div>
              <span className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--ink)]">{item.status}</span>
            </div>
            <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <div><span className="text-[var(--muted)]">Runtime:</span> {item.runtimeReady ? "Hazır" : "Hazır değil"}</div>
              <div><span className="text-[var(--muted)]">Credential:</span> {item.hasCredentials === null ? "Bilinmiyor" : item.hasCredentials ? "Yapılandırılmış" : "Eksik"}</div>
              <div><span className="text-[var(--muted)]">Son sync:</span> {item.lastSyncAt ? new Date(item.lastSyncAt).toLocaleString("tr-TR") : "—"}</div>
              <div><span className="text-[var(--muted)]">Sync durumu:</span> {item.lastSyncStatus ?? "—"}</div>
            </div>
            {item.issues.length > 0 && (
              <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-subtle)] p-3">
                <div className="text-xs font-semibold text-[var(--ink)]">Dikkat Gerektirenler</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--muted)]">{item.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
              </div>
            )}
            {item.lastError && <div className="mt-3 text-xs text-[var(--danger)]">Son hata: {item.lastError}</div>}
          </article>
        ))}
      </section>
    </main>
  );
}
