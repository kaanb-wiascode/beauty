"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cx } from "@/lib/format";

const QUALITY_NAV_ITEMS = [
  { href: "/quality", label: "Kalite Merkezi" },
  { href: "/quality/comparison", label: "Kalite Ve Gelişim Karşılaştırma" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/quality") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function QualityLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-4">
      <nav
        aria-label="Kalite Yönetimi"
        className="mx-auto flex max-w-[1480px] flex-wrap gap-2 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-2"
      >
        {QUALITY_NAV_ITEMS.map((item) => {
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
