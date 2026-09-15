"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const OPERATIONS_TABS = [
  { href: "/operations", label: "Canlı Operasyon" },
  { href: "/operations/resources", label: "Kaynaklar ve Kapasite" },
  { href: "/operations/service-executions", label: "Hizmet İcraları" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/operations") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function OperationsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-4">
      <nav
        aria-label="Operasyon çalışma alanları"
        className="mx-auto flex max-w-[1420px] flex-wrap gap-2 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-2 shadow-sm"
      >
        {OPERATIONS_TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "rounded-[12px] bg-[var(--accent-soft)] px-4 py-2 text-xs font-semibold text-[var(--accent)]"
                  : "rounded-[12px] px-4 py-2 text-xs font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
