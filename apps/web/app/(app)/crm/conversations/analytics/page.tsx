"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, GlassCard, PageHeader, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";

type Summary = {
  totalThreads: number;
  unreadThreads: number;
  unreadMessages: number;
  awaitingResponse: number;
  breached2h: number;
  breached24h: number;
  whatsappAwaiting: number;
  smsAwaiting: number;
  emailAwaiting: number;
  oldestAwaitingMinutes: number;
};

function waitLabel(minutes: number) {
  if (minutes < 60) return `${minutes} dk`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} sa`;
  return `${Math.floor(minutes / 1440)} gün`;
}

export default function CrmConversationAnalyticsPage() {
  const canRead = hasPermission("crm", "read");
  const activeBranch = hasActiveBranch();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!canRead || !activeBranch) { setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      setSummary(await api<Summary>("/crm/conversation-analytics/summary"));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Konuşma analitiği yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [activeBranch, canRead]);

  useEffect(() => { void load(); }, [load]);

  return <div className="space-y-6">
    <PageHeader
      title="Conversation SLA Analytics"
      description="Şubenin WhatsApp, SMS ve e-posta konuşmalarında cevap yükünü ve SLA riskini tüm kayıtlar üzerinden izleyin."
      action={<div className="flex gap-2"><Link href="/crm/conversations"><Button variant="secondary">Inbox</Button></Link><Button variant="secondary" onClick={() => void load()}>Yenile</Button></div>}
    />
    {!activeBranch ? <Alert>Conversation analytics için aktif şube seçin.</Alert> : null}
    {!canRead ? <Alert>Bu ekran için crm.read yetkisi gerekir.</Alert> : null}
    {error ? <Alert>{error}</Alert> : null}
    {loading ? <Spinner label="Conversation SLA metrikleri yükleniyor..." /> : summary ? <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <GlassCard><p className="text-[10px] text-[var(--muted)]">Toplam Konuşma</p><strong className="mt-2 block text-[22px]">{summary.totalThreads}</strong></GlassCard>
        <GlassCard><p className="text-[10px] text-[var(--muted)]">Okunmamış Thread</p><strong className="mt-2 block text-[22px]">{summary.unreadThreads}</strong><p className="mt-1 text-[9px] text-[var(--muted)]">{summary.unreadMessages} mesaj</p></GlassCard>
        <GlassCard><p className="text-[10px] text-[var(--muted)]">Cevap Bekleyen</p><strong className="mt-2 block text-[22px]">{summary.awaitingResponse}</strong></GlassCard>
        <GlassCard><p className="text-[10px] text-[var(--muted)]">2+ Saat SLA</p><strong className="mt-2 block text-[22px]">{summary.breached2h}</strong></GlassCard>
        <GlassCard><p className="text-[10px] text-[var(--muted)]">24+ Saat Kritik</p><strong className="mt-2 block text-[22px]">{summary.breached24h}</strong></GlassCard>
        <GlassCard><p className="text-[10px] text-[var(--muted)]">En Eski Bekleyen</p><strong className="mt-2 block text-[22px]">{waitLabel(summary.oldestAwaitingMinutes)}</strong></GlassCard>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <GlassCard><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">WhatsApp</p><strong className="mt-3 block text-[28px]">{summary.whatsappAwaiting}</strong><p className="mt-1 text-[10px] text-[var(--muted)]">cevap bekleyen konuşma</p></GlassCard>
        <GlassCard><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">SMS</p><strong className="mt-3 block text-[28px]">{summary.smsAwaiting}</strong><p className="mt-1 text-[10px] text-[var(--muted)]">cevap bekleyen konuşma</p></GlassCard>
        <GlassCard><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">E-posta</p><strong className="mt-3 block text-[28px]">{summary.emailAwaiting}</strong><p className="mt-1 text-[10px] text-[var(--muted)]">cevap bekleyen konuşma</p></GlassCard>
      </section>

      <Alert tone={summary.breached24h > 0 ? undefined : "success"}>
        {summary.breached24h > 0
          ? `${summary.breached24h} konuşma 24 saatten uzun süredir cevap bekliyor. Öncelikli olarak Unified Inbox üzerinden ele alınmalı.`
          : "24 saati aşmış kritik conversation SLA ihlali yok."}
      </Alert>
    </> : null}
  </div>;
}
