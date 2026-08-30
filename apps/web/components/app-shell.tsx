"use client";

import Link from "next/link";

import { usePathname, useRouter } from "next/navigation";

import { useState, type ReactNode } from "react";

import { api } from "@/lib/api";

import {

  clearSession,

  getRefreshToken,

  getStoredTenant,

  getStoredUser,
  hasPermission,

} from "@/lib/auth";

import { cx, fullName } from "@/lib/format";

import { IconButton } from "./ui";

const NAV = [

  {

    href: "/dashboard",

    label: "Bugün",

    icon: HomeIcon,

  },

  {

    href: "/customers",

    permission: "customers.read",
    label: "Müşteriler",

    icon: PeopleIcon,

  },

  {

    href: "/staff",

    permission: "staff.read",
    label: "Personel",

    icon: StaffIcon,

  },

  {

    href: "/services",

    permission: "services.read",
    label: "Hizmetler",

    icon: SparkleIcon,

  },

  {

    href: "/appointments",

    permission: "appointments.read",
    label: "Randevular",

    icon: CalendarIcon,

  },
  {
    href: "/payments",
    permission: "payments.read",
    label: "Ödemeler",
    icon: PaymentIcon,
  },
  {
    href: "/reports",
    permission: "reports.read",
    label: "Raporlar",
    icon: PaymentIcon,
  },
  {
    href: "/settings/roles",
    permission: "roles.read",
    label: "Roller & Yetkiler",
    icon: StaffIcon,
  },
  {
    href: "/reports/payments",
    permission: "payments.read",
    label: "Kasa",
    icon: PaymentIcon,
  },
  {
    href: "/reports/staff",
    permission: "reports.read",
    label: "Personel Performansı",
    icon: StaffIcon,
  },
  {
    href: "/reports/services",
    permission: "reports.read",
    label: "Hizmet Performansı",
    icon: SparkleIcon,
  },

] as const;

function NavLinks({

  pathname,

  onNavigate,

  compact = false,

}: {

  pathname: string;

  onNavigate?: () => void;

  compact?: boolean;

}) {

  return (

    <nav

      aria-label="Ana navigasyon"

      className={cx(

        compact

          ? "grid grid-cols-8 gap-1 px-2 py-1"

          : "flex flex-1 flex-col gap-1 px-3 py-4",

      )}

    >

      {NAV.filter((item) => {
          if (!("permission" in item)) return true;
          const [resource, action] = item.permission.split(".");
          return hasPermission(resource, action);
        }).map((item) => {

        const active =

          pathname === item.href ||

          (item.href !== "/dashboard" &&

            pathname.startsWith(`${item.href}/`));

        const Icon = item.icon;

        return (

          <Link

            key={item.href}

            href={item.href}

            onClick={onNavigate}

            aria-current={active ? "page" : undefined}

            className={cx(

              "group relative flex items-center transition-[background-color,color,transform] duration-[180ms] [transition-timing-function:var(--ease-out)]",

              compact

                ? "flex-col gap-1 rounded-[18px] px-1 py-2.5 text-[11px]"

                : "gap-3 rounded-[16px] px-3.5 py-3 text-[14px]",

              active

                ? compact

                  ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"

                  : "bg-white/60 font-medium text-[var(--ink)] shadow-[inset_0_0_0_1px_var(--line)]"

                : "text-[var(--muted)] hover:bg-black/[0.035] hover:text-[var(--ink)]",

            )}

          >

            <span

              className={cx(

                "flex shrink-0 items-center justify-center transition-transform duration-[180ms]",

                active && "scale-[1.03]",

              )}

            >

              <Icon />

            </span>

            <span

              className={cx(

                compact

                  ? "max-w-full truncate"

                  : "truncate",

              )}

            >

              {item.label}

            </span>

            {!compact && active ? (

              <span

                aria-hidden="true"

                className="absolute left-0 h-5 w-0.5 rounded-full bg-[var(--accent)]"

              />

            ) : null}

          </Link>

        );

      })}

    </nav>

  );

}


function MobileNav({ pathname }: { pathname: string }) {
  const [moreOpen, setMoreOpen] = useState(false);

  const visibleItems = NAV.filter((item) => {
    if (!("permission" in item)) return true;

    const [resource, action] = item.permission.split(".");
    return hasPermission(resource, action);
  });

  const primaryHrefs = [
    "/dashboard",
    "/customers",
    "/appointments",
    "/payments",
  ];

  const primaryItems = visibleItems.filter((item) =>
    primaryHrefs.includes(item.href),
  );

  const moreItems = visibleItems.filter(
    (item) => !primaryHrefs.includes(item.href),
  );

  const moreActive = moreItems.some(
    (item) =>
      pathname === item.href ||
      (item.href !== "/dashboard" &&
        pathname.startsWith(`${item.href}/`)),
  );

  return (
    <div className="relative">
      {moreOpen ? (
        <div className="absolute bottom-[calc(100%+10px)] left-1/2 z-40 w-[calc(100%-8px)] -translate-x-1/2 rounded-[22px] border border-white/60 bg-[rgba(255,252,249,0.92)] p-2 shadow-[0_18px_50px_rgba(28,25,23,0.16)] backdrop-blur-2xl backdrop-saturate-150">
          <nav
            aria-label="Diğer sayfalar"
            className="grid grid-cols-2 gap-1.5"
          >
            {moreItems.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" &&
                  pathname.startsWith(`${item.href}/`));

              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex min-w-0 items-center gap-2 rounded-[14px] px-3 py-3 text-[13px] transition-colors",
                    active
                      ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                      : "text-[var(--muted)] hover:bg-black/[0.04] hover:text-[var(--ink)]",
                  )}
                >
                  <span className="shrink-0">
                    <Icon />
                  </span>
                  <span className="min-w-0 truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      ) : null}

      <nav
        aria-label="Mobil ana navigasyon"
        className="grid grid-cols-5 gap-1 px-1 py-1"
      >
        {primaryItems.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" &&
              pathname.startsWith(`${item.href}/`));

          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex min-w-0 flex-col items-center justify-center gap-1 rounded-[16px] px-1 py-2.5 text-[11px] transition-colors",
                active
                  ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                  : "text-[var(--muted)] hover:bg-black/[0.04] hover:text-[var(--ink)]",
              )}
            >
              <span className="shrink-0">
                <Icon />
              </span>
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreOpen((current) => !current)}
          aria-expanded={moreOpen}
          aria-label="Diğer menü seçenekleri"
          className={cx(
            "flex min-w-0 flex-col items-center justify-center gap-1 rounded-[16px] px-1 py-2.5 text-[11px] transition-colors",
            moreOpen || moreActive
              ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
              : "text-[var(--muted)] hover:bg-black/[0.04] hover:text-[var(--ink)]",
          )}
        >
          <span className="text-[15px] leading-none tracking-[0.12em]">
            •••
          </span>
          <span>Daha</span>
        </button>
      </nav>
    </div>
  );
}

export function AppShell({

  children,

}: {

  children: ReactNode;

}) {

  const pathname = usePathname();

  const router = useRouter();

  const [loggingOut, setLoggingOut] = useState(false);

  const user = getStoredUser();

  const tenant = getStoredTenant();

  async function logout() {

    setLoggingOut(true);

    const refreshToken = getRefreshToken();

    try {

      if (refreshToken) {

        await api("/auth/logout", {

          method: "POST",

          body: { refreshToken },

          auth: false,

        });

      }

    } catch {

// Session is cleared locally even if logout request fails.

    } finally {

      clearSession();

      router.replace("/login");

    }

  }

  return (

    <div className="relative min-h-screen lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6 lg:p-4">

      {/* Desktop sidebar */}

      <aside className="glass sticky top-4 hidden h-[calc(100vh-32px)] flex-col overflow-hidden rounded-[28px] lg:flex">

        <div className="px-5 pb-5 pt-6">

          <div className="flex items-center gap-3">

            <BrandMark />

            <div className="min-w-0">

              <div className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)]">

                Beauty ERP

              </div>

              <div className="mt-0.5 truncate text-[12px] text-[var(--muted)]">

                {tenant?.name ?? "Salon yönetimi"}

              </div>

            </div>

          </div>

        </div>

        <div className="px-5 pb-2">

          <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">

            Yönetim

          </p>

        </div>

        <NavLinks pathname={pathname} />

        <div className="mt-auto p-4">

          <div className="border-t border-[var(--line)] pt-4">

            {user ? (

              <div className="mb-2 flex items-center gap-3 rounded-[16px] px-3 py-2.5">

                <div

                  aria-hidden="true"

                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[11px] font-semibold text-white"

                >

                  {getInitials(user.firstName, user.lastName)}

                </div>

                <div className="min-w-0">

                  <p className="truncate text-[13px] font-medium text-[var(--ink)]">

                    {fullName(user.firstName, user.lastName)}

                  </p>

                  <p className="truncate text-[11px] text-[var(--muted)]">

                    {tenant?.name ?? "Salon"}

                  </p>

                </div>

              </div>

            ) : null}

            <button

              type="button"

              onClick={() => void logout()}

              disabled={loggingOut}

              aria-busy={loggingOut}

              className="w-full rounded-[16px] px-3.5 py-2.5 text-left text-[13px] text-[var(--muted)] transition-[background-color,color,opacity] duration-[180ms] hover:bg-black/[0.04] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]"

            >

              {loggingOut ? "Çıkış yapılıyor..." : "Çıkış yap"}

            </button>

          </div>

        </div>

      </aside>

      {/* Main application area */}

      <div className="relative flex min-w-0 flex-col">

        {/* Mobile header */}

        <header className="glass sticky top-0 z-30 flex items-center justify-between rounded-b-[22px] px-4 py-3 lg:hidden">

          <div className="flex min-w-0 items-center gap-2.5">

            <BrandMark />

            <div className="min-w-0">

              <p className="truncate text-[14px] font-semibold tracking-[-0.02em] text-[var(--ink)]">

                Beauty ERP

              </p>

              {tenant?.name ? (

                <p className="truncate text-[10px] text-[var(--muted)]">

                  {tenant.name}

                </p>

              ) : null}

            </div>

          </div>

          <IconButton

            type="button"

            aria-label="Çıkış yap"

            title="Çıkış yap"

            disabled={loggingOut}

            aria-busy={loggingOut}

            onClick={() => void logout()}

          >

            <LogoutIcon />

          </IconButton>

        </header>

        <main className="ambient-root flex-1 px-4 py-6 pb-28 sm:px-6 sm:py-8 lg:px-4 lg:py-6 lg:pb-6">

          {children}

        </main>

        {/* Mobile navigation */}

        <div className="glass-elevated safe-area-bottom fixed inset-x-3 bottom-3 z-30 rounded-[24px] px-1 pt-1 lg:hidden">

          <MobileNav pathname={pathname} />

        </div>

      </div>

    </div>

  );

}

function getInitials(

  firstName: string,

  lastName: string,

) {

  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

}

function BrandMark() {

  return (

    <div

      aria-hidden="true"

      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-[var(--ink)] text-[13px] font-semibold text-white shadow-[0_4px_12px_rgba(28,25,23,0.12)]"

    >

      B

    </div>

  );

}

function HomeIcon() {

  return (

    <svg

      width="18"

      height="18"

      viewBox="0 0 24 24"

      fill="none"

      aria-hidden="true"

    >

      <path

        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"

        stroke="currentColor"

        strokeWidth="1.6"

        strokeLinejoin="round"

      />

    </svg>

  );

}

function PeopleIcon() {

  return (

    <svg

      width="18"

      height="18"

      viewBox="0 0 24 24"

      fill="none"

      aria-hidden="true"

    >

      <circle

        cx="9"

        cy="8"

        r="3"

        stroke="currentColor"

        strokeWidth="1.6"

      />

      <path

        d="M4 19a5 5 0 0 1 10 0"

        stroke="currentColor"

        strokeWidth="1.6"

        strokeLinecap="round"

      />

      <circle

        cx="17"

        cy="9"

        r="2.2"

        stroke="currentColor"

        strokeWidth="1.6"

      />

      <path

        d="M16 19a4 4 0 0 1 5-3.7"

        stroke="currentColor"

        strokeWidth="1.6"

        strokeLinecap="round"

      />

    </svg>

  );

}

function StaffIcon() {

  return (

    <svg

      width="18"

      height="18"

      viewBox="0 0 24 24"

      fill="none"

      aria-hidden="true"

    >

      <circle

        cx="12"

        cy="8"

        r="3"

        stroke="currentColor"

        strokeWidth="1.6"

      />

      <path

        d="M5 19a7 7 0 0 1 14 0"

        stroke="currentColor"

        strokeWidth="1.6"

        strokeLinecap="round"

      />

    </svg>

  );

}

function SparkleIcon() {

  return (

    <svg

      width="18"

      height="18"

      viewBox="0 0 24 24"

      fill="none"

      aria-hidden="true"

    >

      <path

        d="M12 4.5 13.4 9l4.6 1.4L13.4 12 12 16.5 10.6 12 6 10.4 10.6 9 12 4.5Z"

        stroke="currentColor"

        strokeWidth="1.6"

        strokeLinejoin="round"

      />

    </svg>

  );

}

function CalendarIcon() {

  return (

    <svg

      width="18"

      height="18"

      viewBox="0 0 24 24"

      fill="none"

      aria-hidden="true"

    >

      <rect

        x="4"

        y="6"

        width="16"

        height="14"

        rx="2.5"

        stroke="currentColor"

        strokeWidth="1.6"

      />

      <path

        d="M8 4v3M16 4v3M4 10h16"

        stroke="currentColor"

        strokeWidth="1.6"

        strokeLinecap="round"

      />

    </svg>

  );

}

function PaymentIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M3 9h18M7 14h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LogoutIcon() {

  return (

    <svg

      width="18"

      height="18"

      viewBox="0 0 24 24"

      fill="none"

      aria-hidden="true"

    >

      <path

        d="M10 7V5a1 1 0 0 1 1-1h8v16h-8a1 1 0 0 1-1-1v-2"

        stroke="currentColor"

        strokeWidth="1.6"

        strokeLinecap="round"

      />

      <path

        d="M4 12h10M11 9l3 3-3 3"

        stroke="currentColor"

        strokeWidth="1.6"

        strokeLinecap="round"

        strokeLinejoin="round"

      />

    </svg>

  );

}
