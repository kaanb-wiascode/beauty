"use client";

import { useEffect, useState } from "react";
import { Alert, GlassCard, PageHeader, Panel, Spinner, TableWrap, Td, Th } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { userLabel } from "@/lib/user-language";
import { ReportFilterBar, reportDateInputValue, reportRangeIsInvalid, reportRangeToQuery, type ReportDateRange } from "../report-filter-bar";
import { fetchReportPreview, type TableReportPreview } from "../report-preview-client";
import { useReportTableState } from "../use-report-table-state";

type Row = { date: string; status: string; orderCount: number; totalAmount: number; itemCount: number; receivedCount: number; receiptRate: number };
type Summary = { rowCount: number; orderCount: number; totalAmount: number; itemCount: number; receivedCount: number; receiptRate: number; averageOrderValue: number };
type ColumnKey = keyof Row;

const COLUMNS: readonly ColumnKey[] = ["date", "status", "orderCount", "totalAmount", "itemCount", "receivedCount", "receiptRate"];
const LABELS: Record<ColumnKey, string> = { date: "Tarih", status: "Durum", orderCount: "Sipariş", totalAmount: "Toplam Tutar", itemCount: "Kalem", receivedCount: "Teslim Alınan", receiptRate: "Teslim Oranı" };
const EMPTY: Summary = { rowCount: 0, orderCount: 0, totalAmount: 0, itemCount: 0, receivedCount: 0, receiptRate: 0, averageOrderValue: 0 };
const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);

export default function ProcurementReportPage() {
  const [range, setRange] = useState<ReportDateRange>(() => { const today = reportDateInputValue(new Date()); return { from: today, to: today }; });
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const table = useReportTableState<ColumnKey, ColumnKey>({ columns: COLUMNS, initialSort: { key: "date", direction: "desc" } });

  useEffect(() => {
    if (reportRangeIsInvalid(range)) { setRows([]); setSummary(EMPTY); setError("Başlangıç tarihi bitiş tarihinden sonra olamaz."); setLoading(false); return; }
    let cancelled = false;
    async function load() {
      setLoading(true); setError("");
      try {
        const result = await fetchReportPreview<TableReportPreview<Row, Summary>>({ reportKey: "procurement.performance", filters: reportRangeToQuery(range), columns: COLUMNS, sort: table.sort, page: meta.page, limit: 25 });
        if (!cancelled) { setRows(result.data); setSummary(result.meta.summary); setMeta({ page: result.meta.page, totalPages: result.meta.totalPages || 1 }); }
      } catch (err) { if (!cancelled) setError(err instanceof ApiError ? err.message : "Satın alma raporu yüklenemedi."); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [range, table.sort, meta.page]);

  useEffect(() => { setMeta((current) => ({ ...current, page: 1 })); }, [range, table.sort]);

  return <div className="mx-auto max-w-6xl space-y-5">
    <PageHeader title="Satın Alma Raporları" description="Yetkili depo/şube kapsamındaki satın alma siparişlerini hacim, tutar, kalem ve teslim alma performansıyla izleyin." />
    {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
    <ReportFilterBar from={range.from} to={range.to} onChange={setRange} />
    {loading ? <Spinner label="Satın alma raporu hazırlanıyor..." /> : <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Sipariş" value={String(summary.orderCount)} detail={`${summary.itemCount} kalem`} />
        <Metric label="Sipariş Hacmi" value={money(summary.totalAmount)} detail={`Ortalama ${money(summary.averageOrderValue)}`} />
        <Metric label="Teslim Alınan" value={String(summary.receivedCount)} detail={`%${summary.receiptRate} teslim oranı`} />
        <Metric label="Toplam Kalem" value={String(summary.itemCount)} detail="Sipariş satırları" />
      </section>
      <Panel>
        {rows.length === 0 ? <div className="px-5 py-10 text-center text-[13px] text-[var(--muted)]">Seçilen dönemde satın alma siparişi bulunamadı.</div> : <TableWrap><thead><tr>{table.visibleColumnList.map((column) => <Th key={column}><button type="button" onClick={() => table.toggleSort(column)}>{LABELS[column]}</button></Th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.date}-${row.status}-${index}`}>
          {table.visibleColumns.has("date") ? <Td label="Tarih">{row.date}</Td> : null}
          {table.visibleColumns.has("status") ? <Td label="Durum">{userLabel(row.status)}</Td> : null}
          {table.visibleColumns.has("orderCount") ? <Td label="Sipariş">{row.orderCount}</Td> : null}
          {table.visibleColumns.has("totalAmount") ? <Td label="Toplam Tutar">{money(row.totalAmount)}</Td> : null}
          {table.visibleColumns.has("itemCount") ? <Td label="Kalem">{row.itemCount}</Td> : null}
          {table.visibleColumns.has("receivedCount") ? <Td label="Teslim Alınan">{row.receivedCount}</Td> : null}
          {table.visibleColumns.has("receiptRate") ? <Td label="Teslim Oranı">%{row.receiptRate}</Td> : null}
        </tr>)}</tbody></TableWrap>}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] px-5 py-4"><button type="button" disabled={meta.page <= 1} onClick={() => setMeta((c) => ({ ...c, page: c.page - 1 }))} className="rounded-lg border border-[var(--line)] px-3 py-2 text-[11px] disabled:opacity-40">Önceki</button><span className="text-[11px] text-[var(--muted)]">{meta.page} / {meta.totalPages}</span><button type="button" disabled={meta.page >= meta.totalPages} onClick={() => setMeta((c) => ({ ...c, page: c.page + 1 }))} className="rounded-lg border border-[var(--line)] px-3 py-2 text-[11px] disabled:opacity-40">Sonraki</button></div>
      </Panel>
    </>}
  </div>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <GlassCard><p className="text-[11px] text-[var(--muted)]">{label}</p><p className="mt-1.5 text-[24px] font-semibold text-[var(--ink)]">{value}</p><p className="mt-1 text-[10px] text-[var(--muted-soft)]">{detail}</p></GlassCard>;
}
