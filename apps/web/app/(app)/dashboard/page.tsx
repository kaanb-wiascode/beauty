"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { getStoredTenant, getStoredUser } from "@/lib/auth";
import { Alert, Spinner, StatusBadge } from "@/components/ui";

type AppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

type PaymentMethod = "CASH" | "CARD" | "TRANSFER";

type DashboardAppointment = {
  id: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  notes: string | null;
  customer: { id: string; firstName: string; lastName: string };
  staff: { id: string; firstName: string; lastName: string };
  service: { id: string; name: string };
  payment: {
    id: string;
    amount: number;
    method: PaymentMethod;
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
    methods: Record<PaymentMethod, number>;
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
  paymentBreakdown: Record<PaymentMethod, number>;
  periods: { last7Days: PeriodMetrics; month: PeriodMetrics };
  todayAppointments: DashboardAppointment[];
  upcomingAppointments: DashboardAppointment[];
  topService: { id: string; name: string; collected: number; appointmentCount: number } | null;
  topStaff: { id: string; name: string; collected: number; appointmentCount: number } | null;
  servicePerformance: { id: string; name: string; collected: number; appointmentCount: number }[];
  staffPerformance: { id: string; name: string; collected: number; appointmentCount: number }[];
};

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: "Planlandı",
  CONFIRMED: "Onaylandı",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal",
  NO_SHOW: "Gelmedi",
};

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
});

function formatTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatLongDate(value: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    weekday: "long",
  }).format(value);
}

function fullName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim();
}

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function greeting(firstName?: string) {
  const name = firstName?.trim() || "Kaan";
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return `Günaydın, ${name}`;
  if (hour >= 12 && hour < 18) return `İyi Günler, ${name}`;
  if (hour >= 18) return `İyi Akşamlar, ${name}`;
  return `İyi Geceler, ${name}`;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfToday() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

export default function DashboardPage() {
  const user = getStoredUser();
  const tenant = getStoredTenant();
  const [data, setData] = useState<DashboardReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
        if (!cancelled) setData(report);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Dashboard verileri yüklenemedi.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1380px] px-1 py-8">
        <Spinner label="Dashboard hazırlanıyor..." />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-[1380px] py-8">
        <Alert onClose={() => setError("")}>{error || "Dashboard verileri bulunamadı."}</Alert>
      </div>
    );
  }

  const todayAppointments = data.todayAppointments.slice().sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
  const upcoming = data.upcomingAppointments
    .filter((appointment) => appointment.status !== "CANCELLED" && appointment.status !== "NO_SHOW")
    .slice()
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const nextAppointment = upcoming[0] ?? null;
  const paymentTotal = Object.values(data.paymentBreakdown).reduce((sum, value) => sum + value, 0);

  const paymentRows = [
    ["Nakit", data.paymentBreakdown.CASH],
    ["Kart", data.paymentBreakdown.CARD],
    ["Havale / EFT", data.paymentBreakdown.TRANSFER],
  ] as const;

  const periodBars = useMemo(() => {
    const metrics = data.periods.last7Days;
    return [
      { label: "Randevu", value: metrics.appointmentCount, max: Math.max(metrics.appointmentCount, 1), tone: "info" },
      { label: "Tamamlanan", value: metrics.completedAppointments, max: Math.max(metrics.appointmentCount, 1), tone: "success" },
      { label: "Yeni müşteri", value: metrics.newCustomers, max: Math.max(metrics.appointmentCount, metrics.newCustomers, 1), tone: "neutral" },
    ];
  }, [data.periods.last7Days]);

  return (
    <div className="mx-auto max-w-[1380px] space-y-4 pb-8">
      <header className="dashboard-topbar">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" className="dashboard-icon-button hidden lg:inline-flex" aria-label="Menü">
            <MenuIcon />
          </button>
          <button type="button" className="dashboard-icon-button" aria-label="Favorilere ekle">
            <StarIcon />
          </button>
          <div className="hidden items-center gap-2 text-[13px] text-[var(--muted)] sm:flex">
            <span>Dashboard</span><span className="text-[var(--muted-soft)]">/</span>
            <span className="font-semibold text-[var(--ink)]">Bugün</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="dashboard-search hidden md:flex"><SearchIcon /><span>Ara...</span><kbd>⌘K</kbd></div>
          <button type="button" className="dashboard-icon-button" aria-label="Tema"><SunIcon /></button>
          <button type="button" className="dashboard-icon-button hidden sm:inline-flex" aria-label="Geçmiş"><HistoryIcon /></button>
          <button type="button" className="dashboard-icon-button" aria-label="Bildirimler"><BellIcon /></button>
        </div>
      </header>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_250px]">
        <main className="min-w-0 space-y-4">
          <section className="dashboard-hero">
            <div className="min-w-0">
              <p className="dashboard-eyebrow">{formatLongDate(new Date())} · {tenant?.name ?? "Beauty Studio Demo"}</p>
              <h1>{greeting()} <span aria-hidden="true">👋</span></h1>
            </div>
            <Link href="/appointments" className="dashboard-primary-action"><span>+</span> Yeni Randevu <ChevronDownIcon /></Link>
          </section>

          {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard icon={<CalendarIcon />} iconTone="neutral" label="Bugünkü Randevu" value={data.summary.appointmentCount} detail="Toplam" badge={`${data.summary.scheduledAppointments} planlandı`} badgeTone="info" />
            <MetricCard icon={<WalletIcon />} iconTone="success" label="Tahsilat" value={money.format(data.summary.net)} detail="Bugün" badge={`${data.summary.paymentCount} işlem`} badgeTone="success" />
            <MetricCard icon={<CheckCircleIcon />} iconTone="info" label="Tamamlanan" value={data.summary.completedAppointments} detail="Bugün" badge={`%${data.summary.appointmentCount ? Math.round((data.summary.completedAppointments / data.summary.appointmentCount) * 100) : 0}`} badgeTone="info" />
            <MetricCard icon={<ClockIcon />} iconTone="warning" label="Bekleyen" value={data.summary.scheduledAppointments} detail="Bugün" badge={`%${data.summary.appointmentCount ? Math.round((data.summary.scheduledAppointments / data.summary.appointmentCount) * 100) : 0}`} badgeTone="warning" />
          </section>

          <section className="grid min-w-0 gap-4 lg:grid-cols-2">
            <Panel title="Bugünün Programı" subtitle={formatLongDate(new Date())} action={<Link href="/appointments" className="panel-link-button">Tümü</Link>}>
              {todayAppointments.length === 0 ? (
                <EmptyState label="Bugün randevu yok" href="/appointments" />
              ) : (
                <div className="divide-y divide-[var(--line)]">
                  {todayAppointments.slice(0, 4).map((appointment) => (
                    <Link key={appointment.id} href="/appointments" className="schedule-row">
                      <div className="schedule-time"><strong>{formatTime(appointment.startAt)}</strong><span>{formatTime(appointment.endAt)}</span></div>
                      <div className="schedule-dot" />
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar label={initials(appointment.customer.firstName, appointment.customer.lastName)} />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-[var(--ink)]">{fullName(appointment.customer.firstName, appointment.customer.lastName)}</p>
                          <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{appointment.service.name}</p>
                          <p className="mt-0.5 truncate text-[10px] text-[var(--muted-soft)]">{fullName(appointment.staff.firstName, appointment.staff.lastName)}</p>
                        </div>
                      </div>
                      <StatusBadge status={appointment.status} label={STATUS_LABELS[appointment.status]} />
                    </Link>
                  ))}
                </div>
              )}
              <Link href="/appointments" className="panel-footer-link"><CalendarIcon /> Takvimi aç <ArrowRightIcon /></Link>
            </Panel>

            <Panel title="Sıradaki Randevu" subtitle="Yaklaşan program" action={nextAppointment ? <span className="count-chip">{formatTime(nextAppointment.startAt)}</span> : null}>
              {nextAppointment ? (
                <div className="next-appointment">
                  <div className="flex items-center justify-between gap-3">
                    <div className="next-time">{formatTime(nextAppointment.startAt)}</div>
                    <span className="soft-chip">{timeUntil(nextAppointment.startAt)}</span>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <Avatar label={initials(nextAppointment.customer.firstName, nextAppointment.customer.lastName)} size="lg" />
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-[var(--ink)]">{fullName(nextAppointment.customer.firstName, nextAppointment.customer.lastName)}</p>
                      <p className="mt-1 truncate text-[12px] text-[var(--muted)]">{nextAppointment.service.name}</p>
                      <p className="mt-1 truncate text-[11px] text-[var(--muted-soft)]">{fullName(nextAppointment.staff.firstName, nextAppointment.staff.lastName)}</p>
                    </div>
                  </div>
                  <div className="next-meta-grid">
                    <MetaCell icon={<SparkleIcon />} label="Hizmet" value={nextAppointment.service.name} />
                    <MetaCell icon={<StaffIcon />} label="Uzman" value={fullName(nextAppointment.staff.firstName, nextAppointment.staff.lastName)} />
                    <MetaCell icon={<ClockIcon />} label="Süre" value={duration(nextAppointment.startAt, nextAppointment.endAt)} />
                  </div>
                  <Link href="/appointments" className="panel-action-button">Randevuyu görüntüle <ArrowRightIcon /></Link>
                </div>
              ) : <EmptyState label="Yaklaşan randevu yok" href="/appointments" />}
            </Panel>
          </section>

          <section className="grid min-w-0 gap-4 lg:grid-cols-2">
            <Panel title="Son 7 Gün" subtitle="Randevu & Tahsilat" action={<span className="soft-chip">7 Gün</span>}>
              <div className="grid grid-cols-3 gap-2">
                <TrendMini label="Randevu" value={data.periods.last7Days.appointmentCount} tone="info" />
                <TrendMini label="Tahsilat" value={money.format(data.periods.last7Days.net)} tone="success" />
                <TrendMini label="Yeni" value={data.periods.last7Days.newCustomers} tone="neutral" />
              </div>
              <div className="metric-bars">
                {periodBars.map((bar) => (
                  <div key={bar.label} className="metric-bar-row">
                    <span>{bar.label}</span>
                    <div className="metric-bar-track"><span className={`metric-bar-fill ${bar.tone}`} style={{ width: `${Math.max((bar.value / bar.max) * 100, bar.value ? 12 : 0)}%` }} /></div>
                    <strong>{bar.value}</strong>
                  </div>
                ))}
              </div>
              <div className="period-footer"><span>Son 7 gün</span><span>{data.periods.last7Days.completedAppointments} tamamlandı</span><span>{data.periods.last7Days.cancelledAppointments} iptal</span></div>
            </Panel>

            <Panel title="Tahsilat Özeti" subtitle="Bugünkü tahsilat dağılımı" action={<Link href="/payments" className="panel-link-button">Detay</Link>}>
              <div className="payment-total"><span>Toplam tahsilat</span><strong>{money.format(paymentTotal)}</strong></div>
              <div className="payment-list">
                {paymentRows.map(([label, value]) => {
                  const percent = paymentTotal ? Math.round((value / paymentTotal) * 100) : 0;
                  return <div className="payment-row" key={label}><div><span>{label}</span><b>{money.format(value)}</b></div><span className="payment-percent">%{percent}</span><div className="payment-progress"><span style={{ width: `${percent}%` }} /></div></div>;
                })}
              </div>
            </Panel>
          </section>
        </main>

        <aside className="dashboard-rail">
          <Panel title="Yaklaşan Randevular" action={<span className="count-chip">{upcoming.length}</span>}>
            <div className="rail-list">
              {upcoming.length ? upcoming.slice(0, 4).map((appointment) => (
                <Link key={appointment.id} href="/appointments" className="rail-appointment">
                  <span className="rail-time">{formatTime(appointment.startAt)}</span>
                  <Avatar label={initials(appointment.customer.firstName, appointment.customer.lastName)} />
                  <div className="min-w-0"><p className="truncate">{fullName(appointment.customer.firstName, appointment.customer.lastName)}</p><span>{appointment.service.name}</span></div>
                </Link>
              )) : <EmptyState label="Yaklaşan randevu yok" href="/appointments" />}
            </div>
          </Panel>

          <Panel title="Hızlı İşlemler">
            <div className="quick-actions">
              <QuickAction href="/appointments" icon={<CalendarIcon />} label="Yeni randevu" />
              <QuickAction href="/customers" icon={<PeopleIcon />} label="Müşteri ekle" />
              <QuickAction href="/services" icon={<SparkleIcon />} label="Hizmet ekle" />
              <QuickAction href="/payments" icon={<WalletIcon />} label="Ödeme al" />
            </div>
          </Panel>

          <Panel title="Aktiviteler">
            <div className="activity-list">
              {data.summary.paymentCount > 0 ? <Activity icon={<WalletIcon />} title="Ödeme alındı" detail={money.format(data.summary.gross)} /> : null}
              {todayAppointments.slice(0, 3).map((appointment) => <Activity key={appointment.id} icon={<CalendarIcon />} title="Randevu oluşturuldu" detail={fullName(appointment.customer.firstName, appointment.customer.lastName)} />)}
              {data.periods.last7Days.newCustomers > 0 ? <Activity icon={<PeopleIcon />} title="Yeni müşteri" detail={`${data.periods.last7Days.newCustomers} yeni müşteri`} /> : null}
              {!data.summary.paymentCount && !todayAppointments.length && !data.periods.last7Days.newCustomers ? <EmptyState label="Henüz aktivite yok" href="/reports" /> : null}
            </div>
          </Panel>

          <Panel title="Ekibin Durumu" action={<span className="count-chip">{data.totals.activeStaff}</span>}>
            <div className="staff-stack">
              {data.staffPerformance.slice(0, 5).map((staff, index) => {
                const parts = staff.name.split(" ");
                return <Link href="/staff" key={staff.id} className="staff-avatar-wrap" title={staff.name}><Avatar label={initials(parts[0] ?? "", parts.slice(1).join(" "))} /><span className={`presence ${index < 3 ? "online" : ""}`} /></Link>;
              })}
            </div>
            <Link href="/staff" className="panel-footer-link">Ekibi görüntüle <ArrowRightIcon /></Link>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function MetricCard({ icon, iconTone, label, value, detail, badge, badgeTone }: { icon: React.ReactNode; iconTone: string; label: string; value: number | string; detail: string; badge: string; badgeTone: string }) {
  return <div className="metric-card"><div className={`metric-icon ${iconTone}`}>{icon}</div><div className="min-w-0"><p>{label}</p><strong>{value}</strong><span>{detail}</span></div><span className={`metric-badge ${badgeTone}`}>{badge}</span></div>;
}

function Panel({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="dashboard-panel"><div className="panel-header"><div className="min-w-0"><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>{action}</div><div className="panel-body">{children}</div></section>;
}

function Avatar({ label, size = "sm" }: { label: string; size?: "sm" | "lg" }) {
  return <div className={`dashboard-avatar ${size === "lg" ? "lg" : ""}`}>{label}</div>;
}

function TrendMini({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return <div className={`trend-mini ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function MetaCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="meta-cell"><span>{icon}</span><small>{label}</small><strong title={value}>{value}</strong></div>;
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return <Link href={href} className="quick-action"><span>{icon}</span><b>{label}</b><ArrowRightIcon /></Link>;
}

function Activity({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return <div className="activity-item"><span className="activity-icon">{icon}</span><div className="min-w-0"><p>{title}</p><span className="truncate">{detail}</span></div><time>şimdi</time></div>;
}

function EmptyState({ label, href }: { label: string; href: string }) {
  return <div className="empty-state"><div className="empty-icon"><CalendarIcon /></div><p>{label}</p><Link href={href}>Görüntüle <ArrowRightIcon /></Link></div>;
}

function timeUntil(value: string) {
  const minutes = Math.max(0, Math.round((new Date(value).getTime() - Date.now()) / 60000));
  if (minutes < 60) return `${minutes} dk sonra`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}sa ${rest}dk sonra` : `${hours}sa sonra`;
}

function duration(start: string, end: string) {
  const minutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} dk`;
  return rest ? `${hours}sa ${rest}dk` : `${hours}sa`;
}

function MenuIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M4 12h16M4 17h10" /></svg>; }
function StarIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" /></svg>; }
function SearchIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>; }
function SunIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>; }
function HistoryIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5M12 7v5l3 2" /></svg>; }
function BellIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></svg>; }
function ChevronDownIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m7 10 5 5 5-5" /></svg>; }
function ArrowRightIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12h14M13 6l6 6-6 6" /></svg>; }
function CalendarIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M7 3v4M17 3v4M3 10h18" /></svg>; }
function WalletIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H19a1 1 0 0 1 1 1v15H6a2 2 0 0 1-2-2V6.5Z" /><path d="M4 8h16M15 14h5" /><circle cx="15" cy="14" r=".8" fill="currentColor" /></svg>; }
function CheckCircleIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9" /><path d="m8 12 2.6 2.6L16.5 9" /></svg>; }
function ClockIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>; }
function SparkleIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m12 3 1.6 6.4L20 11l-6.4 1.6L12 19l-1.6-6.4L4 11l6.4-1.6L12 3ZM19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7L19 17Z" /></svg>; }
function StaffIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="8" r="3" /><path d="M5 20a7 7 0 0 1 14 0M18 5.5a2.5 2.5 0 0 1 0 5M20 17a5 5 0 0 0-2.2-4.1" /></svg>; }
function PeopleIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 6a2.5 2.5 0 0 1 0 5M18 13a4.5 4.5 0 0 1 3 4.3" /></svg>; }
