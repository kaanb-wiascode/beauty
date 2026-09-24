"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { MobileContextSwitcher } from "@/components/mobile-context-switcher";
import { MobileNav } from "@/components/mobile-nav";
import { ToastProvider } from "@/components/toast";
import "./beauty-final-consistency.css";
import "./dashboard/sidebar-responsive.css";
import "./dashboard/dashboard-shell-fix.css";

export default function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ToastProvider>
      <AuthGuard>
        <AppShell>{children}</AppShell>
        <MobileContextSwitcher />
        <MobileNav />
      </AuthGuard>
    </ToastProvider>
  );
}
