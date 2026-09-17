"use client";

import { useEffect, useState } from "react";

import { Alert, Spinner } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { userLabel } from "@/lib/user-language";
import {
  fetchReportDrilldown,
  type ReportDrilldownKey,
  type ReportDrilldownResponse,
} from "./report-drilldown-client";

const money = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("tr-TR", {
        style: "currency",
        currency: "TRY",
        maximumFractionDigits: 0,
      }).format(value);

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export function ReportDrilldownPanel({
  reportKey,
  rowId,
  title,
  filters,
  onClose,
}: {
  reportKey: ReportDrilldownKey;
  rowId: string;
  title: string;
  filters: { from: string; to: string };
  onClose: () => void;
}) {
  const [result, setResult] = useState<ReportDrilldownResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetchReportDrilldown({ reportKey, rowId, filters, page, limit: 10 })
      .then((value) => {
        if (!cancelled) setResult(value);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Rapor detayı yüklenemedi.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filters.from, filters.to, page, reportKey, rowId]);

  return (
    <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] shadow-lg">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">
            Randevu Drill-down
          </p>
          <h3 className="mt-1 text-[16px] font-semibold text-[var(--ink)]">
            {title}
          </h3>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Yalnız yetkili kapsam ve seçilen tarih aralığındaki randevular
            gösterilir.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[var(--line)] px-3 py-2 text-[11px] text-[var(--muted)]"
        >
          Kapat
        </button>
      </div>

      {error ? (
        <div className="p-4">
          <Alert onClose={() => setError("")}>{error}</Alert>
        </div>
      ) : null}
      {loading ? (
        <div className="p-5">
          <Spinner label="Randevu detayları yükleniyor..." />
        </div>
      ) : null}

      {!loading && result ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--muted-soft)]">
                <tr>
                  <th className="px-5 py-3">Başlangıç</th>
                  <th className="px-5 py-3">Bitiş</th>
                  <th className="px-5 py-3">Durum</th>
                  <th className="px-5 py-3">Ödeme</th>
                  <th className="px-5 py-3">Ödeme Durumu</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--line)] last:border-0"
                  >
                    <td className="px-5 py-3">{dateTime(row.startAt)}</td>
                    <td className="px-5 py-3">{dateTime(row.endAt)}</td>
                    <td className="px-5 py-3">{userLabel(row.status)}</td>
                    <td className="px-5 py-3 font-medium">
                      {money(row.paymentAmount)}
                    </td>
                    <td className="px-5 py-3">
                      {row.paymentStatus ? userLabel(row.paymentStatus) : "—"}
                    </td>
                  </tr>
                ))}
                {result.data.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-8 text-center text-[12px] text-[var(--muted)]"
                    >
                      Bu satır için seçilen dönemde randevu bulunamadı.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-[var(--line)] px-5 py-4">
            <span className="text-[11px] text-[var(--muted)]">
              Toplam {result.meta.total.toLocaleString("tr-TR")} kayıt
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
                className="rounded-lg border border-[var(--line)] px-3 py-2 text-[11px] disabled:opacity-40"
              >
                Önceki
              </button>
              <span className="text-[11px] text-[var(--muted)]">
                {page} / {Math.max(1, result.meta.totalPages)}
              </span>
              <button
                type="button"
                disabled={
                  result.meta.totalPages === 0 || page >= result.meta.totalPages
                }
                onClick={() => setPage((value) => value + 1)}
                className="rounded-lg border border-[var(--line)] px-3 py-2 text-[11px] disabled:opacity-40"
              >
                Sonraki
              </button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
