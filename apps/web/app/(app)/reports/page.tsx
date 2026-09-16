"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Spinner } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import type { Customer, Service, Staff } from "@/lib/types";

type StaffPerformance = {
  id: string;
  name: string;
  appointmentCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  completionRate: number;
  revenue: number;
};

type ServicePerformance = {
  id: string;
  name: string;
  appointmentCount: number;
  completedCount: number;
  revenue: number;
};

type PaymentSummary = {
  totalAmount: number;
  paymentCount: number;
  methods: Array<{ method: string; amount: number; count: number }>;
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
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);
}

function paymentMethodLabel(method: string) {
  if (method === "CASH") return "Nakit";
  if (method === "CARD") return "Kart";
  if (method === "TRANSFER") return "Havale / EFT";
  return "Diğer";
}

export default function ReportsPage() {
  const canReadReports = hasPermission("reports", "read");
  const [staffRows, setStaffRows] = useState<StaffPerformance[]>([]);
  const [serviceRows, setServiceRows] = useState<ServicePerformance[]>([]);
  const [payments, setPayments] = useState<PaymentSummary | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!canReadReports) return;
    setLoading(true);
    setError("");
    try {
      const from = startOfDay(29).toISOString();
      const to = endOfDay().toISOString();
      const [staffPerf, servicePerf, paymentSummary, customerRows, staffList, serviceList] = await Promise.all([
        api<StaffPerformance[]>(withQuery("/reports/staff-performance", { from, to })),
        api<ServicePerformance[]>(withQuery("/reports/service-performance", { from, to })),
        api<PaymentSummary>(withQuery("/reports/payment-summary", { from, to })),
        api<{ data: Customer[] }>(withQuery("/customers", { page: 1, limit: 20 })),
        api<{ data: Staff[] }>(withQuery("/staff", { page: 1, limit: 20 })),
        api<{ data: Service[] }>(withQuery("/services", { page: 1, limit: 20 })),
      ]);
      setStaffRows(staffPerf ?? []);
      setServiceRows(servicePerf ?? []);
      setPayments(paymentSummary);
      setCustomers(customerRows.data ?? []);
      setStaff(staffList.data ?? []);
      setServices(serviceList.data ?? []);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Raporlar Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [canReadReports]);

  useEffect(() => { void load(); }, [load]);

  if (!canReadReports) {
    return <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-8 text-[13px] text-[var(--muted)]">Raporları Görüntüleme Yetkiniz Bulunmuyor.</div>;
  }

  if (loading) return <div className="py-16"><Spinner label="Raporlar Hazırlanıyor..." /></div>;

  const topStaff = [...staffRows].sort((a, b) => b.revenue - a.revenue)[0];
  const topService = [...serviceRows].sort((a, b) => b.revenue - a.revenue)[0];
  const completion = staffRows.length ? Math.round(staffRows.reduce((sum, row) => sum + row.completionRate, 0) / staffRows.length) : 0;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[.15em] text-[var(--muted-soft)]">Analiz Ve Raporlama</p>
        <h1 className="mt-1 text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">Raporlar</h1>
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">Son 30 Günün Personel, Hizmet, Tahsilat Ve Müşteri Göstergelerini Tek Ekrandan İnceleyin.</p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Toplam Tahsilat" value={money(payments?.totalAmount ?? 0)} detail={`${payments?.paymentCount ?? 0} Ödeme`} />
        <Metric label="Randevu Tamamlama Oranı" value={`%${completion}`} detail={`${staffRows.reduce((sum, row) => sum + row.completedCount, 0)} Tamamlanan Randevu`} />
        <Metric label="En Yüksek Personel Performansı" value={topStaff?.name ?? "—"} detail={topStaff ? money(topStaff.revenue) : "Veri Yok"} />
        <Metric label="En Yüksek Hizmet Performansı" value={topService?.name ?? "—"} detail={topService ? money(topService.revenue) : "Veri Yok"} />
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <ReportCard href="/reports/staff" title="Personel Performansı" description="Randevu, Tamamlama Oranı Ve Tahsilat Bazında Personel Karşılaştırması." value={`${staffRows.length} Personel`} />
        <ReportCard href="/reports/services" title="Hizmet Performansı" description="Hizmet Bazında Randevu Sayısı Ve Tahsilat Karşılaştırması." value={`${serviceRows.length} Hizmet`} />
        <ReportCard href="/reports/payments" title="Kasa Ve Tahsilat" description="Ödeme Yöntemleri, Tahsilat Toplamları Ve Kasa Görünümü." value={money(payments?.totalAmount ?? 0)} />
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Ödeme Yöntemleri" description="Son 30 Günlük Tahsilat Dağılımı">
          <div className="space-y-3">
            {(payments?.methods ?? []).map((item) => (
              <div key={item.method} className="flex items-center justify-between rounded-[14px] bg-[var(--surface-2)] px-4 py-3">
                <div><p className="text-[12px] font-semibold text-[var(--ink)]">{paymentMethodLabel(item.method)}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{item.count} Ödeme</p></div>
                <p className="text-[13px] font-semibold text-[var(--ink)]">{money(item.amount)}</p>
              </div>
            ))}
            {!payments?.methods?.length ? <p className="py-8 text-center text-[12px] text-[var(--muted)]">Ödeme Dağılımı Bulunmuyor.</p> : null}
          </div>
        </Panel>

        <Panel title="Kayıt Özeti" description="Aktif Çalışma Kapsamındaki Temel Kayıtlar">
          <div className="grid grid-cols-3 gap-3">
            <SummaryBox label="Müşteri" value={customers.length} />
            <SummaryBox label="Personel" value={staff.length} />
            <SummaryBox label="Hizmet" value={services.length} />
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

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)]"><div className="border-b border-[var(--line)] px-5 py-4"><h2 className="text-[15px] font-semibold text-[var(--ink)]">{title}</h2><p className="mt-1 text-[11px] text-[var(--muted)]">{description}</p></div><div className="p-5">{children}</div></section>;
}

function SummaryBox({ label, value }: { label: string; value: number }) {
  return <div className="rounded-[14px] bg-[var(--surface-2)] p-4 text-center"><p className="text-[22px] font-semibold text-[var(--ink)]">{value}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{label}</p></div>;
}
