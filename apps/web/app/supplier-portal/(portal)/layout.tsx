"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { supplierPortalApi } from "@/lib/supplier-portal-api";
import {
  clearSupplierPortalSession,
  getSupplierPortalSession,
  type SupplierPortalSession,
} from "@/lib/supplier-portal-auth";

export default function SupplierPortalLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<SupplierPortalSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const current = getSupplierPortalSession();
    if (!current) {
      router.replace("/supplier-portal/login");
      return;
    }

    setSession(current);
    void supplierPortalApi("/supplier-portal/auth/me")
      .then(() => setReady(true))
      .catch(() => setReady(false));
  }, [router]);

  function logout() {
    clearSupplierPortalSession();
    router.replace("/supplier-portal/login");
  }

  if (!session || !ready) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f6f8fb] text-[13px] text-[#667482]">Tedarikçi portalı hazırlanıyor...</div>;
  }

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-[#17212b]">
      <header className="border-b border-[#dfe7ed] bg-white">
        <div className="mx-auto flex min-h-[72px] max-w-[1380px] flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <div className="flex items-center gap-5">
            <Link href="/supplier-portal/rfqs" className="flex items-center gap-2.5 text-[16px] font-semibold tracking-[-0.02em]">
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#1674bd] text-[12px] font-semibold text-white">V</span>
              VALOO Supplier
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              <Link href="/supplier-portal/rfqs" className="rounded-[10px] px-3 py-2 text-[12px] font-semibold text-[#4f5d69] hover:bg-[#f0f4f7] hover:text-[#17212b]">RFQ ve teklifler</Link>
              <Link href="/supplier-portal/offers" className="rounded-[10px] px-3 py-2 text-[12px] font-semibold text-[#4f5d69] hover:bg-[#f0f4f7] hover:text-[#17212b]">Katalog teklifleri</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[12px] font-semibold">{session.supplierOrganization.displayName}</p>
              <p className="text-[10px] text-[#7a8792]">{session.membership.role} · {session.supplierOrganization.verificationStatus}</p>
            </div>
            <button type="button" onClick={logout} className="rounded-[10px] border border-[#dfe7ed] bg-white px-3 py-2 text-[11px] font-semibold text-[#667482] hover:text-[#17212b]">Çıkış</button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1380px] gap-2 overflow-x-auto border-t border-[#eef2f5] px-5 py-2 md:hidden sm:px-8">
          <Link href="/supplier-portal/rfqs" className="whitespace-nowrap rounded-[10px] px-3 py-2 text-[12px] font-semibold text-[#4f5d69] hover:bg-[#f0f4f7]">RFQ ve teklifler</Link>
          <Link href="/supplier-portal/offers" className="whitespace-nowrap rounded-[10px] px-3 py-2 text-[12px] font-semibold text-[#4f5d69] hover:bg-[#f0f4f7]">Katalog teklifleri</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-[1380px] px-5 py-7 sm:px-8">{children}</main>
    </div>
  );
}
