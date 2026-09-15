import Link from "next/link";
import type { ReactNode } from "react";

const CRM_NAV = [
  ["Genel Bakış", "/crm"],
  ["Potansiyel Müşteriler", "/crm/leads"],
  ["Lead Yönlendirme", "/crm/routing"],
  ["Satış Süreci", "/crm/pipeline"],
  ["Takipler", "/crm/follow-ups"],
  ["Birleşik Inbox", "/crm/conversations"],
  ["Inbox SLA", "/crm/conversations/analytics"],
  ["İletişim", "/crm/communications"],
  ["E-posta Provider", "/crm/communications/email"],
  ["Inbound Inbox", "/crm/inbox"],
  ["İletişim İzinleri", "/crm/compliance"],
  ["Hatırlatmalar", "/crm/reminders"],
  ["Otomasyonlar", "/crm/automations"],
  ["Mesaj Otomasyonları", "/crm/automations/messages"],
  ["Aksiyon Merkezi", "/crm/actions?view=overdue"],
] as const;

export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <nav aria-label="CRM hızlı erişim" className="mb-5 flex gap-2 overflow-x-auto pb-1 lg:mb-6">
        {CRM_NAV.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className="shrink-0 rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-[10px] font-semibold text-[var(--muted)] shadow-[var(--shadow-soft)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
