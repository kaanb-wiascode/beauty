import { api } from "@/lib/api";

export type ReportCatalogKey =
  | "staff.performance"
  | "service.performance"
  | "payments.summary";

export type ReportCatalogItem = {
  key: ReportCatalogKey;
  title: string;
  description: string;
  domain: "staff" | "services" | "payments";
  route: string;
  resultKind: "table" | "summary";
  availableColumns: readonly string[];
  defaultColumns: readonly string[];
  exportableColumns: readonly string[];
  sortableColumns: readonly string[];
  exportFormats: readonly ("CSV" | "XLSX" | "PDF")[];
  pagination: boolean;
};

export function getReportCatalog() {
  return api<ReportCatalogItem[]>("/reports/catalog");
}
