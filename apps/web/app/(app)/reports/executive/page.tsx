"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import {
  fetchReportPreview,
  type ReportPreviewSummary,
  type SummaryReportPreview,
  type TableReportPreview,
} from "../report-preview-client";

type CrmSummary = { newLeads: number; openOpportunities: number; weightedPipeline: number; overdueFollowUps: number; staleOpportunities: number; conversionRate: number; wonOpportunities?: number; lostOpportunities?: number };
type IncomeSummary = { revenue: number; expense: number; netIncome: number };
type PayableSummary = { billCount: number; grossBills: number; creditNotes: number; netBills: number; paid: number; outstanding: number; overdueCount: number };
type Aging = { notDue: number; days0to30: number; days31to60: number; days61to90: number; days90Plus: number; total: number };
type InventoryOverview = { totalProducts?: number; lowStockProducts?: number; totalStockValue?: number; totalAssets?: number; expiringLots?: number };
type StaffPerformance = { name: string; appointmentCount: number; completedAppointments: number; collected: number };
type ServicePerformance = { name: string; appointmentCount: number; completedAppointments: number; collected: number };
type RankedPerformance<T> = { top: T | null; summary: ReportPreviewSummary };
type PaymentSummary = {
  gross: number;
  refunds: number;
  net: number;
  paymentCount: number;
  refundCount: number;
  methods: Record<"CASH" | "CARD" | "TRANSFER", number>;
};
type Load<T> = { data: T | null; error: string };

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });

function startOfDay(daysAgo = 0) { const value = new Date(); value.setDate(value.getDate() - daysAgo); value.setHours(0, 0, 0, 0); return value; }
function endOfDay() { const value = new Date(); value.setHours(23, 59, 59, 999); return value; }

export default function ExecutiveReportsPage() {
  const [crm, setCrm] = useState<Load<CrmSummary>>({ data: null, error: "" });
  const [income, setIncome] = useState<Load<IncomeSummary>>({ data: null, error: "" });
  const [payables, setPayables] = useState<Load<PayableSummary>>({ data: null, error: "" });
  const [aging, setAging] = useState<Load<Aging>>({ data: null, error: "" });
  const [inventory, setInventory] = useState<Load<InventoryOverview>>({ data: null, error: "" });
  const [staff, setStaff] = useState<Load<RankedPerformance<StaffPerformance>>>({ data: null, error: "" });
  const [services, setServices] = useState<Load<RankedPerformance<ServicePerformance>>>({ data: null, error: "" });
  const [payments, setPayments] = useState<Load<PaymentSummary>>({ data: null, error: "" });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const todayStart = startOfDay();
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
    const from = startOfDay(29).toISOString();
    const to = endOfDay().toISOString();
    const filters = { from, to };

    const crmPromise = api<CrmSummary>(`/crm/operations-summary?dayStart=${encodeURIComponent(todayStart.toISOString())}&dayEnd=${encodeURIComponent(todayEnd.toISOString())}`);
    const incomePromise = api<IncomeSummary>(withQuery("/accounting/reports/income-summary", { from, to }));
    const payablesPromise = api<PayableSummary>("/accounts-payable/summary");
    const agingPromise = api<Aging>("/accounts-payable/aging");
    const inventoryPromise = api<InventoryOverview>("/inventory/overview");
    const staffPromise = fetchReportPreview<TableReportPreview<StaffPerformance>>({
      reportKey: "staff.performance",
      filters,
      columns: ["name", "appointmentCount", "completedAppointments", "collected"],
      sort: { key: "collected", direction: "desc" },
      page: 1,
      limit: 1,
    }).then((result) => ({ top: result.data[0] ?? null, summary: result.meta.summary }));
    const servicesPromise = fetchReportPreview<TableReportPreview<ServicePerformance>>({
      reportKey: "service.performance",
      filters,
      columns: ["name", "appointmentCount", "completedAppointments", "collected"],
      sort: { key: "collected", direction: "desc" },
      page: 1,
      limit: 1,
    }).then((result) => ({ top: result.data[0] ?? null, summary: result.meta.summary }));
    const paymentsPromise = fetchReportPreview<SummaryReportPreview<PaymentSummary>>({
      reportKey: "payments.summary",
      filters,
      columns: ["gross", "refunds", "net", "paymentCount", "refundCount", "methods"],
    }).then((result) => result.data);

    const results = await Promise.allSettled([
      crmPromise,
      incomePromise,
      payablesPromise,
      agingPromise,
      inventoryPromise,
      staffPromise,
      servicesPromise,
      paymentsPromise,
    ] as const);
    const apply = <T,>(result: PromiseSettledResult<T>): Load<T> => result.status === "fulfilled"
      ? { data: result.value, error: "" }
      : { data: null, error: result.reason instanceof ApiError ? result.reason.message : "Veri yüklenemedi." };
    setCrm(apply(results[0]));
    setIncome(apply(results[1]));
    setPayables(apply(results[2]));
    setAging(apply(results[3]));
    setInventory(apply(results[4]));
    setStaff(apply(results[5]));
    setServices(apply(results[6]));
    setPayments(apply(results[7]));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const topStaff = staff.data?.top ?? null;
  const topService = services.data?.top ?? null;
  const completed = staff.data?.summary.completedAppointments ?? 0;
  const appointments = staff.data?.summary.appointmentCount ?? 0;
  const completionRate = staff.data?.summary.completionRate ?? 0;
  const moduleErrors = [crm.error, income.error, payables.error, aging.error, inventory.error, staff.error, services.error, payments.error].filter(Boolean).length;

  if (loading && !crm.data && !income.data && !payments.data) return <div className="mx-auto max-w-[1480px] py-20"><Spinner label="Yönetim raporu hazırlanıyor..." /></div>;

  return <div className="mx-auto max-w-[1480px] space-y-6 pb-12">
    <header className="flex flex-col gap-5 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_12px_36px_rgba(17,70,104,0.04)] xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">Analiz & BI</p>
        <h1 className="text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">ERP Yönetim Raporu</h1>
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">CRM, tahsilat, muhasebe, tedarikçi borçları, stok ve operasyon performansını son 30 gün odağında tek karar destek görünümünde izleyin.</p>
      </div>
      <div className="flex flex-wrap gap-2"><Link href="/dashboard/management" className="rounded-[12px] border border-[var(--line)] px-4 py-2.5 text-[12px] font-semibold text-[var(--ink)]">Yönetim Cockpit</Link><Button variant="secondary" onClick={() => void load()} disabled={loading}>Yenile</Button></div>
    </header>

    {moduleErrors ? <Alert>{moduleErrors} veri kaynağına erişilemedi. Kullanılabilir modüller güncel verilerle gösteriliyor.</Alert> : null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <FinanceMetric label="30 Gün Tahsilat" value={money.format(Number(payments.data?.gross ?? 0))} detail={`${payments.data?.paymentCount ?? 0} ödeme · Net ${money.format(Number(payments.data?.net ?? 0))}`} tone="success" />
      <FinanceMetric label="Muhasebe Net Sonuç" value={money.format(Number(income.data?.netIncome ?? 0))} detail={`${money.format(Number(income.data?.revenue ?? 0))} gelir`} tone={(income.data?.netIncome ?? 0) < 0 ? "danger" : "success"} />
      <FinanceMetric label="Açık Tedarikçi Borcu" value={money.format(Number(payables.data?.outstanding ?? 0))} detail={`${payables.data?.overdueCount ?? 0} vadesi geçen`} tone={(payables.data?.overdueCount ?? 0) > 0 ? "warning" : "neutral"} />
      <FinanceMetric label="CRM Pipeline" value={money.format(Number(crm.data?.weightedPipeline ?? 0))} detail={`${crm.data?.openOpportunities ?? 0} açık fırsat`} />
      <FinanceMetric label="Randevu Tamamlama" value={`%${number.format(completionRate)}`} detail={`${completed}/${appointments} tamamlandı`} tone={completionRate >= 80 ? "success" : completionRate > 0 ? "warning" : "neutral"} />
      <FinanceMetric label="Kritik Stok" value={inventory.data?.lowStockProducts ?? "—"} detail={money.format(Number(inventory.data?.totalStockValue ?? 0))} tone={(inventory.data?.lowStockProducts ?? 0) > 0 ? "warning" : "neutral"} />
    </section>

    <section className="grid gap-5 xl:grid-cols-2">
      <FinancePanel title="Finansal Sonuç" description="Muhasebe, tahsilat ve tedarikçi borç görünümü">
        <Rows rows={[["Muhasebe Geliri", money.format(Number(income.data?.revenue ?? 0))], ["Muhasebe Gideri", money.format(Number(income.data?.expense ?? 0))], ["Net Sonuç", money.format(Number(income.data?.netIncome ?? 0))], ["Tahsilat", money.format(Number(payments.data?.gross ?? 0))], ["İade", money.format(Number(payments.data?.refunds ?? 0))], ["Net Tahsilat", money.format(Number(payments.data?.net ?? 0))], ["Açık Tedarikçi Borcu", money.format(Number(payables.data?.outstanding ?? 0))]]} />
        <Links links={[["Muhasebe", "/finance/accounting"], ["Tedarikçi Borçları", "/finance/accounts-payable"], ["Finans Cockpit", "/finance/cfo"]]} />
      </FinancePanel>

      <FinancePanel title="Borç Yaşlandırma" description="Açık tedarikçi borçlarının vade riski">
        <Rows rows={[["Vadesi Gelmemiş", money.format(Number(aging.data?.notDue ?? 0))], ["0–30 Gün", money.format(Number(aging.data?.days0to30 ?? 0))], ["31–60 Gün", money.format(Number(aging.data?.days31to60 ?? 0))], ["61–90 Gün", money.format(Number(aging.data?.days61to90 ?? 0))], ["90+ Gün", money.format(Number(aging.data?.days90Plus ?? 0))]]} />
      </FinancePanel>

      <FinancePanel title="CRM & Satış Riski" description="Pipeline ve takip sağlığı">
        <Rows rows={[["Yeni Lead", crm.data?.newLeads ?? "—"], ["Açık Fırsat", crm.data?.openOpportunities ?? "—"], ["Dönüşüm", crm.data ? `%${number.format(Number(crm.data.conversionRate ?? 0))}` : "—"], ["Geciken Takip", crm.data?.overdueFollowUps ?? "—"], ["Durağan Fırsat", crm.data?.staleOpportunities ?? "—"]]} />
        <Links links={[["CRM", "/crm"], ["Pipeline", "/crm/pipeline"], ["Aksiyon Merkezi", "/crm/actions"]]} />
      </FinancePanel>

      <FinancePanel title="Operasyon Performansı" description="Personel, hizmet ve stok göstergeleri">
        <Rows rows={[["En Yüksek Personel", topStaff ? `${topStaff.name} · ${money.format(Number(topStaff.collected))}` : "—"], ["En Yüksek Hizmet", topService ? `${topService.name} · ${money.format(Number(topService.collected))}` : "—"], ["Toplam Ürün", inventory.data?.totalProducts ?? "—"], ["Kritik Stok", inventory.data?.lowStockProducts ?? "—"], ["Envanter Varlığı", inventory.data?.totalAssets ?? "—"]]} />
        <Links links={[["Personel Raporu", "/reports/staff"], ["Hizmet Raporu", "/reports/services"], ["Envanter", "/inventory"]]} />
      </FinancePanel>
    </section>
  </div>;
}

function Rows({ rows }: { rows: Array<[string, string | number]> }) { return <div className="space-y-2">{rows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 rounded-[12px] bg-[var(--surface-2)]/55 px-4 py-3"><span className="text-[12px] text-[var(--muted)]">{label}</span><strong className="text-right text-[13px] text-[var(--ink)]">{value}</strong></div>)}</div>; }
function Links({ links }: { links: Array<[string, string]> }) { return <div className="mt-4 flex flex-wrap gap-2">{links.map(([label, href]) => <Link key={href} href={href} className="rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[11px] font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-2)]">{label}</Link>)}</div>; }
