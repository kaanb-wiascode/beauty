"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { hasPermission } from "@/lib/auth";
import { cx } from "@/lib/format";

const LINKS = [
  { href: "/communications", label: "Genel Bakış", permission: ["communications", "read"] as const },
  { href: "/communications/campaigns", label: "Pazarlama", permission: ["communications", "read"] as const },
  { href: "/communications/leads", label: "Potansiyel Müşteriler", permission: ["communications", "read"] as const },
  { href: "/communications/content", label: "İçerik & Marka", permission: ["communications", "read"] as const },
  { href: "/communications/integrations", label: "Entegrasyonlar", permission: ["communications", "read"] as const },
] as const;

export default function CommunicationsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const links = LINKS.filter((item) => hasPermission(item.permission[0], item.permission[1]));

  return (
    <div className="space-y-5">
      <div className="overflow-x-auto rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[0_8px_28px_rgba(17,70,104,0.03)]">
        <nav className="flex min-w-max gap-1" aria-label="Kurumsal İletişim">
          {links.map((item) => {
            const groupedPaths: Record<string, string[]> = {
              "/communications/content": ["/communications/content", "/communications/approvals", "/communications/brand", "/communications/assets", "/communications/vendors", "/communications/creators", "/communications/pr-media"],
              "/communications/integrations": ["/communications/integrations", "/communications/routing"],
            };
            const active = item.href === "/communications"
              ? pathname === item.href
              : (groupedPaths[item.href] ?? [item.href]).some((path) => pathname.startsWith(path));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  "rounded-[12px] px-4 py-2.5 text-[12px] font-semibold transition",
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
      </div>
      {children}
    </div>
  );
}
