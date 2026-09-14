"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, EmptyState, GlassCard, PageHeader, Select, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";

type Channel = "EMAIL" | "SMS" | "WHATSAPP";
type Message = {
  id: string;
  customerId: string | null;
  leadId: string | null;
  opportunityId: string | null;
  direction: "INBOUND" | "OUTBOUND";
  channel: Channel;
  status: "DRAFT" | "QUEUED" | "SENT" | "DELIVERED" | "FAILED" | "CANCELLED";
  providerKey: string | null;
  recipient: string;
  subject: string | null;
  body: string;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
};
type ProviderStatus = { providers: Array<{ key: string; channels: Channel[] }> };

const channelLabels: Record<Channel, string> = { EMAIL: "E-posta", SMS: "SMS", WHATSAPP: "WhatsApp" };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function hrefFor(message: Message) {
  if (message.customerId) return `/customers/${message.customerId}`;
  if (message.opportunityId) return `/crm/opportunities/${message.opportunityId}`;
  if (message.leadId) return `/crm/leads/${message.leadId}`;
  return "/crm";
}

export default function CrmCommunicationsPage() {
  const canRead = hasPermission("crm", "read");
  const activeBranch = hasActiveBranch();
  const [messages, setMessages] = useState<Message[]>([]);
  const [providers, setProviders] = useState<ProviderStatus>({ providers: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [channel, setChannel] = useState<"ALL" | Channel>("ALL");
  const [direction, setDirection] = useState<"ALL" | "INBOUND" | "OUTBOUND">("ALL");

  const load = useCallback(async () => {
    if (!canRead || !activeBranch) { setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const [rows, providerStatus] = await Promise.all([
        api<Message[]>("/crm/messages?limit=100"),
        api<ProviderStatus>("/crm/messages/providers"),
      ]);
      setMessages(rows);
      setProviders(providerStatus);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "İletişim merkezi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [activeBranch, canRead]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => messages.filter((message) =>
    (channel === "ALL" || message.channel === channel) &&
    (direction === "ALL" || message.direction === direction),
  ), [channel, direction, messages]);
  const inbound = messages.filter((message) => message.direction === "INBOUND").length;
  const outbound = messages.filter((message) => message.direction === "OUTBOUND").length;
  const failed = messages.filter((message) => message.status === "FAILED").length;

  return <div className="space-y-6">
    <PageHeader title="CRM İletişim Merkezi" description="WhatsApp, SMS ve e-posta temaslarının branch bazlı birleşik zaman çizelgesi." action={<Button variant="secondary" onClick={() => void load()}>Yenile</Button>} />
    {!activeBranch ? <Alert>İletişim merkezini kullanmak için aktif bir şube seçin.</Alert> : null}
    {!canRead ? <Alert>CRM iletişim kayıtlarını görmek için crm.read yetkisi gerekir.</Alert> : null}
    {error ? <Alert>{error}</Alert> : null}
    {activeBranch && !providers.providers.length ? <Alert>Harici mesaj provider&apos;ı henüz bağlı değil. Müşteri profillerinden manuel iletişim kaydı tutulabilir; provider olmadan sistem mesajı gönderilmiş saymaz.</Alert> : null}

    <div className="grid gap-3 sm:grid-cols-3">
      <GlassCard><p className="text-[10px] text-[var(--muted)]">Gelen</p><strong className="mt-2 block text-[22px]">{inbound}</strong></GlassCard>
      <GlassCard><p className="text-[10px] text-[var(--muted)]">Giden</p><strong className="mt-2 block text-[22px]">{outbound}</strong></GlassCard>
      <GlassCard><p className="text-[10px] text-[var(--muted)]">Provider Hatası</p><strong className="mt-2 block text-[22px]">{failed}</strong></GlassCard>
    </div>

    <div className="flex flex-wrap gap-2">
      <Select value={channel} onChange={(event) => setChannel(event.target.value as typeof channel)} className="max-w-[180px]"><option value="ALL">Tüm kanallar</option><option value="WHATSAPP">WhatsApp</option><option value="SMS">SMS</option><option value="EMAIL">E-posta</option></Select>
      <Select value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)} className="max-w-[180px]"><option value="ALL">Tüm yönler</option><option value="INBOUND">Gelen</option><option value="OUTBOUND">Giden</option></Select>
    </div>

    {loading ? <Spinner label="İletişim kayıtları yükleniyor..." /> : filtered.length ? (
      <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
        <div className="divide-y divide-[var(--line)]">{filtered.map((message) => (
          <article key={message.id} className="grid gap-3 px-5 py-4 md:grid-cols-[100px_100px_minmax(0,1fr)_170px_auto] md:items-start">
            <span className="w-fit rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">{channelLabels[message.channel]}</span>
            <div><p className="text-[10px] font-semibold">{message.direction === "INBOUND" ? "Gelen" : "Giden"}</p><p className="mt-1 text-[9px] text-[var(--muted)]">{message.status}</p></div>
            <div className="min-w-0"><p className="truncate text-[11px] font-semibold">{message.subject || message.recipient}</p><p className="mt-1 line-clamp-2 text-[11px] leading-5 text-[var(--muted)]">{message.body}</p>{message.errorMessage ? <p className="mt-1 text-[9px] text-[#9c513f]">{message.errorMessage}</p> : null}</div>
            <time className="text-[9px] text-[var(--muted)]">{formatDate(message.sentAt || message.createdAt)}</time>
            <Link href={hrefFor(message)}><Button variant="secondary" className="min-h-8 px-3 py-1 text-[10px]">Kaydı Aç</Button></Link>
          </article>
        ))}</div>
      </section>
    ) : <EmptyState title="İletişim Kaydı Yok" description="Seçili filtrelerde CRM iletişim kaydı bulunmuyor." />}
  </div>;
}
