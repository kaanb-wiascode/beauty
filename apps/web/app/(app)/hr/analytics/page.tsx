"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, PageHeader, Select, Spinner } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { userErrorMessage, userLabel } from "@/lib/user-language";

type HrAnalytics = {
  year: number;
  month: number;
  headcount: { active?: number; inactive?: number };
  attendance: { records?: number; workedMinutes?: number; overtimeMinutes?: number; absentRecords?: number };
  leaves: { pending?: number; approved?: number; approvedDays?: number | string; unpaidDays?: number | string };
  payroll: null | {
    periodId?: string;
    status?: string;
    employeeCount?: number;
    gross?: number | string;
    net?: number | string;
    employerCost?: number | string;
    salaryPaid?: number | string;
    liabilitiesPaid?: number | string;
  };
};

const hours = (minutes: number | undefined) => Math.round((Number(minutes ?? 0) / 60) * 10) / 10;
const money = (value: number | string | undefined) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(Number(value ?? 0));

export default function HRAnalyticsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<HrAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api<HrAnalytics>(withQuery("/hr/analytics", { year, month })));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? userErrorMessage(requestError.message, "İnsan kaynakları analizi yüklenemedi.") : "İnsan kaynakları analizi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { void load(); }, [load]);

  const totalStaff = Number(data?.headcount.active ?? 0) + Number(data?.headcount.inactive ?? 0);
  const absenceRate = useMemo(() => {
    const records = Number(data?.attendance.records ?? 0);
    return records > 0 ? Math.round((Number(data?.attendance.absentRecords ?? 0) / records) * 1000) / 10 : 0;
  }, [data]);

  return (
    <div className="mx-auto max-w-[1450px] space-y-6 pb-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <PageHeader
          title="İK Analizi"
          description="Çalışan sayısı, çalışma süreleri, izin kullanımı ve bordro sonuçlarını aynı dönem için birlikte değerlendirin."
        />
        <div className="flex flex-wrap gap-2">
          <input className="control h-10 w-24" type="number" value={year} aria-label="Yıl" onChange={(event) => setYear(Number(event.target.value))} />
          <Select className="h-10 min-w-[130px]" value={month} onChange={(event) => setMonth(Number(event.target.value))}>
            {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}. Ay</option>)}
          </Select>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>Yenile</Button>
        </div>
      </div>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      {loading && !data ? <Spinner label="İnsan kaynakları analizi hazırlanıyor..." /> : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FinanceMetric label="Aktif Çalışan" value={Number(data?.headcount.active ?? 0)} detail={String(totalStaff) + " toplam çalışan"} tone="info" />
            <FinanceMetric label="Toplam Çalışma Süresi" value={String(hours(data?.attendance.workedMinutes)) + " saat"} detail={String(Number(data?.attendance.records ?? 0)) + " puantaj kaydı"} tone="success" />
            <FinanceMetric label="Fazla Mesai" value={String(hours(data?.attendance.overtimeMinutes)) + " saat"} detail="Seçilen dönemde kaydedilen süre" tone="warning" />
            <FinanceMetric label="Devamsızlık Oranı" value={"%" + String(absenceRate)} detail={String(Number(data?.attendance.absentRecords ?? 0)) + " devamsızlık kaydı"} tone={absenceRate > 5 ? "warning" : "success"} />
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            <FinancePanel title="İzin Görünümü" description="Bekleyen ve onaylanan izinleri, kullanılan günlerle birlikte görün.">
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricRow label="Bekleyen İzin Talebi" value={Number(data?.leaves.pending ?? 0)} />
                <MetricRow label="Onaylanan İzin Talebi" value={Number(data?.leaves.approved ?? 0)} />
                <MetricRow label="Kullanılan İzin Günü" value={Number(data?.leaves.approvedDays ?? 0)} />
                <MetricRow label="Ücretsiz İzin Günü" value={Number(data?.leaves.unpaidDays ?? 0)} />
              </div>
            </FinancePanel>

            <FinancePanel title="Bordro Görünümü" description="Seçilen dönemde ücret ve çalışan maliyetinin genel durumunu görün.">
              {data?.payroll ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <MetricRow label="Bordroya Dahil Çalışan" value={Number(data.payroll.employeeCount ?? 0)} />
                  <MetricRow label="Bordro Durumu" value={userLabel(data.payroll.status ?? "DRAFT")} />
                  <MetricRow label="Net Ücret Toplamı" value={money(data.payroll.net)} />
                  <MetricRow label="İşveren Maliyeti" value={money(data.payroll.employerCost)} />
                  <MetricRow label="Ödenen Maaş" value={money(data.payroll.salaryPaid)} />
                  <MetricRow label="Ödenen Vergi ve Sosyal Güvenlik" value={money(data.payroll.liabilitiesPaid)} />
                </div>
              ) : (
                <p className="text-[12px] text-[var(--muted)]">Seçilen dönem için henüz bordro kaydı bulunmuyor.</p>
              )}
            </FinancePanel>
          </div>

          <FinancePanel title="Dönem Özeti" description="Seçilen ayın insan kaynakları görünümünü tek bakışta değerlendirin.">
            <div className="grid gap-3 md:grid-cols-3">
              <SummaryCard title="Ekip" text={String(Number(data?.headcount.active ?? 0)) + " aktif çalışan bulunuyor."} />
              <SummaryCard title="Çalışma" text={String(hours(data?.attendance.workedMinutes)) + " saat çalışma ve " + String(hours(data?.attendance.overtimeMinutes)) + " saat fazla mesai kaydedildi."} />
              <SummaryCard title="İzin" text={String(Number(data?.leaves.pending ?? 0)) + " izin talebi bekliyor, " + String(Number(data?.leaves.approvedDays ?? 0)) + " gün izin kullanıldı."} />
            </div>
          </FinancePanel>
        </>
      )}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/35 p-4"><p className="text-[10px] text-[var(--muted)]">{label}</p><p className="mt-1 text-[18px] font-semibold text-[var(--ink)]">{value}</p></div>;
}

function SummaryCard({ title, text }: { title: string; text: string }) {
  return <div className="rounded-[16px] border border-[var(--line)] p-4"><p className="text-[12px] font-semibold text-[var(--ink)]">{title}</p><p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">{text}</p></div>;
}
