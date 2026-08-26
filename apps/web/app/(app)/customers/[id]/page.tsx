"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  GlassCard,
  PageHeader,
  Spinner,
  StatusBadge,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type CustomerDetail = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  createdAt: string;
  stats: {
    totalAppointments: number;
    completedAppointments: number;
    upcomingAppointments: number;
    totalSpent: number;
  };
  appointments: Appointment[];
};

type Appointment = {
  id: string;
  startAt: string;
  endAt: string;
  status:
    | "SCHEDULED"
    | "CONFIRMED"
    | "COMPLETED"
    | "CANCELLED"
    | "NO_SHOW";
  notes: string | null;
  service: {
    id: string;
    name: string;
    price: string | number;
    durationMinutes: number;
  };
  staff: {
    id: string;
    firstName: string;
    lastName: string;
  };
};

const STATUS_LABELS: Record<Appointment["status"], string> = {
  SCHEDULED: "Planlandı",
  CONFIRMED: "Onaylandı",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal",
  NO_SHOW: "Gelmedi",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMoney(value: number | string) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function fullName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim();
}

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const { id } = await params;
        const result = await api<CustomerDetail>(`/customers/${id}`);

        if (!cancelled) {
          setCustomer(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Müşteri bilgileri yüklenemedi.",
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
  }, [params]);

  const initials = useMemo(() => {
    if (!customer) return "?";

    return `${customer.firstName.charAt(0)}${customer.lastName.charAt(0)}`.toUpperCase();
  }, [customer]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Müşteri"
          description="Müşteri bilgileri yükleniyor."
        />
        <div className="mt-10">
          <Spinner label="Müşteri bilgileri yükleniyor..." />
        </div>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title="Müşteri"
          description="Müşteri detayları."
        />

        <Alert>{error || "Müşteri bulunamadı."}</Alert>

        <Link href="/customers">
          <Button variant="secondary">Müşterilere dön</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title={fullName(customer.firstName, customer.lastName)}
        description="Müşteri profili ve randevu geçmişi."
        action={
          <Link href="/customers">
            <Button variant="secondary">Müşterilere dön</Button>
          </Link>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Toplam randevu"
          value={customer.stats.totalAppointments}
        />

        <StatCard
          label="Tamamlanan"
          value={customer.stats.completedAppointments}
        />

        <StatCard
          label="Yaklaşan"
          value={customer.stats.upcomingAppointments}
        />

        <StatCard
          label="Toplam harcama"
          value={formatMoney(customer.stats.totalSpent)}
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <GlassCard>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[var(--accent-soft)] text-[18px] font-semibold text-[var(--accent)]">
              {initials}
            </div>

            <div className="min-w-0">
              <h2 className="truncate text-[18px] font-semibold text-[var(--ink)]">
                {fullName(customer.firstName, customer.lastName)}
              </h2>

              <p className="mt-1 text-[12px] text-[var(--muted)]">
                Müşteri
              </p>
            </div>
          </div>

          <div className="mt-7 space-y-4 border-t border-[var(--line)] pt-5">
            <InfoRow label="Telefon" value={customer.phone || "—"} />
            <InfoRow label="E-posta" value={customer.email || "—"} />
            <InfoRow
              label="Kayıt tarihi"
              value={formatDate(customer.createdAt)}
            />
          </div>
        </GlassCard>

        <GlassCard className="p-0">
          <div className="border-b border-[var(--line)] px-6 py-5">
            <h2 className="text-[18px] font-semibold text-[var(--ink)]">
              Randevu geçmişi
            </h2>

            <p className="mt-1 text-[13px] text-[var(--muted)]">
              Bu müşterinin tüm randevuları
            </p>
          </div>

          {customer.appointments.length === 0 ? (
            <div className="px-6 py-12 text-center text-[13px] text-[var(--muted)]">
              Henüz randevu bulunmuyor.
            </div>
          ) : (
            <div className="divide-y divide-[var(--line)]">
              {customer.appointments.map((appointment) => (
                <div
                  key={appointment.id}
                  className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-[var(--ink)]">
                      {appointment.service.name}
                    </p>

                    <p className="mt-1 text-[12px] text-[var(--muted)]">
                      {formatDateTime(appointment.startAt)}
                      {" · "}
                      {fullName(
                        appointment.staff.firstName,
                        appointment.staff.lastName,
                      )}
                    </p>

                    {appointment.notes ? (
                      <p className="mt-1 text-[12px] text-[var(--muted-soft)]">
                        {appointment.notes}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-[13px] font-medium text-[var(--ink)]">
                      {formatMoney(appointment.service.price)}
                    </span>

                    <StatusBadge
                      status={appointment.status}
                      label={STATUS_LABELS[appointment.status]}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <GlassCard>
      <p className="text-[12px] font-medium text-[var(--muted)]">
        {label}
      </p>

      <p className="mt-3 text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">
        {value}
      </p>
    </GlassCard>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted-soft)]">
        {label}
      </p>

      <p className="mt-1 text-[13px] text-[var(--ink)]">
        {value}
      </p>
    </div>
  );
}
