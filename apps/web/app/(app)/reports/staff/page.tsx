"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, GlassCard, PageHeader, Panel, Spinner, TableWrap, Td, Th } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { userLabel } from "@/lib/user-language";
import {
  ReportFilterBar,
  reportDateInputValue,
  reportRangeIsInvalid,
  reportRangeToQuery,
  type ReportDateRange,
} from "../report-filter-bar";
import { useReportTableState } from "../use-report-table-state";

type Row = {
  id: string;
  name: string;
  status: string;
  branchId: string;
  appointmentCount: number;
  completedAppointments: number;
  collected: number;
};

type ColumnKey = "name" | "appointments" | "completed" | "rate" | "collected";
type SortKey = ColumnKey;

const STAFF_COLUMNS: readonly ColumnKey[] = [
  "name",
  "appointments",
  "completed",
  "rate",
  "collected",
];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  name: "Personel",
  appointments: "Randevu",
  completed: "Tamamlanan",
  rate: "Başarı",
  collected: "Tahsilat",
};

const money = (value: number) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value);

function completionRate(row: Row) {
  return row.appointmentCount
    ? Math.round((row.completedAppointments / row.appointmentCount) * 100)
    : 0;
}

function compareRows(a: Row, b: Row, key: SortKey) {
  if (key === "name") return a.name.localeCompare(b.name, "tr-TR");
  if (key === "appointments") return a.appointmentCount - b.appointmentCount;
  if (key === "completed") return a.completedAppointments - b.completedAppointments;
  if (key === "rate") return completionRate(a) - completionRate(b);
  return a.collected - b.collected;
}

export default function StaffReportPage() {
  const [range, setRange] = useState<ReportDateRange>(() => {
    const today = reportDateInputValue(new Date());
    return { from: today, to: today };
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metric, setMetric] = useState<"revenue" | "completed">("revenue");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const tableState = useReportTableState<ColumnKey, SortKey>({
    columns: STAFF_COLUMNS,
    initialSort: { key: "collected", direction: "desc" },
  });

  useEffect(() => {
    if (reportRangeIsInvalid(range)) {
      setRows([]);
      setError("Başlangıç Tarihi Bitiş Tarihinden Sonra Olamaz.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await api<Row[]>(
          withQuery("/staff/performance", reportRangeToQuery(range)),
        );
        if (!cancelled) {
          setRows(result);
          setSelected((current) =>
            current && result.some((row) => row.id === current)
              ? current
              : result[0]?.id ?? null,
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Personel Raporu Yüklenemedi.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (total, row) => ({
          appointments: total.appointments + row.appointmentCount,
          completed: total.completed + row.completedAppointments,
          collected: total.collected + row.collected,
        }),
        { appointments: 0, completed: 0, collected: 0 },
      ),
    [rows],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.toLocaleLowerCase("tr-TR");
    return rows
      .filter((row) => row.name.toLocaleLowerCase("tr-TR").includes(normalizedQuery))
      .sort((a, b) => {
        const result = compareRows(a, b, tableState.sort.key);
        return tableState.sort.direction === "asc" ? result : -result;
      });
  }, [query, rows, tableState.sort]);

  const ranked = useMemo(
    () => [...rows].sort((a, b) => b.collected - a.collected || b.completedAppointments - a.completedAppointments),
    [rows],
  );
  const selectedRow = rows.find((row) => row.id === selected) ?? ranked[0];
  const completion = totals.appointments
    ? Math.round((totals.completed / totals.appointments) * 100)
    : 0;
  const average = totals.completed ? totals.collected / totals.completed : 0;
  const max = Math.max(
    ...ranked.map((row) =>
      metric === "revenue" ? row.collected : row.completedAppointments,
    ),
    1,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Personel Raporları"
        description="Ekibinizin Performansını Tek Ekranda Görün, Güçlü Noktaları Kolayca Keşfedin."
      />
      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <ReportFilterBar from={range.from} to={range.to} onChange={setRange} />

      {loading ? (
        <Spinner label="Personel Raporu Hazırlanıyor..." />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Toplam Tahsilat" value={money(totals.collected)} detail="Seçilen Dönem" />
            <Metric label="Tamamlanan" value={totals.completed.toLocaleString("tr-TR")} detail={`${completion}% Tamamlanma`} />
            <Metric label="Toplam Randevu" value={totals.appointments.toLocaleString("tr-TR")} detail={`${rows.length} Personel`} />
            <Metric label="Ortalama İşlem" value={money(average)} detail="Tamamlanan Başına" />
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.45fr_0.75fr]">
            <Panel>
              <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-[16px] font-semibold text-[var(--ink)]">Ekip Performansı</h2>
                  <p className="mt-1 text-[12px] text-[var(--muted)]">Bir Personele Dokunarak Detayını Açın.</p>
                </div>
                <div className="flex rounded-xl bg-[var(--surface-muted)] p-1">
                  <button type="button" onClick={() => setMetric("revenue")} className={`rounded-lg px-3 py-1.5 text-[11px] font-medium ${metric === "revenue" ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"}`}>Ciro</button>
                  <button type="button" onClick={() => setMetric("completed")} className={`rounded-lg px-3 py-1.5 text-[11px] font-medium ${metric === "completed" ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"}`}>İşlem</button>
                </div>
              </div>
              <div className="space-y-2 p-4 sm:p-5">
                {ranked.length === 0 ? <Empty /> : ranked.map((row, index) => {
                  const value = metric === "revenue" ? row.collected : row.completedAppointments;
                  const percentage = Math.max(4, (value / max) * 100);
                  return (
                    <button key={row.id} type="button" onClick={() => setSelected(row.id)} className={`grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl p-3 text-left transition ${selected === row.id ? "bg-[var(--surface-muted)]" : "hover:bg-[var(--surface-muted)]"}`}>
                      <span className="text-[11px] font-semibold text-[var(--muted-soft)]">{index + 1}</span>
                      <span className="min-w-0">
                        <span className="flex items-center justify-between gap-3">
                          <span className="truncate text-[13px] font-semibold text-[var(--ink)]">{row.name}</span>
                          <span className="shrink-0 text-[12px] font-semibold text-[var(--ink)]">{metric === "revenue" ? money(value) : `${value} İşlem`}</span>
                        </span>
                        <span className="mt-2 block h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]"><span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${percentage}%` }} /></span>
                      </span>
                      <span className="text-right text-[11px] text-[var(--muted)]">%{completionRate(row)}</span>
                    </button>
                  );
                })}
              </div>
            </Panel>

            <Panel>
              <div className="border-b border-[var(--line)] px-5 py-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted-soft)]">Seçili Personel</p>
                <h2 className="mt-1 truncate text-[19px] font-semibold text-[var(--ink)]">{selectedRow?.name ?? "—"}</h2>
              </div>
              {selectedRow ? (
                <div className="space-y-4 p-5">
                  <div className="flex items-center gap-3">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--surface-muted)] text-[13px] font-semibold text-[var(--muted)]">{selectedRow.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
                    <div><p className="text-[13px] font-medium text-[var(--ink)]">Performans Detayı</p><p className="text-[11px] text-[var(--muted)]">{userLabel(selectedRow.status)} Personel</p></div>
                  </div>
                  <Detail label="Tahsilat" value={money(selectedRow.collected)} />
                  <Detail label="Randevu" value={String(selectedRow.appointmentCount)} />
                  <Detail label="Tamamlanan" value={String(selectedRow.completedAppointments)} />
                  <Detail label="Başarı Oranı" value={`%${completionRate(selectedRow)}`} />
                </div>
              ) : <Empty />}
            </Panel>
          </section>

          <Panel>
            <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div><h2 className="text-[16px] font-semibold text-[var(--ink)]">Personel Detayları</h2><p className="mt-1 text-[12px] text-[var(--muted)]">Arama, Sıralama Ve Sütun Görünümünü Tek Yerden Yönetin.</p></div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input aria-label="Personel Ara" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Personel Ara..." className="h-9 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-[12px] outline-none focus:border-[var(--accent)] sm:w-56" />
                <details className="relative">
                  <summary className="flex h-9 cursor-pointer list-none items-center rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-[12px] font-medium text-[var(--muted)]">Sütunlar</summary>
                  <div className="absolute right-0 z-20 mt-2 min-w-44 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2 shadow-lg">
                    {STAFF_COLUMNS.map((column) => (
                      <label key={column} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-[12px] text-[var(--ink)] hover:bg-[var(--surface-muted)]">
                        <input type="checkbox" checked={tableState.visibleColumns.has(column)} onChange={() => tableState.toggleColumn(column)} />
                        {COLUMN_LABELS[column]}
                      </label>
                    ))}
                  </div>
                </details>
              </div>
            </div>
            {filtered.length === 0 ? <Empty /> : (
              <TableWrap>
                <thead><tr>{tableState.visibleColumnList.map((column) => <Th key={column}><SortButton label={COLUMN_LABELS[column]} active={tableState.sort.key === column} direction={tableState.sort.direction} onClick={() => tableState.toggleSort(column)} /></Th>)}</tr></thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="cursor-pointer" onClick={() => setSelected(row.id)}>
                      {tableState.visibleColumns.has("name") ? <Td label="Personel" className="font-medium">{row.name}</Td> : null}
                      {tableState.visibleColumns.has("appointments") ? <Td label="Randevu">{row.appointmentCount}</Td> : null}
                      {tableState.visibleColumns.has("completed") ? <Td label="Tamamlanan">{row.completedAppointments}</Td> : null}
                      {tableState.visibleColumns.has("rate") ? <Td label="Başarı">%{completionRate(row)}</Td> : null}
                      {tableState.visibleColumns.has("collected") ? <Td label="Tahsilat" className="font-semibold">{money(row.collected)}</Td> : null}
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

function SortButton({ label, active, direction, onClick }: { label: string; active: boolean; direction: "asc" | "desc"; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex items-center gap-1 font:inherit text:inherit"><span>{label}</span><span aria-hidden="true" className="text-[10px] text-[var(--muted-soft)]">{active ? (direction === "asc" ? "↑" : "↓") : "↕"}</span></button>;
}
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <GlassCard><p className="text-[11px] font-medium text-[var(--muted)]">{label}</p><p className="mt-1.5 text-[24px] font-semibold tracking-[-0.04em] text-[var(--ink)]">{value}</p><p className="mt-1 text-[10px] text-[var(--muted-soft)]">{detail}</p></GlassCard>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between border-b border-[var(--line)] pb-3 last:border-0 last:pb-0"><span className="text-[12px] text-[var(--muted)]">{label}</span><span className="text-[13px] font-semibold text-[var(--ink)]">{value}</span></div>; }
function Empty() { return <div className="px-5 py-10 text-center text-[13px] text-[var(--muted)]">Seçilen Tarih Aralığında Veri Bulunamadı.</div>; }
