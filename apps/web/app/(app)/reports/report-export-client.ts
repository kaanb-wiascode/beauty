import { API_BASE_URL, ApiError, api, withQuery } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

export type ReportExportStatus =
  | "QUEUED"
  | "PROCESSING"
  | "READY"
  | "FAILED"
  | "EXPIRED";

export type ReportExportJob = {
  id: string;
  reportKey: string;
  format: "CSV" | "PDF" | "XLSX";
  status: ReportExportStatus;
  rowCount: number | null;
  errorSummary: string | null;
  requestedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
};

export type CreateReportExportInput = {
  reportKey: "staff.performance" | "service.performance" | "payments.summary";
  filters: { from: string; to: string };
  columns?: readonly string[];
  sort?: { key: string; direction: "asc" | "desc" };
};

export function createReportExport(input: CreateReportExportInput) {
  return api<ReportExportJob>("/reports/exports", {
    method: "POST",
    body: {
      reportKey: input.reportKey,
      format: "CSV",
      filters: input.filters,
      columns: input.columns,
      sort: input.sort,
      includeSummary: true,
      includeCharts: false,
    },
  });
}

export function listReportExports(limit = 20) {
  return api<ReportExportJob[]>(withQuery("/reports/exports", { limit }));
}

export async function downloadReportExport(job: Pick<ReportExportJob, "id">) {
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
  const fileName = encodedName
    ? decodeURIComponent(encodedName)
    : `report-${job.id}.csv`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
