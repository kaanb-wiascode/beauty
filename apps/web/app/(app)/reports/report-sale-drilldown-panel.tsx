"use client";

import { useEffect, useState } from "react";

import { Alert, Spinner } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { userLabel } from "@/lib/user-language";
import {
  fetchReportSaleDrilldown,
  type ReportSaleDrilldownResponse,
} from "./report-sale-drilldown-client";

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

export function ReportSaleDrilldownPanel({
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
  const [result, setResult] = useState<ReportSaleDrilldownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetchReportSaleDrilldown({ rowId, filters })
      .then((value) => {
        if (!cancelled) setResult(value);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Satış detayı yüklenemedi.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filters.from, filters.to, rowId]);

  return (
    <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] shadow-lg">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">
            Satış Kaydı
          </p>
          <h3 className="mt-1 text-[16px] font-semibold text-[var(--ink)]">
            {title}
          </h3>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Yalnız yetkili kapsam ve seçilen rapor dönemindeki onaylanmış satış
            kaydı gösterilir.
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
          <Spinner label="Satış detayı yükleniyor..." />
        </div>
      ) : null}

      {!loading && result ? (
        <div className="space-y-5 p-5">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Satış Toplamı" value={money(result.data.total)} />
            <Metric label="Ara Toplam" value={money(result.data.subtotal)} />
            <Metric
              label="İndirim"
              value={money(result.data.discountTotal)}
            />
            <Metric
              label="Onay"
              value={dateTime(result.data.confirmedAt)}
              detail={userLabel(result.data.status)}
            />
          </section>

          <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
            <div className="border-b border-[var(--line)] px-4 py-3">
              <h4 className="text-[13px] font-semibold text-[var(--ink)]">
                Satış Kalemleri
              </h4>
            </div>
            <table className="w-full text-left text-[12px]">
              <thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--muted-soft)]">
                <tr>
                  <th className="px-4 py-3">Kalem</th>
                  <th className="px-4 py-3">Tür</th>
                  <th className="px-4 py-3">Adet</th>
                  <th className="px-4 py-3">Birim</th>
                  <th className="px-4 py-3">Toplam</th>
                </tr>
              </thead>
              <tbody>
                {result.data.items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-[var(--line)] last:border-0"
                  >
                    <td className="px-4 py-3 font-medium">{item.description}</td>
                    <td className="px-4 py-3">{userLabel(item.type)}</td>
                    <td className="px-4 py-3">{item.quantity}</td>
                    <td className="px-4 py-3">{money(item.unitPrice)}</td>
                    <td className="px-4 py-3 font-medium">
                      {money(item.lineTotal)}
                    </td>
                  </tr>
                ))}
                {result.data.items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-7 text-center text-[12px] text-[var(--muted)]"
                    >
                      Satış kalemi bulunamadı.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
            <div className="border-b border-[var(--line)] px-4 py-3">
              <h4 className="text-[13px] font-semibold text-[var(--ink)]">
                Ödemeler
              </h4>
            </div>
            <table className="w-full text-left text-[12px]">
              <thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--muted-soft)]">
                <tr>
                  <th className="px-4 py-3">Tarih</th>
                  <th className="px-4 py-3">Yöntem</th>
                  <th className="px-4 py-3">Durum</th>
                  <th className="px-4 py-3">Tutar</th>
                  <th className="px-4 py-3">İade Tarihi</th>
                </tr>
              </thead>
              <tbody>
                {result.data.payments.map((payment) => (
                  <tr
                    key={payment.id}
                    className="border-b border-[var(--line)] last:border-0"
                  >
                    <td className="px-4 py-3">{dateTime(payment.paidAt)}</td>
                    <td className="px-4 py-3">{userLabel(payment.method)}</td>
                    <td className="px-4 py-3">{userLabel(payment.status)}</td>
                    <td className="px-4 py-3 font-medium">
                      {money(payment.amount)}
                    </td>
                    <td className="px-4 py-3">
                      {payment.refundedAt
                        ? dateTime(payment.refundedAt)
                        : "—"}
                    </td>
                  </tr>
                ))}
                {result.data.payments.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-7 text-center text-[12px] text-[var(--muted)]"
                    >
                      Ödeme kaydı bulunamadı.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3">
      <p className="text-[10px] uppercase tracking-wide text-[var(--muted-soft)]">
        {label}
      </p>
      <p className="mt-1 text-[16px] font-semibold text-[var(--ink)]">
        {value}
      </p>
      {detail ? (
        <p className="mt-1 text-[10px] text-[var(--muted)]">{detail}</p>
      ) : null}
    </div>
  );
}
