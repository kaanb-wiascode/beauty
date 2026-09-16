"use client";

import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/ui";
import { ApiError } from "@/lib/api";
import {
  getReportCatalog,
  type ReportCatalogItem,
  type ReportCatalogKey,
} from "../report-catalog-client";
import {
  ReportFilterBar,
  reportDateInputValue,
  reportRangeToQuery,
  type ReportDateRange,
} from "../report-filter-bar";
import {
  compareReportPeriods,
  type ReportComparisonResult,
} from "../report-comparison-client";

function formatNumber(value: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value);
}

function formatPeriod(value: { from: string; to: string }) {
  return `${new Date(value.from).toLocaleDateString("tr-TR")} – ${new Date(value.to).toLocaleDateString("tr-TR")}`;
}

export default function ReportComparePage() {
  const [catalog, setCatalog] = useState<ReportCatalogItem[]>([]);
  const [reportKey, setReportKey] = useState<ReportCatalogKey | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReportComparisonResult | null>(null);
  const [range, setRange] = useState<ReportDateRange>(() => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(to.getDate() - 6);
    return {
      from: reportDateInputValue(from),
      to: reportDateInputValue(to),
    };
  });

  useEffect(() => {
    let active = true;
    void getReportCatalog()
      .then((items) => {
        if (!active) return;
        setCatalog(items);
        setReportKey(items[0]?.key ?? null);
        setError("");
      })
      .catch((reason) => {
        if (!active) return;
        setCatalog([]);
        setReportKey(null);
        setError(reason instanceof ApiError ? reason.message : "Rapor kataloğu yüklenemedi.");
      })
      .finally(() => {
        if (active) setLoadingCatalog(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selected = useMemo(
    () => catalog.find((item) => item.key === reportKey) ?? null,
    [catalog, reportKey],
  );

  async function runComparison() {
    if (!reportKey) return;
    const filters = reportRangeToQuery(range);
    if (!filters) {
      setError("Geçerli bir tarih aralığı seçin.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      setResult(await compareReportPeriods({ reportKey, filters }));
    } catch (reason) {
      setResult(null);
      setError(reason instanceof ApiError ? reason.message : "Dönem karşılaştırması hazırlanamadı.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10">
      <PageHeader
        title="Dönem Karşılaştırma"
        description="Seçili raporun mevcut dönem KPI'larını hemen önceki eşit uzunluktaki dönemle karşılaştırın. Önceki dönem sunucu tarafından hesaplanır."
      />

      {loadingCatalog ? (
        <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5 text-[13px] text-[var(--muted)]">Yetkili rapor kataloğu yükleniyor...</section>
      ) : catalog.length === 0 ? (
        <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5 text-[13px] text-[var(--muted)]">Karşılaştırılabilir rapor bulunmuyor.</section>
      ) : (
        <>
          <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
            <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted-soft)]">Rapor</label>
            <select
              value={reportKey ?? ""}
              onChange={(event) => {
                setReportKey(event.target.value as ReportCatalogKey);
                setResult(null);
              }}
              className="mt-2 h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-[13px] text-[var(--ink)] sm:max-w-md"
            >
              {catalog.map((item) => <option key={item.key} value={item.key}>{item.title}</option>)}
            </select>
            {selected ? <p className="mt-2 text-[11px] text-[var(--muted)]">{selected.description}</p> : null}
          </section>

          <ReportFilterBar from={range.from} to={range.to} onChange={(next) => { setRange(next); setResult(null); }} />

          <div className="flex justify-end">
            <button
              type="button"
              disabled={loading || !reportKey}
              onClick={() => void runComparison()}
              className="h-11 rounded-xl bg-[var(--accent)] px-5 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              {loading ? "Karşılaştırılıyor..." : "Önceki Dönemle Karşılaştır"}
            </button>
          </div>

          {error ? <p className="text-[12px] text-red-600">{error}</p> : null}

          {result ? (
            <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-[14px] font-semibold text-[var(--ink)]">KPI Karşılaştırması</h2>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">Mevcut: {formatPeriod(result.currentPeriod)}</p>
                  <p className="text-[10px] text-[var(--muted-soft)]">Önceki: {formatPeriod(result.previousPeriod)}</p>
                </div>
                <span className="text-[10px] text-[var(--muted-soft)]">{result.metrics.length} metrik</span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {result.metrics.map((metric) => (
                  <article key={metric.key} className="rounded-xl border border-[var(--line)] bg-white p-3">
                    <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--muted-soft)]">{metric.key}</p>
                    <p className="mt-2 text-[18px] font-semibold text-[var(--ink)]">{formatNumber(metric.current)}</p>
                    <div className="mt-2 flex items-center justify-between text-[10px]">
                      <span className="text-[var(--muted)]">Önceki {formatNumber(metric.previous)}</span>
                      <span className={metric.delta > 0 ? "text-emerald-600" : metric.delta < 0 ? "text-red-600" : "text-[var(--muted)]"}>
                        {metric.delta > 0 ? "+" : ""}{formatNumber(metric.delta)}
                        {metric.deltaPercent === null ? "" : ` (${metric.deltaPercent > 0 ? "+" : ""}${formatNumber(metric.deltaPercent)}%)`}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
