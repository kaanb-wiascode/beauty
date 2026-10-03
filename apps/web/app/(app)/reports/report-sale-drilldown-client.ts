import { api } from "@/lib/api";

export type ReportSaleDrilldownItem = {
  id: string;
  type: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type ReportSaleDrilldownPayment = {
  id: string;
  amount: number;
  method: string;
  status: string;
  paidAt: string;
  refundedAt: string | null;
};

export type ReportSaleDrilldownResponse = {
  report: {
    key: "sales.performance";
    dimension: "sale";
    rowId: string;
  };
  data: {
    id: string;
    confirmedAt: string;
    status: string;
    subtotal: number;
    discountTotal: number;
    total: number;
    items: ReportSaleDrilldownItem[];
    payments: ReportSaleDrilldownPayment[];
  };
};

export function fetchReportSaleDrilldown(input: {
  rowId: string;
  filters: { from: string; to: string };
}) {
  return api<ReportSaleDrilldownResponse>("/reports/drilldown", {
    method: "POST",
    body: {
      reportKey: "sales.performance",
      dimension: "sale",
      rowId: input.rowId,
      filters: input.filters,
    },
  });
}
