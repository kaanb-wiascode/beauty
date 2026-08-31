"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { ToastProvider } from "@/components/toast";

const SIDEBAR_LAYOUT_STYLE = `
  @media (min-width: 1024px) {
    body:has(aside[class*="w-[76px]"]) .ambient-root > * {
      width: 100%;
      max-width: none !important;
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
