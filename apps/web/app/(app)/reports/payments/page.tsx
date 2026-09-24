"use client";

import { useEffect, useState } from "react";

import { Alert, GlassCard, PageHeader, Spinner } from "@/components/ui";
import { CardInfo } from "@/components/card-info";
import { ApiError } from "@/lib/api";
import { getCardHelp } from "@/lib/card-help";
import {
  ReportFilterBar,
  reportDateInputValue,
  reportRangeIsInvalid,
  reportRangeToQuery,
  type ReportDateRange,
} from "../report-filter-bar";
import {
  fetchReportPreview,
  type SummaryReportPreview,
} from "../report-preview-client";

type Summary = {
  gross: number;
  refunds: number;
  net: number;
  paymentCount: number;
  refundCount: number;
  methods: { CASH: number; CARD: number; TRANSFER: number };
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default function PaymentReportsPage() {
  const [range, setRange] = useState<ReportDateRange>(() => {
    const today = reportDateInputValue(new Date());
    return { from: today, to: today };
  });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (reportRangeIsInvalid(range)) {
      setSummary(null);
      setError("Başlangıç Tarihi Bitiş Tarihinden Sonra Olamaz.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await fetchReportPreview<SummaryReportPreview<Summary>>({
          reportKey: "payments.summary",
          filters: reportRangeToQuery(range),
        });
        if (!cancelled) setSummary(result.data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Ödeme Raporu Yüklenemedi.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const methodTotal = summary
    ? summary.methods.CASH + summary.methods.CARD + summary.methods.TRANSFER
    : 0;
  const averagePayment =
    summary && summary.paymentCount > 0 ? summary.gross / summary.paymentCount : 0;
  const methodRows = summary
    ? [
        { key: "CARD", label: "Kart", value: summary.methods.CARD },
        { key: "CASH", label: "Nakit", value: summary.methods.CASH },
        { key: "TRANSFER", label: "Havale / EFT", value: summary.methods.TRANSFER },
      ]
    : [];

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 pb-10">
      <PageHeader
        title="Ödeme Raporları"
        description="Ödeme Performansını Analiz Edin, Tahsilat Ve İade Detaylarını İnceleyin."
      />
      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="flex flex-col gap-3 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[0_8px_30px_rgba(30,25,20,0.035)] sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[13px] border border-[var(--line)] bg-white px-4 py-3">
          <span className="text-[17px] text-[var(--muted)]">▣</span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted-soft)]">Rapor Dönemi</p>
            <p className="truncate text-[14px] font-semibold text-[var(--ink)]">{formatDate(range.from)} — {formatDate(range.to)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="h-11 rounded-[12px] border border-[var(--line)] bg-white px-4 text-[13px] font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-muted)]"
        >
          ↓ Raporu Yazdır
        </button>
      </section>

      <ReportFilterBar from={range.from} to={range.to} onChange={setRange} />

      {loading ? (
        <div className="flex min-h-[360px] items-center justify-center">
          <Spinner label="Ödeme Raporu Hazırlanıyor..." />
        </div>
      ) : summary ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Net Tahsilat" value={formatMoney(summary.net)} detail="Brüt Tahsilat − İadeler" />
            <MetricCard label="Brüt Tahsilat" value={formatMoney(summary.gross)} detail={`${summary.paymentCount} İşlem`} />
            <MetricCard label="İadeler" value={formatMoney(summary.refunds)} detail={`${summary.refundCount} İade`} />
            <MetricCard label="Ortalama İşlem" value={formatMoney(averagePayment)} detail="Tahsilat Başına" />
            <MetricCard label="İşlem Sayısı" value={String(summary.paymentCount)} detail="Tamamlanan Tahsilat" />
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <GlassCard className="overflow-hidden p-0">
              <CardHeader title="Tahsilat Özeti" subtitle="Seçilen Dönem İçindeki Finansal Görünüm" />
              <div className="space-y-4 p-5">
                <SummaryRow label="Brüt Tahsilat" value={formatMoney(summary.gross)} />
                <SummaryRow label="İadeler" value={formatMoney(summary.refunds)} negative />
                <SummaryRow label="Net Tahsilat" value={formatMoney(summary.net)} strong />
                <SummaryRow label="Ortalama İşlem" value={formatMoney(averagePayment)} />
              </div>
            </GlassCard>

            <GlassCard className="overflow-hidden p-0">
              <CardHeader title="Ödeme Yöntemleri" subtitle="Tamamlanan Tahsilatların Dağılımı" />
              <div className="space-y-4 p-5">
                {methodRows.map((row) => {
                  const percentage = methodTotal > 0 ? (row.value / methodTotal) * 100 : 0;
                  return (
                    <div key={row.key} className="rounded-[14px] border border-[var(--line)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[13px] font-medium text-[var(--ink)]">{row.label}</span>
                        <span className="text-[13px] font-semibold text-[var(--ink)]">{formatMoney(row.value)}</span>
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, percentage)}%` }} />
                      </div>
                      <p className="mt-1 text-right text-[10px] text-[var(--muted-soft)]">%{percentage.toFixed(1)}</p>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          </section>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <GlassCard className="min-w-0 p-4">
      <div className="mb-2"><CardInfo help={getCardHelp(label, detail)} /></div>
      <p className="truncate text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--muted-soft)]">{label}</p>
      <p className="mt-2 truncate text-[22px] font-semibold tracking-[-0.04em] text-[var(--ink)]">{value}</p>
      <p className="mt-2 truncate text-[11px] text-[var(--muted)]">{detail}</p>
    </GlassCard>
  );
}

function CardHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="border-b border-[var(--line)] px-5 py-4"><div className="mb-2"><CardInfo help={getCardHelp(title, subtitle)} /></div><h2 className="text-[15px] font-semibold text-[var(--ink)]">{title}</h2><p className="mt-1 text-[11px] text-[var(--muted)]">{subtitle}</p></div>;
}

function SummaryRow({ label, value, negative = false, strong = false }: { label: string; value: string; negative?: boolean; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-3 last:border-0 last:pb-0"><span className={`text-[13px] ${strong ? "font-semibold text-[var(--ink)]" : "text-[var(--muted)]"}`}>{label}</span><span className={`text-[14px] ${strong ? "font-semibold" : "font-medium"} ${negative ? "text-[#c85e68]" : "text-[var(--ink)]"}`}>{value}</span></div>;
}
