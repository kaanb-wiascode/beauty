import { api } from "@/lib/api";
import { userText } from "@/lib/user-language";

export type ReportCatalogKey =
  | "staff.performance"
  | "service.performance"
  | "payments.summary"
  | "customers.performance"
  | "sales.performance"
  | "appointments.performance"
  | "branches.performance"
  | "finance.performance"
  | "inventory.performance"
  | "procurement.performance"
  | "crm.performance"
  | "hr.workforce"
  | "payroll.summary";

export type ReportCatalogItem = {
  key: ReportCatalogKey;
  title: string;
  description: string;
  domain:
    | "staff"
    | "services"
    | "payments"
    | "customers"
    | "sales"
    | "appointments"
    | "finance"
    | "inventory"
    | "procurement"
    | "crm"
    | "hr"
    | "payroll";
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

export async function getReportCatalog() {
  const items=await api<ReportCatalogItem[]>("/reports/catalog");
  return items.map((item)=>({
    ...item,
    title:userText(item.title,"Rapor"),
    description:userText(item.description,"Rapor ayrıntıları"),
  }));
}
