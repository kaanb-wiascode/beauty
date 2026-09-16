"use client";

import { useEffect, useState } from "react";

import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";

type Workflow = {
  id: string;
  workflowKey: string;
  name: string;
  domain: string;
  description: string | null;
  version: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  conditions: Record<string, unknown>;
  steps: Array<Record<string, unknown>>;
  publishedAt: string | null;
  createdAt: string;
};

export default function ApprovalWorkflowsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workflowKey, setWorkflowKey] = useState("");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("finance");
  const [description, setDescription] = useState("");
  const [stepName, setStepName] = useState("Manager Approval");
  const [approverPermission, setApproverPermission] = useState("finance.manage");

  async function load() {
    try {
      const data = await api<Workflow[]>("/admin/approval-workflows");
      setItems(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Onay akışları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function createWorkflow() {
    setSaving(true);
    setError("");
    try {
      await api("/admin/approval-workflows", {
        method: "POST",
        body: {
          workflowKey,
          name,
          domain,
          description: description.trim() || undefined,
          conditions: {},
          steps: [{ key: "step-1", name: stepName, approverPermission, mode: "SEQUENTIAL" }],
        },
      });
      setOpen(false);
      setWorkflowKey(""); setName(""); setDescription("");
      showToast("Onay akışı taslağı oluşturuldu.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Onay akışı oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function publish(id: string) {
    if (!window.confirm("Bu workflow versiyonu yayınlandığında değiştirilemez olacak. Devam edilsin mi?")) return;
    try {
      await api(`/admin/approval-workflows/${id}/publish`, { method: "POST" });
      showToast("Onay akışı yayınlandı.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Onay akışı yayınlanamadı.");
    }
  }

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center text-sm text-[var(--muted)]">Yükleniyor…</div>;

  return <main className="mx-auto w-full max-w-[1240px] space-y-6 pb-10">
    <header className="flex flex-col gap-4 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="mb-1 text-xs font-medium text-[var(--muted)]">Yönetim / Politikalar</div><h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">Onay Akışları</h1><p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">Finance, HR, procurement ve diğer domainler için versiyonlu, merkezi approval workflow tanımları oluşturun.</p></div>
      <button type="button" onClick={() => setOpen(true)} className="rounded-xl bg-[var(--ink)] px-4 py-2.5 text-sm font-semibold text-white">+ Yeni Workflow</button>
    </header>
    {error ? <div className="rounded-xl border border-[#f0d8d8] bg-[#fff8f8] px-4 py-3 text-sm text-[#9a4545]">{error}</div> : null}
    <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs text-[var(--muted)]"><tr><th className="px-4 py-3">Workflow</th><th className="px-4 py-3">Domain</th><th className="px-4 py-3">Versiyon</th><th className="px-4 py-3">Adımlar</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3 text-right">İşlem</th></tr></thead><tbody>
        {items.map((item) => <tr key={item.id} className="border-b border-[var(--line)] last:border-0"><td className="px-4 py-4"><div className="font-semibold text-[var(--ink)]">{item.name}</div><div className="text-xs text-[var(--muted)]">{item.workflowKey}</div></td><td className="px-4 py-4">{item.domain}</td><td className="px-4 py-4">v{item.version}</td><td className="px-4 py-4">{Array.isArray(item.steps) ? item.steps.length : 0}</td><td className="px-4 py-4"><span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent)]">{item.status}</span></td><td className="px-4 py-4 text-right">{item.status === "DRAFT" ? <button type="button" onClick={() => void publish(item.id)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold">Yayınla</button> : <span className="text-xs text-[var(--muted)]">Immutable</span>}</td></tr>)}
        {!items.length ? <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-[var(--muted)]">Henüz merkezi onay akışı tanımlanmamış.</td></tr> : null}
      </tbody></table></div>
    </section>
    {open ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"><div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"><h2 className="text-lg font-semibold">Yeni Onay Akışı</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><input value={workflowKey} onChange={(e) => setWorkflowKey(e.target.value)} placeholder="expense-approval" className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"/><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Masraf Onay Akışı" className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"/><input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="finance" className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"/><input value={approverPermission} onChange={(e) => setApproverPermission(e.target.value)} placeholder="finance.manage" className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"/><input value={stepName} onChange={(e) => setStepName(e.target.value)} placeholder="Manager Approval" className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm sm:col-span-2"/><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Açıklama" className="min-h-20 rounded-xl border border-[var(--line)] px-3 py-2 text-sm sm:col-span-2"/></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm">Vazgeç</button><button disabled={saving || workflowKey.trim().length < 2 || name.trim().length < 2} type="button" onClick={() => void createWorkflow()} className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Oluşturuluyor…" : "Taslak Oluştur"}</button></div></div></div> : null}
  </main>;
}
