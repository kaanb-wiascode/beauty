"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/lib/api";
import type { ReportDateRange } from "./report-filter-bar";
import { getReportRangeError, reportRangeToQuery } from "./report-filter-bar";
import {
  createReportExport,
  downloadReportExport,
  listReportExports,
  type ReportExportJob,
} from "./report-export-client";

type ReportKey = "staff.performance" | "service.performance" | "payments.summary";

type Props = {
  reportKey: ReportKey;
  range: ReportDateRange;
  columns?: readonly string[];
  sort?: { key: string; direction: "asc" | "desc" };
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

export function ReportExportPanel({ reportKey, range, columns, sort }: Props) {
  const [jobs, setJobs] = useState<ReportExportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const relevantJobs = useMemo(
    () => jobs.filter((job) => job.reportKey === reportKey).slice(0, 8),
    [jobs, reportKey],
  );
  const hasPending = relevantJobs.some(
    (job) => job.status === "QUEUED" || job.status === "PROCESSING",
  );

  const refresh = useCallback(async () => {
    try {
      const result = await listReportExports(30);
      setJobs(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Dışa Aktarım Geçmişi Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

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
        filters: reportRangeToQuery(range),
        columns,
        sort,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "CSV Dışa Aktarım Başlatılamadı.");
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
      <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--ink)]">Dışa Aktarım</h2>
          <p className="mt-1 text-[11px] text-[var(--muted)]">CSV dosyası sunucuda hazırlanır ve hazır olduğunda güvenli olarak indirilebilir.</p>
        </div>
        <button
          type="button"
          onClick={() => void createExport()}
          disabled={creating}
          className="h-10 rounded-xl border border-[var(--line)] bg-white px-4 text-[12px] font-semibold text-[var(--ink)] disabled:opacity-50"
        >
          {creating ? "Kuyruğa Alınıyor..." : "CSV Oluştur"}
        </button>
      </div>

      {error ? <div className="border-b border-[var(--line)] px-5 py-3 text-[11px] text-red-600">{error}</div> : null}

      {loading ? (
        <div className="px-5 py-6 text-[12px] text-[var(--muted)]">Dışa Aktarım Geçmişi Yükleniyor...</div>
      ) : relevantJobs.length === 0 ? (
        <div className="px-5 py-6 text-[12px] text-[var(--muted)]">Henüz Bu Rapor İçin Dışa Aktarım Bulunmuyor.</div>
      ) : (
        <div className="divide-y divide-[var(--line)]">
          {relevantJobs.map((job) => (
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
                  className="h-9 rounded-lg border border-[var(--line)] px-3 text-[11px] font-semibold text-[var(--ink)] disabled:opacity-50"
                >
                  {downloadingId === job.id ? "İndiriliyor..." : "İndir"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
