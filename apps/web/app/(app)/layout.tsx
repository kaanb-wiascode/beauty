"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { ToastProvider } from "@/components/toast";

const SIDEBAR_LAYOUT_STYLE = `
  @media (min-width: 1024px) {
    /* The app shell owns the two-column layout. Let Dashboard use all released space. */
    body:has(aside[class*="w-[76px]"]) .ambient-root > * {
      width: 100% !important;
      max-width: none !important;
    }

    body:has(aside[class*="w-[76px]"]) .ambient-root {
      width: 100% !important;
      max-width: none !important;
    }

    /* Dashboard has a local max-width in its page markup; remove that only when collapsed. */
    body:has(aside[class*="w-[76px]"]) .ambient-root .dashboard-page,
    body:has(aside[class*="w-[76px]"]) .ambient-root .dashboard-page > *,
    body:has(aside[class*="w-[76px]"]) .ambient-root .dashboard-topbar,
    body:has(aside[class*="w-[76px]"]) .ambient-root .dashboard-hero {
      width: 100% !important;
      max-width: none !important;
    }

    /* If the page uses a generic centered wrapper, collapse that constraint too. */
    body:has(aside[class*="w-[76px]"]) main > .mx-auto {
      width: 100% !important;
      max-width: none !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
    }
  }
`;

export default function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ToastProvider>
      <AuthGuard>
        <AppShell>{children}</AppShell>
        <style dangerouslySetInnerHTML={{ __html: SIDEBAR_LAYOUT_STYLE }} />
      </AuthGuard>
    </ToastProvider>
  );
}
