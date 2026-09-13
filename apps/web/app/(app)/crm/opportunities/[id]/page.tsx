"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  EmptyState,
  GlassCard,
  PageHeader,
  Spinner,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import {
  followUpChannelLabels,
  opportunityStageLabels,
  type CrmEvent,
  type CrmFollowUp,
  type OpportunityStage,
} from "@/lib/crm-types";

type OpportunityDetail = {
  id: string;
  leadId: string | null;
  customerId: string | null;
  ownerUserId: string | null;
  title: string;
  stage: OpportunityStage;
  estimatedValue: string | number | null;
  currency: string;
  probability: number;
  expectedCloseDate: string | null;
  lostReason: string | null;
  saleId: string | null;
  commercialSnapshot: Record<string, unknown> | null;
  convertedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  leadFirstName: string | null;
  leadLastName: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  followUps: CrmFollowUp[];
  events: CrmEvent[];
};

function formatMoney(value: string | number | null, currency: string) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function eventLabel(eventType: string) {
  const labels: Record<string, string> = {
    OPPORTUNITY_CREATED: "Satış Fırsatı Oluşturuldu",
    OPPORTUNITY_STAGE_CHANGED: "Satış Aşaması Değişti",
    LEAD_QUALIFIED: "Potansiyel Müşteri Nitelendirildi",
    FOLLOW_UP_CREATED: "Takip Oluşturuldu",
    FOLLOW_UP_COMPLETED: "Takip Tamamlandı",
    FOLLOW_UP_RESCHEDULED: "Takip Yeniden Planlandı",
    FOLLOW_UP_CANCELLED: "Takip İptal Edildi",
    OPPORTUNITY_SALE_LINKED: "Satış Taslağı Bağlandı",
  };
  return labels[eventType] ?? eventType.replaceAll("_", " ");
}

function metadataSummary(metadata: Record<string, unknown> | null) {
  if (!metadata) return null;
  return Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}

export default function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [opportunity, setOpportunity] = useState<OpportunityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const { id } = await params;
        const result = await api<OpportunityDetail>(`/crm/opportunities/${id}`);
        if (!cancelled) setOpportunity(result);
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof ApiError
              ? requestError.message
              : "Satış fırsatı yüklenemedi.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [params]);

  const subject = useMemo(() => {
    if (!opportunity) return null;
    const leadName = [opportunity.leadFirstName, opportunity.leadLastName]
      .filter(Boolean)
      .join(" ");
    const customerName = [
      opportunity.customerFirstName,
      opportunity.customerLastName,
    ]
      .filter(Boolean)
      .join(" ");

    if (opportunity.leadId) {
      return {
        label: leadName || "Potansiyel müşteri",
        href: `/crm/leads/${opportunity.leadId}`,
        kind: "Potansiyel Müşteri",
      };
    }
    if (opportunity.customerId) {
      return {
        label: customerName || "Müşteri",
        href: `/customers/${opportunity.customerId}`,
        kind: "Müşteri",
      };
    }
    return null;
  }, [opportunity]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Satış Fırsatı" />
        <div className="mt-10">
          <Spinner label="Satış fırsatı hazırlanıyor..." />
        </div>
      </div>
    );
  }

  if (error || !opportunity) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader title="Satış Fırsatı" />
        <Alert>{error || "Satış fırsatı bulunamadı."}</Alert>
        <Link href="/crm/pipeline">
          <Button variant="secondary">Satış sürecine dön</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={opportunity.title}
        description="Satış fırsatının müşteri bağlantısını, ticari durumunu, takiplerini ve CRM geçmişini tek ekranda izleyin."
        action={
          <div className="flex flex-wrap gap-2">
            {subject ? (
              <Link href={subject.href}>
                <Button variant="secondary">{subject.label}</Button>
              </Link>
            ) : null}
            <Link href="/crm/pipeline">
              <Button>Satış Sürecine Dön</Button>
            </Link>
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <GlassCard>
          <p className="text-[10px] font-medium uppercase tracking-[.08em] text-[var(--muted-soft)]">Aşama</p>
          <strong className="mt-3 block text-[18px] font-semibold text-[var(--ink)]">
            {opportunityStageLabels[opportunity.stage]}
          </strong>
        </GlassCard>
        <GlassCard>
          <p className="text-[10px] font-medium uppercase tracking-[.08em] text-[var(--muted-soft)]">Tahmini Değer</p>
          <strong className="mt-3 block text-[18px] font-semibold text-[var(--ink)]">
            {formatMoney(opportunity.estimatedValue, opportunity.currency)}
          </strong>
        </GlassCard>
        <GlassCard>
          <p className="text-[10px] font-medium uppercase tracking-[.08em] text-[var(--muted-soft)]">Kazanma Olasılığı</p>
          <strong className="mt-3 block text-[18px] font-semibold text-[var(--ink)]">%{opportunity.probability}</strong>
        </GlassCard>
        <GlassCard>
          <p className="text-[10px] font-medium uppercase tracking-[.08em] text-[var(--muted-soft)]">Beklenen Kapanış</p>
          <strong className="mt-3 block text-[18px] font-semibold text-[var(--ink)]">
            {opportunity.expectedCloseDate ? formatDate(opportunity.expectedCloseDate) : "—"}
          </strong>
        </GlassCard>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,.6fr)]">
        <GlassCard>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">Ticari Bağlantı</p>
              <h2 className="mt-1 text-[18px] font-semibold text-[var(--ink)]">Fırsat Özeti</h2>
            </div>
            <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[10px] font-semibold text-[var(--accent)]">
              v{opportunity.version}
            </span>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Detail label="Kayıt Türü" value={subject?.kind || "Bağlantısız"} />
            <Detail label="Kayıt" value={subject?.label || "—"} />
            <Detail label="Oluşturulma" value={formatDateTime(opportunity.createdAt)} />
            <Detail label="Son Güncelleme" value={formatDateTime(opportunity.updatedAt)} />
            {opportunity.lostReason ? (
              <div className="sm:col-span-2">
                <Detail label="Kaybetme Nedeni" value={opportunity.lostReason} />
              </div>
            ) : null}
          </div>
        </GlassCard>

        <GlassCard>
          <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">Satış Dönüşümü</p>
          <h2 className="mt-1 text-[18px] font-semibold text-[var(--ink)]">Satış Bağlantısı</h2>
          {opportunity.saleId ? (
            <div className="mt-5 space-y-3">
              <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/40 p-4">
                <p className="text-[10px] text-[var(--muted-soft)]">Satış ID</p>
                <p className="mt-1 break-all text-[12px] font-medium text-[var(--ink)]">{opportunity.saleId}</p>
              </div>
              <Detail
                label="Dönüşüm Tarihi"
                value={opportunity.convertedAt ? formatDateTime(opportunity.convertedAt) : "—"}
              />
            </div>
          ) : (
            <p className="mt-5 text-[12px] leading-5 text-[var(--muted)]">
              Bu fırsat henüz satış taslağına dönüştürülmemiş. Kazanılan fırsatlar Pipeline üzerinden satış taslağına bağlanabilir.
            </p>
          )}
        </GlassCard>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <GlassCard className="p-0">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-[15px] font-semibold text-[var(--ink)]">Takipler</h2>
            <p className="mt-1 text-[10px] text-[var(--muted)]">Bu fırsata bağlı müşteri temasları</p>
          </div>
          {opportunity.followUps.length ? (
            <div className="divide-y divide-[var(--line)]">
              {opportunity.followUps.map((followUp) => (
                <div key={followUp.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] font-semibold text-[var(--ink)]">
                      {followUpChannelLabels[followUp.channel]}
                    </p>
                    <span className="text-[10px] font-medium text-[var(--muted)]">{followUp.status}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">{formatDateTime(followUp.dueAt)}</p>
                  {followUp.note ? <p className="mt-2 text-[11px] leading-5 text-[var(--ink)]">{followUp.note}</p> : null}
                  {followUp.outcome ? <p className="mt-2 text-[10px] text-[var(--muted)]">Sonuç: {followUp.outcome}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Takip Bulunmuyor" description="Bu fırsata bağlı takip kaydı henüz yok." />
          )}
        </GlassCard>

        <GlassCard className="p-0">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-[15px] font-semibold text-[var(--ink)]">CRM Zaman Çizelgesi</h2>
            <p className="mt-1 text-[10px] text-[var(--muted)]">Fırsat üzerinde oluşan append-only olay geçmişi</p>
          </div>
          {opportunity.events.length ? (
            <div className="divide-y divide-[var(--line)]">
              {opportunity.events.map((event) => {
                const summary = metadataSummary(event.metadata);
                return (
                  <div key={event.id} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold text-[var(--ink)]">{eventLabel(event.eventType)}</p>
                        <p className="mt-1 text-[10px] text-[var(--muted)]">{formatDateTime(event.createdAt)}</p>
                        {summary ? <p className="mt-2 break-words text-[10px] leading-5 text-[var(--muted)]">{summary}</p> : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="CRM Olayı Bulunmuyor" description="Bu fırsat için henüz olay geçmişi oluşmamış." />
          )}
        </GlassCard>
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[.08em] text-[var(--muted-soft)]">{label}</p>
      <p className="mt-1.5 text-[12px] leading-5 text-[var(--ink)]">{value}</p>
    </div>
  );
}
