import { api } from "@/lib/api";

export type ReportPreviewSort = {
  key: string;
  direction: "asc" | "desc";
};

export type ReportPreviewMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  sort: ReportPreviewSort | null;
};

export type TableReportPreview<TRow> = {
  report: { key: string; resultKind: "table" };
  columns: string[];
  data: TRow[];
  meta: ReportPreviewMeta;
};

export type SummaryReportPreview<TSummary> = {
  report: { key: string; resultKind: "summary" };
  columns: string[];
  data: TSummary;
  meta: null;
};

type PreviewRequest = {
  reportKey: "staff.performance" | "service.performance" | "payments.summary";
  filters: { from: string; to: string };
  columns?: readonly string[];
  sort?: ReportPreviewSort;
  page?: number;
  limit?: number;
};

export function fetchReportPreview<TResponse>(body: PreviewRequest) {
  return api<TResponse>("/reports/preview", { method: "POST", body });
}
