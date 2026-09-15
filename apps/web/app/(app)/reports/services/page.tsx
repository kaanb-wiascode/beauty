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
import {
  fetchReportPreview,
  type ReportPreviewSummary,
  type TableReportPreview,
} from "../report-preview-client";
import { useReportTableState } from "../use-report-table-state";

type Row = {
  name: string;
  price: number;
  status: string;
  branchId: string;
  appointmentCount: number;
  completedAppointments: number;
  completionRate: number;
  collected: number;
};

type ColumnKey =
  | "name"
  | "appointmentCount"
  | "completedAppointments"
  | "completionRate"
  | "collected";

const COLUMNS: readonly ColumnKey[] = [
  "name",
  "appointmentCount",
  "completedAppointments",
  "completionRate",
  "collected",
];

const LABELS: Record<ColumnKey, string> = {
  name: "Hizmet",
  appointmentCount: "Randevu",
  completedAppointments: "Tamamlanan",
  completionRate: "Başarı",
  collected: "Tahsilat",
};

const EMPTY_SUMMARY: ReportPreviewSummary = {
  rowCount: 0,
  appointmentCount: 0,
  completedAppointments: 0,
  completionRate: 0,
  collected: 0,
  averageCollectedPerCompleted: 0,
};

const money = (value: number) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value);

export default function ServiceReportPage() {
  const [range, setRange] = useState<ReportDateRange>(() => {
    const today = reportDateInputValue(new Date());
    return { from: today, to: today };
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState({ page: 1, total: 0, totalPages: 1 });
  const [summary, setSummary] = useState<ReportPreviewSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
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
        const result = await fetchReportPreview<TableReportPreview<Row>>({
          reportKey: "service.performance",
          filters: reportRangeToQuery(range),
          columns: COLUMNS,
          sort: table.sort,
          page: meta.page,
          limit: 25,
        });

        if (!cancelled) {
          setRows(result.data);
          setSummary(result.meta.summary);
          setMeta({
            page: result.meta.page,
            total: result.meta.total,
            totalPages: result.meta.totalPages || 1,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Hizmet Raporu Yüklenemedi.");
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
        title="Hizmet Raporları"
        description="Hangi Hizmetlerin Daha Çok Tercih Edildiğini Ve Kazandırdığını Tek Ekranda Görün."
      />
      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      <ReportFilterBar from={range.from} to={range.to} onChange={setRange} />

      {loading ? (
        <Spinner label="Hizmet Raporu Hazırlanıyor..." />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Toplam Tahsilat" value={money(summary.collected)} detail="Seçilen Dönem" />
            <Metric label="Tamamlanan" value={summary.completedAppointments.toLocaleString("tr-TR")} detail={`%${summary.completionRate} Tamamlanma`} />
            <Metric label="Toplam Randevu" value={summary.appointmentCount.toLocaleString("tr-TR")} detail={`${summary.rowCount} Hizmet`} />
            <Metric label="Ortalama İşlem" value={money(summary.averageCollectedPerCompleted)} detail="Tamamlanan Başına" />
          </section>

          <Panel>
            <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-[16px] font-semibold text-[var(--ink)]">Hizmet Detayları</h2>
                <p className="mt-1 text-[12px] text-[var(--muted)]">Sıralama sunucuda, kolon seçimi server allow-list üzerinden uygulanır.</p>
              </div>
              <div className="flex gap-2">
                <input
                  aria-label="Hizmet Ara"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Bu Sayfada Ara..."
                  className="h-9 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-[12px]"
                />
                <details className="relative">
                  <summary className="flex h-9 cursor-pointer list-none items-center rounded-xl border border-[var(--line)] px-3 text-[12px]">Sütunlar</summary>
                  <div className="absolute right-0 z-20 mt-2 min-w-44 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2 shadow-lg">
                    {COLUMNS.map((column) => (
                      <label key={column} className="flex items-center gap-2 px-2 py-2 text-[12px]">
                        <input
                          type="checkbox"
                          checked={table.visibleColumns.has(column)}
                          onChange={() => table.toggleColumn(column)}
                        />
                        {LABELS[column]}
                      </label>
                    ))}
                  </div>
                </details>
              </div>
            </div>

            {filtered.length === 0 ? (
              <Empty />
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    {table.visibleColumnList.map((column) => (
                      <Th key={column}>
                        <SortButton
                          label={LABELS[column]}
                          active={table.sort.key === column}
                          direction={table.sort.direction}
                          onClick={() => table.toggleSort(column)}
                        />
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={`${row.branchId}-${row.name}`}>
                      {table.visibleColumns.has("name") ? <Td label="Hizmet" className="font-medium">{row.name}</Td> : null}
                      {table.visibleColumns.has("appointmentCount") ? <Td label="Randevu">{row.appointmentCount}</Td> : null}
                      {table.visibleColumns.has("completedAppointments") ? <Td label="Tamamlanan">{row.completedAppointments}</Td> : null}
                      {table.visibleColumns.has("completionRate") ? <Td label="Başarı">%{row.completionRate}</Td> : null}
                      {table.visibleColumns.has("collected") ? <Td label="Tahsilat" className="font-semibold">{money(row.collected)}</Td> : null}
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}

            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              onChange={(page) => setMeta((current) => ({ ...current, page }))}
            />
          </Panel>
        </>
      )}
    </div>
  );
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  return <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] px-5 py-4"><button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-[11px] disabled:opacity-40">Önceki</button><span className="text-[11px] text-[var(--muted)]">{page} / {totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-[11px] disabled:opacity-40">Sonraki</button></div>;
}

function SortButton({ label, active, direction, onClick }: { label: string; active: boolean; direction: "asc" | "desc"; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex items-center gap-1"><span>{label}</span><span className="text-[10px] text-[var(--muted-soft)]">{active ? (direction === "asc" ? "↑" : "↓") : "↕"}</span></button>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <GlassCard><p className="text-[11px] text-[var(--muted)]">{label}</p><p className="mt-1.5 text-[24px] font-semibold text-[var(--ink)]">{value}</p><p className="mt-1 text-[10px] text-[var(--muted-soft)]">{detail}</p></GlassCard>;
}

function Empty() {
  return <div className="px-5 py-10 text-center text-[13px] text-[var(--muted)]">Seçilen Tarih Aralığında Veri Bulunamadı.</div>;
}
