"use client";

import Link from "next/link";

import { useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";

import {
  Alert,
  GlassCard,
  PageHeader,
  Spinner,
  StatusBadge,
} from "@/components/ui";

type AppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

type DashboardAppointment = {
  id: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  notes: string | null;
  customer: {
    id: string;
    firstName: string;
    lastName: string;
  };
  staff: {
    id: string;
    firstName: string;
    lastName: string;
  };
  service: {
    id: string;
    name: string;
  };
  payment: {
    id: string;
    amount: number;
    method: "CASH" | "CARD" | "TRANSFER";
    status: "COMPLETED" | "REFUNDED";
    paidAt: string;
  } | null;
};

type PeriodMetrics = {
  gross: number;
  refunds: number;
  net: number;
  appointmentCount: number;
  completedAppointments: number;
  cancelledAppointments: number;
  noShowAppointments: number;
  newCustomers: number;
};

type DashboardReport = {
  summary: {
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
    appointmentCount: number;
    completedAppointments: number;
    scheduledAppointments: number;
    confirmedAppointments: number;
    cancelledAppointments: number;
    noShowAppointments: number;
  };
  totals: {
    customers: number;
    activeStaff: number;
    activeServices: number;
    appointments: number;
  };
  paymentBreakdown: {
    CASH: number;
    CARD: number;
    TRANSFER: number;
  };
  periods: {
    last7Days: PeriodMetrics;
    month: PeriodMetrics;
  };
  todayAppointments: DashboardAppointment[];
  upcomingAppointments: DashboardAppointment[];
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

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: "Planlandı",
  CONFIRMED: "Onaylandı",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal",
  NO_SHOW: "Gelmedi",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
  }).format(new Date(value));
}

function getDashboardGreeting(firstName?: string) {
  const name = firstName?.trim() || "Değerli Kullanıcı";
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) {
    return `Günaydın, ${name}`;
  }

  if (hour >= 12 && hour < 18) {
    return `İyi Günler, ${name}`;
  }

  if (hour >= 18) {
    return `İyi Akşamlar, ${name}`;
  }

  return `İyi Geceler, ${name}`;
}

function fullName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim();
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function startOfToday() {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfToday() {
  const value = new Date();
  value.setHours(23, 59, 59, 999);
  return value;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const user = getStoredUser();
  const greeting = getDashboardGreeting(user?.firstName);


  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const from = startOfToday().toISOString();
        const to = endOfToday().toISOString();

        const report = await api<DashboardReport>(
          `/payments/dashboard-report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        );

        if (!cancelled) {
          setData(report);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Dashboard verileri yüklenemedi.",
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
  }, []);

  const todayAppointments = data?.todayAppointments ?? [];
  const upcomingAppointments: DashboardAppointment[] = data ? data.upcomingAppointments : [];
  const visibleUpcomingAppointments: DashboardAppointment[] = upcomingAppointments.slice(0, 5);
  const todayRevenue = data?.summary.net ?? 0;

if (loading) {

    return (

      <div className="mx-auto max-w-6xl">

        <PageHeader

          title={greeting}

          description="Salonunuzun günlük görünümü."

        />



        <div className="mt-10">

          <Spinner label="Bugünün verileri hazırlanıyor..." />

        </div>

      </div>

    );

  }

  return (

    <div className="mx-auto max-w-6xl space-y-8">

      <PageHeader

        title={greeting}

        description={`${formatDate(new Date().toISOString())} · Salonunuzun günlük görünümü.`}

      />

      {error ? (

        <Alert onClose={() => setError("")}>{error}</Alert>

      ) : null}

      {data ? (

        <>

          <section className="min-w-0">
  <div className="flex items-center justify-between gap-3">
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
        Hızlı işlemler
      </p>
      <p className="mt-1 text-[12px] text-[var(--muted)]">
        Günlük işlemlere hızlı erişim
      </p>
    </div>
  </div>

  <div className="mt-3 flex min-w-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    <Link
      href="/appointments"
      className="group inline-flex h-11 shrink-0 items-center gap-2 rounded-[15px] border border-[#DED9D3] bg-[#F3F1EE] px-4 text-[13px] font-medium text-[#514A43] shadow-[0_2px_8px_rgba(81,74,67,0.06)] transition-[transform,backgroundx-shadow] duration-[180ms] hover:-translate-y-0.5 hover:bg-[color-mix(in_srgb,var(--accent)_88%,black)] hover:shadow-[0_8px_20px_rgba(28,25,23,0.12)]"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[15px] leading-none">
        +
      </span>
      <span>Yeni randevu</span>
    </Link>

    <Link
      href="/customers"
      className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[15px] border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-medium text-[var(--ink)] transition-[transform,background-color,border-color] duration-[180ms] hover:-translate-y-0.5 hover:bg-[var(--surface-2)]"
    >
      <span className="text-[var(--accent)]">+</span>
      <span>Müşteri ekle</span>
    </Link>

    <Link
      href="/staff"
      className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[15px] border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-medium text-[var(--ink)] transition-[transform,background-color,border-color] duration-[180ms] hover:-translate-y-0.5 hover:bg-[var(--surface-2)]"
    >
      <span className="text-[var(--muted)]">↗</span>
      <span>Ekibi yönet</span>
    </Link>

    <Link
      href="/services"
      className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[15px] border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-medium text-[var(--ink)] transition-[transform,background-color,border-color] duration-[180ms] hover:-translate-y-0.5 hover:bg-[var(--surface-2)]"
    >
      <span className="text-[var(--accent)]">✦</span>
      <span>Hizmetleri yönet</span>
    </Link>
  </div>
</section>

{/* Top-level business overview */}

          <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">

            <OverviewCard

              href="/customers"

              label="Müşteriler"

              value={data.totals.customers}

              detail="Toplam müşteri"

              icon={<PeopleIcon />}

            />

            <OverviewCard

              href="/staff"

              label="Personel"

              value={data.totals.activeStaff}

              detail="Aktif ekip"

              icon={<StaffIcon />}

            />

            <OverviewCard

              href="/services"

              label="Hizmetler"

              value={data.totals.activeServices}

              detail="Aktif hizmet"

              icon={<SparkleIcon />}

            />

            <OverviewCard

              href="/appointments"

              label="Randevular"

              value={data.totals.appointments}

              detail="Toplam randevu"

              icon={<CalendarIcon />}

            />

          </section>

          {/* Today's operational summary */}

          <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">

            <MiniStat

              label="Bugün"

              value={data.summary.appointmentCount}

              description="Randevu"

            />

            <MiniStat

              label="Onaylandı"

              value={data.summary.confirmedAppointments}

              description="Bugünkü randevu"

            />

            <MiniStat

              label="Planlandı"

              value={data.summary.scheduledAppointments}

              description="Bekleyen randevu"

            />

            <MiniStat

              label="Ciro"

              value={todayRevenue}

              description="Tamamlanan hizmet"

              format="currency"

            />

          </section>

{/* Performance overview */}
<section className="grid gap-4 xl:grid-cols-2">
  <PeriodCard
    label="Son 7 gün"
    badge="7 GÜN"
    subtitle="Günlük işletme performansı"
    net={data.periods.last7Days.net}
    appointments={data.periods.last7Days.appointmentCount}
    completed={data.periods.last7Days.completedAppointments}
    newCustomers={data.periods.last7Days.newCustomers}
  />

  <PeriodCard
    label="Bu ay"
    badge="BU AY"
    subtitle="Aylık işletme performansı"
    net={data.periods.month.net}
    appointments={data.periods.month.appointmentCount}
    completed={data.periods.month.completedAppointments}
    newCustomers={data.periods.month.newCustomers}
  />
</section>

{/* Main operational area */}
<section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
  <GlassCard className="min-w-0 overflow-hidden p-0">
    <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4 sm:px-6 sm:py-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
            Bugün
          </span>
          <span className="h-1 w-1 rounded-full bg-[var(--line)]" />
          <span className="text-[10px] font-medium text-[var(--muted-soft)]">
            Günlük plan
          </span>
        </div>

        <h2 className="mt-1.5 text-[18px] font-semibold tracking-[-0.03em] text-[var(--ink)]">
          Bugünün randevuları
        </h2>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">
          {todayAppointments.length}
        </span>

        <Link
          href="/appointments"
          className="text-[12px] font-medium text-[var(--accent)] transition-opacity hover:opacity-70"
        >
          Tümü
        </Link>
      </div>
    </div>

    {todayAppointments.length === 0 ? (
      <EmptyAppointments />
    ) : (
      <div className="divide-y divide-[var(--line)]">
        {todayAppointments.slice(0, 5).map((appointment) => (
          <Link
            key={appointment.id}
            href="/appointments"
            className="grid min-w-0 grid-cols-[58px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-black/[0.018] sm:px-6"
          >
            <div className="min-w-0">
              <p className="text-[14px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
                {formatTime(appointment.startAt)}
              </p>
              <p className="mt-0.5 text-[10px] text-[var(--muted-soft)]">
                {formatTime(appointment.endAt)}
              </p>
            </div>

            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[10px] font-semibold text-[var(--accent)]">
                {appointment.customer
                  ? getInitials(
                      appointment.customer.firstName,
                      appointment.customer.lastName,
                    )
                  : "?"}
              </div>

              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-[var(--ink)]">
                  {appointment.customer
                    ? fullName(
                        appointment.customer.firstName,
                        appointment.customer.lastName,
                      )
                    : "Müşteri"}
                </p>

                <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
                  {appointment.service.name ?? "Hizmet"}
                  {appointment.staff
                    ? ` · ${fullName(
                        appointment.staff.firstName,
                        appointment.staff.lastName,
                      )}`
                    : ""}
                </p>
              </div>
            </div>

            <StatusBadge
              status={appointment.status}
              label={STATUS_LABELS[appointment.status]}
            />
          </Link>
        ))}
      </div>
    )}
  </GlassCard>

  <GlassCard className="min-w-0 overflow-hidden p-0">
    <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4 sm:px-6 sm:py-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
            Sıradaki
          </span>
          <span className="h-1 w-1 rounded-full bg-[var(--line)]" />
          <span className="text-[10px] font-medium text-[var(--muted-soft)]">
            Yaklaşan
          </span>
        </div>

        <h2 className="mt-1.5 text-[18px] font-semibold tracking-[-0.03em] text-[var(--ink)]">
          Randevular
        </h2>
      </div>

      <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold text-[var(--muted)]">
        {upcomingAppointments.length}
      </span>
    </div>

    {upcomingAppointments ? (
      <div className="px-5 py-10 text-center sm:px-6">
        <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-[12px] bg-[var(--accent-soft)] text-[var(--accent)]">
          <CalendarIcon />
        </div>

        <p className="mt-3 text-[13px] font-medium text-[var(--ink)]">
          Yaklaşan randevu yok
        </p>

        <Link
          href="/appointments"
          className="mt-2 inline-flex text-[12px] font-medium text-[var(--accent)]"
        >
          Randevulara git
        </Link>
      </div>
    ) : (
      <div className="px-5 py-2 sm:px-6">
        {visibleUpcomingAppointments.map((appointment, index) => (
          <Link
            key={appointment.id}
            href="/appointments"
            className="group relative grid grid-cols-[56px_16px_minmax(0,1fr)] gap-2.5 py-3"
          >
            {index < visibleUpcomingAppointments.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute left-[63px] top-[31px] bottom-[-1px] w-px bg-[var(--line)]"
              />
            ) : null}

            <div className="pt-0.5 text-right">
              <p className="text-[12px] font-semibold text-[var(--accent)]">
                {formatTime(appointment.startAt)}
              </p>
            </div>

            <div className="relative z-10 flex items-start justify-center pt-1">
              <span className="h-2 w-2 rounded-full border-2 border-[var(--surface)] bg-[var(--accent)] shadow-[0_0_0_1px_var(--accent-soft)]" />
            </div>

            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-[var(--ink)] transition-colors group-hover:text-[var(--accent)]">
                {appointment.customer
                  ? fullName(
                      appointment.customer.firstName,
                      appointment.customer.lastName,
                    )
                  : "Müşteri"}
              </p>

              <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
                {appointment.service.name ?? "Hizmet"}
              </p>

              <p className="mt-0.5 truncate text-[10px] text-[var(--muted-soft)]">
                {formatDate(appointment.startAt)}
                {appointment.staff
                  ? ` · ${fullName(
                      appointment.staff.firstName,
                      appointment.staff.lastName,
                    )}`
                  : ""}
              </p>
            </div>
          </Link>
        ))}
      </div>
    )}
  </GlassCard>
</section>

{/* Business snapshot */}
<section className="grid min-w-0 gap-4 xl:grid-cols-2">
  <GlassCard className="min-w-0 overflow-hidden p-0">
    <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4 sm:px-6 sm:py-5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
          Bugün
        </p>
        <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-[var(--ink)]">
          Ödeme özeti
        </h2>
        <p className="mt-1 text-[12px] text-[var(--muted)]">
          Günlük tahsilat dağılımı
        </p>
      </div>

      <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">
        Kasa
      </span>
    </div>

    <div className="p-4 sm:p-5">
      {(() => {
        const total =
          data.paymentBreakdown.CASH +
          data.paymentBreakdown.CARD +
          data.paymentBreakdown.TRANSFER;

        return (
          <>
            <div className="rounded-[18px] bg-[var(--accent-soft)] px-4 py-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Toplam tahsilat
              </p>

              <p className="mt-1 text-[28px] font-semibold leading-none tracking-[-0.045em] text-[var(--ink)]">
                {new Intl.NumberFormat("tr-TR", {
                  style: "currency",
                  currency: "TRY",
                  maximumFractionDigits: 0,
                }).format(total)}
              </p>
            </div>

            <div className="mt-3 space-y-2">
              <PaymentBreakdownRow
                label="Nakit"
                value={data.paymentBreakdown.CASH}
                total={total}
              />

              <PaymentBreakdownRow
                label="Kart"
                value={data.paymentBreakdown.CARD}
                total={total}
              />

              <PaymentBreakdownRow
                label="Havale / EFT"
                value={data.paymentBreakdown.TRANSFER}
                total={total}
              />
            </div>
          </>
        );
      })()}
    </div>
  </GlassCard>

  <GlassCard className="min-w-0 overflow-hidden p-0">
    <div className="border-b border-[var(--line)] px-5 py-4 sm:px-6 sm:py-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
        İşletme
      </p>

      <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-[var(--ink)]">
      Öne çıkanlar
      </h2>

      <p className="mt-1 text-[12px] text-[var(--muted)]">
        Bugünün dikkat çeken performansı
      </p>
    </div>

    <div className="divide-y divide-[var(--line)] px-5 sm:px-6">
      <HighlightRow
        eyebrow="En iyi hizmet"
        title={data.topService?.name ?? "Henüz yok"}
        value={
          data.topService
            ? new Intl.NumberFormat("tr-TR", {
                style: "currency",
                currency: "TRY",
                maximumFractionDigits: 0,
              }).format(data.topService.collected)
            : "₺0"
        }
        icon={<SparkleIcon />}
      />

      <HighlightRow
        eyebrow="En iyi personel"
        title={data.topStaff?.name ?? "Henüz yok"}
        value={
          data.topStaff
            ? new Intl.NumberFormat("tr-TR", {
                style: "currency",
                currency: "TRY",
                maximumFractionDigits: 0,
              }).format(data.topStaff.collected)
            : "₺0"
        }
        icon={<StaffIcon />}
      />
    </div>
  </GlassCard>
</section>

        </>

      ) : null}

    </div>

  );

}

function OverviewCard({
  href,
  label,
  value,
  detail,
  icon,
}: {
  href: string;
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <Link href={href} className="group min-w-0">
      <div
        className="surface min-w-0 rounded-[18px] px-4 py-3.5 transition-[transform,box-shadow,background-color] duration-[180ms] hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(28,25,23,0.07)] sm:rounded-[20px] sm:px-5 sm:py-4"
      >
        <p className="truncate text-[11px] font-medium text-[var(--muted)] sm:text-[12px]">
          {label}
        </p>

        <p className="mt-2 text-[28px] font-semibold leading-none tracking-[-0.05em] text-[var(--ink)] sm:text-[32px]">
          {value}
        </p>

        <p className="mt-1 text-[10px] text-[var(--muted-soft)] sm:text-[11px]">
          {detail}
        </p>
      </div>
    </Link>
  );
}

function MiniStat({

  label,

  value,

  description,

  format = "number",

}: {

  label: string;

  value: number;

  description: string;

  format?: "number" | "currency";

}) {

  const displayValue =

    format === "currency"

      ? new Intl.NumberFormat("tr-TR", {

          style: "currency",

          currency: "TRY",

          maximumFractionDigits: 0,

        }).format(value)

      : value;

  return (

    <div className="surface rounded-[18px] px-4 py-3.5 sm:rounded-[22px] sm:px-5 sm:py-4">

      <div className="flex items-end justify-between gap-4">

        <div>

          <p className="text-[12px] font-medium text-[var(--muted)]">

            {label}

          </p>

          <p className="mt-1 text-[24px] font-semibold leading-none tracking-[-0.04em] text-[var(--ink)] sm:text-[27px]">

            {displayValue}

          </p>

        </div>

        <p className="text-[12px] text-[var(--muted-soft)]">

          {description}

        </p>

      </div>

    </div>

  );

}

function PeriodCard({
  label,
  badge,
  subtitle,
  net,
  appointments,
  completed,
  newCustomers,
}: {
  label: string;
  badge: string;
  subtitle: string;
  net: number;
  appointments: number;
  completed: number;
  newCustomers: number;
}) {
  const money = new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  });

  return (
    <GlassCard className="overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 px-5 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold tracking-[-0.025em] text-[var(--ink)]">
            {label}
          </h2>

          <p className="mt-1 text-[12px] text-[var(--muted)]">
            {subtitle}
          </p>
        </div>

        <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold tracking-[0.06em] text-[var(--accent)]">
          {badge}
        </span>
      </div>

      <div className="border-t border-[var(--line)] px-5 py-4 sm:px-6">
        <div className="rounded-[17px] bg-[var(--accent-soft)] px-4 py-3.5">
          <p className="text-[10px] font-medium uppercase tracking-[0.07em] text-[var(--muted)]">
            Net ciro
          </p>

          <p className="mt-1 text-[27px] font-semibold leading-none tracking-[-0.045em] text-[var(--ink)] sm:text-[30px]">
            {money.format(net)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 border-t border-[var(--line)]">
        <PeriodMetric label="Randevu" value={appointments} />
        <PeriodMetric label="Tamamlanan" value={completed} />
        <PeriodMetric label="Yeni müşteri" value={newCustomers} />
      </div>
    </GlassCard>
  );
}

function PeriodMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="min-w-0 px-3 py-3.5 text-center sm:px-4 sm:py-4">
      <p className="truncate text-[10px] font-medium text-[var(--muted)] sm:text-[11px]">
        {label}
      </p>

      <p className="mt-1 text-[20px] font-semibold leading-none tracking-[-0.04em] text-[var(--ink)] sm:text-[22px]">
        {value}
      </p>
    </div>
  );
}

function PaymentBreakdownRow({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div className="rounded-[15px] border border-[var(--line)] px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-medium text-[var(--ink)]">
          {label}
        </span>

        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-[var(--ink)]">
            {new Intl.NumberFormat("tr-TR", {
              style: "currency",
              currency: "TRY",
              maximumFractionDigits: 0,
            }).format(value)}
          </span>

          <span className="min-w-[32px] text-right text-[10px] font-medium text-[var(--muted)]">
            %{percentage}
          </span>
        </div>
      </div>

      <div className="mt-2 h-1 overflow-hidden rounded-full bg-black/[0.05]">
        <div
          className="h-full rounded-full bg-[var(--accent)]"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function HighlightRow({
  eyebrow,
  title,
  value,
  icon,
}: {
  eyebrow: string;
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[var(--accent-soft)] text-[var(--accent)]">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
          {eyebrow}
        </p>

        <p className="mt-0.5 truncate text-[14px] font-semibold text-[var(--ink)]">
          {title}
        </p>
      </div>

      <p className="shrink-0 text-[13px] font-semibold text-[var(--ink)]">
        {value}
      </p>
    </div>
  );
}

function QuickAction({

  href,

  icon,

  title,

  description,

}: {

  href: string;

  icon: React.ReactNode;

  title: string;

  description: string;

}) {

  return (

    <Link

      href={href}

      className="surface group flex items-center gap-4 rounded-[22px] p-4 transition-[transform,box-shadow,background-color] duration-[180ms] [transition-timing-function:var(--ease-out)] hover:-translate-y-0.5 hover:bg-white/80 hover:shadow-[0_10px_28px_rgba(28,25,23,0.07)]"

    >

      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--accent-soft)] text-[var(--accent)]">

        {icon}

      </div>

      <div className="min-w-0">

        <p className="truncate text-[13px] font-medium text-[var(--ink)]">

          {title}

        </p>

        <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">

          {description}

        </p>

      </div>

      <span className="ml-auto text-[var(--muted-soft)] transition-transform duration-[180ms] group-hover:translate-x-0.5">

        →

      </span>

    </Link>

  );

}

function EmptyAppointments() {

  return (

    <div className="px-6 py-16 text-center">

      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[18px] bg-[var(--accent-soft)] text-[var(--accent)]">

        <CalendarIcon />

      </div>

      <h3 className="mt-5 text-[16px] font-semibold text-[var(--ink)]">

        Bugün randevu yok

      </h3>

      <p className="mx-auto mt-2 max-w-sm text-[13px] leading-6 text-[var(--muted)]">

        Bugün için planlanmış bir randevu bulunmuyor.

        Yeni bir randevu oluşturarak gününüzü planlayabilirsiniz.

      </p>

      <Link

        href="/appointments"

        className="mt-5 inline-flex rounded-[14px] bg-[var(--ink)] px-4 py-2.5 text-[13px] font-medium text-white transition-[transform,background-color] duration-[180ms] hover:bg-[#2a2622] active:scale-[0.98]"

      >

        Randevulara git

      </Link>

    </div>

  );

}

function HomeIcon() {

  return (

    <svg

      width="18"

      height="18"

      viewBox="0 0 24 24"

      fill="none"

      aria-hidden="true"

    >

      <path

        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"

        stroke="currentColor"

        strokeWidth="1.6"

        strokeLinejoin="round"

      />

    </svg>

  );

}

function PeopleIcon() {

  return (

    <svg

      width="18"

      height="18"

      viewBox="0 0 24 24"

      fill="none"

      aria-hidden="true"

    >

      <circle

        cx="9"

        cy="8"

        r="3"

        stroke="currentColor"

        strokeWidth="1.6"

      />

      <path

        d="M4 19a5 5 0 0 1 10 0"

        stroke="currentColor"

        strokeWidth="1.6"

        strokeLinecap="round"

      />

      <circle

        cx="17"

        cy="9"

        r="2.2"

        stroke="currentColor"

        strokeWidth="1.6"

      />

      <path

        d="M16 19a4 4 0 0 1 5-3.7"

        stroke="currentColor"

        strokeWidth="1.6"

        strokeLinecap="round"

      />

    </svg>

  );

}

function StaffIcon() {

  return (

    <svg

      width="18"

      height="18"

      viewBox="0 0 24 24"

      fill="none"

      aria-hidden="true"

    >

      <circle

        cx="12"

        cy="8"

        r="3"

        stroke="currentColor"

        strokeWidth="1.6"

      />

      <path

        d="M5 19a7 7 0 0 1 14 0"

        stroke="currentColor"

        strokeWidth="1.6"

        strokeLinecap="round"

      />

    </svg>

  );

}

function SparkleIcon() {

  return (

    <svg

      width="18"

      height="18"

      viewBox="0 0 24 24"

      fill="none"

      aria-hidden="true"

    >

      <path

        d="M12 4.5 13.4 9l4.6 1.4L13.4 12 12 16.5 10.6 12 6 10.4 10.6 9 12 4.5Z"

        stroke="currentColor"

        strokeWidth="1.6"

        strokeLinejoin="round"

      />

    </svg>

  );

}

function CalendarIcon() {

  return (

    <svg

      width="18"

      height="18"

      viewBox="0 0 24 24"

      fill="none"

      aria-hidden="true"

    >

      <rect

        x="4"

        y="6"

        width="16"

        height="14"

        rx="2.5"

        stroke="currentColor"

        strokeWidth="1.6"

      />

      <path

        d="M8 4v3M16 4v3M4 10h16"

        stroke="currentColor"

        strokeWidth="1.6"

        strokeLinecap="round"

      />

    </svg>

  );

}
