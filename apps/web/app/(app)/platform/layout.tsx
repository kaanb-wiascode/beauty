import Link from "next/link";
import type { ReactNode } from "react";

export default function PlatformLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <nav className="mx-auto flex max-w-[1480px] flex-wrap gap-2 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-2">
        <Link href="/platform/suppliers" className="rounded-[12px] px-4 py-2 text-[12px] font-semibold text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--ink)]">
          Tedarikçi organizasyonları
        </Link>
        <Link href="/platform/catalog" className="rounded-[12px] px-4 py-2 text-[12px] font-semibold text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--ink)]">
          Canonical katalog
        </Link>
      </nav>
      {children}
    </div>
  );
}
