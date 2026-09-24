"use client";

import { useEffect, useMemo, useState } from "react";
import { Select } from "@/components/ui";

import { api, ApiError } from "@/lib/api";
import { userPermissionLabel } from "@/lib/user-language";

type Membership = {
  id: string;
  status: string;
  user: { id: string; email: string; firstName: string; lastName: string };
  role: { id: string; name: string; slug: string };
};

type EffectivePermission = {
  id: string;
  resource: string;
  action: string;
  description: string | null;
  source: "ROLE" | "TEMPORARY";
  sourceRole?: { id: string; name: string; slug: string };
  temporaryGrant?: {
    id: string;
    branchId: string | null;
    startsAt: string;
    endsAt: string;
    reason: string;
  };
};

type EffectiveAccess = {
  membership: {
    id: string;
    status: string;
    user: Membership["user"];
  };
  role: {
    id: string;
    name: string;
    slug: string;
    scope: "CENTRAL" | "COMPANY" | "BRANCH";
    company: { id: string; name: string } | null;
  };
  access: {
    company: { id: string; name: string; status: string } | null;
    branches: Array<{ id: string; name: string; code: string; status: string; company: { id: string; name: string } }>;
  };
  permissions: EffectivePermission[];
  summary: {
    permissionCount: number;
    branchCount: number;
    temporaryPermissionCount?: number;
  };
};

const HIGH_RISK = new Set([
  "roles.update",
  "finance.manage",
  "accounting.manage",
  "payments.refund",
  "hr.manage",
  "financial_integrations.manage",
]);

const scopeLabel = {
  CENTRAL: "Merkez / Şirket Geneli",
  COMPANY: "Şirket / Seçili Şubeler",
  BRANCH: "Şube",
} as const;

export default function PermissionSimulationPage() {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [membershipId, setMembershipId] = useState("");
  const [effective, setEffective] = useState<EffectiveAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    api<Membership[]>("/memberships")
      .then((rows) => {
        if (!active) return;
        const activeRows = rows.filter((row) => row.status === "ACTIVE");
        setMemberships(activeRows);
        setMembershipId(activeRows[0]?.id ?? "");
      })
      .catch((err) => { if (active) setError(err instanceof ApiError ? err.message : "Kullanıcılar yüklenemedi."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!membershipId) { setEffective(null); return; }
    let active = true;
    setSimulating(true);
    setError("");
    api<EffectiveAccess>(`/memberships/${membershipId}/effective-permissions`)
      .then((data) => { if (active) setEffective(data); })
      .catch((err) => { if (active) setError(err instanceof ApiError ? err.message : "Yetki simülasyonu yüklenemedi."); })
      .finally(() => { if (active) setSimulating(false); });
    return () => { active = false; };
  }, [membershipId]);

  const rows = useMemo(() => {
    if (!effective) return [];
    const normalized = query.trim().toLowerCase();
    return effective.permissions.filter((permission) => {
      if (!normalized) return true;
      return `${permission.resource}.${permission.action} ${permission.description ?? ""}`.toLowerCase().includes(normalized);
    });
  }, [effective, query]);

  const riskPermissions = effective?.permissions.filter((permission) => HIGH_RISK.has(`${permission.resource}.${permission.action}`)) ?? [];
  const temporaryPermissions = effective?.permissions.filter((permission) => permission.source === "TEMPORARY") ?? [];

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center text-sm text-[var(--muted)]">Yükleniyor…</div>;

  return (
    <main className="mx-auto w-full max-w-[1240px] space-y-6 pb-10">
      <header className="border-b border-[var(--line)] pb-5">
        <div className="mb-1 text-xs font-medium text-[var(--muted)]">Yönetim / Erişim</div>
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">Kullanıcı Yetkilerini İncele</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">Bir kullanıcının hangi şirkete, şubelere, modüllere ve kritik işlemlere erişebildiğini hesabına geçiş yapmadan inceleyin.</p>
      </header>

      {error ? <div className="rounded-xl border border-[#f0d8d8] bg-[#fff8f8] px-4 py-3 text-sm text-[#9a4545]">{error}</div> : null}

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
        <label className="block text-xs font-medium text-[var(--muted)]">İncelenecek Kullanıcı<Select value={membershipId} onChange={(event) => setMembershipId(event.target.value)} className="mt-2 w-full max-w-xl rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]"><option value="">Seçin</option>{memberships.map((membership) => <option key={membership.id} value={membership.id}>{membership.user.firstName} {membership.user.lastName} · {membership.user.email} · {membership.role.name}</option>)}</Select></label>
      </section>

      {simulating ? <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-5 py-10 text-center text-sm text-[var(--muted)]">Kullanıcının yetkileri hesaplanıyor…</div> : null}

      {!simulating && effective ? <>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"><div className="text-xs text-[var(--muted)]">Rol</div><div className="mt-1 text-sm font-semibold">{effective.role.name}</div></article>
          <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"><div className="text-xs text-[var(--muted)]">Kapsam</div><div className="mt-1 text-sm font-semibold">{scopeLabel[effective.role.scope]}</div></article>
          <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"><div className="text-xs text-[var(--muted)]">Etkin Yetki</div><div className="mt-1 text-2xl font-semibold">{effective.permissions.length}</div></article>
          <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"><div className="text-xs text-[var(--muted)]">Geçici Yetki</div><div className="mt-1 text-2xl font-semibold">{temporaryPermissions.length}</div></article>
          <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"><div className="text-xs text-[var(--muted)]">Yüksek Risk</div><div className={`mt-1 text-2xl font-semibold ${riskPermissions.length ? "text-[#9a4545]" : "text-[#378a5e]"}`}>{riskPermissions.length}</div></article>
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="grid gap-4 md:grid-cols-2"><div><h2 className="text-sm font-semibold">Organizasyon Erişimi</h2><p className="mt-1 text-xs text-[var(--muted)]">Şirket: {effective.access.company?.name ?? "—"}</p></div><div><h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">Erişilebilir Şubeler</h3><div className="mt-2 flex flex-wrap gap-2">{effective.access.branches.length ? effective.access.branches.map((branch) => <span key={branch.id} className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium">{branch.name} · {branch.code}</span>) : <span className="text-xs text-[var(--muted)]">Rol kapsamı nedeniyle açık şube ataması yok.</span>}</div></div></div>
        </section>

        {riskPermissions.length ? <section className="rounded-2xl border border-[#f0d8d8] bg-[#fffafa] p-5"><h2 className="text-sm font-semibold text-[#9a4545]">Yüksek Riskli Etkin Yetkiler</h2><div className="mt-3 flex flex-wrap gap-2">{riskPermissions.map((permission) => <span key={`${permission.source}-${permission.id}`} className="rounded-full border border-[#f0d8d8] bg-white px-2.5 py-1 text-xs font-semibold text-[#9a4545]">{userPermissionLabel(permission.resource, permission.action)} · {permission.source === "TEMPORARY" ? "Geçici" : "Rol"}</span>)}</div></section> : null}

        <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
          <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold">Etkin Yetkiler</h2><p className="mt-1 text-xs text-[var(--muted)]">Rol üzerinden gelen ve geçici olarak verilen yetkilerin toplamı.</p></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Yetki ara…" className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs" /></div>
          <div className="divide-y divide-[var(--line)]">{rows.map((permission) => <article key={`${permission.source}-${permission.id}-${permission.temporaryGrant?.id ?? "role"}`} className="grid gap-2 px-5 py-4 md:grid-cols-[1fr_160px_2fr]"><div><div className="text-xs font-semibold text-[var(--ink)]">{userPermissionLabel(permission.resource, permission.action)}</div><div className="mt-1 text-xs text-[var(--muted)]">{`${userPermissionLabel(permission.resource, permission.action)} yetkisi.`}</div></div><div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${permission.source === "TEMPORARY" ? "bg-[#fff4e6] text-[#a66518]" : "bg-[var(--accent-soft)] text-[var(--accent)]"}`}>{permission.source === "TEMPORARY" ? "Geçici" : "Rol"}</span></div><div className="text-xs text-[var(--muted)]">{permission.source === "TEMPORARY" && permission.temporaryGrant ? <>{permission.temporaryGrant.branchId ? "Belirli şube" : "Şirket geneli"}<br />Bitiş: {new Date(permission.temporaryGrant.endsAt).toLocaleString("tr-TR")}<br />Gerekçe: {permission.temporaryGrant.reason}</> : `Kaynak rol: ${permission.sourceRole?.name ?? effective.role.name}`}</div></article>)}</div>
        </section>
      </> : null}
    </main>
  );
}
