"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { api, apiResponse, ApiError } from "@/lib/api";
import {
  clearSession,
  getStoredTenant,
  getStoredUser,
  hasPermission,
  persistSession,
} from "@/lib/auth";
import { cx, fullName } from "@/lib/format";
import { NavIcon } from "./nav-icon";
import { ValooSelect } from "./valoo-controls";

const NAV_SECTIONS = [
  { label: "Genel", items: [
    { href: "/dashboard", label: "Bugün", icon: "home" },
    { href: "/dashboard/management", label: "Yönetim Özeti", icon: "trend" },
  ]},
  { label: "Ekip", items: [
    { href: "/team", label: "Mesajlar ve Ekip Durumu", icon: "users" },
  ]},
  { label: "Müşteri İlişkileri", items: [
    { href: "/crm", permission: "crm.read", label: "Genel Bakış", icon: "trend" },
    { href: "/crm/leads", permission: "crm.read", label: "Potansiyel Müşteriler", icon: "users" },
    { href: "/crm/pipeline", permission: "crm.read", label: "Satış Süreci", icon: "chart" },
    { href: "/crm/follow-ups", permission: "crm.read", label: "Takipler", icon: "calendar" },
    { href: "/customers", permission: "customers.read", label: "Müşteriler", icon: "users" },
  ]},
  { label: "Kurumsal İletişim", items: [
    { href: "/communications", permission: "communications.read", label: "Genel Bakış", icon: "trend" },
    { href: "/communications/campaigns", permission: "communications.read", label: "Kampanyalar", icon: "chart" },
    { href: "/communications/leads", permission: "communications.read", label: "Potansiyel Müşteri ve Dönüşüm", icon: "users" },
    { href: "/communications/content", permission: "communications.read", label: "İçerik Operasyonu", icon: "calendar" },
    { href: "/communications/approvals", permission: "communications.read", label: "Onay Merkezi", icon: "shield" },
    { href: "/communications/brand", permission: "communications.read", label: "Marka Merkezi", icon: "sparkles" },
    { href: "/communications/assets", permission: "communications.read", label: "Dijital Varlıklar", icon: "file" },
    { href: "/communications/vendors", permission: "communications.read", label: "Ajanslar & İş Ortakları", icon: "briefcase" },
    { href: "/communications/creators", permission: "communications.read", label: "İçerik Üreticileri", icon: "users" },
    { href: "/communications/integrations", permission: "communications.read", label: "Reklam Hesapları", icon: "activity" },
    { href: "/communications/routing", permission: "communications.manage", label: "Talep Yönlendirme", icon: "arrows" },
  ]},
  { label: "Operasyon", items: [
    { href: "/operations/front-desk", permission: "appointments.read", label: "Resepsiyon & Ziyaretler", icon: "user" },
    { href: "/operations", permission: "appointments.read", label: "Canlı Operasyon", icon: "activity" },
    { href: "/appointments", permission: "appointments.read", label: "Randevular", badge: "3", icon: "calendar" },
    { href: "/services", permission: "services.read", label: "Hizmetler", icon: "sparkles" },
    { href: "/staff", permission: "staff.read", label: "Personel", icon: "user" },
    { href: "/payments", permission: "payments.read", label: "Ödemeler", icon: "wallet" },
  ]},
  { label: "Satış ve Hizmet", items: [
    { href: "/sales", permission: "payments.read", label: "Satışlar", icon: "receipt" },
    { href: "/sessions", permission: "appointments.read", label: "Seanslar", icon: "calendar" },
  ]},
  { label: "Finans Yönetimi", items: [
    { href: "/finance/cfo", label: "Finans Genel Bakışı", icon: "trend" },
    { href: "/finance/cfo/planning", label: "Planlama ve Kârlılık", icon: "chart" },
    { href: "/finance/income", permission: "finance.read", label: "Gelirler", icon: "trend" },
    { href: "/finance/expenses", permission: "finance.read", label: "Giderler", icon: "receipt" },
    { href: "/finance/obligations", permission: "finance.read", label: "Yükümlülükler", icon: "calendar" },
    { href: "/finance/configuration", permission: "finance.read", label: "Finans Yapılandırması", icon: "settings" },
    { href: "/finance/tax", permission: "accounting.read", label: "Vergi Yönetimi", icon: "file" },
    { href: "/finance/accounting", permission: "accounting.read", label: "Muhasebe", icon: "file" },
    { href: "/finance/accounts-payable", permission: "finance.read", label: "Tedarikçi Borçları", icon: "receipt" },
    { href: "/finance/cfo/treasury", label: "Nakit Yönetimi", icon: "activity" },
    { href: "/finance/integrations", label: "Banka ve ödeme bağlantıları", icon: "wallet" },
    { href: "/finance/integrations/operations", label: "Bağlantı İşlemleri", icon: "activity" },
    { href: "/finance/integrations/transactions", label: "POS İşlem Yönetimi", icon: "receipt" },
    { href: "/finance/reconciliation", label: "Mutabakat Merkezi", icon: "arrows" },
    { href: "/reports/payments", permission: "payments.read", label: "Kasa", icon: "receipt" },
  ]},
  { label: "İnsan Kaynakları", items: [
    { href: "/hr", label: "İnsan Kaynakları Genel Bakış", icon: "briefcase" },
    { href: "/hr/employees", label: "Personeller", icon: "users" },
    { href: "/hr/personnel-files", label: "Özlük Dosyaları", icon: "file" },
    { href: "/hr/attendance", label: "Puantaj", icon: "clock" },
    { href: "/hr/leaves", label: "İzinler", icon: "calendar" },
    { href: "/hr/payroll", label: "Bordro", icon: "wallet" },
    { href: "/hr/payments", label: "Maaş Ödemeleri", icon: "receipt" },
    { href: "/hr/sgk", label: "SGK İşlemleri", icon: "shield" },
    { href: "/hr/overtime", permission: "hr.read", label: "Fazla Mesai", icon: "clock" },
    { href: "/hr/shift-exchanges", permission: "hr.read", label: "Vardiya Değişimleri", icon: "arrows" },
    { href: "/hr/capacity", permission: "hr.read", label: "İş Gücü Kapasitesi", icon: "chart" },
    { href: "/hr/planning", permission: "hr.read", label: "İK Planlama", icon: "calendar" },
    { href: "/hr/self-service", permission: "hr.read", label: "Çalışan İşlemleri", icon: "user" },
    { href: "/hr/talent", permission: "hr.read", label: "Yetenek Yönetimi", icon: "trend" },
    { href: "/hr/rewards", permission: "hr.read", label: "Toplam Ödül ve Yan Haklar", icon: "wallet" },
    { href: "/hr/rewards/manage", permission: "hr.manage", label: "Ödül ve Masraf İşlemleri", icon: "receipt" },
    { href: "/hr/skill-scheduling", permission: "hr.read", label: "Yetkinliğe Göre Planlama", icon: "calendar" },
    { href: "/hr/operations-control", permission: "hr.read", label: "İK Operasyon Kontrolü", icon: "activity" },
  ]},
  { label: "Gelişim", items: [
    { href: "/training", permission: "training.read", label: "Eğitim ve Yetkinlik", icon: "chart" },
    { href: "/training/analytics", permission: "training.read", label: "Eğitim Analizi", icon: "trend" },
    { href: "/training/staff", permission: "training.read", label: "Personel Gelişim Profilleri", icon: "users" },
    { href: "/training/question-bank", permission: "training.manage", label: "Soru Bankası", icon: "file" },
  ]},
  { label: "Envanter", items: [
    { href: "/inventory", label: "Stok ve envanter", icon: "package" },
    { href: "/inventory/lots", label: "Lot ve son kullanma", icon: "calendar" },
    { href: "/inventory/analysis", label: "Envanter Analizi", icon: "chart" },
    { href: "/inventory/counts", label: "Stok Sayımları", icon: "file" },
    { href: "/inventory/service-materials", label: "Hizmet Malzemeleri", icon: "sparkles" },
    { href: "/inventory/purchases", label: "Satın Alma", icon: "cart" },
    { href: "/inventory/purchases/governance", label: "Satın Alma Kontrolü", icon: "shield" },
    { href: "/inventory/transfers", label: "Depo Transferleri", icon: "arrows" },
    { href: "/inventory/movements", label: "Stok Hareketleri", icon: "activity" },
  ]},
  { label: "Kalite Yönetimi", items: [
    { href: "/quality", permission: "quality.read", label: "Kalite Merkezi", icon: "shield" },
    { href: "/quality/inspections", permission: "quality.read", label: "Denetimler", icon: "file" },
    { href: "/quality/capa", permission: "quality.read", label: "Düzeltici / Önleyici Faaliyetler", icon: "activity" },
    { href: "/quality/evidence", permission: "quality.read", label: "Kalite Kanıtları", icon: "file" },
    { href: "/quality/governance", permission: "quality.read", label: "Politikalar ve Skorlar", icon: "chart" },
  ]},
  { label: "Analiz", items: [
    { href: "/reports", permission: "reports.read", label: "Raporlar", icon: "chart" },
    { href: "/reports/staff", permission: "reports.read", label: "Personel Performansı", icon: "trend" },
    { href: "/reports/services", permission: "reports.read", label: "Hizmet Performansı", icon: "chart" },
    { href: "/quality/comparison", permissions: ["quality.read", "training.read"], label: "Kalite ve gelişim karşılaştırma", icon: "activity" },
  ]},
  { label: "Yönetim", items: [
    { href: "/settings/roles", permission: "roles.read", label: "Roller ve Yetkiler", icon: "shield" },
    { href: "/settings", label: "Ayarlar", icon: "settings" },
  ]},
] as const;

type NavItem = (typeof NAV_SECTIONS)[number]["items"][number];

type BranchOption = {
  id: string;
  name: string;
  code: string;
};

type ContextOptions = {
  membershipId: string;
  roleScope: "CENTRAL" | "COMPANY" | "BRANCH";
  activeBranchId: string | null;
  canViewAllBranches: boolean;
  branches: BranchOption[];
};

type SwitchContextResponse = {
  accessToken: string;
};

type TeamRealtimeEvent = {
  type: string;
  payload?: {
    conversationId?: string;
    messageId?: string | null;
    senderUserId?: string;
    senderName?: string;
    body?: string;
    userId?: string;
    firstName?: string;
    lastName?: string;
    typing?: boolean;
  };
  at?: string;
};

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
  if (
    href === "/dashboard" ||
    href === "/crm" ||
    href === "/communications" ||
    href === "/finance/cfo" ||
    href === "/inventory"
  ) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ pathname, collapsed, teamUnread }: { pathname: string; collapsed: boolean; teamUnread: number }) {
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
    <nav aria-label="Ana Navigasyon" className="flex flex-1 flex-col overflow-y-auto px-3 pb-4 pt-2">
      {visibleSections.map((section) => {
        const open = collapsed || openSections.has(section.label);
        return (
          <div key={section.label} className="mb-2 last:mb-0">
            {!collapsed ? (
              <button
                type="button"
                onClick={() => toggleSection(section.label)}
                aria-expanded={open}
                className="flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
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
                          {item.href === "/team" && teamUnread > 0 ? (
                            <span className="rounded-full bg-[#eee8ff] px-2 py-0.5 text-[11px] font-semibold text-[#7657e8]">{teamUnread > 99 ? "99+" : teamUnread}</span>
                          ) : "badge" in item && item.badge ? (
                            <span className="rounded-full bg-[#dff3fb] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">{item.badge}</span>
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
  const [contextOptions, setContextOptions] = useState<ContextOptions | null>(null);
  const [switchingBranch, setSwitchingBranch] = useState(false);
  const [branchError, setBranchError] = useState("");
  const [teamUnread, setTeamUnread] = useState(0);
  const user = getStoredUser();
  const tenant = getStoredTenant();

  useEffect(() => {
    if (window.localStorage.getItem("beauty-erp-sidebar-collapsed") === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let reconnectTimer: number | null = null;

    async function loadUnread() {
      try {
        const result = await api<{ unreadCount: number }>("/team/unread-summary");
        if (active) setTeamUnread(result.unreadCount);
      } catch {
        if (active) setTeamUnread(0);
      }
    }

    function handleEvent(event: TeamRealtimeEvent) {
      window.dispatchEvent(new CustomEvent<TeamRealtimeEvent>("valoo:team-realtime", { detail: event }));
      if (
        event.type === "message.created" ||
        event.type === "message.deleted" ||
        event.type === "conversation.created" ||
        event.type === "conversation.updated" ||
        event.type === "conversation.removed" ||
        event.type === "read.updated"
      ) {
        void loadUnread();
      }
    }

    async function connect() {
      if (controller.signal.aborted) return;
      try {
        const response = await apiResponse("/team/events", { signal: controller.signal });
        if (!response.ok || !response.body) {
          throw new ApiError("Gerçek zamanlı bağlantı kurulamadı.", response.status);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let separatorIndex = buffer.indexOf("\n\n");
          while (separatorIndex >= 0) {
            const block = buffer.slice(0, separatorIndex);
            buffer = buffer.slice(separatorIndex + 2);
            const data = block
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())
              .join("");

            if (data) {
              try {
                handleEvent(JSON.parse(data) as TeamRealtimeEvent);
              } catch {
                // Tek bir bozuk event bağlantıyı kesmemeli.
              }
            }
            separatorIndex = buffer.indexOf("\n\n");
          }
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) return;
      }

      if (!controller.signal.aborted) {
        reconnectTimer = window.setTimeout(() => void connect(), 1500);
      }
    }

    void loadUnread();
    void connect();

    return () => {
      active = false;
      controller.abort();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
    };
  }, []);

  useEffect(() => {
    void api("/team/heartbeat", { method: "POST" }).catch(() => undefined);
    const timer = window.setInterval(() => {
      void api("/team/heartbeat", { method: "POST" }).catch(() => undefined);
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadContextOptions() {
      try {
        const result = await api<ContextOptions>("/auth/context/options");
        if (active) setContextOptions(result);
      } catch {
        if (active) setBranchError("Şube Bilgileri Yüklenemedi.");
      }
    }

    void loadContextOptions();
    return () => {
      active = false;
    };
  }, []);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("beauty-erp-sidebar-collapsed", String(next));
      return next;
    });
  }

  async function switchBranch(value: string) {
    if (!contextOptions || switchingBranch) return;

    const branchId = value === "__all__" ? null : value;
    if (branchId === contextOptions.activeBranchId) return;

    setSwitchingBranch(true);
    setBranchError("");

    try {
      const result = await api<SwitchContextResponse>("/auth/context/switch", {
        method: "POST",
        body: {
          membershipId: contextOptions.membershipId,
          branchId,
        },
      });

      persistSession({
        accessToken: result.accessToken,
      });

      window.location.reload();
    } catch {
      setBranchError("Şube Değiştirilemedi. Lütfen Tekrar Deneyin.");
      setSwitchingBranch(false);
    }
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await api("/auth/logout", { method: "POST", auth: false });
    } catch {
      // Local session still needs to be cleared.
    } finally {
      clearSession();
      router.replace("/login");
    }
  }

  const shellStyle: CSSProperties = {
    gridTemplateColumns: collapsed ? "76px minmax(0,1fr)" : "260px minmax(0,1fr)",
    padding: 16,
    gap: 16,
    alignItems: "start",
  };

  const sidebarStyle: CSSProperties = {
    position: "sticky",
    top: 16,
    height: "calc(100vh - 32px)",
    borderRadius: 28,
    margin: 0,
    boxShadow: "0 14px 40px rgba(17,70,104,0.08)",
    overflow: "hidden",
  };

  const activeBranchName = contextOptions?.activeBranchId
    ? contextOptions.branches.find((branch) => branch.id === contextOptions.activeBranchId)?.name ?? "Şube"
    : "Tüm Şubeler";

  return (
    <div className="app-shell relative min-h-screen lg:grid" style={shellStyle}>
      <aside
        className={cx(
          "app-sidebar glass hidden flex-col border border-white/80 bg-white/90 backdrop-blur-2xl lg:flex",
          collapsed ? "w-[76px]" : "w-[260px]",
        )}
        style={sidebarStyle}
      >
        <div className={cx("flex items-center border-b border-[var(--line)] py-5", collapsed ? "justify-center px-3" : "justify-between px-5")}>
          <div className={cx("flex min-w-0 items-center", collapsed ? "justify-center" : "gap-3")}>
            <BrandMark />
            {!collapsed ? (
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold tracking-[-0.02em] text-[var(--ink)]">VALOO</div>
                <div className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{tenant?.name ?? "İşletme Yönetimi"}</div>
              </div>
            ) : null}
          </div>
          {!collapsed ? (
            <button type="button" onClick={toggleSidebar} aria-label="Menüyü Daralt" title="Menüyü Daralt" className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]">‹</button>
          ) : null}
        </div>

        {collapsed ? (
          <button type="button" onClick={toggleSidebar} aria-label="Menüyü Genişlet" title="Menüyü Genişlet" className="mx-auto mt-3 flex h-[42px] w-[42px] items-center justify-center rounded-[var(--radius-control)] text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]">›</button>
        ) : null}

        {!collapsed && contextOptions ? (
          <div className="px-5 pt-4">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Çalışma kapsamı
            </label>
            <ValooSelect
              className="mt-2"
              value={contextOptions.activeBranchId ?? "__all__"}
              onChange={(value) => void switchBranch(value)}
              disabled={switchingBranch}
              loading={switchingBranch}
              searchable={contextOptions.branches.length > 7}
              placeholder="Şube seçin"
              searchPlaceholder="Şube ara…"
              ariaLabel="Çalışma kapsamı"
              options={[
                ...(contextOptions.canViewAllBranches
                  ? [{ value: "__all__", label: "Tüm şubeler" }]
                  : []),
                ...contextOptions.branches.map((branch) => ({
                  value: branch.id,
                  label: branch.name,
                  keywords: branch.code,
                })),
              ]}
            />
            <p className="mt-2 truncate text-[11px] text-[var(--muted)]">
              {switchingBranch ? "Şube değiştiriliyor…" : `Aktif: ${activeBranchName}`}
            </p>
            {branchError ? <p className="mt-1 text-[11px] text-[var(--danger)]">{branchError}</p> : null}
          </div>
        ) : null}

        {!collapsed ? (
          <div className="px-5 pt-4">
            {user ? (
              <div className="flex items-center gap-3 rounded-[16px] bg-[var(--surface-2)] px-3 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)]">{getInitials(user.firstName, user.lastName)}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-[var(--ink)]">{fullName(user.firstName, user.lastName)}</p>
                  <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{tenant?.name ?? "İşletme"}</p>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mx-auto mt-4 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)]">{user ? getInitials(user.firstName, user.lastName) : "V"}</div>
        )}

        <NavLinks pathname={pathname} collapsed={collapsed} teamUnread={teamUnread} />

        <div className={cx("mt-auto border-t border-[var(--line)]", collapsed ? "flex justify-center p-3" : "p-4")}>
          <button
            type="button"
            onClick={() => void logout()}
            disabled={loggingOut}
            aria-busy={loggingOut}
            title={collapsed ? "Çıkış Yap" : undefined}
            className={cx(
              "flex items-center rounded-[13px] text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40",
              collapsed ? "h-10 w-10 justify-center" : "w-full gap-3 px-3 py-2.5",
            )}
          >
            <span aria-hidden="true">↪</span>
            {!collapsed ? (loggingOut ? "Çıkış Yapılıyor…" : "Çıkış Yap") : null}
          </button>
        </div>
      </aside>

      <main className="app-content min-w-0 pb-24 lg:pb-0" style={{ minWidth: 0 }}>{children}</main>
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