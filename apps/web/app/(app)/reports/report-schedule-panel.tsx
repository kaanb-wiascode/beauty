"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiError } from "@/lib/api";
import type { ReportCatalogItem, ReportCatalogKey } from "./report-catalog-client";
import type { ReportExportFormat } from "./report-export-client";
import type { SavedReportSort } from "./report-saved-view-client";
import {
  createReportSchedule,
  deleteReportSchedule,
  listReportScheduleRuns,
  listReportSchedules,
  updateReportSchedule,
  type ReportSchedule,
  type ReportScheduleDatePreset,
  type ReportScheduleFrequency,
  type ReportScheduleRun,
} from "./report-schedule-client";

const PRESETS: Array<{ value: ReportScheduleDatePreset; label: string }> = [
  { value: "TODAY", label: "Bugün" },
  { value: "YESTERDAY", label: "Dün" },
  { value: "LAST_7_DAYS", label: "Son 7 Gün" },
  { value: "LAST_30_DAYS", label: "Son 30 Gün" },
  { value: "THIS_MONTH", label: "Bu Ay" },
  { value: "PREVIOUS_MONTH", label: "Önceki Ay" },
];

const WEEKDAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

const RUN_STATUS_LABELS: Record<ReportScheduleRun["status"], string> = {
  CLAIMED: "İşleme alındı",
  QUEUED: "Sırada",
  FAILED: "Başarısız",
};

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function frequencyLabel(schedule: ReportSchedule) {
  if (schedule.frequency === "DAILY") return "Her gün";
  if (schedule.frequency === "WEEKLY") return `Her ${WEEKDAYS[(schedule.dayOfWeek ?? 1) - 1]}`;
  return `Her ayın ${schedule.dayOfMonth}. günü`;
}

export function ReportSchedulePanel({
  catalog,
  reportKey,
  columns,
  sort,
}: {
  catalog: ReportCatalogItem[];
  reportKey: ReportCatalogKey;
  columns: readonly string[];
  sort?: SavedReportSort;
}) {
  const selected = useMemo(() => catalog.find((item) => item.key === reportKey), [catalog, reportKey]);
  const [items, setItems] = useState<ReportSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<ReportScheduleFrequency>("DAILY");
  const [datePreset, setDatePreset] = useState<ReportScheduleDatePreset>("LAST_7_DAYS");
  const [format, setFormat] = useState<ReportExportFormat>("XLSX");
  const [time, setTime] = useState("09:00");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [includeSummary, setIncludeSummary] = useState(true);
  const [creating, setCreating] = useState(false);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [runs, setRuns] = useState<ReportScheduleRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void listReportSchedules()
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof ApiError ? cause.message : "Zamanlanmış raporlar yüklenemedi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const available = selected?.exportFormats ?? [];
    if (!available.includes(format)) setFormat(available[0] ?? "CSV");
  }, [selected, format]);

  async function createSchedule() {
    if (!selected || !name.trim() || columns.length === 0) return;
    const [hour, minute] = time.split(":").map(Number);
    setCreating(true);
    setError("");
    try {
      const created = await createReportSchedule({
        name: name.trim(),
        reportKey,
        frequency,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Istanbul",
        localHour: hour,
        localMinute: minute,
        dayOfWeek: frequency === "WEEKLY" ? dayOfWeek : undefined,
        dayOfMonth: frequency === "MONTHLY" ? dayOfMonth : undefined,
        format,
        datePreset,
        columns,
        sort,
        includeSummary,
        enabled: true,
      });
      setItems((current) => [created, ...current]);
      setName("");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Zamanlanmış rapor oluşturulamadı.");
    } finally {
      setCreating(false);
    }
  }

  async function toggle(schedule: ReportSchedule) {
    setBusyId(schedule.id);
    setError("");
    try {
      const updated = await updateReportSchedule(schedule.id, { enabled: !schedule.enabled });
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Zamanlama güncellenemedi.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(schedule: ReportSchedule) {
    setBusyId(schedule.id);
    setError("");
    try {
      await deleteReportSchedule(schedule.id);
      setItems((current) => current.filter((item) => item.id !== schedule.id));
      if (historyId === schedule.id) {
        setHistoryId(null);
        setRuns([]);
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Zamanlama silinemedi.");
    } finally {
      setBusyId(null);
    }
  }

  async function openHistory(schedule: ReportSchedule) {
    if (historyId === schedule.id) {
      setHistoryId(null);
      setRuns([]);
      return;
    }
    setHistoryId(schedule.id);
    setRunsLoading(true);
    setError("");
    try {
      setRuns(await listReportScheduleRuns(schedule.id));
    } catch (cause) {
      setRuns([]);
      setError(cause instanceof ApiError ? cause.message : "Çalıştırma geçmişi yüklenemedi.");
    } finally {
      setRunsLoading(false);
    }
  }

  return (
    <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--ink)]">Zamanlanmış Raporlar</h2>
          <p className="mt-1 text-[11px] text-[var(--muted)]">Seçili raporu dinamik tarih aralığıyla otomatik üretin. Teslimat şimdilik güvenli indirme merkezine yapılır.</p>
        </div>
        <span className="text-[11px] text-[var(--muted-soft)]">{items.length} zamanlama</span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-6">
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Zamanlama adı" className="h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-[12px] lg:col-span-2" />
        <select value={frequency} onChange={(event) => setFrequency(event.target.value as ReportScheduleFrequency)} className="h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-[12px]">
          <option value="DAILY">Günlük</option><option value="WEEKLY">Haftalık</option><option value="MONTHLY">Aylık</option>
        </select>
        <select value={datePreset} onChange={(event) => setDatePreset(event.target.value as ReportScheduleDatePreset)} className="h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-[12px]">
          {PRESETS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select value={format} onChange={(event) => setFormat(event.target.value as ReportExportFormat)} className="h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-[12px]">
          {(selected?.exportFormats ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-[12px]" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {frequency === "WEEKLY" ? (
          <select value={dayOfWeek} onChange={(event) => setDayOfWeek(Number(event.target.value))} className="h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-[12px]">
            {WEEKDAYS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
          </select>
        ) : null}
        {frequency === "MONTHLY" ? (
          <select value={dayOfMonth} onChange={(event) => setDayOfMonth(Number(event.target.value))} className="h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-[12px]">
            {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>Ayın {day}. günü</option>)}
          </select>
        ) : null}
        <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]"><input type="checkbox" checked={includeSummary} onChange={(event) => setIncludeSummary(event.target.checked)} /> Özet dahil</label>
        <button type="button" disabled={creating || !name.trim() || columns.length === 0 || !selected} onClick={() => void createSchedule()} className="ml-auto h-10 rounded-xl bg-[var(--ink)] px-4 text-[11px] font-semibold text-white disabled:opacity-50">{creating ? "Oluşturuluyor..." : "Zamanlama Oluştur"}</button>
      </div>

      {error ? <p className="mt-3 text-[11px] text-red-600">{error}</p> : null}
      {loading ? <p className="mt-4 text-[12px] text-[var(--muted)]">Zamanlamalar yükleniyor...</p> : items.length === 0 ? <p className="mt-4 text-[12px] text-[var(--muted)]">Henüz zamanlanmış rapor bulunmuyor.</p> : (
        <div className="mt-4 space-y-2">
          {items.map((schedule) => (
            <div key={schedule.id} className="rounded-xl border border-[var(--line)] bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-[12px] font-semibold text-[var(--ink)]">{schedule.name}</span><span className="text-[10px] text-[var(--muted-soft)]">{schedule.enabled ? "Aktif" : "Duraklatıldı"}</span></div>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">{catalog.find((item) => item.key === schedule.reportKey)?.title ?? "Rapor"} · {frequencyLabel(schedule)} · {String(schedule.localHour).padStart(2, "0")}:{String(schedule.localMinute).padStart(2, "0")} · {schedule.format}</p>
                  <p className="mt-1 text-[9px] text-[var(--muted-soft)]">Sonraki: {formatDateTime(schedule.nextRunAt)} · Son çalışma: {formatDateTime(schedule.lastRunAt)}</p>
                  {schedule.lastErrorCode ? <p className="mt-1 text-[9px] text-red-600">Son çalıştırmada rapor oluşturulamadı.</p> : null}
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => void openHistory(schedule)} className="rounded-lg border border-[var(--line)] px-2 py-1 text-[10px] text-[var(--muted)]">Geçmiş</button>
                  <button type="button" disabled={busyId === schedule.id} onClick={() => void toggle(schedule)} className="rounded-lg border border-[var(--line)] px-2 py-1 text-[10px] text-[var(--muted)] disabled:opacity-50">{schedule.enabled ? "Duraklat" : "Etkinleştir"}</button>
                  <button type="button" disabled={busyId === schedule.id} onClick={() => void remove(schedule)} className="rounded-lg border border-[var(--line)] px-2 py-1 text-[10px] text-red-600 disabled:opacity-50">Sil</button>
                </div>
              </div>
              {historyId === schedule.id ? (
                <div className="mt-3 border-t border-[var(--line)] pt-3">
                  {runsLoading ? <p className="text-[10px] text-[var(--muted)]">Çalıştırma geçmişi yükleniyor...</p> : runs.length === 0 ? <p className="text-[10px] text-[var(--muted)]">Henüz çalışma kaydı yok.</p> : (
                    <div className="space-y-1.5">{runs.map((run) => <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 text-[10px]"><span className="text-[var(--muted)]">{formatDateTime(run.scheduledFor)}</span><span className={run.status === "FAILED" ? "text-red-600" : "text-[var(--ink)]"}>{RUN_STATUS_LABELS[run.status]}{run.errorCode ? " · Rapor oluşturulamadı" : ""}</span></div>)}</div>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
