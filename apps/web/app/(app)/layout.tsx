"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { ToastProvider } from "@/components/toast";
import "./dashboard/sidebar-responsive.css";

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
