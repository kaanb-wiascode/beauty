"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cx } from "@/lib/format";

const PURCHASE_NAV_ITEMS = [
  { href: "/inventory/purchases", label: "Talep Ve Siparişler" },
  { href: "/inventory/purchases/rfqs", label: "RFQ Ve Teklifler" },
  { href: "/inventory/purchases/origins", label: "Ticari Kaynak İzleri" },
  { href: "/inventory/purchases/operations", label: "Mal Kabul Ve İadeler" },
  { href: "/inventory/purchases/replacements", label: "Değişim Talepleri" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/inventory/purchases") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function PurchasesLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-4">
      <nav
        aria-label="Satın Alma Yönetimi"
        className="mx-auto flex max-w-[1440px] flex-wrap gap-2 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-2"
      >
        {PURCHASE_NAV_ITEMS.map((item) => {
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
      {children}
    </div>
  );
}
