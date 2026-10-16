"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { hasPermission } from "@/lib/auth";
import { cx } from "@/lib/format";

const REPORT_NAV_ITEMS = [
  { href: "/reports", label: "Genel Raporlar", permission: ["reports", "read"] as const },
  { href: "/reports/executive", label: "ERP Yönetim Raporu", permission: ["reports", "read"] as const },
  { href: "/reports/customers", label: "Müşteri Raporları", permission: ["reports", "read"] as const },
  { href: "/reports/sales", label: "Satış Raporları", permission: ["reports", "read"] as const },
  { href: "/reports/appointments", label: "Randevu Raporları", permission: ["reports", "read"] as const },
  { href: "/reports/finance", label: "Finans Raporları", permission: ["reports", "read"] as const },
  { href: "/reports/inventory", label: "Stok Raporları", permission: ["reports", "read"] as const },
  { href: "/reports/procurement", label: "Satın Alma Raporları", permission: ["reports", "read"] as const },
  { href: "/reports/crm", label: "CRM Raporları", permission: ["crm", "read"] as const },
  { href: "/reports/hr", label: "İK Raporları", permission: ["hr", "read"] as const },
  { href: "/reports/payroll", label: "Bordro Raporları", permission: ["hr_sensitive", "read"] as const },
  { href: "/reports/staff", label: "Personel Performansı", permission: ["reports", "read"] as const },
  { href: "/reports/services", label: "Hizmet Performansı", permission: ["reports", "read"] as const },
  { href: "/reports/compare", label: "Dönem Karşılaştırma", permission: ["reports", "read"] as const },
  { href: "/reports/exports", label: "Dışa Aktarım", permission: ["reports", "read"] as const },
  { href: "/reports/schedules", label: "Zamanlanmış Raporlar", permission: ["reports", "read"] as const },
  { href: "/quality", label: "Kalite Merkezi", permission: ["quality", "read"] as const },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/reports" || href === "/quality") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ReportsSectionNav() {
  const pathname = usePathname();
  const items = REPORT_NAV_ITEMS.filter((item) => hasPermission(item.permission[0], item.permission[1]));
  if (!items.length) return null;
  return (
    <nav aria-label="Analiz Merkezi" className="mx-auto flex max-w-[1440px] flex-wrap gap-2 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-2">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cx(
            "rounded-[12px] px-4 py-2 text-[12px] font-semibold transition",
            active ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
          )}>{item.label}</Link>
        );
      })}
    </nav>
  );
}
