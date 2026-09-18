"use client";

import { useEffect, useState } from "react";
import { Alert, GlassCard, PageHeader, Panel, Spinner, TableWrap, Td, Th } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { ReportDrilldownPanel } from "../report-drilldown-panel";
import { ReportFilterBar, reportDateInputValue, reportRangeIsInvalid, reportRangeToQuery, type ReportDateRange } from "../report-filter-bar";
import { fetchReportPreview, type TableReportPreview } from "../report-preview-client";
import { useReportTableState } from "../use-report-table-state";

type Row = { _rowId?: string; date: string; appointmentCount: number; completedCount: number; cancelledCount: number; noShowCount: number; completionRate: number; newCustomerCount: number; repeatCustomerCount: number; rebookingRate: number; peakHour: number | null };
type Summary = { rowCount: number; appointmentCount: number; completedCount: number; cancelledCount: number; noShowCount: number; completionRate: number; cancellationRate: number; noShowRate: number; newCustomerCount: number; repeatCustomerCount: number; rebookedCustomerCount: number; rebookingRate: number; collected: number };
type ColumnKey = "date" | "appointmentCount" | "completedCount" | "cancelledCount" | "noShowCount" | "completionRate" | "newCustomerCount" | "repeatCustomerCount" | "rebookingRate" | "peakHour";

const COLUMNS: readonly ColumnKey[] = ["date", "appointmentCount", "completedCount", "cancelledCount", "noShowCount", "completionRate", "newCustomerCount", "repeatCustomerCount", "rebookingRate", "peakHour"];
const LABELS: Record<ColumnKey, string> = { date: "Gün", appointmentCount: "Randevu", completedCount: "Tamamlanan", cancelledCount: "İptal", noShowCount: "No-show", completionRate: "Tamamlama", newCustomerCount: "Yeni", repeatCustomerCount: "Tekrar", rebookingRate: "Yeniden Randevu", peakHour: "Yoğun Saat" };
const EMPTY_SUMMARY: Summary = { rowCount: 0, appointmentCount: 0, completedCount: 0, cancelledCount: 0, noShowCount: 0, completionRate: 0, cancellationRate: 0, noShowRate: 0, newCustomerCount: 0, repeatCustomerCount: 0, rebookedCustomerCount: 0, rebookingRate: 0, collected: 0 };
const dateLabel = (value: string) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`));

export default function AppointmentReportPage() {
  const [range, setRange] = useState<ReportDateRange>(() => { const today = reportDateInputValue(new Date()); return { from: today, to: today }; });
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const table = useReportTableState<ColumnKey, ColumnKey>({ columns: COLUMNS, initialSort: { key: "date", direction: "desc" } });

  useEffect(() => {
    if (reportRangeIsInvalid(range)) { setRows([]); setSummary(EMPTY_SUMMARY); setSelected(null); setError("Başlangıç Tarihi Bitiş Tarihinden Sonra Olamaz."); setLoading(false); return; }
    let cancelled = false;
    async function load() {
      setLoading(true); setError(""); setSelected(null);
      try {
        const result = await fetchReportPreview<TableReportPreview<Row, Summary>>({ reportKey: "appointments.performance", filters: reportRangeToQuery(range), columns: COLUMNS, sort: table.sort, page: meta.page, limit: 31 });
        if (!cancelled) { setRows(result.data); setSummary(result.meta.summary); setMeta({ page: result.meta.page, totalPages: result.meta.totalPages || 1 }); }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Randevu raporu yüklenemedi.");
      } finally { if (!cancelled) setLoading(false); }
    }
    void load(); return () => { cancelled = true; };
  }, [range, table.sort, meta.page]);

  useEffect(() => { setMeta((current) => ({ ...current, page: 1 })); }, [range, table.sort]);

  return <div className="mx-auto max-w-6xl space-y-5">
    <PageHeader title="Randevu Raporları" description="Tamamlanma, iptal, no-show, yeni/tekrar müşteri ve yeniden randevu davranışını gün bazında analiz edin." />
    {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
    <ReportFilterBar from={range.from} to={range.to} onChange={setRange} />
    {loading ? <Spinner label="Randevu raporu hazırlanıyor..." /> : <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Toplam Randevu" value={summary.appointmentCount.toLocaleString("tr-TR")} detail={`${summary.completedCount} tamamlanan`} />
        <Metric label="Tamamlama" value={`%${summary.completionRate}`} detail={`%${summary.cancellationRate} iptal`} />
        <Metric label="No-show" value={`%${summary.noShowRate}`} detail={`${summary.noShowCount} randevu`} />
        <Metric label="Yeniden Randevu" value={`%${summary.rebookingRate}`} detail={`${summary.newCustomerCount} yeni / ${summary.repeatCustomerCount} tekrar`} />
      </section>
      <Panel>
        <div className="border-b border-[var(--line)] px-5 py-4"><h2 className="text-[16px] font-semibold text-[var(--ink)]">Günlük Randevu Performansı</h2><p className="mt-1 text-[12px] text-[var(--muted)]">Tarih ve yoğun saat bucketları şu an API UTC zaman standardına göre gösterilir.</p></div>
        {rows.length === 0 ? <div className="px-5 py-10 text-center text-[13px] text-[var(--muted)]">Seçilen tarih aralığında randevu bulunamadı.</div> : <TableWrap><thead><tr>{table.visibleColumnList.map((column) => <Th key={column}><button type="button" onClick={() => table.toggleSort(column)} className="inline-flex items-center gap-1"><span>{LABELS[column]}</span><span className="text-[10px] text-[var(--muted-soft)]">{table.sort.key === column ? (table.sort.direction === "asc" ? "↑" : "↓") : "↕"}</span></button></Th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row._rowId ?? row.date}>{table.visibleColumns.has("date") ? <Td label="Gün"><button type="button" disabled={!row._rowId} onClick={() => row._rowId && setSelected(row)} className="font-medium text-left enabled:hover:text-[var(--accent)] disabled:cursor-default">{dateLabel(row.date)}</button></Td> : null}{table.visibleColumns.has("appointmentCount") ? <Td label="Randevu">{row.appointmentCount}</Td> : null}{table.visibleColumns.has("completedCount") ? <Td label="Tamamlanan">{row.completedCount}</Td> : null}{table.visibleColumns.has("cancelledCount") ? <Td label="İptal">{row.cancelledCount}</Td> : null}{table.visibleColumns.has("noShowCount") ? <Td label="No-show">{row.noShowCount}</Td> : null}{table.visibleColumns.has("completionRate") ? <Td label="Tamamlama">%{row.completionRate}</Td> : null}{table.visibleColumns.has("newCustomerCount") ? <Td label="Yeni">{row.newCustomerCount}</Td> : null}{table.visibleColumns.has("repeatCustomerCount") ? <Td label="Tekrar">{row.repeatCustomerCount}</Td> : null}{table.visibleColumns.has("rebookingRate") ? <Td label="Yeniden Randevu">%{row.rebookingRate}</Td> : null}{table.visibleColumns.has("peakHour") ? <Td label="Yoğun Saat">{row.peakHour === null ? "—" : `${String(row.peakHour).padStart(2, "0")}:00 UTC`}</Td> : null}</tr>)}</tbody></TableWrap>}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] px-5 py-4"><button type="button" disabled={meta.page <= 1} onClick={() => setMeta((current) => ({ ...current, page: current.page - 1 }))} className="rounded-lg border border-[var(--line)] px-3 py-2 text-[11px] disabled:opacity-40">Önceki</button><span className="text-[11px] text-[var(--muted)]">{meta.page} / {meta.totalPages}</span><button type="button" disabled={meta.page >= meta.totalPages} onClick={() => setMeta((current) => ({ ...current, page: current.page + 1 }))} className="rounded-lg border border-[var(--line)] px-3 py-2 text-[11px] disabled:opacity-40">Sonraki</button></div>
      </Panel>
      {selected?._rowId ? <ReportDrilldownPanel reportKey="appointments.performance" rowId={selected._rowId} title={dateLabel(selected.date)} filters={reportRangeToQuery(range)} onClose={() => setSelected(null)} /> : null}
    </>}
  </div>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <GlassCard><p className="text-[11px] text-[var(--muted)]">{label}</p><p className="mt-1.5 text-[24px] font-semibold text-[var(--ink)]">{value}</p><p className="mt-1 text-[10px] text-[var(--muted-soft)]">{detail}</p></GlassCard>; }
