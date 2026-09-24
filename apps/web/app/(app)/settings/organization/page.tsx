"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui";

import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";

type OrganizationStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
type Company = {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  createdAt: string;
  updatedAt: string;
  _count: { branches: number; memberships: number; roles: number };
};

type Branch = {
  id: string;
  companyId: string;
  name: string;
  code: string;
  status: OrganizationStatus;
  address: string | null;
  phone: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { membershipAccess: number; staff: number };
};

type CompanyUpdateResponse = Pick<Company, "id" | "name" | "slug" | "status" | "updatedAt">;
type BranchUpdateResponse = Omit<Branch, "createdAt" | "_count">;

const STATUS_LABELS: Record<OrganizationStatus, string> = {
  ACTIVE: "Aktif",
  INACTIVE: "Pasif",
  ARCHIVED: "Arşivlendi",
};

export default function OrganizationPage() {
  const { showToast } = useToast();
  const [company, setCompany] = useState<Company | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [companyEditing, setCompanyEditing] = useState(false);
  const [companySaving, setCompanySaving] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyStatus, setCompanyStatus] = useState<OrganizationStatus>("ACTIVE");
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchSaving, setBranchSaving] = useState(false);
  const [branchDraft, setBranchDraft] = useState({
    name: "",
    code: "",
    status: "ACTIVE" as OrganizationStatus,
    address: "",
    phone: "",
    email: "",
  });

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
        setCompanyName(companyData.name);
        setCompanyStatus(companyData.status);
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

  function beginCompanyEdit() {
    if (!company) return;
    setCompanyName(company.name);
    setCompanyStatus(company.status);
    setCompanyEditing(true);
    setError("");
  }

  async function saveCompany() {
    if (!company) return;
    const name = companyName.trim();
    if (!name) {
      setError("Şirket adı boş bırakılamaz.");
      return;
    }
    if (companyStatus === "ARCHIVED" && company.status !== "ARCHIVED") {
      const confirmed = window.confirm("Şirketi arşivlemek aktif operasyonları etkileyebilir. Devam etmek istiyor musunuz?");
      if (!confirmed) return;
    }

    setCompanySaving(true);
    setError("");
    try {
      const updated = await api<CompanyUpdateResponse>("/admin/organization/company", {
        method: "PATCH",
        body: { name, status: companyStatus },
      });
      setCompany((current) => current ? { ...current, ...updated } : current);
      setCompanyEditing(false);
      showToast("Şirket ayarları güncellendi.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Şirket ayarları güncellenemedi.");
    } finally {
      setCompanySaving(false);
    }
  }

  function beginBranchEdit(branch: Branch) {
    setEditingBranch(branch);
    setBranchDraft({
      name: branch.name,
      code: branch.code,
      status: branch.status,
      address: branch.address ?? "",
      phone: branch.phone ?? "",
      email: branch.email ?? "",
    });
    setError("");
  }

  async function saveBranch() {
    if (!editingBranch) return;
    const name = branchDraft.name.trim();
    const code = branchDraft.code.trim();
    if (!name || !code) {
      setError("Şube adı ve kodu zorunludur.");
      return;
    }
    if (branchDraft.status === "ARCHIVED" && editingBranch.status !== "ARCHIVED") {
      const confirmed = window.confirm("Şubeyi arşivlemek tarihsel kayıtları silmez ancak yeni operasyonlarda kullanımı etkileyebilir. Devam etmek istiyor musunuz?");
      if (!confirmed) return;
    }

    setBranchSaving(true);
    setError("");
    try {
      const updated = await api<BranchUpdateResponse>(`/admin/organization/branches/${editingBranch.id}`, {
        method: "PATCH",
        body: {
          name,
          code,
          status: branchDraft.status,
          address: branchDraft.address.trim() || null,
          phone: branchDraft.phone.trim() || null,
          email: branchDraft.email.trim() || null,
        },
      });
      setBranches((current) => current.map((branch) => branch.id === updated.id ? { ...branch, ...updated } : branch));
      setEditingBranch(null);
      showToast("Şube ayarları güncellendi.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Şube ayarları güncellenemedi.");
    } finally {
      setBranchSaving(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-sm text-[var(--muted)]">Yükleniyor…</div>;
  }

  return (
    <main className="mx-auto w-full max-w-[1240px] space-y-6 pb-10">
      <header className="border-b border-[var(--line)] pb-5">
        <div className="mb-1 text-xs font-medium text-[var(--muted)]">Yönetim / Organizasyon</div>
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">Şirket ve Şubeler</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
          Mevcut şirket kapsamınızı, erişilebilir şubeleri, iletişim bilgilerini ve organizasyon yaşam döngüsünü yönetin.
        </p>
      </header>

      {error ? <div className="rounded-xl border border-[#f0d8d8] bg-[#fff8f8] px-4 py-3 text-sm text-[#9a4545]">{error}</div> : null}

      {company ? (
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            {companyEditing ? (
              <div className="grid w-full gap-3 md:grid-cols-[1fr_220px_auto]">
                <label className="space-y-1"><span className="text-xs font-medium text-[var(--muted)]">Şirket adı</span><input value={companyName} onChange={(event) => setCompanyName(event.target.value)} className="min-h-10 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm" /></label>
                <label className="space-y-1"><span className="text-xs font-medium text-[var(--muted)]">Durum</span><Select value={companyStatus} onChange={(event) => setCompanyStatus(event.target.value as OrganizationStatus)} className="min-h-10 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm"><option value="ACTIVE">Aktif</option><option value="INACTIVE">Pasif</option><option value="ARCHIVED">Arşivlendi</option></Select></label>
                <div className="flex items-end gap-2"><button type="button" disabled={companySaving} onClick={() => void saveCompany()} className="min-h-10 rounded-xl bg-[var(--accent)] px-4 text-xs font-semibold text-white disabled:opacity-50">{companySaving ? "Kaydediliyor…" : "Kaydet"}</button><button type="button" disabled={companySaving} onClick={() => setCompanyEditing(false)} className="min-h-10 rounded-xl border border-[var(--line)] px-4 text-xs font-semibold">Vazgeç</button></div>
              </div>
            ) : (
              <>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Aktif Şirket Kapsamı</div>
                  <h2 className="mt-1 text-xl font-semibold text-[var(--ink)]">{company.name}</h2>
                  <p className="mt-1 text-xs text-[var(--muted)]">{company.slug}</p>
                </div>
                <div className="flex items-center gap-2"><span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">{STATUS_LABELS[company.status]}</span><button type="button" onClick={beginCompanyEdit} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold">Şirketi Düzenle</button></div>
              </>
            )}
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
          <p className="mt-0.5 text-xs text-[var(--muted)]">Gösterilen ve düzenlenebilen şubeler mevcut rol ve organizasyon kapsamınıza göre sunulur.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs text-[var(--muted)]">
              <tr><th className="px-4 py-3 font-medium">Şube</th><th className="px-4 py-3 font-medium">Durum</th><th className="px-4 py-3 font-medium">İletişim</th><th className="px-4 py-3 font-medium">Personel</th><th className="px-4 py-3 font-medium">Erişim Ataması</th><th className="px-4 py-3 text-right font-medium">İşlem</th></tr>
            </thead>
            <tbody>
              {branches.map((branch) => (
                <tr key={branch.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-4"><div className="font-medium text-[var(--ink)]">{branch.name}</div><div className="mt-0.5 text-xs text-[var(--muted)]">{branch.code}{branch.address ? ` · ${branch.address}` : ""}</div></td>
                  <td className="px-4 py-4"><span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--ink)]">{STATUS_LABELS[branch.status]}</span></td>
                  <td className="px-4 py-4 text-xs text-[var(--muted)]"><div>{branch.phone ?? "—"}</div><div className="mt-0.5">{branch.email ?? "—"}</div></td>
                  <td className="px-4 py-4 font-semibold text-[var(--ink)]">{branch._count.staff}</td>
                  <td className="px-4 py-4 font-semibold text-[var(--ink)]">{branch._count.membershipAccess}</td>
                  <td className="px-4 py-4 text-right"><button type="button" onClick={() => beginBranchEdit(branch)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold">Düzenle</button></td>
                </tr>
              ))}
              {!branches.length ? <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--muted)]">Mevcut erişim kapsamında şube bulunamadı.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {editingBranch ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Şube düzenleme"><div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-4"><div><div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Şube Yönetimi</div><h2 className="mt-1 text-xl font-semibold text-[var(--ink)]">{editingBranch.name}</h2><p className="mt-1 text-xs text-[var(--muted)]">Tarihsel kayıtlar durum değişikliğinde korunur.</p></div><button type="button" disabled={branchSaving} onClick={() => setEditingBranch(null)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold">Kapat</button></div>
        <div className="grid gap-3 py-4 sm:grid-cols-2">
          <label className="space-y-1"><span className="text-xs font-medium text-[var(--muted)]">Şube adı</span><input value={branchDraft.name} onChange={(event) => setBranchDraft((current) => ({ ...current, name: event.target.value }))} className="min-h-10 w-full rounded-xl border border-[var(--line)] px-3 text-sm" /></label>
          <label className="space-y-1"><span className="text-xs font-medium text-[var(--muted)]">Kod</span><input value={branchDraft.code} onChange={(event) => setBranchDraft((current) => ({ ...current, code: event.target.value }))} className="min-h-10 w-full rounded-xl border border-[var(--line)] px-3 text-sm" /></label>
          <label className="space-y-1"><span className="text-xs font-medium text-[var(--muted)]">Durum</span><Select value={branchDraft.status} onChange={(event) => setBranchDraft((current) => ({ ...current, status: event.target.value as OrganizationStatus }))} className="min-h-10 w-full rounded-xl border border-[var(--line)] px-3 text-sm"><option value="ACTIVE">Aktif</option><option value="INACTIVE">Pasif</option><option value="ARCHIVED">Arşivlendi</option></Select></label>
          <label className="space-y-1"><span className="text-xs font-medium text-[var(--muted)]">Telefon</span><input value={branchDraft.phone} onChange={(event) => setBranchDraft((current) => ({ ...current, phone: event.target.value }))} className="min-h-10 w-full rounded-xl border border-[var(--line)] px-3 text-sm" /></label>
          <label className="space-y-1 sm:col-span-2"><span className="text-xs font-medium text-[var(--muted)]">E-posta</span><input type="email" value={branchDraft.email} onChange={(event) => setBranchDraft((current) => ({ ...current, email: event.target.value }))} className="min-h-10 w-full rounded-xl border border-[var(--line)] px-3 text-sm" /></label>
          <label className="space-y-1 sm:col-span-2"><span className="text-xs font-medium text-[var(--muted)]">Adres</span><textarea value={branchDraft.address} onChange={(event) => setBranchDraft((current) => ({ ...current, address: event.target.value }))} rows={3} className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm" /></label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4"><button type="button" disabled={branchSaving} onClick={() => setEditingBranch(null)} className="rounded-xl border border-[var(--line)] px-4 py-2 text-xs font-semibold">Vazgeç</button><button type="button" disabled={branchSaving} onClick={() => void saveBranch()} className="rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{branchSaving ? "Kaydediliyor…" : "Değişiklikleri Kaydet"}</button></div>
      </div></div> : null}
    </main>
  );
}
