"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CardInfo } from "@/components/card-info";
import { Alert, Button, EmptyState, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { getCardHelp } from "@/lib/card-help";
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
    { label: "Yeni Potansiyel Müşteriler", value: metrics.newLeads, detail: "İlk temas bekleyen kayıtlar", href: "/crm/leads" },
    { label: "Açık Satış Fırsatları", value: metrics.openOpportunities, detail: `${formatMoney(summary.pipeline.reduce((sum,row)=>sum+row.totalValue,0))} toplam değer`, href: "/crm/pipeline" },
    { label: "Bugün Takip Edilecek", value: metrics.todayFollowUps, detail: metrics.overdueFollowUps ? `${metrics.overdueFollowUps} gecikmiş takip` : "Geciken takip yok", href: "/crm/actions?view=today", danger: metrics.overdueFollowUps > 0 },
    { label: "Satış Dönüşümü", value: `%${metrics.conversionRate}`, detail: "Sonuçlanan satış fırsatları", href: "/crm/pipeline" },
    { label: "30 Günlük Beklenen Satış", value: formatMoney(metrics.forecast30Days), detail: `${metrics.closing30Days} fırsat kapanışa yakın`, href: "/crm/pipeline" },
  ];

  return <div className="space-y-6">
    <header className="flex flex-col gap-5 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[12px] font-medium text-[var(--muted)]">Müşteri ve satış yönetimi</p><h1 className="mt-1 text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)] sm:text-[38px]">Müşteri ve Satış Merkezi</h1><p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--muted)]">Yeni müşterileri, satış fırsatlarını, yapılacak takipleri ve ekip yoğunluğunu tek merkezden yönetin.</p></div><div className="flex flex-col gap-2 sm:flex-row"><Link href="/crm/actions?view=overdue"><Button variant="secondary">Öncelikli İşler</Button></Link>{canManage ? <><Link href="/crm/opportunities/new"><Button variant="secondary">+ Yeni Satış Fırsatı</Button></Link><Link href="/crm/leads?new=1"><Button>+ Yeni Potansiyel Müşteri</Button></Link></> : null}</div></header>
    {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Müşteri ve satış göstergeleri">{metricCards.map((card) => <div key={card.label} className="relative"><Link href={card.href} className="block h-full"><article className="relative h-full overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5"><span aria-hidden="true" className={card.danger ? "absolute right-3 top-3 h-2 w-2 rounded-full bg-[var(--danger)]" : "absolute right-3 top-3 h-2 w-2 rounded-full bg-[var(--accent)]"} /><p className="pr-7 text-[11px] font-medium text-[var(--muted)]">{card.label}</p><strong className="mt-3 block text-[22px] font-semibold tracking-[-.045em] text-[var(--ink)]">{card.value}</strong><span className="mt-2 block text-[10px] text-[var(--muted-soft)]">{card.detail}</span></article></Link><div className="absolute right-3 top-3 z-20"><CardInfo help={getCardHelp(card.label, card.detail)} /></div></div>)}</section>

    <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
        <div><h2 className="text-[14px] font-semibold text-[var(--ink)]">Bugünkü Öncelikler</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Önce ele alınması gereken müşteri ve satış konuları</p></div>
        <Link href="/crm/actions?view=overdue" className="text-[10px] font-semibold text-[var(--accent)]">Tüm Öncelikli İşler →</Link>
      </div>
      <div className="grid gap-2 p-4 md:grid-cols-2 xl:grid-cols-4">
        <Link href="/crm/actions?view=overdue" className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] p-3 transition hover:border-[var(--line-strong)]">
          <div className="flex items-start justify-between gap-3"><div><b className="block text-[10px] font-semibold leading-4 text-[var(--ink)]">{metrics.overdueFollowUps} geciken müşteri takibi</b><span className="mt-1.5 block text-[9px] leading-4 text-[var(--muted)]">Geri dönüş bekleyen müşterileri öncelikli ele alın.</span></div><span className={metrics.overdueFollowUps ? "mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--danger)]" : "mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]"} /></div>
        </Link>
        <Link href="/crm/actions?view=stale" className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] p-3 transition hover:border-[var(--line-strong)]">
          <div className="flex items-start justify-between gap-3"><div><b className="block text-[10px] font-semibold leading-4 text-[var(--ink)]">{metrics.staleOpportunities} uzun süredir güncellenmeyen fırsat</b><span className="mt-1.5 block text-[9px] leading-4 text-[var(--muted)]">14 günden uzun süredir hareket görmeyen satış fırsatları.</span></div><span className={metrics.staleOpportunities ? "mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--warning)]" : "mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]"} /></div>
        </Link>
        <Link href="/crm/leads" className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] p-3 transition hover:border-[var(--line-strong)]">
          <div className="flex items-start justify-between gap-3"><div><b className="block text-[10px] font-semibold leading-4 text-[var(--ink)]">{metrics.newLeads} yeni potansiyel müşteri</b><span className="mt-1.5 block text-[9px] leading-4 text-[var(--muted)]">İlk temas bekleyen yeni müşteri kayıtları.</span></div><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" /></div>
        </Link>
        <Link href="/crm/pipeline" className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] p-3 transition hover:border-[var(--line-strong)]">
          <div className="flex items-start justify-between gap-3"><div><b className="block text-[10px] font-semibold leading-4 text-[var(--ink)]">{metrics.closing30Days} fırsat kapanışa yaklaşıyor</b><span className="mt-1.5 block text-[9px] leading-4 text-[var(--muted)]">{formatMoney(metrics.forecast30Days)} beklenen satış değeri.</span></div><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" /></div>
        </Link>
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-3"><article className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]"><div className="flex items-start justify-between gap-3"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">30 Günlük Beklenen Satış</p><CardInfo help={getCardHelp("30 Günlük Beklenen Satış", "Önümüzdeki 30 gün içinde kapanması beklenen fırsatların tahmini satış değerini gösterir.")} /></div><strong className="mt-3 block text-[24px] font-semibold tracking-[-.04em]">{formatMoney(metrics.forecast30Days)}</strong><p className="mt-2 text-[10px] text-[var(--muted)]">{metrics.closing30Days} fırsat beklenen kapanış penceresinde</p></article><div className="relative"><Link href="/crm/actions?view=stale" className="block h-full"><article className="h-full rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5"><p className="pr-7 text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">Uzun Süredir Güncellenmeyen Fırsatlar</p><strong className="mt-3 block text-[24px] font-semibold tracking-[-.04em]">{metrics.staleOpportunities}</strong><p className="mt-2 text-[10px] text-[var(--muted)]">14+ gündür güncellenmeyen açık fırsat</p></article></Link><div className="absolute right-3 top-3 z-20"><CardInfo help={getCardHelp("Uzun Süredir Güncellenmeyen Fırsatlar", "14 günden uzun süredir güncellenmeyen açık satış fırsatlarını gösterir.")} /></div></div><article className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]"><div className="flex items-start justify-between gap-3"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">Sonuçlanan Fırsatlar</p><CardInfo help={getCardHelp("Sonuçlanan Fırsatlar", "Kazanılmış ve kaybedilmiş olarak sonuçlandırılmış satış fırsatlarını özetler.")} /></div><strong className="mt-3 block text-[24px] font-semibold tracking-[-.04em]">{metrics.wonOpportunities} / {metrics.wonOpportunities + metrics.lostOpportunities}</strong><p className="mt-2 text-[10px] text-[var(--muted)]">Kazanılan / toplam sonuçlanan</p></article></section>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.7fr)]"><section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]"><div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><div className="flex items-start gap-2"><CardInfo help={getCardHelp("Satış Süreci", "Satış fırsatlarının aşamalara göre adet ve toplam değer dağılımını gösterir.")} /><div><h2 className="text-[14px] font-semibold text-[var(--ink)]">Satış Süreci</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Satış fırsatlarının aşamalara göre dağılımı</p></div></div></div><Link href="/crm/pipeline" className="text-[11px] font-semibold text-[var(--accent)]">Satış Sürecini Aç →</Link></div><div className="p-5"><div className="flex gap-2 overflow-x-auto pb-2">{pipelineStages.map((stage,index) => { const data = stageData.get(stage); const total=Math.max(1,...pipelineStages.map(item=>stageData.get(item)?.count??0)); const width=Math.max(data?.count?8:0,((data?.count??0)/total)*100); return <Link key={stage} href={`/crm/pipeline?stage=${stage}`} className="group min-w-[145px] flex-1 rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-3.5 transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"><div className="flex items-center justify-between gap-2"><span className="text-[9px] font-semibold text-[var(--muted)] group-hover:text-[var(--accent)]">{opportunityStageLabels[stage]}</span><span className="text-[8px] text-[var(--muted-soft)]">{index+1}/{pipelineStages.length}</span></div><strong className="mt-3 block text-[22px] font-semibold tracking-[-.04em] text-[var(--ink)]">{data?.count ?? 0}</strong><span className="mt-1 block truncate text-[9px] text-[var(--muted)]">{formatMoney(data?.totalValue ?? 0)}</span><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]"><span className="block h-full rounded-full bg-[var(--accent)]" style={{width:`${width}%`}} /></div></Link>; })}</div><div className="mt-3 flex items-center justify-between rounded-[12px] bg-[var(--surface-2)] px-3 py-2 text-[9px] text-[var(--muted)]"><span>Aşamaya tıklayarak ilgili satış fırsatlarını görüntüleyin.</span><span>{metrics.openOpportunities} açık satış fırsatı</span></div></div></section>
      <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]"><div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div className="flex items-start gap-2"><CardInfo help={getCardHelp("Bugünkü Takipler", "Gecikmiş veya zamanı yaklaşmış müşteri takiplerini öncelik sırasıyla gösterir.")} /><div><h2 className="text-[14px] font-semibold">Bugünkü Takipler</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Geciken ve yaklaşan müşteri temasları</p></div></div><Link href="/crm/actions?view=overdue" className="text-[11px] font-semibold text-[var(--accent)]">Öncelikli İşler →</Link></div>{followUps.length ? <div className="divide-y divide-[var(--line)]">{followUps.map((row) => { const overdue = new Date(row.dueAt).getTime() < now; return <Link key={row.id} href={row.opportunityId ? `/crm/opportunities/${row.opportunityId}` : row.leadId ? `/crm/leads/${row.leadId}` : "/crm/follow-ups"} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--surface-2)]"><span className={overdue ? "h-2 w-2 shrink-0 rounded-full bg-[var(--danger)]" : "h-2 w-2 shrink-0 rounded-full bg-[#1674BD]"} /><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-medium">{followUpChannelLabels[row.channel]} Takibi</p><p className="mt-1 truncate text-[10px] text-[var(--muted)]">{row.note || "Takip notu bulunmuyor"}</p></div><time className={overdue ? "text-[10px] font-semibold text-[var(--danger)]" : "text-[10px] text-[var(--muted)]"}>{formatDateTime(row.dueAt)}</time></Link>; })}</div> : <EmptyState title="Takip Bulunmuyor" description="Açık müşteri takipleri burada görünür." />}</section></div>

    <div className="grid gap-5 xl:grid-cols-2"><section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]"><div className="border-b border-[var(--line)] px-5 py-4"><div className="flex items-start gap-2"><CardInfo help={getCardHelp("Fırsatların Yaşı", "Açık satış fırsatlarının ne kadar süredir sistemde olduğunu yaş aralıklarına göre gösterir.")} /><div><h2 className="text-[14px] font-semibold">Fırsatların Yaşı</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Açık satış fırsatlarının ne kadar süredir beklediği</p></div></div></div><div className="space-y-4 p-5">{aging.map(([label,value],index) => { const max=Math.max(1,...aging.map(([,count])=>count)); const width=Math.max(value?6:0,(value/max)*100); return <div key={label}><div className="mb-1.5 flex items-center justify-between gap-3"><span className="text-[10px] font-medium text-[var(--muted)]">{label}</span><strong className={index===3&&value>0?"text-[11px] text-[var(--warning)]":"text-[11px] text-[var(--ink)]"}>{value}</strong></div><div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]"><span className={index===3&&value>0?"block h-full rounded-full bg-[var(--warning)]":"block h-full rounded-full bg-[var(--accent)]"} style={{width:`${width}%`}} /></div></div>; })}<p className="pt-1 text-[9px] leading-4 text-[var(--muted)]">Uzun süredir bekleyen fırsatlar satış ekibinin öncelikli gündemine alınmalıdır.</p></div></section>
      <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]"><div className="border-b border-[var(--line)] px-5 py-4"><div className="flex items-start gap-2"><CardInfo help={getCardHelp("Satış Ekibi", "Sorumlu kişi bazında açık satış fırsatlarını, takipleri, gecikmeleri ve beklenen satış değerini karşılaştırır.")} /><div><h2 className="text-[14px] font-semibold">Satış Ekibi</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Sorumlu kişi bazında açık satış fırsatı ve takip yoğunluğu</p></div></div></div>{summary.ownerWorkload.length ? <div className="divide-y divide-[var(--line)]">{summary.ownerWorkload.slice(0, 8).map((owner) => { const name = [owner.firstName, owner.lastName].filter(Boolean).join(" ") || "Atanmamış"; const actionHref = owner.ownerUserId ? `/crm/actions?view=${owner.overdueFollowUpCount ? "overdue" : "stale"}&ownerUserId=${encodeURIComponent(owner.ownerUserId)}` : "/crm/actions?view=stale"; return <Link key={owner.ownerUserId ?? "unassigned"} href={actionHref} className="grid gap-2 px-5 py-3.5 transition-colors hover:bg-[var(--surface-2)] sm:grid-cols-[minmax(0,1fr)_72px_72px_130px] sm:items-center"><div className="min-w-0"><p className="truncate text-[12px] font-semibold">{name}</p><p className="mt-1 truncate text-[10px] text-[var(--muted)]">{owner.email || "Sahipsiz fırsatlar"}</p></div><div><p className="text-[9px] text-[var(--muted-soft)]">Fırsat</p><strong className="text-[12px]">{owner.openOpportunityCount}</strong></div><div><p className="text-[9px] text-[var(--muted-soft)]">Takip</p><strong className="text-[12px]">{owner.openFollowUpCount}</strong></div><div className="sm:text-right"><p className="text-[9px] text-[var(--muted-soft)]">Beklenen Değer</p><strong className="text-[11px]">{formatMoney(owner.weightedValue)}</strong>{owner.overdueFollowUpCount ? <p className="mt-1 text-[9px] font-semibold text-[var(--danger)]">{owner.overdueFollowUpCount} geciken</p> : null}</div></Link>; })}</div> : <EmptyState title="İş Yükü Bulunmuyor" description="Aktif fırsat veya açık takip oluştuğunda ekip dağılımı burada görünür." />}</section></div>

    <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]"><div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div className="flex items-start gap-2"><CardInfo help={getCardHelp("Son Potansiyel Müşteri Hareketleri", "Son güncellenen potansiyel müşterileri ve mevcut durumlarını hızlı takip için gösterir.")} /><div><h2 className="text-[14px] font-semibold">Son Potansiyel Müşteri Hareketleri</h2><p className="mt-1 text-[10px] text-[var(--muted)]">En son güncellenen potansiyel müşteriler</p></div></div><Link href="/crm/leads" className="text-[11px] font-semibold text-[var(--accent)]">Müşteri Havuzunu Aç →</Link></div>{leads.length ? <div className="divide-y divide-[var(--line)]">{leads.map((lead) => <Link key={lead.id} href={`/crm/leads/${lead.id}`} className="grid gap-2 px-5 py-4 transition-colors hover:bg-[var(--surface-2)] sm:grid-cols-[minmax(0,1fr)_150px_160px] sm:items-center"><div className="min-w-0"><p className="truncate text-[13px] font-semibold">{lead.firstName} {lead.lastName}</p><p className="mt-1 truncate text-[10px] text-[var(--muted)]">{lead.phone || lead.email || "İletişim bilgisi yok"}</p></div><span className="w-fit rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">{leadStatusLabels[lead.status]}</span><time className="text-[10px] text-[var(--muted)] sm:text-right">{formatDateTime(lead.updatedAt)}</time></Link>)}</div> : <EmptyState title="Henüz Potansiyel Müşteri Yok" description="İlk potansiyel müşterinizi oluşturarak satış sürecini başlatın." action={canManage ? <Link href="/crm/leads?new=1"><Button>Yeni Potansiyel Müşteri Oluştur</Button></Link> : undefined} />}</section>
  </div>;
}
