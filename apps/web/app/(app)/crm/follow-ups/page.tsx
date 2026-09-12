"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { Alert, Button, EmptyState, Field, PageHeader, Select, Spinner, TextArea, TextInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import { getStoredUser, hasPermission } from "@/lib/auth";
import { followUpChannelLabels, type CrmFollowUp, type CrmLead, type CrmOpportunity } from "@/lib/crm-types";

type Filter = "OPEN" | "COMPLETED" | "ALL";
const emptyForm = { subject: "", channel: "CALL" as CrmFollowUp["channel"], dueAt: "", note: "" };

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function CrmFollowUpsPage() {
  const canManage = hasPermission("crm", "manage");
  const { showToast } = useToast();
  const [rows, setRows] = useState<CrmFollowUp[]>([]);
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [opportunities, setOpportunities] = useState<CrmOpportunity[]>([]);
  const [filter, setFilter] = useState<Filter>("OPEN");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [completing, setCompleting] = useState<CrmFollowUp | null>(null);
  const [outcome, setOutcome] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const query = filter === "ALL" ? "" : `?status=${filter}`;
      const [followUps, leadRows, opportunityRows] = await Promise.all([
        api<CrmFollowUp[]>(`/crm/follow-ups${query}${query ? "&" : "?"}limit=200`),
        api<CrmLead[]>("/crm/leads?limit=200"), api<CrmOpportunity[]>("/crm/opportunities?limit=200"),
      ]);
      setRows(followUps); setLeads(leadRows); setOpportunities(opportunityRows);
    } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : "Takip listesi yüklenemedi."); }
    finally { setLoading(false); }
  }, [filter]);
  useEffect(() => { void load(); }, [load]);

  const subjectLabels = useMemo(() => {
    const labels = new Map<string, string>();
    leads.forEach((lead) => labels.set(`lead:${lead.id}`, `${lead.firstName} ${lead.lastName}`));
    opportunities.forEach((row) => labels.set(`opportunity:${row.id}`, row.title));
    return labels;
  }, [leads, opportunities]);

  async function createFollowUp(event: FormEvent) {
    event.preventDefault(); setError("");
    const user = getStoredUser();
    if (!user || !form.subject || !form.dueAt) { setError("Konu ve takip zamanı gereklidir."); return; }
    const [kind, id] = form.subject.split(":");
    setSaving(true);
    try {
      await api("/crm/follow-ups", { method: "POST", body: { [kind === "lead" ? "leadId" : "opportunityId"]: id, assignedUserId: user.id, channel: form.channel, dueAt: form.dueAt, ...(form.note.trim() ? { note: form.note.trim() } : {}) } });
      setCreateOpen(false); setForm(emptyForm); showToast("Takip görevi oluşturuldu.", "success"); await load();
    } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : "Takip oluşturulamadı."); }
    finally { setSaving(false); }
  }

  async function completeFollowUp(event: FormEvent) {
    event.preventDefault();
    if (!completing || !outcome.trim()) { setError("Görüşme sonucu gereklidir."); return; }
    setSaving(true); setError("");
    try {
      await api(`/crm/follow-ups/${completing.id}/complete`, { method: "POST", body: { outcome: outcome.trim() } });
      setCompleting(null); setOutcome(""); showToast("Takip tamamlandı.", "success"); await load();
    } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : "Takip tamamlanamadı."); }
    finally { setSaving(false); }
  }

  function subjectFor(row: CrmFollowUp) {
    const key = row.leadId ? `lead:${row.leadId}` : `opportunity:${row.opportunityId}`;
    return subjectLabels.get(key) ?? "CRM kaydı";
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Takip Merkezi" description="Arama, mesaj, e-posta ve yüz yüze temas görevlerini zamanında tamamlayın." action={canManage ? <Button onClick={() => { setError(""); setCreateOpen(true); }}>+ Yeni takip</Button> : undefined} />
      {error && !createOpen && !completing ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      <div className="flex flex-wrap gap-2">{(["OPEN", "COMPLETED", "ALL"] as Filter[]).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={filter === item ? "rounded-full bg-[#7358d7] px-4 py-2 text-[11px] font-semibold text-white" : "rounded-full border border-[var(--line)] bg-white px-4 py-2 text-[11px] text-[var(--muted)]"}>{item === "OPEN" ? "Açık" : item === "COMPLETED" ? "Tamamlanan" : "Tümü"}</button>)}</div>
      <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
        {loading ? <Spinner label="Takipler yükleniyor..." /> : rows.length ? <div className="divide-y divide-[var(--line)]">{rows.map((row) => {
          const overdue = row.status === "OPEN" && new Date(row.dueAt).getTime() < now;
          const href = row.leadId ? `/crm/leads/${row.leadId}` : "/crm/pipeline";
          return <article key={row.id} className="grid gap-3 px-5 py-4 md:grid-cols-[120px_minmax(180px,1fr)_minmax(180px,1fr)_170px_auto] md:items-center">
            <span className="w-fit rounded-full bg-[#f1edff] px-2.5 py-1 text-[10px] font-semibold text-[#7052df]">{followUpChannelLabels[row.channel]}</span>
            <Link href={href} className="truncate text-[12px] font-semibold hover:text-[#7052df]">{subjectFor(row)}</Link>
            <p className="truncate text-[11px] text-[var(--muted)]">{row.status === "COMPLETED" ? row.outcome : row.note || "Not eklenmedi"}</p>
            <time className={overdue ? "text-[10px] font-semibold text-[#a14f3b]" : "text-[10px] text-[var(--muted)]"}>{overdue ? "Gecikti · " : ""}{formatDateTime(row.dueAt)}</time>
            {canManage && row.status === "OPEN" ? <Button variant="secondary" className="min-h-8 px-3 py-1 text-[11px]" onClick={() => { setError(""); setOutcome(""); setCompleting(row); }}>Tamamla</Button> : <span className="text-[10px] font-medium text-[#47765b]">{row.status === "COMPLETED" ? "Tamamlandı" : row.status}</span>}
          </article>;
        })}</div> : <EmptyState title="Takip bulunamadı" description="Seçili filtreye ait müşteri teması bulunmuyor." />}
      </section>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Yeni takip görevi" description="Takibi bir lead veya satış fırsatına bağlayın.">
        <form onSubmit={createFollowUp} className="space-y-4">{error ? <Alert>{error}</Alert> : null}
          <Field label="CRM kaydı" required><Select value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })}><option value="">Seçin</option><optgroup label="Lead’ler">{leads.map((lead) => <option key={lead.id} value={`lead:${lead.id}`}>{lead.firstName} {lead.lastName}</option>)}</optgroup><optgroup label="Fırsatlar">{opportunities.map((row) => <option key={row.id} value={`opportunity:${row.id}`}>{row.title}</option>)}</optgroup></Select></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Kanal"><Select value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value as CrmFollowUp["channel"] })}>{Object.entries(followUpChannelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field><Field label="Tarih ve saat" required><TextInput type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} /></Field></div>
          <Field label="Not"><TextArea rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></Field>
          <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={saving}>Vazgeç</Button><Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Takip oluştur"}</Button></div>
        </form>
      </Modal>
      <Modal open={Boolean(completing)} onClose={() => setCompleting(null)} title="Takibi tamamla" description="Görüşme sonucunu CRM geçmişine kaydedin.">
        <form onSubmit={completeFollowUp} className="space-y-4">{error ? <Alert>{error}</Alert> : null}<Field label="Görüşme sonucu" required><TextArea rows={4} value={outcome} onChange={(event) => setOutcome(event.target.value)} /></Field><div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setCompleting(null)} disabled={saving}>Vazgeç</Button><Button type="submit" disabled={saving}>{saving ? "Tamamlanıyor..." : "Tamamla"}</Button></div></form>
      </Modal>
    </div>
  );
}
