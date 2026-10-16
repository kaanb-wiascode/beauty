"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const PRIMARY_NAV = [
  ["Genel Bakış", "/crm"],
  ["Potansiyel Müşteriler", "/crm/leads"],
  ["Satış Süreci", "/crm/pipeline"],
  ["Takipler", "/crm/follow-ups"],
  ["Mesajlar", "/crm/conversations"],
] as const;

const MORE_NAV = [
  ["Gelen Kutusu", "/crm/inbox"],
  ["İletişim Geçmişi", "/crm/communications"],
  ["Yanıt Süreleri", "/crm/conversations/analytics"],
  ["E-posta Bağlantısı", "/crm/communications/email"],
  ["İletişim İzinleri", "/crm/compliance"],
  ["Hatırlatmalar", "/crm/reminders"],
  ["Otomasyonlar", "/crm/automations"],
  ["Mesaj Otomasyonları", "/crm/automations/messages"],
  ["Aksiyon Merkezi", "/crm/actions?view=overdue"],
  ["Raporlar", "/crm/reports"],
  ["Ayarlar", "/crm/settings"],
] as const;

function activeFor(pathname:string,href:string){
  if(href==="/crm")return pathname==="/crm";
  const clean=href.split("?")[0];
  return pathname===clean||pathname.startsWith(clean+"/");
}

export default function CrmLayout({ children }: { children: ReactNode }) {
  const pathname=usePathname();

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <div className="mb-5 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[var(--shadow-soft)] lg:mb-6">
        <div className="flex items-center gap-2 overflow-x-auto">
          <nav aria-label="Müşteri ve satış ana menüsü" className="flex min-w-0 flex-1 items-center gap-1">
            {PRIMARY_NAV.map(([label,href])=>{
              const active=activeFor(pathname,href);
              return <Link
                key={href}
                href={href}
                className={`shrink-0 rounded-[11px] px-3.5 py-2.5 text-[11px] font-semibold transition ${active?"bg-[var(--accent-soft)] text-[var(--accent)]":"text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"}`}
              >{label}</Link>;
            })}
          </nav>

          <details className="group relative shrink-0">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-[11px] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2.5 text-[11px] font-semibold text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--ink)]">
              Diğer
              <span className="text-[12px] transition group-open:rotate-180">⌄</span>
            </summary>
            <div className="absolute right-0 z-50 mt-2 grid w-[340px] grid-cols-2 gap-1 rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[0_18px_48px_rgba(23,35,28,.14)]">
              {MORE_NAV.map(([label,href])=>{
                const active=activeFor(pathname,href);
                return <Link
                  key={href}
                  href={href}
                  className={`rounded-[10px] px-3 py-2.5 text-[10px] font-medium transition ${active?"bg-[var(--accent-soft)] text-[var(--accent)]":"text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"}`}
                >{label}</Link>;
              })}
            </div>
          </details>
        </div>
      </div>
      {children}
    </div>
  );
}
