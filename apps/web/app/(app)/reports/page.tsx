"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Alert, Spinner } from "@/components/ui";
import { hasPermission } from "@/lib/auth";
import {
  getReportCatalog,
  type ReportCatalogItem,
  type ReportCatalogKey,
} from "./report-catalog-client";
import {
  fetchReportPreview,
  type ReportPreviewSummary,
  type SummaryReportPreview,
  type TableReportPreview,
} from "./report-preview-client";

type StaffPerformance = {
  name: string;
  appointmentCount: number;
  completedAppointments: number;
  completionRate: number;
  collected: number;
};

type ServicePerformance = {
  name: string;
  appointmentCount: number;
  completedAppointments: number;
  completionRate: number;
  collected: number;
};

type RankedPerformance<T> = {
  top: T | null;
  total: number;
  summary: ReportPreviewSummary;
};

type PaymentSummary = {
  gross: number;
  refunds: number;
  net: number;
  paymentCount: number;
  refundCount: number;
  methods: Record<"CASH" | "CARD" | "TRANSFER", number>;
};

const REPORT_ROUTES: Record<ReportCatalogKey, string> = {
  "staff.performance": "/reports/staff",
  "service.performance": "/reports/services",
  "payments.summary": "/reports/payments",
  "customers.performance": "/reports/customers",
  "sales.performance": "/reports/sales",
  "appointments.performance": "/reports/appointments",
  "branches.performance": "/reports/branches",
  "finance.performance": "/reports/finance",
  "inventory.performance": "/reports/inventory",
  "procurement.performance": "/reports/procurement",
  "crm.performance": "/reports/crm",
  "hr.workforce": "/reports/hr",
  "payroll.summary": "/reports/payroll",
};

function startOfDay(daysAgo = 0) {
  const value = new Date();
  value.setDate(value.getDate() - daysAgo);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay() {
  const value = new Date();
  value.setHours(23, 59, 59, 999);
  return value;
}

function money(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value);
}

function paymentMethodLabel(method: "CASH" | "CARD" | "TRANSFER") {
  if (method === "CASH") return "Nakit";
  if (method === "CARD") return "Kart";
  return "Havale / EFT";
}

export default function ReportsPage() {
  const canReadReports = hasPermission("reports", "read");
  const [catalog, setCatalog] = useState<ReportCatalogItem[]>([]);
  const [staffReport, setStaffReport] = useState<RankedPerformance<StaffPerformance> | null>(null);
  const [serviceReport, setServiceReport] = useState<RankedPerformance<ServicePerformance> | null>(null);
  const [payments, setPayments] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!canReadReports) return;
    setLoading(true);
    setError("");

    try {
      const items = await getReportCatalog();
      setCatalog(items);

      const available = new Set(items.map((item) => item.key));
      const filters = {
        from: startOfDay(29).toISOString(),
        to: endOfDay().toISOString(),
      };

      const staffPromise = available.has("staff.performance")
        ? fetchReportPreview<TableReportPreview<StaffPerformance>>({
            reportKey: "staff.performance",
            filters,
            columns: ["name", "appointmentCount", "completedAppointments", "completionRate", "collected"],
            sort: { key: "collected", direction: "desc" },
            page: 1,
            limit: 1,
          }).then((result) => ({
            top: result.data[0] ?? null,
            total: result.meta.total,
            summary: result.meta.summary,
          }))
        : Promise.resolve(null);

      const servicePromise = available.has("service.performance")
        ? fetchReportPreview<TableReportPreview<ServicePerformance>>({
            reportKey: "service.performance",
            filters,
            columns: ["name", "appointmentCount", "completedAppointments", "completionRate", "collected"],
            sort: { key: "collected", direction: "desc" },
            page: 1,
            limit: 1,
          }).then((result) => ({
            top: result.data[0] ?? null,
            total: result.meta.total,
            summary: result.meta.summary,
          }))
        : Promise.resolve(null);

      const paymentPromise = available.has("payments.summary")
        ? fetchReportPreview<SummaryReportPreview<PaymentSummary>>({
            reportKey: "payments.summary",
            filters,
            columns: ["gross", "refunds", "net", "paymentCount", "refundCount", "methods"],
          }).then((result) => result.data)
        : Promise.resolve(null);

      const [staffResult, serviceResult, paymentResult] = await Promise.allSettled([
        staffPromise,
        servicePromise,
        paymentPromise,
      ] as const);

      setStaffReport(staffResult.status === "fulfilled" ? staffResult.value : null);
      setServiceReport(serviceResult.status === "fulfilled" ? serviceResult.value : null);
      setPayments(paymentResult.status === "fulfilled" ? paymentResult.value : null);

      const failures = [staffResult, serviceResult, paymentResult].filter(
        (result) => result.status === "rejected",
      ).length;
      if (failures) {
        setError(`${failures} özet veri kaynağı yüklenemedi. Yetkili rapor kataloğu kullanılabilir durumda.`);
      }
    } catch (requestError) {
      setCatalog([]);
      setStaffReport(null);
      setServiceReport(null);
      setPayments(null);
      setError(requestError instanceof Error ? requestError.message : "Rapor merkezi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [canReadReports]);

  useEffect(() => { void load(); }, [load]);

  if (!canReadReports) {
    return <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-8 text-[13px] text-[var(--muted)]">Raporları görüntüleme yetkiniz bulunmuyor.</div>;
  }

  if (loading) return <div className="py-16"><Spinner label="Raporlar hazırlanıyor..." /></div>;

  const topStaff = staffReport?.top ?? null;
  const topService = serviceReport?.top ?? null;
  const paymentMethods = payments
    ? [
        { method: "CASH" as const, amount: payments.methods.CASH },
        { method: "CARD" as const, amount: payments.methods.CARD },
        { method: "TRANSFER" as const, amount: payments.methods.TRANSFER },
      ]
    : [];

  function cardValue(key: ReportCatalogKey) {
    if (key === "staff.performance") return `${staffReport?.total ?? 0} personel`;
    if (key === "service.performance") return `${serviceReport?.total ?? 0} hizmet`;
    if (key === "payments.summary") return money(payments?.gross ?? 0);
    return "Raporu aç";
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[.15em] text-[var(--muted-soft)]">Analiz ve raporlama</p>
        <h1 className="mt-1 text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">Rapor merkezi</h1>
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">Yetkinize açık raporları tek katalogdan yönetin; son 30 günün temel operasyon ve tahsilat göstergelerini hızlıca izleyin.</p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Brüt tahsilat" value={payments ? money(payments.gross) : "—"} detail={payments ? `${payments.paymentCount} ödeme · Net ${money(payments.net)}` : "Yetkili ödeme özeti yok"} />
        <Metric label="Randevu tamamlama oranı" value={staffReport ? `%${staffReport.summary.completionRate}` : "—"} detail={staffReport ? `${staffReport.summary.completedAppointments} tamamlanan randevu` : "Yetkili personel raporu yok"} />
        <Metric label="En yüksek personel performansı" value={topStaff?.name ?? "—"} detail={topStaff ? money(topStaff.collected) : "Veri yok"} />
        <Metric label="En yüksek hizmet performansı" value={topService?.name ?? "—"} detail={topService ? money(topService.collected) : "Veri yok"} />
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-[var(--ink)]">Yetkili rapor kataloğu</h2>
            <p className="mt-1 text-[11px] text-[var(--muted)]">Erişim yetkilerinize uygun raporlar gösterilir.</p>
          </div>
          <span className="text-[11px] text-[var(--muted-soft)]">{catalog.length} rapor</span>
        </div>
        {catalog.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {catalog.map((item) => (
              <ReportCard
                key={item.key}
                href={REPORT_ROUTES[item.key]}
                title={item.title}
                description={item.description}
                value={cardValue(item.key)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[20px] border border-dashed border-[var(--line)] p-8 text-center text-[12px] text-[var(--muted)]">Erişim yetkilerinize uygun rapor bulunmuyor.</div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Ödeme yöntemleri" description="Son 30 günlük brüt tahsilat dağılımı">
          <div className="space-y-3">
            {paymentMethods.map((item) => (
              <div key={item.method} className="flex items-center justify-between rounded-[14px] bg-[var(--surface-2)] px-4 py-3">
                <p className="text-[12px] font-semibold text-[var(--ink)]">{paymentMethodLabel(item.method)}</p>
                <p className="text-[13px] font-semibold text-[var(--ink)]">{money(item.amount)}</p>
              </div>
            ))}
            {!paymentMethods.length ? <p className="py-8 text-center text-[12px] text-[var(--muted)]">Yetkili ödeme dağılımı bulunmuyor.</p> : null}
          </div>
        </Panel>

        <Panel title="Rapor Araçları" description="Analiz, karşılaştırma ve rapor yaşam döngüsü">
          <div className="grid gap-3 sm:grid-cols-2">
            <ToolLink href="/reports/compare" title="Dönem Karşılaştırma" description="Mevcut dönemi önceki eşit dönemle kıyaslayın." />
            <ToolLink href="/reports/executive" title="Yönetim Raporu" description="Cross-domain yönetim KPI görünümünü açın." />
            <ToolLink href="/reports/exports" title="Dışa Aktarım Merkezi" description="Raporları Excel, CSV veya PDF olarak hazırlayın ve indirin." />
            <ToolLink href="/reports/schedules" title="Zamanlanmış Raporlar" description="Düzenli oluşturulacak raporların zamanlamasını yönetin." />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <article className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-[10px] text-[var(--muted)]">{label}</p><p className="mt-2 truncate text-[24px] font-semibold tracking-[-.04em] text-[var(--ink)]">{value}</p><p className="mt-1 text-[10px] text-[var(--muted-soft)]">{detail}</p></article>;
}

function ReportCard({ href, title, description, value }: { href: string; title: string; description: string; value: string }) {
  return <Link href={href} className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5 transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(17,70,104,.06)]"><p className="text-[15px] font-semibold text-[var(--ink)]">{title}</p><p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">{description}</p><p className="mt-5 text-[13px] font-semibold text-[var(--accent)]">{value}</p></Link>;
}

function ToolLink({ href, title, description }: { href: string; title: string; description: string }) {
  return <Link href={href} className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] p-4 transition hover:border-[var(--line-strong)]"><p className="text-[12px] font-semibold text-[var(--ink)]">{title}</p><p className="mt-1 text-[10px] leading-5 text-[var(--muted)]">{description}</p></Link>;
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)]"><div className="border-b border-[var(--line)] px-5 py-4"><h2 className="text-[15px] font-semibold text-[var(--ink)]">{title}</h2><p className="mt-1 text-[11px] text-[var(--muted)]">{description}</p></div><div className="p-5">{children}</div></section>;
}
