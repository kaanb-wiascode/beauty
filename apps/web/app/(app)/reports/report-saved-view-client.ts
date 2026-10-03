import { api } from "@/lib/api";
import type { ReportCatalogKey } from "./report-catalog-client";

export type SavedReportSort = {
  key: string;
  direction: "asc" | "desc";
};

export type ReportSavedView = {
  id: string;
  reportKey: ReportCatalogKey;
  name: string;
  filters: { from: string; to: string };
  columns: string[];
  sort: SavedReportSort | null;
  isFavorite: boolean;
  lastOpenedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateReportSavedViewInput = {
  name: string;
  reportKey: ReportCatalogKey;
  filters: { from: string; to: string };
  columns: readonly string[];
  sort?: SavedReportSort;
  isFavorite?: boolean;
};

export async function listReportSavedViews() {
  return api<ReportSavedView[]>("/reports/saved-reports");
}

export async function getReportSavedView(id: string) {
  return api<ReportSavedView>(`/reports/saved-reports/${id}`);
}

export async function createReportSavedView(input: CreateReportSavedViewInput) {
  return api<ReportSavedView>("/reports/saved-reports", {
    method: "POST",
    body: {
      name: input.name,
      reportKey: input.reportKey,
      filters: input.filters,
      columns: [...input.columns],
      sort: input.sort,
      isFavorite: input.isFavorite ?? false,
    },
  });
}

export async function toggleReportSavedViewFavorite(id: string, isFavorite: boolean) {
  return api<ReportSavedView>(`/reports/saved-reports/${id}`, {
    method: "PATCH",
    body: { isFavorite },
  });
}

export async function deleteReportSavedView(id: string) {
  return api<{ id: string }>(`/reports/saved-reports/${id}`, {
    method: "DELETE",
  });
}
