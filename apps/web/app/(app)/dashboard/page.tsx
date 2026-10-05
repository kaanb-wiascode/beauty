"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { CardInfo } from "@/components/card-info";
import { DashboardActions, type DashboardAction } from "@/components/dashboard-actions";
import { Modal } from "@/components/modal";
import { Alert, Spinner, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { getStoredTenant, getStoredUser } from "@/lib/auth";
import { getCardHelp } from "@/lib/card-help";
import { userErrorMessage } from "@/lib/user-language";
import styles from "./dashboard.module.css";

type Status = "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
type Method = "CASH" | "CARD" | "TRANSFER";
type Appointment = { id: string; startAt: string; endAt: string; status: Status; customer: { id: string; firstName: string; lastName: string }; staff: { id: string; firstName: string; lastName: string }; service: { id: string; name: string }; payment: { id: string; amount: number; method: Method; status: "COMPLETED" | "REFUNDED"; paidAt: string } | null };
type Period = { gross: number; refunds: number; net: number; appointmentCount: number; completedAppointments: number; cancelledAppointments: number; noShowAppointments: number; newCustomers: number };
type DailyTrend = { date: string; gross: number; refunds: number; net: number; appointments: number; completed: number };
type Report = { summary: { gross: number; refunds: number; net: number; paymentCount: number; refundCount: number; methods: Record<Method, number>; appointmentCount: number; completedAppointments: number; scheduledAppointments: number; confirmedAppointments: number; cancelledAppointments: number; noShowAppointments: number }; totals: { customers: number; activeStaff: number; activeServices: number; appointments: number }; paymentBreakdown: Record<Method, number>; dailyTrend: DailyTrend[]; periods: { last7Days: Period; month: Period }; todayAppointments: Appointment[]; upcomingAppointments: Appointment[]; topService: { id: string; name: string; collected: number; appointmentCount: number } | null; topStaff: { id: string; name: string; collected: number; appointmentCount: number } | null; servicePerformance: { id: string; name: string; collected: number; appointmentCount: number }[]; staffPerformance: { id: string; name: string; collected: number; appointmentCount: number }[] };

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const statusLabel: Record<Status, string> = { SCHEDULED: "Planlandı", CONFIRMED: "Onaylandı", COMPLETED: "Tamamlandı", CANCELLED: "İptal", NO_SHOW: "Gelmedi" };
function startToday() { const d = new Date(); d.setHours(0,0,0,0); return d; }
function endToday() { const d = new Date(); d.setHours(23,59,59,999); return d; }
function time(v: string) { return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(new Date(v)); }
function dateLabel(v: Date) { return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long", year: "numeric", weekday: "long" }).format(v); }
function fullName(a: string, b: string) { return `${a} ${b}`.trim(); }
function initials(a: string, b: string) { return `${a?.[0] ?? ""}${b?.[0] ?? ""}`.toUpperCase(); }
function duration(a: string, b: string) { const m = Math.max(0, Math.round((+new Date(b)-+new Date(a))/60000)); return m < 60 ? `${m} dk` : `${Math.floor(m/60)}sa${m%60 ? ` ${m%60}dk` : ""}`; }
function until(v: string) { const m = Math.max(0, Math.round((+new Date(v)-Date.now())/60000)); return m < 60 ? `${m} dk sonra` : `${Math.floor(m/60)}sa${m%60 ? ` ${m%60}dk` : ""} sonra`; }
function greeting(n?: string) { const h = new Date().getHours(); const name = n?.trim() || "Kaan"; return h < 5 ? `İyi Geceler, ${name}` : h < 12 ? `Günaydın, ${name}` : h < 18 ? `İyi Günler, ${name}` : `İyi Akşamlar, ${name}`; }

export default function DashboardPage() {
  const user = getStoredUser(); const tenant = getStoredTenant();
  const [data, setData] = useState<Report | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [action, setAction] = useState<DashboardAction | null>(null); const [tool, setTool] = useState<"menu"|"history"|"notifications"|"search"|null>(null); const [favorite, setFavorite] = useState(false); const [dark, setDark] = useState(false); const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try { setLoading(true); const result = await api<Report>(`/payments/dashboard-report?from=${encodeURIComponent(startToday().toISOString())}&to=${encodeURIComponent(endToday().toISOString())}`); if (!cancelled) setData(result); }
      catch (err) { if (!cancelled) setError(err instanceof ApiError ? userErrorMessage(err.message, "Ana ekran verileri yüklenemedi.") : "Ana ekran verileri yüklenemedi."); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load(); return () => { cancelled = true; };
  }, []);

  useEffect(() => { try { setFavorite(localStorage.getItem("beauty:dashboard-favorite") === "1"); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem("beauty:dashboard-favorite", favorite ? "1" : "0"); } catch {} }, [favorite]);
  useEffect(() => {
    const root = document.documentElement;
    const vars = ["--background","--foreground","--surface","--surface-2","--glass","--glass-solid","--glass-elevated","--ink","--muted","--muted-soft","--line"];
    if (dark) { root.style.setProperty("--background", "#171717"); root.style.setProperty("--foreground", "#f5f5f5"); root.style.setProperty("--surface", "#202020"); root.style.setProperty("--surface-2", "#252525"); root.style.setProperty("--glass", "rgba(31,31,31,.92)"); root.style.setProperty("--glass-solid", "#202020"); root.style.setProperty("--glass-elevated", "rgba(35,35,35,.96)"); root.style.setProperty("--ink", "#f5f5f5"); root.style.setProperty("--muted", "#a6a6a6"); root.style.setProperty("--muted-soft", "#777"); root.style.setProperty("--line", "#343434"); }
    else vars.forEach((v) => root.style.removeProperty(v));
    return () => vars.forEach((v) => root.style.removeProperty(v));
  }, [dark]);

  const filteredSearch = useMemo(() => {
    if (!data || !search.trim()) return [];
    const q = search.toLocaleLowerCase("tr-TR");
    return [...data.todayAppointments.map((a) => ({ label: fullName(a.customer.firstName,a.customer.lastName), detail: `${a.service.name} · ${time(a.startAt)}`, href: "/appointments" })), ...data.servicePerformance.map((s) => ({ label: s.name, detail: "Hizmet", href: "/services" })), ...data.staffPerformance.map((s) => ({ label: s.name, detail: "Personel", href: "/staff" }))].filter((x) => `${x.label} ${x.detail}`.toLocaleLowerCase("tr-TR").includes(q)).slice(0, 8);
  }, [data, search]);

  if (loading) return <div className="mx-auto max-w-[1380px] py-10"><Spinner label="Ana ekran hazırlanıyor..." /></div>;
  if (!data) return <div className="mx-auto max-w-[1380px] py-10"><Alert onClose={() => setError("")}>{error || "Ana ekran verileri bulunamadı."}</Alert></div>;

  const today = [...data.todayAppointments].sort((a,b) => +new Date(a.startAt)-+new Date(b.startAt));
  const upcoming = data.upcomingAppointments.filter((a) => a.status !== "CANCELLED" && a.status !== "NO_SHOW").sort((a,b) => +new Date(a.startAt)-+new Date(b.startAt));
  const next = upcoming[0] ?? null; const p7 = data.periods.last7Days; const paymentTotal = Object.values(data.paymentBreakdown).reduce((a,b)=>a+b,0);
  const pct = (n:number) => data.summary.appointmentCount ? Math.round(n / data.summary.appointmentCount * 100) : 0;
  const todayStaffIds = new Set(today.map((appointment)=>appointment.staff.id));
  const upcomingStaffIds = new Set(upcoming.map((appointment)=>appointment.staff.id));
  const scheduledTeamCount = todayStaffIds.size;
  const teamCoveragePct = data.totals.activeStaff ? Math.min(100, Math.round((scheduledTeamCount / data.totals.activeStaff) * 100)) : 0;
  const busiestStaff = data.staffPerformance[0] ?? null;

  function saved() { setError(""); window.setTimeout(() => window.location.reload(), 450); }

  return <div className={`${styles.page} mx-auto max-w-[1420px] pb-8`}>
    <header className="dashboard-topbar sticky top-0 z-20 bg-[var(--background)]/90 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-2">
        <button className="dashboard-icon-button" type="button" aria-label="Ana ekran menüsü" onClick={() => setTool(tool === "menu" ? null : "menu")}><MenuIcon /></button>
        <button className={`dashboard-icon-button ${favorite ? "text-[var(--ink)]" : ""}`} type="button" aria-label={favorite ? "Favoriden çıkar" : "Favorilere ekle"} onClick={() => setFavorite((v)=>!v)}><StarIcon filled={favorite} /></button>
        <div className="hidden items-center gap-2 text-[13px] text-[var(--muted)] sm:flex"><span>Ana Ekran</span><span className="text-[var(--muted-soft)]">/</span><b className="text-[var(--ink)]">Bugün</b></div>
      </div>
      <div className="relative flex items-center gap-1.5 sm:gap-2">
        <button className="dashboard-search hidden md:flex" type="button" onClick={() => setTool("search")} aria-label="Ara"><SearchIcon/><span>Ara...</span><kbd>⌘K</kbd></button>
        <button className="dashboard-icon-button" type="button" aria-label="Tema" onClick={() => setDark((v)=>!v)}><SunIcon/></button>
        <button className="dashboard-icon-button hidden sm:inline-flex" type="button" aria-label="Geçmiş" onClick={() => setTool(tool === "history" ? null : "history")}><HistoryIcon/></button>
        <button className="dashboard-icon-button" type="button" aria-label="Bildirimler" onClick={() => setTool(tool === "notifications" ? null : "notifications")}><BellIcon/></button>
        <div className={styles.profile}>{initials(user?.firstName ?? "K", user?.lastName ?? "D")}</div>
        {tool === "menu" ? <ToolPopover title="Ana Ekran"><ToolButton label="Yeni randevu" onClick={()=>{setAction("appointment");setTool(null)}}/><ToolButton label="Yeni müşteri" onClick={()=>{setAction("customer");setTool(null)}}/><ToolButton label="Yeni hizmet" onClick={()=>{setAction("service");setTool(null)}}/></ToolPopover> : null}
        {tool === "history" ? <ToolPopover title="Son işlemler"><ToolLine title="Ana ekran görüntülendi" detail="şimdi"/><ToolLine title="Son 7 gün raporu" detail="bugün"/><ToolLine title="Yaklaşan randevular" detail="bugün"/></ToolPopover> : null}
        {tool === "notifications" ? <ToolPopover title="Bildirimler"><ToolLine title={`${today.length} bugünkü randevu`} detail="Ana Ekran"/><ToolLine title={`${data.summary.scheduledAppointments} planlanmış randevu`} detail="Bugün"/><ToolLine title={`${data.summary.paymentCount} ödeme işlemi`} detail="Bugün"/></ToolPopover> : null}
      </div>
    </header>

    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <main className="min-w-0 space-y-4">
        <section className="dashboard-hero"><div className="min-w-0"><p className="dashboard-eyebrow">{dateLabel(new Date())} · {tenant?.name ?? "Beauty Studio Demo"}</p><h1>{greeting(user?.firstName)} <span aria-hidden>👋</span></h1></div><button type="button" className="dashboard-primary-action" onClick={()=>setAction("appointment")}><span>+</span> Yeni Randevu <ChevronDownIcon/></button></section>
        {error ? <Alert onClose={()=>setError("")}>{error}</Alert> : null}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric icon={<CalendarIcon/>} label="Bugünkü Randevu" value={data.summary.appointmentCount} detail="Toplam" badge={`${data.summary.scheduledAppointments} planlandı`} tone="neutral"/><Metric icon={<WalletIcon/>} label="Tahsilat" value={money.format(data.summary.net)} detail="Bugün" badge={`${data.summary.paymentCount} işlem`} tone="success"/><Metric icon={<CheckIcon/>} label="Tamamlanan" value={data.summary.completedAppointments} detail="Bugün" badge={`%${pct(data.summary.completedAppointments)}`} tone="info"/><Metric icon={<ClockIcon/>} label="Bekleyen" value={data.summary.scheduledAppointments} detail="Bugün" badge={`%${pct(data.summary.scheduledAppointments)}`} tone="warning"/></section>

        <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
          <Panel title="Tahsilat Trendi" subtitle="Son 7 gün · günlük net tahsilat" action={<Link href="/finance/income" className="panel-link-button">Finansa Git</Link>}>
            <RevenueTrendChart data={data.dailyTrend} />
          </Panel>
          <Panel title="Randevu Durumu" subtitle="Bugünkü operasyon dağılımı" action={<Link href="/appointments" className="panel-link-button">Randevular</Link>}>
            <AppointmentStatusChart summary={data.summary} />
          </Panel>
        </section>

        <section className="grid min-w-0 gap-4 lg:grid-cols-2">
          <Panel title="Bugünün Programı" subtitle={dateLabel(new Date())} action={<Link href="/appointments" className="panel-link-button">Tümü</Link>}><div className="divide-y divide-[var(--line)]">{today.slice(0,5).map((a)=><Link key={a.id} href="/appointments" className="schedule-row"><div className="schedule-time"><strong>{time(a.startAt)}</strong><span>{time(a.endAt)}</span></div><div className="schedule-dot"/><div className="flex min-w-0 items-center gap-3"><Avatar label={initials(a.customer.firstName,a.customer.lastName)}/><div className="min-w-0"><p className="truncate text-[13px] font-semibold text-[var(--ink)]">{fullName(a.customer.firstName,a.customer.lastName)}</p><p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{a.service.name}</p><p className="mt-0.5 truncate text-[10px] text-[var(--muted-soft)]">{fullName(a.staff.firstName,a.staff.lastName)}</p></div></div><span className={styles.status}>{statusLabel[a.status]}</span></Link>)}{!today.length?<Empty label="Bugün randevu yok" href="/appointments"/>:null}</div><Link href="/appointments" className="panel-footer-link"><CalendarIcon/>Takvimi aç<ArrowRightIcon/></Link></Panel>
          <Panel title="Sıradaki Randevu" subtitle="Yaklaşan program" action={next?<span className="count-chip">{time(next.startAt)}</span>:null}>{next?<div className="next-appointment"><div className="flex items-center justify-between gap-3"><strong className="next-time">{time(next.startAt)}</strong><span className="soft-chip">{until(next.startAt)}</span></div><div className="mt-4 flex items-center gap-3"><Avatar size="lg" label={initials(next.customer.firstName,next.customer.lastName)}/><div className="min-w-0"><p className="truncate text-[15px] font-semibold text-[var(--ink)]">{fullName(next.customer.firstName,next.customer.lastName)}</p><p className="mt-1 truncate text-[12px] text-[var(--muted)]">{next.service.name}</p><p className="mt-1 truncate text-[11px] text-[var(--muted-soft)]">{fullName(next.staff.firstName,next.staff.lastName)}</p></div></div><div className="next-meta-grid"><Meta icon={<SparkleIcon/>} label="Hizmet" value={next.service.name}/><Meta icon={<StaffIcon/>} label="Uzman" value={fullName(next.staff.firstName,next.staff.lastName)}/><Meta icon={<ClockIcon/>} label="Süre" value={duration(next.startAt,next.endAt)}/></div><Link href="/appointments" className="panel-action-button">Randevuyu görüntüle<ArrowRightIcon/></Link></div>:<Empty label="Yaklaşan randevu yok" href="/appointments"/>}</Panel>
        </section>

        <section className="grid min-w-0 gap-4 lg:grid-cols-2">
          <Panel title="Son 7 Gün" subtitle="Randevu & Tahsilat" action={<span className="soft-chip">7 Gün</span>}><div className="grid grid-cols-3 gap-2"><Trend label="Randevu" value={p7.appointmentCount}/><Trend label="Tahsilat" value={money.format(p7.net)}/><Trend label="Yeni" value={p7.newCustomers}/></div><div className="metric-bars">{[["Randevu",p7.appointmentCount],["Tamamlanan",p7.completedAppointments],["Yeni müşteri",p7.newCustomers]].map(([label,value])=><Bar key={label as string} label={label as string} value={value as number} max={Math.max(p7.appointmentCount,p7.newCustomers,1)}/>)}</div><div className="period-footer"><span>Son 7 gün</span><span>{p7.completedAppointments} tamamlandı</span><span>{p7.cancelledAppointments} iptal</span></div></Panel>
          <Panel title="Tahsilat Özeti" subtitle="Bugünkü tahsilat dağılımı" action={<Link href="/payments" className="panel-link-button">Detay</Link>}><div className="payment-total"><span>Toplam tahsilat</span><strong>{money.format(paymentTotal)}</strong></div><div className="payment-list">{([['Nakit',data.paymentBreakdown.CASH],['Kart',data.paymentBreakdown.CARD],['Havale / EFT',data.paymentBreakdown.TRANSFER]] as const).map(([label,value])=>{const percent=paymentTotal?Math.round(value/paymentTotal*100):0;return <div className="payment-row" key={label}><div><span>{label}</span><b>{money.format(value)}</b></div><span className="payment-percent">%{percent}</span><div className="payment-progress"><span style={{width:`${percent}%`}}/></div></div>})}</div></Panel>
        </section>
      </main>

      <aside className="dashboard-rail xl:sticky xl:top-0 xl:h-[calc(100vh-24px)] xl:overflow-y-auto xl:pr-1">
        <Panel title="Yaklaşan Randevular" subtitle="Sıradaki program" action={<div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"/><span className="text-[10px] font-semibold text-[var(--accent)]">Canlı</span><span className="count-chip">{upcoming.length}</span></div>}>
          <div className="px-3 py-2">
            {upcoming.slice(0,5).map((a,index)=><Link href="/appointments" key={a.id} className="group relative grid grid-cols-[46px_12px_minmax(0,1fr)] gap-2 rounded-[12px] px-1 py-2.5 transition hover:bg-[var(--surface-2)]">
              <div className="pt-0.5 text-right"><strong className="block text-[11px] font-semibold text-[var(--ink)]">{time(a.startAt)}</strong><span className="mt-0.5 block text-[9px] text-[var(--muted-soft)]">{index===0?until(a.startAt):duration(a.startAt,a.endAt)}</span></div>
              <div className="relative flex justify-center"><span className={`mt-1.5 h-2 w-2 rounded-full ${index===0?"bg-[var(--accent)] ring-4 ring-[var(--accent-soft)]":"bg-[var(--line-strong)]"}`}/>{index<Math.min(upcoming.length,5)-1?<span className="absolute bottom-[-10px] top-[15px] w-px bg-[var(--line)]"/>:null}</div>
              <div className="min-w-0 pr-1"><div className="flex items-center gap-2"><Avatar label={initials(a.customer.firstName,a.customer.lastName)}/><div className="min-w-0"><p className="truncate text-[11px] font-semibold text-[var(--ink)]">{fullName(a.customer.firstName,a.customer.lastName)}</p><p className="mt-0.5 truncate text-[10px] text-[var(--muted)]">{a.service.name}</p></div></div><p className="ml-10 mt-1 truncate text-[9px] text-[var(--muted-soft)]">{fullName(a.staff.firstName,a.staff.lastName)}</p></div>
            </Link>)}
            {!upcoming.length?<Empty label="Yaklaşan randevu yok" href="/appointments"/>:null}
          </div>
          <Link href="/appointments" className="panel-footer-link">Takvimi görüntüle<ArrowRightIcon/></Link>
        </Panel>

        <Panel title="Hızlı İşlemler" subtitle="Günlük işlemler">
          <div className="grid grid-cols-2 gap-2 p-3">
            {[
              {label:"Yeni Randevu",detail:"Randevu oluştur",action:"appointment" as DashboardAction,icon:<CalendarIcon/>},
              {label:"Yeni Müşteri",detail:"Müşteri ekle",action:"customer" as DashboardAction,icon:<PeopleIcon/>},
              {label:"Ödeme Al",detail:"Tahsilat kaydet",action:"payment" as DashboardAction,icon:<WalletIcon/>},
              {label:"Yeni Hizmet",detail:"Hizmet tanımla",action:"service" as DashboardAction,icon:<SparkleIcon/>},
            ].map((item)=><button key={item.label} type="button" onClick={()=>setAction(item.action)} className="group min-h-[88px] rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]">
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)] [&_svg]:h-4 [&_svg]:w-4">{item.icon}</span>
              <b className="mt-2 block text-[11px] font-semibold text-[var(--ink)]">{item.label}</b>
              <span className="mt-0.5 block text-[9px] text-[var(--muted)]">{item.detail}</span>
            </button>)}
          </div>
        </Panel>

        <Panel title="Ekip Durumu" subtitle="Bugünkü ekip kapasitesi ve performansı" action={<span className="count-chip">{data.totals.activeStaff} aktif</span>}>
          <div className="p-4">
            <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-3.5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <span className="block text-[10px] font-medium text-[var(--muted)]">Program Kapsamı</span>
                  <strong className="mt-1 block text-[28px] leading-none tracking-[-0.04em] text-[var(--ink)]">{teamCoveragePct}%</strong>
                </div>
                <div className="flex -space-x-2">{data.staffPerformance.slice(0,8).map((s)=><div key={s.id} className="rounded-full border-2 border-[var(--surface)]" title={s.name}><Avatar label={initials(s.name.split(" ")[0] ?? "",s.name.split(" ").slice(1).join(" "))}/></div>)}</div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface)]"><span className="block h-full rounded-full bg-[var(--accent)]" style={{width:`${teamCoveragePct}%`}}/></div>
              <div className="mt-2 flex items-center justify-between text-[9px] text-[var(--muted)]"><span>{scheduledTeamCount} personel bugün programlı</span><span>{Math.max(0,data.totals.activeStaff-scheduledTeamCount)} programsız</span></div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2.5">
              <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-3 text-center"><strong className="block text-[20px] leading-none text-[var(--ink)]">{scheduledTeamCount}</strong><span className="mt-1.5 block text-[9px] font-medium text-[var(--muted)]">Bugün Programlı</span></div>
              <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-3 text-center"><strong className="block text-[20px] leading-none text-[var(--ink)]">{upcomingStaffIds.size}</strong><span className="mt-1.5 block text-[9px] font-medium text-[var(--muted)]">Yaklaşan İşlem</span></div>
              <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-3 text-center"><strong className="block text-[20px] leading-none text-[var(--ink)]">{data.totals.activeStaff}</strong><span className="mt-1.5 block text-[9px] font-medium text-[var(--muted)]">Aktif Personel</span></div>
            </div>

            {data.staffPerformance.length?<div className="mt-4 overflow-hidden rounded-[16px] border border-[var(--line)]">
              <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5"><div><span className="block text-[10px] font-semibold text-[var(--ink)]">Ekip Performansı</span><span className="mt-0.5 block text-[8px] text-[var(--muted)]">Bugünkü randevu ve tahsilat görünümü</span></div><span className="text-[8px] font-medium text-[var(--muted-soft)]">Randevu / Tahsilat</span></div>
              <div className="divide-y divide-[var(--line)]">{data.staffPerformance.slice(0,5).map((s,index)=><div key={s.id} className="grid grid-cols-[24px_34px_minmax(0,1fr)_auto] items-center gap-2.5 px-3.5 py-3">
                <span className="text-center text-[10px] font-semibold text-[var(--muted-soft)]">{index+1}</span>
                <Avatar label={initials(s.name.split(" ")[0] ?? "",s.name.split(" ").slice(1).join(" "))}/>
                <div className="min-w-0"><b className="block truncate text-[11px] font-semibold text-[var(--ink)]">{s.name}</b><span className="mt-0.5 block text-[9px] text-[var(--muted)]">{s.appointmentCount} randevu</span></div>
                <div className="text-right"><span className="block text-[10px] font-semibold text-[var(--accent)]">{money.format(s.collected)}</span><span className="mt-0.5 block text-[8px] text-[var(--muted-soft)]">Tahsilat</span></div>
              </div>)}</div>
            </div>:null}
          </div>
          <Link href="/staff" className="panel-footer-link">Tüm ekibi görüntüle<ArrowRightIcon/></Link>
        </Panel>
      </aside>
    </div>

    <DashboardActions action={action} onClose={()=>setAction(null)} onSaved={saved}/>
    <Modal open={tool === "search"} onClose={()=>setTool(null)} title="Ara" description="Müşteri, hizmet veya personel arasında hızlıca bul."><div className="space-y-4"><TextInput autoFocus value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Ara..."/>{search.trim()?<div className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)]">{filteredSearch.length?filteredSearch.map((x,i)=><Link key={`${x.label}-${i}`} href={x.href} onClick={()=>setTool(null)} className="flex items-center justify-between gap-4 p-3 hover:bg-[var(--surface-2)]"><div><p className="text-sm font-medium text-[var(--ink)]">{x.label}</p><p className="mt-0.5 text-xs text-[var(--muted)]">{x.detail}</p></div><ArrowRightIcon/></Link>):<p className="p-4 text-sm text-[var(--muted)]">Sonuç bulunamadı.</p>}</div>:<p className="text-xs text-[var(--muted)]">⌘K ile hızlı arama penceresini açabilirsin.</p>}</div></Modal>
  </div>;
}

function Metric({icon,label,value,detail,badge,tone}:{icon:ReactNode;label:string;value:number|string;detail:string;badge:string;tone:string}){return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div className="min-w-0 pr-7"><div className="flex items-start justify-between gap-2"><p>{label}</p><CardInfo help={getCardHelp(label, detail)} /></div><strong>{value}</strong><span>{detail}</span></div><span className={`metric-badge ${tone}`}>{badge}</span></div>}
function Panel({title,subtitle,action,children}:{title:string;subtitle?:string;action?:ReactNode;children:ReactNode}){return <section className="dashboard-panel"><div className="panel-header"><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><h2>{title}</h2><CardInfo help={getCardHelp(title, subtitle)} /></div>{subtitle?<p>{subtitle}</p>:null}</div>{action}</div><div className="panel-body">{children}</div></section>}
function Avatar({label,size="sm"}:{label:string;size?:"sm"|"lg"}){return <div className={`dashboard-avatar ${size === "lg" ? "lg" : ""}`}>{label}</div>}
function Trend({label,value}:{label:string;value:number|string}){return <div className="trend-mini"><span>{label}</span><strong>{value}</strong></div>}
function Bar({label,value,max}:{label:string;value:number;max:number}){return <div className="metric-bar-row"><span>{label}</span><div className="metric-bar-track"><span className="metric-bar-fill info" style={{width:`${value ? Math.max(10,value/max*100):0}%`}}/></div><strong>{value}</strong></div>}
function Meta({icon,label,value}:{icon:ReactNode;label:string;value:string}){return <div className="meta-cell"><span>{icon}</span><small>{label}</small><strong title={value}>{value}</strong></div>}
function Activity({icon,title,detail}:{icon:ReactNode;title:string;detail:string}){return <div className="activity-item"><span className="activity-icon">{icon}</span><div className="min-w-0"><p>{title}</p><span className="truncate">{detail}</span></div><time>şimdi</time></div>}
function Quick({label,onClick}:{label:string;onClick:()=>void}){return <button type="button" onClick={onClick} className="quick-action"><div className="quick-action-label">{label}</div><div className="quick-action-arrow"><ArrowRightIcon/></div></button>}

function RevenueTrendChart({data}:{data:DailyTrend[]}) {
  const [selectedIndex,setSelectedIndex]=useState(Math.max(0,data.length-1));
  if (!data.length) return <div className="flex min-h-[220px] items-center justify-center p-5 text-[12px] text-[var(--muted)]">Trend verisi bulunamadı.</div>;
  const selected=data[Math.min(selectedIndex,data.length-1)] ?? data[data.length-1];
  const width=560, height=190, left=22, right=18, top=20, bottom=38;
  const max=Math.max(...data.map((item)=>Math.max(0,item.net)),1);
  const usableW=width-left-right, usableH=height-top-bottom;
  const points=data.map((item,index)=>({
    x:left+(data.length===1?usableW/2:(index/(data.length-1))*usableW),
    y:top+usableH-(Math.max(0,item.net)/max)*usableH,
    item,index,
  }));
  const path=points.map((point,index)=>`${index?"L":"M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const area=`${path} L ${points[points.length-1].x.toFixed(1)} ${(top+usableH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(top+usableH).toFixed(1)} Z`;
  const day=(value:string)=>new Intl.DateTimeFormat("tr-TR",{weekday:"short",day:"2-digit"}).format(new Date(`${value}T12:00:00`));
  return <div className="px-4 pb-2.5 pt-4">
    <div className="mb-1 flex items-end justify-between gap-4">
      <div><span className="block text-[11px] text-[var(--muted)]">Seçili Gün</span><strong className="mt-1 block text-[24px] leading-none tracking-[-0.04em] text-[var(--ink)]">{money.format(selected.net)}</strong></div>
      <div className="flex flex-col items-end gap-0.5 text-[11px]"><span className="text-[var(--muted)]">{day(selected.date)}</span><b className="font-semibold text-[var(--ink)]">{selected.appointments} randevu</b></div>
    </div>
    <svg className="min-h-[190px] h-auto w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Son 7 gün net tahsilat grafiği">
      <defs><linearGradient id="revenueArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity=".20"/><stop offset="100%" stopColor="var(--accent)" stopOpacity=".01"/></linearGradient></defs>
      {[0,.5,1].map((ratio)=><line key={ratio} x1={left} x2={width-right} y1={top+usableH*ratio} y2={top+usableH*ratio} stroke="var(--line)" strokeWidth="1" strokeDasharray="3 5"/>)}
      <path d={area} fill="url(#revenueArea)"/>
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      {points.map((point)=><g key={point.item.date} role="button" tabIndex={0} aria-label={`${day(point.item.date)} ${money.format(point.item.net)}`} onClick={()=>setSelectedIndex(point.index)} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setSelectedIndex(point.index)}}} className="cursor-pointer outline-none">
        <circle cx={point.x} cy={point.y} r={point.index===selectedIndex?7:5} fill={point.index===selectedIndex?"var(--accent)":"var(--surface)"} stroke="var(--accent)" strokeWidth="3"/>
        <text x={point.x} y={height-12} textAnchor="middle" fill="var(--muted-soft)" fontSize="10" fontWeight="600">{day(point.item.date).split(" ")[0]}</text>
      </g>)}
    </svg>
  </div>;
}

function AppointmentStatusChart({summary}:{summary:Report["summary"]}) {
  const statuses=[
    {key:"completed",label:"Tamamlandı",value:summary.completedAppointments,color:"var(--success)"},
    {key:"confirmed",label:"Onaylandı",value:summary.confirmedAppointments,color:"var(--accent)"},
    {key:"scheduled",label:"Planlandı",value:summary.scheduledAppointments,color:"var(--warning)"},
    {key:"cancelled",label:"İptal",value:summary.cancelledAppointments,color:"var(--danger)"},
    {key:"noShow",label:"Gelmedi",value:summary.noShowAppointments,color:"var(--line-strong)"},
  ];
  const [selected,setSelected]=useState(statuses[0].key);
  const total=Math.max(1,summary.appointmentCount);
  let cursor=0;
  const slices=statuses.map((item)=>{
    const start=cursor;
    const end=cursor+(item.value/total)*100;
    cursor=end;
    return `${item.color} ${start}% ${end}%`;
  });
  const active=statuses.find((item)=>item.key===selected) ?? statuses[0];
  const activePct=summary.appointmentCount?Math.round(active.value/summary.appointmentCount*100):0;
  return <div className="grid items-center gap-4 p-4 sm:grid-cols-[minmax(140px,.9fr)_minmax(150px,1.1fr)]">
    <div className="flex flex-col items-center gap-3">
      <div className="relative grid aspect-square w-[142px] place-items-center rounded-full" style={{background:`conic-gradient(${slices.join(",")})`}} aria-label="Randevu durum dağılımı">
        <div className="absolute inset-[19px] rounded-full border border-[var(--line)] bg-[var(--surface)]"/>
        <div className="relative z-10 flex flex-col items-center"><strong className="text-[25px] leading-none tracking-[-0.04em] text-[var(--ink)]">{active.value}</strong><span className="mt-1 text-[11px] font-semibold text-[var(--muted)]">%{activePct}</span></div>
      </div>
      <div className="text-center"><b className="block text-[12px] text-[var(--ink)]">{active.label}</b><span className="mt-0.5 block text-[10px] text-[var(--muted)]">{summary.appointmentCount} toplam randevu</span></div>
    </div>
    <div className="flex flex-col gap-1.5">
      {statuses.map((item)=><button key={item.key} type="button" onClick={()=>setSelected(item.key)} className={`grid min-h-[34px] grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2 rounded-[10px] border px-2.5 text-left text-[11px] transition ${selected===item.key?"border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]":"border-transparent text-[var(--muted)] hover:border-[var(--line)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"}`}>
        <span className="h-2 w-2 rounded-full" style={{background:item.color}}/>
        <span>{item.label}</span>
        <strong className="text-[11px] text-[var(--ink)]">{item.value}</strong>
      </button>)}
    </div>
  </div>;
}

function Empty({label,href}:{label:string;href:string}){return <Link href={href} className="flex min-h-[90px] flex-col items-center justify-center gap-1 text-center"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--muted)]"><CalendarIcon/></span><span className="text-[11px] font-medium text-[var(--ink)]">{label}</span><span className="text-[10px] text-[var(--muted)]">Detaylara git</span></Link>}
function ToolPopover({title,children}:{title:string;children:ReactNode}){return <div className="absolute right-0 top-11 z-40 w-[250px] rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[0_18px_45px_rgba(23,23,23,.12)]"><p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">{title}</p>{children}</div>}
function ToolButton({label,onClick}:{label:string;onClick:()=>void}){return <button type="button" onClick={onClick} className="w-full rounded-xl px-3 py-2.5 text-left text-xs font-medium text-[var(--ink)] hover:bg-[var(--surface-2)]">{label}</button>}
function ToolLine({title,detail}:{title:string;detail:string}){return <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"><div className="min-w-0"><p className="truncate text-xs font-medium text-[var(--ink)]">{title}</p><p className="mt-0.5 text-[10px] text-[var(--muted)]">{detail}</p></div><span className="h-2 w-2 shrink-0 rounded-full bg-[var(--info)]"/></div>}
function Svg({children}:{children:ReactNode}){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>}
function MenuIcon(){return <Svg><path d="M4 7h16M4 12h16M4 17h16"/></Svg>}
function StarIcon({filled=false}:{filled?:boolean}){return <Svg><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" fill={filled?"currentColor":"none"}/></Svg>}
function SearchIcon(){return <Svg><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></Svg>}
function SunIcon(){return <Svg><circle cx="12" cy="12" r="3.3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></Svg>}
function HistoryIcon(){return <Svg><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 5v5h5M12 7v5l3 2"/></Svg>}
function BellIcon(){return <Svg><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></Svg>}
function ChevronDownIcon(){return <Svg><path d="m7 10 5 5 5-5"/></Svg>}
function ArrowRightIcon(){return <Svg><path d="M5 12h14M13 6l6 6-6 6"/></Svg>}
function CalendarIcon(){return <Svg><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7 3v4M17 3v4M3.5 9h17"/></Svg>}
function WalletIcon(){return <Svg><path d="M4 6.5h14a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5A2.5 2.5 0 0 1 5.5 5H18"/><path d="M15 13h5M16 13.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z"/></Svg>}
function CheckIcon(){return <Svg><circle cx="12" cy="12" r="9"/><path d="m8 12 2.7 2.7L16.5 9"/></Svg>}
function ClockIcon(){return <Svg><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Svg>}
function SparkleIcon(){return <Svg><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3ZM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></Svg>}
function StaffIcon(){return <Svg><circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0 1 14 0"/></Svg>}
function PeopleIcon(){return <Svg><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M17 6a2.5 2.5 0 0 1 0 5M17 14a4 4 0 0 1 4 4"/></Svg>}
