"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Button, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { followUpChannelLabels, opportunityStageLabels, type CrmFollowUp, type OpportunityStage } from "@/lib/crm-types";

type View = "overdue" | "today" | "stale";

type ActionFollowUp = Pick<
  CrmFollowUp,
  "id" | "leadId" | "opportunityId" | "assignedUserId" | "channel" | "dueAt" | "note" | "version"
> & { subjectLabel: string };

type ActionOpportunity = {
  id: string;
  leadId: string | null;
  customerId: string | null;
  ownerUserId: string | null;
  title: string;
  stage: OpportunityStage;
  estimatedValue: string | number | null;
  currency: string;
  probability: number;
  updatedAt: string;
  subjectLabel: string;
};

function localDayWindow() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { dayStart: start.toISOString(), dayEnd: end.toISOString() };
}

function staleBefore() {
  const value = new Date();
  value.setDate(value.getDate() - 14);
  return value.toISOString();
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

function formatMoney(value: string | number | null, currency: string) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

export default function CrmActionCenterPage() {
  const searchParams = useSearchParams();
  const requestedView = searchParams.get("view");
  const view: View = requestedView === "today" || requestedView === "stale" ? requestedView : "overdue";
  const ownerUserId = searchParams.get("ownerUserId") ?? "";
  const [followUps, setFollowUps] = useState<ActionFollowUp[]>([]);
  const [opportunities, setOpportunities] = useState<ActionOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (view === "stale") {
        const params = new URLSearchParams({ staleBefore: staleBefore(), limit: "200" });
        if (ownerUserId) params.set("ownerUserId", ownerUserId);
        const rows = await api<ActionOpportunity[]>(`/crm/operations/stale-opportunities?${params}`);
        setOpportunities(rows);
        setFollowUps([]);
      } else {
        const { dayStart, dayEnd } = localDayWindow();
        const params = new URLSearchParams({
          mode: view === "today" ? "TODAY" : "OVERDUE",
          dayStart,
          dayEnd,
          limit: "200",
        });
        if (ownerUserId) params.set("assignedUserId", ownerUserId);
        const rows = await api<ActionFollowUp[]>(`/crm/operations/follow-ups?${params}`);
        setFollowUps(rows);
        setOpportunities([]);
      }
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "CRM aksiyon kuyruğu yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [ownerUserId, view]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = view === "today" ? "Bugünkü Takipler" : view === "stale" ? "Durağan Satış Fırsatları" : "Geciken Takipler";
  const description = useMemo(() => {
    if (view === "today") return "Yerel gün penceresinde tamamlanması gereken açık müşteri temasları.";
    if (view === "stale") return "14+ gündür güncellenmeyen açık fırsatlar; yeniden temas veya aşama güncellemesi bekliyor.";
    return "Planlanan zamanı geçen ve halen açık olan müşteri takipleri.";
  }, [view]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={title}
        description={description}
        action={<div className="flex flex-wrap gap-2"><Link href="/crm"><Button variant="secondary">CRM&apos;e Dön</Button></Link>{view === "stale" ? <Link href="/crm/pipeline"><Button>Pipeline&apos;ı Aç</Button></Link> : <Link href="/crm/follow-ups"><Button>Takip Merkezini Aç</Button></Link>}</div>}
      />

      <div className="flex flex-wrap gap-2">
        <Link href="/crm/actions?view=overdue"><Button variant={view === "overdue" ? "primary" : "secondary"}>Geciken</Button></Link>
        <Link href="/crm/actions?view=today"><Button variant={view === "today" ? "primary" : "secondary"}>Bugün</Button></Link>
        <Link href="/crm/actions?view=stale"><Button variant={view === "stale" ? "primary" : "secondary"}>Durağan Fırsatlar</Button></Link>
      </div>

      {ownerUserId ? <Alert tone="success">Bu görünüm seçilen ekip üyesine göre filtrelendi.</Alert> : null}
      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      {loading ? <Spinner label="CRM aksiyonları hazırlanıyor..." /> : view === "stale" ? (
        opportunities.length ? (
          <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
            <div className="divide-y divide-[var(--line)]">
              {opportunities.map((row) => (
                <Link key={row.id} href={`/crm/opportunities/${row.id}`} className="grid gap-3 px-5 py-4 transition-colors hover:bg-[#f8fcfd] md:grid-cols-[minmax(220px,1.4fr)_150px_130px_130px] md:items-center">
                  <div className="min-w-0"><p className="truncate text-[13px] font-semibold">{row.title}</p><p className="mt-1 truncate text-[10px] text-[var(--muted)]">{row.subjectLabel}</p></div>
                  <span className="w-fit rounded-full bg-[#EAF5FB] px-2.5 py-1 text-[10px] font-semibold text-[#1674BD]">{opportunityStageLabels[row.stage]}</span>
                  <div><p className="text-[9px] text-[var(--muted-soft)]">Ağırlıklı Değer</p><strong className="text-[11px]">{formatMoney(Number(row.estimatedValue ?? 0) * row.probability / 100, row.currency)}</strong></div>
                  <div className="md:text-right"><p className="text-[9px] text-[var(--muted-soft)]">Son Güncelleme</p><strong className="text-[10px]">{formatDateTime(row.updatedAt)}</strong></div>
                </Link>
              ))}
            </div>
          </section>
        ) : <EmptyState title="Durağan Fırsat Yok" description="Bu filtrede 14+ gündür bekleyen açık satış fırsatı bulunmuyor." />
      ) : followUps.length ? (
        <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
          <div className="divide-y divide-[var(--line)]">
            {followUps.map((row) => {
              const href = row.opportunityId ? `/crm/opportunities/${row.opportunityId}` : row.leadId ? `/crm/leads/${row.leadId}` : "/crm/follow-ups";
              return <Link key={row.id} href={href} className="grid gap-3 px-5 py-4 transition-colors hover:bg-[#f8fcfd] md:grid-cols-[110px_minmax(200px,1fr)_minmax(160px,1fr)_170px] md:items-center"><span className="w-fit rounded-full bg-[#EAF5FB] px-2.5 py-1 text-[10px] font-semibold text-[#1674BD]">{followUpChannelLabels[row.channel]}</span><div className="min-w-0"><p className="truncate text-[12px] font-semibold">{row.subjectLabel}</p><p className="mt-1 truncate text-[10px] text-[var(--muted)]">{row.note || "Takip notu bulunmuyor"}</p></div><span className="text-[10px] text-[var(--muted)]">Açık takip · v{row.version}</span><time className={view === "overdue" ? "text-[10px] font-semibold text-[#9c513f] md:text-right" : "text-[10px] text-[var(--muted)] md:text-right"}>{formatDateTime(row.dueAt)}</time></Link>;
            })}
          </div>
        </section>
      ) : <EmptyState title={view === "today" ? "Bugün Takip Yok" : "Geciken Takip Yok"} description="Bu aksiyon kuyruğunda açık kayıt bulunmuyor." />}
    </div>
  );
}
