"use client";

import { useEffect, useMemo, useState } from "react";

import { PageHeader, Select } from "@/components/ui";
import { ApiError } from "@/lib/api";
import {
  ReportFilterBar,
  reportDateInputValue,
  type ReportDateRange,
} from "../report-filter-bar";
import { ReportExportPanel } from "../report-export-panel";
import {
  downloadReportExport,
  listReportExports,
  type ReportExportJob,
} from "../report-export-client";
import {
  getReportCatalog,
  type ReportCatalogItem,
  type ReportCatalogKey,
} from "../report-catalog-client";
import {
  createReportSavedView,
  deleteReportSavedView,
  getReportSavedView,
  listReportSavedViews,
  toggleReportSavedViewFavorite,
  type ReportSavedView,
  type SavedReportSort,
} from "../report-saved-view-client";

const EXPORT_STATUS_LABELS: Record<ReportExportJob["status"], string> = {
  QUEUED: "Sırada",
  PROCESSING: "Hazırlanıyor",
  READY: "Hazır",
  FAILED: "Başarısız",
  EXPIRED: "Süresi doldu",
};

const DEFAULT_SORTS: Partial<Record<ReportCatalogKey, SavedReportSort>> = {
  "staff.performance": { key: "collected", direction: "desc" },
  "service.performance": { key: "collected", direction: "desc" },
};

function savedDate(value: string) {
  return value.slice(0, 10);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
  const [openingSavedId, setOpeningSavedId] = useState<string | null>(null);
  const [recentExports, setRecentExports] = useState<ReportExportJob[]>([]);
  const [recentExportsLoading, setRecentExportsLoading] = useState(true);
  const [recentExportsError, setRecentExportsError] = useState("");
  const [downloadingRecentId, setDownloadingRecentId] = useState<string | null>(null);
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

    void refreshRecentExports(active);

    return () => {
      active = false;
    };
  }, []);

  const selected = useMemo(
    () => catalog.find((report) => report.key === reportKey),
    [catalog, reportKey],
  );

  const recentSavedViews = useMemo(
    () =>
      savedViews
        .filter((view) => view.lastOpenedAt)
        .slice()
        .sort(
          (a, b) =>
            new Date(b.lastOpenedAt ?? 0).getTime() -
            new Date(a.lastOpenedAt ?? 0).getTime(),
        )
        .slice(0, 4),
    [savedViews],
  );

  async function refreshRecentExports(active = true) {
    try {
      const result = await listReportExports({ page: 1, limit: 5, mine: true });
      if (!active) return;
      setRecentExports(result.data);
      setRecentExportsError("");
    } catch (error) {
      if (!active) return;
      setRecentExports([]);
      setRecentExportsError(
        error instanceof ApiError ? error.message : "Son dışa aktarımlar yüklenemedi.",
      );
    } finally {
      if (active) setRecentExportsLoading(false);
    }
  }

  function selectReport(key: ReportCatalogKey) {
    const definition = catalog.find((report) => report.key === key);
    setReportKey(key);
    setColumns(definition?.defaultColumns ?? []);
    setSort(DEFAULT_SORTS[key]);
  }

  async function applySavedView(view: ReportSavedView) {
    if (!catalog.some((report) => report.key === view.reportKey)) {
      setSavedError("Bu kaydedilmiş rapor için artık gerekli yetkiniz bulunmuyor.");
      return;
    }

    setOpeningSavedId(view.id);
    setSavedError("");
    try {
      const opened = await getReportSavedView(view.id);
      setReportKey(opened.reportKey);
      setRange({ from: savedDate(opened.filters.from), to: savedDate(opened.filters.to) });
      setColumns(opened.columns);
      setSort(opened.sort ?? undefined);
      setSavedViews((items) =>
        items.map((item) => (item.id === opened.id ? opened : item)),
      );
    } catch (error) {
      setSavedError(
        error instanceof ApiError ? error.message : "Kaydedilmiş rapor açılamadı.",
      );
    } finally {
      setOpeningSavedId(null);
    }
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

  async function downloadRecent(job: ReportExportJob) {
    setDownloadingRecentId(job.id);
    setRecentExportsError("");
    try {
      await downloadReportExport(job);
    } catch (error) {
      setRecentExportsError(
        error instanceof ApiError ? error.message : "Rapor dosyası indirilemedi.",
      );
    } finally {
      setDownloadingRecentId(null);
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
                <Select
                  value={reportKey ?? ""}
                  onChange={(event) => selectReport(event.target.value as ReportCatalogKey)}
                  className="mt-2 h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-[13px] text-[var(--ink)] sm:max-w-sm"
                >
                  {catalog.map((report) => (
                    <option key={report.key} value={report.key}>{report.title}</option>
                  ))}
                </Select>
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

          {recentSavedViews.length > 0 ? (
            <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
              <h2 className="text-[14px] font-semibold text-[var(--ink)]">Son Kullanılan Raporlar</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {recentSavedViews.map((view) => (
                  <button
                    key={view.id}
                    type="button"
                    disabled={openingSavedId === view.id}
                    onClick={() => void applySavedView(view)}
                    className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-left disabled:opacity-50"
                  >
                    <span className="block text-[11px] font-semibold text-[var(--ink)]">{view.name}</span>
                    <span className="mt-0.5 block text-[9px] text-[var(--muted-soft)]">
                      {view.lastOpenedAt ? formatDateTime(view.lastOpenedAt) : ""}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

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
                      <button
                        type="button"
                        disabled={openingSavedId === view.id}
                        onClick={() => void applySavedView(view)}
                        className="min-w-0 text-left disabled:opacity-50"
                      >
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

          <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[14px] font-semibold text-[var(--ink)]">Son Dışa Aktarımlar</h2>
                <p className="mt-1 text-[11px] text-[var(--muted)]">Tüm yetkili raporlarınızdan en son oluşturduğunuz dosyalar.</p>
              </div>
              <button type="button" onClick={() => void refreshRecentExports()} className="rounded-lg border border-[var(--line)] px-3 py-2 text-[10px] text-[var(--muted)]">Yenile</button>
            </div>
            {recentExportsError ? <p className="mt-3 text-[11px] text-red-600">{recentExportsError}</p> : null}
            {recentExportsLoading ? (
              <p className="mt-4 text-[12px] text-[var(--muted)]">Son dışa aktarımlar yükleniyor...</p>
            ) : recentExports.length === 0 ? (
              <p className="mt-4 text-[12px] text-[var(--muted)]">Henüz dışa aktarım bulunmuyor.</p>
            ) : (
              <div className="mt-4 divide-y divide-[var(--line)]">
                {recentExports.map((job) => (
                  <div key={job.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold text-[var(--ink)]">{catalog.find((item) => item.key === job.reportKey)?.title ?? job.reportKey}</span>
                        <span className="text-[10px] text-[var(--muted)]">{job.format}</span>
                        <span className="text-[10px] text-[var(--muted-soft)]">{EXPORT_STATUS_LABELS[job.status]}</span>
                      </div>
                      <p className="mt-1 text-[9px] text-[var(--muted-soft)]">{formatDateTime(job.requestedAt)}</p>
                    </div>
                    {job.status === "READY" ? (
                      <button
                        type="button"
                        disabled={downloadingRecentId === job.id}
                        onClick={() => void downloadRecent(job)}
                        className="rounded-lg border border-[var(--line)] px-3 py-2 text-[10px] font-semibold text-[var(--ink)] disabled:opacity-50"
                      >
                        {downloadingRecentId === job.id ? "İndiriliyor..." : "İndir"}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <ReportFilterBar from={range.from} to={range.to} onChange={setRange} />

          {selected ? (
            <ReportExportPanel
              reportKey={selected.key}
              range={range}
              columns={columns}
              sort={sort}
              onExportCreated={() => void refreshRecentExports()}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
