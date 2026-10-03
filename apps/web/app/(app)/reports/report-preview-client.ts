import { api } from "@/lib/api";
import type { ReportCatalogKey } from "./report-catalog-client";

export type ReportPreviewSort = {
  key: string;
  direction: "asc" | "desc";
};

export type ReportPreviewSummary = {
  rowCount: number;
  appointmentCount: number;
  completedAppointments: number;
  completionRate: number;
  collected: number;
  averageCollectedPerCompleted: number;
};

export type ReportPreviewMeta<TSummary = ReportPreviewSummary> = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  sort: ReportPreviewSort | null;
  summary: TSummary;
};

export type TableReportPreview<TRow, TSummary = ReportPreviewSummary> = {
  report: { key: string; resultKind: "table"; drilldowns: string[] };
  columns: string[];
  data: TRow[];
  meta: ReportPreviewMeta<TSummary>;
};

export type SummaryReportPreview<TSummary> = {
  report: { key: string; resultKind: "summary"; drilldowns: string[] };
  columns: string[];
  data: TSummary;
  meta: null;
};

type PreviewRequest = {
  reportKey: ReportCatalogKey;
  filters: { from: string; to: string };
  columns?: readonly string[];
  sort?: ReportPreviewSort;
  page?: number;
  limit?: number;
};

export function fetchReportPreview<TResponse>(body: PreviewRequest) {
  return api<TResponse>("/reports/preview", { method: "POST", body });
}
