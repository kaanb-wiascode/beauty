"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Select } from "@/components/ui";
import { ApiError } from "@/lib/api";
import type { ReportCatalogKey } from "./report-catalog-client";
import type { ReportDateRange } from "./report-filter-bar";
import { getReportRangeError, reportRangeToQuery } from "./report-filter-bar";
import {
  createReportExport,
  downloadReportExport,
  listReportExports,
  type ReportExportColumnMode,
  type ReportExportFormat,
  type ReportExportJob,
} from "./report-export-client";

type SupportedExportFormat = ReportExportFormat;

type Props = {
  reportKey: ReportCatalogKey;
  range: ReportDateRange;
  columns?: readonly string[];
  sort?: { key: string; direction: "asc" | "desc" };
  onExportCreated?: () => void;
};

const STATUS_LABELS: Record<ReportExportJob["status"], string> = {
  QUEUED: "Sırada",
  PROCESSING: "Hazırlanıyor",
  READY: "Hazır",
  FAILED: "Başarısız",
  EXPIRED: "Süresi Doldu",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ReportExportPanel({ reportKey, range, columns, sort, onExportCreated }: Props) {
  const [jobs, setJobs] = useState<ReportExportJob[]>([]);
  const [format, setFormat] = useState<SupportedExportFormat>("XLSX");
  const [columnMode, setColumnMode] = useState<ReportExportColumnMode>("VISIBLE");
  const [includeSummary, setIncludeSummary] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const hasPending = useMemo(
    () => jobs.some((job) => job.status === "QUEUED" || job.status === "PROCESSING"),
    [jobs],
  );

  const refresh = useCallback(async () => {
    try {
      const result = await listReportExports({
        page,
        limit: 8,
        reportKey,
        mine: true,
      });
      setJobs(result.data);
      setTotalPages(result.meta.totalPages);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Dışa Aktarım Geçmişi Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [page, reportKey]);

  useEffect(() => {
    setPage(1);
  }, [reportKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!hasPending) return;
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [hasPending, refresh]);

  async function createExport() {
    const rangeError = getReportRangeError(range);
    if (rangeError) {
      setError(rangeError);
      return;
    }

    setCreating(true);
    setError("");
    try {
      await createReportExport({
        reportKey,
        format,
        filters: reportRangeToQuery(range),
        columns: columnMode === "VISIBLE" ? columns : undefined,
        columnMode,
        sort,
        includeSummary,
      });
      setPage(1);
      await refresh();
      onExportCreated?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `${format} Dışa Aktarım Başlatılamadı.`);
    } finally {
      setCreating(false);
    }
  }

  async function download(job: ReportExportJob) {
    setDownloadingId(job.id);
    setError("");
    try {
      await downloadReportExport(job);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Rapor Dosyası İndirilemedi.");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--surface)]">
      <div className="border-b border-[var(--line)] px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--ink)]">Dışa Aktarım</h2>
            <p className="mt-1 text-[11px] text-[var(--muted)]">PDF, Excel veya CSV dosyası sunucuda hazırlanır ve hazır olduğunda güvenli olarak indirilebilir.</p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={format}
              onChange={(event) => setFormat(event.target.value as SupportedExportFormat)}
              className="h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-[12px] font-semibold text-[var(--ink)]"
              aria-label="Dışa aktarım formatı"
            >
              <option value="PDF">PDF</option>
              <option value="XLSX">Excel (.xlsx)</option>
              <option value="CSV">CSV</option>
            </Select>
            <button
              type="button"
              onClick={() => void createExport()}
              disabled={creating}
              className="h-10 rounded-xl border border-[var(--line)] bg-white px-4 text-[12px] font-semibold text-[var(--ink)] disabled:opacity-50"
            >
              {creating ? "Kuyruğa Alınıyor..." : `${format} Oluştur`}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-[var(--muted)]">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`export-columns-${reportKey}`}
              checked={columnMode === "VISIBLE"}
              onChange={() => setColumnMode("VISIBLE")}
            />
            Görünen kolonlar
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`export-columns-${reportKey}`}
              checked={columnMode === "ALL_PERMITTED"}
              onChange={() => setColumnMode("ALL_PERMITTED")}
            />
            İzin verilen tüm kolonlar
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeSummary}
              onChange={(event) => setIncludeSummary(event.target.checked)}
            />
            Özeti dahil et
          </label>
        </div>
      </div>

      {error ? <div className="border-b border-[var(--line)] px-5 py-3 text-[11px] text-red-600">{error}</div> : null}

      {loading ? (
        <div className="px-5 py-6 text-[12px] text-[var(--muted)]">Dışa Aktarım Geçmişi Yükleniyor...</div>
      ) : jobs.length === 0 ? (
        <div className="px-5 py-6 text-[12px] text-[var(--muted)]">Henüz Bu Rapor İçin Dışa Aktarım Bulunmuyor.</div>
      ) : (
        <>
          <div className="divide-y divide-[var(--line)]">
            {jobs.map((job) => (
              <div key={job.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] font-semibold text-[var(--ink)]">{job.format}</span>
                    <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--muted)]">{STATUS_LABELS[job.status]}</span>
                    {job.rowCount !== null ? <span className="text-[10px] text-[var(--muted-soft)]">{job.rowCount.toLocaleString("tr-TR")} satır</span> : null}
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--muted-soft)]">{formatDateTime(job.requestedAt)}</p>
                  {job.errorSummary ? <p className="mt-1 text-[10px] text-red-600">{job.errorSummary}</p> : null}
                </div>
                {job.status === "READY" ? (
                  <button
                    type="button"
                    onClick={() => void download(job)}
                    disabled={downloadingId === job.id}
                    className="rounded-lg border border-[var(--line)] px-3 py-2 text-[11px] font-semibold disabled:opacity-50"
                  >
                    {downloadingId === job.id ? "İndiriliyor..." : "İndir"}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] px-5 py-4">
            <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-[11px] disabled:opacity-40">Önceki</button>
            <span className="text-[11px] text-[var(--muted)]">{page} / {Math.max(totalPages, 1)}</span>
            <button type="button" disabled={totalPages === 0 || page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-[11px] disabled:opacity-40">Sonraki</button>
          </div>
        </>
      )}
    </section>
  );
}
