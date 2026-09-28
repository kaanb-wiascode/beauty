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
    ],
  },
  {
    label: "Hizmet ve Tahsilat",
    items: [
      { href: "/operations/service-executions", label: "Hizmet İcraları" },
      { href: "/operations/sessions", label: "Seans Yönetimi" },
      { href: "/operations/sales", label: "Satış ve Tahsilat" },
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
      { href: "/operations/working-hours", label: "Çalışma Saatleri" },
      { href: "/operations/utilization", label: "Kullanım Analizi" },
    ],
  },
  {
    label: "Kontrol ve Planlama",
    items: [
      { href: "/operations/checklists", label: "Hizmet Kontrol Listeleri" },
      { href: "/operations/branch-checklists", label: "Açılış ve Kapanış" },
      { href: "/operations/incidents", label: "Olaylar ve Kesintiler" },
      { href: "/operations/insights", label: "İçgörü ve Öneriler" },
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
        className="mx-auto max-w-[1480px] overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_8px_28px_rgba(20,52,74,.045)]"
      >
        <div className="overflow-x-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max items-stretch gap-1">
            {OPERATION_GROUPS.map((group, groupIndex) => (
              <section key={group.label} className="flex items-center gap-1">
                {groupIndex > 0 ? <span className="mx-1 h-6 w-px bg-[var(--line)]" aria-hidden="true" /> : null}
                <div className="flex items-center gap-1">
                  <span className="px-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-[var(--muted-soft)]">
                    {group.label}
                  </span>
                  {group.items.map((tab) => {
                    const active = isActive(pathname, tab.href);
                    return (
                      <Link
                        key={tab.href}
                        href={tab.href}
                        aria-current={active ? "page" : undefined}
                        className={`relative rounded-[11px] px-3 py-2 text-[10px] font-semibold transition ${
                          active
                            ? "bg-[var(--accent-soft)] text-[var(--accent)] shadow-[inset_0_0_0_1px_rgba(30,116,189,.10)]"
                            : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                        }`}
                      >
                        {tab.label}
                        {active ? <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-[var(--accent)]" /> : null}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
