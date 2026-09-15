"use client";

import { useMemo, useState } from "react";

import { PageHeader } from "@/components/ui";
import { hasPermission } from "@/lib/auth";
import {
  ReportFilterBar,
  reportDateInputValue,
  type ReportDateRange,
} from "../report-filter-bar";
import { ReportExportPanel } from "../report-export-panel";

type ReportKey = "staff.performance" | "service.performance" | "payments.summary";

const REPORTS: readonly {
  key: ReportKey;
  label: string;
  resource: string;
  columns?: readonly string[];
  sort?: { key: string; direction: "asc" | "desc" };
}[] = [
  {
    key: "staff.performance",
    label: "Personel Performansı",
    resource: "staff",
    columns: ["name", "appointmentCount", "completedAppointments", "completionRate", "collected"],
    sort: { key: "collected", direction: "desc" },
  },
  {
    key: "service.performance",
    label: "Hizmet Performansı",
    resource: "services",
    columns: ["name", "appointmentCount", "completedAppointments", "completionRate", "collected"],
    sort: { key: "collected", direction: "desc" },
  },
  {
    key: "payments.summary",
    label: "Ödeme Özeti",
    resource: "payments",
  },
];

export default function ReportExportsPage() {
  const availableReports = useMemo(
    () => REPORTS.filter((report) => hasPermission(report.resource, "read")),
    [],
  );
  const [reportKey, setReportKey] = useState<ReportKey>(
    availableReports[0]?.key ?? "staff.performance",
  );
  const [range, setRange] = useState<ReportDateRange>(() => {
    const today = reportDateInputValue(new Date());
    return { from: today, to: today };
  });

  const selected = availableReports.find((report) => report.key === reportKey);

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10">
      <PageHeader
        title="Dışa Aktarım Merkezi"
        description="Raporları güvenli arka plan işleriyle hazırlayın, durumlarını izleyin ve hazır dosyaları indirin."
      />

      {availableReports.length === 0 ? (
        <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] px-5 py-8 text-[13px] text-[var(--muted)]">
          Dışa aktarılabilir raporlar için gerekli kaynak-domain yetkiniz bulunmuyor.
        </div>
      ) : (
        <>
          <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
            <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted-soft)]">
              Rapor
            </label>
            <select
              value={reportKey}
              onChange={(event) => setReportKey(event.target.value as ReportKey)}
              className="mt-2 h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-[13px] text-[var(--ink)] sm:max-w-sm"
            >
              {availableReports.map((report) => (
                <option key={report.key} value={report.key}>
                  {report.label}
                </option>
              ))}
            </select>
          </section>

          <ReportFilterBar from={range.from} to={range.to} onChange={setRange} />

          {selected ? (
            <ReportExportPanel
              reportKey={selected.key}
              range={range}
              columns={selected.columns}
              sort={selected.sort}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
