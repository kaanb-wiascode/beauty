"use client";

import Link from "next/link";

const sections = [
  {
    href: "/settings/roles",
    title: "Roller ve Yetkiler",
    description: "Ekibinizin erişim seviyelerini, rollerini ve sistem yetkilerini yönetin.",
    glyph: "◇",
  },
];

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-[1240px] space-y-6 pb-10">
      <header className="border-b border-[var(--line)] pb-5">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          YÖNETİM
        </div>
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">
          Ayarlar
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Beauty ERP çalışma alanınızı ve ekip erişimini yönetin.
        </p>
      </header>

      <section aria-labelledby="settings-sections" className="space-y-3">
        <div>
          <h2 id="settings-sections" className="text-sm font-semibold text-[var(--ink)]">
            Yönetim araçları
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Kullanmak istediğiniz ayar alanını seçin.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:shadow-[var(--shadow-lift)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--accent-soft)] text-lg text-[var(--accent)]">
                {section.glyph}
              </span>
              <h3 className="mt-4 text-sm font-semibold text-[var(--ink)]">
                {section.title}
              </h3>
              <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">
                {section.description}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)]">
                Aç
                <span aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
