"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { hasPermission } from "@/lib/auth";
import { cx } from "@/lib/format";

const PRIMARY_LINKS = [
  { href: "/communications", label: "Genel Bakış" },
  { href: "/communications/campaigns", label: "Kampanyalar" },
  { href: "/communications/content", label: "İçerik & Onay" },
  { href: "/communications/brand", label: "Marka" },
  { href: "/communications/pr-media", label: "PR & Medya" },
  { href: "/communications/vendors", label: "İş Birlikleri" },
  { href: "/communications/leads", label: "Talepler" },
  { href: "/communications/integrations", label: "Bağlantılar" },
] as const;

const GROUPS: Record<string, string[]> = {
  "/communications/content": [
    "/communications/content",
    "/communications/approvals",
  ],
  "/communications/brand": [
    "/communications/brand",
    "/communications/assets",
  ],
  "/communications/vendors": [
    "/communications/vendors",
    "/communications/creators",
  ],
  "/communications/leads": [
    "/communications/leads",
    "/communications/routing",
  ],
};

const SECONDARY_GROUPS = [
  {
    matches: ["/communications/content", "/communications/approvals"],
    label: "İçerik Operasyonu",
    links: [
      { href: "/communications/content", label: "İçerikler" },
      { href: "/communications/approvals", label: "Onay Merkezi" },
    ],
  },
  {
    matches: ["/communications/brand", "/communications/assets"],
    label: "Marka Yönetimi",
    links: [
      { href: "/communications/brand", label: "Marka Kuralları" },
      { href: "/communications/assets", label: "Varlık Kütüphanesi" },
    ],
  },
  {
    matches: ["/communications/vendors", "/communications/creators"],
    label: "Dış İş Birlikleri",
    links: [
      { href: "/communications/vendors", label: "Ajanslar & İş Ortakları" },
      { href: "/communications/creators", label: "İçerik Üreticileri" },
    ],
  },
  {
    matches: ["/communications/leads", "/communications/routing"],
    label: "Talep Yönetimi",
    links: [
      { href: "/communications/leads", label: "Potansiyel Müşteriler" },
      { href: "/communications/routing", label: "Talep Dağıtımı" },
    ],
  },
] as const;

export default function CommunicationsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const canRead = hasPermission("communications", "read");
  const links = canRead ? PRIMARY_LINKS : [];

  const secondary = SECONDARY_GROUPS.find((group) =>
    group.matches.some(
      (path) => pathname === path || pathname.startsWith(path + "/"),
    ),
  );

  return (
    <div className="space-y-5">
      <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[var(--shadow-soft)]">
        <div className="overflow-x-auto">
          <nav className="flex min-w-max gap-1" aria-label="Kurumsal İletişim">
            {links.map((item) => {
              const paths = GROUPS[item.href] ?? [item.href];
              const active =
                item.href === "/communications"
                  ? pathname === item.href
                  : paths.some(
                      (path) =>
                        pathname === path || pathname.startsWith(path + "/"),
                    );

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cx(
                    "rounded-[12px] px-3.5 py-2.5 text-[11px] font-semibold transition",
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

        {secondary ? (
          <div className="mt-2 border-t border-[var(--line)] px-1 pt-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="px-2 text-[8px] font-semibold uppercase tracking-[.14em] text-[var(--muted-soft)]">
                {secondary.label}
              </span>
              <nav
                className="flex min-w-0 flex-wrap gap-1"
                aria-label="Kurumsal İletişim Alt Bölümleri"
              >
                {secondary.links.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cx(
                        "rounded-[9px] px-3 py-1.5 text-[9px] font-semibold transition",
                        active
                          ? "bg-[var(--surface-2)] text-[var(--ink)]"
                          : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        ) : null}
      </div>

      {children}
    </div>
  );
}
