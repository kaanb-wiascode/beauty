import Link from "next/link";
import type { ReactNode } from "react";

export default function PurchasesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <nav className="mx-auto flex max-w-[1440px] flex-wrap gap-2 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-2">
        <Link
          href="/inventory/purchases"
          className="rounded-[12px] px-4 py-2 text-[12px] font-semibold text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
        >
          Talep ve siparişler
        </Link>
        <Link
          href="/inventory/purchases/operations"
          className="rounded-[12px] px-4 py-2 text-[12px] font-semibold text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
        >
          Mal kabul ve iadeler
        </Link>
        <Link
          href="/inventory/purchases/replacements"
          className="rounded-[12px] px-4 py-2 text-[12px] font-semibold text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
        >
          Değişim talepleri
        </Link>
      </nav>
      {children}
    </div>
  );
}
