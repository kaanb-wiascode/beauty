"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Select,
  Spinner,
  TextArea,
  TextInput,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import { userErrorMessage } from "@/lib/user-language";
import { getStoredUser, hasActiveBranch, hasPermission } from "@/lib/auth";
import {
  followUpChannelLabels,
  type CrmAssignee,
  type CrmFollowUp,
  type CrmLead,
  type CrmOpportunity,
} from "@/lib/crm-types";

type Filter = "OPEN" | "COMPLETED" | "CANCELLED" | "ALL";
type TimeScope = "ALL" | "OVERDUE" | "TODAY" | "NEXT_7_DAYS" | "LATER";
type SortMode = "due" | "newest";
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

function startOfDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function endOfDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

function dueLabel(value: string, now: number) {
  const due = new Date(value).getTime();
  const diff = due - now;
  const absoluteMinutes = Math.max(1, Math.round(Math.abs(diff) / 60000));
  if (diff < 0) {
    if (absoluteMinutes < 60) return `${absoluteMinutes} dk gecikti`;
    const hours = Math.round(absoluteMinutes / 60);
    if (hours < 24) return `${hours} sa gecikti`;
    return `${Math.round(hours / 24)} gün gecikti`;
  }
  if (absoluteMinutes < 60) return `${absoluteMinutes} dk kaldı`;
  const hours = Math.round(absoluteMinutes / 60);
  if (hours < 24) return `${hours} sa kaldı`;
  return `${Math.round(hours / 24)} gün kaldı`;
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
  const [search, setSearch] = useState("");
  const [timeScope, setTimeScope] = useState<TimeScope>("ALL");
  const [mineOnly, setMineOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("due");
  const [selectedFollowUp, setSelectedFollowUp] = useState<CrmFollowUp | null>(null);
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
  const [scheduleNext, setScheduleNext] = useState(false);
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [nextFollowUpChannel, setNextFollowUpChannel] = useState<CrmFollowUp["channel"]>("CALL");
  const [nextFollowUpNote, setNextFollowUpNote] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [followUps, leadRows, opportunityRows, assigneeRows] = await Promise.all([
        api<CrmFollowUp[]>("/crm/follow-ups?limit=200"),
        api<CrmLead[]>("/crm/leads?limit=200"),
        api<CrmOpportunity[]>("/crm/opportunities?limit=200"),
        api<CrmAssignee[]>("/crm/assignees"),
      ]);
      setRows(followUps);
      setLeads(leadRows);
      setOpportunities(opportunityRows);
      setAssignees(assigneeRows);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? userErrorMessage(requestError.message, "Takip listesi yüklenemedi.") : "Takip listesi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const subjectLabels = useMemo(() => {
    const labels = new Map<string, string>();
    leads.forEach((lead) => labels.set(`lead:${lead.id}`, `${lead.firstName} ${lead.lastName}`));
    opportunities.forEach((row) => labels.set(`opportunity:${row.id}`, row.title));
    return labels;
  }, [leads, opportunities]);

  const assigneeNames = useMemo(
    () => new Map(assignees.map((person) => [person.id, `${person.firstName} ${person.lastName}`])),
    [assignees],
  );

  const leadById = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads]);
  const opportunityById = useMemo(() => new Map(opportunities.map((row) => [row.id, row])), [opportunities]);

  const followUpCounts = useMemo(() => {
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const nextWeekEnd = todayEnd + 7 * 86400000;
    const open = rows.filter((row) => row.status === "OPEN");
    return {
      open: open.length,
      overdue: open.filter((row) => new Date(row.dueAt).getTime() < now).length,
      today: open.filter((row) => {
        const due = new Date(row.dueAt).getTime();
        return due >= todayStart && due <= todayEnd;
      }).length,
      next7: open.filter((row) => {
        const due = new Date(row.dueAt).getTime();
        return due > todayEnd && due <= nextWeekEnd;
      }).length,
      completed: rows.filter((row) => row.status === "COMPLETED").length,
    };
  }, [rows, now]);

  const visibleRows = useMemo(() => {
    const currentUserId = getStoredUser()?.id ?? "";
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const nextWeekEnd = todayEnd + 7 * 86400000;
    const query = search.trim().toLocaleLowerCase("tr-TR");

    return rows
      .filter((row) => filter === "ALL" || row.status === filter)
      .filter((row) => !assignedUserId || row.assignedUserId === assignedUserId)
      .filter((row) => !mineOnly || (currentUserId && row.assignedUserId === currentUserId))
      .filter((row) => {
        if (row.status !== "OPEN" || timeScope === "ALL") return true;
        const due = new Date(row.dueAt).getTime();
        if (timeScope === "OVERDUE") return due < now;
        if (timeScope === "TODAY") return due >= todayStart && due <= todayEnd;
        if (timeScope === "NEXT_7_DAYS") return due > todayEnd && due <= nextWeekEnd;
        return due > nextWeekEnd;
      })
      .filter((row) => {
        if (!query) return true;
        const haystack = [
          subjectLabels.get(row.leadId ? `lead:${row.leadId}` : `opportunity:${row.opportunityId}`) ?? "",
          row.note ?? "",
          row.outcome ?? "",
          row.cancellationReason ?? "",
          assigneeNames.get(row.assignedUserId) ?? "",
          followUpChannelLabels[row.channel],
        ].join(" ").toLocaleLowerCase("tr-TR");
        return haystack.includes(query);
      })
      .sort((a, b) => sortMode === "newest"
        ? new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        : new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  }, [rows, filter, assignedUserId, mineOnly, timeScope, search, sortMode, subjectLabels, assigneeNames, now]);

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
        "Takip oluşturmak için önce çalışma kapsamından bir şube seçin.",
      )
    ) {
      return;
    }
    if (!form.assignedUserId || !form.subject || !form.dueAt) {
      setError("Konu, sorumlu ve takip zamanı gereklidir.");
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
      showToast("Takip planlandı.", "success");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? userErrorMessage(requestError.message, "Takip oluşturulamadı.") : "Takip oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function completeFollowUp(event: FormEvent) {
    event.preventDefault();
    if (!completing || !outcome.trim()) {
      setError("Görüşme sonucu gereklidir.");
      return;
    }
    if (scheduleNext && !nextFollowUpAt) {
      setError("Sonraki takip için tarih ve saat seçilmelidir.");
      return;
    }
    if (!requireActiveBranch("Takibi tamamlamak için önce çalışma kapsamından bir şube seçin.")) return;

    setSaving(true);
    setError("");
    try {
      await api(`/crm/follow-ups/${completing.id}/complete`, {
        method: "POST",
        body: { version: completing.version, outcome: outcome.trim() },
      });

      let nextCreated = true;
      if (scheduleNext) {
        try {
          await api("/crm/follow-ups", {
            method: "POST",
            body: {
              ...(completing.leadId ? { leadId: completing.leadId } : { opportunityId: completing.opportunityId }),
              assignedUserId: completing.assignedUserId,
              channel: nextFollowUpChannel,
              dueAt: new Date(nextFollowUpAt).toISOString(),
              ...(nextFollowUpNote.trim() ? { note: nextFollowUpNote.trim() } : {}),
            },
          });
        } catch (nextError) {
          nextCreated = false;
          showToast(
            nextError instanceof ApiError
              ? userErrorMessage(nextError.message, "Takip tamamlandı ancak sonraki takip oluşturulamadı.")
              : "Takip tamamlandı ancak sonraki takip oluşturulamadı.",
            "error",
          );
        }
      }

      setCompleting(null);
      setOutcome("");
      setScheduleNext(false);
      setNextFollowUpAt("");
      setNextFollowUpNote("");
      if (nextCreated) {
        showToast(scheduleNext ? "Takip tamamlandı ve sonraki takip planlandı." : "Takip tamamlandı.", "success");
      }
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? userErrorMessage(requestError.message, "Takip tamamlanamadı.") : "Takip tamamlanamadı.");
    } finally {
      setSaving(false);
    }
  }

  function openReschedule(row: CrmFollowUp) {
    if (
      !requireActiveBranch(
        "Takibi yeniden planlamak için önce çalışma kapsamından bir şube seçin.",
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
      setError("Sorumlu ve yeni takip zamanı gereklidir.");
      return;
    }
    if (
      !requireActiveBranch(
        "Takibi yeniden planlamak için önce çalışma kapsamından bir şube seçin.",
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
      showToast("Takip yeniden planlandı.", "success");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? userErrorMessage(requestError.message, "Takip yeniden planlanamadı.") : "Takip yeniden planlanamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelFollowUp(event: FormEvent) {
    event.preventDefault();
    if (!cancelling || !cancellationReason.trim()) {
      setError("İptal nedeni gereklidir.");
      return;
    }
    if (
      !requireActiveBranch(
        "Takibi iptal etmek için önce çalışma kapsamından bir şube seçin.",
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
      showToast("Takip iptal edildi.", "success");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? userErrorMessage(requestError.message, "Takip iptal edilemedi.") : "Takip iptal edilemedi.");
    } finally {
      setSaving(false);
    }
  }

  function subjectFor(row: CrmFollowUp) {
    const key = row.leadId ? `lead:${row.leadId}` : `opportunity:${row.opportunityId}`;
    return subjectLabels.get(key) ?? "Bağlantılı kayıt";
  }

  function subjectHref(row: CrmFollowUp) {
    return row.leadId ? `/crm/leads/${row.leadId}` : row.opportunityId ? `/crm/opportunities/${row.opportunityId}` : "/crm";
  }

  function subjectKind(row: CrmFollowUp) {
    return row.leadId ? "Potansiyel Müşteri" : "Satış Fırsatı";
  }

  function subjectContext(row: CrmFollowUp) {
    if (row.leadId) {
      const lead = leadById.get(row.leadId);
      return lead?.interestNote || lead?.phone || lead?.email || "Potansiyel müşteri takibi";
    }
    if (row.opportunityId) {
      const opportunity = opportunityById.get(row.opportunityId);
      const person = opportunity
        ? [opportunity.leadFirstName, opportunity.leadLastName].filter(Boolean).join(" ")
          || [opportunity.customerFirstName, opportunity.customerLastName].filter(Boolean).join(" ")
        : "";
      return person || "Satış fırsatı takibi";
    }
    return "Takip kaydı";
  }

  function openComplete(row: CrmFollowUp) {
    if (!requireActiveBranch("Takibi tamamlamak için önce çalışma kapsamından bir şube seçin.")) return;
    setError("");
    setOutcome("");
    setScheduleNext(false);
    setNextFollowUpAt("");
    setNextFollowUpChannel(row.channel);
    setNextFollowUpNote("");
    setCompleting(row);
  }

  function openCancel(row: CrmFollowUp) {
    if (!requireActiveBranch("Takibi iptal etmek için önce çalışma kapsamından bir şube seçin.")) return;
    setError("");
    setCancellationReason("");
    setCancelling(row);
  }

  function renderFollowUp(row: CrmFollowUp) {
    const overdue = row.status === "OPEN" && new Date(row.dueAt).getTime() < now;
    const ownerName = assigneeNames.get(row.assignedUserId) ?? "Sorumlu kullanıcı";
    const lead = row.leadId ? leadById.get(row.leadId) : undefined;
    const detail = row.status === "COMPLETED"
      ? row.outcome || "Sonuç kaydedilmedi"
      : row.status === "CANCELLED"
        ? row.cancellationReason || "İptal nedeni kaydedilmedi"
        : row.note || "Takip notu eklenmedi";

    return (
    <div className="space-y-5">
      <header className="flex flex-col gap-5 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[12px] font-medium text-[var(--muted)]">Müşteri iletişimi ve görev planı</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">Takip Merkezi</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">Kiminle, ne zaman ve hangi kanaldan iletişim kurulacağını planlayın; geciken görevleri görün ve görüşme sonuçlarını müşteri geçmişine kaydedin.</p>
        </div>
        {canManage ? <Button onClick={() => {
          if (!requireActiveBranch("Yeni takip oluşturmak için önce çalışma kapsamından bir şube seçin.")) return;
          setError("");
          setForm({ ...emptyForm, assignedUserId: getStoredUser()?.id ?? "" });
          setCreateOpen(true);
        }}>Yeni Takibi Planla</Button> : null}
      </header>

      {error && !createOpen && !completing && !rescheduling && !cancelling ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Yapılacak Takip", value: followUpCounts.open, detail: "Henüz tamamlanmamış", scope: "ALL" as TimeScope },
          { label: "Geciken", value: followUpCounts.overdue, detail: "Planlanan zamanı geçmiş", scope: "OVERDUE" as TimeScope },
          { label: "Bugün", value: followUpCounts.today, detail: "Bugün yapılması gereken", scope: "TODAY" as TimeScope },
          { label: "Sonraki 7 Gün", value: followUpCounts.next7, detail: "Yaklaşan takipler", scope: "NEXT_7_DAYS" as TimeScope },
          { label: "Tamamlanan", value: followUpCounts.completed, detail: "Sonuç kaydı bulunan", scope: null },
        ].map((card) => <button
          key={card.label}
          type="button"
          onClick={() => {
            if (card.label === "Tamamlanan") {
              setFilter("COMPLETED");
              setTimeScope("ALL");
            } else {
              setFilter("OPEN");
              setTimeScope(card.scope ?? "ALL");
            }
          }}
          className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-[var(--shadow-soft)] transition hover:border-[var(--line-strong)]"
        >
          <span className="text-[10px] font-medium text-[var(--muted)]">{card.label}</span>
          <strong className={card.label==="Geciken"&&Number(card.value)>0?"mt-3 block text-[24px] font-semibold tracking-[-.04em] text-[var(--danger)]":"mt-3 block text-[24px] font-semibold tracking-[-.04em] text-[var(--ink)]"}>{card.value}</strong>
          <span className="mt-2 block text-[8px] text-[var(--muted)]">{card.detail}</span>
        </button>)}
      </section>

      <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-1 rounded-[11px] bg-[var(--surface-2)] p-1">
            {([
              ["OPEN", "Yapılacaklar"],
              ["COMPLETED", "Tamamlananlar"],
              ["CANCELLED", "İptal Edilenler"],
              ["ALL", "Tümü"],
            ] as Array<[Filter,string]>).map(([value,label]) => <button
              key={value}
              type="button"
              onClick={() => {setFilter(value); if(value!=="OPEN")setTimeScope("ALL");}}
              className={filter===value?"rounded-[8px] bg-[var(--surface)] px-3 py-2 text-[9px] font-semibold text-[var(--ink)] shadow-sm":"rounded-[8px] px-3 py-2 text-[9px] font-semibold text-[var(--muted)]"}
            >{label}</button>)}
          </div>

          <div className="flex flex-1 flex-col gap-2 sm:flex-row xl:max-w-[820px]">
            <TextInput value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Müşteri, fırsat, not veya sorumlu ara…" aria-label="Takiplerde ara" />
            <details className="relative shrink-0">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[9px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]">
                Filtreler
                {(assignedUserId||mineOnly||timeScope!=="ALL")?<span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[8px] text-[var(--accent)]">Aktif</span>:null}
                <span className="text-[10px] text-[var(--muted)]">⌄</span>
              </summary>
              <div className="absolute right-0 z-40 mt-2 w-[310px] space-y-2 rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[0_18px_48px_rgba(23,35,28,.14)]">
                <Select value={assignedUserId} onChange={(event)=>{setAssignedUserId(event.target.value);setMineOnly(false)}} aria-label="Sorumluya göre filtrele">
                  <option value="">Tüm sorumlular</option>
                  {assignees.map((person)=><option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}
                </Select>
                <button type="button" onClick={()=>{setMineOnly((value)=>!value);setAssignedUserId("")}} className={mineOnly?"w-full rounded-[10px] border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-left text-[9px] font-semibold text-[var(--accent)]":"w-full rounded-[10px] border border-[var(--line)] px-3 py-2 text-left text-[9px] font-semibold text-[var(--muted)] hover:bg-[var(--surface-2)]"}>Sadece bana atananlar</button>
                {filter==="OPEN"?<Select value={timeScope} onChange={(event)=>setTimeScope(event.target.value as TimeScope)} aria-label="Takip zamanına göre filtrele">
                  <option value="ALL">Tüm zamanlar</option>
                  <option value="OVERDUE">Gecikenler</option>
                  <option value="TODAY">Bugün</option>
                  <option value="NEXT_7_DAYS">Sonraki 7 gün</option>
                  <option value="LATER">Daha sonrası</option>
                </Select>:null}
                <button type="button" onClick={()=>{setAssignedUserId("");setMineOnly(false);setTimeScope("ALL")}} className="w-full rounded-[10px] px-3 py-2 text-left text-[9px] font-semibold text-[var(--muted)] hover:bg-[var(--surface-2)]">Filtreleri Temizle</button>
              </div>
            </details>
            <Select value={sortMode} onChange={(event)=>setSortMode(event.target.value as SortMode)} aria-label="Takipleri sırala" className="sm:max-w-[180px]">
              <option value="due">En Yakın Takip</option>
              <option value="newest">Son Güncellenen</option>
            </Select>
          </div>
        </div>

        {filter==="OPEN"?<div className="flex flex-wrap gap-1.5 border-b border-[var(--line)] px-4 py-3">
          {([
            ["ALL","Tümü"],
            ["OVERDUE","Geciken"],
            ["TODAY","Bugün"],
            ["NEXT_7_DAYS","7 Gün"],
            ["LATER","Daha Sonra"],
          ] as Array<[TimeScope,string]>).map(([value,label])=><button key={value} type="button" onClick={()=>setTimeScope(value)} className={timeScope===value?"rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-[8px] font-semibold text-[var(--accent)]":"rounded-full border border-[var(--line)] px-3 py-1.5 text-[8px] font-medium text-[var(--muted)] hover:bg-[var(--surface-2)]"}>{label}</button>)}
        </div>:null}

        <div className="hidden grid-cols-[minmax(260px,1.15fr)_minmax(220px,1fr)_155px_185px_260px] gap-4 border-b border-[var(--line)] bg-[var(--surface-2)] px-4 py-2.5 text-[8px] font-semibold text-[var(--muted)] xl:grid">
          <span>Müşteri / Satış Fırsatı</span>
          <span>Takip Amacı / Sonuç</span>
          <span>Kanal / Sorumlu</span>
          <span>Planlanan Zaman</span>
          <span className="text-right">İşlemler</span>
        </div>

        {loading ? <div className="p-6"><Spinner label="Takipler yükleniyor..." /></div> : visibleRows.length ? (
          <div>{visibleRows.map((row)=>renderFollowUp(row))}</div>
        ) : <div className="p-6"><EmptyState title="Takip bulunamadı" description={search||assignedUserId||mineOnly||timeScope!=="ALL"?"Seçili arama veya filtrelerle eşleşen takip bulunamadı.":"Bu bölümde henüz takip kaydı bulunmuyor."} action={canManage&&filter==="OPEN"?<Button onClick={()=>{if(!requireActiveBranch("Yeni takip oluşturmak için önce çalışma kapsamından bir şube seçin."))return;setError("");setForm({...emptyForm,assignedUserId:getStoredUser()?.id??""});setCreateOpen(true)}}>İlk Takibi Oluştur</Button>:undefined} /></div>}
      </section>

      {selectedFollowUp ? <div className="fixed inset-0 z-[80] flex justify-end bg-black/20" onClick={()=>setSelectedFollowUp(null)}>
        <aside className="h-full w-full max-w-[430px] overflow-y-auto border-l border-[var(--line)] bg-[var(--surface)] p-5 shadow-[-18px_0_48px_rgba(23,35,28,.16)]" onClick={(event)=>event.stopPropagation()}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="text-[9px] font-semibold text-[var(--accent)]">{subjectKind(selectedFollowUp)}</span>
              <h2 className="mt-1 text-[20px] font-semibold tracking-[-.035em] text-[var(--ink)]">{subjectFor(selectedFollowUp)}</h2>
              <p className="mt-1 text-[10px] text-[var(--muted)]">{subjectContext(selectedFollowUp)}</p>
            </div>
            <button type="button" onClick={()=>setSelectedFollowUp(null)} className="rounded-[9px] border border-[var(--line)] px-2.5 py-1.5 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)]">×</button>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-[13px] bg-[var(--surface-2)] p-3"><span className="text-[8px] text-[var(--muted)]">İletişim Kanalı</span><strong className="mt-1 block text-[11px] text-[var(--ink)]">{followUpChannelLabels[selectedFollowUp.channel]}</strong></div>
            <div className="rounded-[13px] bg-[var(--surface-2)] p-3"><span className="text-[8px] text-[var(--muted)]">Sorumlu</span><strong className="mt-1 block truncate text-[10px] text-[var(--ink)]">{assigneeNames.get(selectedFollowUp.assignedUserId)??"Sorumlu kullanıcı"}</strong></div>
            <div className="col-span-2 rounded-[13px] bg-[var(--surface-2)] p-3"><span className="text-[8px] text-[var(--muted)]">Planlanan Takip</span><strong className="mt-1 block text-[11px] text-[var(--ink)]">{formatDateTime(selectedFollowUp.dueAt)}</strong>{selectedFollowUp.status==="OPEN"?<span className={new Date(selectedFollowUp.dueAt).getTime()<now?"mt-1 block text-[8px] font-semibold text-[var(--danger)]":"mt-1 block text-[8px] text-[var(--muted)]"}>{dueLabel(selectedFollowUp.dueAt,now)}</span>:null}</div>
          </div>

          <div className="mt-5 rounded-[14px] border border-[var(--line)] p-4">
            <h3 className="text-[10px] font-semibold text-[var(--ink)]">{selectedFollowUp.status==="COMPLETED"?"Görüşme Sonucu":selectedFollowUp.status==="CANCELLED"?"İptal Nedeni":"Takip Notu"}</h3>
            <p className="mt-2 whitespace-pre-wrap text-[10px] leading-5 text-[var(--muted)]">{selectedFollowUp.status==="COMPLETED"?selectedFollowUp.outcome||"Sonuç kaydedilmedi":selectedFollowUp.status==="CANCELLED"?selectedFollowUp.cancellationReason||"İptal nedeni kaydedilmedi":selectedFollowUp.note||"Takip notu eklenmedi."}</p>
          </div>

          <div className="mt-6 space-y-2">
            {selectedFollowUp.status==="OPEN"&&canManage?<>
              <Button className="w-full" onClick={()=>{openComplete(selectedFollowUp);setSelectedFollowUp(null)}}>Takibi Tamamla</Button>
              <Button variant="secondary" className="w-full" onClick={()=>{openReschedule(selectedFollowUp);setSelectedFollowUp(null)}}>Yeniden Planla</Button>
            </>:null}
            {selectedFollowUp.leadId&&leadById.get(selectedFollowUp.leadId)?.phone&&selectedFollowUp.status==="OPEN"?<a href={"tel:"+leadById.get(selectedFollowUp.leadId)?.phone} className="flex min-h-10 w-full items-center justify-center rounded-[10px] border border-[var(--line)] text-[10px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]">Telefonla Ara</a>:null}
            <Link href={subjectHref(selectedFollowUp)} className="flex min-h-10 w-full items-center justify-center rounded-[10px] border border-[var(--line)] text-[10px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]">Bağlı Kaydı Aç</Link>
            {selectedFollowUp.status==="OPEN"&&canManage?<button type="button" onClick={()=>{openCancel(selectedFollowUp);setSelectedFollowUp(null)}} className="min-h-10 w-full rounded-[10px] text-[9px] font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)]">Takibi İptal Et</button>:null}
          </div>
        </aside>
      </div> : null}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Yeni Takip Planla" description="Kiminle, ne zaman ve hangi kanaldan iletişim kurulacağını belirleyin.">
        <form onSubmit={createFollowUp} className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <Field label="Kimi veya hangi satış fırsatını takip edeceksiniz?" required>
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
            <Field label="Tarih ve Saat" required><TextInput type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} /></Field>
          </div>
          <Field label="Takip Amacı / Not"><TextArea rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Bu takipte konuşulacak konu veya hatırlanması gereken bilgi…" /></Field>
          <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={saving}>Vazgeç</Button><Button type="submit" disabled={saving}>{saving ? "Planlanıyor..." : "Takibi Planla"}</Button></div>
        </form>
      </Modal>

      <Modal open={Boolean(completing)} onClose={() => setCompleting(null)} title="Takibi Tamamla" description={completing ? subjectFor(completing) : undefined}>
        <form onSubmit={completeFollowUp} className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <Field label="Görüşme Sonucu" required>
            <TextArea rows={4} value={outcome} onChange={(event) => setOutcome(event.target.value)} placeholder="Müşteriyle ne görüşüldü, hangi sonuca varıldı?" />
          </Field>

          <button
            type="button"
            onClick={() => setScheduleNext((value) => !value)}
            className={scheduleNext ? "w-full rounded-[14px] border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-left" : "w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-left hover:border-[var(--line-strong)]"}
          >
            <span className="block text-[10px] font-semibold text-[var(--ink)]">Sonraki takibi de planla</span>
            <span className="mt-1 block text-[9px] leading-4 text-[var(--muted)]">Bu görüşme tamamlanırken aynı müşteri veya satış fırsatı için yeni bir takip oluşturun.</span>
          </button>

          {scheduleNext ? <div className="space-y-4 rounded-[14px] border border-[var(--line)] p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sonraki İletişim Kanalı">
                <Select value={nextFollowUpChannel} onChange={(event) => setNextFollowUpChannel(event.target.value as CrmFollowUp["channel"])}>
                  {Object.entries(followUpChannelLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </Field>
              <Field label="Sonraki Tarih ve Saat" required>
                <TextInput type="datetime-local" value={nextFollowUpAt} onChange={(event) => setNextFollowUpAt(event.target.value)} />
              </Field>
            </div>
            <Field label="Sonraki Takip Notu">
              <TextArea rows={3} value={nextFollowUpNote} onChange={(event) => setNextFollowUpNote(event.target.value)} placeholder="Bir sonraki görüşmede hatırlanması gereken konu…" />
            </Field>
          </div> : null}

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setCompleting(null)} disabled={saving}>Vazgeç</Button>
            <Button type="submit" disabled={saving}>{saving ? "Tamamlanıyor..." : scheduleNext ? "Tamamla ve Sonrakini Planla" : "Takibi Tamamla"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(rescheduling)} onClose={() => setRescheduling(null)} title="Takibi yeniden planla" description="Tarih, iletişim kanalı, sorumlu veya not bilgisini güncelleyin.">
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

      <Modal open={Boolean(cancelling)} onClose={() => setCancelling(null)} title="Takibi iptal et" description="İptal nedeni müşteri ilişkileri işlem geçmişinde saklanacaktır.">
        <form onSubmit={cancelFollowUp} className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <Field label="İptal Nedeni" required><TextArea rows={4} value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} /></Field>
          <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setCancelling(null)} disabled={saving}>Vazgeç</Button><Button variant="danger" type="submit" disabled={saving}>{saving ? "İptal Ediliyor..." : "Takibi İptal Et"}</Button></div>
        </form>
      </Modal>
    </div>
  );
}
