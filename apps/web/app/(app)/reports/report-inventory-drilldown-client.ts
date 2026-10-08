import { api } from "@/lib/api";

export type ReportInventoryDrilldownRow = {
  id: string;
  createdAt: string;
  movementType: string;
  productName: string;
  sku: string | null;
  warehouseName: string;
  quantity: number;
  unitCost: number;
  movementValue: number;
  referenceType: string | null;
};

export type ReportInventoryDrilldownResponse = {
  report: {
    key: "inventory.performance";
    dimension: "stock-movements";
    rowId: string;
  };
  data: ReportInventoryDrilldownRow[];
};

export function fetchReportInventoryDrilldown(input: {
  rowId: string;
  filters: { from: string; to: string };
}) {
  return api<ReportInventoryDrilldownResponse>("/reports/drilldown", {
    method: "POST",
    body: {
      reportKey: "inventory.performance",
      dimension: "stock-movements",
      rowId: input.rowId,
      filters: input.filters,
    },
  });
}
