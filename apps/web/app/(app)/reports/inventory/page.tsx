"use client";

import { useEffect, useState } from "react";
import { Alert, GlassCard, PageHeader, Panel, Spinner, TableWrap, Td, Th } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { ReportFilterBar, reportDateInputValue, reportRangeIsInvalid, reportRangeToQuery, type ReportDateRange } from "../report-filter-bar";
import { fetchReportPreview, type TableReportPreview } from "../report-preview-client";
import { useReportTableState } from "../use-report-table-state";

type Row = { date: string; movementType: string; movementCount: number; quantity: number; movementValue: number };
type Summary = { rowCount: number; movementCount: number; quantity: number; movementValue: number };
type ColumnKey = keyof Row;

const COLUMNS: readonly ColumnKey[] = ["date", "movementType", "movementCount", "quantity", "movementValue"];
const LABELS: Record<ColumnKey, string> = { date: "Tarih", movementType: "Hareket Türü", movementCount: "Hareket", quantity: "Miktar", movementValue: "Maliyet Değeri" };
const EMPTY: Summary = { rowCount: 0, movementCount: 0, quantity: 0, movementValue: 0 };
const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);

export default function InventoryReportPage() {
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
        const result = await fetchReportPreview<TableReportPreview<Row, Summary>>({ reportKey: "inventory.performance", filters: reportRangeToQuery(range), columns: COLUMNS, sort: table.sort, page: meta.page, limit: 25 });
        if (!cancelled) { setRows(result.data); setSummary(result.meta.summary); setMeta({ page: result.meta.page, totalPages: result.meta.totalPages || 1 }); }
      } catch (err) { if (!cancelled) setError(err instanceof ApiError ? err.message : "Stok raporu yüklenemedi."); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [range, table.sort, meta.page]);

  useEffect(() => { setMeta((current) => ({ ...current, page: 1 })); }, [range, table.sort]);

  return <div className="mx-auto max-w-6xl space-y-5">
    <PageHeader title="Stok Raporları" description="Yetkili depo kapsamındaki stok hareketlerini tür, miktar ve maliyet değeri bazında izleyin. Bu görünüm stok değerleme snapshot'ı değil, dönem hareket performansıdır." />
    {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
    <ReportFilterBar from={range.from} to={range.to} onChange={setRange} />
    {loading ? <Spinner label="Stok raporu hazırlanıyor..." /> : <>
      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Toplam Hareket" value={String(summary.movementCount)} detail="Seçilen dönem" />
        <Metric label="Toplam Miktar" value={summary.quantity.toLocaleString("tr-TR")} detail="Hareket miktarlarının toplamı" />
        <Metric label="Hareket Maliyet Değeri" value={money(summary.movementValue)} detail="Kayıtlı birim maliyet üzerinden" />
      </section>
      <Panel>
        {rows.length === 0 ? <div className="px-5 py-10 text-center text-[13px] text-[var(--muted)]">Seçilen dönemde stok hareketi bulunamadı.</div> : <TableWrap><thead><tr>{table.visibleColumnList.map((column) => <Th key={column}><button type="button" onClick={() => table.toggleSort(column)}>{LABELS[column]}</button></Th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.date}-${row.movementType}-${index}`}>
          {table.visibleColumns.has("date") ? <Td label="Tarih">{row.date}</Td> : null}
          {table.visibleColumns.has("movementType") ? <Td label="Hareket Türü">{row.movementType}</Td> : null}
          {table.visibleColumns.has("movementCount") ? <Td label="Hareket">{row.movementCount}</Td> : null}
          {table.visibleColumns.has("quantity") ? <Td label="Miktar">{row.quantity.toLocaleString("tr-TR")}</Td> : null}
          {table.visibleColumns.has("movementValue") ? <Td label="Maliyet Değeri">{money(row.movementValue)}</Td> : null}
        </tr>)}</tbody></TableWrap>}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] px-5 py-4"><button type="button" disabled={meta.page <= 1} onClick={() => setMeta((c) => ({ ...c, page: c.page - 1 }))} className="rounded-lg border border-[var(--line)] px-3 py-2 text-[11px] disabled:opacity-40">Önceki</button><span className="text-[11px] text-[var(--muted)]">{meta.page} / {meta.totalPages}</span><button type="button" disabled={meta.page >= meta.totalPages} onClick={() => setMeta((c) => ({ ...c, page: c.page + 1 }))} className="rounded-lg border border-[var(--line)] px-3 py-2 text-[11px] disabled:opacity-40">Sonraki</button></div>
      </Panel>
    </>}
  </div>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <GlassCard><p className="text-[11px] text-[var(--muted)]">{label}</p><p className="mt-1.5 text-[24px] font-semibold text-[var(--ink)]">{value}</p><p className="mt-1 text-[10px] text-[var(--muted-soft)]">{detail}</p></GlassCard>;
}
