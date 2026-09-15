"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navigation = [
  { href: "/platform", label: "Command Center", eyebrow: "Overview" },
  { href: "/platform/customers", label: "Customers", eyebrow: "Tenants" },
  { href: "/platform/iam", label: "Platform IAM", eyebrow: "Access" },
  { href: "/platform/audit", label: "Audit Explorer", eyebrow: "Security" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/platform") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PlatformShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#070912] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(109,94,252,.18),transparent_34%),radial-gradient(circle_at_85%_15%,rgba(48,169,255,.12),transparent_28%)]" />
      <div className="relative mx-auto grid min-h-screen max-w-[1680px] lg:grid-cols-[280px_1fr]">
        <aside className="border-b border-white/10 bg-black/20 px-5 py-5 backdrop-blur-2xl lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-6 lg:py-7">
          <div className="flex items-center justify-between gap-4 lg:block">
            <div>
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl border border-white/15 bg-white/10 text-sm font-semibold shadow-[0_0_40px_rgba(109,94,252,.18)]">
                  V
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[.22em] text-violet-300">
                    VALOO
                  </p>
                  <h1 className="mt-0.5 text-sm font-semibold tracking-tight text-white">
                    Platform Control Plane
                  </h1>
                </div>
              </div>
              <p className="mt-4 hidden max-w-[220px] text-xs leading-5 text-white/45 lg:block">
                Tenant operasyonlarından ayrılmış sağlayıcı yönetim yüzeyi.
              </p>
            </div>
            <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-emerald-300 lg:mt-5 lg:inline-flex">
              Control plane
            </div>
          </div>

          <nav className="mt-5 grid grid-cols-2 gap-2 lg:mt-10 lg:grid-cols-1">
            {navigation.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-2xl border px-4 py-3.5 transition ${
                    active
                      ? "border-violet-400/30 bg-violet-400/12 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]"
                      : "border-transparent bg-white/[.025] hover:border-white/10 hover:bg-white/[.05]"
                  }`}
                >
                  <span className="block text-[9px] font-semibold uppercase tracking-[.16em] text-white/35">
                    {item.eyebrow}
                  </span>
                  <span className={`mt-1 block text-sm font-medium ${active ? "text-white" : "text-white/70"}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 hidden rounded-2xl border border-amber-300/15 bg-amber-300/[.06] p-4 lg:block">
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-amber-200/80">
              Güvenlik sınırı
            </p>
            <p className="mt-2 text-[11px] leading-5 text-white/45">
              Bu yüzey tenant rol ve izinlerinden bağımsız platform IAM ile korunur.
            </p>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-10 lg:py-8 xl:px-12">
          {children}
        </main>
      </div>
    </div>
  );
}
