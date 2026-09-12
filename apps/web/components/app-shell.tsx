"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { api } from "@/lib/api";
import { clearSession, getRefreshToken, getStoredTenant, getStoredUser, hasPermission } from "@/lib/auth";
import { cx, fullName } from "@/lib/format";
import { NavIcon } from "./nav-icon";

const NAV_SECTIONS = [
  { label: "Genel", items: [
    { href: "/dashboard", label: "Bugün", icon: "home" },
    { href: "/appointments", permission: "appointments.read", label: "Randevular", badge: "3", icon: "calendar" },
    { href: "/customers", permission: "customers.read", label: "Müşteriler", icon: "users" },
  ]},
  { label: "Müşteri İlişkileri", items: [
    { href: "/crm", permission: "crm.read", label: "CRM Genel Bakış", icon: "trend" },
    { href: "/crm/leads", permission: "crm.read", label: "Leadler", icon: "users" },
    { href: "/crm/pipeline", permission: "crm.read", label: "Pipeline", icon: "chart" },
    { href: "/crm/follow-ups", permission: "crm.read", label: "Takipler", icon: "calendar" },
  ]},
  { label: "İşletme", items: [
    { href: "/services", permission: "services.read", label: "Hizmetler", icon: "sparkles" },
    { href: "/staff", permission: "staff.read", label: "Personel", icon: "user" },
    { href: "/payments", permission: "payments.read", label: "Ödemeler", icon: "wallet" },
  ]},
  { label: "Finans & CFO", items: [
    { href: "/finance/cfo", label: "Yönetim Kokpiti", icon: "trend" },
    { href: "/finance/cfo/treasury", label: "Canlı Treasury", icon: "activity" },
    { href: "/finance/integrations", label: "Finansal Entegrasyonlar", icon: "wallet" },
    { href: "/finance/integrations/operations", label: "Integration Operations", icon: "activity" },
    { href: "/finance/reconciliation", label: "Mutabakat Merkezi", icon: "arrows" },
    { href: "/reports/payments", permission: "payments.read", label: "Kasa", icon: "receipt" },
  ]},
  { label: "İnsan Kaynakları", items: [
    { href: "/hr", label: "İK Genel Bakış", icon: "briefcase" },
    { href: "/hr/employees", label: "Personeller", icon: "users" },
    { href: "/hr/personnel-files", label: "Özlük Dosyaları", icon: "file" },
    { href: "/hr/attendance", label: "Puantaj", icon: "clock" },
    { href: "/hr/leaves", label: "İzinler", icon: "calendar" },
    { href: "/hr/payroll", label: "Bordro", icon: "wallet" },
    { href: "/hr/payments", label: "Maaş Ödemeleri", icon: "receipt" },
    { href: "/hr/sgk", label: "SGK İşlemleri", icon: "shield" },
  ]},
  { label: "Gelişim", items: [
    { href: "/training", permission: "training.read", label: "Eğitim & Yetkinlik", icon: "chart" },
    { href: "/training/analytics", permission: "training.read", label: "Learning Analytics", icon: "trend" },
    { href: "/training/staff", permission: "training.read", label: "Personel Gelişim Profilleri", icon: "users" },
    { href: "/training/question-bank", permission: "training.manage", label: "Soru Bankası", icon: "file" },
  ]},
  { label: "Envanter", items: [
    { href: "/inventory", label: "Stok & Envanter", icon: "package" },
    { href: "/inventory/purchases", label: "Satın Alma", icon: "cart" },
    { href: "/inventory/transfers", label: "Depo Transferleri", icon: "arrows" },
    { href: "/inventory/movements", label: "Stok Hareketleri", icon: "activity" },
  ]},
  { label: "Analiz", items: [
    { href: "/reports", permission: "reports.read", label: "Raporlar", icon: "chart" },
    { href: "/reports/staff", permission: "reports.read", label: "Personel Performansı", icon: "trend" },
    { href: "/reports/services", permission: "reports.read", label: "Hizmet Performansı", icon: "chart" },
    { href: "/quality/comparison", permissions: ["quality.read", "training.read"], label: "Kalite & Gelişim Karşılaştırma", icon: "activity" },
  ]},
  { label: "Yönetim", items: [
    { href: "/settings/roles", permission: "roles.read", label: "Roller & Yetkiler", icon: "shield" },
    { href: "/settings", label: "Ayarlar", icon: "settings" },
  ]},
] as const;

type NavItem = (typeof NAV_SECTIONS)[number]["items"][number];

function hasPermissionKey(permission: string) {
  const [resource, action] = permission.split(".");
  return hasPermission(resource, action);
}

function isAllowed(item: NavItem) {
  if ("permissions" in item && item.permissions) return item.permissions.every(hasPermissionKey);
  if ("permission" in item && item.permission) return hasPermissionKey(item.permission);
  return true;
}

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard" || href === "/crm" || href === "/finance/cfo") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ pathname, collapsed }: { pathname: string; collapsed: boolean }) {
  const visibleSections = useMemo(
    () => NAV_SECTIONS.map((section) => ({ ...section, items: section.items.filter(isAllowed) })).filter((section) => section.items.length),
    [],
  );
  const activeSection = visibleSections.find((section) => section.items.some((item) => isActivePath(pathname, item.href)))?.label;
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(["Genel"]));

  useEffect(() => {
    if (!activeSection) return;
    setOpenSections((current) => {
      if (current.has(activeSection)) return current;
      const next = new Set(current);
      next.add(activeSection);
      return next;
    });
  }, [activeSection]);

  function toggleSection(label: string) {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      try { window.localStorage.setItem("beauty-erp-open-nav-sections", JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("beauty-erp-open-nav-sections");
      if (stored) setOpenSections(new Set(JSON.parse(stored) as string[]));
    } catch {}
  }, []);

  return (
    <nav aria-label="Ana navigasyon" className="flex flex-1 flex-col overflow-y-auto px-3 pb-4 pt-2">
      {visibleSections.map((section) => {
        const open = collapsed || openSections.has(section.label);
        return (
          <div key={section.label} className="mb-2 last:mb-0">
            {!collapsed ? (
              <button
                type="button"
                onClick={() => toggleSection(section.label)}
                aria-expanded={open}
                className="flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-soft)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
              >
                <span>{section.label}</span>
                <span aria-hidden="true" className={cx("text-[12px] transition-transform duration-200", open ? "rotate-90" : "rotate-0")}>›</span>
              </button>
            ) : (
              <div className="mx-auto mb-2 h-px w-7 bg-[var(--line)]" aria-hidden="true" />
            )}

            {open ? (
              <div className="mt-1 space-y-1">
                {section.items.map((item) => {
                  const active = isActivePath(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                      className={cx(
                        "group relative flex h-11 items-center rounded-[14px] transition-all duration-200",
                        collapsed ? "justify-center px-2" : "gap-3 px-3",
                        active
                          ? "bg-[var(--accent-soft)] text-[var(--accent)] shadow-[inset_0_0_0_1px_rgba(22,116,189,0.06)]"
                          : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
                      )}
                    >
                      <span className={cx(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]",
                        active ? "bg-white/80 text-[var(--accent)]" : "text-[var(--muted)] group-hover:text-[var(--ink)]",
                      )}>
                        <NavIcon name={item.icon} />
                      </span>
                      {!collapsed ? (
                        <>
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-[-0.01em]">{item.label}</span>
                          {"badge" in item && item.badge ? (
                            <span className="rounded-full bg-[#dff3fb] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">{item.badge}</span>
                          ) : null}
                        </>
                      ) : null}
                      {active ? (
                        <span aria-hidden="true" className={cx(
                          "absolute rounded-full bg-[var(--accent)]",
                          collapsed ? "bottom-2 left-1/2 h-1 w-1 -translate-x-1/2" : "left-0 top-1/2 h-5 w-[3px] -translate-y-1/2",
                        )} />
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const user = getStoredUser();
  const tenant = getStoredTenant();

  useEffect(() => {
    if (window.localStorage.getItem("beauty-erp-sidebar-collapsed") === "true") setCollapsed(true);
  }, []);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("beauty-erp-sidebar-collapsed", String(next));
      return next;
    });
  }

  async function logout() {
    setLoggingOut(true);
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) await api("/auth/logout", { method: "POST", body: { refreshToken }, auth: false });
    } catch {
      // Local session still needs to be cleared.
    } finally {
      clearSession();
      router.replace("/login");
    }
  }

  return (
    <div
      className="app-shell relative min-h-screen lg:grid"
      style={{ gridTemplateColumns: collapsed ? "76px minmax(0,1fr)" : "260px minmax(0,1fr)" } as CSSProperties}
    >
      <aside className={cx(
        "app-sidebar glass hidden flex-col overflow-hidden border border-white/80 bg-white/90 backdrop-blur-2xl lg:flex",
        collapsed ? "w-[76px]" : "w-[260px]",
      )}>
        <div className={cx("flex items-center border-b border-[var(--line)] py-5", collapsed ? "justify-center px-3" : "justify-between px-5")}>
          <div className={cx("flex min-w-0 items-center", collapsed ? "justify-center" : "gap-3")}>
            <BrandMark />
            {!collapsed ? (
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold tracking-[-0.02em] text-[var(--ink)]">VALOO</div>
                <div className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{tenant?.name ?? "İşletme yönetimi"}</div>
              </div>
            ) : null}
          </div>
          {!collapsed ? (
            <button type="button" onClick={toggleSidebar} aria-label="Menüyü daralt" title="Menüyü daralt" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]">‹</button>
          ) : null}
        </div>

        {collapsed ? (
          <button type="button" onClick={toggleSidebar} aria-label="Menüyü genişlet" title="Menüyü genişlet" className="mx-auto mt-3 flex h-9 w-9 items-center justify-center rounded-[12px] text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]">›</button>
        ) : null}

        {!collapsed ? (
          <div className="px-5 pt-4">
            {user ? (
              <div className="flex items-center gap-3 rounded-[16px] bg-[var(--surface-2)] px-3 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)]">{getInitials(user.firstName, user.lastName)}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-[var(--ink)]">{fullName(user.firstName, user.lastName)}</p>
                  <p className="mt-0.5 truncate text-[10px] text-[var(--muted)]">{tenant?.name ?? "İşletme"}</p>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mx-auto mt-4 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)]">{user ? getInitials(user.firstName, user.lastName) : "V"}</div>
        )}

        <NavLinks pathname={pathname} collapsed={collapsed} />

        <div className={cx("mt-auto border-t border-[var(--line)]", collapsed ? "flex justify-center p-3" : "p-4")}>
          <button
            type="button"
            onClick={() => void logout()}
            disabled={loggingOut}
            aria-busy={loggingOut}
            title={collapsed ? "Çıkış yap" : undefined}
            className={cx(
              "flex items-center rounded-[13px] text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40",
              collapsed ? "h-10 w-10 justify-center" : "w-full gap-3 px-3 py-2.5",
            )}
          >
            <span aria-hidden="true">↪</span>
            {!collapsed ? (loggingOut ? "Çıkış yapılıyor…" : "Çıkış yap") : null}
          </button>
        </div>
      </aside>

      <main className="app-content min-w-0 pb-24 lg:pb-0">{children}</main>
    </div>
  );
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function BrandMark() {
  return (
    <div
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] text-[16px] font-semibold text-white shadow-[0_6px_18px_rgba(22,116,189,0.20)]"
      style={{ background: "linear-gradient(135deg, #55D4E1 0%, #1674BD 50%, #0551B0 100%)" }}
    >
      V
    </div>
  );
}
