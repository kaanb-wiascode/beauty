"use client";

import { useEffect, useState } from "react";

import { Alert, Spinner } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { userLabel } from "@/lib/user-language";
import {
  fetchReportFinanceDrilldown,
  type ReportFinanceDrilldownResponse,
} from "./report-finance-drilldown-client";

const money = (value: number) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value);

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));

export function ReportFinanceDrilldownPanel({
  rowId,
  title,
  filters,
  onClose,
}: {
  rowId: string;
  title: string;
  filters: { from: string; to: string };
  onClose: () => void;
}) {
  const [result, setResult] =
    useState<ReportFinanceDrilldownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { from, to } = filters;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetchReportFinanceDrilldown({ rowId, filters: { from, to } })
      .then((value) => {
        if (!cancelled) setResult(value);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Finans detayı yüklenemedi.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [from, to, rowId]);

  return (
    <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] shadow-lg">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">
            Finans Kayıtları
          </p>
          <h3 className="mt-1 text-[16px] font-semibold text-[var(--ink)]">
            {title}
          </h3>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Yalnız onaylı, yetkili kapsam içindeki kayıtlar; reversal sonrası
            aktif tahsilat ve ödeme tutarlarıyla gösterilir.
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
          <Spinner label="Finans detayları yükleniyor..." />
        </div>
      ) : null}

      {!loading && result ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--muted-soft)]">
              <tr>
                <th className="px-5 py-3">Tür</th>
                <th className="px-5 py-3">Tarih</th>
                <th className="px-5 py-3">Karşı Taraf</th>
                <th className="px-5 py-3">Açıklama</th>
                <th className="px-5 py-3">Döviz / Kur</th>
                <th className="px-5 py-3">Brüt TRY</th>
                <th className="px-5 py-3">Esas Tutar</th>
                <th className="px-5 py-3">Tahsilat / Ödeme</th>
                <th className="px-5 py-3">Açık</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((row) => (
                <tr
                  key={`${row.recordType}-${row.id}`}
                  className="border-b border-[var(--line)] last:border-0"
                >
                  <td className="px-5 py-3 font-medium">
                    {userLabel(row.recordType)}
                  </td>
                  <td className="px-5 py-3">
                    {dateTime(row.transactionDate)}
                  </td>
                  <td className="px-5 py-3">
                    {row.counterpartyName ?? "—"}
                  </td>
                  <td className="px-5 py-3">{row.description ?? "—"}</td>
                  <td className="px-5 py-3">
                    {row.currency} × {row.exchangeRate}
                  </td>
                  <td className="px-5 py-3">{money(row.grossTry)}</td>
                  <td className="px-5 py-3">
                    {money(row.settlementBaseTry)}
                  </td>
                  <td className="px-5 py-3">
                    {money(row.settledTry)}
                  </td>
                  <td className="px-5 py-3 font-medium">
                    {money(row.outstandingTry)}
                  </td>
                </tr>
              ))}
              {result.data.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-8 text-center text-[12px] text-[var(--muted)]"
                  >
                    Bu gün için raporlanabilir finans kaydı bulunamadı.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
