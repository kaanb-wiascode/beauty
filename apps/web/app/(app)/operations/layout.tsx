"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const OPERATION_GROUPS = [
  {
    label: "Günlük Operasyon",
    items: [
      { href: "/operations", label: "Canlı Akış" },
      { href: "/operations/alerts", label: "Uyarılar" },
      { href: "/operations/waitlist", label: "Bekleme Listesi" },
      { href: "/operations/service-executions", label: "Hizmet İcraları" },
    ],
  },
  {
    label: "Randevu Süreçleri",
    items: [
      { href: "/operations/cancellations", label: "İptal ve Gelmeme" },
      { href: "/operations/rebooking", label: "Yeniden Randevu" },
      { href: "/operations/engagement", label: "Hatırlatma ve Onay" },
      { href: "/operations/journey", label: "Müşteri Yolculuğu" },
    ],
  },
  {
    label: "Kaynak ve Personel",
    items: [
      { href: "/operations/resources", label: "Kaynak ve Kapasite" },
      { href: "/operations/resource-calendar", label: "Kaynak Takvimi" },
      { href: "/operations/staff-availability", label: "Personel Uygunluğu" },
      { href: "/operations/staff-eligibility", label: "Görev Uygunluğu" },
      { href: "/operations/working-hours", label: "Çalışma Saatları" },
      { href: "/operations/utilization", label: "Kullanım Analizi" },
    ],
  },
  {
    label: "Kontrol ve Planlama",
    items: [
      { href: "/operations/checklists", label: "Hizmet Kontrol Listeleri" },
      { href: "/operations/branch-checklists", label: "Açılış ve Kapanış" },
      { href: "/operations/incidents", label: "Olaylar ve Kesintiler" },
      { href: "/operations/intelligence", label: "Operasyon İçgörüleri" },
      { href: "/operations/optimization", label: "Operasyon Önerileri" },
    ],
  },
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
        aria-label="Operasyon Merkezi çalışma alanları"
        className="mx-auto max-w-[1420px] rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-sm"
      >
        <div className="grid gap-3 xl:grid-cols-4">
          {OPERATION_GROUPS.map((group) => (
            <section key={group.label} className="rounded-[16px] bg-[var(--surface-2)]/55 p-2.5">
              <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.items.map((tab) => {
                  const active = isActive(pathname, tab.href);
                  return (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      aria-current={active ? "page" : undefined}
                      className={
                        active
                          ? "rounded-[11px] bg-[var(--accent-soft)] px-3 py-2 text-[11px] font-semibold text-[var(--accent)]"
                          : "rounded-[11px] bg-white/70 px-3 py-2 text-[11px] font-semibold text-[var(--muted)] transition-colors hover:bg-white hover:text-[var(--ink)]"
                      }
                    >
                      {tab.label}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </nav>
      {children}
    </div>
  );
}
