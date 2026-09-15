"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { hasPermission } from "@/lib/auth";
import { cx } from "@/lib/format";

const ITEMS = [
  { href: "/training", label: "Genel Bakış", permission: "read" },
  { href: "/training/my-learning", label: "Eğitimlerim", permission: "read" },
  { href: "/training/courses", label: "Kurslar", permission: "read" },
  { href: "/training/authoring", label: "Kurs Yazarlığı", permission: "manage" },
  { href: "/training/assignments", label: "Atamalar", permission: "read" },
  { href: "/training/staff", label: "Personel Gelişimi", permission: "read" },
  { href: "/training/question-bank", label: "Soru Bankası", permission: "manage" },
  { href: "/training/analytics", label: "Analitik", permission: "read" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/training") return pathname === href;
  if (href === "/training/courses") return pathname === href || (pathname.startsWith(`${href}/`) && !pathname.startsWith("/training/authoring"));
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function TrainingLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const visibleItems = ITEMS.filter((item) => hasPermission("training", item.permission));

  return (
    <div className="space-y-5">
      <nav
        aria-label="Eğitim ve gelişim navigasyonu"
        className="overflow-x-auto rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-1.5"
      >
        <div className="flex min-w-max gap-1">
          {visibleItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "rounded-[13px] px-3.5 py-2 text-[12px] font-medium transition-colors",
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
      {children}
    </div>
  );
}
