"use client";

import { useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";

type Role = {
  id: string;
  name: string;
  slug: string;
  scope: "CENTRAL" | "COMPANY" | "BRANCH";
};

type Branch = {
  id: string;
  name: string;
  code: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
};

type Invitation = {
  id: string;
  email: string;
  roleId: string;
  roleName: string;
  roleSlug: string;
  roleScope: Role["scope"];
  branchIds: string[];
  expiresAt: string;
  revokedAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
};

type CreatedInvitation = {
  id: string;
  email: string;
  branchIds: string[];
  expiresAt: string;
  status: "PENDING";
  token: string;
  role: Role;
};

const STATUS_LABELS: Record<Invitation["status"], string> = {
  PENDING: "Bekliyor",
  ACCEPTED: "Kabul Edildi",
  REVOKED: "İptal Edildi",
  EXPIRED: "Süresi Doldu",
};

export default function InvitationsPage() {
  const { showToast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [expiresInHours, setExpiresInHours] = useState(72);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === roleId) ?? null,
    [roleId, roles],
  );

  async function load() {
    const [roleData, branchData, invitationData] = await Promise.all([
      api<Role[]>("/roles"),
      api<Branch[]>("/admin/organization/branches"),
      api<Invitation[]>("/auth/invitations"),
    ]);
    setRoles(roleData);
    setBranches(branchData.filter((branch) => branch.status === "ACTIVE"));
    setInvitations(invitationData);
    setRoleId((current) => current || roleData[0]?.id || "");
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      api<Role[]>("/roles"),
      api<Branch[]>("/admin/organization/branches"),
      api<Invitation[]>("/auth/invitations"),
    ])
      .then(([roleData, branchData, invitationData]) => {
        if (!active) return;
        setRoles(roleData);
        setBranches(branchData.filter((branch) => branch.status === "ACTIVE"));
        setInvitations(invitationData);
        setRoleId(roleData[0]?.id || "");
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "Davetler yüklenemedi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (selectedRole?.scope === "CENTRAL") setBranchIds([]);
  }, [selectedRole?.scope]);

  async function createInvitation() {
    if (!roleId || !email.trim()) return;
    if (selectedRole?.scope === "BRANCH" && branchIds.length === 0) {
      setError("Şube kapsamlı rol için en az bir şube seçin.");
      return;
    }

    setSaving(true);
    setError("");
    setCreated(null);
    try {
      const result = await api<CreatedInvitation>("/auth/invitations", {
        method: "POST",
        body: { email, roleId, branchIds, expiresInHours },
      });
      setCreated(result);
      setEmail("");
      setBranchIds([]);
      await load();
      showToast("Kullanıcı daveti oluşturuldu.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Davet oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function revokeInvitation(id: string) {
    setRevokingId(id);
    setError("");
    try {
      await api(`/auth/invitations/${id}/revoke`, { method: "POST" });
      await load();
      showToast("Davet iptal edildi.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Davet iptal edilemedi.");
    } finally {
      setRevokingId(null);
    }
  }

  const acceptanceUrl = created && typeof window !== "undefined"
    ? `${window.location.origin}/accept-invitation?token=${encodeURIComponent(created.token)}`
    : "";

  async function copyAcceptanceUrl() {
    if (!acceptanceUrl) return;
    await navigator.clipboard.writeText(acceptanceUrl);
    showToast("Davet bağlantısı kopyalandı.");
  }

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-sm text-[var(--muted)]">Yükleniyor…</div>;
  }

  return (
    <main className="mx-auto w-full max-w-[1240px] space-y-6 pb-10">
      <header className="border-b border-[var(--line)] pb-5">
        <div className="mb-1 text-xs font-medium text-[var(--muted)]">Yönetim / Kimlik ve Güvenlik</div>
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">Kullanıcı Davetleri</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">Kullanıcıları parola toplamadan davet edin; rol ve organizasyon kapsamını aktivasyondan önce belirleyin.</p>
      </header>

      {error ? <div className="rounded-xl border border-[#f0d8d8] bg-[#fff8f8] px-4 py-3 text-sm text-[#9a4545]">{error}</div> : null}

      {created ? (
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Tek Seferlik Davet Bağlantısı</div>
          <p className="mt-2 text-sm text-[var(--ink)]">Bu bağlantı yalnız şimdi gösterilir. Sistem açık tokenı saklamaz.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input readOnly value={acceptanceUrl} className="min-h-10 flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 text-xs" />
            <button type="button" onClick={() => void copyAcceptanceUrl()} className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white">Bağlantıyı Kopyala</button>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Yeni Davet</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="space-y-1.5 text-xs font-medium text-[var(--muted)]">E-posta
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="kullanici@sirket.com" className="block min-h-10 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)]" />
          </label>
          <label className="space-y-1.5 text-xs font-medium text-[var(--muted)]">Rol
            <select value={roleId} onChange={(event) => setRoleId(event.target.value)} className="block min-h-10 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)]">
              {roles.map((role) => <option key={role.id} value={role.id}>{role.name} · {role.scope}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-medium text-[var(--muted)]">Geçerlilik
            <select value={expiresInHours} onChange={(event) => setExpiresInHours(Number(event.target.value))} className="block min-h-10 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)]">
              <option value={24}>24 saat</option><option value={72}>3 gün</option><option value={168}>7 gün</option>
            </select>
          </label>
        </div>

        {selectedRole?.scope !== "CENTRAL" ? (
          <div className="mt-4">
            <div className="text-xs font-medium text-[var(--muted)]">Şube erişimi {selectedRole?.scope === "BRANCH" ? "· zorunlu" : "· isteğe bağlı"}</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {branches.map((branch) => {
                const checked = branchIds.includes(branch.id);
                return <label key={branch.id} className="flex items-center gap-2 rounded-xl border border-[var(--line)] p-3 text-sm text-[var(--ink)]">
                  <input type="checkbox" checked={checked} onChange={() => setBranchIds((current) => checked ? current.filter((id) => id !== branch.id) : [...current, branch.id])} />
                  <span>{branch.name} · {branch.code}</span>
                </label>;
              })}
            </div>
          </div>
        ) : <p className="mt-4 text-xs text-[var(--muted)]">Merkez kapsamlı rol tüm mevcut şirket kapsamını kullanır; explicit şube ataması yapılmaz.</p>}

        <div className="mt-5 flex justify-end">
          <button type="button" disabled={saving || !email.trim() || !roleId} onClick={() => void createInvitation()} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Oluşturuluyor…" : "Davet Oluştur"}</button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        <div className="border-b border-[var(--line)] px-4 py-3"><h2 className="text-sm font-semibold text-[var(--ink)]">Davet Geçmişi</h2><p className="mt-0.5 text-xs text-[var(--muted)]">Tokenlar listelenmez; yalnız davet durumu ve kapsamı görünür.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs text-[var(--muted)]"><tr><th className="px-4 py-3 font-medium">E-posta</th><th className="px-4 py-3 font-medium">Rol / Kapsam</th><th className="px-4 py-3 font-medium">Durum</th><th className="px-4 py-3 font-medium">Bitiş</th><th className="px-4 py-3 text-right font-medium">İşlem</th></tr></thead>
            <tbody>
              {invitations.map((invitation) => <tr key={invitation.id} className="border-b border-[var(--line)] last:border-0">
                <td className="px-4 py-4 font-medium text-[var(--ink)]">{invitation.email}</td>
                <td className="px-4 py-4"><div>{invitation.roleName}</div><div className="text-xs text-[var(--muted)]">{invitation.roleScope} · {invitation.branchIds.length} şube</div></td>
                <td className="px-4 py-4"><span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold">{STATUS_LABELS[invitation.status]}</span></td>
                <td className="px-4 py-4 text-xs text-[var(--muted)]">{new Date(invitation.expiresAt).toLocaleString("tr-TR")}</td>
                <td className="px-4 py-4 text-right">{invitation.status === "PENDING" ? <button type="button" disabled={revokingId === invitation.id} onClick={() => void revokeInvitation(invitation.id)} className="rounded-lg border border-[#f0d8d8] px-3 py-2 text-xs font-medium text-[#9a4545] disabled:opacity-50">İptal Et</button> : <span className="text-xs text-[var(--muted)]">—</span>}</td>
              </tr>)}
              {!invitations.length ? <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-[var(--muted)]">Henüz davet oluşturulmadı.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
