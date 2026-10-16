import { api } from "@/lib/api";
import type { ReportCatalogKey } from "./report-catalog-client";
import type { ReportExportFormat } from "./report-export-client";
import type { SavedReportSort } from "./report-saved-view-client";

export type ReportScheduleFrequency = "DAILY" | "WEEKLY" | "MONTHLY";
export type ReportScheduleDatePreset =
  | "TODAY"
  | "YESTERDAY"
  | "LAST_7_DAYS"
  | "LAST_30_DAYS"
  | "THIS_MONTH"
  | "PREVIOUS_MONTH";

export type ReportSchedule = {
  id: string;
  reportKey: ReportCatalogKey;
  name: string;
  frequency: ReportScheduleFrequency;
  timezone: string;
  localHour: number;
  localMinute: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  format: ReportExportFormat;
  filters: { datePreset: ReportScheduleDatePreset };
  columns: string[];
  sort: SavedReportSort | null;
  includeSummary: boolean;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastExportJobId: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReportScheduleRun = {
  id: string;
  scheduledFor: string;
  status: "CLAIMED" | "QUEUED" | "FAILED";
  exportJobId: string | null;
  errorCode: string | null;
  errorSummary: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type CreateReportScheduleInput = {
  name: string;
  reportKey: ReportCatalogKey;
  frequency: ReportScheduleFrequency;
  timezone: string;
  localHour: number;
  localMinute: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  format: ReportExportFormat;
  datePreset: ReportScheduleDatePreset;
  columns: readonly string[];
  sort?: SavedReportSort;
  includeSummary: boolean;
  enabled?: boolean;
};

export function listReportSchedules() {
  return api<ReportSchedule[]>("/reports/schedules");
}

export function createReportSchedule(input: CreateReportScheduleInput) {
  return api<ReportSchedule>("/reports/schedules", {
    method: "POST",
    body: {
      ...input,
      columns: [...input.columns],
      enabled: input.enabled ?? true,
    },
  });
}

export function updateReportSchedule(
  id: string,
  input: { name?: string; enabled?: boolean },
) {
  return api<ReportSchedule>(`/reports/schedules/${id}`, {
    method: "PATCH",
    body: input,
  });
}

export function deleteReportSchedule(id: string) {
  return api<{ id: string }>(`/reports/schedules/${id}`, {
    method: "DELETE",
  });
}

export function listReportScheduleRuns(id: string) {
  return api<ReportScheduleRun[]>(`/reports/schedules/${id}/runs`);
}
