"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, TextInput } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { supplierPortalApi } from "@/lib/supplier-portal-api";
import {
  getSupplierPortalSession,
  persistSupplierPortalSession,
  type SupplierPortalRole,
} from "@/lib/supplier-portal-auth";

type OrganizationChoice = {
  id: string;
  slug: string;
  displayName: string;
  verificationStatus: string;
  role: SupplierPortalRole;
};

type LoginSelectionResponse = {
  organizationSelectionRequired: true;
  organizations: OrganizationChoice[];
};

type LoginSuccessResponse = {
  organizationSelectionRequired: false;
  accessToken: string;
  expiresInSeconds: number;
  user: { id: string; email: string; firstName: string | null; lastName: string | null };
  supplierOrganization: { id: string; slug: string; displayName: string; verificationStatus: string };
  membership: { id: string; role: SupplierPortalRole };
};

type LoginResponse = LoginSelectionResponse | LoginSuccessResponse;

export default function SupplierPortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [organizations, setOrganizations] = useState<OrganizationChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (getSupplierPortalSession()) router.replace("/supplier-portal/rfqs");
  }, [router]);

  async function login(selectedOrganizationId?: string) {
    setLoading(true);
    setError("");
    try {
      const result = await supplierPortalApi<LoginResponse>("/supplier-portal/auth/login", {
        method: "POST",
        auth: false,
        body: {
          email: email.trim(),
          password,
          supplierOrganizationId: selectedOrganizationId || undefined,
        },
      });

      if (result.organizationSelectionRequired) {
        setOrganizations(result.organizations);
        setOrganizationId(result.organizations[0]?.id ?? "");
        return;
      }

      persistSupplierPortalSession(result);
      router.replace("/supplier-portal/rfqs");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tedarikçi portalına giriş yapılamadı.");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (organizations.length) {
      if (!organizationId) return;
      await login(organizationId);
      return;
    }
    await login();
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-[#17212b]">
      <header className="mx-auto flex h-[72px] max-w-[1180px] items-center justify-between border-b border-[#dfe7ed] px-6 sm:px-8">
        <a href="/supplier-portal/login" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.02em]">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#1674bd] text-[12px] font-semibold text-white">V</span>
          VALOO Supplier
        </a>
        <a href="/login" className="text-[12px] font-medium text-[#667482] hover:text-[#17212b]">İşletme girişi</a>
      </header>

      <section className="mx-auto flex min-h-[calc(100vh-160px)] w-full max-w-[760px] flex-col items-center px-6 pb-16 pt-20 sm:pt-24">
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#1674bd]">TEDARİKÇİ PORTALI</p>
          <h1 className="mt-3 text-[38px] font-semibold tracking-[-0.045em] sm:text-[46px]">Tekliflerinizi yönetin</h1>
          <p className="mt-3 text-[15px] text-[#667482]">RFQ davetlerini görüntüleyin, teklif hazırlayın ve gönderin.</p>
        </div>

        <form onSubmit={onSubmit} className="mt-10 w-full max-w-[440px] rounded-[22px] border border-[#dfe7ed] bg-white p-6 shadow-[0_18px_60px_rgba(31,52,73,.08)]">
          {organizations.length ? (
            <div className="space-y-4">
              <div>
                <p className="text-[14px] font-semibold">Tedarikçi hesabını seçin</p>
                <p className="mt-1 text-[12px] leading-5 text-[#667482]">Bu kullanıcı birden fazla tedarikçi organizasyonuna bağlı.</p>
              </div>
              <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} className="h-[52px] w-full rounded-[14px] border border-[#dfe7ed] bg-white px-4 text-[14px] outline-none focus:border-[#1674bd]">
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.displayName} · {organization.role} · {organization.verificationStatus}
                  </option>
                ))}
              </select>
              <Button type="submit" disabled={loading || !organizationId} className="h-[50px] w-full rounded-[14px] bg-[#1674bd] text-white hover:bg-[#0b5fa9]">
                {loading ? "Açılıyor..." : "Bu hesapla devam et"}
              </Button>
              <button type="button" onClick={() => { setOrganizations([]); setOrganizationId(""); }} className="w-full text-[12px] font-medium text-[#667482] hover:text-[#17212b]">Farklı bilgilerle giriş yap</button>
            </div>
          ) : (
            <div className="space-y-3">
              <TextInput type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-posta adresi" className="h-[52px] rounded-[14px] border-[#dfe7ed] bg-white px-4 text-[15px]" />
              <TextInput type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Şifre" className="h-[52px] rounded-[14px] border-[#dfe7ed] bg-white px-4 text-[15px]" />
              <Button type="submit" disabled={loading} className="mt-3 h-[50px] w-full rounded-[14px] bg-[#1674bd] text-white hover:bg-[#0b5fa9]">
                {loading ? "Giriş yapılıyor..." : "Devam et"}
              </Button>
            </div>
          )}

          {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
        </form>
      </section>
    </main>
  );
}
