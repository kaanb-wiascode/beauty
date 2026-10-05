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
import { ValooLogo } from "./valoo-logo";
import { ValooSelect } from "./valoo-controls";
import { parseValooRichCard } from "./team-rich-card";

const NAV_SECTIONS = [
  { label: "Genel", items: [
    { href: "/dashboard", label: "Bugün", icon: "home" },
    { href: "/dashboard/management", label: "Yönetim Özeti", icon: "trend" },
    { href: "/approvals", label: "Onay Kuyruğu", icon: "shield" },
  ]},
  { label: "Müşteri İlişkileri", items: [
    { href: "/crm", permission: "crm.read", label: "Genel Bakış", icon: "trend" },
    { href: "/crm/leads", permission: "crm.read", label: "Potansiyel Müşteriler", icon: "users" },
    { href: "/crm/pipeline", permission: "crm.read", label: "Satış Süreci", icon: "chart" },
    { href: "/crm/follow-ups", permission: "crm.read", label: "Takipler", icon: "calendar" },
    { href: "/crm/interactions", permission: "crm.read", label: "Görüşmeler", icon: "activity" },
    { href: "/crm/reports", permission: "crm.read", label: "CRM Raporları", icon: "chart" },
    { href: "/crm/settings", permission: "crm.manage", label: "CRM Ayarları", icon: "settings" },
    { href: "/customers", permission: "customers.read", label: "Müşteriler", icon: "users" },
  ]},
  { label: "Kurumsal İletişim", items: [
    { href: "/communications", permission: "communications.read", label: "Genel Bakış", icon: "trend" },
    { href: "/communications/campaigns", permission: "communications.read", label: "Pazarlama", icon: "chart" },
    { href: "/communications/leads", permission: "communications.read", label: "Potansiyel Müşteriler", icon: "users" },
    { href: "/communications/content", permission: "communications.read", label: "İçerik & Marka", icon: "calendar" },
    { href: "/communications/integrations", permission: "communications.read", label: "Entegrasyonlar", icon: "activity" },
  ]},
  { label: "Operasyon Merkezi", items: [
    { href: "/operations", permission: "operations.read", label: "Operasyon Merkezi", icon: "activity" },
    { href: "/appointments", permission: "appointments.read", label: "Randevular", badge: "3", icon: "calendar" },
    { href: "/operations/service-executions", permission: "operations.read", label: "Hizmet İcraları", icon: "sparkles" },
    { href: "/operations/sessions", permission: "sessions.read", label: "Seans Yönetimi", icon: "calendar" },
    { href: "/operations/sales", permission: "sales.read", label: "Satış ve Tahsilat", icon: "receipt" },
    { href: "/payments", permission: "payments.read", label: "Ödemeler", icon: "wallet" },
    { href: "/operations/waitlist", permission: "operations.read", label: "Bekleme Listesi", icon: "clock" },
    { href: "/operations/rebooking", permission: "appointments.read", label: "Yeniden Randevu", icon: "calendar" },
    { href: "/operations/resources", permission: "operations.read", label: "Kaynak ve Kapasite", icon: "chart" },
    { href: "/services", permission: "services.read", label: "Hizmet Tanımları", icon: "sparkles" },
    { href: "/staff", permission: "staff.read", label: "Personel", icon: "user" },
  ]},
  { label: "Finans Yönetimi", items: [
    { href: "/finance/cfo", permission: "finance.read", label: "Finans Genel Bakışı", icon: "trend" },
    { href: "/finance/income", permission: "finance.read", label: "Gelir ve Tahsilat", icon: "trend" },
    { href: "/finance/receivables", permission: "finance.read", label: "Müşteri Alacakları", icon: "wallet" },
    { href: "/finance/expenses", permission: "finance.read", label: "Gider ve Ödeme", icon: "receipt" },
    { href: "/finance/cari-accounts", permission: "finance.read", label: "Cari Hesaplar", icon: "users" },
    { href: "/finance/invoices", permission: "finance.read", label: "Faturalar", icon: "file" },
    { href: "/finance/cfo/treasury", permission: "finance.read", label: "Nakit ve Banka", icon: "wallet" },
    { href: "/finance/obligations", permission: "finance.read", label: "Borç ve Yükümlülükler", icon: "calendar" },
    { href: "/finance/reconciliation", permission: "finance.read", label: "Mutabakat", icon: "arrows" },
    { href: "/finance/cfo/planning", permission: "finance.read", label: "Planlama ve Kârlılık", icon: "chart" },
    { href: "/finance/accounting", permission: "accounting.read", label: "Muhasebe", icon: "file" },
    { href: "/finance/tax", permission: "accounting.read", label: "Vergi ve Uyum", icon: "shield" },
    { href: "/finance/control", permission: "finance.manage", label: "Finans Kontrolü", icon: "settings" },
  ]},
  { label: "İnsan Kaynakları", items: [
    { href: "/hr", label: "İK Merkezi", icon: "briefcase" },
    { href: "/hr/employees", label: "Çalışanlar", icon: "users" },
    { href: "/hr/organization", permission: "hr.read", label: "Organizasyon", icon: "users" },
    { href: "/hr/personnel-files", label: "Özlük Bilgileri", icon: "file" },
    { href: "/hr/attendance", label: "Puantaj Kayıtları", icon: "clock" },
    { href: "/hr/attendance-control", permission: "hr.read", label: "Puantaj Kontrolü", icon: "activity" },
    { href: "/hr/leaves", label: "İzin Kayıtları", icon: "calendar" },
    { href: "/hr/leave-management", permission: "hr.read", label: "İzin Yönetimi", icon: "calendar" },
    { href: "/hr/payroll-dashboard", permission: "hr.read", label: "Bordro Kontrolü", icon: "chart" },
    { href: "/hr/payroll", label: "Bordro Kayıtları", icon: "wallet" },
    { href: "/hr/payments", label: "Maaş Ödemeleri", icon: "receipt" },
    { href: "/hr/sgk", label: "Sosyal Güvenlik", icon: "shield" },
    { href: "/hr/overtime", permission: "hr.read", label: "Fazla Mesai", icon: "clock" },
    { href: "/hr/workforce", permission: "hr.read", label: "Vardiya Planı", icon: "calendar" },
    { href: "/hr/shift-exchanges", permission: "hr.read", label: "Vardiya Değişimleri", icon: "arrows" },
    { href: "/hr/capacity", permission: "hr.read", label: "İş Gücü Kapasitesi", icon: "chart" },
    { href: "/hr/planning", permission: "hr.read", label: "İK Planlama", icon: "calendar" },
    { href: "/hr/self-service", permission: "hr.read", label: "Çalışan İşlemleri", icon: "user" },
    { href: "/hr/recruitment", permission: "hr.read", label: "İşe Alım", icon: "users" },
    { href: "/hr/talent", permission: "hr.read", label: "Yetenek ve Performans", icon: "trend" },
    { href: "/hr/analytics", permission: "hr.read", label: "İK Analizi", icon: "chart" },
    { href: "/hr/rewards", permission: "hr.read", label: "Ücret ve Yan Haklar", icon: "wallet" },
    { href: "/hr/rewards/manage", permission: "hr.manage", label: "Yan Hak ve Masraf İşlemleri", icon: "receipt" },
    { href: "/hr/skill-scheduling", permission: "hr.read", label: "Yetkinliğe Göre Planlama", icon: "calendar" },
    { href: "/hr/operations-control", permission: "hr.read", label: "İK İşlem Takibi", icon: "activity" },
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

function teamMessagePreview(value: string) {
  const card = parseValooRichCard(value);
  if (!card) return value;
  const label = card.kind === "APPOINTMENT" ? "Randevu" : card.kind === "CUSTOMER" ? "Müşteri" : card.kind === "PAYMENT" ? "Ödeme" : card.kind === "STAFF" ? "Personel" : card.kind === "LEAD" ? "Potansiyel Müşteri" : card.kind === "OPPORTUNITY" ? "Satış Fırsatı" : card.kind === "SALE" ? "Satış" : card.kind === "INVENTORY" ? "Stok Ürünü" : "Takip Görevi";
  return `${label}: ${card.title}`;
}

type TeamConversationSummary = {
  id: string;
  displayName: string;
  unreadCount: number;
  updatedAt: string;
  lastMessage: { body: string; createdAt: string; senderName: string } | null;
};

type TeamMiniMessage = {
  id: string;
  body: string;
  senderUserId: string;
  senderName: string;
  createdAt: string;
  readByCount: number;
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
                className="flex w-full items-center justify-between rounded-[10px] px-3 py-2.5 text-left text-[13px] font-semibold tracking-[-0.01em] text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--accent)]"
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
                        "group relative flex h-10 items-center rounded-[12px] transition-all duration-200",
                        collapsed ? "justify-center px-2" : "gap-3 px-3",
                        active
                          ? "bg-[var(--accent-soft)] text-[var(--accent)] shadow-[inset_0_0_0_1px_rgba(0,191,99,0.06)]"
                          : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
                      )}
                    >
                      <span className={cx(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]",
                        active ? "bg-white/80 text-[var(--accent)]" : "text-[var(--muted)] group-hover:text-[var(--ink)]",
                      )}>
                        <NavIcon name={item.icon} />
                      </span>
                      {!collapsed ? (
                        <>
                          <span className={cx("min-w-0 flex-1 truncate text-[13px] tracking-[-0.01em]", active ? "font-semibold" : "font-normal")}>{item.label}</span>
                          {"badge" in item && item.badge ? (
                            <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">{item.badge}</span>
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
  const [messengerOpen, setMessengerOpen] = useState(false);
  const [messengerLoading, setMessengerLoading] = useState(false);
  const [messengerConversations, setMessengerConversations] = useState<TeamConversationSummary[]>([]);
  const [messengerConversationId, setMessengerConversationId] = useState<string | null>(null);
  const [messengerMessages, setMessengerMessages] = useState<TeamMiniMessage[]>([]);
  const [messengerDraft, setMessengerDraft] = useState("");
  const [messengerSending, setMessengerSending] = useState(false);
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
    if (!messengerOpen) return;
    let active = true;
    setMessengerLoading(true);
    void api<TeamConversationSummary[]>("/team/conversations")
      .then((result) => {
        if (active) setMessengerConversations(result);
      })
      .catch(() => {
        if (active) setMessengerConversations([]);
      })
      .finally(() => {
        if (active) setMessengerLoading(false);
      });
    return () => {
      active = false;
    };
  }, [messengerOpen]);

  useEffect(() => {
    if (!messengerOpen || !messengerConversationId) return;
    let active = true;
    setMessengerLoading(true);
    void api<TeamMiniMessage[]>(`/team/conversations/${messengerConversationId}/messages?limit=40`)
      .then(async (result) => {
        if (!active) return;
        setMessengerMessages(result);
        await api(`/team/conversations/${messengerConversationId}/read`, { method: "POST" }).catch(() => undefined);
        const unread = await api<{ unreadCount: number }>("/team/unread-summary").catch(() => null);
        if (active && unread) setTeamUnread(unread.unreadCount);
        setMessengerConversations((current) => current.map((item) => item.id === messengerConversationId ? { ...item, unreadCount: 0 } : item));
      })
      .catch(() => {
        if (active) setMessengerMessages([]);
      })
      .finally(() => {
        if (active) setMessengerLoading(false);
      });
    return () => {
      active = false;
    };
  }, [messengerOpen, messengerConversationId]);

  async function sendMessengerMessage() {
    if (!messengerConversationId || !messengerDraft.trim() || messengerSending) return;
    const body = messengerDraft.trim();
    setMessengerSending(true);
    setMessengerDraft("");
    try {
      await api(`/team/conversations/${messengerConversationId}/messages`, {
        method: "POST",
        body: { body },
      });
      const [messagesResult, conversationsResult] = await Promise.all([
        api<TeamMiniMessage[]>(`/team/conversations/${messengerConversationId}/messages?limit=40`),
        api<TeamConversationSummary[]>("/team/conversations"),
      ]);
      setMessengerMessages(messagesResult);
      setMessengerConversations(conversationsResult);
    } catch {
      setMessengerDraft(body);
    } finally {
      setMessengerSending(false);
    }
  }

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
    boxShadow: "0 14px 40px rgba(18,93,53,0.08)",
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
        <div className={cx(
          "flex items-center border-b border-[var(--line)]",
          collapsed ? "justify-center px-3 py-5" : "min-h-[92px] justify-between px-5 py-5",
        )}>
          <div className={cx("flex min-w-0 items-center", collapsed ? "justify-center" : "flex-1")}>
            <BrandMark compact={collapsed} />
          </div>
          {!collapsed ? (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Menüyü Daralt"
              title="Menüyü Daralt"
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]"
            >
              ‹
            </button>
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

        <NavLinks pathname={pathname} collapsed={collapsed} />

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

      <div className="fixed bottom-5 right-5 z-[80] hidden sm:block">
        {messengerOpen ? (
          <div className="mb-3 w-[380px] overflow-hidden rounded-[24px] border border-white/80 bg-white/95 shadow-[0_24px_80px_rgba(18,93,53,.22)] backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3.5">
              <div>
                <p className="text-[13px] font-semibold text-[var(--ink)]">Mesajlar</p>
                <p className="mt-0.5 text-[10px] text-[var(--muted)]">{teamUnread ? `${teamUnread} okunmamış mesaj` : "Tüm mesajlar okundu"}</p>
              </div>
              <button type="button" onClick={() => setMessengerOpen(false)} aria-label="Mesajları kapat" className="flex h-8 w-8 items-center justify-center rounded-full text-[18px] text-[var(--muted)] hover:bg-[var(--surface-2)]">×</button>
            </div>
            {messengerConversationId ? (
              <>
                <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2">
                  <button type="button" onClick={() => { setMessengerConversationId(null); setMessengerMessages([]); }} className="flex h-8 w-8 items-center justify-center rounded-full text-[15px] text-[var(--muted)] hover:bg-[var(--surface-2)]">←</button>
                  <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[var(--ink)]">{messengerConversations.find((item) => item.id === messengerConversationId)?.displayName ?? "Konuşma"}</p>
                  <Link href="/team" onClick={() => { window.localStorage.setItem("valoo-team-active-conversation", messengerConversationId); setMessengerOpen(false); }} className="text-[9px] font-semibold text-[var(--accent)]">Tam ekran</Link>
                </div>
                <div className="max-h-[320px] min-h-[220px] overflow-y-auto bg-[var(--surface-2)]/45 p-3">
                  {messengerLoading ? (
                    <p className="py-8 text-center text-[10px] text-[var(--muted)]">Mesajlar yükleniyor…</p>
                  ) : messengerMessages.length ? (
                    <div className="space-y-2">
                      {messengerMessages.map((message) => {
                        const mine = message.senderUserId === user?.id;
                        return (
                          <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[80%] rounded-[14px] px-3 py-2 ${mine ? "bg-[var(--accent)] text-white" : "border border-[var(--line)] bg-white text-[var(--ink)]"}`}>
                              {!mine ? <p className="mb-0.5 text-[8px] font-semibold text-[var(--accent)]">{message.senderName}</p> : null}
                              <p className="whitespace-pre-wrap break-words text-[10px] leading-4">{teamMessagePreview(message.body)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="py-8 text-center text-[10px] text-[var(--muted)]">Henüz mesaj yok.</p>
                  )}
                </div>
                <div className="border-t border-[var(--line)] p-2.5">
                  <div className="flex items-end gap-2 rounded-[13px] border border-[var(--line)] bg-[var(--surface-2)]/70 p-2 focus-within:border-[var(--line-strong)] focus-within:bg-white">
                    <textarea
                      value={messengerDraft}
                      onChange={(event) => setMessengerDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendMessengerMessage();
                        }
                      }}
                      placeholder="Mesaj yazın…"
                      className="max-h-24 min-h-9 flex-1 resize-none bg-transparent px-1 py-1.5 text-[10px] text-[var(--ink)] outline-none placeholder:text-[var(--muted-soft)]"
                    />
                    <button type="button" disabled={!messengerDraft.trim() || messengerSending} onClick={() => void sendMessengerMessage()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent)] text-[12px] font-semibold text-white disabled:opacity-40">
                      {messengerSending ? "…" : "➤"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="max-h-[420px] overflow-y-auto p-2">
                  {messengerLoading ? (
                    <p className="px-3 py-8 text-center text-[11px] text-[var(--muted)]">Konuşmalar yükleniyor…</p>
                  ) : messengerConversations.length ? (
                    messengerConversations.slice(0, 8).map((conversation) => (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => setMessengerConversationId(conversation.id)}
                        className="flex w-full items-center gap-3 rounded-[16px] px-3 py-3 text-left transition hover:bg-[var(--surface-2)]"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--accent-soft)] text-[12px] font-semibold text-[var(--accent)]">
                          {conversation.displayName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-[11px] font-semibold text-[var(--ink)]">{conversation.displayName}</p>
                            {conversation.unreadCount > 0 ? <span className="min-w-5 rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-center text-[9px] font-semibold text-white">{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</span> : null}
                          </div>
                          <p className="mt-1 truncate text-[10px] text-[var(--muted)]">
                            {conversation.lastMessage ? `${conversation.lastMessage.senderName}: ${teamMessagePreview(conversation.lastMessage.body)}` : "Henüz mesaj yok"}
                          </p>
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-8 text-center text-[11px] text-[var(--muted)]">Henüz konuşma bulunmuyor.</p>
                  )}
                </div>
                <div className="border-t border-[var(--line)] p-3">
                  <Link href="/team" onClick={() => setMessengerOpen(false)} className="flex h-10 items-center justify-center rounded-[12px] bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)] hover:brightness-[.98]">
                    Tüm mesajları aç
                  </Link>
                </div>
              </>
            )}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setMessengerOpen((current) => !current)}
          aria-label="Mesajları aç"
          aria-expanded={messengerOpen}
          className="relative ml-auto flex h-14 w-14 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand-gradient-start),var(--accent),var(--brand-gradient-end))] text-[22px] text-white shadow-[0_14px_34px_rgba(0,191,99,.32)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(0,191,99,.38)]"
        >
          <span aria-hidden="true">✦</span>
          {teamUnread > 0 ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full border-2 border-white bg-rose-500 px-1 py-0.5 text-center text-[9px] font-bold text-white">{teamUnread > 99 ? "99+" : teamUnread}</span> : null}
        </button>
      </div>

    </div>
  );
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <ValooLogo
      className={cx(
        "shrink-0 transition-[width] duration-200",
        compact ? "w-10" : "w-[104px]",
      )}
      alt="VALOO"
      priority
    />
  );
}