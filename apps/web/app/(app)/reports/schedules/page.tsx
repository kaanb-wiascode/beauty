"use client";

import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/ui";
import { ApiError } from "@/lib/api";
import {
  getReportCatalog,
  type ReportCatalogItem,
  type ReportCatalogKey,
} from "../report-catalog-client";
import { ReportSchedulePanel } from "../report-schedule-panel";
import type { SavedReportSort } from "../report-saved-view-client";

const DEFAULT_SORTS: Partial<Record<ReportCatalogKey, SavedReportSort>> = {
  "staff.performance": { key: "collected", direction: "desc" },
  "service.performance": { key: "collected", direction: "desc" },
};

export default function ReportSchedulesPage() {
  const [catalog, setCatalog] = useState<ReportCatalogItem[]>([]);
  const [reportKey, setReportKey] = useState<ReportCatalogKey | null>(null);
  const [columns, setColumns] = useState<readonly string[]>([]);
  const [sort, setSort] = useState<SavedReportSort | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getReportCatalog()
      .then((items) => {
        if (!active) return;
        setCatalog(items);
        const first = items[0] ?? null;
        setReportKey(first?.key ?? null);
        setColumns(first?.defaultColumns ?? []);
        setSort(first ? DEFAULT_SORTS[first.key] : undefined);
        setError("");
      })
      .catch((cause) => {
        if (!active) return;
        setCatalog([]);
        setReportKey(null);
        setError(cause instanceof ApiError ? cause.message : "Rapor kataloğu yüklenemedi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selected = useMemo(
    () => catalog.find((item) => item.key === reportKey),
    [catalog, reportKey],
  );

  function selectReport(key: ReportCatalogKey) {
    const definition = catalog.find((item) => item.key === key);
    setReportKey(key);
    setColumns(definition?.defaultColumns ?? []);
    setSort(DEFAULT_SORTS[key]);
  }

  function toggleColumn(column: string) {
    setColumns((current) =>
      current.includes(column)
        ? current.filter((item) => item !== column)
        : [...current, column],
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10">
      <PageHeader
        title="Zamanlanmış Raporlar"
        description="Raporları günlük, haftalık veya aylık olarak otomatik üretin; çalışma geçmişini ve hataları güvenli şekilde izleyin."
      />

      {loading ? (
        <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] px-5 py-8 text-[13px] text-[var(--muted)]">Yetkili rapor kataloğu yükleniyor...</div>
      ) : error ? (
        <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] px-5 py-8 text-[13px] text-red-600">{error}</div>
      ) : !selected || !reportKey ? (
        <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] px-5 py-8 text-[13px] text-[var(--muted)]">Zamanlanabilir raporlar için gerekli kaynak-domain yetkiniz bulunmuyor.</div>
      ) : (
        <>
          <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_2fr]">
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted-soft)]">Rapor</label>
                <select value={reportKey} onChange={(event) => selectReport(event.target.value as ReportCatalogKey)} className="mt-2 h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-[13px] text-[var(--ink)]">
                  {catalog.map((report) => <option key={report.key} value={report.key}>{report.title}</option>)}
                </select>
                <p className="mt-2 text-[11px] text-[var(--muted)]">{selected.description}</p>
              </div>
              <div>
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted-soft)]">Dışa Aktarım Kolonları</label>
                  <button type="button" onClick={() => setColumns(selected.exportableColumns)} className="text-[10px] font-semibold text-[var(--accent)]">Tümüne izin ver</button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selected.exportableColumns.map((column) => (
                    <label key={column} className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-[10px] text-[var(--muted)]">
                      <input type="checkbox" checked={columns.includes(column)} onChange={() => toggleColumn(column)} />
                      {column}
                    </label>
                  ))}
                </div>
                {columns.length === 0 ? <p className="mt-2 text-[10px] text-red-600">En az bir kolon seçmelisiniz.</p> : null}
              </div>
            </div>
          </section>

          <ReportSchedulePanel catalog={catalog} reportKey={reportKey} columns={columns} sort={sort} />
        </>
      )}
    </div>
  );
}
