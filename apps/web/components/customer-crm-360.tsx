"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, EmptyState, GlassCard, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { followUpChannelLabels, opportunityStageLabels, type OpportunityStage } from "@/lib/crm-types";

type Customer360 = {
  summary: {
    opportunityCount: number;
    openOpportunityCount: number;
    wonOpportunityCount: number;
    totalPipeline: number;
    weightedPipeline: number;
    openFollowUpCount: number;
    overdueFollowUpCount: number;
    lastCrmActivityAt: string | null;
  };
  opportunities: Array<{
    id: string;
    title: string;
    stage: OpportunityStage;
    estimatedValue: number | null;
    currency: string;
    probability: number;
    expectedCloseDate: string | null;
    updatedAt: string;
  }>;
  followUps: Array<{
    id: string;
    opportunityId: string | null;
    assignedUserId: string;
    channel: keyof typeof followUpChannelLabels;
    status: string;
    dueAt: string;
    note: string | null;
    version: number;
  }>;
  events: Array<{
    id: string;
    opportunityId: string | null;
    eventType: string;
    createdAt: string;
  }>;
};

function money(value: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function eventLabel(value: string) {
  const labels: Record<string, string> = {
    OPPORTUNITY_CREATED: "Satış fırsatı oluşturuldu",
    OPPORTUNITY_STAGE_CHANGED: "Satış aşaması değişti",
    OPPORTUNITY_COMMERCIAL_UPDATED: "Ticari bilgiler güncellendi",
    FOLLOW_UP_CREATED: "Takip oluşturuldu",
    FOLLOW_UP_COMPLETED: "Takip tamamlandı",
    FOLLOW_UP_RESCHEDULED: "Takip yeniden planlandı",
    FOLLOW_UP_CANCELLED: "Takip iptal edildi",
    OPPORTUNITY_SALE_LINKED: "Satış bağlantısı oluşturuldu",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

export function CustomerCrm360({ customerId }: { customerId: string }) {
  const canReadCrm = hasPermission("crm", "read");
  const canManageCrm = hasPermission("crm", "manage");
  const [data, setData] = useState<Customer360 | null>(null);
  const [loading, setLoading] = useState(canReadCrm);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canReadCrm) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const result = await api<Customer360>(`/crm/operations/customer-360/${customerId}`);
        if (!cancelled) setData(result);
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof ApiError ? requestError.message : "CRM özeti yüklenemedi.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [canReadCrm, customerId]);

  const nearestFollowUp = useMemo(() => {
    if (!data?.followUps.length) return null;
    return [...data.followUps].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0];
  }, [data]);

  if (!canReadCrm) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">Customer 360</p>
          <h2 className="mt-1 text-[20px] font-semibold">CRM İlişki Görünümü</h2>
          <p className="mt-1 text-[11px] text-[var(--muted)]">Fırsatlar, açık takipler ve son CRM aktiviteleri tek müşteri bağlamında.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageCrm ? <Link href={`/crm/opportunities/new?customerId=${customerId}`}><Button variant="secondary">+ Satış Fırsatı</Button></Link> : null}
          <Link href="/crm"><Button variant="secondary">CRM Operasyon Merkezi</Button></Link>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {loading ? <Spinner label="CRM müşteri özeti hazırlanıyor..." /> : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <GlassCard><p className="text-[10px] text-[var(--muted)]">Açık Fırsat</p><strong className="mt-2 block text-[22px]">{data.summary.openOpportunityCount}</strong></GlassCard>
            <GlassCard><p className="text-[10px] text-[var(--muted)]">Ağırlıklı Pipeline</p><strong className="mt-2 block text-[20px]">{money(data.summary.weightedPipeline)}</strong></GlassCard>
            <GlassCard><p className="text-[10px] text-[var(--muted)]">Açık Takip</p><strong className="mt-2 block text-[22px]">{data.summary.openFollowUpCount}</strong><p className="mt-1 text-[10px] text-[var(--muted)]">{data.summary.overdueFollowUpCount} geciken</p></GlassCard>
            <GlassCard><p className="text-[10px] text-[var(--muted)]">Son CRM Aktivitesi</p><strong className="mt-2 block text-[12px]">{data.summary.lastCrmActivityAt ? dateTime(data.summary.lastCrmActivityAt) : "—"}</strong></GlassCard>
          </div>

          {nearestFollowUp ? (
            <div className="rounded-[18px] border border-[#f0d7cf] bg-[#fff7f4] px-4 py-3 text-[11px]">
              <strong>Sonraki takip:</strong> {followUpChannelLabels[nearestFollowUp.channel]} · {dateTime(nearestFollowUp.dueAt)}{nearestFollowUp.note ? ` · ${nearestFollowUp.note}` : ""}
            </div>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
            <GlassCard className="p-0">
              <div className="border-b border-[var(--line)] px-5 py-4"><h3 className="text-[14px] font-semibold">Satış Fırsatları</h3></div>
              {data.opportunities.length ? <div className="divide-y divide-[var(--line)]">{data.opportunities.map((row) => (
                <Link key={row.id} href={`/crm/opportunities/${row.id}`} className="grid gap-2 px-5 py-4 transition-colors hover:bg-[var(--surface-2)] sm:grid-cols-[minmax(0,1fr)_120px_120px] sm:items-center">
                  <div className="min-w-0"><p className="truncate text-[12px] font-semibold">{row.title}</p><p className="mt-1 text-[10px] text-[var(--muted)]">Son güncelleme: {dateTime(row.updatedAt)}</p></div>
                  <span className="w-fit rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">{opportunityStageLabels[row.stage]}</span>
                  <div className="sm:text-right"><strong className="text-[12px]">{money(Number(row.estimatedValue ?? 0), row.currency)}</strong><p className="text-[9px] text-[var(--muted)]">%{row.probability} olasılık</p></div>
                </Link>
              ))}</div> : <EmptyState title="Satış Fırsatı Yok" description="Bu müşteri için henüz CRM satış fırsatı bulunmuyor." />}
            </GlassCard>

            <GlassCard className="p-0">
              <div className="border-b border-[var(--line)] px-5 py-4"><h3 className="text-[14px] font-semibold">Son CRM Aktiviteleri</h3></div>
              {data.events.length ? <div className="divide-y divide-[var(--line)]">{data.events.map((event) => (
                <div key={event.id} className="px-5 py-3"><p className="text-[11px] font-semibold">{eventLabel(event.eventType)}</p><p className="mt-1 text-[9px] text-[var(--muted)]">{dateTime(event.createdAt)}</p>{event.opportunityId ? <Link href={`/crm/opportunities/${event.opportunityId}`} className="mt-1 inline-block text-[9px] font-semibold text-[var(--accent)]">Fırsatı aç</Link> : null}</div>
              ))}</div> : <EmptyState title="CRM Aktivitesi Yok" description="Bu müşteri için henüz CRM zaman çizelgesi oluşmamış." />}
            </GlassCard>
          </div>
        </>
      ) : null}
    </section>
  );
}
