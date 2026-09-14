"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, EmptyState, GlassCard, PageHeader, Select, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";

type SubjectType = "CUSTOMER" | "LEAD" | "OPPORTUNITY";
type Thread = {
  subjectType: SubjectType;
  subjectId: string;
  subjectLabel: string;
  messageCount: number;
  inboundCount: number;
  outboundCount: number;
  channels: Array<"EMAIL" | "SMS" | "WHATSAPP">;
  lastMessageAt: string;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastDirection: "INBOUND" | "OUTBOUND";
  lastChannel: "EMAIL" | "SMS" | "WHATSAPP";
  lastStatus: string;
  lastBody: string;
  lastSubject: string | null;
  lastRecipient: string;
  unreadCount: number;
  awaitingResponse: boolean;
  responseAgeMinutes: number;
};

type Message = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  channel: "EMAIL" | "SMS" | "WHATSAPP";
  status: string;
  providerKey: string | null;
  recipient: string;
  subject: string | null;
  body: string;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
};

type Detail = { subjectType: SubjectType; subjectId: string; messages: Message[] };

const channelLabel = { EMAIL: "E-posta", SMS: "SMS", WHATSAPP: "WhatsApp" } as const;
const subjectLabel = { CUSTOMER: "Müşteri", LEAD: "Lead", OPPORTUNITY: "Fırsat" } as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function waitLabel(minutes: number) {
  if (minutes < 60) return `${minutes} dk`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} sa`;
  return `${Math.floor(minutes / 1440)} gün`;
}

function hrefFor(thread: Thread) {
  if (thread.subjectType === "CUSTOMER") return `/customers/${thread.subjectId}`;
  if (thread.subjectType === "LEAD") return `/crm/leads/${thread.subjectId}`;
  return `/crm/opportunities/${thread.subjectId}`;
}

export default function CrmConversationsPage() {
  const canRead = hasPermission("crm", "read");
  const activeBranch = hasActiveBranch();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selected, setSelected] = useState<Thread | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"ALL" | "UNREAD" | "AWAITING">("ALL");

  const load = useCallback(async () => {
    if (!canRead || !activeBranch) { setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const rows = await api<Thread[]>("/crm/conversations?limit=150");
      setThreads(rows);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Konuşmalar yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [activeBranch, canRead]);

  useEffect(() => { void load(); }, [load]);

  async function openThread(thread: Thread) {
    setSelected(thread);
    setDetailLoading(true);
    setError("");
    try {
      const result = await api<Detail>(`/crm/conversations/${thread.subjectType}/${thread.subjectId}?limit=300`);
      setDetail(result);
      setThreads((current) => current.map((item) => item.subjectType === thread.subjectType && item.subjectId === thread.subjectId ? { ...item, unreadCount: 0 } : item));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Konuşma açılamadı.");
    } finally {
      setDetailLoading(false);
    }
  }

  const visible = useMemo(() => threads.filter((thread) =>
    filter === "ALL" || (filter === "UNREAD" ? thread.unreadCount > 0 : thread.awaitingResponse),
  ), [filter, threads]);
  const unread = threads.reduce((sum, thread) => sum + thread.unreadCount, 0);
  const awaiting = threads.filter((thread) => thread.awaitingResponse).length;
  const breached = threads.filter((thread) => thread.awaitingResponse && thread.responseAgeMinutes >= 120).length;

  return <div className="space-y-6">
    <PageHeader title="Birleşik CRM Inbox" description="WhatsApp, SMS ve e-posta konuşmalarını müşteri, lead ve fırsat bazında tek akışta yönetin." action={<Button variant="secondary" onClick={() => void load()}>Yenile</Button>} />
    {!activeBranch ? <Alert>Birleşik inbox için aktif bir şube seçin.</Alert> : null}
    {!canRead ? <Alert>Konuşmaları görmek için crm.read yetkisi gerekir.</Alert> : null}
    {error ? <Alert>{error}</Alert> : null}

    <div className="grid gap-3 sm:grid-cols-3">
      <GlassCard><p className="text-[10px] text-[var(--muted)]">Okunmamış Mesaj</p><strong className="mt-2 block text-[22px]">{unread}</strong></GlassCard>
      <GlassCard><p className="text-[10px] text-[var(--muted)]">Cevap Bekleyen</p><strong className="mt-2 block text-[22px]">{awaiting}</strong></GlassCard>
      <GlassCard><p className="text-[10px] text-[var(--muted)]">2+ Saat SLA</p><strong className="mt-2 block text-[22px]">{breached}</strong></GlassCard>
    </div>

    <div className="flex flex-wrap gap-2">
      <Select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="max-w-[200px]">
        <option value="ALL">Tüm konuşmalar</option><option value="UNREAD">Okunmamış</option><option value="AWAITING">Cevap bekleyen</option>
      </Select>
    </div>

    {loading ? <Spinner label="Konuşmalar yükleniyor..." /> : <div className="grid min-h-[560px] gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
      <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
        {visible.length ? <div className="divide-y divide-[var(--line)]">{visible.map((thread) => (
          <button key={`${thread.subjectType}:${thread.subjectId}`} type="button" onClick={() => void openThread(thread)} className={`block w-full px-4 py-4 text-left transition-colors hover:bg-[var(--surface-2)] ${selected?.subjectType === thread.subjectType && selected.subjectId === thread.subjectId ? "bg-[var(--surface-2)]" : ""}`}>
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[12px] font-semibold">{thread.subjectLabel}</p><p className="mt-1 text-[9px] text-[var(--muted)]">{subjectLabel[thread.subjectType]} · {thread.channels.map((item) => channelLabel[item]).join(" / ")}</p></div><div className="shrink-0 text-right"><time className="text-[9px] text-[var(--muted)]">{formatDate(thread.lastMessageAt)}</time>{thread.unreadCount ? <span className="ml-2 inline-flex min-w-5 justify-center rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[9px] font-semibold text-white">{thread.unreadCount}</span> : null}</div></div>
            <p className="mt-2 line-clamp-2 text-[10px] leading-5 text-[var(--muted)]">{thread.lastBody}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">{thread.awaitingResponse ? <span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${thread.responseAgeMinutes >= 120 ? "bg-[#fff0eb] text-[#9c513f]" : "bg-[var(--warning-soft)] text-[var(--warning)]"}`}>Cevap bekliyor · {waitLabel(thread.responseAgeMinutes)}</span> : <span className="rounded-full bg-[var(--accent-soft)] px-2 py-1 text-[9px] font-semibold text-[var(--accent)]">Yanıtlandı</span>}<span className="text-[9px] text-[var(--muted)]">{thread.messageCount} mesaj</span></div>
          </button>
        ))}</div> : <EmptyState title="Konuşma Yok" description="Seçili filtrede konuşma bulunmuyor." />}
      </section>

      <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
        {!selected ? <div className="p-6"><EmptyState title="Bir konuşma seçin" description="Mesaj geçmişini görmek için soldaki konuşmalardan birini açın." /></div> : <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4"><div><h2 className="text-[14px] font-semibold">{selected.subjectLabel}</h2><p className="mt-1 text-[9px] text-[var(--muted)]">{subjectLabel[selected.subjectType]} · {selected.channels.map((item) => channelLabel[item]).join(" / ")}</p></div><Link href={hrefFor(selected)}><Button variant="secondary">CRM Kaydını Aç</Button></Link></div>
          {detailLoading ? <div className="p-6"><Spinner label="Mesajlar yükleniyor..." /></div> : detail?.messages.length ? <div className="max-h-[680px] space-y-3 overflow-y-auto p-5">{detail.messages.map((message) => <div key={message.id} className={`flex ${message.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}><article className={`max-w-[78%] rounded-[18px] px-4 py-3 ${message.direction === "OUTBOUND" ? "bg-[var(--accent-soft)]" : "bg-[var(--surface-2)]"}`}><div className="flex flex-wrap items-center gap-2"><strong className="text-[9px]">{channelLabel[message.channel]}</strong><span className="text-[9px] text-[var(--muted)]">{message.direction === "INBOUND" ? "Gelen" : "Giden"} · {message.status}</span></div>{message.subject ? <p className="mt-2 text-[10px] font-semibold">{message.subject}</p> : null}<p className="mt-2 whitespace-pre-wrap text-[11px] leading-5">{message.body}</p>{message.errorMessage ? <p className="mt-2 text-[9px] text-[#9c513f]">{message.errorMessage}</p> : null}<time className="mt-2 block text-right text-[8px] text-[var(--muted)]">{formatDate(message.sentAt || message.createdAt)}</time></article></div>)}</div> : <div className="p-6"><EmptyState title="Mesaj Yok" description="Bu konuşmada henüz mesaj bulunmuyor." /></div>}
        </>}
      </section>
    </div>}
  </div>;
}
