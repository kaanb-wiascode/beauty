"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { Alert, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { getStoredTenant, getStoredUser } from "@/lib/auth";

import styles from "./dashboard.module.css";

type AppointmentStatus = "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
type PaymentMethod = "CASH" | "CARD" | "TRANSFER";

type Appointment = {
  id: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  customer: { id: string; firstName: string; lastName: string };
  staff: { id: string; firstName: string; lastName: string };
  service: { id: string; name: string };
  payment: { id: string; amount: number; method: PaymentMethod; status: "COMPLETED" | "REFUNDED"; paidAt: string } | null;
};

type Period = {
  gross: number;
  refunds: number;
  net: number;
  appointmentCount: number;
  completedAppointments: number;
  cancelledAppointments: number;
  noShowAppointments: number;
  newCustomers: number;
};

type Report = {
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
  totals: { customers: number; activeStaff: number; activeServices: number; appointments: number };
  paymentBreakdown: Record<PaymentMethod, number>;
  periods: { last7Days: Period; month: Period };
  todayAppointments: Appointment[];
  upcomingAppointments: Appointment[];
  topService: { id: string; name: string; collected: number; appointmentCount: number } | null;
  topStaff: { id: string; name: string; collected: number; appointmentCount: number } | null;
  servicePerformance: { id: string; name: string; collected: number; appointmentCount: number }[];
  staffPerformance: { id: string; name: string; collected: number; appointmentCount: number }[];
};

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const statusLabel: Record<AppointmentStatus, string> = {
  SCHEDULED: "Planlandı",
  CONFIRMED: "Onaylandı",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal",
  NO_SHOW: "Gelmedi",
};

function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function endOfToday() { const d = new Date(); d.setHours(23, 59, 59, 999); return d; }
function time(value: string) { return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function dateLabel(value: Date) { return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long", year: "numeric", weekday: "long" }).format(value); }
function name(first: string, last: string) { return `${first} ${last}`.trim(); }
function initials(first: string, last: string) { return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase(); }
function duration(start: string, end: string) { const m = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)); return m < 60 ? `${m} dk` : `${Math.floor(m / 60)}sa${m % 60 ? ` ${m % 60}dk` : ""}`; }
function until(value: string) { const m = Math.max(0, Math.round((new Date(value).getTime() - Date.now()) / 60000)); return m < 60 ? `${m} dk sonra` : `${Math.floor(m / 60)}sa${m % 60 ? ` ${m % 60}dk` : ""} sonra`; }
function greeting(firstName?: string) { const h = new Date().getHours(); const n = firstName?.trim() || "Kaan"; return h < 5 ? `İyi Geceler, ${n}` : h < 12 ? `Günaydın, ${n}` : h < 18 ? `İyi Günler, ${n}` : `İyi Akşamlar, ${n}`; }

export default function DashboardPage() {
  const user = getStoredUser();
  const tenant = getStoredTenant();
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const from = startOfToday().toISOString();
        const to = endOfToday().toISOString();
        const result = await api<Report>(`/payments/dashboard-report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Dashboard verileri yüklenemedi.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="mx-auto max-w-[1380px] py-10"><Spinner label="Dashboard hazırlanıyor..." /></div>;
  if (!data) return <div className="mx-auto max-w-[1380px] py-10"><Alert onClose={() => setError("")}>{error || "Dashboard verileri bulunamadı."}</Alert></div>;

  const today = [...data.todayAppointments].sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));
  const upcoming = data.upcomingAppointments.filter(a => a.status !== "CANCELLED" && a.status !== "NO_SHOW").sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));
  const next = upcoming[0] ?? null;
  const paymentTotal = Object.values(data.paymentBreakdown).reduce((a, b) => a + b, 0);
  const p7 = data.periods.last7Days;
  const pct = (n: number) => data.summary.appointmentCount ? Math.round((n / data.summary.appointmentCount) * 100) : 0;

  return (
    <div className={`${styles.page} mx-auto max-w-[1380px] space-y-4 pb-8`}>
      <header className="dashboard-topbar">
        <div className="flex min-w-0 items-center gap-3">
          <button className="dashboard-icon-button" type="button" aria-label="Menü"><MenuIcon /></button>
          <button className="dashboard-icon-button" type="button" aria-label="Favorilere ekle"><StarIcon /></button>
          <div className="hidden items-center gap-2 text-[13px] text-[var(--muted)] sm:flex"><span>Dashboard</span><span className="text-[var(--muted-soft)]">/</span><b className="text-[var(--ink)]">Bugün</b></div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="dashboard-search hidden md:flex"><SearchIcon /><span>Ara...</span><kbd>⌘K</kbd></div>
          <button className="dashboard-icon-button" type="button" aria-label="Tema"><SunIcon /></button>
          <button className="dashboard-icon-button hidden sm:inline-flex" type="button" aria-label="Geçmiş"><HistoryIcon /></button>
          <button className="dashboard-icon-button" type="button" aria-label="Bildirimler"><BellIcon /></button>
          <div className={styles.profile}>{initials(user?.firstName ?? "K", user?.lastName ?? "D")}</div>
        </div>
      </header>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_250px]">
        <main className="min-w-0 space-y-4">
          <section className="dashboard-hero">
            <div className="min-w-0"><p className="dashboard-eyebrow">{dateLabel(new Date())} · {tenant?.name ?? "Beauty Studio Demo"}</p><h1>{greeting(user?.firstName)} <span aria-hidden>👋</span></h1></div>
            <Link href="/appointments" className="dashboard-primary-action"><span>+</span> Yeni Randevu <ChevronDownIcon /></Link>
          </section>

          {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric icon={<CalendarIcon />} tone="neutral" label="Bugünkü Randevu" value={data.summary.appointmentCount} detail="Toplam" badge={`${data.summary.scheduledAppointments} planlandı`} />
            <Metric icon={<WalletIcon />} tone="success" label="Tahsilat" value={money.format(data.summary.net)} detail="Bugün" badge={`${data.summary.paymentCount} işlem`} />
            <Metric icon={<CheckIcon />} tone="info" label="Tamamlanan" value={data.summary.completedAppointments} detail="Bugün" badge={`%${pct(data.summary.completedAppointments)}`} />
            <Metric icon={<ClockIcon />} tone="warning" label="Bekleyen" value={data.summary.scheduledAppointments} detail="Bugün" badge={`%${pct(data.summary.scheduledAppointments)}`} />
          </section>

          <section className="grid min-w-0 gap-4 lg:grid-cols-2">
            <Panel title="Bugünün Programı" subtitle={dateLabel(new Date())} action={<Link href="/appointments" className="panel-link-button">Tümü</Link>}>
              <div className="divide-y divide-[var(--line)]">
                {today.slice(0, 4).map(a => <Link href="/appointments" key={a.id} className="schedule-row"><div className="schedule-time"><strong>{time(a.startAt)}</strong><span>{time(a.endAt)}</span></div><div className="schedule-dot"/><div className="flex min-w-0 items-center gap-3"><Avatar label={initials(a.customer.firstName, a.customer.lastName)}/><div className="min-w-0"><p className="truncate text-[13px] font-semibold text-[var(--ink)]">{name(a.customer.firstName, a.customer.lastName)}</p><p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{a.service.name}</p><p className="mt-0.5 truncate text-[10px] text-[var(--muted-soft)]">{name(a.staff.firstName, a.staff.lastName)}</p></div></div><span className={styles.status}>{statusLabel[a.status]}</span></Link>)}
                {!today.length ? <Empty label="Bugün randevu yok" href="/appointments"/> : null}
              </div>
              <Link href="/appointments" className="panel-footer-link"><CalendarIcon/> Takvimi aç <ArrowRightIcon/></Link>
            </Panel>

            <Panel title="Sıradaki Randevu" subtitle="Yaklaşan program" action={next ? <span className="count-chip">{time(next.startAt)}</span> : null}>
              {next ? <div className="next-appointment"><div className="flex items-center justify-between gap-3"><strong className="next-time">{time(next.startAt)}</strong><span className="soft-chip">{until(next.startAt)}</span></div><div className="mt-4 flex items-center gap-3"><Avatar size="lg" label={initials(next.customer.firstName, next.customer.lastName)}/><div className="min-w-0"><p className="truncate text-[15px] font-semibold text-[var(--ink)]">{name(next.customer.firstName, next.customer.lastName)}</p><p className="mt-1 truncate text-[12px] text-[var(--muted)]">{next.service.name}</p><p className="mt-1 truncate text-[11px] text-[var(--muted-soft)]">{name(next.staff.firstName, next.staff.lastName)}</p></div></div><div className="next-meta-grid"><Meta icon={<SparkleIcon/>} label="Hizmet" value={next.service.name}/><Meta icon={<StaffIcon/>} label="Uzman" value={name(next.staff.firstName, next.staff.lastName)}/><Meta icon={<ClockIcon/>} label="Süre" value={duration(next.startAt, next.endAt)}/></div><Link href="/appointments" className="panel-action-button">Randevuyu görüntüle <ArrowRightIcon/></Link></div> : <Empty label="Yaklaşan randevu yok" href="/appointments"/>}
            </Panel>
          </section>

          <section className="grid min-w-0 gap-4 lg:grid-cols-2">
            <Panel title="Son 7 Gün" subtitle="Randevu & Tahsilat" action={<span className="soft-chip">7 Gün</span>}>
              <div className="grid grid-cols-3 gap-2"><Trend label="Randevu" value={p7.appointmentCount} tone="info"/><Trend label="Tahsilat" value={money.format(p7.net)} tone="success"/><Trend label="Yeni" value={p7.newCustomers} tone="neutral"/></div>
              <div className="metric-bars"><Bar label="Randevu" value={p7.appointmentCount} max={Math.max(p7.appointmentCount, 1)} tone="info"/><Bar label="Tamamlanan" value={p7.completedAppointments} max={Math.max(p7.appointmentCount, 1)} tone="success"/><Bar label="Yeni müşteri" value={p7.newCustomers} max={Math.max(p7.appointmentCount, p7.newCustomers, 1)} tone="neutral"/></div>
              <div className="period-footer"><span>Son 7 gün</span><span>{p7.completedAppointments} tamamlandı</span><span>{p7.cancelledAppointments} iptal</span></div>
            </Panel>

            <Panel title="Tahsilat Özeti" subtitle="Bugünkü tahsilat dağılımı" action={<Link href="/payments" className="panel-link-button">Detay</Link>}>
              <div className="payment-total"><span>Toplam tahsilat</span><strong>{money.format(paymentTotal)}</strong></div>
              <div className="payment-list">{([['Nakit', data.paymentBreakdown.CASH], ['Kart', data.paymentBreakdown.CARD], ['Havale / EFT', data.paymentBreakdown.TRANSFER]] as const).map(([label, value]) => { const percent = paymentTotal ? Math.round(value / paymentTotal * 100) : 0; return <div className="payment-row" key={label}><div><span>{label}</span><b>{money.format(value)}</b></div><span className="payment-percent">%{percent}</span><div className="payment-progress"><span style={{width: `${percent}%`}}/></div></div>; })}</div>
            </Panel>
          </section>
        </main>

        <aside className="dashboard-rail">
          <Panel title="Yaklaşan Randevular" action={<span className="count-chip">{upcoming.length}</span>}>
            <div className="rail-list">{upcoming.slice(0, 4).map(a => <Link href="/appointments" key={a.id} className="rail-appointment"><span className="rail-time">{time(a.startAt)}</span><Avatar label={initials(a.customer.firstName, a.customer.lastName)}/><div className="min-w-0"><p className="truncate">{name(a.customer.firstName, a.customer.lastName)}</p><span>{a.service.name}</span></div></Link>)}{!upcoming.length ? <Empty label="Yaklaşan randevu yok" href="/appointments"/> : null}</div>
          </Panel>
          <Panel title="Hızlı İşlemler"><div className="quick-actions"><Quick href="/appointments" icon={<CalendarIcon/>} label="Yeni randevu"/><Quick href="/customers" icon={<PeopleIcon/>} label="Müşteri ekle"/><Quick href="/services" icon={<SparkleIcon/>} label="Hizmet ekle"/><Quick href="/payments" icon={<WalletIcon/>} label="Ödeme al"/></div></Panel>
          <Panel title="Aktiviteler"><div className="activity-list">{data.summary.paymentCount ? <Activity icon={<WalletIcon/>} title="Ödeme alındı" detail={money.format(data.summary.gross)}/> : null}{today.slice(0, 3).map(a => <Activity key={a.id} icon={<CalendarIcon/>} title="Randevu oluşturuldu" detail={name(a.customer.firstName, a.customer.lastName)}/>)}{p7.newCustomers ? <Activity icon={<PeopleIcon/>} title="Müşteri eklendi" detail={`${p7.newCustomers} yeni müşteri`}/> : null}{!data.summary.paymentCount && !today.length && !p7.newCustomers ? <Empty label="Henüz aktivite yok" href="/reports"/> : null}</div></Panel>
          <Panel title="Online Personel" action={<span className="count-chip">{data.totals.activeStaff}</span>}><div className="staff-stack">{data.staffPerformance.slice(0, 5).map((staff, i) => { const parts = staff.name.split(" "); return <Link href="/staff" key={staff.id} className="staff-avatar-wrap" title={staff.name}><Avatar label={initials(parts[0] ?? "", parts.slice(1).join(" "))}/><span className={`presence ${i < 3 ? "online" : ""}`}/></Link>; })}</div><Link href="/staff" className="panel-footer-link">Ekibi görüntüle <ArrowRightIcon/></Link></Panel>
        </aside>
      </div>
    </div>
  );
}

function Metric({icon, tone, label, value, detail, badge}: {icon: ReactNode; tone: string; label: string; value: number | string; detail: string; badge: string}) { return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div className="min-w-0"><p>{label}</p><strong>{value}</strong><span>{detail}</span></div><span className={`metric-badge ${tone}`}>{badge}</span></div>; }
function Panel({title, subtitle, action, children}: {title: string; subtitle?: string; action?: ReactNode; children: ReactNode}) { return <section className="dashboard-panel"><div className="panel-header"><div className="min-w-0"><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>{action}</div><div className="panel-body">{children}</div></section>; }
function Avatar({label, size = "sm"}: {label: string; size?: "sm" | "lg"}) { return <div className={`dashboard-avatar ${size === "lg" ? "lg" : ""}`}>{label}</div>; }
function Trend({label, value, tone}: {label: string; value: number | string; tone: string}) { return <div className={`trend-mini ${tone}`}><span>{label}</span><strong>{value}</strong></div>; }
function Bar({label, value, max, tone}: {label: string; value: number; max: number; tone: string}) { return <div className="metric-bar-row"><span>{label}</span><div className="metric-bar-track"><span className={`metric-bar-fill ${tone}`} style={{width: `${Math.max(value / max * 100, value ? 12 : 0)}%`}}/></div><strong>{value}</strong></div>; }
function Meta({icon, label, value}: {icon: ReactNode; label: string; value: string}) { return <div className="meta-cell"><span>{icon}</span><small>{label}</small><strong title={value}>{value}</strong></div>; }
function Quick({href, icon, label}: {href: string; icon: ReactNode; label: string}) { return <Link href={href} className="quick-action"><span>{icon}</span><b>{label}</b><ArrowRightIcon/></Link>; }
function Activity({icon, title, detail}: {icon: ReactNode; title: string; detail: string}) { return <div className="activity-item"><span className="activity-icon">{icon}</span><div className="min-w-0"><p>{title}</p><span className="truncate">{detail}</span></div><time>şimdi</time></div>; }
function Empty({label, href}: {label: string; href: string}) { return <div className="empty-state"><div className="empty-icon"><CalendarIcon/></div><p>{label}</p><Link href={href}>Görüntüle <ArrowRightIcon/></Link></div>; }

function MenuIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M4 12h16M4 17h10"/></svg>; }
function StarIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>; }
function SearchIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>; }
function SunIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>; }
function HistoryIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5M12 7v5l3 2"/></svg>; }
function BellIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></svg>; }
function ChevronDownIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m7 10 5 5 5-5"/></svg>; }
function ArrowRightIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12h14M13 6l6 6-6 6"/></svg>; }
function CalendarIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>; }
function WalletIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H19a1 1 0 0 1 1 1v15H6a2 2 0 0 1-2-2V6.5Z"/><path d="M4 8h16M15 14h5"/><circle cx="15" cy="14" r=".8" fill="currentColor"/></svg>; }
function CheckIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.6L16.5 9"/></svg>; }
function ClockIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>; }
function SparkleIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m12 3 1.6 6.4L20 11l-6.4 1.6L12 19l-1.6-6.4L4 11l6.4-1.6L12 3ZM19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7L19 17Z"/></svg>; }
function StaffIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0 1 14 0M18 5.5a2.5 2.5 0 0 1 0 5M20 17a5 5 0 0 0-2.2-4.1"/></svg>; }
function PeopleIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 6a2.5 2.5 0 0 1 0 5M18 13a4.5 4.5 0 0 1 3 4.3"/></svg>; }
