"use client";

import { useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";

type Company = {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
  _count: { branches: number; memberships: number; roles: number };
};

type Branch = {
  id: string;
  companyId: string;
  name: string;
  code: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  address: string | null;
  phone: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { membershipAccess: number; staff: number };
};

const STATUS_LABELS: Record<Company["status"] | Branch["status"], string> = {
  ACTIVE: "Aktif",
  INACTIVE: "Pasif",
  ARCHIVED: "Arşivlendi",
};

export default function OrganizationPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      api<Company>("/admin/organization/company"),
      api<Branch[]>("/admin/organization/branches"),
    ])
      .then(([companyData, branchData]) => {
        if (!active) return;
        setCompany(companyData);
        setBranches(branchData);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "Organizasyon bilgileri yüklenemedi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-sm text-[var(--muted)]">Yükleniyor…</div>;
  }

  return (
    <main className="mx-auto w-full max-w-[1240px] space-y-6 pb-10">
      <header className="border-b border-[var(--line)] pb-5">
        <div className="mb-1 text-xs font-medium text-[var(--muted)]">Yönetim / Organizasyon</div>
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">Şirket ve Şubeler</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
          Mevcut şirket kapsamınızı, erişilebilir şubeleri ve organizasyon kullanım özetini görüntüleyin.
        </p>
      </header>

      {error ? <div className="rounded-xl border border-[#f0d8d8] bg-[#fff8f8] px-4 py-3 text-sm text-[#9a4545]">{error}</div> : null}

      {company ? (
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Aktif Şirket Kapsamı</div>
              <h2 className="mt-1 text-xl font-semibold text-[var(--ink)]">{company.name}</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">{company.slug}</p>
            </div>
            <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">{STATUS_LABELS[company.status]}</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-[var(--surface-2)] p-4"><div className="text-xs text-[var(--muted)]">Toplam Şube</div><div className="mt-1 text-2xl font-semibold text-[var(--ink)]">{company._count.branches}</div></div>
            <div className="rounded-xl bg-[var(--surface-2)] p-4"><div className="text-xs text-[var(--muted)]">Üyelik</div><div className="mt-1 text-2xl font-semibold text-[var(--ink)]">{company._count.memberships}</div></div>
            <div className="rounded-xl bg-[var(--surface-2)] p-4"><div className="text-xs text-[var(--muted)]">Şirket Rolleri</div><div className="mt-1 text-2xl font-semibold text-[var(--ink)]">{company._count.roles}</div></div>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Erişilebilir Şubeler</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">Gösterilen şubeler mevcut rol ve organizasyon kapsamınıza göre sunulur.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs text-[var(--muted)]">
              <tr><th className="px-4 py-3 font-medium">Şube</th><th className="px-4 py-3 font-medium">Durum</th><th className="px-4 py-3 font-medium">İletişim</th><th className="px-4 py-3 font-medium">Personel</th><th className="px-4 py-3 font-medium">Erişim Ataması</th></tr>
            </thead>
            <tbody>
              {branches.map((branch) => (
                <tr key={branch.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-4"><div className="font-medium text-[var(--ink)]">{branch.name}</div><div className="mt-0.5 text-xs text-[var(--muted)]">{branch.code}{branch.address ? ` · ${branch.address}` : ""}</div></td>
                  <td className="px-4 py-4"><span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--ink)]">{STATUS_LABELS[branch.status]}</span></td>
                  <td className="px-4 py-4 text-xs text-[var(--muted)]"><div>{branch.phone ?? "—"}</div><div className="mt-0.5">{branch.email ?? "—"}</div></td>
                  <td className="px-4 py-4 font-semibold text-[var(--ink)]">{branch._count.staff}</td>
                  <td className="px-4 py-4 font-semibold text-[var(--ink)]">{branch._count.membershipAccess}</td>
                </tr>
              ))}
              {!branches.length ? <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-[var(--muted)]">Mevcut erişim kapsamında şube bulunamadı.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
