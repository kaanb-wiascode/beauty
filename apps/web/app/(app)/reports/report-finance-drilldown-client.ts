import { api } from "@/lib/api";

export type ReportFinanceDrilldownRow = {
  id: string;
  recordType: "INCOME" | "EXPENSE";
  transactionDate: string;
  counterpartyName: string | null;
  description: string | null;
  currency: string;
  exchangeRate: number;
  grossTry: number;
  settlementBaseTry: number;
  settledTry: number;
  outstandingTry: number;
};

export type ReportFinanceDrilldownResponse = {
  report: {
    key: "finance.performance";
    dimension: "finance-records";
    rowId: string;
  };
  data: ReportFinanceDrilldownRow[];
};

export function fetchReportFinanceDrilldown(input: {
  rowId: string;
  filters: { from: string; to: string };
}) {
  return api<ReportFinanceDrilldownResponse>("/reports/drilldown", {
    method: "POST",
    body: {
      reportKey: "finance.performance",
      dimension: "finance-records",
      rowId: input.rowId,
      filters: input.filters,
    },
  });
}
