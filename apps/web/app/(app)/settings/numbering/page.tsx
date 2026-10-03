"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Sequence = {
  id: string;
  documentType: string;
  prefix: string;
  branchId: string | null;
  yearScoped: boolean;
  padding: number;
  currentYear: number | null;
  currentValue: string | number;
  active: boolean;
};

export default function NumberingPage() {
  const [items, setItems] = useState<Sequence[]>([]);
  const [documentType, setDocumentType] = useState("journal-entry");
  const [prefix, setPrefix] = useState("JE");
  const [padding, setPadding] = useState(6);
  const [error, setError] = useState<string | null>(null);

  const load = () => api<Sequence[]>("/admin/document-sequences").then(setItems).catch((e) => setError(e instanceof Error ? e.message : "Numaralandırma ayarları yüklenemedi."));
  useEffect(() => { load(); }, []);

  async function save() {
    setError(null);
    try {
      await api("/admin/document-sequences", {
        method: "PUT",
        body: JSON.stringify({ documentType, prefix, padding, yearScoped: true, active: true }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Numaralandırma ayarı kaydedilemedi.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1100px] space-y-6 pb-10">
      <header className="border-b border-[var(--line)] pb-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Yönetim / İş Akışları</div>
        <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">Numaralandırma</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Belge tipleri için şirket/şube bazlı, yıl kırılımlı ve concurrency-safe numara serilerini yönetin.</p>
      </header>

      <section className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <input className="rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm" value={documentType} onChange={(e) => setDocumentType(e.target.value)} placeholder="document type" />
          <input className="rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="prefix" />
          <input className="rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm" type="number" min={1} max={12} value={padding} onChange={(e) => setPadding(Number(e.target.value))} />
        </div>
        {error && <div className="mt-3 text-xs text-red-500">{error}</div>}
        <button onClick={save} className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white">Seriyi Kaydet</button>
      </section>

      <section className="space-y-3">
        {items.length === 0 ? <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 text-sm text-[var(--muted)]">Henüz tanımlı belge serisi yok.</div> : items.map((item) => (
          <div key={item.id} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-[var(--ink)]">{item.documentType}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">Örnek biçim: {item.prefix}-{item.yearScoped ? `${item.currentYear ?? new Date().getFullYear()}-` : ""}{String(Number(item.currentValue) + 1).padStart(item.padding, "0")}</div>
              </div>
              <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">{item.branchId ? "Şube" : "Şirket"}</span>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
