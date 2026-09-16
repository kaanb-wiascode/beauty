"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  Alert,
  GlassCard,
  PageHeader,
  Panel,
  Spinner,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { ApiError } from "@/lib/api";
import {
  ReportFilterBar,
  reportDateInputValue,
  reportRangeIsInvalid,
  reportRangeToQuery,
  type ReportDateRange,
} from "../report-filter-bar";
import {
  fetchReportPreview,
  type TableReportPreview,
} from "../report-preview-client";

type BranchPerformanceRow = {
  branchName: string;
  appointmentCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  completionRate: number;
  uniqueCustomerCount: number;
  collected: number;
  averageCollectedPerCompleted: number;
};

type BranchPerformanceSummary = {
  rowCount: number;
  branchCount: number;
  appointmentCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  completionRate: number;
  uniqueCustomerCount: number;
  collected: number;
  averageCollectedPerCompleted: number;
};

const COLUMNS = [
  "branchName",
  "appointmentCount",
  "completedCount",
  "cancelledCount",
  "noShowCount",
  "completionRate",
  "uniqueCustomerCount",
  "collected",
  "averageCollectedPerCompleted",
] as const;

const LABELS: Record<(typeof COLUMNS)[number], string> = {
  branchName: "Şube",
  appointmentCount: "Randevu",
  completedCount: "Tamamlanan",
  cancelledCount: "İptal",
  noShowCount: "No-show",
  completionRate: "Tamamlama %",
  uniqueCustomerCount: "Tekil Müşteri",
  collected: "Tahsilat",
  averageCollectedPerCompleted: "Tamamlanan Başına Tahsilat",
};

const EMPTY_SUMMARY: BranchPerformanceSummary = {
  rowCount: 0,
  branchCount: 0,
  appointmentCount: 0,
  completedCount: 0,
  cancelledCount: 0,
  noShowCount: 0,
  completionRate: 0,
  uniqueCustomerCount: 0,
  collected: 0,
  averageCollectedPerCompleted: 0,
};

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
});

function initialRange(): ReportDateRange {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return {
    from: reportDateInputValue(from),
    to: reportDateInputValue(to),
  };
}

export default function BranchPerformanceReportPage() {
  const [range, setRange] = useState<ReportDateRange>(initialRange);
  const [rows, setRows] = useState<BranchPerformanceRow[]>([]);
  const [summary, setSummary] = useState<BranchPerformanceSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (reportRangeIsInvalid(range)) {
      setError("Başlangıç tarihi bitiş tarihinden sonra olamaz.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError("");
      try {
        const result = await fetchReportPreview<
          TableReportPreview<BranchPerformanceRow, BranchPerformanceSummary>
        >({
          reportKey: "branches.performance",
          filters: reportRangeToQuery(range),
          columns: COLUMNS,
          sort: { key: "collected", direction: "desc" },
          page: 1,
          limit: 100,
        });

        if (!cancelled) {
          setRows(result.data);
          setSummary(result.meta.summary);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof ApiError
              ? requestError.message
              : "Şube performans raporu yüklenemedi.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [range]);

  return (
    <div className="mx-auto max-w-[1320px] space-y-5 pb-10">
      <PageHeader
        title="Şube Performansı"
        description="Yetkili çalışma kapsamınızdaki şubeleri randevu çözümleme, müşteri hacmi ve gerçekleşen tahsilat üzerinden karşılaştırın. Tahsilat yalnız tamamlanmış ödeme kayıtlarından hesaplanır."
        action={
          <Link
            href="/reports/compare"
            className="inline-flex min-h-10 items-center justify-center rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-[13px] font-medium text-[var(--ink)] transition hover:bg-[var(--surface-2)]"
          >
            Dönem Karşılaştırma
          </Link>
        }
      />

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <ReportFilterBar from={range.from} to={range.to} onChange={setRange} />

      {loading ? (
        <Spinner label="Şube performansı hazırlanıyor..." />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Aktif Şube Verisi"
              value={String(summary.branchCount)}
              detail="Seçili dönemde hareketi olan yetkili şubeler"
            />
            <Metric
              label="Tamamlama"
              value={`%${summary.completionRate}`}
              detail={`${summary.completedCount}/${summary.completedCount + summary.cancelledCount + summary.noShowCount} çözümlenmiş randevu`}
            />
            <Metric
              label="Tahsilat"
              value={money.format(summary.collected)}
              detail={`${summary.appointmentCount} toplam randevu`}
            />
            <Metric
              label="Tamamlanan Başına"
              value={money.format(summary.averageCollectedPerCompleted)}
              detail={`${summary.uniqueCustomerCount} şube-toplam tekil müşteri teması`}
            />
          </section>

          <Panel>
            {rows.length ? (
              <TableWrap>
                <thead>
                  <tr>
                    {COLUMNS.map((column) => (
                      <Th key={column}>{LABELS[column]}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.branchName}>
                      {COLUMNS.map((column) => (
                        <Td key={column} label={LABELS[column]}>
                          {formatValue(column, row[column])}
                        </Td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            ) : (
              <div className="px-6 py-16 text-center text-sm text-[var(--muted)]">
                Seçili dönemde yetkili şubeler için raporlanabilir randevu hareketi bulunmuyor.
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

function formatValue(
  column: (typeof COLUMNS)[number],
  value: string | number,
) {
  if (column === "collected" || column === "averageCollectedPerCompleted") {
    return money.format(Number(value));
  }
  if (column === "completionRate") return `%${value}`;
  return String(value);
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <GlassCard>
      <p className="text-[11px] text-[var(--muted)]">{label}</p>
      <p className="mt-1.5 text-[24px] font-semibold text-[var(--ink)]">{value}</p>
      <p className="mt-1 text-[10px] leading-5 text-[var(--muted-soft)]">{detail}</p>
    </GlassCard>
  );
}
