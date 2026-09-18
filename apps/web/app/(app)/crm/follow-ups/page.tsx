"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
import { getStoredUser, hasActiveBranch, hasPermission } from "@/lib/auth";
import {
  followUpChannelLabels,
  type CrmAssignee,
  type CrmFollowUp,
  type CrmLead,
  type CrmOpportunity,
} from "@/lib/crm-types";

type Filter = "OPEN" | "COMPLETED" | "CANCELLED" | "ALL";
const emptyForm = {
  subject: "",
  assignedUserId: "",
  channel: "CALL" as CrmFollowUp["channel"],
  dueAt: "",
  note: "",
};
const emptyRescheduleForm = {
  assignedUserId: "",
  channel: "CALL" as CrmFollowUp["channel"],
  dueAt: "",
  note: "",
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

function toDateTimeInput(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function CrmFollowUpsPage() {
  const canManage = hasPermission("crm", "manage");
  const { showToast } = useToast();
  const [rows, setRows] = useState<CrmFollowUp[]>([]);
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [opportunities, setOpportunities] = useState<CrmOpportunity[]>([]);
  const [assignees, setAssignees] = useState<CrmAssignee[]>([]);
  const [filter, setFilter] = useState<Filter>("OPEN");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [completing, setCompleting] = useState<CrmFollowUp | null>(null);
  const [rescheduling, setRescheduling] = useState<CrmFollowUp | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState(emptyRescheduleForm);
  const [cancelling, setCancelling] = useState<CrmFollowUp | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [outcome, setOutcome] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (filter !== "ALL") params.set("status", filter);
      if (assignedUserId) params.set("assignedUserId", assignedUserId);
      const [followUps, leadRows, opportunityRows, assigneeRows] = await Promise.all([
        api<CrmFollowUp[]>(`/crm/follow-ups?${params}`),
        api<CrmLead[]>("/crm/leads?limit=200"),
        api<CrmOpportunity[]>("/crm/opportunities?limit=200"),
        api<CrmAssignee[]>("/crm/assignees"),
      ]);
      setRows(followUps);
      setLeads(leadRows);
      setOpportunities(opportunityRows);
      setAssignees(assigneeRows);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Takip Listesi Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [assignedUserId, filter]);
  useEffect(() => { void load(); }, [load]);

  const subjectLabels = useMemo(() => {
    const labels = new Map<string, string>();
    leads.forEach((lead) => labels.set(`lead:${lead.id}`, `${lead.firstName} ${lead.lastName}`));
    opportunities.forEach((row) => labels.set(`opportunity:${row.id}`, row.title));
    return labels;
  }, [leads, opportunities]);

  function requireActiveBranch(message: string) {
    if (hasActiveBranch()) return true;
    showToast(message, "error");
    return false;
  }

  async function createFollowUp(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (
      !requireActiveBranch(
        "Takip Oluşturmak İçin Önce Çalışma Kapsamından Bir Şube Seçin.",
      )
    ) {
      return;
    }
    if (!form.assignedUserId || !form.subject || !form.dueAt) {
      setError("Konu, Sorumlu Ve Takip Zamanı Gereklidir.");
      return;
    }
    const [kind, id] = form.subject.split(":");
    setSaving(true);
    try {
      await api("/crm/follow-ups", {
        method: "POST",
        body: {
          [kind === "lead" ? "leadId" : "opportunityId"]: id,
          assignedUserId: form.assignedUserId,
          channel: form.channel,
          dueAt: new Date(form.dueAt).toISOString(),
          ...(form.note.trim() ? { note: form.note.trim() } : {}),
        },
      });
      setCreateOpen(false);
      setForm(emptyForm);
      showToast("Takip Görevi Oluşturuldu.", "success");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Takip Oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function completeFollowUp(event: FormEvent) {
    event.preventDefault();
    if (!completing || !outcome.trim()) {
      setError("Görüşme Sonucu Gereklidir.");
      return;
    }
    if (
      !requireActiveBranch(
        "Takibi Tamamlamak İçin Önce Çalışma Kapsamından Bir Şube Seçin.",
      )
    ) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api(`/crm/follow-ups/${completing.id}/complete`, {
        method: "POST",
        body: { version: completing.version, outcome: outcome.trim() },
      });
      setCompleting(null);
      setOutcome("");
      showToast("Takip Tamamlandı.", "success");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Takip Tamamlanamadı.");
    } finally {
      setSaving(false);
    }
  }

  function openReschedule(row: CrmFollowUp) {
    if (
      !requireActiveBranch(
        "Takibi Yeniden Planlamak İçin Önce Çalışma Kapsamından Bir Şube Seçin.",
      )
    ) {
      return;
    }
    setError("");
    setRescheduleForm({
      assignedUserId: row.assignedUserId,
      channel: row.channel,
      dueAt: toDateTimeInput(row.dueAt),
      note: row.note ?? "",
    });
    setRescheduling(row);
  }

  async function rescheduleFollowUp(event: FormEvent) {
    event.preventDefault();
    if (!rescheduling || !rescheduleForm.assignedUserId || !rescheduleForm.dueAt) {
      setError("Sorumlu Ve Yeni Takip Zamanı Gereklidir.");
      return;
    }
    if (
      !requireActiveBranch(
        "Takibi Yeniden Planlamak İçin Önce Çalışma Kapsamından Bir Şube Seçin.",
      )
    ) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api(`/crm/follow-ups/${rescheduling.id}/reschedule`, {
        method: "POST",
        body: {
          version: rescheduling.version,
          assignedUserId: rescheduleForm.assignedUserId,
          channel: rescheduleForm.channel,
          dueAt: new Date(rescheduleForm.dueAt).toISOString(),
          note: rescheduleForm.note.trim() || null,
        },
      });
      setRescheduling(null);
      showToast("Takip Yeniden Planlandı.", "success");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Takip Yeniden Planlanamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelFollowUp(event: FormEvent) {
    event.preventDefault();
    if (!cancelling || !cancellationReason.trim()) {
      setError("İptal Nedeni Gereklidir.");
      return;
    }
    if (
      !requireActiveBranch(
        "Takibi İptal Etmek İçin Önce Çalışma Kapsamından Bir Şube Seçin.",
      )
    ) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api(`/crm/follow-ups/${cancelling.id}/cancel`, {
        method: "POST",
        body: { version: cancelling.version, reason: cancellationReason.trim() },
      });
      setCancelling(null);
      setCancellationReason("");
      showToast("Takip İptal Edildi.", "success");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Takip İptal Edilemedi.");
    } finally {
      setSaving(false);
    }
  }

  function subjectFor(row: CrmFollowUp) {
    const key = row.leadId ? `lead:${row.leadId}` : `opportunity:${row.opportunityId}`;
    return subjectLabels.get(key) ?? "Müşteri İlişkileri Kaydı";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Takip Merkezi"
        description="Arama, Mesaj, E-Posta Ve Yüz Yüze Temas Görevlerini Zamanında Tamamlayın."
        action={canManage ? (
          <Button onClick={() => {
            if (
              !requireActiveBranch(
                "Yeni Takip Oluşturmak İçin Önce Çalışma Kapsamından Bir Şube Seçin.",
              )
            ) {
              return;
            }
            setError("");
            setForm({ ...emptyForm, assignedUserId: getStoredUser()?.id ?? "" });
            setCreateOpen(true);
          }}>+ Yeni Takip</Button>
        ) : undefined}
      />
      {error && !createOpen && !completing && !rescheduling && !cancelling ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(["OPEN", "COMPLETED", "CANCELLED", "ALL"] as Filter[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={filter === item ? "rounded-full bg-[#1674BD] px-4 py-2 text-[11px] font-semibold text-white" : "rounded-full border border-[var(--line)] bg-white px-4 py-2 text-[11px] text-[var(--muted)]"}
            >
              {item === "OPEN" ? "Açık" : item === "COMPLETED" ? "Tamamlanan" : item === "CANCELLED" ? "İptal Edilen" : "Tümü"}
            </button>
          ))}
        </div>
        <Select value={assignedUserId} onChange={(event) => setAssignedUserId(event.target.value)} aria-label="Sorumluya Göre Filtrele" className="sm:max-w-[230px]">
          <option value="">Tüm Sorumlular</option>
          {assignees.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}
        </Select>
      </div>
      <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
        {loading ? (
          <Spinner label="Takipler Yükleniyor..." />
        ) : rows.length ? (
          <div className="divide-y divide-[var(--line)]">
            {rows.map((row) => {
              const overdue = row.status === "OPEN" && new Date(row.dueAt).getTime() < now;
              const href = row.leadId ? `/crm/leads/${row.leadId}` : "/crm/pipeline";
              return (
                <article key={row.id} className="grid gap-3 px-5 py-4 md:grid-cols-[120px_minmax(180px,1fr)_minmax(180px,1fr)_170px_auto] md:items-center">
                  <span className="w-fit rounded-full bg-[#EAF5FB] px-2.5 py-1 text-[10px] font-semibold text-[#1674BD]">{followUpChannelLabels[row.channel]}</span>
                  <Link href={href} className="truncate text-[12px] font-semibold hover:text-[#1674BD]">{subjectFor(row)}</Link>
                  <p className="truncate text-[11px] text-[var(--muted)]">
                    {row.status === "COMPLETED" ? row.outcome : row.status === "CANCELLED" ? row.cancellationReason : row.note || "Not Eklenmedi"}
                  </p>
                  <time className={overdue ? "text-[10px] font-semibold text-[#a14f3b]" : "text-[10px] text-[var(--muted)]"}>
                    {overdue ? "Gecikti · " : ""}{formatDateTime(row.dueAt)}
                  </time>
                  {canManage && row.status === "OPEN" ? (
                    <div className="flex flex-wrap gap-1.5">
                      <Button variant="secondary" className="min-h-8 px-3 py-1 text-[11px]" onClick={() => {
                        if (!requireActiveBranch("Takibi Tamamlamak İçin Önce Çalışma Kapsamından Bir Şube Seçin.")) return;
                        setError("");
                        setOutcome("");
                        setCompleting(row);
                      }}>Tamamla</Button>
                      <Button variant="ghost" className="min-h-8 px-2 py-1 text-[11px]" onClick={() => openReschedule(row)}>Ertele</Button>
                      <Button variant="danger" className="min-h-8 px-2 py-1 text-[11px]" onClick={() => {
                        if (!requireActiveBranch("Takibi İptal Etmek İçin Önce Çalışma Kapsamından Bir Şube Seçin.")) return;
                        setError("");
                        setCancellationReason("");
                        setCancelling(row);
                      }}>İptal Et</Button>
                    </div>
                  ) : (
                    <span className={row.status === "CANCELLED" ? "text-[10px] font-medium text-[#9c513f]" : "text-[10px] font-medium text-[#47765b]"}>
                      {row.status === "COMPLETED" ? "Tamamlandı" : row.status === "CANCELLED" ? "İptal Edildi" : "Açık"}
                    </span>
                  )}
                </article>
              );
            })}
          </div>
        ) : <EmptyState title="Takip Bulunamadı" description="Seçili Filtreye Ait Müşteri Teması Bulunmuyor." />}
      </section>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Yeni Takip Görevi" description="Takibi Bir Potansiyel Müşteriye Veya Satış Fırsatına Bağlayın.">
        <form onSubmit={createFollowUp} className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <Field label="Müşteri İlişkileri Kaydı" required>
            <Select value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })}>
              <option value="">Seçin</option>
              <optgroup label="Potansiyel Müşteriler">
                {leads.map((lead) => <option key={lead.id} value={`lead:${lead.id}`}>{lead.firstName} {lead.lastName}</option>)}
              </optgroup>
              <optgroup label="Satış Fırsatları">
                {opportunities.map((row) => <option key={row.id} value={`opportunity:${row.id}`}>{row.title}</option>)}
              </optgroup>
            </Select>
          </Field>
          <Field label="Sorumlu" required>
            <Select value={form.assignedUserId} onChange={(event) => setForm({ ...form, assignedUserId: event.target.value })}>
              <option value="">Seçin</option>
              {assignees.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="İletişim Kanalı">
              <Select value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value as CrmFollowUp["channel"] })}>
                {Object.entries(followUpChannelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Tarih Ve Saat" required><TextInput type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} /></Field>
          </div>
          <Field label="Not"><TextArea rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></Field>
          <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={saving}>Vazgeç</Button><Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Takip Oluştur"}</Button></div>
        </form>
      </Modal>

      <Modal open={Boolean(completing)} onClose={() => setCompleting(null)} title="Takibi Tamamla" description="Görüşme Sonucunu Müşteri İlişkileri Geçmişine Kaydedin.">
        <form onSubmit={completeFollowUp} className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <Field label="Görüşme Sonucu" required><TextArea rows={4} value={outcome} onChange={(event) => setOutcome(event.target.value)} /></Field>
          <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setCompleting(null)} disabled={saving}>Vazgeç</Button><Button type="submit" disabled={saving}>{saving ? "Tamamlanıyor..." : "Tamamla"}</Button></div>
        </form>
      </Modal>

      <Modal open={Boolean(rescheduling)} onClose={() => setRescheduling(null)} title="Takibi Yeniden Planla" description="Tarih, İletişim Kanalı, Sorumlu Veya Not Bilgisini Güncelleyin.">
        <form onSubmit={rescheduleFollowUp} className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <Field label="Sorumlu" required>
            <Select value={rescheduleForm.assignedUserId} onChange={(event) => setRescheduleForm({ ...rescheduleForm, assignedUserId: event.target.value })}>
              {assignees.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="İletişim Kanalı">
              <Select value={rescheduleForm.channel} onChange={(event) => setRescheduleForm({ ...rescheduleForm, channel: event.target.value as CrmFollowUp["channel"] })}>
                {Object.entries(followUpChannelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Yeni Tarih Ve Saat" required><TextInput type="datetime-local" value={rescheduleForm.dueAt} onChange={(event) => setRescheduleForm({ ...rescheduleForm, dueAt: event.target.value })} /></Field>
          </div>
          <Field label="Not"><TextArea rows={3} value={rescheduleForm.note} onChange={(event) => setRescheduleForm({ ...rescheduleForm, note: event.target.value })} /></Field>
          <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setRescheduling(null)} disabled={saving}>Vazgeç</Button><Button type="submit" disabled={saving}>{saving ? "Planlanıyor..." : "Yeniden Planla"}</Button></div>
        </form>
      </Modal>

      <Modal open={Boolean(cancelling)} onClose={() => setCancelling(null)} title="Takibi İptal Et" description="İptal Nedeni Müşteri İlişkileri İşlem Geçmişinde Saklanacaktır.">
        <form onSubmit={cancelFollowUp} className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <Field label="İptal Nedeni" required><TextArea rows={4} value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} /></Field>
          <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setCancelling(null)} disabled={saving}>Vazgeç</Button><Button variant="danger" type="submit" disabled={saving}>{saving ? "İptal Ediliyor..." : "Takibi İptal Et"}</Button></div>
        </form>
      </Modal>
    </div>
  );
}
