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
import { PaymentModal } from "@/components/payment-modal";

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
    totalPaid: number;
    totalRefunded: number;
    netSpent: number;
    lastPaymentAt: string | null;
  };
  payments: Payment[];
  appointments: Appointment[];
};

type Payment = {
  id: string;
  appointmentId: string;
  amount: number;
  method: "CASH" | "CARD" | "TRANSFER";
  status: "COMPLETED" | "REFUNDED";
  paidAt: string;
  refundedAt: string | null;
  refundReason: string | null;
  service: {
    id: string;
    name: string;
  };
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
  payment: {
    id: string;
    amount: string | number;
    method: "CASH" | "CARD" | "TRANSFER";
    paidAt: string;
  } | null;
};

const PAYMENT_METHOD_LABELS: Record<Payment["method"], string> = {
  CASH: "Nakit",
  CARD: "Kart",
  TRANSFER: "Havale / EFT",
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
  const [paymentAppointment, setPaymentAppointment] =
    useState<Appointment | null>(null);

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
          <div className="flex items-center gap-2">
            <Link href={`/appointments?customerId=${customer.id}`}>
              <Button>Yeni randevu</Button>
            </Link>

            <Link href="/customers">
              <Button variant="secondary">Müşterilere dön</Button>
            </Link>
          </div>
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
          label="Net harcama"
          value={formatMoney(customer.stats.netSpent)}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Toplam tahsilat"
          value={formatMoney(customer.stats.totalPaid)}
        />

        <StatCard
          label="Toplam iade"
          value={formatMoney(customer.stats.totalRefunded)}
        />

        <StatCard
          label="Net harcama"
          value={formatMoney(customer.stats.netSpent)}
        />

        <StatCard
          label="Son ödeme"
          value={
            customer.stats.lastPaymentAt
              ? formatDateTime(customer.stats.lastPaymentAt)
              : "—"
          }
        />
      </section>

      <section>
        <GlassCard className="p-0">
          <div className="border-b border-[var(--line)] px-6 py-5">
            <h2 className="text-[18px] font-semibold text-[var(--ink)]">
              Ödeme geçmişi
            </h2>
            <p className="mt-1 text-[13px] text-[var(--muted)]">
              Bu müşterinin tahsilat ve iade kayıtları
            </p>
          </div>

          {customer.payments.length === 0 ? (
            <div className="px-6 py-10 text-center text-[13px] text-[var(--muted)]">
              Henüz ödeme kaydı bulunmuyor.
            </div>
          ) : (
            <div className="divide-y divide-[var(--line)]">
              {customer.payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-[var(--ink)]">
                      {payment.service.name}
                    </p>
                    <p className="mt-1 text-[12px] text-[var(--muted)]">
                      {formatDateTime(payment.paidAt)}
                      {" · "}
                      {PAYMENT_METHOD_LABELS[payment.method]}
                    </p>
                    {payment.status === "REFUNDED" && payment.refundReason ? (
                      <p className="mt-1 text-[12px] text-[var(--muted-soft)]">
                        İade nedeni: {payment.refundReason}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-[13px] font-semibold text-[var(--ink)]">
                      {formatMoney(payment.amount)}
                    </span>
                    <StatusBadge
                      status={payment.status}
                      label={
                        payment.status === "REFUNDED"
                          ? "İade edildi"
                          : "Tamamlandı"
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
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

                    {!appointment.payment &&
                    appointment.status !== "CANCELLED" &&
                    appointment.status !== "NO_SHOW" ? (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setPaymentAppointment(appointment)
                        }
                      >
                        Ödeme al
                      </Button>
                    ) : null}

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
      <PaymentModal
        open={paymentAppointment !== null}
        onClose={() => setPaymentAppointment(null)}
        appointment={paymentAppointment}
        customerName={
          customer
            ? fullName(
                customer.firstName,
                customer.lastName,
              )
            : ""
        }
        serviceName={
          paymentAppointment?.service.name ?? "Hizmet"
        }
        defaultAmount={
          paymentAppointment?.service.price ?? ""
        }
        onSaved={async () => {
          setPaymentAppointment(null);
          const id = await params.then((value) => value.id);
          const result = await api<CustomerDetail>(
            `/customers/${id}`,
          );
          setCustomer(result);
        }}
      />

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
