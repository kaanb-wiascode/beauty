"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { hasPermission } from "@/lib/auth";
import { cx } from "@/lib/format";
import { NavIcon } from "./nav-icon";

type MobileIconName =
  | "home"
  | "calendar"
  | "users"
  | "sparkles"
  | "user"
  | "wallet"
  | "briefcase"
  | "file"
  | "clock"
  | "receipt"
  | "shield"
  | "package"
  | "cart"
  | "arrows"
  | "activity"
  | "chart"
  | "trend"
  | "settings";

type MobileNavItem = {
  href: string;
  label: string;
  icon: MobileIconName;
  permission?: string;
  permissions?: readonly string[];
};

type MobileNavSection = {
  label: string;
  items: readonly MobileNavItem[];
};

const MOBILE_SECTIONS: readonly MobileNavSection[] = [
  {
    label: "Genel",
    items: [
      { href: "/dashboard", label: "Bugün", icon: "home" },
      { href: "/dashboard/management", label: "Yönetim Özeti", icon: "trend" },
    ],
  },
  {
    label: "Ekip",
    items: [
      { href: "/team", label: "Mesajlar ve Ekip Durumu", icon: "users" },
    ],
  },
  {
    label: "Müşteri İlişkileri",
    items: [
      { href: "/crm", permission: "crm.read", label: "Genel Bakış", icon: "trend" },
      { href: "/crm/leads", permission: "crm.read", label: "Potansiyel Müşteriler", icon: "users" },
      { href: "/crm/pipeline", permission: "crm.read", label: "Satış Süreci", icon: "chart" },
      { href: "/crm/follow-ups", permission: "crm.read", label: "Takipler", icon: "calendar" },
      { href: "/customers", permission: "customers.read", label: "Müşteriler", icon: "users" },
    ],
  },
  {
    label: "Kurumsal İletişim",
    items: [
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
    ],
  },
  {
    label: "Operasyon",
    items: [
      { href: "/operations/front-desk", permission: "appointments.read", label: "Resepsiyon & Ziyaretler", icon: "user" },
      { href: "/operations", permission: "appointments.read", label: "Canlı Operasyon", icon: "activity" },
      { href: "/appointments", permission: "appointments.read", label: "Randevular", icon: "calendar" },
      { href: "/services", permission: "services.read", label: "Hizmetler", icon: "sparkles" },
      { href: "/staff", permission: "staff.read", label: "Personel", icon: "user" },
      { href: "/payments", permission: "payments.read", label: "Ödemeler", icon: "wallet" },
    ],
  },
  {
    label: "Satış ve Hizmet",
    items: [
      { href: "/sales", permission: "payments.read", label: "Satışlar", icon: "receipt" },
      { href: "/sessions", permission: "appointments.read", label: "Seanslar", icon: "calendar" },
    ],
  },
  {
    label: "Finans Yönetimi",
    items: [
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
      { href: "/finance/integrations", label: "Banka ve Ödeme Bağlantıları", icon: "wallet" },
      { href: "/finance/integrations/operations", label: "Bağlantı İşlemleri", icon: "activity" },
      { href: "/finance/integrations/transactions", label: "POS İşlem Yönetimi", icon: "receipt" },
      { href: "/finance/reconciliation", label: "Mutabakat Merkezi", icon: "arrows" },
      { href: "/reports/payments", permission: "payments.read", label: "Kasa", icon: "receipt" },
    ],
  },
  {
    label: "İnsan Kaynakları",
    items: [
      { href: "/hr", label: "İK Genel Bakış", icon: "briefcase" },
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
    ],
  },
  {
    label: "Gelişim",
    items: [
      { href: "/training", permission: "training.read", label: "Eğitim ve Yetkinlik", icon: "chart" },
      { href: "/training/analytics", permission: "training.read", label: "Eğitim Analizi", icon: "trend" },
      { href: "/training/staff", permission: "training.read", label: "Personel Gelişim Profilleri", icon: "users" },
      { href: "/training/question-bank", permission: "training.manage", label: "Soru Bankası", icon: "file" },
    ],
  },
  {
    label: "Envanter",
    items: [
      { href: "/inventory", label: "Stok ve Envanter", icon: "package" },
      { href: "/inventory/lots", label: "Parti ve Son Kullanma", icon: "calendar" },
      { href: "/inventory/analysis", label: "Envanter Analizi", icon: "chart" },
      { href: "/inventory/counts", label: "Stok Sayımları", icon: "file" },
      { href: "/inventory/service-materials", label: "Hizmet Malzemeleri", icon: "sparkles" },
      { href: "/inventory/purchases", label: "Satın Alma", icon: "cart" },
      { href: "/inventory/purchases/governance", label: "Satın Alma Kontrolü", icon: "shield" },
      { href: "/inventory/transfers", label: "Depo Transferleri", icon: "arrows" },
      { href: "/inventory/movements", label: "Stok Hareketleri", icon: "activity" },
    ],
  },
  {
    label: "Kalite Yönetimi",
    items: [
      { href: "/quality", permission: "quality.read", label: "Kalite Merkezi", icon: "shield" },
      { href: "/quality/inspections", permission: "quality.read", label: "Denetimler", icon: "file" },
      { href: "/quality/capa", permission: "quality.read", label: "Düzeltici / Önleyici Faaliyetler", icon: "activity" },
      { href: "/quality/evidence", permission: "quality.read", label: "Kalite Kanıtları", icon: "file" },
      { href: "/quality/governance", permission: "quality.read", label: "Politikalar ve Skorlar", icon: "chart" },
    ],
  },
  {
    label: "Analiz",
    items: [
      { href: "/reports", permission: "reports.read", label: "Raporlar", icon: "chart" },
      { href: "/reports/staff", permission: "reports.read", label: "Personel Performansı", icon: "trend" },
      { href: "/reports/services", permission: "reports.read", label: "Hizmet Performansı", icon: "chart" },
      { href: "/quality/comparison", permissions: ["quality.read", "training.read"], label: "Kalite ve Gelişim Karşılaştırma", icon: "activity" },
    ],
  },
  {
    label: "Yönetim",
    items: [
      { href: "/settings/roles", permission: "roles.read", label: "Roller ve Yetkiler", icon: "shield" },
      { href: "/settings", label: "Ayarlar", icon: "settings" },
    ],
  },
];

const PRIMARY_ITEMS: readonly MobileNavItem[] = [
  { href: "/dashboard", label: "Bugün", icon: "home" },
  { href: "/appointments", permission: "appointments.read", label: "Randevu", icon: "calendar" },
  { href: "/crm", permission: "crm.read", label: "CRM", icon: "trend" },
  { href: "/inventory", label: "Stok", icon: "package" },
];

function hasPermissionKey(permission: string) {
  const [resource, action] = permission.split(".");
  return hasPermission(resource, action);
}

function isAllowed(item: MobileNavItem) {
  if (item.permissions) return item.permissions.every(hasPermissionKey);
  if (item.permission) return hasPermissionKey(item.permission);
  return true;
}

function isActive(pathname: string, href: string) {
  if (["/dashboard", "/crm", "/inventory", "/quality", "/reports"].includes(href)) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const sections = useMemo(
    () =>
      MOBILE_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter(isAllowed),
      })).filter((section) => section.items.length > 0),
    [],
  );
  const primaryItems = useMemo(() => PRIMARY_ITEMS.filter(isAllowed), []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button
            type="button"
            aria-label="Menüyü Kapat"
            className="absolute inset-0 bg-slate-950/30 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <section
            id="mobile-navigation-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Mobil Navigasyon"
            className="absolute inset-x-3 bottom-[76px] max-h-[74dvh] overflow-hidden rounded-[20px] border border-white/80 bg-white/96 shadow-[0_18px_54px_rgba(15,23,42,0.18)] backdrop-blur-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3.5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-soft)]">VALOO</p>
                <h2 className="mt-1 text-[17px] font-semibold text-[var(--ink)]">Tüm Modüller</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[var(--surface-2)] text-[18px] text-[var(--muted)]"
                aria-label="Menüyü Kapat"
              >
                ×
              </button>
            </div>
            <div className="max-h-[calc(74dvh-64px)] overflow-y-auto px-3 py-3">
              {sections.map((section) => (
                <div key={section.label} className="mb-4 last:mb-0">
                  <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">
                    {section.label}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {section.items.map((item) => {
                      const active = isActive(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={cx(
                            "flex min-h-11 items-center gap-2 rounded-[12px] px-2.5 py-2 text-[12px] font-medium",
                            active
                              ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                              : "bg-[var(--surface-2)]/55 text-[var(--muted)]",
                          )}
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/80">
                            <NavIcon name={item.icon} />
                          </span>
                          <span className="min-w-0 truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      <nav
        aria-label="Mobil Ana Navigasyon"
        className="fixed inset-x-3 bottom-[max(8px,env(safe-area-inset-bottom))] z-[70] flex h-[64px] items-center justify-around rounded-[20px] border border-white/80 bg-white/94 px-1.5 shadow-[0_12px_36px_rgba(15,23,42,0.14)] backdrop-blur-2xl lg:hidden"
      >
        {primaryItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex min-w-[52px] flex-col items-center justify-center gap-0.5 rounded-[12px] px-1.5 py-1 text-[10px] font-semibold",
                active ? "text-[var(--accent)]" : "text-[var(--muted)]",
              )}
            >
              <span className={cx("flex h-8 w-8 items-center justify-center rounded-[10px]", active ? "bg-[var(--accent-soft)]" : "bg-transparent")}>
                <NavIcon name={item.icon} />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls="mobile-navigation-menu"
          className={cx(
            "flex min-w-[52px] flex-col items-center justify-center gap-0.5 rounded-[12px] px-1.5 py-1 text-[10px] font-semibold",
            open ? "text-[var(--accent)]" : "text-[var(--muted)]",
          )}
        >
          <span className={cx("flex h-8 w-8 items-center justify-center rounded-[10px] text-[17px]", open ? "bg-[var(--accent-soft)]" : "bg-transparent")}>
            ⋯
          </span>
          <span>Menü</span>
        </button>
      </nav>
    </>
  );
}
