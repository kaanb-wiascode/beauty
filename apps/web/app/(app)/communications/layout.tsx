"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { hasPermission } from "@/lib/auth";
import { cx } from "@/lib/format";

const CONTENT_LINKS = [
  { href: "/communications/content", label: "İçerikler" },
  { href: "/communications/approvals", label: "Onaylar" },
  { href: "/communications/brand", label: "Marka" },
  { href: "/communications/assets", label: "Varlık Kütüphanesi" },
  { href: "/communications/pr-media", label: "Basın & Medya" },
  { href: "/communications/vendors", label: "İş Ortakları" },
  { href: "/communications/creators", label: "İçerik Üreticileri" },
] as const;

const INTEGRATION_LINKS = [
  { href: "/communications/integrations", label: "Bağlantılar" },
  { href: "/communications/routing", label: "Talep Yönlendirme" },
] as const;

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

  const secondaryLinks = pathname.startsWith("/communications/content") ||
    pathname.startsWith("/communications/approvals") ||
    pathname.startsWith("/communications/brand") ||
    pathname.startsWith("/communications/assets") ||
    pathname.startsWith("/communications/pr-media") ||
    pathname.startsWith("/communications/vendors") ||
    pathname.startsWith("/communications/creators")
      ? CONTENT_LINKS
      : pathname.startsWith("/communications/integrations") || pathname.startsWith("/communications/routing")
        ? INTEGRATION_LINKS
        : [];

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
      {secondaryLinks.length ? (
        <div className="overflow-x-auto">
          <nav className="flex min-w-max gap-2" aria-label="Kurumsal İletişim Alt Bölümleri">
            {secondaryLinks.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cx(
                    "rounded-full border px-3.5 py-2 text-[11px] font-semibold transition",
                    active
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)]",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      ) : null}
      {children}
    </div>
  );
}
