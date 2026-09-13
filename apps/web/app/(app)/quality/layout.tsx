"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { hasPermission } from "@/lib/auth";
import { cx } from "@/lib/format";

const QUALITY_NAV_ITEMS = [
  { href: "/quality", label: "Kalite Merkezi", permission: ["quality", "read"] as const },
  { href: "/quality/comparison", label: "Kalite Ve Gelişim Karşılaştırma", permissions: [["quality", "read"], ["training", "read"]] as const },
  { href: "/reports", label: "Raporlar", permission: ["reports", "read"] as const },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/quality" || href === "/reports") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isAllowed(item: (typeof QUALITY_NAV_ITEMS)[number]) {
  if ("permissions" in item) {
    return item.permissions.every(([resource, action]) => hasPermission(resource, action));
  }
  return hasPermission(item.permission[0], item.permission[1]);
}

export default function QualityLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const items = QUALITY_NAV_ITEMS.filter(isAllowed);

  return (
    <div className="space-y-4">
      {items.length ? (
        <nav
          aria-label="Kalite Yönetimi"
          className="mx-auto flex max-w-[1480px] flex-wrap gap-2 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-2"
        >
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "rounded-[12px] px-4 py-2 text-[12px] font-semibold transition",
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
      {children}
    </div>
  );
}
