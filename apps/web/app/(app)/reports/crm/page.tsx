"use client";

import { useEffect, useState } from "react";
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
  date: string;
  leadCount: number;
  contactedCount: number;
  qualifiedCount: number;
  convertedCount: number;
  lostLeadCount: number;
  opportunityCount: number;
  wonCount: number;
  lostOpportunityCount: number;
  pipelineValue: number;
  wonValue: number;
  leadConversionRate: number;
  winRate: number;
};

type Summary = {
  rowCount: number;
  leadCount: number;
  convertedCount: number;
  lostLeadCount: number;
  leadConversionRate: number;
  opportunityCount: number;
  wonCount: number;
  lostOpportunityCount: number;
  winRate: number;
  pipelineValue: number;
  wonValue: number;
};

type ColumnKey = keyof Row;
const COLUMNS: readonly ColumnKey[] = [
  "date", "leadCount", "contactedCount", "qualifiedCount", "convertedCount",
  "lostLeadCount", "opportunityCount", "wonCount", "lostOpportunityCount",
  "pipelineValue", "wonValue", "leadConversionRate", "winRate",
];
const LABELS: Record<ColumnKey, string> = {
  date: "Tarih", leadCount: "Lead", contactedCount: "İletişim", qualifiedCount: "Nitelikli",
  convertedCount: "Dönüşen", lostLeadCount: "Kaybedilen Lead", opportunityCount: "Fırsat",
  wonCount: "Kazanılan", lostOpportunityCount: "Kaybedilen Fırsat", pipelineValue: "Pipeline",
  wonValue: "Kazanılan Değer", leadConversionRate: "Lead Dönüşüm %", winRate: "Win Rate %",
};
const EMPTY: Summary = {
  rowCount: 0, leadCount: 0, convertedCount: 0, lostLeadCount: 0, leadConversionRate: 0,
  opportunityCount: 0, wonCount: 0, lostOpportunityCount: 0, winRate: 0, pipelineValue: 0, wonValue: 0,
};
const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);

export default function CrmReportPage() {
  const [range, setRange] = useState<ReportDateRange>(() => {
    const today = reportDateInputValue(new Date());
    return { from: today, to: today };
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const table = useReportTableState<ColumnKey, ColumnKey>({ columns: COLUMNS, initialSort: { key: "date", direction: "desc" } });

  useEffect(() => {
    if (reportRangeIsInvalid(range)) {
      setRows([]); setSummary(EMPTY); setError("Başlangıç tarihi bitiş tarihinden sonra olamaz."); setLoading(false); return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true); setError("");
      try {
        const result = await fetchReportPreview<TableReportPreview<Row, Summary>>({
          reportKey: "crm.performance",
          filters: reportRangeToQuery(range),
          columns: COLUMNS,
          sort: table.sort,
          page,
          limit: 25,
        });
        if (!cancelled) {
          setRows(result.data); setSummary(result.meta.summary); setPage(result.meta.page); setTotalPages(result.meta.totalPages || 1);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "CRM raporu yüklenemedi.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [range, table.sort, page]);

  useEffect(() => { setPage(1); }, [range, table.sort]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="CRM Raporları" description="Lead ve fırsat hacmini, dönüşümü ve pipeline değerini PII taşımadan izleyin." />
      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      <ReportFilterBar from={range.from} to={range.to} onChange={setRange} />
      {loading ? <Spinner label="CRM raporu hazırlanıyor..." /> : <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Lead" value={String(summary.leadCount)} detail={`%${summary.leadConversionRate} dönüşüm`} />
          <Metric label="Fırsat" value={String(summary.opportunityCount)} detail={`%${summary.winRate} kazanım`} />
          <Metric label="Pipeline" value={money(summary.pipelineValue)} detail="Aktif + kazanılmış fırsat değeri" />
          <Metric label="Kazanılan Değer" value={money(summary.wonValue)} detail={`${summary.wonCount} kazanılan fırsat`} />
        </section>
        <Panel>
          <TableWrap>
            <thead><tr>{table.visibleColumnList.map((column) => <Th key={column}><button type="button" onClick={() => table.toggleSort(column)}>{LABELS[column]} {table.sort.key === column ? (table.sort.direction === "asc" ? "↑" : "↓") : "↕"}</button></Th>)}</tr></thead>
            <tbody>{rows.map((row) => <tr key={row.date}>{table.visibleColumnList.map((column) => <Td key={column} label={LABELS[column]}>{column === "pipelineValue" || column === "wonValue" ? money(Number(row[column])) : column === "leadConversionRate" || column === "winRate" ? `%${row[column]}` : String(row[column])}</Td>)}</tr>)}</tbody>
          </TableWrap>
          <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] px-5 py-4">
            <button type="button" disabled={page <= 1} onClick={() => setPage((v) => v - 1)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-[11px] disabled:opacity-40">Önceki</button>
            <span className="text-[11px] text-[var(--muted)]">{page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((v) => v + 1)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-[11px] disabled:opacity-40">Sonraki</button>
          </div>
        </Panel>
      </>}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <GlassCard><p className="text-[11px] text-[var(--muted)]">{label}</p><p className="mt-1.5 text-[24px] font-semibold text-[var(--ink)]">{value}</p><p className="mt-1 text-[10px] text-[var(--muted-soft)]">{detail}</p></GlassCard>;
}
