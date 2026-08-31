"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { api } from "@/lib/api";
import {
  clearSession,
  getRefreshToken,
  getStoredTenant,
  getStoredUser,
  hasPermission,
} from "@/lib/auth";
import { cx, fullName } from "@/lib/format";
import { IconButton } from "./ui";

const NAV_SECTIONS = [
  {
    label: "Genel",
    items: [
      { href: "/dashboard", label: "Bugün", icon: HomeIcon },
      { href: "/appointments", permission: "appointments.read", label: "Randevular", badge: "3", icon: CalendarIcon },
      { href: "/customers", permission: "customers.read", label: "Müşteriler", icon: PeopleIcon },
    ],
  },
  {
    label: "İşletme",
    items: [
      { href: "/services", permission: "services.read", label: "Hizmetler", icon: SparkleIcon },
      { href: "/staff", permission: "staff.read", label: "Personel", icon: StaffIcon },
      { href: "/payments", permission: "payments.read", label: "Ödemeler", icon: PaymentIcon },
    ],
  },
  {
    label: "Envanter",
    items: [
      { href: "/inventory", label: "Stok & Envanter", icon: BoxIcon },
      { href: "/inventory/purchases", label: "Satın Alma", icon: CartIcon },
      { href: "/inventory/transfers", label: "Depo Transferleri", icon: TransferIcon },
      { href: "/inventory/movements", label: "Stok Hareketleri", icon: HistoryIcon },
    ],
  },
  {
    label: "Analiz",
    items: [
      { href: "/reports", permission: "reports.read", label: "Raporlar", icon: ReportsIcon },
      { href: "/reports/staff", permission: "reports.read", label: "Personel Performansı", icon: TrendIcon },
      { href: "/reports/services", permission: "reports.read", label: "Hizmet Performansı", icon: ChartIcon },
    ],
  },
  {
    label: "Yönetim",
    items: [
      { href: "/settings/roles", permission: "roles.read", label: "Roller & Yetkiler", icon: ShieldIcon },
      { href: "/reports/payments", permission: "payments.read", label: "Kasa", icon: WalletIcon },
      { href: "/settings", label: "Ayarlar", icon: SettingsIcon },
    ],
  },
] as const;

type NavItem = (typeof NAV_SECTIONS)[number]["items"][number];

function isAllowed(item: NavItem) {
  if (!("permission" in item) || !item.permission) return true;
  const [resource, action] = item.permission.split(".");
  return hasPermission(resource, action);
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

function NavLinks({ pathname, collapsed, onNavigate }: { pathname: string; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Ana navigasyon" className="flex flex-1 flex-col overflow-y-auto px-3 pb-4 pt-2">
      {NAV_SECTIONS.map((section) => {
        const items = section.items.filter(isAllowed);
        if (!items.length) return null;
        return (
          <div key={section.label} className="mb-4 last:mb-0">
            {!collapsed ? <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9b99a7]">{section.label}</p> : <div className="mx-auto mb-2 h-px w-7 bg-[#eceaf2]" aria-hidden="true" />}
            <div className="space-y-1">
              {items.map((item) => {
                const active = isActivePath(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} title={collapsed ? item.label : undefined} className={cx("group relative flex h-11 items-center rounded-[14px] transition-all duration-200", collapsed ? "justify-center px-2" : "gap-3 px-3", active ? "bg-[#f2edff] text-[#7657e8] shadow-[inset_0_0_0_1px_rgba(118,87,232,0.06)]" : "text-[#626276] hover:bg-[#f8f7fb] hover:text-[#242332]")}>
                    <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] transition-colors", active ? "bg-white/80 text-[#7657e8]" : "text-[#777688] group-hover:text-[#4c4b5b]")}><Icon /></span>
                    {!collapsed ? <><span className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-[-0.01em]">{item.label}</span>{"badge" in item && item.badge ? <span className="rounded-full bg-[#ebe5ff] px-2 py-0.5 text-[10px] font-semibold text-[#7657e8]">{item.badge}</span> : null}</> : null}
                    {active ? <span aria-hidden="true" className={cx("absolute rounded-full bg-[#7657e8]", collapsed ? "bottom-2 left-1/2 h-1 w-1 -translate-x-1/2" : "left-0 top-1/2 h-5 w-[3px] -translate-y-1/2")} /> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function MobileNav({ pathname }: { pathname: string }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const visibleItems = NAV_SECTIONS.flatMap((section) => section.items).filter(isAllowed);
  const primaryHrefs = ["/dashboard", "/customers", "/appointments", "/payments"];
  const primaryItems = visibleItems.filter((item) => primaryHrefs.includes(item.href));
  const moreItems = visibleItems.filter((item) => !primaryHrefs.includes(item.href));
  const moreActive = moreItems.some((item) => isActivePath(pathname, item.href));
  return (
    <div className="relative">
      {moreOpen ? <div className="absolute bottom-[calc(100%+10px)] left-1/2 z-40 w-[calc(100%-8px)] -translate-x-1/2 rounded-[22px] border border-white/70 bg-[rgba(255,255,255,0.94)] p-2 shadow-[0_18px_50px_rgba(35,27,67,0.16)] backdrop-blur-2xl"><nav aria-label="Diğer sayfalar" className="grid grid-cols-2 gap-1.5">{moreItems.map((item) => { const active=isActivePath(pathname,item.href); const Icon=item.icon; return <Link key={item.href} href={item.href} onClick={()=>setMoreOpen(false)} aria-current={active?"page":undefined} className={cx("flex min-w-0 items-center gap-2 rounded-[14px] px-3 py-3 text-[13px] transition-colors",active?"bg-[#f2edff] font-medium text-[#7657e8]":"text-[#626276] hover:bg-[#f7f6fa] hover:text-[#242332]")}><span className="shrink-0"><Icon /></span><span className="min-w-0 truncate">{item.label}</span></Link>; })}</nav></div> : null}
      <nav aria-label="Mobil ana navigasyon" className="grid grid-cols-5 gap-1 px-1 py-1">{primaryItems.map((item)=>{const active=isActivePath(pathname,item.href);const Icon=item.icon;return <Link key={item.href} href={item.href} aria-current={active?"page":undefined} className={cx("flex min-w-0 flex-col items-center justify-center gap-1 rounded-[16px] px-1 py-2.5 text-[11px] transition-colors",active?"bg-[#f2edff] font-medium text-[#7657e8]":"text-[#777688] hover:bg-[#f7f6fa] hover:text-[#242332]")}><span className="shrink-0"><Icon /></span><span className="max-w-full truncate">{item.label}</span></Link>;})}<button type="button" onClick={()=>setMoreOpen(v=>!v)} aria-expanded={moreOpen} aria-label="Diğer menü seçenekleri" className={cx("flex min-w-0 flex-col items-center justify-center gap-1 rounded-[16px] px-1 py-2.5 text-[11px] transition-colors",moreOpen||moreActive?"bg-[#f2edff] font-medium text-[#7657e8]":"text-[#777688] hover:bg-[#f7f6fa] hover:text-[#242332]")}><span className="text-[15px] leading-none tracking-[0.12em]">•••</span><span>Daha</span></button></nav>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname=usePathname(); const router=useRouter(); const [loggingOut,setLoggingOut]=useState(false); const [collapsed,setCollapsed]=useState(false); const user=getStoredUser(); const tenant=getStoredTenant();
  useEffect(()=>{const stored=window.localStorage.getItem("beauty-erp-sidebar-collapsed");if(stored==="true")setCollapsed(true)},[]);
  function toggleSidebar(){setCollapsed(current=>{const next=!current;window.localStorage.setItem("beauty-erp-sidebar-collapsed",String(next));return next;});}
  async function logout(){setLoggingOut(true);const refreshToken=getRefreshToken();try{if(refreshToken)await api("/auth/logout",{method:"POST",body:{refreshToken},auth:false});}catch{// Session is cleared locally even if logout request fails.
  }finally{clearSession();router.replace("/login");}}
  return <div className="relative min-h-screen lg:grid lg:gap-4 lg:p-4" style={{gridTemplateColumns:collapsed?"76px minmax(0,1fr)":"260px minmax(0,1fr)"} as CSSProperties}><aside className={cx("glass sticky top-4 hidden h-[calc(100vh-32px)] flex-col overflow-hidden rounded-[28px] border border-white/80 bg-white/90 shadow-[0_14px_40px_rgba(43,35,72,0.07)] backdrop-blur-2xl lg:flex",collapsed?"w-[76px]":"w-[260px]")}><div className={cx("flex items-center border-b border-[#efedf4] py-5",collapsed?"justify-center px-3":"justify-between px-5")}><div className={cx("flex min-w-0 items-center",collapsed?"justify-center":"gap-3")}><BrandMark />{!collapsed?<div className="min-w-0"><div className="truncate text-[14px] font-semibold tracking-[-0.02em] text-[#232231]">Beauty ERP</div><div className="mt-0.5 truncate text-[11px] text-[#94929f]">{tenant?.name??"Salon yönetimi"}</div></div>:null}</div>{!collapsed?<button type="button" onClick={toggleSidebar} aria-label="Menüyü daralt" title="Menüyü daralt" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[#888697] transition hover:bg-[#f6f4fa] hover:text-[#5d5b6b]"><ChevronLeftIcon/></button>:null}</div>{collapsed?<button type="button" onClick={toggleSidebar} aria-label="Menüyü genişlet" title="Menüyü genişlet" className="mx-auto mt-3 flex h-9 w-9 items-center justify-center rounded-[12px] text-[#777688] transition hover:bg-[#f6f4fa] hover:text-[#7657e8]"><ChevronRightIcon/></button>:null}{!collapsed?<div className="px-5 pt-4">{user?<div className="flex items-center gap-3 rounded-[16px] bg-[#faf9fd] px-3 py-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eee8ff] text-[11px] font-semibold text-[#7657e8]">{getInitials(user.firstName,user.lastName)}</div><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-semibold text-[#292837]">{fullName(user.firstName,user.lastName)}</p><p className="mt-0.5 truncate text-[10px] text-[#9694a1]">{tenant?.name??"Salon"}</p></div><ChevronDownIcon/></div>:null}</div>:<div className="mx-auto mt-4 flex h-9 w-9 items-center justify-center rounded-full bg-[#eee8ff] text-[11px] font-semibold text-[#7657e8]" title={user?fullName(user.firstName,user.lastName):"Kullanıcı"}>{user?getInitials(user.firstName,user.lastName):"B"}</div>}<NavLinks pathname={pathname} collapsed={collapsed}/><div className={cx("mt-auto border-t border-[#efedf4]",collapsed?"flex justify-center p-3":"p-4")}><button type="button" onClick={()=>void logout()} disabled={loggingOut} aria-busy={loggingOut} title={collapsed?"Çıkış yap":undefined} className={cx("flex items-center rounded-[13px] text-[12px] text-[#8a8895] transition hover:bg-[#f8f7fb] hover:text-[#2a2937] disabled:cursor-not-allowed disabled:opacity-40",collapsed?"h-10 w-10 justify-center":"w-full gap-3 px-3 py-2.5")}><LogoutIcon/>{!collapsed?(loggingOut?"Çıkış yapılıyor...":"Çıkış yap"):null}</button></div></aside><div className="relative flex min-w-0 flex-col"><header className="glass sticky top-0 z-30 flex items-center justify-between rounded-b-[22px] px-4 py-3 lg:hidden"><div className="flex min-w-0 items-center gap-2.5"><BrandMark/><div className="min-w-0"><p className="truncate text-[14px] font-semibold tracking-[-0.02em] text-[var(--ink)]">Beauty ERP</p>{tenant?.name?<p className="truncate text-[10px] text-[var(--muted)]">{tenant.name}</p>:null}</div></div><IconButton type="button" aria-label="Çıkış yap" title="Çıkış yap" disabled={loggingOut} aria-busy={loggingOut} onClick={()=>void logout()}><LogoutIcon/></IconButton></header><main className="ambient-root flex-1 px-4 py-6 pb-28 sm:px-6 sm:py-8 lg:px-4 lg:py-6 lg:pb-6">{children}</main><div className="glass-elevated safe-area-bottom fixed inset-x-3 bottom-3 z-30 rounded-[24px] px-1 pt-1 lg:hidden"><MobileNav pathname={pathname}/></div></div></div>;
}

function getInitials(firstName:string,lastName:string){return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();}
function BrandMark(){return <div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-gradient-to-br from-[#b995ff] via-[#805df1] to-[#6847dc] text-[16px] font-semibold text-white shadow-[0_6px_18px_rgba(118,87,232,0.22)]">B</div>;}
function ChevronLeftIcon(){return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14.5 6-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;}
function ChevronRightIcon(){return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9.5 6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;}
function ChevronDownIcon(){return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>;}
function HomeIcon(){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>;}
function PeopleIcon(){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.6"/><path d="M4 19a5 5 0 0 1 10 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><circle cx="17" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.6"/><path d="M16 19a4 4 0 0 1 5-3.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;}
function StaffIcon(){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.6"/><path d="M5 19a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;}
function SparkleIcon(){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4.5 13.4 9l4.6 1.4L13.4 12 12 16.5 10.6 12 6 10.4 10.6 9 12 4.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="m18.5 15.5.5 1.7 1.7.5-1.7.5-.5 1.8-.5-1.8-1.7-.5 1.7-.5.5-1.7Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>;}
function CalendarIcon(){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="6" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6"/><path d="M8 4v3M16 4v3M4 10h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;}
function PaymentIcon(){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6"/><path d="M3 9h18M7 14h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;}
function ReportsIcon(){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19V11M12 19V5M19 19v-8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="M3.5 19.5h17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;}
function TrendIcon(){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 17 9 12l4 3 7-8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 7h4v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>;}
function ChartIcon(){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19V9M12 19V5M19 19v-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><circle cx="5" cy="7" r="1.3" fill="currentColor"/><circle cx="12" cy="3" r="1.3" fill="currentColor"/><circle cx="19" cy="10" r="1.3" fill="currentColor"/></svg>;}
function ShieldIcon(){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.5 19 6v5.5c0 4.4-2.8 7.6-7 9-4.2-1.4-7-4.6-7-9V6l7-2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;}
function WalletIcon(){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H19a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 17.5v-11Z" stroke="currentColor" strokeWidth="1.6"/><path d="M4 8h14M16 13h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><circle cx="16" cy="13" r=".8" fill="currentColor"/></svg>;}
function SettingsIcon(){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" stroke="currentColor" strokeWidth="1.6"/><path d="m19 13 .2-1-.2-1 1.6-1.2-1.7-2.9-1.8.8a8 8 0 0 0-1.7-1L15.1 3h-3.4l-.3 2.7a8 8 0 0 0-1.7 1l-1.8-.8-1.7 2.9L7.8 10a8 8 0 0 0-.2 1l.2 1-1.6 1.2 1.7 2.9 1.8-.8a8 8 0 0 0 1.7 1l.3 2.7h3.4l.3-2.7a8 8 0 0 0 1.7-1l1.8.8 1.7-2.9L19 13Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round"/></svg>;}
function LogoutIcon(){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 7V5a1 1 0 0 1 1-1h8v16h-8a1 1 0 0 1-1-1v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><path d="M4 12h10M11 9l3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;}
function BoxIcon(){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m4 7 8-4 8 4-8 4-8-4ZM4 7v10l8 4 8-4V7M12 11v10" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>;}
function CartIcon(){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 4h2l2 12h10l3-8H6M10 20h.01M18 20h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;}
function TransferIcon(){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h15l-3-3M20 17H5l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;}
function HistoryIcon(){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2-5.3M4 5v5h5M12 7v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;}
