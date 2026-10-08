"use client";

import Link from "next/link";
import { FormEvent, use, useCallback, useEffect, useState } from "react";
import { CardInfo } from "@/components/card-info";
import { Modal } from "@/components/modal";
import { TeamShareAction } from "@/components/team-share-action";
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
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import { getCardHelp } from "@/lib/card-help";
import {
  followUpChannelLabels,
  leadSourceLabels,
  leadStatusLabels,
  opportunityStageLabels,
  type CrmAssignee,
  type CrmLeadDetail,
  type CrmInteraction,
  type LeadStatus,
} from "@/lib/crm-types";

type AssignmentHistoryRow = {
  id: string;
  ruleId: string | null;
  ruleName: string | null;
  previousOwnerUserId: string | null;
  previousOwnerName: string | null;
  assignedUserId: string;
  assignedUserName: string;
  assignmentMode: string;
  reason: string | null;
  assignedByUserId: string | null;
  assignedByName: string | null;
  createdAt: string;
};

const assignmentModeLabels: Record<string, string> = {
  MANUAL: "Manuel",
  ROUND_ROBIN: "Sırayla dağıtım",
  LOAD_BALANCED: "İş yüküne göre",
  BRANCH_BASED: "Şubeye göre",
  SKILL_BASED: "Yetkinliğe göre",
};

const eventLabels: Record<string, string> = {
  LEAD_CREATED: "Potansiyel Müşteri Oluşturuldu",
  LEAD_UPDATED: "Potansiyel Müşteri Güncellendi",
  LEAD_QUALIFIED: "Satış Fırsatı Oluşturuldu",
  OPPORTUNITY_STAGE_CHANGED: "Satış Fırsatı Aşaması Değişti",
  FOLLOW_UP_CREATED: "Takip Görevi Oluşturuldu",
  FOLLOW_UP_COMPLETED: "Takip Tamamlandı",
  FOLLOW_UP_RESCHEDULED: "Takip Yeniden Planlandı",
  FOLLOW_UP_CANCELLED: "Takip İptal Edildi", INTERACTION_CREATED: "Görüşme Kaydedildi",
};
const interactionTypeLabels: Record<CrmInteraction["type"], string> = {
  CALL: "Telefon",
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  EMAIL: "E-posta",
  IN_PERSON: "Yüz yüze",
  VIDEO_CALL: "Görüntülü görüşme",
  OTHER: "Diğer",
};

const scoreComponentLabels: Record<string, string> = {
  telefon: "Telefon bilgisi",
  eposta: "E-posta bilgisi",
  butce: "Bütçe bilgisi",
  satinAlmaAciliyeti: "Satın alma aciliyeti",
  danismaTalebi: "Danışma talebi",
  musteriNiyeti: "Müşteri niyeti",
  gorusmeler: "Görüşmeler",
  olumluGorusmeler: "Olumlu görüşmeler",
  randevular: "Randevular",
  tamamlananRandevular: "Tamamlanan randevular",
  gelinmeyenRandevular: "Gelinmeyen randevular",
  goruntulenenTeklif: "Görüntülenen teklifler",
  kabulEdilenTeklif: "Kabul edilen teklifler",
  reddedilenTeklif: "Reddedilen teklifler",
  gecikenTakip: "Geciken takipler",
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
  const [assignmentHistory, setAssignmentHistory] = useState<AssignmentHistoryRow[]>([]);
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
      const [leadRow, assigneeRows, assignmentRows] = await Promise.all([
        api<CrmLeadDetail>(`/crm/leads/${id}`),
        api<CrmAssignee[]>("/crm/assignees"),
        api<AssignmentHistoryRow[]>(`/crm/assignment-rules/history/${id}`),
      ]);
      setLead(leadRow);
      setAssignees(assigneeRows);
      setAssignmentHistory(assignmentRows);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Potansiyel Müşteri Detayı Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  function requireActiveBranch(message: string) {
    if (hasActiveBranch()) return true;
    showToast(message, "error");
    return false;
  }

  function openEdit() {
    if (!lead) return;
    if (
      !requireActiveBranch(
        "Potansiyel Müşteri Bilgilerini Düzenlemek İçin Önce Çalışma Kapsamından Bir Şube Seçin.",
      )
    ) {
      return;
    }
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
    if (
      !requireActiveBranch(
        "Potansiyel Müşteri Bilgilerini Güncellemek İçin Önce Çalışma Kapsamından Bir Şube Seçin.",
      )
    ) {
      return;
    }
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
    if (
      !requireActiveBranch(
        "Potansiyel Müşteri Durumunu Güncellemek İçin Önce Çalışma Kapsamından Bir Şube Seçin.",
      )
    ) {
      return;
    }
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

  if (loading) return <Spinner label="Potansiyel müşteri detayı hazırlanıyor..." />;
  if (!lead)
    return (
      <div className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <EmptyState
          title="Potansiyel müşteri bulunamadı"
          description="Kayıt silinmiş veya aktif çalışma kapsamının dışında olabilir."
          action={<Link href="/crm/leads"><Button>Potansiyel müşteri havuzuna dön</Button></Link>}
        />
      </div>
    );

  const activeOpportunity = lead.opportunities[0];
  const owner = assignees.find((person) => person.id === lead.ownerUserId);
  return (
    <div className="space-y-6">
      <Link href="/crm/leads" className="inline-flex text-[11px] font-semibold text-[#1674BD]">← Potansiyel müşteri havuzuna dön</Link>
      <PageHeader
        title={`${lead.firstName} ${lead.lastName}`}
        description={`${leadSourceLabels[lead.source] ?? lead.source} Kaynağından · ${leadStatusLabels[lead.status as LeadStatus]}`}
        action={
          <div className="flex flex-wrap gap-2">
            <TeamShareAction
              payload={{
                kind: "LEAD",
                id: lead.id,
                title: `${lead.firstName} ${lead.lastName}`,
                subtitle: lead.phone ?? lead.email ?? "İletişim bilgisi yok",
                meta: [leadSourceLabels[lead.source] ?? lead.source, leadStatusLabels[lead.status as LeadStatus], lead.interestNote ?? ""].filter(Boolean),
                href: `/crm/leads/${lead.id}`,
              }}
            />
            {canManage ? <Link href={`/crm/interactions?new=1&leadId=${lead.id}&label=${encodeURIComponent(`${lead.firstName} ${lead.lastName}`)}`}><Button variant="secondary">+ Görüşme Kaydet</Button></Link> : null}{canManage ? <Button variant="secondary" onClick={openEdit}>Bilgileri Düzenle</Button> : null}
            {canManage && ["NEW", "CONTACTED"].includes(lead.status) ? (
              <Button variant="secondary" onClick={() => {
                if (
                  !requireActiveBranch(
                    "Potansiyel Müşteri Durumunu Güncellemek İçin Önce Çalışma Kapsamından Bir Şube Seçin.",
                  )
                ) {
                  return;
                }
                setError("");
                setStatus(lead.status === "NEW" ? "CONTACTED" : "LOST");
                setStatusOpen(true);
              }}>Durumu Güncelle</Button>
            ) : null}
          </div>
        }
      />
      {error && !statusOpen && !editOpen ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <div className="space-y-5">
          <section className="rounded-[22px] border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <div className="flex items-start gap-2">
              <CardInfo help={getCardHelp("Potansiyel Müşteri Puanı", "Müşterinin iletişim bilgileri, görüşmeleri, randevuları, teklifleri ve takip davranışları kullanılarak otomatik hesaplanan öncelik puanıdır.")} />
              <div><h2 className="text-[13px] font-semibold">Potansiyel Müşteri Puanı</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Satış ekibinin önceliklendirme desteği</p></div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-[160px_1fr]">
              <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)]/35 p-4">
                <strong className="text-[30px] font-semibold tracking-[-.04em]">{lead.leadScore ?? 0}<span className="text-[13px] font-medium text-[var(--muted)]"> / 100</span></strong>
                <p className="mt-2 text-[11px] font-medium">{lead.leadTemperature === "HOT" ? "Yüksek Öncelik" : lead.leadTemperature === "WARM" ? "Orta Öncelik" : "Düşük Öncelik"}</p>
                {lead.leadScoreUpdatedAt ? <p className="mt-1 text-[9px] text-[var(--muted)]">Son hesaplama: {formatDateTime(lead.leadScoreUpdatedAt)}</p> : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(lead.leadScoreBreakdown ?? {}).filter(([, value]) => value !== 0).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-3 rounded-[13px] border border-[var(--line)] px-3 py-2.5">
                    <span className="text-[10px] text-[var(--muted)]">{scoreComponentLabels[key] ?? key}</span>
                    <strong className={value > 0 ? "text-[11px] text-[var(--accent)]" : "text-[11px] text-[#9c513f]"}>{value > 0 ? "+" : ""}{value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="rounded-[22px] border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <div className="flex items-start gap-2"><CardInfo help={getCardHelp("İletişim ve İhtiyaç", "Potansiyel müşterinin iletişim bilgilerini, kaynağını, sorumlusunu ve ihtiyaç notunu gösterir.")} /><h2 className="text-[13px] font-semibold">İletişim ve İhtiyaç</h2></div>
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
              <p className="mt-2 whitespace-pre-wrap text-[12px] leading-6">{lead.interestNote || "Not eklenmemiş."}</p>
            </div>
          </section>
          {lead.source === "SURVEYOR" ? <section className="rounded-[22px] border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <div className="flex items-start gap-2">
              <CardInfo help={getCardHelp("Kaynak & Anketör", "Potansiyel müşteriyi kazandıran Anketörü ve saha çalışmasına ait kaynak bilgilerini gösterir. Bu bilgiler ileride performans, kota ve hakediş hesaplarında kullanılabilir.")} />
              <div><h2 className="text-[13px] font-semibold">Kaynak & Anketör</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Müşterinin kazanım ve saha kaynağı</p></div>
            </div>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Anketör", [lead.surveyorFirstName, lead.surveyorLastName].filter(Boolean).join(" ") || "Anketör bilgisi bulunmuyor"],
                ["Anket tarihi", lead.surveyDate ? formatDateTime(lead.surveyDate) : "—"],
                ["Çalışma noktası", lead.surveyLocation || "—"],
                ["Masa / nokta", lead.surveyDesk || "—"],
                ["Kampanya / saha çalışması", lead.surveyCampaign || "—"],
                ["Haftalık masa kotası", lead.surveyorWeeklyDeskQuota == null ? "—" : String(lead.surveyorWeeklyDeskQuota)],
              ].map(([label, value]) => <div key={label}>
                <dt className="text-[10px] text-[var(--muted)]">{label}</dt>
                <dd className="mt-1 text-[12px] font-medium">{value}</dd>
              </div>)}
            </dl>
          </section> : null}
          <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
            <header className="flex items-start gap-2 border-b border-[var(--line)] px-5 py-4">
              <CardInfo help={getCardHelp("Sorumlu Atama Geçmişi", "Potansiyel müşterinin hangi kullanıcıya, hangi dağıtım yöntemiyle ve hangi nedenle atandığını kronolojik olarak gösterir.")} />
              <div><h2 className="text-[13px] font-semibold">Sorumlu Atama Geçmişi</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Satış sorumlusu değişiklikleri ve otomatik dağıtım izi</p></div>
            </header>
            {assignmentHistory.length ? <div className="divide-y divide-[var(--line)]">{assignmentHistory.slice(0,8).map((row) => <div key={row.id} className="px-5 py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold">{row.previousOwnerName ? `${row.previousOwnerName} → ${row.assignedUserName}` : row.assignedUserName}</p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">{assignmentModeLabels[row.assignmentMode] ?? "Atama"}{row.ruleName ? ` · Kural: ${row.ruleName}` : ""}</p>
                  {row.reason ? <p className="mt-2 text-[10px] leading-5 text-[var(--muted)]">{row.reason}</p> : null}
                  {row.assignedByName ? <p className="mt-1 text-[9px] text-[var(--muted-soft)]">İşlemi yapan: {row.assignedByName}</p> : null}
                </div>
                <time className="shrink-0 text-[9px] text-[var(--muted-soft)]">{formatDateTime(row.createdAt)}</time>
              </div>
            </div>)}</div> : <EmptyState title="Atama geçmişi bulunmuyor" description="Bu potansiyel müşteri için henüz sorumlu atama geçmişi oluşmamış." />}
          </section>
          <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
            <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
              <div className="flex items-start gap-2"><CardInfo help={getCardHelp("Satış Fırsatı", "Bu potansiyel müşteriden oluşturulan aktif satış fırsatının aşamasını, değerini ve kazanma olasılığını gösterir.")} /><h2 className="text-[13px] font-semibold">Satış Fırsatı</h2></div>
              <Link href="/crm/pipeline" className="text-[10px] font-semibold text-[#1674BD]">Satış Süreci →</Link>
            </header>
            {activeOpportunity ? (
              <div className="grid gap-4 p-5 sm:grid-cols-4">
                <div className="sm:col-span-2"><p className="text-[10px] text-[var(--muted)]">Başlık</p><strong className="mt-1 block text-[14px]">{activeOpportunity.title}</strong></div>
                <div><p className="text-[10px] text-[var(--muted)]">Aşama</p><span className="mt-1 inline-flex rounded-full bg-[#EAF5FB] px-2.5 py-1 text-[10px] font-semibold text-[#1674BD]">{opportunityStageLabels[activeOpportunity.stage]}</span></div>
                <div><p className="text-[10px] text-[var(--muted)]">Değer / Olasılık</p><strong className="mt-1 block text-[12px]">{formatMoney(activeOpportunity.estimatedValue, activeOpportunity.currency)} · %{activeOpportunity.probability}</strong></div>
              </div>
            ) : (
              <EmptyState title="Henüz Satış Fırsatı Yok" description="Potansiyel Müşteri Havuzundaki Nitelendir İşlemiyle Bu Adayı Satış Sürecine Ekleyebilirsiniz." />
            )}
          </section>
          <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
            <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
              <div className="flex items-start gap-2">
                <CardInfo help={getCardHelp("Görüşmeler", "Potansiyel müşteriyle yapılan telefon, WhatsApp, e-posta ve yüz yüze temasları gösterir.")} />
                <div><h2 className="text-[13px] font-semibold">Görüşmeler</h2>
                <p className="mt-1 text-[10px] text-[var(--muted)]">Müşteriyle yapılan temas ve görüşme geçmişi</p></div>
              </div>
              <Link href={`/crm/interactions?leadId=${lead.id}`} className="text-[10px] font-semibold text-[#1674BD]">Tüm Görüşmeler →</Link>
            </header>
            {lead.interactions?.length ? (
              <div className="divide-y divide-[var(--line)]">
                {lead.interactions.slice(0, 6).map((row) => (
                  <div key={row.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[120px_1fr_150px] sm:items-center">
                    <div><p className="text-[10px] font-semibold text-[#1674BD]">{interactionTypeLabels[row.type]}</p><p className="mt-1 text-[9px] text-[var(--muted)]">{row.direction === "INBOUND" ? "Gelen" : "Giden"}</p></div>
                    <div className="min-w-0"><p className="truncate text-[11px]">{row.result || row.notes || "Görüşme sonucu girilmemiş"}</p>{row.nextAction ? <p className="mt-1 truncate text-[9px] text-[var(--muted)]">Sonraki: {row.nextAction}</p> : null}</div>
                    <time className="text-[10px] text-[var(--muted)] sm:text-right">{formatDateTime(row.startedAt)}</time>
                  </div>
                ))}
              </div>
            ) : <EmptyState title="Görüşme Bulunmuyor" description="Bu potansiyel müşteriyle yapılan görüşmeler burada görünür." />}
          </section>
          <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
            <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
              <div className="flex items-start gap-2"><CardInfo help={getCardHelp("Takipler", "Bu potansiyel müşteri için planlanan, tamamlanan veya geciken takip görevlerini gösterir.")} /><h2 className="text-[13px] font-semibold">Takipler</h2></div>
              <Link href="/crm/follow-ups" className="text-[10px] font-semibold text-[#1674BD]">Takip Merkezi →</Link>
            </header>
            {lead.followUps.length ? (
              <div className="divide-y divide-[var(--line)]">
                {lead.followUps.map((row) => (
                  <div key={row.id} className="grid gap-2 px-5 py-3 sm:grid-cols-[120px_1fr_160px] sm:items-center">
                    <span className="text-[10px] font-semibold text-[#1674BD]">{followUpChannelLabels[row.channel]}</span>
                    <p className="truncate text-[11px] text-[var(--muted)]">{row.status === "CANCELLED" ? row.cancellationReason : row.outcome || row.note || "Not Yok"}</p>
                    <time className="text-[10px] text-[var(--muted)] sm:text-right">{formatDateTime(row.dueAt)}</time>
                  </div>
                ))}
              </div>
            ) : <EmptyState title="Takip Bulunmuyor" description="Bu Potansiyel Müşteriye Bağlı Görevler Burada Görünür." />}
          </section>
        </div>
        <section className="h-fit overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
          <header className="border-b border-[var(--line)] px-5 py-4"><div className="flex items-start gap-2"><CardInfo help={getCardHelp("İşlem Geçmişi", "Potansiyel müşteri üzerinde yapılan CRM işlemlerini kronolojik olarak gösterir.")} /><h2 className="text-[13px] font-semibold">İşlem Geçmişi</h2></div></header>
          {lead.events.length ? (
            <ol className="p-5">
              {[...lead.events].reverse().map((row, index) => (
                <li key={row.id} className="relative flex gap-3 pb-6 last:pb-0">
                  <span className="relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#1674BD]" />
                  {index < lead.events.length - 1 ? <span className="absolute left-[4px] top-3 h-full w-px bg-[#dcebf3]" /> : null}
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
