"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { ToastProvider } from "@/components/toast";
import "./beauty-final-consistency.css";
import "./dashboard/sidebar-responsive.css";
import "./dashboard/dashboard-beauty.css";

export default function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ToastProvider>
      <AuthGuard>
        <AppShell>{children}</AppShell>
      </AuthGuard>
    </ToastProvider>
  );
}
