"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { Alert, Button, EmptyState, Field, Select, Spinner, TextArea, TextInput } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { userErrorMessage } from "@/lib/user-language";
import { getStoredUser, hasActiveBranch, hasPermission } from "@/lib/auth";
import { useToast } from "@/components/toast";

type InteractionType = "CALL" | "WHATSAPP" | "SMS" | "EMAIL" | "IN_PERSON" | "VIDEO_CALL" | "OTHER";
type InteractionDirection = "INBOUND" | "OUTBOUND";
type InteractionStatus = "PLANNED" | "COMPLETED" | "CANCELLED";
type InteractionOutcome = "REACHED" | "NOT_REACHED" | "INTERESTED" | "UNDECIDED" | "AWAITING_QUOTE" | "APPOINTMENT_CREATED" | "CALLBACK" | "SALE" | "NOT_INTERESTED" | "OTHER";
type FollowUpChannel = "CALL" | "SMS" | "EMAIL" | "WHATSAPP" | "IN_PERSON" | "OTHER";
type SubjectType = "CUSTOMER" | "LEAD" | "OPPORTUNITY";
type SubjectOption = { type: SubjectType; id: string; label: string; detail: string };
type Assignee = { id: string; firstName: string | null; lastName: string | null; email?: string | null };
type CustomerOption = { id: string; firstName: string; lastName: string };
type LeadOption = { id: string; firstName: string; lastName: string; phone: string | null; email: string | null };
type OpportunityOption = { id: string; title: string; leadFirstName: string | null; leadLastName: string | null; customerFirstName: string | null; customerLastName: string | null };

type Interaction = {
  id: string;
  customerId: string | null;
  leadId: string | null;
  opportunityId: string | null;
  ownerUserId: string;
  ownerFirstName: string | null;
  ownerLastName: string | null;
  subjectLabel: string;
  type: InteractionType;
  direction: InteractionDirection;
  status: InteractionStatus;
  outcomeCode: InteractionOutcome | null;
  result: string | null;
  notes: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  nextAction: string | null;
  nextActionAt: string | null;
};

const typeLabels: Record<InteractionType, string> = {
  CALL: "Telefon",
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  EMAIL: "E-posta",
  IN_PERSON: "Yüz yüze",
  VIDEO_CALL: "Görüntülü görüşme",
  OTHER: "Diğer",
};

const directionLabels: Record<InteractionDirection, string> = {
  INBOUND: "Müşteri bize ulaştı",
  OUTBOUND: "Biz ulaştık",
};

const subjectTypeLabels: Record<SubjectType, string> = {
  CUSTOMER: "Müşteri",
  LEAD: "Potansiyel Müşteri",
  OPPORTUNITY: "Satış Fırsatı",
};

const followUpChannelLabels: Record<FollowUpChannel, string> = {
  CALL: "Telefon",
  SMS: "SMS",
  EMAIL: "E-posta",
  WHATSAPP: "WhatsApp",
  IN_PERSON: "Yüz yüze",
  OTHER: "Diğer",
};

const outcomeLabels: Record<InteractionOutcome, string> = {
  REACHED: "Ulaşıldı",
  NOT_REACHED: "Ulaşılamadı",
  INTERESTED: "İlgileniyor",
  UNDECIDED: "Kararsız",
  AWAITING_QUOTE: "Teklif bekliyor",
  APPOINTMENT_CREATED: "Randevu oluşturuldu",
  CALLBACK: "Tekrar aranacak",
  SALE: "Satışa döndü",
  NOT_INTERESTED: "İlgilenmiyor",
  OTHER: "Diğer",
};

const statusLabels: Record<InteractionStatus, string> = {
  PLANNED: "Planlandı",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal edildi",
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

function formatDuration(seconds: number | null) {
  if (seconds == null) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes} dk ${remainder} sn` : `${remainder} sn`;
}

export default function CrmInteractionsPage() {
  const canManage = hasPermission("crm", "manage");
  const activeBranch = hasActiveBranch();
  const { showToast } = useToast();
  const [rows, setRows] = useState<Interaction[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<SubjectOption[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [type, setType] = useState<InteractionType | "ALL">("ALL");
  const [direction, setDirection] = useState<InteractionDirection | "ALL">("ALL");
  const [status, setStatus] = useState<InteractionStatus | "ALL">("ALL");
  const [outcome, setOutcome] = useState<InteractionOutcome | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [subject, setSubject] = useState<{ leadId?: string; opportunityId?: string; customerId?: string; label?: string }>({});
  const [subjectSearch, setSubjectSearch] = useState("");
  const [subjectKey, setSubjectKey] = useState("");
  const [scheduleNext, setScheduleNext] = useState(false);
  const [followUpChannel, setFollowUpChannel] = useState<FollowUpChannel>("CALL");
  const [followUpAssignedUserId, setFollowUpAssignedUserId] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [form, setForm] = useState({ type: "CALL" as InteractionType, direction: "OUTBOUND" as InteractionDirection, status: "COMPLETED" as InteractionStatus, outcomeCode: "REACHED" as InteractionOutcome, result: "", notes: "", startedAt: "", durationMinutes: "", ownerUserId: "" });

  const load = useCallback(async () => {
    if (!activeBranch) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const canReadCustomers = hasPermission("customers", "read");
      const [interactionRows, leadRows, opportunityRows, customerRows, assigneeRows] = await Promise.all([
        api<Interaction[]>("/crm/interactions?limit=200"),
        api<LeadOption[]>("/crm/leads?limit=200"),
        api<OpportunityOption[]>("/crm/opportunities?limit=200"),
        canReadCustomers
          ? api<{ data: CustomerOption[] }>(withQuery("/customers", { page: 1, limit: 200 }))
          : Promise.resolve({ data: [] as CustomerOption[] }),
        canManage ? api<Assignee[]>("/crm/assignees") : Promise.resolve([] as Assignee[]),
      ]);
      setRows(interactionRows);
      setAssignees(assigneeRows);
      setSubjectOptions([
        ...customerRows.data.map((item) => ({
          type: "CUSTOMER" as const,
          id: item.id,
          label: `${item.firstName} ${item.lastName}`.trim(),
          detail: "Müşteri",
        })),
        ...leadRows.map((item) => ({
          type: "LEAD" as const,
          id: item.id,
          label: `${item.firstName} ${item.lastName}`.trim(),
          detail: [item.phone, item.email].filter(Boolean).join(" · ") || "Potansiyel müşteri",
        })),
        ...opportunityRows.map((item) => ({
          type: "OPPORTUNITY" as const,
          id: item.id,
          label: item.title,
          detail: [item.customerFirstName || item.leadFirstName, item.customerLastName || item.leadLastName].filter(Boolean).join(" ") || "Satış fırsatı",
        })),
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? userErrorMessage(requestError.message, "İletişim geçmişi yüklenemedi.")
          : "İletişim geçmişi yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, [activeBranch, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const leadId = query.get("leadId") || undefined;
    const opportunityId = query.get("opportunityId") || undefined;
    const customerId = query.get("customerId") || undefined;
    const label = query.get("label") || undefined;
    const nextSubject = { leadId, opportunityId, customerId, label };
    setSubject(nextSubject);
    if (leadId) setSubjectKey(`LEAD:${leadId}`);
    else if (opportunityId) setSubjectKey(`OPPORTUNITY:${opportunityId}`);
    else if (customerId) setSubjectKey(`CUSTOMER:${customerId}`);

    if (query.get("new") === "1" && (leadId || opportunityId || customerId)) {
      const currentUserId = getStoredUser()?.id ?? "";
      setForm((current) => ({
        ...current,
        startedAt: new Date().toISOString().slice(0, 16),
        ownerUserId: currentUserId,
      }));
      setFollowUpAssignedUserId(currentUserId);
      setCreateOpen(true);
    }
  }, []);

  async function createInteraction(event: FormEvent) {
    event.preventDefault();
    if (!subject.leadId && !subject.opportunityId && !subject.customerId) {
      setFormError("Görüşmenin bağlı olduğu müşteri, potansiyel müşteri veya satış fırsatını seçin.");
      return;
    }
    if (scheduleNext && !subject.leadId && !subject.opportunityId) {
      setFormError("Takip Merkezi görevi potansiyel müşteri veya satış fırsatı için oluşturulabilir.");
      return;
    }
    if (scheduleNext && (!followUpAt || !followUpAssignedUserId)) {
      setFormError("Sonraki takip için tarih, saat ve sorumlu seçilmelidir.");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      await api("/crm/interactions", {
        method: "POST",
        body: {
          ...subject,
          label: undefined,
          type: form.type,
          direction: form.direction,
          status: form.status,
          outcomeCode: form.status === "CANCELLED" ? undefined : form.outcomeCode,
          ...(form.ownerUserId ? { ownerUserId: form.ownerUserId } : {}),
          ...(form.result.trim() ? { result: form.result.trim() } : {}),
          ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
          ...(form.startedAt ? { startedAt: new Date(form.startedAt).toISOString() } : {}),
          ...(form.durationMinutes ? { durationSeconds: Math.round(Number(form.durationMinutes) * 60) } : {}),
          ...(scheduleNext && followUpNote.trim() ? { nextAction: followUpNote.trim() } : {}),
          ...(scheduleNext && followUpAt ? { nextActionAt: new Date(followUpAt).toISOString() } : {}),
        },
      });

      if (scheduleNext) {
        await api("/crm/follow-ups", {
          method: "POST",
          body: {
            ...(subject.leadId ? { leadId: subject.leadId } : { opportunityId: subject.opportunityId }),
            assignedUserId: followUpAssignedUserId,
            channel: followUpChannel,
            dueAt: new Date(followUpAt).toISOString(),
            ...(followUpNote.trim() ? { note: followUpNote.trim() } : {}),
          },
        });
      }

      setCreateOpen(false);
      setScheduleNext(false);
      setFollowUpAt("");
      setFollowUpNote("");
      setSubjectSearch("");
      setForm({
        type: "CALL",
        direction: "OUTBOUND",
        status: "COMPLETED",
        outcomeCode: "REACHED",
        result: "",
        notes: "",
        startedAt: "",
        durationMinutes: "",
        ownerUserId: "",
      });
      showToast(scheduleNext ? "Görüşme kaydedildi ve sonraki takip planlandı." : "Görüşme kaydedildi.", "success");
      await load();
    } catch (requestError) {
      setFormError(requestError instanceof ApiError ? userErrorMessage(requestError.message, "Görüşme kaydı oluşturulamadı.") : "Görüşme kaydı oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  const filteredSubjectOptions = useMemo(() => {
    const query = subjectSearch.trim().toLocaleLowerCase("tr-TR");
    return query
      ? subjectOptions.filter((item) => `${item.label} ${item.detail} ${subjectTypeLabels[item.type]}`.toLocaleLowerCase("tr-TR").includes(query))
      : subjectOptions;
  }, [subjectOptions, subjectSearch]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    return rows.filter((row) => {
      if (type !== "ALL" && row.type !== type) return false;
      if (direction !== "ALL" && row.direction !== direction) return false;
      if (status !== "ALL" && row.status !== status) return false;
      if (outcome !== "ALL" && row.outcomeCode !== outcome) return false;
      if (!query) return true;
      const ownerName = [row.ownerFirstName, row.ownerLastName].filter(Boolean).join(" ");
      return [
        row.subjectLabel,
        ownerName,
        row.result ?? "",
        row.notes ?? "",
        row.nextAction ?? "",
        row.outcomeCode ? outcomeLabels[row.outcomeCode] : "",
        typeLabels[row.type],
      ].join(" ").toLocaleLowerCase("tr-TR").includes(query);
    });
  }, [rows, type, direction, status, outcome, search]);

  const now = Date.now();
  const todayKey = new Date().toDateString();
  const completed = rows.filter((row) => row.status === "COMPLETED").length;
  const todayCount = rows.filter((row) => new Date(row.startedAt).toDateString() === todayKey).length;
  const reached = rows.filter((row) => ["REACHED", "INTERESTED", "UNDECIDED", "AWAITING_QUOTE", "APPOINTMENT_CREATED", "CALLBACK", "SALE"].includes(row.outcomeCode ?? "")).length;
  const callbacks = rows.filter((row) => row.outcomeCode === "CALLBACK" || (row.nextActionAt && new Date(row.nextActionAt).getTime() >= now)).length;
  const appointments = rows.filter((row) => row.outcomeCode === "APPOINTMENT_CREATED").length;
  const sales = rows.filter((row) => row.outcomeCode === "SALE").length;

  const timelineGroups = useMemo(() => {
    const groups = new Map<string, Interaction[]>();
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    for (const row of visibleRows) {
      const date = new Date(row.startedAt);
      const key = date.toDateString() === today.toDateString()
        ? "Bugün"
        : date.toDateString() === yesterday.toDateString()
          ? "Dün"
          : new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long", year: "numeric" }).format(date);
      const existing = groups.get(key) ?? [];
      existing.push(row);
      groups.set(key, existing);
    }
    return Array.from(groups.entries());
  }, [visibleRows]);


  function selectSubject(value: string) {
    setSubjectKey(value);
    const [kind, id] = value.split(":") as [SubjectType, string];
    const option = subjectOptions.find((item) => item.type === kind && item.id === id);
    if (!kind || !id) {
      setSubject({});
      setScheduleNext(false);
      return;
    }
    setSubject(
      kind === "CUSTOMER"
        ? { customerId: id, label: option?.label }
        : kind === "LEAD"
          ? { leadId: id, label: option?.label }
          : { opportunityId: id, label: option?.label },
    );
    if (kind === "CUSTOMER") setScheduleNext(false);
  }

  function openCreate() {
    if (!activeBranch) {
      showToast("Görüşme kaydetmek için önce çalışma kapsamından bir şube seçin.", "error");
      return;
    }
    const currentUserId = getStoredUser()?.id ?? "";
    setFormError("");
    setSubjectSearch("");
    setScheduleNext(false);
    setFollowUpAt("");
    setFollowUpNote("");
    setFollowUpAssignedUserId(currentUserId);
    setForm({
      type: "CALL",
      direction: "OUTBOUND",
      status: "COMPLETED",
      outcomeCode: "REACHED",
      result: "",
      notes: "",
      startedAt: new Date().toISOString().slice(0, 16),
      durationMinutes: "",
      ownerUserId: currentUserId,
    });
    setCreateOpen(true);
  }

  function interactionHref(row: Interaction) {
    if (row.opportunityId) return "/crm/opportunities/" + row.opportunityId;
    if (row.leadId) return "/crm/leads/" + row.leadId;
    if (row.customerId) return "/customers/" + row.customerId;
    return "/crm";
  }

  function interactionSubjectType(row: Interaction) {
    if (row.opportunityId) return "Satış Fırsatı";
    if (row.leadId) return "Potansiyel Müşteri";
    return "Müşteri";
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-5 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[12px] font-medium text-[var(--muted)]">Müşteri temas geçmişi</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">İletişim Geçmişi</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">Müşteriyle ne konuşulduğunu, görüşmenin nasıl sonuçlandığını ve bundan sonra ne yapılacağını tek yerde kaydedin ve izleyin.</p>
        </div>
        {canManage ? <Button onClick={openCreate}>Yeni Görüşme Kaydet</Button> : null}
      </header>

      {!activeBranch ? <Alert>İletişim geçmişini kullanmak için önce çalışma kapsamından bir şube seçin.</Alert> : null}
      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Bugünkü Görüşmeler", todayCount, "Bugün kaydedilen müşteri temasları"],
          ["Ulaşılan Müşteriler", reached, "Sonuç alınan görüşmeler"],
          ["Tekrar Aranacak", callbacks, "Takip veya geri arama ihtiyacı bulunanlar"],
          ["Randevuya Dönüşen", appointments, "Randevuyla sonuçlanan görüşmeler"],
          ["Satışa Dönüşen", sales, "Satışla sonuçlanan görüşmeler"],
        ].map(([label,value,detail]) => <article key={String(label)} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
          <span className="text-[10px] font-medium text-[var(--muted)]">{label}</span>
          <strong className="mt-3 block text-[24px] font-semibold tracking-[-.04em] text-[var(--ink)]">{value}</strong>
          <span className="mt-2 block text-[8px] text-[var(--muted)]">{detail}</span>
        </article>)}
      </section>

      <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-[12px] font-semibold text-[var(--ink)]">Görüşme Zaman Çizgisi</h2>
            <p className="mt-1 text-[8px] text-[var(--muted)]">{visibleRows.length} iletişim kaydı</p>
          </div>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row xl:max-w-[860px]">
            <TextInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Müşteri, sonuç, not veya sorumlu ara…" aria-label="İletişim geçmişinde ara" />
            <details className="relative shrink-0">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[9px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]">
                Filtreler
                {(type!=="ALL"||direction!=="ALL"||status!=="ALL"||outcome!=="ALL") ? <span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[8px] text-[var(--accent)]">Aktif</span> : null}
                <span className="text-[var(--muted)]">⌄</span>
              </summary>
              <div className="absolute right-0 z-40 mt-2 w-[320px] space-y-2 rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[0_18px_48px_rgba(23,35,28,.14)]">
                <Select value={type} onChange={(event) => setType(event.target.value as InteractionType|"ALL")}>
                  <option value="ALL">Tüm iletişim türleri</option>
                  {Object.entries(typeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
                <Select value={direction} onChange={(event) => setDirection(event.target.value as InteractionDirection|"ALL")}>
                  <option value="ALL">Tüm iletişim yönleri</option>
                  <option value="OUTBOUND">Biz ulaştık</option>
                  <option value="INBOUND">Müşteri bize ulaştı</option>
                </Select>
                <Select value={status} onChange={(event) => setStatus(event.target.value as InteractionStatus|"ALL")}>
                  <option value="ALL">Tüm durumlar</option>
                  <option value="COMPLETED">Tamamlandı</option>
                  <option value="PLANNED">Eski planlı kayıtlar</option>
                  <option value="CANCELLED">İptal edildi</option>
                </Select>
                <Select value={outcome} onChange={(event) => setOutcome(event.target.value as InteractionOutcome|"ALL")}>
                  <option value="ALL">Tüm sonuçlar</option>
                  {Object.entries(outcomeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
                <button type="button" onClick={() => {setType("ALL");setDirection("ALL");setStatus("ALL");setOutcome("ALL")}} className="w-full rounded-[9px] px-3 py-2 text-left text-[9px] font-semibold text-[var(--muted)] hover:bg-[var(--surface-2)]">Filtreleri Temizle</button>
              </div>
            </details>
          </div>
        </div>

        {loading ? <div className="p-6"><Spinner label="İletişim geçmişi yükleniyor..." /></div> : timelineGroups.length ? (
          <div className="p-4 sm:p-5">
            {timelineGroups.map(([group,items]) => <section key={group} className="mb-6 last:mb-0">
              <div className="mb-3 flex items-center gap-3">
                <h3 className="shrink-0 text-[10px] font-semibold text-[var(--muted)]">{group}</h3>
                <span className="h-px flex-1 bg-[var(--line)]" />
              </div>
              <div className="space-y-2.5">
                {items.map((row) => {
                  const ownerName=[row.ownerFirstName,row.ownerLastName].filter(Boolean).join(" ")||"Sorumlu kullanıcı";
                  const resultText=row.outcomeCode?outcomeLabels[row.outcomeCode]:row.result||row.notes||"Görüşme sonucu girilmemiş";
                  return <button key={row.id} type="button" onClick={() => setSelectedInteraction(row)} className="grid w-full gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]/40 lg:grid-cols-[minmax(220px,1.15fr)_150px_160px_minmax(240px,1.2fr)] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-[var(--accent-soft)] px-2 py-1 text-[8px] font-semibold text-[var(--accent)]">{interactionSubjectType(row)}</span>
                        <span className="text-[8px] text-[var(--muted)]">{typeLabels[row.type]}</span>
                      </div>
                      <strong className="mt-2 block truncate text-[12px] text-[var(--ink)]">{row.subjectLabel}</strong>
                      <span className="mt-1 block truncate text-[9px] text-[var(--muted)]">{ownerName}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-semibold text-[var(--ink)]">{directionLabels[row.direction]}</span>
                      <span className="mt-1 block text-[8px] text-[var(--muted)]">{formatDuration(row.durationSeconds)}</span>
                    </div>
                    <div>
                      <span className={row.status==="CANCELLED"?"inline-flex rounded-full bg-[var(--danger-soft)] px-2.5 py-1 text-[8px] font-semibold text-[var(--danger)]":"inline-flex rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[8px] font-semibold text-[var(--accent)]"}>{statusLabels[row.status]}</span>
                      <time className="mt-1.5 block text-[8px] text-[var(--muted)]">{formatDateTime(row.startedAt)}</time>
                    </div>
                    <div className="min-w-0">
                      <strong className="block truncate text-[10px] text-[var(--ink)]">{resultText}</strong>
                      {row.result&&row.outcomeCode?<span className="mt-1 block truncate text-[9px] text-[var(--muted)]">{row.result}</span>:null}
                      {row.nextAction?<span className="mt-1.5 block truncate text-[8px] font-medium text-[var(--warning)]">Sonraki adım: {row.nextAction}{row.nextActionAt?" · "+formatDateTime(row.nextActionAt):""}</span>:null}
                    </div>
                  </button>;
                })}
              </div>
            </section>)}
          </div>
        ) : <div className="p-6"><EmptyState title="İletişim kaydı bulunamadı" description={search||type!=="ALL"||direction!=="ALL"||status!=="ALL"||outcome!=="ALL"?"Arama veya filtrelerle eşleşen iletişim kaydı bulunamadı.":"Henüz müşteri görüşmesi kaydedilmemiş."} action={canManage?<Button onClick={openCreate}>İlk Görüşmeyi Kaydet</Button>:undefined} /></div>}
      </section>

      {selectedInteraction ? <div className="fixed inset-0 z-[80] flex justify-end bg-black/20" onClick={() => setSelectedInteraction(null)}>
        <aside className="h-full w-full max-w-[440px] overflow-y-auto border-l border-[var(--line)] bg-[var(--surface)] p-5 shadow-[-18px_0_48px_rgba(23,35,28,.16)]" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="text-[9px] font-semibold text-[var(--accent)]">{interactionSubjectType(selectedInteraction)}</span>
              <h2 className="mt-1 text-[20px] font-semibold tracking-[-.035em] text-[var(--ink)]">{selectedInteraction.subjectLabel}</h2>
              <p className="mt-1 text-[9px] text-[var(--muted)]">{typeLabels[selectedInteraction.type]} · {directionLabels[selectedInteraction.direction]}</p>
            </div>
            <button type="button" onClick={() => setSelectedInteraction(null)} className="rounded-[9px] border border-[var(--line)] px-2.5 py-1.5 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)]">×</button>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-[13px] bg-[var(--surface-2)] p-3"><span className="text-[8px] text-[var(--muted)]">Sonuç</span><strong className="mt-1 block text-[10px] text-[var(--ink)]">{selectedInteraction.outcomeCode?outcomeLabels[selectedInteraction.outcomeCode]:"Belirtilmedi"}</strong></div>
            <div className="rounded-[13px] bg-[var(--surface-2)] p-3"><span className="text-[8px] text-[var(--muted)]">Süre</span><strong className="mt-1 block text-[10px] text-[var(--ink)]">{formatDuration(selectedInteraction.durationSeconds)}</strong></div>
            <div className="col-span-2 rounded-[13px] bg-[var(--surface-2)] p-3"><span className="text-[8px] text-[var(--muted)]">Görüşme Zamanı</span><strong className="mt-1 block text-[10px] text-[var(--ink)]">{formatDateTime(selectedInteraction.startedAt)}</strong></div>
          </div>

          {selectedInteraction.result||selectedInteraction.notes?<div className="mt-5 rounded-[14px] border border-[var(--line)] p-4">
            <h3 className="text-[10px] font-semibold text-[var(--ink)]">Görüşme Detayı</h3>
            {selectedInteraction.result?<p className="mt-2 text-[10px] leading-5 text-[var(--ink)]">{selectedInteraction.result}</p>:null}
            {selectedInteraction.notes?<p className="mt-2 whitespace-pre-wrap text-[9px] leading-5 text-[var(--muted)]">{selectedInteraction.notes}</p>:null}
          </div>:null}

          {selectedInteraction.nextAction?<div className="mt-4 rounded-[14px] border border-[var(--warning)]/30 bg-[var(--warning-soft)] p-4">
            <span className="text-[8px] font-semibold text-[var(--warning)]">Sonraki Adım</span>
            <strong className="mt-1 block text-[10px] text-[var(--ink)]">{selectedInteraction.nextAction}</strong>
            {selectedInteraction.nextActionAt?<span className="mt-1 block text-[8px] text-[var(--muted)]">{formatDateTime(selectedInteraction.nextActionAt)}</span>:null}
          </div>:null}

          <div className="mt-6">
            <Link href={interactionHref(selectedInteraction)} className="flex min-h-10 w-full items-center justify-center rounded-[10px] border border-[var(--line)] text-[10px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]">Bağlı Kaydı Aç</Link>
          </div>
        </aside>
      </div> : null}

      <Modal open={createOpen} onClose={() => !saving && setCreateOpen(false)} title="Yeni Görüşme Kaydet" description="Müşteriyle yapılan teması, sonucunu ve gerekiyorsa sonraki takibi kaydedin.">
        <form onSubmit={createInteraction} className="space-y-4">
          {formError ? <Alert>{formError}</Alert> : null}

          <Field label="Kiminle görüştünüz?" required>
            <div className="space-y-2">
              <TextInput value={subjectSearch} onChange={(event) => setSubjectSearch(event.target.value)} placeholder="Müşteri, potansiyel müşteri veya satış fırsatı ara…" />
              <Select value={subjectKey} onChange={(event) => selectSubject(event.target.value)}>
                <option value="">Seçin</option>
                {filteredSubjectOptions.map((item) => <option key={item.type+":"+item.id} value={item.type+":"+item.id}>{subjectTypeLabels[item.type]} · {item.label}{item.detail&&item.detail!==item.label?" · "+item.detail:""}</option>)}
              </Select>
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nasıl iletişim kuruldu?" required>
              <Select value={form.type} onChange={(event) => {
                const nextType=event.target.value as InteractionType;
                setForm({...form,type:nextType});
                if (nextType==="CALL"||nextType==="SMS"||nextType==="EMAIL"||nextType==="WHATSAPP"||nextType==="IN_PERSON") setFollowUpChannel(nextType);
                else setFollowUpChannel("OTHER");
              }}>
                {Object.entries(typeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <Field label="İletişimi kim başlattı?" required>
              <Select value={form.direction} onChange={(event) => setForm({...form,direction:event.target.value as InteractionDirection})}>
                <option value="OUTBOUND">Biz ulaştık</option>
                <option value="INBOUND">Müşteri bize ulaştı</option>
              </Select>
            </Field>
            <Field label="Görüşme durumu" required>
              <Select value={form.status} onChange={(event) => setForm({...form,status:event.target.value as InteractionStatus})}>
                <option value="COMPLETED">Gerçekleşti</option>
                <option value="CANCELLED">İptal edildi</option>
              </Select>
            </Field>
            <Field label="Görüşme zamanı">
              <TextInput type="datetime-local" value={form.startedAt} onChange={(event) => setForm({...form,startedAt:event.target.value})} />
            </Field>
            <Field label="Süre (dakika)">
              <TextInput type="number" min="0" step="0.5" value={form.durationMinutes} onChange={(event) => setForm({...form,durationMinutes:event.target.value})} />
            </Field>
            <Field label="Sorumlu">
              <Select value={form.ownerUserId} onChange={(event) => setForm({...form,ownerUserId:event.target.value})}>
                <option value="">Oturum açan kullanıcı</option>
                {assignees.map((person) => <option key={person.id} value={person.id}>{([person.firstName,person.lastName].filter(Boolean).join(" ")||person.email||"Kullanıcı")}</option>)}
              </Select>
            </Field>
          </div>

          {form.status!=="CANCELLED"?<Field label="Görüşmenin sonucu ne oldu?" required>
            <Select value={form.outcomeCode} onChange={(event) => setForm({...form,outcomeCode:event.target.value as InteractionOutcome})}>
              {Object.entries(outcomeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>:null}

          <Field label="Sonuç açıklaması">
            <TextInput value={form.result} onChange={(event) => setForm({...form,result:event.target.value})} placeholder="Örn. Fiyat bilgisini değerlendirecek" />
          </Field>

          <Field label="Ne konuşuldu?">
            <TextArea rows={4} value={form.notes} onChange={(event) => setForm({...form,notes:event.target.value})} placeholder="Müşterinin ihtiyacı, itirazı ve önemli görüşme notları…" />
          </Field>

          <button
            type="button"
            disabled={Boolean(subject.customerId&&!subject.leadId&&!subject.opportunityId)}
            onClick={() => setScheduleNext((value) => !value)}
            className={scheduleNext?"w-full rounded-[14px] border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-left":"w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-left hover:border-[var(--line-strong)] disabled:cursor-not-allowed disabled:opacity-55"}
          >
            <span className="block text-[10px] font-semibold text-[var(--ink)]">Sonraki Takibi Planla</span>
            <span className="mt-1 block text-[8px] leading-4 text-[var(--muted)]">{subject.customerId&&!subject.leadId&&!subject.opportunityId?"Takip Merkezi görevi şu anda potansiyel müşteri veya satış fırsatı kayıtlarında kullanılabilir.":"Görüşmeyi kaydederken Takip Merkezi'ne gerçek bir görev oluşturun."}</span>
          </button>

          {scheduleNext?<div className="space-y-4 rounded-[14px] border border-[var(--line)] p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Takip Kanalı" required>
                <Select value={followUpChannel} onChange={(event) => setFollowUpChannel(event.target.value as FollowUpChannel)}>
                  {Object.entries(followUpChannelLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </Field>
              <Field label="Takip Tarihi ve Saati" required>
                <TextInput type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} />
              </Field>
              <Field label="Takip Sorumlusu" required>
                <Select value={followUpAssignedUserId} onChange={(event) => setFollowUpAssignedUserId(event.target.value)}>
                  <option value="">Sorumlu seçin</option>
                  {assignees.map((person) => <option key={person.id} value={person.id}>{([person.firstName,person.lastName].filter(Boolean).join(" ")||person.email||"Kullanıcı")}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Takip Notu">
              <TextArea rows={3} value={followUpNote} onChange={(event) => setFollowUpNote(event.target.value)} placeholder="Bir sonraki görüşmede yapılacak işlem veya hatırlanması gereken konu…" />
            </Field>
          </div>:null}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)} disabled={saving}>Vazgeç</Button>
            <Button type="submit" disabled={saving||!subjectKey}>{saving?"Kaydediliyor…":scheduleNext?"Kaydet ve Takibi Planla":"Görüşmeyi Kaydet"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
