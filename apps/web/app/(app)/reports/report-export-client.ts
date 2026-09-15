import { API_BASE_URL, ApiError, api, withQuery } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

export type ReportExportStatus =
  | "QUEUED"
  | "PROCESSING"
  | "READY"
  | "FAILED"
  | "EXPIRED";

export type ReportExportFormat = "CSV" | "PDF" | "XLSX";
export type ReportExportColumnMode = "VISIBLE" | "ALL_PERMITTED";

export type ReportExportJob = {
  id: string;
  reportKey: string;
  format: ReportExportFormat;
  status: ReportExportStatus;
  rowCount: number | null;
  errorSummary: string | null;
  requestedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
};

export type ReportExportListResult = {
  data: ReportExportJob[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export type CreateReportExportInput = {
  reportKey: "staff.performance" | "service.performance" | "payments.summary";
  format?: ReportExportFormat;
  filters: { from: string; to: string };
  columns?: readonly string[];
  columnMode?: ReportExportColumnMode;
  sort?: { key: string; direction: "asc" | "desc" };
  includeSummary?: boolean;
};

export function createReportExport(input: CreateReportExportInput) {
  return api<ReportExportJob>("/reports/exports", {
    method: "POST",
    body: {
      reportKey: input.reportKey,
      format: input.format ?? "CSV",
      filters: input.filters,
      columns: input.columns,
      columnMode: input.columnMode ?? "VISIBLE",
      sort: input.sort,
      includeSummary: input.includeSummary ?? true,
      includeCharts: false,
    },
  });
}

export function listReportExports(input: {
  page?: number;
  limit?: number;
  reportKey?: CreateReportExportInput["reportKey"];
  status?: ReportExportStatus;
  format?: ReportExportJob["format"];
  mine?: boolean;
} = {}) {
  return api<ReportExportListResult>(
    withQuery("/reports/exports", {
      page: input.page ?? 1,
      limit: input.limit ?? 20,
      reportKey: input.reportKey,
      status: input.status,
      format: input.format,
      mine: input.mine === undefined ? undefined : String(input.mine),
    }),
  );
}

export async function downloadReportExport(job: Pick<ReportExportJob, "id" | "format">) {
  const token = getAccessToken();
  if (!token) {
    throw new ApiError("Oturumunuz Sona Erdi. Lütfen Tekrar Giriş Yapın.", 401);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/reports/exports/${job.id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
  } catch {
    throw new ApiError("Rapor Dosyasına Ulaşılamadı.", 0);
  }

  if (!response.ok) {
    throw new ApiError(
      response.status === 403
        ? "Bu Rapor Dosyasını İndirmeye Yetkiniz Bulunmuyor."
        : response.status === 404
          ? "Rapor Dosyası Bulunamadı Veya Süresi Dolmuş."
          : "Rapor Dosyası İndirilemedi.",
      response.status,
    );
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const extension = job.format === "XLSX" ? "xlsx" : job.format === "PDF" ? "pdf" : "csv";
  const fileName = encodedName
    ? decodeURIComponent(encodedName)
    : `report-${job.id}.${extension}`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
