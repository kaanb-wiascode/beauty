"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Field,
  GlassCard,
  PageHeader,
  Panel,
  Spinner,
  TableWrap,
  Td,
  Th,
  TextInput,
} from "@/components/ui";

import { api, ApiError, withQuery } from "@/lib/api";

type DashboardReport = {
  summary: {
    gross: number;
    refunds: number;
    net: number;
    paymentCount: number;
    refundCount: number;
    appointmentCount: number;
    completedAppointments: number;
    methods: {
      CASH: number;
      CARD: number;
      TRANSFER: number;
    };
  };
  topService: {
    id: string;
    name: string;
    collected: number;
    appointmentCount: number;
  } | null;
  topStaff: {
    id: string;
    name: string;
    collected: number;
    appointmentCount: number;
  } | null;
  servicePerformance: {
    id: string;
    name: string;
    collected: number;
    appointmentCount: number;
  }[];
  staffPerformance: {
    id: string;
    name: string;
    collected: number;
    appointmentCount: number;
  }[];
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

export default function ReportsPage() {
  const today = useMemo(() => toDateInputValue(new Date()), []);

  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const [report, setReport] = useState<DashboardReport | null>(null);
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

        const result = await api<DashboardReport>(
          withQuery("/payments/dashboard-report", {
            from: start.toISOString(),
            to: end.toISOString(),
          }),
        );

        if (!cancelled) {
          setReport(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Rapor verileri yüklenemedi.",
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
        title="Raporlar"
        description="Salonunuzun seçili dönem için genel performans özeti."
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
        <Spinner label="Rapor hazırlanıyor..." />
      ) : report ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <ReportCard
              label="Brüt tahsilat"
              value={formatMoney(report.summary.gross)}
            />
            <ReportCard
              label="İadeler"
              value={formatMoney(report.summary.refunds)}
            />
            <ReportCard
              label="Net ciro"
              value={formatMoney(report.summary.net)}
            />
            <ReportCard
              label="Randevu"
              value={String(report.summary.appointmentCount)}
            />
            <ReportCard
              label="Tamamlanan"
              value={String(report.summary.completedAppointments)}
            />
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <GlassCard>
              <p className="text-[12px] font-medium text-[var(--muted)]">
                Nakit
              </p>
              <p className="mt-2 text-[26px] font-semibold tracking-[-0.04em] text-[var(--ink)]">
                {formatMoney(report.summary.methods.CASH)}
              </p>
            </GlassCard>

            <GlassCard>
              <p className="text-[12px] font-medium text-[var(--muted)]">
                Kart
              </p>
              <p className="mt-2 text-[26px] font-semibold tracking-[-0.04em] text-[var(--ink)]">
                {formatMoney(report.summary.methods.CARD)}
              </p>
            </GlassCard>

            <GlassCard>
              <p className="text-[12px] font-medium text-[var(--muted)]">
                Havale / EFT
              </p>
              <p className="mt-2 text-[26px] font-semibold tracking-[-0.04em] text-[var(--ink)]">
                {formatMoney(report.summary.methods.TRANSFER)}
              </p>
            </GlassCard>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <GlassCard>
              <p className="text-[12px] font-medium text-[var(--muted)]">
                En çok kazandıran hizmet
              </p>

              <p className="mt-2 text-[20px] font-semibold text-[var(--ink)]">
                {report.topService?.name ?? "—"}
              </p>

              {report.topService ? (
                <p className="mt-1 text-[13px] text-[var(--muted)]">
                  {formatMoney(report.topService.collected)} ·{" "}
                  {report.topService.appointmentCount} randevu
                </p>
              ) : null}
            </GlassCard>

            <GlassCard>
              <p className="text-[12px] font-medium text-[var(--muted)]">
                En çok tahsilat yapan personel
              </p>

              <p className="mt-2 text-[20px] font-semibold text-[var(--ink)]">
                {report.topStaff?.name ?? "—"}
              </p>

              {report.topStaff ? (
                <p className="mt-1 text-[13px] text-[var(--muted)]">
                  {formatMoney(report.topStaff.collected)} ·{" "}
                  {report.topStaff.appointmentCount} randevu
                </p>
              ) : null}
            </GlassCard>
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <Panel>
              <div className="border-b border-[var(--line)] px-5 py-4">
                <h2 className="text-[17px] font-semibold text-[var(--ink)]">
                  Hizmet özeti
                </h2>
              </div>

              <TableWrap>
                <thead>
                  <tr>
                    <Th>Hizmet</Th>
                    <Th>Randevu</Th>
                    <Th>Tahsilat</Th>
                  </tr>
                </thead>

                <tbody>
                  {report.servicePerformance.map((item) => (
                    <tr key={item.id}>
                      <Td label="Hizmet" className="font-medium">
                        {item.name}
                      </Td>
                      <Td label="Randevu">
                        {item.appointmentCount}
                      </Td>
                      <Td label="Tahsilat" className="font-medium">
                        {formatMoney(item.collected)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </Panel>

            <Panel>
              <div className="border-b border-[var(--line)] px-5 py-4">
                <h2 className="text-[17px] font-semibold text-[var(--ink)]">
                  Personel özeti
                </h2>
              </div>

              <TableWrap>
                <thead>
                  <tr>
                    <Th>Personel</Th>
                    <Th>Randevu</Th>
                    <Th>Tahsilat</Th>
                  </tr>
                </thead>

                <tbody>
                  {report.staffPerformance.map((item) => (
                    <tr key={item.id}>
                      <Td label="Personel" className="font-medium">
                        {item.name}
                      </Td>
                      <Td label="Randevu">
                        {item.appointmentCount}
                      </Td>
                      <Td label="Tahsilat" className="font-medium">
                        {formatMoney(item.collected)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </Panel>
          </section>
        </>
      ) : null}
    </div>
  );
}

function ReportCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="surface rounded-[22px] px-5 py-5">
      <p className="text-[12px] font-medium text-[var(--muted)]">
        {label}
      </p>

      <p className="mt-2 text-[26px] font-semibold tracking-[-0.04em] text-[var(--ink)]">
        {value}
      </p>
    </div>
  );
}
