"use client";

import { useEffect, useState } from "react";
import { Alert, GlassCard, PageHeader, Panel, Spinner, TableWrap, Td, Th } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { ReportFilterBar, reportDateInputValue, reportRangeIsInvalid, reportRangeToQuery, type ReportDateRange } from "../report-filter-bar";
import { fetchReportPreview, type TableReportPreview } from "../report-preview-client";
import { useReportTableState } from "../use-report-table-state";

type Row = { confirmedAt: string; customerName: string; revenue: number; collected: number; refunded: number; outstanding: number; itemCount: number };
type Summary = { rowCount: number; saleCount: number; revenue: number; collected: number; refunded: number; netCollected: number; outstanding: number; discountTotal: number; averageBasket: number; collectionRate: number };
type ColumnKey = "confirmedAt" | "customerName" | "revenue" | "collected" | "refunded" | "outstanding" | "itemCount";

const COLUMNS: readonly ColumnKey[] = ["confirmedAt", "customerName", "revenue", "collected", "refunded", "outstanding", "itemCount"];
const LABELS: Record<ColumnKey, string> = { confirmedAt: "Satış Tarihi", customerName: "Müşteri", revenue: "Ciro", collected: "Tahsilat", refunded: "İade", outstanding: "Açık Bakiye", itemCount: "Kalem" };
const EMPTY_SUMMARY: Summary = { rowCount: 0, saleCount: 0, revenue: 0, collected: 0, refunded: 0, netCollected: 0, outstanding: 0, discountTotal: 0, averageBasket: 0, collectionRate: 0 };
const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);
const dateTimeLabel = (value: string) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export default function SalesReportPage() {
  const [range, setRange] = useState<ReportDateRange>(() => { const today = reportDateInputValue(new Date()); return { from: today, to: today }; });
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const table = useReportTableState<ColumnKey, ColumnKey>({ columns: COLUMNS, initialSort: { key: "confirmedAt", direction: "desc" } });

  useEffect(() => {
    if (reportRangeIsInvalid(range)) { setRows([]); setSummary(EMPTY_SUMMARY); setError("Başlangıç Tarihi Bitiş Tarihinden Sonra Olamaz."); setLoading(false); return; }
    let cancelled = false;
    async function load() {
      setLoading(true); setError("");
      try {
        const result = await fetchReportPreview<TableReportPreview<Row, Summary>>({ reportKey: "sales.performance", filters: reportRangeToQuery(range), columns: COLUMNS, sort: table.sort, page: meta.page, limit: 25 });
        if (!cancelled) { setRows(result.data); setSummary(result.meta.summary); setMeta({ page: result.meta.page, totalPages: result.meta.totalPages || 1 }); }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Satış raporu yüklenemedi.");
      } finally { if (!cancelled) setLoading(false); }
    }
    void load(); return () => { cancelled = true; };
  }, [range, table.sort, meta.page]);

  useEffect(() => { setMeta((current) => ({ ...current, page: 1 })); }, [range, table.sort]);

  return <div className="mx-auto max-w-6xl space-y-5">
    <PageHeader title="Satış Raporları" description="Ciro, tahsilat, iade ve açık bakiyeyi birbirinden ayırarak onaylanmış satışları analiz edin." />
    {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
    <ReportFilterBar from={range.from} to={range.to} onChange={setRange} />
    {loading ? <Spinner label="Satış raporu hazırlanıyor..." /> : <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Ciro" value={money(summary.revenue)} detail={`${summary.saleCount} onaylı satış`} />
        <Metric label="Tahsilat" value={money(summary.collected)} detail={`%${summary.collectionRate} tahsilat oranı`} />
        <Metric label="Açık Bakiye" value={money(summary.outstanding)} detail="Satış toplamı - tamamlanan tahsilat" />
        <Metric label="Ortalama Sepet" value={money(summary.averageBasket)} detail={`${money(summary.refunded)} iade`} />
      </section>
      <Panel>
        <div className="border-b border-[var(--line)] px-5 py-4"><h2 className="text-[16px] font-semibold text-[var(--ink)]">Satış Detayı</h2><p className="mt-1 text-[12px] text-[var(--muted)]">Ciro ve tahsilat ayrı metriklerdir; yalnız onaylanmış satışlar rapora dahil edilir.</p></div>
        {rows.length === 0 ? <div className="px-5 py-10 text-center text-[13px] text-[var(--muted)]">Seçilen tarih aralığında onaylanmış satış bulunamadı.</div> : <TableWrap><thead><tr>{table.visibleColumnList.map((column) => <Th key={column}><button type="button" onClick={() => table.toggleSort(column)} className="inline-flex items-center gap-1"><span>{LABELS[column]}</span><span className="text-[10px] text-[var(--muted-soft)]">{table.sort.key === column ? (table.sort.direction === "asc" ? "↑" : "↓") : "↕"}</span></button></Th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.confirmedAt}-${row.customerName}-${index}`}>{table.visibleColumns.has("confirmedAt") ? <Td label="Satış Tarihi">{dateTimeLabel(row.confirmedAt)}</Td> : null}{table.visibleColumns.has("customerName") ? <Td label="Müşteri" className="font-medium">{row.customerName}</Td> : null}{table.visibleColumns.has("revenue") ? <Td label="Ciro" className="font-semibold">{money(row.revenue)}</Td> : null}{table.visibleColumns.has("collected") ? <Td label="Tahsilat">{money(row.collected)}</Td> : null}{table.visibleColumns.has("refunded") ? <Td label="İade">{money(row.refunded)}</Td> : null}{table.visibleColumns.has("outstanding") ? <Td label="Açık Bakiye">{money(row.outstanding)}</Td> : null}{table.visibleColumns.has("itemCount") ? <Td label="Kalem">{row.itemCount}</Td> : null}</tr>)}</tbody></TableWrap>}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] px-5 py-4"><button type="button" disabled={meta.page <= 1} onClick={() => setMeta((current) => ({ ...current, page: current.page - 1 }))} className="rounded-lg border border-[var(--line)] px-3 py-2 text-[11px] disabled:opacity-40">Önceki</button><span className="text-[11px] text-[var(--muted)]">{meta.page} / {meta.totalPages}</span><button type="button" disabled={meta.page >= meta.totalPages} onClick={() => setMeta((current) => ({ ...current, page: current.page + 1 }))} className="rounded-lg border border-[var(--line)] px-3 py-2 text-[11px] disabled:opacity-40">Sonraki</button></div>
      </Panel>
    </>}
  </div>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <GlassCard><p className="text-[11px] text-[var(--muted)]">{label}</p><p className="mt-1.5 text-[24px] font-semibold text-[var(--ink)]">{value}</p><p className="mt-1 text-[10px] text-[var(--muted-soft)]">{detail}</p></GlassCard>; }
