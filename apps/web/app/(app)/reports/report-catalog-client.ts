import { api } from "@/lib/api";

export type ReportCatalogKey =
  | "staff.performance"
  | "service.performance"
  | "payments.summary"
  | "customers.performance"
  | "sales.performance";

export type ReportCatalogItem = {
  key: ReportCatalogKey;
  title: string;
  description: string;
  domain: "staff" | "services" | "payments" | "customers" | "sales";
  route: string;
  resultKind: "table" | "summary";
  availableColumns: readonly string[];
  defaultColumns: readonly string[];
  exportableColumns: readonly string[];
  sortableColumns: readonly string[];
  exportFormats: readonly ("CSV" | "XLSX" | "PDF")[];
  drilldowns: readonly string[];
  pagination: boolean;
};

export function getReportCatalog() {
  return api<ReportCatalogItem[]>("/reports/catalog");
}
