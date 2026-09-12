"use client";

import Link from "next/link";
import { FormEvent, use, useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  PageHeader,
  Select,
  Spinner,
  TextArea,
  TextInput,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import {
  followUpChannelLabels,
  leadSourceLabels,
  leadStatusLabels,
  opportunityStageLabels,
  type CrmAssignee,
  type CrmLeadDetail,
  type LeadStatus,
} from "@/lib/crm-types";

const eventLabels: Record<string, string> = {
  LEAD_CREATED: "Potansiyel Müşteri Oluşturuldu",
  LEAD_UPDATED: "Potansiyel Müşteri Güncellendi",
  LEAD_QUALIFIED: "Satış Fırsatı Oluşturuldu",
  OPPORTUNITY_STAGE_CHANGED: "Satış Fırsatı Aşaması Değişti",
  FOLLOW_UP_CREATED: "Takip Görevi Oluşturuldu",
  FOLLOW_UP_COMPLETED: "Takip Tamamlandı",
  FOLLOW_UP_RESCHEDULED: "Takip Yeniden Planlandı",
  FOLLOW_UP_CANCELLED: "Takip İptal Edildi",
};
const emptyEditForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  source: "MANUAL",
  interestNote: "",
  ownerUserId: "",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMoney(value: string | number | null, currency: string) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

export default function CrmLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const canManage = hasPermission("crm", "manage");
  const { showToast } = useToast();
  const [lead, setLead] = useState<CrmLeadDetail | null>(null);
  const [assignees, setAssignees] = useState<CrmAssignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [status, setStatus] = useState<"CONTACTED" | "LOST">("CONTACTED");
  const [lostReason, setLostReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [leadRow, assigneeRows] = await Promise.all([
        api<CrmLeadDetail>(`/crm/leads/${id}`),
        api<CrmAssignee[]>("/crm/assignees"),
      ]);
      setLead(leadRow);
      setAssignees(assigneeRows);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Potansiyel Müşteri Detayı Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  function openEdit() {
    if (!lead) return;
    setError("");
    setEditForm({
      firstName: lead.firstName,
      lastName: lead.lastName,
      phone: lead.phone ?? "",
      email: lead.email ?? "",
      source: lead.source,
      interestNote: lead.interestNote ?? "",
      ownerUserId: lead.ownerUserId ?? "",
    });
    setEditOpen(true);
  }

  async function updateLead(event: FormEvent) {
    event.preventDefault();
    if (!lead) return;
    if (!editForm.firstName.trim() || !editForm.lastName.trim() || (!editForm.phone.trim() && !editForm.email.trim())) {
      setError("Ad, Soyad Ve En Az Bir İletişim Bilgisi Gereklidir.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api(`/crm/leads/${lead.id}`, {
        method: "PATCH",
        body: {
          version: lead.version,
          firstName: editForm.firstName.trim(),
          lastName: editForm.lastName.trim(),
          phone: editForm.phone.trim() || null,
          email: editForm.email.trim() || null,
          source: editForm.source,
          interestNote: editForm.interestNote.trim() || null,
          ownerUserId: editForm.ownerUserId || null,
        },
      });
      setEditOpen(false);
      showToast("Potansiyel Müşteri Bilgileri Güncellendi.", "success");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Potansiyel Müşteri Güncellenemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(event: FormEvent) {
    event.preventDefault();
    if (!lead) return;
    if (status === "LOST" && !lostReason.trim()) {
      setError("Kaybedilen Potansiyel Müşteri İçin Neden Gereklidir.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api(`/crm/leads/${lead.id}`, {
        method: "PATCH",
        body: {
          version: lead.version,
          status,
          ...(status === "LOST" ? { lostReason: lostReason.trim() } : {}),
        },
      });
      setStatusOpen(false);
      showToast("Potansiyel Müşteri Durumu Güncellendi.", "success");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Potansiyel Müşteri Güncellenemedi.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner label="Potansiyel Müşteri Detayı Hazırlanıyor..." />;
  if (!lead)
    return (
      <div className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <EmptyState
          title="Potansiyel Müşteri Bulunamadı"
          description="Kayıt Silinmiş Veya Aktif Çalışma Kapsamının Dışında Olabilir."
          action={<Link href="/crm/leads"><Button>Potansiyel Müşteri Havuzuna Dön</Button></Link>}
        />
      </div>
    );

  const activeOpportunity = lead.opportunities[0];
  const owner = assignees.find((person) => person.id === lead.ownerUserId);
  return (
    <div className="space-y-6">
      <Link href="/crm/leads" className="inline-flex text-[11px] font-semibold text-[#7052df]">← Potansiyel Müşteri Havuzuna Dön</Link>
      <PageHeader
        title={`${lead.firstName} ${lead.lastName}`}
        description={`${leadSourceLabels[lead.source] ?? lead.source} Kaynağından · ${leadStatusLabels[lead.status as LeadStatus]}`}
        action={canManage ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={openEdit}>Bilgileri Düzenle</Button>
            {["NEW", "CONTACTED"].includes(lead.status) ? (
              <Button variant="secondary" onClick={() => {
                setError("");
                setStatus(lead.status === "NEW" ? "CONTACTED" : "LOST");
                setStatusOpen(true);
              }}>Durumu Güncelle</Button>
            ) : null}
          </div>
        ) : undefined}
      />
      {error && !statusOpen && !editOpen ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <div className="space-y-5">
          <section className="rounded-[22px] border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <h2 className="text-[13px] font-semibold">İletişim Ve İhtiyaç</h2>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ["Telefon", lead.phone || "—"],
                ["E-Posta", lead.email || "—"],
                ["Kaynak", leadSourceLabels[lead.source] ?? lead.source],
                ["Sorumlu", owner ? `${owner.firstName} ${owner.lastName}` : "Atanmamış"],
                ["Oluşturulma", formatDateTime(lead.createdAt)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[10px] text-[var(--muted)]">{label}</dt>
                  <dd className="mt-1 text-[12px] font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 border-t border-[var(--line)] pt-4">
              <p className="text-[10px] text-[var(--muted)]">İlgi / İhtiyaç Notu</p>
              <p className="mt-2 whitespace-pre-wrap text-[12px] leading-6">{lead.interestNote || "Not Eklenmemiş."}</p>
            </div>
          </section>
          <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
            <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
              <h2 className="text-[13px] font-semibold">Satış Fırsatı</h2>
              <Link href="/crm/pipeline" className="text-[10px] font-semibold text-[#7052df]">Satış Süreci →</Link>
            </header>
            {activeOpportunity ? (
              <div className="grid gap-4 p-5 sm:grid-cols-4">
                <div className="sm:col-span-2"><p className="text-[10px] text-[var(--muted)]">Başlık</p><strong className="mt-1 block text-[14px]">{activeOpportunity.title}</strong></div>
                <div><p className="text-[10px] text-[var(--muted)]">Aşama</p><span className="mt-1 inline-flex rounded-full bg-[#eee9ff] px-2.5 py-1 text-[10px] font-semibold text-[#7052df]">{opportunityStageLabels[activeOpportunity.stage]}</span></div>
                <div><p className="text-[10px] text-[var(--muted)]">Değer / Olasılık</p><strong className="mt-1 block text-[12px]">{formatMoney(activeOpportunity.estimatedValue, activeOpportunity.currency)} · %{activeOpportunity.probability}</strong></div>
              </div>
            ) : (
              <EmptyState title="Henüz Satış Fırsatı Yok" description="Potansiyel Müşteri Havuzundaki Nitelendir İşlemiyle Bu Adayı Satış Sürecine Ekleyebilirsiniz." />
            )}
          </section>
          <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
            <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
              <h2 className="text-[13px] font-semibold">Takipler</h2>
              <Link href="/crm/follow-ups" className="text-[10px] font-semibold text-[#7052df]">Takip Merkezi →</Link>
            </header>
            {lead.followUps.length ? (
              <div className="divide-y divide-[var(--line)]">
                {lead.followUps.map((row) => (
                  <div key={row.id} className="grid gap-2 px-5 py-3 sm:grid-cols-[120px_1fr_160px] sm:items-center">
                    <span className="text-[10px] font-semibold text-[#7052df]">{followUpChannelLabels[row.channel]}</span>
                    <p className="truncate text-[11px] text-[var(--muted)]">{row.status === "CANCELLED" ? row.cancellationReason : row.outcome || row.note || "Not Yok"}</p>
                    <time className="text-[10px] text-[var(--muted)] sm:text-right">{formatDateTime(row.dueAt)}</time>
                  </div>
                ))}
              </div>
            ) : <EmptyState title="Takip Bulunmuyor" description="Bu Potansiyel Müşteriye Bağlı Görevler Burada Görünür." />}
          </section>
        </div>
        <section className="h-fit overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
          <header className="border-b border-[var(--line)] px-5 py-4"><h2 className="text-[13px] font-semibold">İşlem Geçmişi</h2></header>
          {lead.events.length ? (
            <ol className="p-5">
              {[...lead.events].reverse().map((row, index) => (
                <li key={row.id} className="relative flex gap-3 pb-6 last:pb-0">
                  <span className="relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#8067df]" />
                  {index < lead.events.length - 1 ? <span className="absolute left-[4px] top-3 h-full w-px bg-[#e7e3ef]" /> : null}
                  <div>
                    <p className="text-[11px] font-semibold">{eventLabels[row.eventType] ?? "Sistem İşlemi"}</p>
                    <time className="mt-1 block text-[9px] text-[var(--muted)]">{formatDateTime(row.createdAt)}</time>
                  </div>
                </li>
              ))}
            </ol>
          ) : <EmptyState title="İşlem Geçmişi Bulunmuyor" description="Müşteri İlişkileri Hareketleri Burada Geçmiş Oluşturur." />}
        </section>
      </div>
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Potansiyel Müşteri Bilgilerini Düzenle" description="İletişim, Kaynak, İhtiyaç Ve Sorumlu Bilgisini Güncelleyin.">
        <form onSubmit={updateLead} className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ad" required><TextInput value={editForm.firstName} onChange={(event) => setEditForm({ ...editForm, firstName: event.target.value })} /></Field>
            <Field label="Soyad" required><TextInput value={editForm.lastName} onChange={(event) => setEditForm({ ...editForm, lastName: event.target.value })} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Telefon"><TextInput value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} /></Field>
            <Field label="E-Posta"><TextInput type="email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kaynak">
              <Select value={editForm.source} onChange={(event) => setEditForm({ ...editForm, source: event.target.value })}>
                {Object.entries(leadSourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Sorumlu">
              <Select value={editForm.ownerUserId} onChange={(event) => setEditForm({ ...editForm, ownerUserId: event.target.value })}>
                <option value="">Atanmamış</option>
                {assignees.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="İlgi / İhtiyaç Notu"><TextArea rows={3} value={editForm.interestNote} onChange={(event) => setEditForm({ ...editForm, interestNote: event.target.value })} /></Field>
          <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setEditOpen(false)} disabled={saving}>Vazgeç</Button><Button type="submit" disabled={saving}>{saving ? "Güncelleniyor..." : "Değişiklikleri Kaydet"}</Button></div>
        </form>
      </Modal>
      <Modal open={statusOpen} onClose={() => setStatusOpen(false)} title="Potansiyel Müşteri Durumunu Güncelle" description="Durum Değişikliği Müşteri İlişkileri İşlem Geçmişine Kaydedilir.">
        <form onSubmit={updateStatus} className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <Field label="Yeni Durum">
            <Select value={status} onChange={(event) => setStatus(event.target.value as "CONTACTED" | "LOST")}>
              <option value="CONTACTED">İletişime Geçildi</option>
              <option value="LOST">Kaybedildi</option>
            </Select>
          </Field>
          {status === "LOST" ? <Field label="Kaybetme Nedeni" required><TextArea rows={3} value={lostReason} onChange={(event) => setLostReason(event.target.value)} /></Field> : null}
          <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setStatusOpen(false)} disabled={saving}>Vazgeç</Button><Button type="submit" disabled={saving}>{saving ? "Güncelleniyor..." : "Kaydet"}</Button></div>
        </form>
      </Modal>
    </div>
  );
}
