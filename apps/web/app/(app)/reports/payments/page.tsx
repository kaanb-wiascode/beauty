"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Field,
  PageHeader,
  Panel,
  Spinner,
  TextInput,
} from "@/components/ui";

import { api, ApiError, withQuery } from "@/lib/api";

type Summary = {
  gross: number;
  refunds: number;
  net: number;
  paymentCount: number;
  refundCount: number;
  methods: {
    CASH: number;
    CARD: number;
    TRANSFER: number;
  };
};

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function PaymentReportsPage() {
  const today = useMemo(() => toDateInputValue(new Date()), []);

  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const start = new Date(`${from}T00:00:00`);
        const end = new Date(`${to}T23:59:59.999`);

        const result = await api<Summary>(
          withQuery("/payments/summary", {
            from: start.toISOString(),
            to: end.toISOString(),
          }),
        );

        if (!cancelled) {
          setSummary(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Kasa raporu yüklenemedi.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [from, to]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Kasa"
        description="Tahsilat, iade ve net ciro özetini görüntüleyin."
      />

      {error ? (
        <Alert onClose={() => setError("")}>{error}</Alert>
      ) : null}

      <Panel>
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          <Field label="Başlangıç tarihi">
            <TextInput
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </Field>

          <Field label="Bitiş tarihi">
            <TextInput
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </Field>
        </div>
      </Panel>

      {loading ? (
        <Spinner label="Kasa raporu hazırlanıyor..." />
      ) : summary ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <ReportCard
              label="Brüt tahsilat"
              value={formatMoney(summary.gross)}
              detail={`${summary.paymentCount} ödeme`}
            />

            <ReportCard
              label="İadeler"
              value={formatMoney(summary.refunds)}
              detail={`${summary.refundCount} iade`}
            />

            <ReportCard
              label="Net ciro"
              value={formatMoney(summary.net)}
              detail="Brüt tahsilat - iadeler"
            />
          </section>

          <section className="grid gap-4 sm:grid-cols-3">
            <ReportCard
              label="Nakit"
              value={formatMoney(summary.methods.CASH)}
              detail="Tahsilat"
            />

            <ReportCard
              label="Kart"
              value={formatMoney(summary.methods.CARD)}
              detail="Tahsilat"
            />

            <ReportCard
              label="Havale / EFT"
              value={formatMoney(summary.methods.TRANSFER)}
              detail="Tahsilat"
            />
          </section>
        </>
      ) : null}
    </div>
  );
}

function ReportCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="surface rounded-[22px] px-5 py-5">
      <p className="text-[12px] font-medium text-[var(--muted)]">
        {label}
      </p>

      <p className="mt-2 text-[30px] font-semibold tracking-[-0.04em] text-[var(--ink)]">
        {value}
      </p>

      <p className="mt-1 text-[12px] text-[var(--muted-soft)]">
        {detail}
      </p>
    </div>
  );
}
