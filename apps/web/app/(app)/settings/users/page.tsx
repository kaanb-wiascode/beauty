"use client";

import { useEffect, useMemo, useState } from "react";
import { Select } from "@/components/ui";

import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";

type Role = { id: string; name: string; slug: string };
type Membership = {
  id: string;
  status: string;
  user: { id: string; email: string; firstName: string; lastName: string };
  role: Role;
};
type BranchOption = {
  id: string;
  companyId: string;
  name: string;
  code: string;
  status: string;
};
type EffectiveAccess = {
  membership: { id: string; status: string; user: Membership["user"] };
  role: { id: string; name: string; slug: string; scope: "CENTRAL" | "COMPANY" | "BRANCH"; company: { id: string; name: string } | null };
  access: {
    company: { id: string; name: string; status: string } | null;
    branches: Array<{ id: string; name: string; code: string; status: string; company: { id: string; name: string } }>;
  };
  permissions: Array<{
    id: string;
    resource: string;
    action: string;
    description: string | null;
    source: "ROLE";
    sourceRole: { id: string; name: string; slug: string };
  }>;
  summary: { permissionCount: number; branchCount: number };
};

const SCOPE_LABELS: Record<EffectiveAccess["role"]["scope"], string> = {
  CENTRAL: "Merkez / Şirket Geneli",
  COMPANY: "Şirket / Seçili Şubeler",
  BRANCH: "Şube",
};

export default function UsersPage() {
  const { showToast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [effective, setEffective] = useState<EffectiveAccess | null>(null);
  const [effectiveLoading, setEffectiveLoading] = useState(false);
  const [branchDraft, setBranchDraft] = useState<string[]>([]);
  const [branchSaving, setBranchSaving] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<Role[]>("/roles"),
      api<Membership[]>("/memberships"),
      api<BranchOption[]>("/admin/organization/branches"),
    ])
      .then(([roleData, membershipData, branchData]) => {
        if (!active) return;
        setRoles(roleData);
        setMemberships(membershipData);
        setBranches(branchData.filter((branch) => branch.status === "ACTIVE"));
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "Kullanıcılar yüklenemedi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const filteredMemberships = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    return memberships.filter((membership) => {
      if (statusFilter !== "ALL" && membership.status !== statusFilter) return false;
      if (roleFilter !== "ALL" && membership.role.id !== roleFilter) return false;
      if (!normalized) return true;
      return `${membership.user.firstName} ${membership.user.lastName} ${membership.user.email} ${membership.role.name}`
        .toLocaleLowerCase("tr-TR")
        .includes(normalized);
    });
  }, [memberships, query, roleFilter, statusFilter]);

  async function changeRole(membershipId: string, roleId: string) {
    setSavingId(membershipId);
    setError("");
    try {
      const updated = await api<Membership>(`/memberships/${membershipId}/role`, { method: "PATCH", body: { roleId } });
      setMemberships((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (effective?.membership.id === membershipId) setEffective(null);
      showToast("Kullanıcı rolü güncellendi.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kullanıcı rolü güncellenemedi.");
    } finally {
      setSavingId(null);
    }
  }

  async function changeStatus(membershipId: string, status: "ACTIVE" | "SUSPENDED") {
    setSavingId(membershipId);
    setError("");
    try {
      const updated = await api<Membership>(`/memberships/${membershipId}/status`, { method: "PATCH", body: { status } });
      setMemberships((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (effective?.membership.id === membershipId) setEffective(null);
      showToast(status === "ACTIVE" ? "Kullanıcı aktifleştirildi." : "Kullanıcı askıya alındı.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kullanıcı durumu güncellenemedi.");
    } finally {
      setSavingId(null);
    }
  }

  async function removeMembership(membership: Membership) {
    if (!window.confirm(`${membership.user.firstName} ${membership.user.lastName} kullanıcısını bu işletmeden kaldırmak istediğinize emin misiniz?`)) return;
    setSavingId(membership.id);
    setError("");
    try {
      await api(`/memberships/${membership.id}`, { method: "DELETE" });
      setMemberships((current) => current.filter((item) => item.id !== membership.id));
      if (effective?.membership.id === membership.id) setEffective(null);
      showToast("Kullanıcı işletmeden kaldırıldı.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kullanıcı kaldırılamadı.");
    } finally {
      setSavingId(null);
    }
  }

  async function openEffectivePermissions(membershipId: string) {
    setEffectiveLoading(true);
    setError("");
    try {
      const data = await api<EffectiveAccess>(`/memberships/${membershipId}/effective-permissions`);
      setEffective(data);
      setBranchDraft(data.access.branches.map((branch) => branch.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Etkin yetkiler yüklenemedi.");
    } finally {
      setEffectiveLoading(false);
    }
  }

  function toggleBranch(branchId: string) {
    setBranchDraft((current) =>
      current.includes(branchId)
        ? current.filter((id) => id !== branchId)
        : [...current, branchId],
    );
  }

  async function saveBranchAccess() {
    if (!effective || effective.role.scope === "CENTRAL") return;
    setBranchSaving(true);
    setError("");
    try {
      await api(`/memberships/${effective.membership.id}/branch-access`, {
        method: "PATCH",
        body: { branchIds: branchDraft },
      });
      const refreshed = await api<EffectiveAccess>(`/memberships/${effective.membership.id}/effective-permissions`);
      setEffective(refreshed);
      setBranchDraft(refreshed.access.branches.map((branch) => branch.id));
      showToast("Şube erişimleri güncellendi.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Şube erişimleri güncellenemedi.");
    } finally {
      setBranchSaving(false);
    }
  }

  const branchAccessChanged = effective
    ? [...branchDraft].sort().join("|") !== effective.access.branches.map((branch) => branch.id).sort().join("|")
    : false;

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center text-sm text-[var(--muted)]">Yükleniyor…</div>;

  return (
    <main className="mx-auto w-full max-w-[1240px] space-y-6 pb-10">
      <header className="border-b border-[var(--line)] pb-5">
        <div className="mb-1 text-xs font-medium text-[var(--muted)]">Yönetim / Erişim</div>
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">Kullanıcılar</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">İşletme üyeliklerini, rolleri, şirket/şube erişimlerini ve etkin yetkileri yönetin.</p>
      </header>

      {error ? <div className="rounded-xl border border-[#f0d8d8] bg-[#fff8f8] px-4 py-3 text-sm text-[#9a4545]">{error}</div> : null}

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        <div className="grid gap-3 border-b border-[var(--line)] p-4 md:grid-cols-[1fr_220px_220px]">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ad, e-posta veya rol ara…" className="min-h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-sm" />
          <Select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="min-h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-sm"><option value="ALL">Tüm Roller</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</Select>
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-sm"><option value="ALL">Tüm Durumlar</option><option value="ACTIVE">Aktif</option><option value="SUSPENDED">Askıda</option></Select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs text-[var(--muted)]"><tr><th className="px-4 py-3 font-medium">Kullanıcı</th><th className="px-4 py-3 font-medium">Rol</th><th className="px-4 py-3 font-medium">Durum</th><th className="px-4 py-3 text-right font-medium">İşlemler</th></tr></thead>
            <tbody>
              {filteredMemberships.map((membership) => {
                const busy = savingId === membership.id;
                const owner = membership.role.slug === "owner";
                return <tr key={membership.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-4"><div className="font-medium text-[var(--ink)]">{membership.user.firstName} {membership.user.lastName}</div><div className="text-xs text-[var(--muted)]">{membership.user.email}</div></td>
                  <td className="px-4 py-4"><Select disabled={busy || owner} value={membership.role.id} onChange={(event) => void changeRole(membership.id, event.target.value)} className="min-h-9 rounded-lg border border-[var(--line)] bg-white px-2 text-sm disabled:opacity-60">{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</Select></td>
                  <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${membership.status === "ACTIVE" ? "bg-[#eaf7ef] text-[#378a5e]" : "bg-[#fff4e6] text-[#a66518]"}`}>{membership.status === "ACTIVE" ? "Aktif" : "Askıda"}</span></td>
                  <td className="px-4 py-4"><div className="flex justify-end gap-2"><button disabled={effectiveLoading} type="button" onClick={() => void openEffectivePermissions(membership.id)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-medium disabled:opacity-50">Erişim & Yetkiler</button>{!owner ? <button disabled={busy} type="button" onClick={() => void changeStatus(membership.id, membership.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE")} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-medium disabled:opacity-50">{membership.status === "ACTIVE" ? "Askıya Al" : "Aktifleştir"}</button> : null}{!owner ? <button disabled={busy} type="button" onClick={() => void removeMembership(membership)} className="rounded-lg border border-[#f0d8d8] px-3 py-2 text-xs font-medium text-[#9a4545] disabled:opacity-50">Kaldır</button> : null}</div></td>
                </tr>;
              })}
              {!filteredMemberships.length ? <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-[var(--muted)]">Filtrelere uygun kullanıcı bulunamadı.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {effective ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Erişim ve etkin yetkiler"><div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-4"><div><div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Erişim & Etkin Yetkiler</div><h2 className="mt-1 text-xl font-semibold text-[var(--ink)]">{effective.membership.user.firstName} {effective.membership.user.lastName}</h2><p className="text-sm text-[var(--muted)]">{effective.membership.user.email}</p></div><button type="button" onClick={() => setEffective(null)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-medium">Kapat</button></div>
        <div className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl bg-[var(--surface-2)] p-3"><div className="text-xs text-[var(--muted)]">Rol</div><div className="mt-1 text-sm font-semibold">{effective.role.name}</div></div><div className="rounded-xl bg-[var(--surface-2)] p-3"><div className="text-xs text-[var(--muted)]">Kapsam</div><div className="mt-1 text-sm font-semibold">{SCOPE_LABELS[effective.role.scope]}</div></div><div className="rounded-xl bg-[var(--surface-2)] p-3"><div className="text-xs text-[var(--muted)]">Yetki</div><div className="mt-1 text-sm font-semibold">{effective.summary.permissionCount}</div></div><div className="rounded-xl bg-[var(--surface-2)] p-3"><div className="text-xs text-[var(--muted)]">Şube Erişimi</div><div className="mt-1 text-sm font-semibold">{effective.summary.branchCount}</div></div></div>

        <section className="mb-4 rounded-xl border border-[var(--line)] p-4">
          <div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-semibold">Organizasyon Erişimi</h3><p className="mt-1 text-xs text-[var(--muted)]">Şirket: {effective.access.company?.name ?? effective.role.company?.name ?? "Atanmamış"}</p></div>{effective.role.scope !== "CENTRAL" ? <button type="button" disabled={branchSaving || !branchAccessChanged} onClick={() => void saveBranchAccess()} className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{branchSaving ? "Kaydediliyor…" : "Şube Erişimini Kaydet"}</button> : null}</div>
          {effective.role.scope === "CENTRAL" ? <div className="mt-3 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--muted)]">Merkez kapsamı mevcut şirket içindeki şubelere merkezi erişim sağlar; ayrıca şube seçimi yapılmaz.</div> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{branches.map((branch) => { const checked = branchDraft.includes(branch.id); return <label key={branch.id} className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 ${checked ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)]"}`}><span><span className="block text-sm font-medium text-[var(--ink)]">{branch.name}</span><span className="text-xs text-[var(--muted)]">{branch.code}</span></span><input type="checkbox" checked={checked} onChange={() => toggleBranch(branch.id)} className="h-4 w-4" /></label>; })}{!branches.length ? <div className="col-span-full rounded-xl border border-dashed border-[var(--line)] px-4 py-6 text-center text-sm text-[var(--muted)]">Atanabilir aktif şube bulunmuyor.</div> : null}</div>}
          {effective.role.scope === "BRANCH" ? <p className="mt-2 text-[11px] text-[var(--muted)]">Şube kapsamındaki bir kullanıcı için en az bir şube seçili olmalıdır.</p> : null}
        </section>

        <section><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Rol Kaynaklı Yetkiler</h3><span className="text-xs text-[var(--muted)]">Kaynak: {effective.role.name}</span></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{effective.permissions.map((permission) => <div key={permission.id} className="rounded-xl border border-[var(--line)] p-3"><div className="text-sm font-semibold text-[var(--ink)]">{permission.resource}.{permission.action}</div>{permission.description ? <div className="mt-1 text-xs text-[var(--muted)]">{permission.description}</div> : null}<div className="mt-2 text-[11px] text-[var(--muted)]">{permission.sourceRole.name} rolünden</div></div>)}</div>{!effective.permissions.length ? <div className="rounded-xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-sm text-[var(--muted)]">Bu rol için yetki bulunmuyor.</div> : null}</section>
      </div></div> : null}
    </main>
  );
}
