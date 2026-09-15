"use client";

import { useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";

type Role = { id: string; name: string; slug: string };
type Membership = {
  id: string;
  status: string;
  user: { id: string; email: string; firstName: string; lastName: string };
  role: Role;
};

export default function UsersPage() {
  const { showToast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([api<Role[]>("/roles"), api<Membership[]>("/memberships")])
      .then(([roleData, membershipData]) => {
        if (!active) return;
        setRoles(roleData);
        setMemberships(membershipData);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "Kullanıcılar Yüklenemedi.");
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
      showToast("Kullanıcı Rolü Güncellendi.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kullanıcı Rolü Güncellenemedi.");
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
      showToast(status === "ACTIVE" ? "Kullanıcı Aktifleştirildi." : "Kullanıcı Askıya Alındı.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kullanıcı Durumu Güncellenemedi.");
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
      showToast("Kullanıcı İşletmeden Kaldırıldı.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kullanıcı Kaldırılamadı.");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center text-sm text-[var(--muted)]">Yükleniyor…</div>;

  return (
    <main className="mx-auto w-full max-w-[1240px] space-y-6 pb-10">
      <header className="border-b border-[var(--line)] pb-5">
        <div className="mb-1 text-xs font-medium text-[var(--muted)]">Yönetim / Erişim</div>
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">Kullanıcılar</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">İşletme üyeliklerini, rolleri ve erişim durumlarını yönetin.</p>
      </header>

      {error ? <div className="rounded-xl border border-[#f0d8d8] bg-[#fff8f8] px-4 py-3 text-sm text-[#9a4545]">{error}</div> : null}

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        <div className="grid gap-3 border-b border-[var(--line)] p-4 md:grid-cols-[1fr_220px_220px]">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ad, e-posta veya rol ara…" className="min-h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-sm" />
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="min-h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-sm"><option value="ALL">Tüm Roller</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-sm"><option value="ALL">Tüm Durumlar</option><option value="ACTIVE">Aktif</option><option value="SUSPENDED">Askıda</option></select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs text-[var(--muted)]"><tr><th className="px-4 py-3 font-medium">Kullanıcı</th><th className="px-4 py-3 font-medium">Rol</th><th className="px-4 py-3 font-medium">Durum</th><th className="px-4 py-3 text-right font-medium">İşlemler</th></tr></thead>
            <tbody>
              {filteredMemberships.map((membership) => {
                const busy = savingId === membership.id;
                const owner = membership.role.slug === "owner";
                return <tr key={membership.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-4"><div className="font-medium text-[var(--ink)]">{membership.user.firstName} {membership.user.lastName}</div><div className="text-xs text-[var(--muted)]">{membership.user.email}</div></td>
                  <td className="px-4 py-4"><select disabled={busy || owner} value={membership.role.id} onChange={(event) => void changeRole(membership.id, event.target.value)} className="min-h-9 rounded-lg border border-[var(--line)] bg-white px-2 text-sm disabled:opacity-60">{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></td>
                  <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${membership.status === "ACTIVE" ? "bg-[#eaf7ef] text-[#378a5e]" : "bg-[#fff4e6] text-[#a66518]"}`}>{membership.status === "ACTIVE" ? "Aktif" : "Askıda"}</span></td>
                  <td className="px-4 py-4"><div className="flex justify-end gap-2">{!owner ? <button disabled={busy} type="button" onClick={() => void changeStatus(membership.id, membership.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE")} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-medium disabled:opacity-50">{membership.status === "ACTIVE" ? "Askıya Al" : "Aktifleştir"}</button> : null}{!owner ? <button disabled={busy} type="button" onClick={() => void removeMembership(membership)} className="rounded-lg border border-[#f0d8d8] px-3 py-2 text-xs font-medium text-[#9a4545] disabled:opacity-50">Kaldır</button> : null}</div></td>
                </tr>;
              })}
              {!filteredMemberships.length ? <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-[var(--muted)]">Filtrelere uygun kullanıcı bulunamadı.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
