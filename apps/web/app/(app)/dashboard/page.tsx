"use client";

import Link from "next/link";

import { useEffect, useMemo, useState } from "react";

import { api, ApiError, withQuery } from "@/lib/api";

import type { Paginated } from "@/lib/types";

import {

  Alert,

  GlassCard,

  PageHeader,

  Spinner,

  StatusBadge,

} from "@/components/ui";

type Customer = {

  id: string;

  firstName: string;

  lastName: string;

};

type Staff = {

  id: string;

  firstName: string;

  lastName: string;

  status: string;

};

type Service = {

  id: string;

  name: string;

  durationMinutes: number;

  price: string;

  status: string;

};

type Appointment = {

  id: string;

  customerId: string;

  staffId: string;

  serviceId: string;

  startAt: string;

  endAt: string;

  status:

    | "SCHEDULED"

    | "CONFIRMED"

    | "COMPLETED"

    | "CANCELLED"

    | "NO_SHOW";

  notes: string | null;

};

type Payment = {

  id: string;

  appointmentId: string;

  amount: string | number;

  method: "CASH" | "CARD" | "TRANSFER";

  paidAt: string;

};

type DashboardData = {

  customers: Customer[];

  staff: Staff[];

  services: Service[];

  appointments: Appointment[];

  payments: Payment[];

};

const STATUS_LABELS: Record<Appointment["status"], string> = {

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

function fullName(firstName: string, lastName: string) {

  return `${firstName} ${lastName}`.trim();

}

function getInitials(firstName: string, lastName: string) {

  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

}

async function fetchAll<T>(path: string) {

  const result = await api<Paginated<T>>(

    withQuery(path, {

      page: 1,

      limit: 100,

    }),

  );

  return result.data;

}

export default function DashboardPage() {

  const [data, setData] = useState<DashboardData | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  useEffect(() => {

    let cancelled = false;

    async function load() {

      setLoading(true);

      setError("");

      try {

        const [customers, staff, services, appointments, payments] =

          await Promise.all([

            fetchAll<Customer>("/customers"),

            fetchAll<Staff>("/staff"),

            fetchAll<Service>("/services"),

            fetchAll<Appointment>("/appointments"),

            fetchAll<Payment>("/payments"),

          ]);

        if (!cancelled) {

          setData({

            customers,

            staff,

            services,

            appointments,

            payments,

          });

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

  const todayAppointments = useMemo(() => {

    if (!data) return [];

    const now = new Date();

    const start = new Date(now);

    start.setHours(0, 0, 0, 0);

    const end = new Date(now);

    end.setHours(23, 59, 59, 999);

    return data.appointments

      .filter((appointment) => {

        const date = new Date(appointment.startAt);

        return (

          date >= start &&

          date <= end &&

          appointment.status !== "CANCELLED"

        );

      })

      .sort(

        (a, b) =>

          new Date(a.startAt).getTime() -

          new Date(b.startAt).getTime(),

      );

  }, [data]);

  const upcomingAppointments = useMemo(() => {

    if (!data) return [];

    const now = new Date();

    return data.appointments

      .filter((appointment) => {

        return (

          new Date(appointment.startAt) >= now &&

          appointment.status !== "CANCELLED" &&

          appointment.status !== "COMPLETED" &&

          appointment.status !== "NO_SHOW"

        );

      })

      .sort(

        (a, b) =>

          new Date(a.startAt).getTime() -

          new Date(b.startAt).getTime(),

      )

      .slice(0, 5);

  }, [data]);

  const todayCompleted = todayAppointments.filter(

    (appointment) => appointment.status === "COMPLETED",

  ).length;

  const todayConfirmed = todayAppointments.filter(

    (appointment) => appointment.status === "CONFIRMED",

  ).length;

  const todayScheduled = todayAppointments.filter(

    (appointment) => appointment.status === "SCHEDULED",

  ).length;

  const todayRevenue =

    data?.payments

      .filter((payment) => {

        const paidAt = new Date(payment.paidAt);

        const start = new Date();

        start.setHours(0, 0, 0, 0);

        const end = new Date();

        end.setHours(23, 59, 59, 999);

        return paidAt >= start && paidAt <= end;

      })

      .reduce(

        (total, payment) => total + Number(payment.amount),

        0,

      ) ?? 0;

  const todayPaymentBreakdown = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const totalForMethod = (method: Payment["method"]) =>
      data?.payments
        .filter((payment) => {
          const paidAt = new Date(payment.paidAt);
          return (
            payment.method === method &&
            paidAt >= start &&
            paidAt <= end
          );
        })
        .reduce(
          (total, payment) => total + Number(payment.amount),
          0,
        ) ?? 0;

    return {
      CASH: totalForMethod("CASH"),
      CARD: totalForMethod("CARD"),
      TRANSFER: totalForMethod("TRANSFER"),
    };
  }, [data]);

  if (loading) {

    return (

      <div className="mx-auto max-w-6xl">

        <PageHeader

          title="Bugün"

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

        title="Bugün"

        description={`${formatDate(new Date().toISOString())} · Salonunuzun günlük görünümü.`}

        action={

          <Link

            href="/appointments"

            className="inline-flex items-center justify-center rounded-[14px] bg-[var(--ink)] px-4 py-2.5 text-[14px] font-medium text-white shadow-[0_6px_18px_rgba(28,25,23,0.12)] transition-[transform,background-color] duration-[180ms] [transition-timing-function:var(--ease-out)] hover:bg-[#2a2622] active:scale-[0.98]"

          >

            Yeni randevu

          </Link>

        }

      />

      {error ? (

        <Alert onClose={() => setError("")}>{error}</Alert>

      ) : null}

      {data ? (

        <>

          {/* Top-level business overview */}

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

            <OverviewCard

              href="/customers"

              label="Müşteriler"

              value={data.customers.length}

              detail="Toplam müşteri"

              icon={<PeopleIcon />}

            />

            <OverviewCard

              href="/staff"

              label="Personel"

              value={

                data.staff.filter(

                  (member) => member.status === "ACTIVE",

                ).length

              }

              detail="Aktif ekip"

              icon={<StaffIcon />}

            />

            <OverviewCard

              href="/services"

              label="Hizmetler"

              value={

                data.services.filter(

                  (service) => service.status === "ACTIVE",

                ).length

              }

              detail="Aktif hizmet"

              icon={<SparkleIcon />}

            />

            <OverviewCard

              href="/appointments"

              label="Randevular"

              value={data.appointments.length}

              detail="Toplam randevu"

              icon={<CalendarIcon />}

            />

          </section>

          {/* Today's operational summary */}

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

            <MiniStat

              label="Bugün"

              value={todayAppointments.length}

              description="Randevu"

            />

            <MiniStat

              label="Onaylandı"

              value={todayConfirmed}

              description="Bugünkü randevu"

            />

            <MiniStat

              label="Planlandı"

              value={todayScheduled}

              description="Bekleyen randevu"

            />

            <MiniStat

              label="Ciro"

              value={todayRevenue}

              description="Tamamlanan hizmet"

              format="currency"

            />

          </section>

          <section className="grid gap-4 sm:grid-cols-3">

            <MiniStat
              label="Nakit"
              value={todayPaymentBreakdown.CASH}
              description="Bugünkü tahsilat"
              format="currency"
            />

            <MiniStat
              label="Kart"
              value={todayPaymentBreakdown.CARD}
              description="Bugünkü tahsilat"
              format="currency"
            />

            <MiniStat
              label="Havale / EFT"
              value={todayPaymentBreakdown.TRANSFER}
              description="Bugünkü tahsilat"
              format="currency"
            />

          </section>

          {/* Main operational area */}

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">

            <GlassCard className="p-0">

              <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-6 py-5">

                <div>

                  <h2 className="text-[18px] font-semibold tracking-[-0.025em] text-[var(--ink)]">

                    Bugünün randevuları

                  </h2>

                  <p className="mt-1 text-[13px] text-[var(--muted)]">

                    Gün içindeki operasyon akışı

                  </p>

                </div>

                <Link

                  href="/appointments"

                  className="text-[13px] font-medium text-[var(--accent)] hover:underline"

                >

                  Tümünü gör

                </Link>

              </div>

              {todayAppointments.length === 0 ? (

                <EmptyAppointments />

              ) : (

                <div className="divide-y divide-[var(--line)]">

                  {todayAppointments.map((appointment) => {

                    const customer = data.customers.find(

                      (item) => item.id === appointment.customerId,

                    );

                    const staff = data.staff.find(

                      (item) => item.id === appointment.staffId,

                    );

                    const service = data.services.find(

                      (item) => item.id === appointment.serviceId,

                    );

                    return (

                      <Link

                        key={appointment.id}

                        href="/appointments"

                        className="flex items-center gap-4 px-6 py-4 transition-[background-color] duration-[180ms] hover:bg-black/[0.025]"

                      >

                        <div className="w-16 shrink-0">

                          <p className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)]">

                            {formatTime(appointment.startAt)}

                          </p>

                          <p className="mt-0.5 text-[11px] text-[var(--muted)]">

                            {formatTime(appointment.endAt)}

                          </p>

                        </div>

                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[12px] font-semibold text-[var(--accent)]">

                          {customer

                            ? getInitials(

                                customer.firstName,

                                customer.lastName,

                              )

                            : "?"}

                        </div>

                        <div className="min-w-0 flex-1">

                          {customer ? (

                            <Link

                              href={`/customers/${customer.id}`}

                              className="truncate text-[14px] font-medium text-[var(--ink)] hover:text-[var(--accent)] hover:underline"

                              onClick={(event) => event.stopPropagation()}

                            >

                              {fullName(

                                customer.firstName,

                              customer.lastName,

                              )}

                            </Link>

                          ) : (

                            <p className="truncate text-[14px] font-medium text-[var(--ink)]">

                              Müşteri

                            </p>

                          )}

                          <p className="mt-0.5 truncate text-[12px] text-[var(--muted)]">

                            {service?.name ?? "Hizmet"}{" "}

                            {staff

                              ? `· ${fullName(

                                  staff.firstName,

                                  staff.lastName,

                                )}`

                              : ""}

                          </p>

                        </div>

                        <StatusBadge

                          status={appointment.status}

                          label={

                            STATUS_LABELS[

                              appointment.status

                            ]

                          }

                        />

                      </Link>

                    );

                  })}

                </div>

              )}

            </GlassCard>

            {/* Upcoming */}

            <GlassCard className="p-0">

              <div className="border-b border-[var(--line)] px-6 py-5">

                <h2 className="text-[18px] font-semibold tracking-[-0.025em] text-[var(--ink)]">

                  Sıradaki randevular

                </h2>

                <p className="mt-1 text-[13px] text-[var(--muted)]">

                  Yaklaşan operasyon

                </p>

              </div>

              {upcomingAppointments.length === 0 ? (

                <div className="px-6 py-12 text-center">

                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">

                    <CalendarIcon />

                  </div>

                  <p className="mt-4 text-[14px] font-medium text-[var(--ink)]">

                    Yaklaşan randevu yok

                  </p>

                  <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">

                    Yeni bir randevu oluşturduğunuzda burada

                    görünecek.

                  </p>

                  <Link

                    href="/appointments"

                    className="mt-5 inline-flex text-[13px] font-medium text-[var(--accent)]"

                  >

                    Randevulara git

                  </Link>

                </div>

              ) : (

                <div className="divide-y divide-[var(--line)]">

                  {upcomingAppointments.map((appointment) => {

                    const customer = data.customers.find(

                      (item) => item.id === appointment.customerId,

                    );

                    const service = data.services.find(

                      (item) => item.id === appointment.serviceId,

                    );

                    return (

                      <div

                        key={appointment.id}

                        className="px-6 py-4"

                      >

                        <div className="flex items-center justify-between gap-3">

                          <p className="text-[14px] font-medium text-[var(--ink)]">

                            {customer

                              ? fullName(

                                  customer.firstName,

                                  customer.lastName,

                                )

                              : "Müşteri"}

                          </p>

                          <span className="text-[12px] font-medium text-[var(--accent)]">

                            {formatTime(appointment.startAt)}

                          </span>

                        </div>

                        <p className="mt-1 text-[12px] text-[var(--muted)]">

                          {service?.name ?? "Hizmet"} ·{" "}

                          {formatDate(appointment.startAt)}

                        </p>

                      </div>

                    );

                  })}

                </div>

              )}

            </GlassCard>

          </section>

          {/* Quick actions */}

          <section>

            <div className="mb-4">

              <h2 className="text-[18px] font-semibold tracking-[-0.025em] text-[var(--ink)]">

                Hızlı işlemler

              </h2>

              <p className="mt-1 text-[13px] text-[var(--muted)]">

                Günlük işlemlere hızlı erişim

              </p>

            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

              <QuickAction

                href="/appointments"

                icon={<CalendarIcon />}

                title="Randevu oluştur"

                description="Yeni bir randevu planla"

              />

              <QuickAction

                href="/customers"

                icon={<PeopleIcon />}

                title="Müşteri ekle"

                description="Yeni müşteri kaydı oluştur"

              />

              <QuickAction

                href="/staff"

                icon={<StaffIcon />}

                title="Ekibi yönet"

                description="Personel durumlarını görüntüle"

              />

              <QuickAction

                href="/services"

                icon={<SparkleIcon />}

                title="Hizmetleri yönet"

                description="Hizmet ve fiyatlarını düzenle"

              />

            </div>

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

    <Link

      href={href}

      className="group"

    >

      <GlassCard className="h-full transition-[transform,box-shadow,background-color] duration-[220ms] [transition-timing-function:var(--ease-out)] hover:-translate-y-0.5 hover:shadow-[0_14px_40px_rgba(28,25,23,0.1)]">

        <div className="flex items-start justify-between gap-4">

          <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[var(--accent-soft)] text-[var(--accent)]">

            {icon}

          </div>

          <span className="text-[var(--muted-soft)] transition-transform duration-[180ms] group-hover:translate-x-0.5">

            →

          </span>

        </div>

        <p className="mt-6 text-[13px] font-medium text-[var(--muted)]">

          {label}

        </p>

        <p className="mt-2 text-[40px] font-semibold leading-none tracking-[-0.05em] text-[var(--ink)]">

          {value}

        </p>

        <p className="mt-2 text-[12px] text-[var(--muted-soft)]">

          {detail}

        </p>

      </GlassCard>

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

    <div className="surface rounded-[22px] px-5 py-4">

      <div className="flex items-end justify-between gap-4">

        <div>

          <p className="text-[12px] font-medium text-[var(--muted)]">

            {label}

          </p>

          <p className="mt-1 text-[27px] font-semibold leading-none tracking-[-0.04em] text-[var(--ink)]">

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