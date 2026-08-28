"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Field,
  PageHeader,
  Panel,
  Spinner,
  TableWrap,
  Td,
  Th,
  TextInput,
} from "@/components/ui";

import { api, ApiError, withQuery } from "@/lib/api";

type StaffPerformance = {
  staff: {
    id: string;
    firstName: string;
    lastName: string;
    status: string;
  };
  appointmentCount: number;
  completedAppointments: number;
  collected: number;
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

function fullName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim();
}

export default function StaffReportPage() {
  const today = useMemo(() => toDateInputValue(new Date()), []);

  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const [rows, setRows] = useState<StaffPerformance[]>([]);
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

        const result = await api<StaffPerformance[]>(
          withQuery("/staff/performance", {
            from: start.toISOString(),
            to: end.toISOString(),
          }),
        );

        if (!cancelled) {
          setRows(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Personel raporu yüklenemedi.",
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

  const totals = useMemo(
    () =>
      rows.reduce(
        (total, row) => ({
          appointments:
            total.appointments + row.appointmentCount,
          completed:
            total.completed + row.completedAppointments,
          collected: total.collected + row.collected,
        }),
        {
          appointments: 0,
          completed: 0,
          collected: 0,
        },
      ),
    [rows],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Personel Performansı"
        description="Personel bazında randevu ve tahsilat performansını görüntüleyin."
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
        <Spinner label="Personel raporu hazırlanıyor..." />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <ReportCard
              label="Toplam randevu"
              value={String(totals.appointments)}
            />
            <ReportCard
              label="Tamamlanan"
              value={String(totals.completed)}
            />
            <ReportCard
              label="Toplam tahsilat"
              value={formatMoney(totals.collected)}
            />
          </section>

          <Panel>
            {rows.length === 0 ? (
              <div className="px-6 py-12 text-center text-[13px] text-[var(--muted)]">
                Seçilen tarih aralığında personel verisi bulunamadı.
              </div>
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Personel</Th>
                    <Th>Randevu</Th>
                    <Th>Tamamlanan</Th>
                    <Th>Tahsilat</Th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row) => (
                    <tr key={row.staff.id}>
                      <Td label="Personel" className="font-medium">
                        {fullName(
                          row.staff.firstName,
                          row.staff.lastName,
                        )}
                      </Td>

                      <Td label="Randevu">
                        {row.appointmentCount}
                      </Td>

                      <Td label="Tamamlanan">
                        {row.completedAppointments}
                      </Td>

                      <Td label="Tahsilat" className="font-medium">
                        {formatMoney(row.collected)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Panel>
        </>
      )}
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

      <p className="mt-2 text-[30px] font-semibold tracking-[-0.04em] text-[var(--ink)]">
        {value}
      </p>
    </div>
  );
}
