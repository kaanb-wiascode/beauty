"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { api, ApiError } from "@/lib/api";

type AuditEvent = {
  id: string;
  actorUserId: string;
  resource: string;
  action: string;
  targetEntityType: string | null;
  targetEntityId: string | null;
  reason: string | null;
  beforeState: unknown;
  afterState: unknown;
  metadata: Record<string, unknown> | null;
  correlationId: string | null;
  createdAt: string;
};

type Filters = {
  actorUserId: string;
  resource: string;
  action: string;
  companyId: string;
  branchId: string;
  from: string;
  to: string;
};

const emptyFilters: Filters = {
  actorUserId: "",
  resource: "",
  action: "",
  companyId: "",
  branchId: "",
  from: "",
  to: "",
};

function buildQuery(filters: Filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (!value.trim()) continue;
    params.set(key, value.trim());
  }
  params.set("limit", "100");
  return params.toString();
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("tr-TR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function stateSummary(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 120 ? `${serialized.slice(0, 117)}…` : serialized;
  } catch {
    return "Kayıt ayrıntısı";
  }
}

export default function AuditLogPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  const queryString = useMemo(() => buildQuery(appliedFilters), [appliedFilters]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    api<AuditEvent[]>(`/admin/audit-events?${queryString}`)
      .then((data) => {
        if (active) setEvents(data);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Denetim kayıtları yüklenemedi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [queryString]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setAppliedFilters(filters);
  }

  function resetFilters() {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
  }

  return (
    <main className="mx-auto w-full max-w-[1320px] space-y-6 pb-10">
      <header className="border-b border-[var(--line)] pb-5">
        <div className="mb-1 text-xs font-medium text-[var(--muted)]">Yönetim / Güvenlik</div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">Denetim Kayıtları</h1>
            <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
              Rol, yetki ve kullanıcı erişimi gibi kritik yönetim değişikliklerini aktör, kapsam ve önce/sonra durumu ile izleyin.
            </p>
          </div>
          <div className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--muted)]">
            Değiştirilemez kayıt geçmişi
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-[#f0d8d8] bg-[#fff8f8] px-4 py-3 text-sm text-[#9a4545]">{error}</div>
      ) : null}

      <form onSubmit={applyFilters} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            value={filters.actorUserId}
            onChange={(event) => setFilters((current) => ({ ...current, actorUserId: event.target.value }))}
            placeholder="Aktör kullanıcı ID"
            className="min-h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-sm"
          />
          <input
            value={filters.resource}
            onChange={(event) => setFilters((current) => ({ ...current, resource: event.target.value }))}
            placeholder="Modül / kaynak (roles)"
            className="min-h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-sm"
          />
          <input
            value={filters.action}
            onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))}
            placeholder="Aksiyon (update)"
            className="min-h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-sm"
          />
          <input
            value={filters.companyId}
            onChange={(event) => setFilters((current) => ({ ...current, companyId: event.target.value }))}
            placeholder="Şirket ID"
            className="min-h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-sm"
          />
          <input
            value={filters.branchId}
            onChange={(event) => setFilters((current) => ({ ...current, branchId: event.target.value }))}
            placeholder="Şube ID"
            className="min-h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-sm"
          />
          <label className="grid gap-1 text-xs text-[var(--muted)]">
            Başlangıç
            <input
              type="datetime-local"
              value={filters.from}
              onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
              className="min-h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)]"
            />
          </label>
          <label className="grid gap-1 text-xs text-[var(--muted)]">
            Bitiş
            <input
              type="datetime-local"
              value={filters.to}
              onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
              className="min-h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)]"
            />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="min-h-10 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white">Filtrele</button>
            <button type="button" onClick={resetFilters} className="min-h-10 rounded-xl border border-[var(--line)] px-4 text-sm font-medium">Temizle</button>
          </div>
        </div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--ink)]">Son yönetim olayları</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">En fazla 100 kayıt gösterilir.</p>
          </div>
          <span className="text-xs font-medium text-[var(--muted)]">{loading ? "Yükleniyor…" : `${events.length} kayıt`}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Zaman</th>
                <th className="px-4 py-3 font-medium">Aktör</th>
                <th className="px-4 py-3 font-medium">Kaynak</th>
                <th className="px-4 py-3 font-medium">Aksiyon</th>
                <th className="px-4 py-3 font-medium">Hedef</th>
                <th className="px-4 py-3 font-medium">Değişiklik</th>
                <th className="px-4 py-3 text-right font-medium">Detay</th>
              </tr>
            </thead>
            <tbody>
              {!loading && events.map((item) => (
                <tr key={item.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="whitespace-nowrap px-4 py-4 text-xs text-[var(--muted)]">{formatDate(item.createdAt)}</td>
                  <td className="px-4 py-4"><code className="text-xs text-[var(--ink)]">{item.actorUserId}</code></td>
                  <td className="px-4 py-4 font-medium text-[var(--ink)]">{item.resource}</td>
                  <td className="px-4 py-4"><span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent)]">{item.action}</span></td>
                  <td className="px-4 py-4"><div className="text-xs font-medium text-[var(--ink)]">{item.targetEntityType ?? "—"}</div><div className="mt-0.5 max-w-[180px] truncate text-[11px] text-[var(--muted)]">{item.targetEntityId ?? "—"}</div></td>
                  <td className="max-w-[280px] px-4 py-4 text-xs text-[var(--muted)]"><div className="truncate">{stateSummary(item.afterState)}</div></td>
                  <td className="px-4 py-4 text-right"><button type="button" onClick={() => setSelected(item)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-medium">İncele</button></td>
                </tr>
              ))}
              {!loading && !events.length ? <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-[var(--muted)]">Filtrelere uygun denetim kaydı bulunamadı.</td></tr> : null}
              {loading ? <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-[var(--muted)]">Denetim kayıtları yükleniyor…</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Denetim kaydı ayrıntısı">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{selected.resource} · {selected.action}</div>
                <h2 className="mt-1 text-xl font-semibold text-[var(--ink)]">Denetim Kaydı</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">{formatDate(selected.createdAt)} · Aktör {selected.actorUserId}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-medium">Kapat</button>
            </div>

            <div className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-[var(--surface-2)] p-3"><div className="text-xs text-[var(--muted)]">Hedef Türü</div><div className="mt-1 break-all text-sm font-semibold">{selected.targetEntityType ?? "—"}</div></div>
              <div className="rounded-xl bg-[var(--surface-2)] p-3"><div className="text-xs text-[var(--muted)]">Hedef ID</div><div className="mt-1 break-all text-sm font-semibold">{selected.targetEntityId ?? "—"}</div></div>
              <div className="rounded-xl bg-[var(--surface-2)] p-3"><div className="text-xs text-[var(--muted)]">Correlation</div><div className="mt-1 break-all text-sm font-semibold">{selected.correlationId ?? "—"}</div></div>
              <div className="rounded-xl bg-[var(--surface-2)] p-3"><div className="text-xs text-[var(--muted)]">Neden</div><div className="mt-1 text-sm font-semibold">{selected.reason ?? "—"}</div></div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-xl border border-[var(--line)] p-4"><h3 className="text-sm font-semibold">Önce</h3><pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--surface-2)] p-3 text-xs text-[var(--muted)]">{JSON.stringify(selected.beforeState, null, 2) ?? "null"}</pre></section>
              <section className="rounded-xl border border-[var(--line)] p-4"><h3 className="text-sm font-semibold">Sonra</h3><pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--surface-2)] p-3 text-xs text-[var(--muted)]">{JSON.stringify(selected.afterState, null, 2) ?? "null"}</pre></section>
            </div>
            <section className="mt-4 rounded-xl border border-[var(--line)] p-4"><h3 className="text-sm font-semibold">Kapsam / Metadata</h3><pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--surface-2)] p-3 text-xs text-[var(--muted)]">{JSON.stringify(selected.metadata, null, 2) ?? "null"}</pre></section>
          </div>
        </div>
      ) : null}
    </main>
  );
}
