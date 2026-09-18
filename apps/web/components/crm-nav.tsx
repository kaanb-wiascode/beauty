"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/format";

const links = [
  { href: "/crm", label: "Genel Bakış", exact: true },
  { href: "/crm/leads", label: "Lead Havuzu" },
  { href: "/crm/pipeline", label: "Satış Pipeline" },
  { href: "/crm/follow-ups", label: "Takip Ajandası" },
] as const;

export function CrmNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="CRM bölümleri" className="flex gap-1 overflow-x-auto rounded-[16px] border border-[var(--line)] bg-white/70 p-1.5 shadow-[var(--shadow-soft)]">
      {links.map((link) => {
        const active = "exact" in link && link.exact ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "whitespace-nowrap rounded-[11px] px-3.5 py-2 text-[12px] font-medium transition-colors",
              active
                ? "bg-[#eee9ff] text-[#7052df] shadow-[inset_0_0_0_1px_rgba(112,82,223,.08)]"
                : "text-[var(--muted)] hover:bg-black/[0.035] hover:text-[var(--ink)]",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
