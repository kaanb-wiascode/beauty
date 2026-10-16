import { api } from "@/lib/api";
import type { ReportCatalogKey } from "./report-catalog-client";

export type ReportComparisonMetric = {
  key: string;
  current: number;
  previous: number;
  delta: number;
  deltaPercent: number | null;
};

export type ReportComparisonResult = {
  reportKey: ReportCatalogKey;
  currentPeriod: { from: string; to: string };
  previousPeriod: { from: string; to: string };
  metrics: ReportComparisonMetric[];
};

export function compareReportPeriods(input: {
  reportKey: ReportCatalogKey;
  filters: { from: string; to: string };
}) {
  return api<ReportComparisonResult>("/reports/compare", {
    method: "POST",
    body: input,
  });
}
