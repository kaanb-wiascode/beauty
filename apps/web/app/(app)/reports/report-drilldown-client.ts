import { api } from "@/lib/api";

export type ReportDrilldownRow = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  paymentAmount: number | null;
  paymentStatus: string | null;
};

export type ReportDrilldownResponse = {
  report: {
    key: "staff.performance" | "service.performance";
    dimension: "appointments";
    rowId: string;
  };
  columns: string[];
  data: ReportDrilldownRow[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export function fetchReportDrilldown(input: {
  reportKey: "staff.performance" | "service.performance";
  rowId: string;
  filters: { from: string; to: string };
  page?: number;
  limit?: number;
}) {
  return api<ReportDrilldownResponse>("/reports/drilldown", {
    method: "POST",
    body: {
      reportKey: input.reportKey,
      dimension: "appointments",
      rowId: input.rowId,
      filters: input.filters,
      page: input.page ?? 1,
      limit: input.limit ?? 10,
    },
  });
}
