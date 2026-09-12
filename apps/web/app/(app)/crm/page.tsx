"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, EmptyState, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import {
  followUpChannelLabels,
  leadStatusLabels,
  opportunityStageLabels,
  type CrmFollowUp,
  type CrmLead,
  type CrmOpportunity,
  type OpportunityStage,
} from "@/lib/crm-types";

const pipelineStages: OpportunityStage[] = [
  "QUALIFIED",
  "NEEDS_ANALYSIS",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
];

function formatMoney(value: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function CrmOverviewPage() {
  const canManage = hasPermission("crm", "manage");
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [opportunities, setOpportunities] = useState<CrmOpportunity[]>([]);
  const [followUps, setFollowUps] = useState<CrmFollowUp[]>([]);
  const [now] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [leadRows, opportunityRows, followUpRows] = await Promise.all([
        api<CrmLead[]>("/crm/leads?limit=200"),
        api<CrmOpportunity[]>("/crm/opportunities?limit=200"),
        api<CrmFollowUp[]>("/crm/follow-ups?status=OPEN&limit=100"),
      ]);
      setLeads(leadRows);
      setOpportunities(opportunityRows);
      setFollowUps(followUpRows);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "CRM verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(() => {
    const openOpportunities = opportunities.filter((row) => !["WON", "LOST"].includes(row.stage));
    const weightedPipeline = openOpportunities.reduce(
      (sum, row) => sum + Number(row.estimatedValue ?? 0) * (row.probability / 100),
      0,
    );
    const overdue = followUps.filter((row) => new Date(row.dueAt).getTime() < now).length;
    const won = opportunities.filter((row) => row.stage === "WON").length;
    const decided = opportunities.filter((row) => ["WON", "LOST"].includes(row.stage)).length;
    return {
      newLeads: leads.filter((row) => row.status === "NEW").length,
      openOpportunities: openOpportunities.length,
      weightedPipeline,
      overdue,
      conversionRate: decided ? Math.round((won / decided) * 100) : 0,
    };
  }, [followUps, leads, now, opportunities]);

  if (loading) return <Spinner label="CRM görünümü hazırlanıyor..." />;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#8f89a2]">Müşteri ilişkileri</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)] sm:text-[38px]">CRM Yönetim Kokpiti</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--muted)]">Lead akışını, satış fırsatlarını ve yaklaşan müşteri temaslarını tek merkezden yönetin.</p>
        </div>
        {canManage ? (
          <Link href="/crm/leads?new=1"><Button>+ Yeni lead</Button></Link>
        ) : null}
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="CRM metrikleri">
        {[
          ["Yeni lead", metrics.newLeads, "İlk temas bekliyor"],
          ["Açık fırsat", metrics.openOpportunities, "Aktif pipeline"],
          ["Ağırlıklı değer", formatMoney(metrics.weightedPipeline), "Olasılık bazlı"],
          ["Geciken takip", metrics.overdue, "Aksiyon gerekli"],
          ["Kazanma oranı", `%${metrics.conversionRate}`, "Sonuçlanan fırsatlar"],
        ].map(([label, value, detail], index) => (
          <article key={String(label)} className="relative overflow-hidden rounded-[20px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-soft)]">
            <span aria-hidden="true" className={index === 3 && Number(value) > 0 ? "absolute right-3 top-3 h-2 w-2 rounded-full bg-[#b76d58]" : "absolute right-3 top-3 h-2 w-2 rounded-full bg-[#8d73e8]"} />
            <p className="text-[11px] font-medium text-[var(--muted)]">{label}</p>
            <strong className="mt-3 block text-[24px] font-semibold tracking-[-.045em] text-[var(--ink)]">{value}</strong>
            <span className="mt-2 block text-[10px] text-[var(--muted-soft)]">{detail}</span>
          </article>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.7fr)]">
        <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
            <div><h2 className="text-[14px] font-semibold text-[var(--ink)]">Satış hunisi</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Fırsatların mevcut aşamalara dağılımı</p></div>
            <Link href="/crm/pipeline" className="text-[11px] font-semibold text-[#7052df]">Pipeline’ı aç →</Link>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5">
            {pipelineStages.map((stage) => {
              const rows = opportunities.filter((row) => row.stage === stage);
              const total = rows.reduce((sum, row) => sum + Number(row.estimatedValue ?? 0), 0);
              return (
                <div key={stage} className="rounded-[16px] border border-[#ece9f3] bg-[#fbfaff] p-3.5">
                  <p className="min-h-8 text-[10px] font-semibold uppercase tracking-[.08em] text-[#756c8b]">{opportunityStageLabels[stage]}</p>
                  <strong className="mt-3 block text-[22px] font-semibold tracking-[-.04em]">{rows.length}</strong>
                  <span className="mt-1 block truncate text-[10px] text-[var(--muted)]">{formatMoney(total)}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
            <div><h2 className="text-[14px] font-semibold">Yaklaşan takipler</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Öncelikli müşteri temasları</p></div>
            <Link href="/crm/follow-ups" className="text-[11px] font-semibold text-[#7052df]">Tümü →</Link>
          </div>
          {followUps.length ? (
            <div className="divide-y divide-[var(--line)]">
              {followUps.slice(0, 6).map((row) => {
                const overdue = new Date(row.dueAt).getTime() < now;
                return (
                  <div key={row.id} className="flex items-center gap-3 px-5 py-3.5">
                    <span className={overdue ? "h-2 w-2 shrink-0 rounded-full bg-[#b76d58]" : "h-2 w-2 shrink-0 rounded-full bg-[#7f68d8]"} />
                    <div className="min-w-0 flex-1"><p className="truncate text-[12px] font-medium">{followUpChannelLabels[row.channel]} takibi</p><p className="mt-1 truncate text-[10px] text-[var(--muted)]">{row.note || "Takip notu bulunmuyor"}</p></div>
                    <time className={overdue ? "text-[10px] font-semibold text-[#9c513f]" : "text-[10px] text-[var(--muted)]"}>{formatDateTime(row.dueAt)}</time>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState title="Takip bulunmuyor" description="Açık müşteri takipleri burada görünür." />}
        </section>
      </div>

      <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <div><h2 className="text-[14px] font-semibold">Son lead hareketleri</h2><p className="mt-1 text-[10px] text-[var(--muted)]">En son güncellenen müşteri adayları</p></div>
          <Link href="/crm/leads" className="text-[11px] font-semibold text-[#7052df]">Lead havuzu →</Link>
        </div>
        {leads.length ? (
          <div className="divide-y divide-[var(--line)]">
            {leads.slice(0, 6).map((lead) => (
              <Link key={lead.id} href={`/crm/leads/${lead.id}`} className="grid gap-2 px-5 py-4 transition-colors hover:bg-[#fbfaff] sm:grid-cols-[minmax(0,1fr)_150px_160px] sm:items-center">
                <div className="min-w-0"><p className="truncate text-[13px] font-semibold">{lead.firstName} {lead.lastName}</p><p className="mt-1 truncate text-[10px] text-[var(--muted)]">{lead.phone || lead.email || "İletişim bilgisi yok"}</p></div>
                <span className="w-fit rounded-full bg-[#f1edff] px-2.5 py-1 text-[10px] font-semibold text-[#7052df]">{leadStatusLabels[lead.status]}</span>
                <time className="text-[10px] text-[var(--muted)] sm:text-right">{formatDateTime(lead.updatedAt)}</time>
              </Link>
            ))}
          </div>
        ) : <EmptyState title="Henüz lead yok" description="İlk müşteri adayınızı oluşturarak CRM pipeline’ını başlatın." action={canManage ? <Link href="/crm/leads?new=1"><Button>Yeni lead oluştur</Button></Link> : undefined} />}
      </section>
    </div>
  );
}
