"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, GlassCard, PageHeader, Panel, Spinner, TableWrap, Td, Th } from "@/components/ui";
import { ApiError } from "@/lib/api";
import {
  ReportFilterBar,
  reportDateInputValue,
  reportRangeIsInvalid,
  reportRangeToQuery,
  type ReportDateRange,
} from "../report-filter-bar";
import { fetchReportPreview, type TableReportPreview } from "../report-preview-client";
import { useReportTableState } from "../use-report-table-state";

type Row = {
  name: string;
  customerSource: string | null;
  customerSince: string;
  visitCount: number;
  completedVisits: number;
  firstVisitAt: string | null;
  lastVisitAt: string | null;
  collected: number;
  averageCollectedPerVisit: number;
};

type Summary = {
  rowCount: number;
  customersWithVisits: number;
  visitCount: number;
  completedVisits: number;
  collected: number;
  averageCollectedPerCustomer: number;
  averageCollectedPerCompletedVisit: number;
};

type ColumnKey =
  | "name"
  | "visitCount"
  | "completedVisits"
  | "lastVisitAt"
  | "collected"
  | "averageCollectedPerVisit";

const COLUMNS: readonly ColumnKey[] = [
  "name",
  "visitCount",
  "completedVisits",
  "lastVisitAt",
  "collected",
  "averageCollectedPerVisit",
];

const LABELS: Record<ColumnKey, string> = {
  name: "Müşteri",
  visitCount: "Ziyaret",
  completedVisits: "Tamamlanan",
  lastVisitAt: "Son Ziyaret",
  collected: "Tahsilat",
  averageCollectedPerVisit: "Ort. Ziyaret",
};

const EMPTY_SUMMARY: Summary = {
  rowCount: 0,
  customersWithVisits: 0,
  visitCount: 0,
  completedVisits: 0,
  collected: 0,
  averageCollectedPerCustomer: 0,
  averageCollectedPerCompletedVisit: 0,
};

const money = (value: number) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value);

const dateLabel = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(value))
    : "—";

export default function CustomerReportPage() {
  const [range, setRange] = useState<ReportDateRange>(() => {
    const today = reportDateInputValue(new Date());
    return { from: today, to: today };
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1 });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const table = useReportTableState<ColumnKey, ColumnKey>({
    columns: COLUMNS,
    initialSort: { key: "collected", direction: "desc" },
  });

  useEffect(() => {
    if (reportRangeIsInvalid(range)) {
      setRows([]);
      setSummary(EMPTY_SUMMARY);
      setError("Başlangıç Tarihi Bitiş Tarihinden Sonra Olamaz.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await fetchReportPreview<TableReportPreview<Row, Summary>>({
          reportKey: "customers.performance",
          filters: reportRangeToQuery(range),
          columns: COLUMNS,
          sort: table.sort,
          page: meta.page,
          limit: 25,
        });
        if (!cancelled) {
          setRows(result.data);
          setSummary(result.meta.summary);
          setMeta({ page: result.meta.page, totalPages: result.meta.totalPages || 1 });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Müşteri raporu yüklenemedi.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [range, table.sort, meta.page]);

  useEffect(() => {
    setMeta((current) => ({ ...current, page: 1 }));
  }, [range, table.sort]);

  const filtered = useMemo(() => {
    const normalized = query.toLocaleLowerCase("tr-TR");
    return rows.filter((row) => row.name.toLocaleLowerCase("tr-TR").includes(normalized));
  }, [query, rows]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Müşteri Raporları"
        description="Ziyaret ve tahsilat davranışını kişisel iletişim verilerini açığa çıkarmadan analiz edin."
      />
      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      <ReportFilterBar from={range.from} to={range.to} onChange={setRange} />

      {loading ? (
        <Spinner label="Müşteri raporu hazırlanıyor..." />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Müşteri" value={summary.rowCount.toLocaleString("tr-TR")} detail={`${summary.customersWithVisits} ziyaret eden`} />
            <Metric label="Toplam Ziyaret" value={summary.visitCount.toLocaleString("tr-TR")} detail={`${summary.completedVisits} tamamlanan`} />
            <Metric label="Tahsilat" value={money(summary.collected)} detail="Seçilen dönem" />
            <Metric label="Müşteri Başına" value={money(summary.averageCollectedPerCustomer)} detail="Ziyaret eden müşteri başına" />
          </section>

          <Panel>
            <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-[16px] font-semibold text-[var(--ink)]">Müşteri Performansı</h2>
                <p className="mt-1 text-[12px] text-[var(--muted)]">Telefon, e-posta ve doğum tarihi bu rapor kontratına dahil değildir.</p>
              </div>
              <input
                aria-label="Müşteri Ara"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Bu sayfada ara..."
                className="h-9 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-[12px]"
              />
            </div>

            {filtered.length === 0 ? (
              <div className="px-5 py-10 text-center text-[13px] text-[var(--muted)]">Seçilen tarih aralığında veri bulunamadı.</div>
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    {table.visibleColumnList.map((column) => (
                      <Th key={column}>
                        <button type="button" onClick={() => table.toggleSort(column)} className="inline-flex items-center gap-1">
                          <span>{LABELS[column]}</span>
                          <span className="text-[10px] text-[var(--muted-soft)]">{table.sort.key === column ? (table.sort.direction === "asc" ? "↑" : "↓") : "↕"}</span>
                        </button>
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={`${row.name}-${row.customerSince}`}>
                      {table.visibleColumns.has("name") ? <Td label="Müşteri" className="font-medium">{row.name}</Td> : null}
                      {table.visibleColumns.has("visitCount") ? <Td label="Ziyaret">{row.visitCount}</Td> : null}
                      {table.visibleColumns.has("completedVisits") ? <Td label="Tamamlanan">{row.completedVisits}</Td> : null}
                      {table.visibleColumns.has("lastVisitAt") ? <Td label="Son Ziyaret">{dateLabel(row.lastVisitAt)}</Td> : null}
                      {table.visibleColumns.has("collected") ? <Td label="Tahsilat" className="font-semibold">{money(row.collected)}</Td> : null}
                      {table.visibleColumns.has("averageCollectedPerVisit") ? <Td label="Ort. Ziyaret">{money(row.averageCollectedPerVisit)}</Td> : null}
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] px-5 py-4">
              <button type="button" disabled={meta.page <= 1} onClick={() => setMeta((current) => ({ ...current, page: current.page - 1 }))} className="rounded-lg border border-[var(--line)] px-3 py-2 text-[11px] disabled:opacity-40">Önceki</button>
              <span className="text-[11px] text-[var(--muted)]">{meta.page} / {meta.totalPages}</span>
              <button type="button" disabled={meta.page >= meta.totalPages} onClick={() => setMeta((current) => ({ ...current, page: current.page + 1 }))} className="rounded-lg border border-[var(--line)] px-3 py-2 text-[11px] disabled:opacity-40">Sonraki</button>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <GlassCard>
      <p className="text-[11px] text-[var(--muted)]">{label}</p>
      <p className="mt-1.5 text-[24px] font-semibold text-[var(--ink)]">{value}</p>
      <p className="mt-1 text-[10px] text-[var(--muted-soft)]">{detail}</p>
    </GlassCard>
  );
}
