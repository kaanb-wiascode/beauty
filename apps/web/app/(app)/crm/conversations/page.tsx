"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, EmptyState, Field, Select, Spinner, TextArea, TextInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import { userErrorMessage, userLabel } from "@/lib/user-language";
import { ConversationContextPanel } from "./conversation-context-panel";
import { Modal } from "@/components/modal";

type SubjectType = "CUSTOMER" | "LEAD" | "OPPORTUNITY";
type TeamMode = "ALL" | "MINE" | "UNASSIGNED";
type ConversationStatus = "OPEN" | "PENDING" | "RESOLVED" | "SNOOZED" | "CLOSED";
type StatusFilter = "ACTIVE" | ConversationStatus;
type ConversationPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
type PriorityFilter = "ALL" | ConversationPriority;
type Channel = "EMAIL" | "SMS" | "WHATSAPP";
type ChannelFilter = "ALL" | Channel;
type Thread = { subjectType: SubjectType; subjectId: string; subjectLabel: string; messageCount: number; inboundCount: number; outboundCount: number; channels: Channel[]; lastMessageAt: string; lastInboundAt: string | null; lastOutboundAt: string | null; lastDirection: "INBOUND" | "OUTBOUND"; lastChannel: Channel; lastStatus: string; lastBody: string; lastSubject: string | null; lastRecipient: string; unreadCount: number; awaitingResponse: boolean; responseAgeMinutes: number; assignmentId: string | null; assignedUserId: string | null; assignedUserName: string | null; assignmentVersion: number | null; conversationStatus: ConversationStatus; conversationPriority: ConversationPriority; snoozedUntil: string | null; resolvedAt: string | null; closedAt: string | null; stateVersion: number };
type Message = { id: string; direction: "INBOUND" | "OUTBOUND"; channel: Channel; status: string; providerKey: string | null; recipient: string; subject: string | null; body: string; errorMessage: string | null; sentAt: string | null; deliveredAt: string | null; createdAt: string; version?: number };
type Detail = { subjectType: SubjectType; subjectId: string; messages: Message[] };
type Assignee = { id: string; firstName?: string | null; lastName?: string | null; email?: string | null };
type AssignmentResult = { assignedUserId: string | null; version: number };
type StateResult = { status: ConversationStatus; priority: ConversationPriority; snoozedUntil: string | null; resolvedAt: string | null; closedAt: string | null; version: number };
type ProviderStatus = { providers: Array<{ key: string; channels: Channel[]; webhookReady: boolean; challengeReady: boolean }>; supportedChannels: Channel[]; registeredChannels: Channel[] };
type ComposeCustomer = { id: string; firstName: string; lastName: string };
type ComposeLead = { id: string; firstName: string; lastName: string; phone: string | null; email: string | null };
type ComposeOpportunity = { id: string; title: string; leadFirstName: string | null; leadLastName: string | null; customerFirstName: string | null; customerLastName: string | null };
type ComposeSubject = { type: SubjectType; id: string; label: string; detail: string };

const channelLabel = { EMAIL: "E-posta", SMS: "SMS", WHATSAPP: "WhatsApp" } as const;
const subjectLabel = { CUSTOMER: "Müşteri", LEAD: "Potansiyel Müşteri", OPPORTUNITY: "Satış Fırsatı" } as const;
const statusLabel = { OPEN: "Açık", PENDING: "Beklemede", RESOLVED: "Çözüldü", SNOOZED: "Ertelendi", CLOSED: "Kapalı" } as const;
const priorityLabel = { LOW: "Düşük", NORMAL: "Normal", HIGH: "Yüksek", URGENT: "Acil" } as const;
function formatDate(value: string) { return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function waitLabel(minutes: number) { if (minutes < 60) return `${minutes} dk`; if (minutes < 1440) return `${Math.floor(minutes / 60)} sa`; return `${Math.floor(minutes / 1440)} gün`; }
function hrefFor(thread: Thread) { if (thread.subjectType === "CUSTOMER") return `/customers/${thread.subjectId}`; if (thread.subjectType === "LEAD") return `/crm/leads/${thread.subjectId}`; return `/crm/opportunities/${thread.subjectId}`; }
function assigneeName(item: Assignee) { const name = `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim(); return name || item.email || "Kullanıcı"; }
function subjectPayload(thread: Thread) { return thread.subjectType === "CUSTOMER" ? { customerId: thread.subjectId } : thread.subjectType === "LEAD" ? { leadId: thread.subjectId } : { opportunityId: thread.subjectId }; }
function smsSegments(body: string) { if (!body) return 0; const gsm7 = /^[\x20-\x7E\n\r]*$/.test(body); const single = gsm7 ? 160 : 70; const multipart = gsm7 ? 153 : 67; return body.length <= single ? 1 : Math.ceil(body.length / multipart); }
function isoAfterMinutes(minutes: number) { const value = new Date(); value.setMinutes(value.getMinutes() + minutes); return value.toISOString(); }
function messageIdempotencyKey(thread: Thread) { return `inbox:${thread.subjectType}:${thread.subjectId}:${crypto.randomUUID()}`; }

export default function CrmConversationsPage() {
  const canRead = hasPermission("crm", "read"); const canManage = hasPermission("crm", "manage"); const activeBranch = hasActiveBranch(); const { showToast } = useToast();
  const [threads, setThreads] = useState<Thread[]>([]); const [assignees, setAssignees] = useState<Assignee[]>([]); const [selected, setSelected] = useState<Thread | null>(null); const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true); const [detailLoading, setDetailLoading] = useState(false); const [mutating, setMutating] = useState(false); const [error, setError] = useState("");
  const [filter, setFilter] = useState<"ALL" | "UNREAD" | "AWAITING">("ALL"); const [teamMode, setTeamMode] = useState<TeamMode>("ALL"); const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE"); const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL"); const [channelFilter, setChannelFilter] = useState<ChannelFilter>("ALL");
  const [providers, setProviders] = useState<ProviderStatus | null>(null); const [replyChannel, setReplyChannel] = useState<Channel>("WHATSAPP"); const [replySubject, setReplySubject] = useState(""); const [replyBody, setReplyBody] = useState(""); const [sending, setSending] = useState(false);
  const [threadSearch, setThreadSearch] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeLoading, setComposeLoading] = useState(false);
  const [composeSubjects, setComposeSubjects] = useState<ComposeSubject[]>([]);
  const [composeSubjectKey, setComposeSubjectKey] = useState("");
  const [composeSearch, setComposeSearch] = useState("");
  const [composeChannel, setComposeChannel] = useState<Channel>("WHATSAPP");
  const [composeEmailSubject, setComposeEmailSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeSending, setComposeSending] = useState(false);

  const load = useCallback(async () => { if (!canRead || !activeBranch) { setLoading(false); return; } setLoading(true); setError(""); try { const params = new URLSearchParams({ limit: "150", mode: teamMode, status: statusFilter, priority: priorityFilter, channel: channelFilter }); const [rows, people, providerRows] = await Promise.all([api<Thread[]>(`/crm/conversations?${params.toString()}`), canManage ? api<Assignee[]>("/crm/assignees") : Promise.resolve([]), api<ProviderStatus>("/crm/messages/providers")]); setThreads(rows); setAssignees(people); setProviders(providerRows); setSelected((current) => current ? rows.find((row) => row.subjectType === current.subjectType && row.subjectId === current.subjectId) ?? null : null); } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : "Konuşmalar yüklenemedi."); } finally { setLoading(false); } }, [activeBranch, canManage, canRead, channelFilter, priorityFilter, statusFilter, teamMode]);
  useEffect(() => { void load(); }, [load]);

  async function openThread(thread: Thread) { setSelected(thread); const registered = providers?.registeredChannels ?? []; setReplyChannel(registered.includes(thread.lastChannel) ? thread.lastChannel : registered[0] ?? thread.lastChannel); setReplySubject(thread.lastSubject ?? ""); setReplyBody(""); setDetailLoading(true); setError(""); try { const result = await api<Detail>(`/crm/conversations/${thread.subjectType}/${thread.subjectId}?limit=300`); setDetail(result); setThreads((current) => current.map((item) => item.subjectType === thread.subjectType && item.subjectId === thread.subjectId ? { ...item, unreadCount: 0 } : item)); } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : "Konuşma açılamadı."); } finally { setDetailLoading(false); } }
  async function setAssignment(userId: string) { if (!selected || !canManage || mutating) return; setMutating(true); setError(""); try { const result = await api<AssignmentResult>(`/crm/conversation-operations/assignments/${selected.subjectType}/${selected.subjectId}`, { method: "PATCH", body: { assignedUserId: userId || null, version: selected.assignmentVersion ?? 0 } }); const person = assignees.find((item) => item.id === result.assignedUserId); const patch = { assignedUserId: result.assignedUserId, assignedUserName: person ? assigneeName(person) : null, assignmentVersion: result.version || null, assignmentId: result.assignedUserId ? selected.assignmentId ?? "assigned" : null }; setSelected((current) => current ? { ...current, ...patch } : current); setThreads((current) => current.map((item) => item.subjectType === selected.subjectType && item.subjectId === selected.subjectId ? { ...item, ...patch } : item)); showToast(result.assignedUserId ? "Konuşma ataması güncellendi." : "Konuşma ataması kaldırıldı."); if ((teamMode === "MINE" || teamMode === "UNASSIGNED") && result.assignedUserId !== selected.assignedUserId) await load(); } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : "Konuşma ataması güncellenemedi."); } finally { setMutating(false); } }
  async function setState(status: ConversationStatus, priority = selected?.conversationPriority ?? "NORMAL", snoozeMinutes?: number) { if (!selected || !canManage || mutating) return; setMutating(true); setError(""); try { const snoozedUntil = status === "SNOOZED" ? snoozeMinutes ? isoAfterMinutes(snoozeMinutes) : selected.snoozedUntil : null; const result = await api<StateResult>(`/crm/conversation-operations/states/${selected.subjectType}/${selected.subjectId}`, { method: "PATCH", body: { status, priority, snoozedUntil, version: selected.stateVersion ?? 0 } }); const patch = { conversationStatus: result.status, conversationPriority: result.priority, snoozedUntil: result.snoozedUntil, resolvedAt: result.resolvedAt, closedAt: result.closedAt, stateVersion: result.version }; setSelected((current) => current ? { ...current, ...patch } : current); setThreads((current) => current.map((item) => item.subjectType === selected.subjectType && item.subjectId === selected.subjectId ? { ...item, ...patch } : item)); showToast(status === "PENDING" ? "Konuşma beklemeye alındı." : status === "RESOLVED" ? "Konuşma çözüldü." : status === "CLOSED" ? "Konuşma kapatıldı." : status === "SNOOZED" ? "Konuşma ertelendi." : "Konuşma yeniden açıldı."); if (statusFilter !== "ACTIVE" || status === "RESOLVED" || status === "CLOSED" || status === "SNOOZED") { setSelected(null); setDetail(null); await load(); } } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : "Konuşma durumu güncellenemedi."); } finally { setMutating(false); } }
  async function sendReply() { if (!selected || !canManage || sending || !replyBody.trim()) return; if (!availableChannels.includes(replyChannel)) { setError(`${channelLabel[replyChannel]} için kayıtlı mesaj sağlayıcısı yok.`); return; } setSending(true); setError(""); try { const draft = await api<Message>("/crm/messages/drafts", { method: "POST", body: { ...subjectPayload(selected), channel: replyChannel, subject: replyChannel === "EMAIL" ? replySubject.trim() || undefined : undefined, body: replyBody.trim(), idempotencyKey: messageIdempotencyKey(selected) } }); const sent = await api<Message>(`/crm/messages/${draft.id}/send`, { method: "POST", body: { version: draft.version ?? 1 } }); setDetail((current) => current ? { ...current, messages: [...current.messages, sent] } : current); setReplyBody(""); showToast(`${channelLabel[replyChannel]} mesajı gönderildi.`); await load(); } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : "Mesaj gönderilemedi. Kanal sağlayıcısı, alıcı veya iletişim iznini kontrol edin."); } finally { setSending(false); } }

  async function openCompose() {
    if (!canManage || composeLoading) return;
    if (!activeBranch) {
      showToast("Yeni mesaj başlatmak için önce çalışma kapsamından bir şube seçin.", "error");
      return;
    }
    setComposeOpen(true);
    setComposeLoading(true);
    setComposeSearch("");
    setComposeSubjectKey("");
    setComposeEmailSubject("");
    setComposeBody("");
    setError("");
    try {
      const canReadCustomers = hasPermission("customers", "read");
      const [leadRows, opportunityRows, customerRows] = await Promise.all([
        api<ComposeLead[]>("/crm/leads?limit=200"),
        api<ComposeOpportunity[]>("/crm/opportunities?limit=200"),
        canReadCustomers
          ? api<{ data: ComposeCustomer[] }>(withQuery("/customers", { page: 1, limit: 200 }))
          : Promise.resolve({ data: [] as ComposeCustomer[] }),
      ]);
      const subjects: ComposeSubject[] = [
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
          detail: [item.phone, item.email].filter(Boolean).join(" · ") || "Potansiyel Müşteri",
        })),
        ...opportunityRows.map((item) => ({
          type: "OPPORTUNITY" as const,
          id: item.id,
          label: item.title,
          detail: [item.customerFirstName || item.leadFirstName, item.customerLastName || item.leadLastName].filter(Boolean).join(" ") || "Satış Fırsatı",
        })),
      ];
      setComposeSubjects(subjects);
      const registered = providers?.registeredChannels ?? [];
      setComposeChannel(registered.includes("WHATSAPP") ? "WHATSAPP" : registered[0] ?? "WHATSAPP");
    } catch (requestError) {
      setError(requestError instanceof ApiError ? userErrorMessage(requestError.message, "Yeni mesaj seçenekleri yüklenemedi.") : "Yeni mesaj seçenekleri yüklenemedi.");
    } finally {
      setComposeLoading(false);
    }
  }

  async function sendNewMessage() {
    if (!canManage || composeSending || !composeSubjectKey || !composeBody.trim()) return;
    if (!availableChannels.includes(composeChannel)) {
      setError(`${channelLabel[composeChannel]} için aktif mesaj bağlantısı bulunmuyor.`);
      return;
    }
    const [type, id] = composeSubjectKey.split(":") as [SubjectType, string];
    if (!type || !id) return;
    setComposeSending(true);
    setError("");
    try {
      const payload = type === "CUSTOMER" ? { customerId: id } : type === "LEAD" ? { leadId: id } : { opportunityId: id };
      const draft = await api<Message>("/crm/messages/drafts", {
        method: "POST",
        body: {
          ...payload,
          channel: composeChannel,
          subject: composeChannel === "EMAIL" ? composeEmailSubject.trim() || undefined : undefined,
          body: composeBody.trim(),
          idempotencyKey: `compose:${type}:${id}:${crypto.randomUUID()}`,
        },
      });
      await api<Message>(`/crm/messages/${draft.id}/send`, { method: "POST", body: { version: draft.version ?? 1 } });
      setComposeOpen(false);
      setComposeBody("");
      setComposeSubjectKey("");
      showToast(`${channelLabel[composeChannel]} ile yeni konuşma başlatıldı.`, "success");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError
        ? userErrorMessage(requestError.message, "Mesaj gönderilemedi. İletişim bilgisi, izin veya kanal bağlantısını kontrol edin.")
        : "Mesaj gönderilemedi. İletişim bilgisi, izin veya kanal bağlantısını kontrol edin.");
    } finally {
      setComposeSending(false);
    }
  }

  const visible = useMemo(() => {
    const query = threadSearch.trim().toLocaleLowerCase("tr-TR");
    return threads.filter((thread) => {
      const matchesFilter = filter === "ALL" || (filter === "UNREAD" ? thread.unreadCount > 0 : thread.awaitingResponse);
      if (!matchesFilter) return false;
      if (!query) return true;
      return [thread.subjectLabel, thread.lastBody, thread.lastSubject ?? "", thread.assignedUserName ?? "", channelLabel[thread.lastChannel]]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(query);
    });
  }, [filter, threadSearch, threads]);
  const unread = threads.reduce((sum, thread) => sum + thread.unreadCount, 0);
  const awaiting = threads.filter((thread) => thread.awaitingResponse).length;
  const unassigned = threads.filter((thread) => !thread.assignedUserId).length;
  const urgent = threads.filter((thread) => thread.conversationPriority === "URGENT" || thread.conversationPriority === "HIGH").length;
  const composeVisibleSubjects = useMemo(() => {
    const query = composeSearch.trim().toLocaleLowerCase("tr-TR");
    return query ? composeSubjects.filter((item) => `${item.label} ${item.detail} ${subjectLabel[item.type]}`.toLocaleLowerCase("tr-TR").includes(query)) : composeSubjects;
  }, [composeSearch, composeSubjects]);
  const availableChannels = providers?.registeredChannels ?? [];

  return <div className="space-y-5">
    <header className="flex flex-col gap-5 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="text-[12px] font-medium text-[var(--muted)]">Müşteri iletişimi</p>
        <h1 className="mt-1 text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">Mesajlar</h1>
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">WhatsApp, SMS ve e-posta görüşmelerini tek yerde yönetin; yeni konuşma başlatın, ekip sorumluluğunu belirleyin ve cevap bekleyen müşterileri takip edin.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>{loading ? "Güncelleniyor…" : "Yenile"}</Button>
        {canManage ? <Button onClick={() => void openCompose()}>Yeni Mesaj</Button> : null}
      </div>
    </header>
    {!activeBranch ? <Alert>Mesajları kullanmak için önce çalışma kapsamından bir şube seçin.</Alert> : null}
    {!canRead ? <Alert>Mesajları görmek için müşteri ilişkileri görüntüleme yetkisi gerekir.</Alert> : null}
    {error && !composeOpen ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <button type="button" onClick={() => setFilter("UNREAD")} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-[var(--shadow-soft)] transition hover:border-[var(--line-strong)]"><span className="text-[10px] font-medium text-[var(--muted)]">Okunmamış</span><strong className="mt-3 block text-[24px] font-semibold tracking-[-.04em]">{unread}</strong><span className="mt-2 block text-[8px] text-[var(--muted)]">Henüz açılmamış mesajlar</span></button>
      <button type="button" onClick={() => setFilter("AWAITING")} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-[var(--shadow-soft)] transition hover:border-[var(--line-strong)]"><span className="text-[10px] font-medium text-[var(--muted)]">Cevap Bekleyen</span><strong className="mt-3 block text-[24px] font-semibold tracking-[-.04em]">{awaiting}</strong><span className="mt-2 block text-[8px] text-[var(--muted)]">Müşterinin yanıt beklediği konuşmalar</span></button>
      <button type="button" onClick={() => setTeamMode("UNASSIGNED")} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-[var(--shadow-soft)] transition hover:border-[var(--line-strong)]"><span className="text-[10px] font-medium text-[var(--muted)]">Atanmamış</span><strong className="mt-3 block text-[24px] font-semibold tracking-[-.04em]">{unassigned}</strong><span className="mt-2 block text-[8px] text-[var(--muted)]">Henüz sorumlusu olmayan konuşmalar</span></button>
      <button type="button" onClick={() => setPriorityFilter("HIGH")} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-[var(--shadow-soft)] transition hover:border-[var(--line-strong)]"><span className="text-[10px] font-medium text-[var(--muted)]">Öncelikli</span><strong className="mt-3 block text-[24px] font-semibold tracking-[-.04em]">{urgent}</strong><span className="mt-2 block text-[8px] text-[var(--muted)]">Yüksek veya acil öncelikte</span></button>
    </section>
    <section className="flex flex-col gap-3 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow-soft)] lg:flex-row lg:items-center lg:justify-between">
      <div className="flex rounded-[10px] bg-[var(--surface-2)] p-1">
        <button type="button" onClick={() => setFilter("ALL")} className={filter==="ALL"?"rounded-[7px] bg-[var(--surface)] px-3 py-2 text-[9px] font-semibold shadow-sm":"rounded-[7px] px-3 py-2 text-[9px] text-[var(--muted)]"}>Tümü</button>
        <button type="button" onClick={() => setFilter("UNREAD")} className={filter==="UNREAD"?"rounded-[7px] bg-[var(--surface)] px-3 py-2 text-[9px] font-semibold shadow-sm":"rounded-[7px] px-3 py-2 text-[9px] text-[var(--muted)]"}>Okunmamış</button>
        <button type="button" onClick={() => setFilter("AWAITING")} className={filter==="AWAITING"?"rounded-[7px] bg-[var(--surface)] px-3 py-2 text-[9px] font-semibold shadow-sm":"rounded-[7px] px-3 py-2 text-[9px] text-[var(--muted)]"}>Cevap Bekleyen</button>
      </div>
      <div className="flex flex-1 flex-col gap-2 sm:flex-row lg:max-w-[780px]">
        <TextInput value={threadSearch} onChange={(e) => setThreadSearch(e.target.value)} placeholder="Müşteri, mesaj veya sorumlu ara…" aria-label="Konuşmalarda ara" />
        <Select value={teamMode} onChange={(e) => setTeamMode(e.target.value as TeamMode)} className="sm:max-w-[180px]"><option value="ALL">Tüm ekip</option><option value="MINE">Bana atanan</option><option value="UNASSIGNED">Atanmamış</option></Select>
        <details className="relative">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-[10px] border border-[var(--line)] px-3 text-[9px] font-semibold">Filtreler <span className="text-[var(--muted)]">⌄</span></summary>
          <div className="absolute right-0 z-40 mt-2 w-[300px] space-y-2 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[0_16px_40px_rgba(23,35,28,.14)]">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}><option value="ACTIVE">Aktif konuşmalar</option><option value="OPEN">Açık</option><option value="PENDING">Beklemede</option><option value="RESOLVED">Çözülen</option><option value="SNOOZED">Ertelenen</option><option value="CLOSED">Kapalı</option></Select>
            <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}><option value="ALL">Tüm öncelikler</option><option value="URGENT">Acil</option><option value="HIGH">Yüksek</option><option value="NORMAL">Normal</option><option value="LOW">Düşük</option></Select>
            <Select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value as ChannelFilter)}><option value="ALL">Tüm kanallar</option><option value="WHATSAPP">WhatsApp</option><option value="SMS">SMS</option><option value="EMAIL">E-posta</option></Select>
            <button type="button" onClick={() => {setStatusFilter("ACTIVE");setPriorityFilter("ALL");setChannelFilter("ALL")}} className="w-full rounded-[8px] px-2.5 py-2 text-left text-[9px] font-semibold text-[var(--muted)] hover:bg-[var(--surface-2)]">Filtreleri Temizle</button>
          </div>
        </details>
      </div>
    </section>
    {loading ? <Spinner label="Konuşmalar yükleniyor..." /> : <div className="grid min-h-[560px] gap-4 xl:grid-cols-[390px_minmax(0,1fr)_300px]">
      <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <div><h2 className="text-[11px] font-semibold text-[var(--ink)]">Konuşmalar</h2><p className="mt-0.5 text-[8px] text-[var(--muted)]">{visible.length} kayıt</p></div>
          {canManage ? <button type="button" onClick={() => void openCompose()} className="rounded-[9px] bg-[var(--accent-soft)] px-2.5 py-1.5 text-[8px] font-semibold text-[var(--accent)]">Yeni Mesaj</button> : null}
        </div>{visible.length ? <div className="divide-y divide-[var(--line)]">{visible.map((thread) => <button key={`${thread.subjectType}:${thread.subjectId}`} type="button" onClick={() => void openThread(thread)} className={`block w-full px-4 py-4 text-left transition-colors hover:bg-[var(--surface-2)] ${selected?.subjectType === thread.subjectType && selected.subjectId === thread.subjectId ? "bg-[var(--surface-2)]" : ""}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[12px] font-semibold">{thread.subjectLabel}</p><p className="mt-1 text-[9px] text-[var(--muted)]">{subjectLabel[thread.subjectType]} · {thread.channels.map((item) => channelLabel[item]).join(" / ")}</p></div><div className="shrink-0 text-right"><time className="text-[9px] text-[var(--muted)]">{formatDate(thread.lastMessageAt)}</time>{thread.unreadCount ? <span className="ml-2 inline-flex min-w-5 justify-center rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[9px] font-semibold text-white">{thread.unreadCount}</span> : null}</div></div><p className="mt-2 line-clamp-2 text-[10px] leading-5 text-[var(--muted)]">{thread.lastBody}</p><div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-[var(--surface-2)] px-2 py-1 text-[9px] font-semibold">{statusLabel[thread.conversationStatus]}</span><span className="rounded-full bg-[var(--surface-2)] px-2 py-1 text-[9px] font-semibold">{priorityLabel[thread.conversationPriority]}</span>{thread.awaitingResponse ? <span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${thread.responseAgeMinutes >= 120 ? "bg-[#fff0eb] text-[#9c513f]" : "bg-[var(--warning-soft)] text-[var(--warning)]"}`}>Cevap bekliyor · {waitLabel(thread.responseAgeMinutes)}</span> : <span className="rounded-full bg-[var(--accent-soft)] px-2 py-1 text-[9px] font-semibold text-[var(--accent)]">Yanıtlandı</span>}<span className="text-[9px] text-[var(--muted)]">{thread.assignedUserName ? `Sorumlu: ${thread.assignedUserName}` : "Atanmamış"}</span></div></button>)}</div> : <EmptyState title="Konuşma Bulunamadı" description="Arama veya filtreleri değiştirin ya da yeni bir mesaj başlatın." />}</section>
      <section className="flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">{!selected ? <div className="p-6"><EmptyState title="Bir konuşma seçin" description="Mesaj geçmişini görmek için soldaki konuşmalardan birini açın veya yeni bir mesaj başlatın." action={canManage ? <Button onClick={() => void openCompose()}>Yeni Mesaj Başlat</Button> : undefined} /></div> : <><div className="border-b border-[var(--line)] px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-[14px] font-semibold">{selected.subjectLabel}</h2><p className="mt-1 text-[9px] text-[var(--muted)]">{subjectLabel[selected.subjectType]} · {selected.channels.map((item) => channelLabel[item]).join(" / ")} · {statusLabel[selected.conversationStatus]}</p></div>{canManage ? <Select disabled={mutating} value={selected.assignedUserId ?? ""} onChange={(e) => void setAssignment(e.target.value)} className="min-w-[170px]"><option value="">Atanmamış</option>{assignees.map((item) => <option key={item.id} value={item.id}>{assigneeName(item)}</option>)}</Select> : null}</div>{canManage ? <div className="mt-3 flex flex-wrap gap-2"><Select disabled={mutating} value={selected.conversationPriority} onChange={(e) => void setState(selected.conversationStatus, e.target.value as ConversationPriority)} className="max-w-[145px]"><option value="LOW">Düşük öncelik</option><option value="NORMAL">Normal öncelik</option><option value="HIGH">Yüksek öncelik</option><option value="URGENT">Acil</option></Select>{selected.conversationStatus !== "OPEN" ? <Button variant="secondary" disabled={mutating} onClick={() => void setState("OPEN")}>Yeniden Aç</Button> : null}<Button variant="secondary" disabled={mutating} onClick={() => void setState("PENDING")}>Beklemeye Al</Button><Button variant="secondary" disabled={mutating} onClick={() => void setState("RESOLVED")}>Çözüldü</Button><Button variant="secondary" disabled={mutating} onClick={() => void setState("SNOOZED", selected.conversationPriority, 60)}>1 Saat Ertele</Button><Button disabled={mutating} onClick={() => void setState("CLOSED")}>Kapat</Button></div> : null}</div>{detailLoading ? <div className="p-6"><Spinner label="Mesajlar yükleniyor..." /></div> : detail?.messages.length ? <div className="max-h-[540px] flex-1 space-y-3 overflow-y-auto p-5">{detail.messages.map((message) => <div key={message.id} className={`flex ${message.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}><article className={`max-w-[82%] rounded-[18px] px-4 py-3 ${message.direction === "OUTBOUND" ? "bg-[var(--accent-soft)]" : "bg-[var(--surface-2)]"}`}><div className="flex flex-wrap items-center gap-2"><strong className="text-[9px]">{channelLabel[message.channel]}</strong><span className="text-[9px] text-[var(--muted)]">{message.direction === "INBOUND" ? "Gelen" : "Giden"} · {userLabel(message.status)}</span></div>{message.subject ? <p className="mt-2 text-[10px] font-semibold">{message.subject}</p> : null}<p className="mt-2 whitespace-pre-wrap text-[11px] leading-5">{message.body}</p>{message.errorMessage ? <p className="mt-2 text-[9px] text-[#9c513f]">{message.errorMessage}</p> : null}<time className="mt-2 block text-right text-[8px] text-[var(--muted)]">{formatDate(message.sentAt || message.createdAt)}</time></article></div>)}</div> : <div className="flex-1 p-6"><EmptyState title="Mesaj Yok" description="Bu konuşmada henüz mesaj bulunmuyor." /></div>}{canManage ? <div className="border-t border-[var(--line)] bg-[var(--surface-1)] p-4">{availableChannels.length ? <><div className="mb-3 flex gap-2"><Select value={replyChannel} onChange={(e) => setReplyChannel(e.target.value as Channel)} className="max-w-[150px]">{availableChannels.map((item) => <option key={item} value={item}>{channelLabel[item]}</option>)}</Select>{replyChannel === "EMAIL" ? <input value={replySubject} onChange={(e) => setReplySubject(e.target.value)} maxLength={300} placeholder="E-posta konusu" className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-white px-3 text-[11px] outline-none" /> : null}</div><textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} maxLength={10000} rows={3} placeholder={`${channelLabel[replyChannel]} ile yanıt yazın...`} className="w-full resize-none rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-[11px] leading-5 outline-none focus:border-[var(--accent)]" /><div className="mt-3 flex items-center justify-between gap-3"><p className="text-[9px] text-[var(--muted)]">{replyChannel === "SMS" && replyBody ? `${replyBody.length} karakter · yaklaşık ${smsSegments(replyBody)} SMS segmenti` : "Gönderim, sağlayıcı ve iletişim izni kontrollerinden geçer."}</p><Button disabled={sending || !replyBody.trim()} onClick={() => void sendReply()}>{sending ? "Gönderiliyor..." : "Gönder"}</Button></div></> : <Alert>Bu şube için kayıtlı WhatsApp, SMS veya e-posta sağlayıcısı bulunmuyor. Gönderim kapalıdır.</Alert>}</div> : null}</>}</section>
      {selected ? <ConversationContextPanel subjectType={selected.subjectType} subjectId={selected.subjectId} href={hrefFor(selected)} /> : <aside className="hidden rounded-[22px] border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-soft)] xl:block"><EmptyState title="Müşteri bilgileri" description="Bir konuşma seçtiğinizde müşteri, potansiyel müşteri veya satış fırsatı bilgileri burada görünür." /></aside>}
    </div>}

    <Modal open={composeOpen} onClose={() => { if (!composeSending) setComposeOpen(false); }} title="Yeni Mesaj" description="Bir müşteri, potansiyel müşteri veya satış fırsatı seçerek yeni bir konuşma başlatın.">
      {composeLoading ? <Spinner label="Mesaj seçenekleri hazırlanıyor..." /> : <div className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        {!availableChannels.length ? <Alert>Bu şube için aktif WhatsApp, SMS veya e-posta bağlantısı bulunmuyor. Yeni mesaj gönderilemez.</Alert> : null}
        <Field label="Kime mesaj göndereceksiniz?" required>
          <div className="space-y-2">
            <TextInput value={composeSearch} onChange={(event) => setComposeSearch(event.target.value)} placeholder="Müşteri veya satış fırsatı ara…" aria-label="Mesaj alıcısı ara" />
            <Select value={composeSubjectKey} onChange={(event) => setComposeSubjectKey(event.target.value)}>
              <option value="">Seçin</option>
              {composeVisibleSubjects.map((item) => <option key={item.type+":"+item.id} value={item.type+":"+item.id}>{subjectLabel[item.type]} · {item.label}{item.detail && item.detail !== item.label ? " · "+item.detail : ""}</option>)}
            </Select>
          </div>
        </Field>
        <Field label="İletişim Kanalı" required>
          <Select value={composeChannel} onChange={(event) => setComposeChannel(event.target.value as Channel)} disabled={!availableChannels.length}>
            {availableChannels.length ? availableChannels.map((item) => <option key={item} value={item}>{channelLabel[item]}</option>) : <option value="WHATSAPP">Aktif kanal yok</option>}
          </Select>
        </Field>
        {composeChannel === "EMAIL" ? <Field label="E-posta Konusu"><TextInput value={composeEmailSubject} onChange={(event) => setComposeEmailSubject(event.target.value)} maxLength={300} placeholder="Konu" /></Field> : null}
        <Field label="Mesaj" required><TextArea value={composeBody} onChange={(event) => setComposeBody(event.target.value)} maxLength={10000} rows={5} placeholder={channelLabel[composeChannel]+" mesajınızı yazın…"} /></Field>
        <div className="rounded-[12px] bg-[var(--surface-2)] p-3 text-[8px] leading-4 text-[var(--muted)]">
          Alıcı bilgisi seçilen kayıttan otomatik alınır. Gönderim öncesinde iletişim izni ve kanal bağlantısı sistem tarafından kontrol edilir.
          {composeChannel === "SMS" && composeBody ? <span className="mt-1 block font-medium text-[var(--ink)]">{composeBody.length} karakter · yaklaşık {smsSegments(composeBody)} SMS</span> : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setComposeOpen(false)} disabled={composeSending}>Vazgeç</Button>
          <Button onClick={() => void sendNewMessage()} disabled={composeSending || !composeSubjectKey || !composeBody.trim() || !availableChannels.length}>{composeSending ? "Gönderiliyor…" : "Mesajı Gönder"}</Button>
        </div>
      </div>}
    </Modal>
  </div>;
}