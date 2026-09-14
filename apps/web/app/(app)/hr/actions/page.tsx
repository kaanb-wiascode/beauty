"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";

type HrAnalytics = {
  year: number;
  month: number;
  headcount: { active?: number; inactive?: number };
  attendance: { records?: number; workedMinutes?: number; overtimeMinutes?: number; absentRecords?: number };
  leaves: { pending?: number; approved?: number; approvedDays?: number | string; unpaidDays?: number | string };
  payroll: { periodId?: string; status?: string; employeeCount?: number; gross?: number | string; net?: number | string; employerCost?: number | string; salaryPaid?: number | string; liabilitiesPaid?: number | string } | null;
};

type PayrollDashboard = {
  totals: { employeeCount: number; gross: number | string; net: number | string; employerCost: number | string; tax: number | string; social: number | string; other: number | string };
  settlements: { salaryPaid: number | string; salaryRemaining: number; taxPaid: number | string; taxRemaining: number; socialPaid: number | string; socialRemaining: number; otherPaid: number | string; otherRemaining: number };
  periods: Array<{ id: string; year: number; month: number; status: string; branchName?: string | null; approvedAt?: string | null; postedAt?: string | null }>;
};

type LeaveRow = { id?: string; staffId?: string; firstName?: string; lastName?: string; staffName?: string; type?: string; startDate?: string; endDate?: string; days?: number | string; status?: string; reason?: string | null };
type Load<T> = { data: T | null; error: string };

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const count = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });
const leaveType: Record<string, string> = { ANNUAL: "Yıllık İzin", SICK: "Sağlık", EXCUSE: "Mazeret", UNPAID: "Ücretsiz", OTHER: "Diğer" };
function n(value: number | string | undefined | null) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function date(value?: string | null) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? "—" : new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(d); }

export default function HrActionCenterPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [analytics, setAnalytics] = useState<Load<HrAnalytics>>({ data: null, error: "" });
  const [payroll, setPayroll] = useState<Load<PayrollDashboard>>({ data: null, error: "" });
  const [leaves, setLeaves] = useState<Load<LeaveRow[]>>({ data: null, error: "" });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      api<HrAnalytics>(withQuery("/hr/analytics", { year, month })),
      api<PayrollDashboard>(withQuery("/hr/payroll/dashboard", { year, month })),
      api<unknown>("/hr/leaves"),
    ]);
    const apply = <T,>(result: PromiseSettledResult<T>): Load<T> => result.status === "fulfilled"
      ? { data: result.value, error: "" }
      : { data: null, error: result.reason instanceof ApiError ? result.reason.message : "Veri yüklenemedi." };
    setAnalytics(apply(results[0] as PromiseSettledResult<HrAnalytics>));
    setPayroll(apply(results[1] as PromiseSettledResult<PayrollDashboard>));
    const leaveResult = results[2];
    if (leaveResult.status === "fulfilled") {
      const raw = leaveResult.value as unknown;
      const rows = Array.isArray(raw) ? raw : raw && typeof raw === "object" && "data" in raw && Array.isArray((raw as { data?: unknown }).data) ? (raw as { data: LeaveRow[] }).data : [];
      setLeaves({ data: rows as LeaveRow[], error: "" });
    } else {
      setLeaves({ data: null, error: leaveResult.reason instanceof ApiError ? leaveResult.reason.message : "İzin verileri yüklenemedi." });
    }
    setLoading(false);
  }, [year, month]);

  useEffect(() => { void load(); }, [load]);

  const pendingLeaves = useMemo(() => (leaves.data ?? []).filter((row) => row.status === "PENDING"), [leaves.data]);
  const liabilityRemaining = n(payroll.data?.settlements.taxRemaining) + n(payroll.data?.settlements.socialRemaining) + n(payroll.data?.settlements.otherRemaining);
  const overtimeHours = n(analytics.data?.attendance.overtimeMinutes) / 60;
  const moduleErrors = [analytics.error, payroll.error, leaves.error].filter(Boolean).length;
  const payrollStatus = analytics.data?.payroll?.status ?? payroll.data?.periods?.[0]?.status ?? "—";

  if (loading && !analytics.data && !payroll.data) return <div className="mx-auto max-w-[1380px] py-20"><Spinner label="İK aksiyonları hazırlanıyor..." /></div>;

  return <div className="mx-auto max-w-[1380px] space-y-6 pb-12">
    <header className="flex flex-col gap-5 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_12px_36px_rgba(17,70,104,0.04)] xl:flex-row xl:items-end xl:justify-between">
      <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">İnsan Kaynakları Operasyonu</p><h1 className="text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">İK Aksiyon Merkezi</h1><p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">Bekleyen izinleri, devamsızlık/fazla mesai risklerini, bordro durumunu ve ödeme yükümlülüklerini tek karar ekranında izleyin.</p></div>
      <div className="flex flex-wrap gap-2"><input className="control h-10 w-24" type="number" min="2000" max="2100" value={year} onChange={(event) => setYear(Number(event.target.value))} aria-label="Yıl" /><select className="control h-10 min-w-[110px]" value={month} onChange={(event) => setMonth(Number(event.target.value))} aria-label="Ay">{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}. Ay</option>)}</select><Button variant="secondary" onClick={() => void load()} disabled={loading}>Yenile</Button></div>
    </header>

    {moduleErrors ? <Alert>{moduleErrors} İK veri kaynağına erişilemedi. Kullanılabilir göstergeler gösterilmeye devam ediyor.</Alert> : null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <FinanceMetric label="Bekleyen İzin" value={analytics.data?.leaves.pending ?? pendingLeaves.length} detail={`${analytics.data?.leaves.approved ?? 0} onaylı`} tone={(analytics.data?.leaves.pending ?? pendingLeaves.length) > 0 ? "warning" : "success"} />
      <FinanceMetric label="Devamsızlık" value={analytics.data?.attendance.absentRecords ?? "—"} detail="Dönem puantaj kaydı" tone={(analytics.data?.attendance.absentRecords ?? 0) > 0 ? "warning" : "neutral"} />
      <FinanceMetric label="Fazla Mesai" value={`${count.format(overtimeHours)} sa`} detail={`${analytics.data?.attendance.records ?? 0} puantaj kaydı`} />
      <FinanceMetric label="Bordro Durumu" value={payrollStatus} detail={`${payroll.data?.totals.employeeCount ?? analytics.data?.payroll?.employeeCount ?? 0} çalışan`} />
      <FinanceMetric label="Kalan Maaş" value={money.format(n(payroll.data?.settlements.salaryRemaining))} detail={`Ödenen ${money.format(n(payroll.data?.settlements.salaryPaid))}`} tone={n(payroll.data?.settlements.salaryRemaining) > 0 ? "warning" : "success"} />
      <FinanceMetric label="Vergi + SGK Kalan" value={money.format(liabilityRemaining)} detail="Vergi / sosyal / diğer" tone={liabilityRemaining > 0 ? "warning" : "success"} />
    </section>

    <section className="grid gap-5 xl:grid-cols-2">
      <FinancePanel title="Bekleyen İzin Talepleri" description="Yönetici kararı bekleyen izin kayıtları">
        <div className="space-y-2">{pendingLeaves.slice(0, 20).map((row, index) => <article key={row.id ?? `${row.staffId ?? "leave"}-${index}`} className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/45 p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-[13px] font-semibold text-[var(--ink)]">{row.staffName ?? `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || "Personel"}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{leaveType[row.type ?? ""] ?? row.type ?? "İzin"} · {count.format(n(row.days))} gün</p></div><span className="rounded-full bg-[var(--warning-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--warning)]">Bekliyor</span></div><p className="mt-3 text-[10px] text-[var(--muted)]">{date(row.startDate)} → {date(row.endDate)}</p>{row.reason ? <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">{row.reason}</p> : null}</article>)}{!pendingLeaves.length ? <Empty text="Bekleyen izin talebi yok." /> : null}</div>
        <Links links={[["İzin Yönetimi", "/hr/leaves"]]} />
      </FinancePanel>

      <FinancePanel title="Puantaj & Devam Riski" description="Dönem çalışma, devamsızlık ve fazla mesai özeti">
        <Rows rows={[["Aktif Personel", analytics.data?.headcount.active ?? "—"], ["Puantaj Kaydı", analytics.data?.attendance.records ?? "—"], ["Çalışılan Süre", `${count.format(n(analytics.data?.attendance.workedMinutes) / 60)} saat`], ["Fazla Mesai", `${count.format(overtimeHours)} saat`], ["Devamsız Kayıt", analytics.data?.attendance.absentRecords ?? "—"], ["Ücretsiz İzin", `${count.format(n(analytics.data?.leaves.unpaidDays))} gün`]]} />
        <Links links={[["Puantaj", "/hr/attendance"], ["Çalışanlar", "/hr/employees"]]} />
      </FinancePanel>

      <FinancePanel title="Bordro & Ödeme Riski" description="Tahakkuk, maaş ve yasal yükümlülüklerin kapanma durumu">
        <Rows rows={[["Bordro Durumu", payrollStatus], ["Net Ücret", money.format(n(payroll.data?.totals.net))], ["İşveren Maliyeti", money.format(n(payroll.data?.totals.employerCost))], ["Kalan Maaş", money.format(n(payroll.data?.settlements.salaryRemaining))], ["Vergi Kalan", money.format(n(payroll.data?.settlements.taxRemaining))], ["SGK Kalan", money.format(n(payroll.data?.settlements.socialRemaining))]]} />
        <Links links={[["Bordro Kontrol Merkezi", "/hr/payroll-dashboard"], ["Bordro", "/hr/payroll"], ["Maaş Ödemeleri", "/hr/payments"], ["SGK", "/hr/sgk"]]} />
      </FinancePanel>

      <FinancePanel title="İK Dönem Özeti" description="Aylık operasyonun hızlı kapanış görünümü">
        <Rows rows={[["Aktif Personel", analytics.data?.headcount.active ?? "—"], ["Pasif Personel", analytics.data?.headcount.inactive ?? "—"], ["Onaylı İzin", analytics.data?.leaves.approved ?? "—"], ["Onaylı İzin Günü", count.format(n(analytics.data?.leaves.approvedDays))], ["Bordro Çalışanı", payroll.data?.totals.employeeCount ?? analytics.data?.payroll?.employeeCount ?? "—"], ["Bordro Net", money.format(n(payroll.data?.totals.net ?? analytics.data?.payroll?.net))]]} />
        <Links links={[["İK Genel Bakış", "/hr"], ["Personel Dosyaları", "/hr/personnel-files"]]} />
      </FinancePanel>
    </section>
  </div>;
}

function Rows({ rows }: { rows: Array<[string, string | number]> }) { return <div className="space-y-2">{rows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 rounded-[12px] bg-[var(--surface-2)]/55 px-4 py-3"><span className="text-[12px] text-[var(--muted)]">{label}</span><strong className="text-right text-[13px] text-[var(--ink)]">{value}</strong></div>)}</div>; }
function Links({ links }: { links: Array<[string, string]> }) { return <div className="mt-4 flex flex-wrap gap-2">{links.map(([label, href]) => <Link key={href} href={href} className="rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[11px] font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-2)]">{label}</Link>)}</div>; }
function Empty({ text }: { text: string }) { return <div className="rounded-[14px] border border-dashed border-[var(--line)] px-4 py-8 text-center text-[11px] text-[var(--muted)]">{text}</div>; }
