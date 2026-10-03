import Link from "next/link";
import type { ReactNode } from "react";

import "./services-beauty.css";

export default function ServicesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <nav
        aria-label="Hizmet yönetimi"
        className="mx-auto flex max-w-[1440px] flex-wrap gap-2 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-2"
      >
        <Link
          href="/services"
          aria-current="page"
          className="rounded-[12px] bg-[var(--accent-soft)] px-4 py-2 text-[12px] font-semibold text-[var(--accent)]"
        >
          Hizmetler
        </Link>
        <Link
          href="/marketplace"
          className="rounded-[12px] px-4 py-2 text-[12px] font-semibold text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
        >
          Pazar Yeri Yayını
        </Link>
      </nav>
      {children}
    </div>
  );
}
