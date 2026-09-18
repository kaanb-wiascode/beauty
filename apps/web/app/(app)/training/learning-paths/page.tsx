"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner, TextInput } from "@/components/ui";
import { hasPermission } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";

type LearningPath = {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  isActive: boolean;
  publishedVersionId?: string | null;
  publishedVersion?: number | null;
  draftVersionId?: string | null;
  draftVersion?: number | null;
  publishedItemCount: number;
  draftItemCount: number;
};

export default function LearningPathsPage() {
  const canManage = hasPermission("training", "manage");
  const [rows,setRows] = useState<LearningPath[]>([]);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const [form,setForm] = useState({ code:"", title:"", description:"" });

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setRows(await api<LearningPath[]>("/training/learning-paths")); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Learning Path verileri yüklenemedi."); }
    finally { setLoading(false); }
  },[]);

  useEffect(() => { void load(); },[load]);

  const metrics = useMemo(() => ({
    total: rows.length,
    published: rows.filter((row) => row.publishedVersionId).length,
    draft: rows.filter((row) => row.draftVersionId).length,
    empty: rows.filter((row) => !row.publishedVersionId && !row.draftVersionId).length,
  }),[rows]);

  async function create() {
    if (!form.code.trim() || !form.title.trim()) return;
    setSaving(true); setError("");
    try {
      const created = await api<{id:string}>("/training/programs",{ method:"POST", body: JSON.stringify(form) });
      await api(`/training/programs/${created.id}/versions`,{ method:"POST" });
      setForm({code:"",title:"",description:""});
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Learning Path oluşturulamadı."); }
    finally { setSaving(false); }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/training" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">← Learning Operations</Link>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-soft)]">Learning Paths & Academies</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">Akademiler & Learning Paths</h1>
          <p className="mt-2 max-w-[900px] text-[13px] leading-6 text-[var(--muted)]">Kursları sıralı curriculum içinde yönetin, draft/published sürümleri koruyun ve prerequisite tabanlı gelişim yolları oluşturun.</p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>Yenile</Button>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceMetric label="Learning Path" value={metrics.total} detail="Tanımlı curriculum" tone="info" />
        <FinanceMetric label="Yayında" value={metrics.published} detail="Aktif published version" tone="success" />
        <FinanceMetric label="Draft" value={metrics.draft} detail="Düzenlenebilir sürüm" tone="warning" />
        <FinanceMetric label="İçerik Bekliyor" value={metrics.empty} detail="Henüz version oluşturulmamış" tone={metrics.empty ? "warning" : "success"} />
      </section>

      {canManage ? (
        <FinancePanel title="Yeni Learning Path" description="Rol akademisi, kariyer yolu veya zorunlu curriculum için temel programı ve ilk draft sürümünü birlikte oluşturur.">
          <div className="grid gap-3 lg:grid-cols-[180px_1fr_1.5fr_auto] lg:items-end">
            <div><p className="mb-1 text-[10px] font-semibold uppercase text-[var(--muted-soft)]">Kod</p><TextInput value={form.code} onChange={(e)=>setForm((v)=>({...v,code:e.target.value}))} placeholder="EST-ACADEMY" /></div>
            <div><p className="mb-1 text-[10px] font-semibold uppercase text-[var(--muted-soft)]">Başlık</p><TextInput value={form.title} onChange={(e)=>setForm((v)=>({...v,title:e.target.value}))} placeholder="Yeni Estetisyen Akademisi" /></div>
            <div><p className="mb-1 text-[10px] font-semibold uppercase text-[var(--muted-soft)]">Açıklama</p><TextInput value={form.description} onChange={(e)=>setForm((v)=>({...v,description:e.target.value}))} placeholder="Rol bazlı öğrenme yolu..." /></div>
            <Button onClick={() => void create()} disabled={saving || !form.code.trim() || !form.title.trim()}>{saving ? "Oluşturuluyor..." : "Oluştur"}</Button>
          </div>
        </FinancePanel>
      ) : null}

      <FinancePanel title="Learning Paths" description="Published sürüm personele atanabilir; draft sürüm içerik ve prerequisite düzenlemeleri için kullanılır.">
        {loading ? <div className="flex min-h-[260px] items-center justify-center"><Spinner label="Learning Path'ler yükleniyor..." /></div> : !rows.length ? <FinanceEmpty title="Learning Path bulunamadı" description="İlk rol akademisini veya gelişim curriculum'unu oluşturun." /> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {rows.map((row) => (
              <Link key={row.id} href={`/training/learning-paths/${row.id}`} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface-2)] p-4 transition hover:border-[var(--accent)]/40">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">{row.code}</p><h2 className="mt-1 text-[16px] font-semibold text-[var(--ink)]">{row.title}</h2></div>
                  <span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${row.publishedVersionId ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--warning-soft)] text-[var(--warning)]"}`}>{row.publishedVersionId ? `Yayında v${row.publishedVersion}` : "Yayınlanmadı"}</span>
                </div>
                <p className="mt-2 min-h-[36px] text-[11px] leading-5 text-[var(--muted)]">{row.description || "Açıklama eklenmemiş."}</p>
                <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-[var(--muted-soft)]">
                  <span>Published: {row.publishedItemCount} adım</span><span>•</span><span>Draft: {row.draftVersionId ? `v${row.draftVersion} · ${row.draftItemCount} adım` : "yok"}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </FinancePanel>
    </div>
  );
}
