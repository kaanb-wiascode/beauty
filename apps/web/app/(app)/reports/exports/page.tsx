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
import {
  createReportSavedView,
  deleteReportSavedView,
  listReportSavedViews,
  toggleReportSavedViewFavorite,
  type ReportSavedView,
  type SavedReportSort,
} from "../report-saved-view-client";

const DEFAULT_SORTS: Partial<Record<ReportCatalogKey, SavedReportSort>> = {
  "staff.performance": { key: "collected", direction: "desc" },
  "service.performance": { key: "collected", direction: "desc" },
};

function savedDate(value: string) {
  return value.slice(0, 10);
}

export default function ReportExportsPage() {
  const [catalog, setCatalog] = useState<ReportCatalogItem[]>([]);
  const [reportKey, setReportKey] = useState<ReportCatalogKey | null>(null);
  const [columns, setColumns] = useState<readonly string[]>([]);
  const [sort, setSort] = useState<SavedReportSort | undefined>(undefined);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [savedViews, setSavedViews] = useState<ReportSavedView[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState("");
  const [savedName, setSavedName] = useState("");
  const [saving, setSaving] = useState(false);
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
        const first = items[0] ?? null;
        setReportKey((current) => {
          const next = current && items.some((item) => item.key === current)
            ? current
            : first?.key ?? null;
          const definition = items.find((item) => item.key === next);
          setColumns(definition?.defaultColumns ?? []);
          setSort(next ? DEFAULT_SORTS[next] : undefined);
          return next;
        });
        setCatalogError("");
      })
      .catch((error) => {
        if (!active) return;
        setCatalog([]);
        setReportKey(null);
        setCatalogError(error instanceof ApiError ? error.message : "Rapor kataloğu yüklenemedi.");
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });

    void listReportSavedViews()
      .then((items) => {
        if (!active) return;
        setSavedViews(items);
        setSavedError("");
      })
      .catch((error) => {
        if (!active) return;
        setSavedViews([]);
        setSavedError(error instanceof ApiError ? error.message : "Kaydedilmiş raporlar yüklenemedi.");
      })
      .finally(() => {
        if (active) setSavedLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const selected = useMemo(
    () => catalog.find((report) => report.key === reportKey),
    [catalog, reportKey],
  );

  function selectReport(key: ReportCatalogKey) {
    const definition = catalog.find((report) => report.key === key);
    setReportKey(key);
    setColumns(definition?.defaultColumns ?? []);
    setSort(DEFAULT_SORTS[key]);
  }

  function applySavedView(view: ReportSavedView) {
    if (!catalog.some((report) => report.key === view.reportKey)) {
      setSavedError("Bu kaydedilmiş rapor için artık gerekli yetkiniz bulunmuyor.");
      return;
    }
    setReportKey(view.reportKey);
    setRange({ from: savedDate(view.filters.from), to: savedDate(view.filters.to) });
    setColumns(view.columns);
    setSort(view.sort ?? undefined);
    setSavedError("");
  }

  async function saveCurrentView() {
    if (!reportKey || !savedName.trim() || columns.length === 0) return;
    setSaving(true);
    setSavedError("");
    try {
      const created = await createReportSavedView({
        name: savedName.trim(),
        reportKey,
        filters: range,
        columns,
        sort,
      });
      setSavedViews((items) => [created, ...items]);
      setSavedName("");
    } catch (error) {
      setSavedError(error instanceof ApiError ? error.message : "Rapor görünümü kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleFavorite(view: ReportSavedView) {
    try {
      const updated = await toggleReportSavedViewFavorite(view.id, !view.isFavorite);
      setSavedViews((items) =>
        items
          .map((item) => (item.id === updated.id ? updated : item))
          .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite)),
      );
      setSavedError("");
    } catch (error) {
      setSavedError(error instanceof ApiError ? error.message : "Favori durumu güncellenemedi.");
    }
  }

  async function removeSavedView(view: ReportSavedView) {
    try {
      await deleteReportSavedView(view.id);
      setSavedViews((items) => items.filter((item) => item.id !== view.id));
      setSavedError("");
    } catch (error) {
      setSavedError(error instanceof ApiError ? error.message : "Kaydedilmiş rapor silinemedi.");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10">
      <PageHeader
        title="Dışa Aktarım Merkezi"
        description="Raporları güvenli arka plan işleriyle hazırlayın, kaydedin, durumlarını izleyin ve hazır dosyaları indirin."
      />

      {catalogLoading ? (
        <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] px-5 py-8 text-[13px] text-[var(--muted)]">Yetkili rapor kataloğu yükleniyor...</div>
      ) : catalogError ? (
        <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] px-5 py-8 text-[13px] text-red-600">{catalogError}</div>
      ) : catalog.length === 0 ? (
        <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] px-5 py-8 text-[13px] text-[var(--muted)]">Dışa aktarılabilir raporlar için gerekli kaynak-domain yetkiniz bulunmuyor.</div>
      ) : (
        <>
          <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted-soft)]">Rapor</label>
                <select
                  value={reportKey ?? ""}
                  onChange={(event) => selectReport(event.target.value as ReportCatalogKey)}
                  className="mt-2 h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-[13px] text-[var(--ink)] sm:max-w-sm"
                >
                  {catalog.map((report) => (
                    <option key={report.key} value={report.key}>{report.title}</option>
                  ))}
                </select>
                {selected ? <p className="mt-2 text-[11px] text-[var(--muted)]">{selected.description}</p> : null}
              </div>
              <div className="flex gap-2">
                <input
                  value={savedName}
                  onChange={(event) => setSavedName(event.target.value)}
                  maxLength={120}
                  placeholder="Görünüm adı"
                  className="h-11 min-w-0 rounded-xl border border-[var(--line)] bg-white px-3 text-[12px] text-[var(--ink)]"
                />
                <button
                  type="button"
                  disabled={saving || !savedName.trim() || !reportKey}
                  onClick={() => void saveCurrentView()}
                  className="h-11 rounded-xl border border-[var(--line)] bg-white px-4 text-[12px] font-semibold text-[var(--ink)] disabled:opacity-50"
                >
                  {saving ? "Kaydediliyor..." : "Görünümü Kaydet"}
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[14px] font-semibold text-[var(--ink)]">Kaydedilmiş Raporlar</h2>
                <p className="mt-1 text-[11px] text-[var(--muted)]">Kişisel filtre, kolon ve sıralama görünümleriniz.</p>
              </div>
              <span className="text-[11px] text-[var(--muted-soft)]">{savedViews.length} kayıt</span>
            </div>
            {savedError ? <p className="mt-3 text-[11px] text-red-600">{savedError}</p> : null}
            {savedLoading ? (
              <p className="mt-4 text-[12px] text-[var(--muted)]">Kaydedilmiş raporlar yükleniyor...</p>
            ) : savedViews.length === 0 ? (
              <p className="mt-4 text-[12px] text-[var(--muted)]">Henüz kaydedilmiş rapor görünümü bulunmuyor.</p>
            ) : (
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {savedViews.map((view) => (
                  <div key={view.id} className="rounded-xl border border-[var(--line)] bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" onClick={() => applySavedView(view)} className="min-w-0 text-left">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[12px] font-semibold text-[var(--ink)]">{view.name}</span>
                          {view.isFavorite ? <span className="text-[10px] text-[var(--muted)]">Favori</span> : null}
                        </div>
                        <p className="mt-1 text-[10px] text-[var(--muted-soft)]">{catalog.find((item) => item.key === view.reportKey)?.title ?? view.reportKey}</p>
                      </button>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => void toggleFavorite(view)} className="rounded-lg border border-[var(--line)] px-2 py-1 text-[10px] text-[var(--muted)]">{view.isFavorite ? "Favoriden Çıkar" : "Favori"}</button>
                        <button type="button" onClick={() => void removeSavedView(view)} className="rounded-lg border border-[var(--line)] px-2 py-1 text-[10px] text-red-600">Sil</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <ReportFilterBar from={range.from} to={range.to} onChange={setRange} />

          {selected ? (
            <ReportExportPanel reportKey={selected.key} range={range} columns={columns} sort={sort} />
          ) : null}
        </>
      )}
    </div>
  );
}
