"use client";

import { CardInfo } from "@/components/card-info";
import { getCardHelp } from "@/lib/card-help";
import { useEffect, useState } from "react";
import { Alert, GlassCard, PageHeader, Panel, Spinner, TableWrap, Td, Th } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { ReportFinanceDrilldownPanel } from "../report-finance-drilldown-panel";
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
  _rowId?: string;
  date: string;
  incomeRecognized: number;
  expenseRecognized: number;
  operatingMargin: number;
  collected: number;
  paid: number;
  netCashMovement: number;
  receivableOutstanding: number;
  payableOutstanding: number;
};

type Summary = {
  rowCount: number;
  incomeRecognized: number;
  expenseRecognized: number;
  operatingMargin: number;
  collected: number;
  paid: number;
  netCashMovement: number;
  receivableOutstanding: number;
  payableOutstanding: number;
  collectionRate: number;
  paymentRate: number;
};

type ColumnKey = Exclude<keyof Row, "_rowId">;

const COLUMNS: readonly ColumnKey[] = [
  "date",
  "incomeRecognized",
  "expenseRecognized",
  "operatingMargin",
  "collected",
  "paid",
  "netCashMovement",
  "receivableOutstanding",
  "payableOutstanding",
];

const LABELS: Record<ColumnKey, string> = {
  date: "Tarih",
  incomeRecognized: "Gelir Kaydı",
  expenseRecognized: "Gider Kaydı",
  operatingMargin: "Operasyonel Marj",
  collected: "Tahsilat",
  paid: "Ödeme",
  netCashMovement: "Net Nakit",
  receivableOutstanding: "Açık Alacak",
  payableOutstanding: "Açık Borç",
};

const EMPTY_SUMMARY: Summary = {
  rowCount: 0,
  incomeRecognized: 0,
  expenseRecognized: 0,
  operatingMargin: 0,
  collected: 0,
  paid: 0,
  netCashMovement: 0,
  receivableOutstanding: 0,
  payableOutstanding: 0,
  collectionRate: 0,
  paymentRate: 0,
};

const money = (value: number) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value);

export default function FinanceReportPage() {
  const [range, setRange] = useState<ReportDateRange>(() => {
    const today = reportDateInputValue(new Date());
    return { from: today, to: today };
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const table = useReportTableState<ColumnKey, ColumnKey>({
    columns: COLUMNS,
    initialSort: { key: "date", direction: "desc" },
  });

  useEffect(() => {
    if (reportRangeIsInvalid(range)) {
      setRows([]);
      setSummary(EMPTY_SUMMARY);
      setSelected(null);
      setError("Başlangıç tarihi bitiş tarihinden sonra olamaz.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      setSelected(null);
      try {
        const result = await fetchReportPreview<TableReportPreview<Row, Summary>>({
          reportKey: "finance.performance",
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
          setError(err instanceof ApiError ? err.message : "Finans raporu yüklenemedi.");
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

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Finans Raporları"
        description="Onaylı gelir/gider kayıtlarını aktif tahsilat ve ödemelerden ayrı izleyin. Bu görünüm operasyonel finans özetidir; yasal muhasebe kâr-zarar tablosu değildir."
      />
      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      <ReportFilterBar from={range.from} to={range.to} onChange={setRange} />

      {loading ? (
        <Spinner label="Finans raporu hazırlanıyor..." />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Gelir Kayıtları" value={money(summary.incomeRecognized)} detail={`%${summary.collectionRate} tahsil edildi`} />
            <Metric label="Gider Kayıtları" value={money(summary.expenseRecognized)} detail={`%${summary.paymentRate} ödendi`} />
            <Metric label="Operasyonel Marj" value={money(summary.operatingMargin)} detail="Gelir kaydı - gider kaydı" />
            <Metric label="Net Nakit Hareketi" value={money(summary.netCashMovement)} detail="Tahsilat - ödeme" />
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <Metric label="Açık Alacak" value={money(summary.receivableOutstanding)} detail="Onaylı gelir kayıtlarında henüz tahsil edilmemiş" />
            <Metric label="Açık Borç" value={money(summary.payableOutstanding)} detail="Onaylı giderlerde henüz ödenmemiş" />
          </section>

          <Panel>
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2 className="text-[16px] font-semibold text-[var(--ink)]">Günlük Finans Hareketi</h2>
              <p className="mt-1 text-[12px] text-[var(--muted)]">Tutarlar kayıt para birimi × kayıt kuruyla TRY karşılığına normalize edilir; ters çevrilmiş tahsilat ve ödemeler aktif toplamdan çıkarılır.</p>
            </div>
            {rows.length === 0 ? (
              <div className="px-5 py-10 text-center text-[13px] text-[var(--muted)]">Seçilen dönemde onaylı gelir veya gider kaydı bulunamadı.</div>
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
                  {rows.map((row) => (
                    <tr key={row.date}>
                      {table.visibleColumns.has("date") ? (
                        <Td label="Tarih">
                          <button
                            type="button"
                            disabled={!row._rowId}
                            onClick={() => row._rowId && setSelected(row)}
                            className="font-medium text-left enabled:hover:text-[var(--accent)] disabled:cursor-default"
                          >
                            {row.date}
                          </button>
                        </Td>
                      ) : null}
                      {table.visibleColumns.has("incomeRecognized") ? <Td label="Gelir Kaydı">{money(row.incomeRecognized)}</Td> : null}
                      {table.visibleColumns.has("expenseRecognized") ? <Td label="Gider Kaydı">{money(row.expenseRecognized)}</Td> : null}
                      {table.visibleColumns.has("operatingMargin") ? <Td label="Operasyonel Marj" className="font-semibold">{money(row.operatingMargin)}</Td> : null}
                      {table.visibleColumns.has("collected") ? <Td label="Tahsilat">{money(row.collected)}</Td> : null}
                      {table.visibleColumns.has("paid") ? <Td label="Ödeme">{money(row.paid)}</Td> : null}
                      {table.visibleColumns.has("netCashMovement") ? <Td label="Net Nakit" className="font-semibold">{money(row.netCashMovement)}</Td> : null}
                      {table.visibleColumns.has("receivableOutstanding") ? <Td label="Açık Alacak">{money(row.receivableOutstanding)}</Td> : null}
                      {table.visibleColumns.has("payableOutstanding") ? <Td label="Açık Borç">{money(row.payableOutstanding)}</Td> : null}
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

          {selected?._rowId ? (
            <ReportFinanceDrilldownPanel
              rowId={selected._rowId}
              title={selected.date}
              filters={reportRangeToQuery(range)}
              onClose={() => setSelected(null)}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <GlassCard>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] text-[var(--muted)]">{label}</p>
        <CardInfo help={getCardHelp(label, detail)} />
      </div>
      <p className="mt-1.5 text-[24px] font-semibold text-[var(--ink)]">{value}</p>
      <p className="mt-1 text-[10px] text-[var(--muted-soft)]">{detail}</p>
    </GlassCard>
  );
}
