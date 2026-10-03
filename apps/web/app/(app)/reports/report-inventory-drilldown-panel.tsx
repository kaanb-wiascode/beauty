"use client";

import { useEffect, useState } from "react";

import { Alert, Spinner } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { userLabel } from "@/lib/user-language";
import {
  fetchReportInventoryDrilldown,
  type ReportInventoryDrilldownResponse,
} from "./report-inventory-drilldown-client";

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
  }).format(new Date(value));

export function ReportInventoryDrilldownPanel({
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
    useState<ReportInventoryDrilldownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { from, to } = filters;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetchReportInventoryDrilldown({ rowId, filters: { from, to } })
      .then((value) => {
        if (!cancelled) setResult(value);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Stok hareketleri yüklenemedi.",
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
            Stok Hareketleri
          </p>
          <h3 className="mt-1 text-[16px] font-semibold text-[var(--ink)]">
            {title}
          </h3>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Yalnız yetkili depo kapsamındaki kaynak hareketler gösterilir.
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
          <Spinner label="Stok hareketleri yükleniyor..." />
        </div>
      ) : null}

      {!loading && result ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--muted-soft)]">
              <tr>
                <th className="px-5 py-3">Tarih</th>
                <th className="px-5 py-3">Ürün</th>
                <th className="px-5 py-3">SKU</th>
                <th className="px-5 py-3">Depo</th>
                <th className="px-5 py-3">Tür</th>
                <th className="px-5 py-3">Miktar</th>
                <th className="px-5 py-3">Birim Maliyet</th>
                <th className="px-5 py-3">Değer</th>
                <th className="px-5 py-3">Kaynak</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--line)] last:border-0"
                >
                  <td className="px-5 py-3">{dateTime(row.createdAt)}</td>
                  <td className="px-5 py-3 font-medium">{row.productName}</td>
                  <td className="px-5 py-3">{row.sku ?? "—"}</td>
                  <td className="px-5 py-3">{row.warehouseName}</td>
                  <td className="px-5 py-3">{userLabel(row.movementType)}</td>
                  <td className="px-5 py-3">
                    {row.quantity.toLocaleString("tr-TR")}
                  </td>
                  <td className="px-5 py-3">{money(row.unitCost)}</td>
                  <td className="px-5 py-3 font-medium">
                    {money(row.movementValue)}
                  </td>
                  <td className="px-5 py-3">
                    {row.referenceType ? userLabel(row.referenceType) : "—"}
                  </td>
                </tr>
              ))}
              {result.data.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-8 text-center text-[12px] text-[var(--muted)]"
                  >
                    Bu bucket için kaynak stok hareketi bulunamadı.
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
