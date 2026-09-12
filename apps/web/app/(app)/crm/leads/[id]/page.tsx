"use client";

import Link from "next/link";
import { FormEvent, use, useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { Alert, Button, EmptyState, Field, PageHeader, Select, Spinner, TextArea } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { followUpChannelLabels, leadSourceLabels, leadStatusLabels, opportunityStageLabels, type CrmLeadDetail, type LeadStatus } from "@/lib/crm-types";

const eventLabels: Record<string, string> = {
  LEAD_CREATED: "Lead oluşturuldu", LEAD_UPDATED: "Lead güncellendi", LEAD_QUALIFIED: "Satış fırsatı oluşturuldu",
  OPPORTUNITY_STAGE_CHANGED: "Fırsat aşaması değişti", FOLLOW_UP_CREATED: "Takip görevi oluşturuldu", FOLLOW_UP_COMPLETED: "Takip tamamlandı",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatMoney(value: string | number | null, currency: string) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

export default function CrmLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const canManage = hasPermission("crm", "manage");
  const { showToast } = useToast();
  const [lead, setLead] = useState<CrmLeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [status, setStatus] = useState<"CONTACTED" | "LOST">("CONTACTED");
  const [lostReason, setLostReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setLead(await api<CrmLeadDetail>(`/crm/leads/${id}`)); }
    catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : "Lead detayı yüklenemedi."); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function updateStatus(event: FormEvent) {
    event.preventDefault();
    if (!lead) return;
    if (status === "LOST" && !lostReason.trim()) { setError("Kaybedilen lead için neden gereklidir."); return; }
    setSaving(true); setError("");
    try {
      await api(`/crm/leads/${lead.id}`, { method: "PATCH", body: { version: lead.version, status, ...(status === "LOST" ? { lostReason: lostReason.trim() } : {}) } });
      setStatusOpen(false); showToast("Lead durumu güncellendi.", "success"); await load();
    } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : "Lead güncellenemedi."); }
    finally { setSaving(false); }
  }

  if (loading) return <Spinner label="Lead detayı hazırlanıyor..." />;
  if (!lead) return <div className="space-y-4">{error ? <Alert>{error}</Alert> : null}<EmptyState title="Lead bulunamadı" description="Kayıt silinmiş veya aktif çalışma kapsamının dışında olabilir." action={<Link href="/crm/leads"><Button>Lead havuzuna dön</Button></Link>} /></div>;

  const activeOpportunity = lead.opportunities[0];
  return (
    <div className="space-y-6">
      <Link href="/crm/leads" className="inline-flex text-[11px] font-semibold text-[#7052df]">← Lead havuzuna dön</Link>
      <PageHeader title={`${lead.firstName} ${lead.lastName}`} description={`${leadSourceLabels[lead.source] ?? lead.source} kaynağından · ${leadStatusLabels[lead.status as LeadStatus]}`} action={canManage && ["NEW", "CONTACTED"].includes(lead.status) ? <Button variant="secondary" onClick={() => { setError(""); setStatus(lead.status === "NEW" ? "CONTACTED" : "LOST"); setStatusOpen(true); }}>Durumu güncelle</Button> : undefined} />
      {error && !statusOpen ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <div className="space-y-5">
          <section className="rounded-[22px] border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <h2 className="text-[13px] font-semibold">İletişim ve ihtiyaç</h2>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              {[["Telefon", lead.phone || "—"], ["E-posta", lead.email || "—"], ["Kaynak", leadSourceLabels[lead.source] ?? lead.source], ["Oluşturulma", formatDateTime(lead.createdAt)]].map(([label, value]) => <div key={label}><dt className="text-[10px] text-[var(--muted)]">{label}</dt><dd className="mt-1 text-[12px] font-medium">{value}</dd></div>)}
            </dl>
            <div className="mt-5 border-t border-[var(--line)] pt-4"><p className="text-[10px] text-[var(--muted)]">İlgi / ihtiyaç notu</p><p className="mt-2 whitespace-pre-wrap text-[12px] leading-6">{lead.interestNote || "Not eklenmemiş."}</p></div>
          </section>
          <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
            <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><h2 className="text-[13px] font-semibold">Satış fırsatı</h2><Link href="/crm/pipeline" className="text-[10px] font-semibold text-[#7052df]">Pipeline →</Link></header>
            {activeOpportunity ? <div className="grid gap-4 p-5 sm:grid-cols-4"><div className="sm:col-span-2"><p className="text-[10px] text-[var(--muted)]">Başlık</p><strong className="mt-1 block text-[14px]">{activeOpportunity.title}</strong></div><div><p className="text-[10px] text-[var(--muted)]">Aşama</p><span className="mt-1 inline-flex rounded-full bg-[#eee9ff] px-2.5 py-1 text-[10px] font-semibold text-[#7052df]">{opportunityStageLabels[activeOpportunity.stage]}</span></div><div><p className="text-[10px] text-[var(--muted)]">Değer / olasılık</p><strong className="mt-1 block text-[12px]">{formatMoney(activeOpportunity.estimatedValue, activeOpportunity.currency)} · %{activeOpportunity.probability}</strong></div></div> : <EmptyState title="Henüz fırsat yok" description="Lead havuzundaki Nitelendir işlemiyle bu adayı pipeline’a ekleyebilirsiniz." />}
          </section>
          <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
            <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><h2 className="text-[13px] font-semibold">Takipler</h2><Link href="/crm/follow-ups" className="text-[10px] font-semibold text-[#7052df]">Takip merkezi →</Link></header>
            {lead.followUps.length ? <div className="divide-y divide-[var(--line)]">{lead.followUps.map((row) => <div key={row.id} className="grid gap-2 px-5 py-3 sm:grid-cols-[120px_1fr_160px] sm:items-center"><span className="text-[10px] font-semibold text-[#7052df]">{followUpChannelLabels[row.channel]}</span><p className="truncate text-[11px] text-[var(--muted)]">{row.outcome || row.note || "Not yok"}</p><time className="text-[10px] text-[var(--muted)] sm:text-right">{formatDateTime(row.dueAt)}</time></div>)}</div> : <EmptyState title="Takip bulunmuyor" description="Bu lead’e bağlı görevler burada görünür." />}
          </section>
        </div>
        <section className="h-fit overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
          <header className="border-b border-[var(--line)] px-5 py-4"><h2 className="text-[13px] font-semibold">Aktivite geçmişi</h2></header>
          {lead.events.length ? <ol className="p-5">{[...lead.events].reverse().map((row, index) => <li key={row.id} className="relative flex gap-3 pb-6 last:pb-0"><span className="relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#8067df]" />{index < lead.events.length - 1 ? <span className="absolute left-[4px] top-3 h-full w-px bg-[#e7e3ef]" /> : null}<div><p className="text-[11px] font-semibold">{eventLabels[row.eventType] ?? row.eventType}</p><time className="mt-1 block text-[9px] text-[var(--muted)]">{formatDateTime(row.createdAt)}</time></div></li>)}</ol> : <EmptyState title="Aktivite yok" description="CRM hareketleri burada denetlenebilir bir geçmiş oluşturur." />}
        </section>
      </div>
      <Modal open={statusOpen} onClose={() => setStatusOpen(false)} title="Lead durumunu güncelle" description="Durum değişikliği CRM aktivite geçmişine kaydedilir.">
        <form onSubmit={updateStatus} className="space-y-4">{error ? <Alert>{error}</Alert> : null}<Field label="Yeni durum"><Select value={status} onChange={(event) => setStatus(event.target.value as "CONTACTED" | "LOST")}><option value="CONTACTED">İletişime geçildi</option><option value="LOST">Kaybedildi</option></Select></Field>{status === "LOST" ? <Field label="Kaybetme nedeni" required><TextArea rows={3} value={lostReason} onChange={(event) => setLostReason(event.target.value)} /></Field> : null}<div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setStatusOpen(false)} disabled={saving}>Vazgeç</Button><Button type="submit" disabled={saving}>{saving ? "Güncelleniyor..." : "Kaydet"}</Button></div></form>
      </Modal>
    </div>
  );
}
