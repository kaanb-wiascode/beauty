"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, EmptyState, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import {
  followUpChannelLabels,
  leadStatusLabels,
  opportunityStageLabels,
  type CrmFollowUp,
  type CrmLead,
  type OpportunityStage,
} from "@/lib/crm-types";

const pipelineStages: OpportunityStage[] = ["QUALIFIED", "NEEDS_ANALYSIS", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];

type OperationsSummary = {
  metrics: {
    newLeads: number; openOpportunities: number; weightedPipeline: number; overdueFollowUps: number;
    todayFollowUps: number; wonOpportunities: number; lostOpportunities: number; closing30Days: number;
    forecast30Days: number; staleOpportunities: number; conversionRate: number;
  };
  pipeline: Array<{ stage: OpportunityStage; count: number; totalValue: number; weightedValue: number }>;
  aging: { age0to7: number; age8to14: number; age15to30: number; age31plus: number };
  ownerWorkload: Array<{
    ownerUserId: string | null; firstName: string | null; lastName: string | null; email: string | null;
    openOpportunityCount: number; weightedValue: number; openFollowUpCount: number; overdueFollowUpCount: number;
  }>;
};

const emptySummary: OperationsSummary = {
  metrics: { newLeads: 0, openOpportunities: 0, weightedPipeline: 0, overdueFollowUps: 0, todayFollowUps: 0, wonOpportunities: 0, lostOpportunities: 0, closing30Days: 0, forecast30Days: 0, staleOpportunities: 0, conversionRate: 0 },
  pipeline: [], aging: { age0to7: 0, age8to14: 0, age15to30: 0, age31plus: 0 }, ownerWorkload: [],
};

function formatMoney(value: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
function localDayWindow() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { dayStart: start.toISOString(), dayEnd: end.toISOString() };
}

export default function CrmOverviewPage() {
  const canManage = hasPermission("crm", "manage");
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [followUps, setFollowUps] = useState<CrmFollowUp[]>([]);
  const [summary, setSummary] = useState<OperationsSummary>(emptySummary);
  const [now] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { dayStart, dayEnd } = localDayWindow();
      const params = new URLSearchParams({ dayStart, dayEnd });
      const [leadRows, followUpRows, operations] = await Promise.all([
        api<CrmLead[]>("/crm/leads?limit=6"),
        api<CrmFollowUp[]>("/crm/follow-ups?status=OPEN&limit=6"),
        api<OperationsSummary>(`/crm/operations-summary?${params}`),
      ]);
      setLeads(leadRows); setFollowUps(followUpRows); setSummary(operations);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Müşteri İlişkileri Verileri Yüklenemedi.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <Spinner label="Müşteri İlişkileri Görünümü Hazırlanıyor..." />;
  if (error && !leads.length && !followUps.length) return <div className="mx-auto max-w-[900px] space-y-4 py-10"><Alert>{error}</Alert><EmptyState title="Müşteri İlişkileri Verileri Yüklenemedi" description="Bu durum boş bir müşteri havuzu anlamına gelmez. Bağlantıyı veya çalışma kapsamını kontrol edip verileri yeniden yükleyin." action={<Button onClick={() => void load()}>Tekrar Dene</Button>} /></div>;

  const metrics = summary.metrics;
  const stageData = new Map(summary.pipeline.map((row) => [row.stage, row]));
  const aging = [["0–7 Gün", summary.aging.age0to7], ["8–14 Gün", summary.aging.age8to14], ["15–30 Gün", summary.aging.age15to30], ["31+ Gün", summary.aging.age31plus]] as const;
  const metricCards = [
    { label: "Yeni Lead", value: metrics.newLeads, detail: "İlk temas bekliyor", href: "/crm/leads" },
    { label: "Açık Fırsat", value: metrics.openOpportunities, detail: "Aktif satış süreci", href: "/crm/pipeline" },
    { label: "Ağırlıklı Pipeline", value: formatMoney(metrics.weightedPipeline), detail: "Olasılık bazlı", href: "/crm/pipeline" },
    { label: "Bugünkü Takip", value: metrics.todayFollowUps, detail: "Yerel gün penceresi", href: "/crm/actions?view=today" },
    { label: "Geciken Takip", value: metrics.overdueFollowUps, detail: "İşlem gerekli", href: "/crm/actions?view=overdue", danger: metrics.overdueFollowUps > 0 },
    { label: "Kazanma Oranı", value: `%${metrics.conversionRate}`, detail: "Sonuçlanan fırsatlar", href: "/crm/pipeline" },
  ];

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#1674BD]">Müşteri İlişkileri</p><h1 className="mt-1 text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)] sm:text-[38px]">CRM Operasyon Merkezi</h1><p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--muted)]">Satış hunisini, bugünkü müşteri temaslarını, geciken işleri, forecast&apos;i ve ekip iş yükünü tek merkezden yönetin.</p></div><div className="flex flex-col gap-2 sm:flex-row"><Link href="/crm/actions?view=overdue"><Button variant="secondary">Aksiyon Merkezi</Button></Link>{canManage ? <><Link href="/crm/opportunities/new"><Button variant="secondary">+ Yeni Satış Fırsatı</Button></Link><Link href="/crm/leads?new=1"><Button>+ Yeni Potansiyel Müşteri</Button></Link></> : null}</div></header>
    {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" aria-label="CRM operasyon metrikleri">{metricCards.map((card) => <Link key={card.label} href={card.href} className="block"><article className="relative h-full overflow-hidden rounded-[20px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5"><span aria-hidden="true" className={card.danger ? "absolute right-3 top-3 h-2 w-2 rounded-full bg-[#b76d58]" : "absolute right-3 top-3 h-2 w-2 rounded-full bg-[#55D4E1]"} /><p className="text-[11px] font-medium text-[var(--muted)]">{card.label}</p><strong className="mt-3 block text-[22px] font-semibold tracking-[-.045em] text-[var(--ink)]">{card.value}</strong><span className="mt-2 block text-[10px] text-[var(--muted-soft)]">{card.detail}</span></article></Link>)}</section>

    <section className="grid gap-3 sm:grid-cols-3"><article className="rounded-[20px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-soft)]"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#1674BD]">30 Günlük Forecast</p><strong className="mt-3 block text-[24px] font-semibold tracking-[-.04em]">{formatMoney(metrics.forecast30Days)}</strong><p className="mt-2 text-[10px] text-[var(--muted)]">{metrics.closing30Days} fırsat beklenen kapanış penceresinde</p></article><Link href="/crm/actions?view=stale"><article className="h-full rounded-[20px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#1674BD]">Durağan Fırsatlar</p><strong className="mt-3 block text-[24px] font-semibold tracking-[-.04em]">{metrics.staleOpportunities}</strong><p className="mt-2 text-[10px] text-[var(--muted)]">14+ gündür güncellenmeyen açık fırsat</p></article></Link><article className="rounded-[20px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-soft)]"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#1674BD]">Sonuçlanan Fırsatlar</p><strong className="mt-3 block text-[24px] font-semibold tracking-[-.04em]">{metrics.wonOpportunities} / {metrics.wonOpportunities + metrics.lostOpportunities}</strong><p className="mt-2 text-[10px] text-[var(--muted)]">Kazanılan / toplam sonuçlanan</p></article></section>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.7fr)]"><section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]"><div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><h2 className="text-[14px] font-semibold text-[var(--ink)]">Satış Hunisi</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Tüm fırsatların gerçek toplamları</p></div><Link href="/crm/pipeline" className="text-[11px] font-semibold text-[#1674BD]">Satış Sürecini Aç →</Link></div><div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">{pipelineStages.map((stage) => { const data = stageData.get(stage); return <div key={stage} className="rounded-[16px] border border-[#dcebf3] bg-[#f8fcfd] p-3.5"><p className="min-h-8 text-[10px] font-semibold uppercase tracking-[.08em] text-[#5f7280]">{opportunityStageLabels[stage]}</p><strong className="mt-3 block text-[22px] font-semibold tracking-[-.04em]">{data?.count ?? 0}</strong><span className="mt-1 block truncate text-[10px] text-[var(--muted)]">{formatMoney(data?.totalValue ?? 0)}</span></div>; })}</div></section>
      <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]"><div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><h2 className="text-[14px] font-semibold">Öncelikli Takipler</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Geciken ve yaklaşan müşteri temasları</p></div><Link href="/crm/actions?view=overdue" className="text-[11px] font-semibold text-[#1674BD]">Aksiyonlar →</Link></div>{followUps.length ? <div className="divide-y divide-[var(--line)]">{followUps.map((row) => { const overdue = new Date(row.dueAt).getTime() < now; return <Link key={row.id} href={row.opportunityId ? `/crm/opportunities/${row.opportunityId}` : row.leadId ? `/crm/leads/${row.leadId}` : "/crm/follow-ups"} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#f8fcfd]"><span className={overdue ? "h-2 w-2 shrink-0 rounded-full bg-[#b76d58]" : "h-2 w-2 shrink-0 rounded-full bg-[#1674BD]"} /><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-medium">{followUpChannelLabels[row.channel]} Takibi</p><p className="mt-1 truncate text-[10px] text-[var(--muted)]">{row.note || "Takip notu bulunmuyor"}</p></div><time className={overdue ? "text-[10px] font-semibold text-[#9c513f]" : "text-[10px] text-[var(--muted)]"}>{formatDateTime(row.dueAt)}</time></Link>; })}</div> : <EmptyState title="Takip Bulunmuyor" description="Açık müşteri takipleri burada görünür." />}</section></div>

    <div className="grid gap-5 xl:grid-cols-2"><section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]"><div className="border-b border-[var(--line)] px-5 py-4"><h2 className="text-[14px] font-semibold">Fırsat Yaşlandırma</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Açık fırsatların oluşturulma yaşına göre dağılımı</p></div><div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">{aging.map(([label, value]) => <div key={label} className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)]/30 p-4"><p className="text-[10px] text-[var(--muted)]">{label}</p><strong className="mt-2 block text-[22px] font-semibold">{value}</strong></div>)}</div></section>
      <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]"><div className="border-b border-[var(--line)] px-5 py-4"><h2 className="text-[14px] font-semibold">Ekip İş Yükü</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Owner bazında fırsat ve açık takip yoğunluğu</p></div>{summary.ownerWorkload.length ? <div className="divide-y divide-[var(--line)]">{summary.ownerWorkload.slice(0, 8).map((owner) => { const name = [owner.firstName, owner.lastName].filter(Boolean).join(" ") || "Atanmamış"; const actionHref = owner.ownerUserId ? `/crm/actions?view=${owner.overdueFollowUpCount ? "overdue" : "stale"}&ownerUserId=${encodeURIComponent(owner.ownerUserId)}` : "/crm/actions?view=stale"; return <Link key={owner.ownerUserId ?? "unassigned"} href={actionHref} className="grid gap-2 px-5 py-3.5 transition-colors hover:bg-[#f8fcfd] sm:grid-cols-[minmax(0,1fr)_72px_72px_130px] sm:items-center"><div className="min-w-0"><p className="truncate text-[12px] font-semibold">{name}</p><p className="mt-1 truncate text-[10px] text-[var(--muted)]">{owner.email || "Sahipsiz fırsatlar"}</p></div><div><p className="text-[9px] text-[var(--muted-soft)]">Fırsat</p><strong className="text-[12px]">{owner.openOpportunityCount}</strong></div><div><p className="text-[9px] text-[var(--muted-soft)]">Takip</p><strong className="text-[12px]">{owner.openFollowUpCount}</strong></div><div className="sm:text-right"><p className="text-[9px] text-[var(--muted-soft)]">Ağırlıklı Değer</p><strong className="text-[11px]">{formatMoney(owner.weightedValue)}</strong>{owner.overdueFollowUpCount ? <p className="mt-1 text-[9px] font-semibold text-[#9c513f]">{owner.overdueFollowUpCount} geciken</p> : null}</div></Link>; })}</div> : <EmptyState title="İş Yükü Bulunmuyor" description="Aktif fırsat veya açık takip oluştuğunda ekip dağılımı burada görünür." />}</section></div>

    <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]"><div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><h2 className="text-[14px] font-semibold">Son Potansiyel Müşteri Hareketleri</h2><p className="mt-1 text-[10px] text-[var(--muted)]">En son güncellenen potansiyel müşteriler</p></div><Link href="/crm/leads" className="text-[11px] font-semibold text-[#1674BD]">Potansiyel Müşteri Havuzu →</Link></div>{leads.length ? <div className="divide-y divide-[var(--line)]">{leads.map((lead) => <Link key={lead.id} href={`/crm/leads/${lead.id}`} className="grid gap-2 px-5 py-4 transition-colors hover:bg-[#f8fcfd] sm:grid-cols-[minmax(0,1fr)_150px_160px] sm:items-center"><div className="min-w-0"><p className="truncate text-[13px] font-semibold">{lead.firstName} {lead.lastName}</p><p className="mt-1 truncate text-[10px] text-[var(--muted)]">{lead.phone || lead.email || "İletişim bilgisi yok"}</p></div><span className="w-fit rounded-full bg-[#EAF5FB] px-2.5 py-1 text-[10px] font-semibold text-[#1674BD]">{leadStatusLabels[lead.status]}</span><time className="text-[10px] text-[var(--muted)] sm:text-right">{formatDateTime(lead.updatedAt)}</time></Link>)}</div> : <EmptyState title="Henüz Potansiyel Müşteri Yok" description="İlk potansiyel müşterinizi oluşturarak satış sürecini başlatın." action={canManage ? <Link href="/crm/leads?new=1"><Button>Yeni Potansiyel Müşteri Oluştur</Button></Link> : undefined} />}</section>
  </div>;
}
