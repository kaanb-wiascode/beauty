"use client";

import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/ui";
import { ApiError } from "@/lib/api";
import {
  ReportFilterBar,
  reportDateInputValue,
  type ReportDateRange,
} from "../report-filter-bar";
import { ReportExportPanel } from "../report-export-panel";
import {
  getReportCatalog,
  type ReportCatalogItem,
  type ReportCatalogKey,
} from "../report-catalog-client";

const DEFAULT_SORTS: Partial<
  Record<ReportCatalogKey, { key: string; direction: "asc" | "desc" }>
> = {
  "staff.performance": { key: "collected", direction: "desc" },
  "service.performance": { key: "collected", direction: "desc" },
};

export default function ReportExportsPage() {
  const [catalog, setCatalog] = useState<ReportCatalogItem[]>([]);
  const [reportKey, setReportKey] = useState<ReportCatalogKey | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [range, setRange] = useState<ReportDateRange>(() => {
    const today = reportDateInputValue(new Date());
    return { from: today, to: today };
  });

  useEffect(() => {
    let active = true;
    void getReportCatalog()
      .then((items) => {
        if (!active) return;
        setCatalog(items);
        setReportKey((current) =>
          current && items.some((item) => item.key === current)
            ? current
            : (items[0]?.key ?? null),
        );
        setCatalogError("");
      })
      .catch((error) => {
        if (!active) return;
        setCatalog([]);
        setReportKey(null);
        setCatalogError(
          error instanceof ApiError
            ? error.message
            : "Rapor kataloğu yüklenemedi.",
        );
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const selected = useMemo(
    () => catalog.find((report) => report.key === reportKey),
    [catalog, reportKey],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10">
      <PageHeader
        title="Dışa Aktarım Merkezi"
        description="Raporları güvenli arka plan işleriyle hazırlayın, durumlarını izleyin ve hazır dosyaları indirin."
      />

      {catalogLoading ? (
        <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] px-5 py-8 text-[13px] text-[var(--muted)]">
          Yetkili rapor kataloğu yükleniyor...
        </div>
      ) : catalogError ? (
        <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] px-5 py-8 text-[13px] text-red-600">
          {catalogError}
        </div>
      ) : catalog.length === 0 ? (
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
              value={reportKey ?? ""}
              onChange={(event) =>
                setReportKey(event.target.value as ReportCatalogKey)
              }
              className="mt-2 h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-[13px] text-[var(--ink)] sm:max-w-sm"
            >
              {catalog.map((report) => (
                <option key={report.key} value={report.key}>
                  {report.title}
                </option>
              ))}
            </select>
            {selected ? (
              <p className="mt-2 text-[11px] text-[var(--muted)]">
                {selected.description}
              </p>
            ) : null}
          </section>

          <ReportFilterBar from={range.from} to={range.to} onChange={setRange} />

          {selected ? (
            <ReportExportPanel
              reportKey={selected.key}
              range={range}
              columns={selected.defaultColumns}
              sort={DEFAULT_SORTS[selected.key]}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
