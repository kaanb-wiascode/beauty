"use client";

import { useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";

type Permission = {
  id: string;
  resource: string;
  action: string;
  description: string | null;
};

type RolePermission = { permission: Permission };

type Role = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  rolePermissions?: RolePermission[];
  _count: { memberships: number; rolePermissions?: number };
};

type Membership = {
  id: string;
  status: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  role: { id: string; name: string; slug: string };
};

const RESOURCE_LABELS: Record<string, string> = {
  customers: "Müşteriler",
  appointments: "Randevular",
  payments: "Ödemeler",
  reports: "Raporlar",
  staff: "Personel",
  services: "Hizmetler",
  roles: "Roller",
};

const ACTION_LABELS: Record<string, string> = {
  read: "Görüntüleme",
  create: "Oluşturma",
  update: "Düzenleme",
  delete: "Silme",
  cancel: "İptal",
  refund: "İade",
};

const ROLE_TONES = [
  "bg-[#eeebff] text-[#6658e8]",
  "bg-[#eaf7ef] text-[#378a5e]",
  "bg-[#fff4e6] text-[#c47b24]",
  "bg-[#f8eaf0] text-[#b65e7d]",
];

export default function RolesPage() {
  const { showToast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [creatingRole, setCreatingRole] = useState(false);
  const [newUserFirstName, setNewUserFirstName] = useState("");
  const [newUserLastName, setNewUserLastName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRoleId, setNewUserRoleId] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [membershipSavingId, setMembershipSavingId] = useState<string | null>(null);

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  );

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, Permission[]>();
    permissions.forEach((permission) => {
      const list = groups.get(permission.resource) ?? [];
      list.push(permission);
      groups.set(permission.resource, list);
    });
    return [...groups.entries()];
  }, [permissions]);

  const selectedMembers = useMemo(
    () => memberships.filter((membership) => membership.role.id === selectedRoleId),
    [memberships, selectedRoleId],
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [roleData, permissionData, membershipData] = await Promise.all([
        api<Role[]>("/roles"),
        api<Permission[]>("/roles/permissions"),
        api<Membership[]>("/memberships"),
      ]);
      setRoles(roleData);
      setPermissions(permissionData);
      setMemberships(membershipData);
      setSelectedRoleId((current) =>
        current && roleData.some((role) => role.id === current)
          ? current
          : roleData[0]?.id ?? "",
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Roller ve kullanıcılar yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selectedRoleId) {
      setSelectedPermissionIds([]);
      return;
    }
    void api<Role>(`/roles/${selectedRoleId}`)
      .then((role) => setSelectedPermissionIds((role.rolePermissions ?? []).map((item) => item.permission.id)))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Rol izinleri yüklenemedi.");
        setSelectedPermissionIds([]);
      });
  }, [selectedRoleId]);

  function togglePermission(permissionId: string) {
    setSelectedPermissionIds((current) =>
      current.includes(permissionId)
        ? current.filter((id) => id !== permissionId)
        : [...current, permissionId],
    );
  }

  function toggleResource(resource: string) {
    const ids = (permissions.filter((permission) => permission.resource === resource)).map(
      (permission) => permission.id,
    );
    const allSelected = ids.every((id) => selectedPermissionIds.includes(id));
    setSelectedPermissionIds((current) =>
      allSelected
        ? current.filter((id) => !ids.includes(id))
        : [...new Set([...current, ...ids])],
    );
  }

  async function savePermissions() {
    if (!selectedRole) return;
    setSaving(true);
    setError("");
    try {
      const updated = await api<Role>(`/roles/${selectedRole.id}/permissions`, {
        method: "PATCH",
        body: { permissionIds: selectedPermissionIds },
      });
      setRoles((current) => current.map((role) => (role.id === updated.id ? updated : role)));
      setSelectedPermissionIds((updated.rolePermissions ?? []).map((item) => item.permission.id));
      showToast("Rol yetkileri güncellendi.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Yetkiler kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function createRole() {
    const name = newRoleName.trim();
    if (name.length < 2) {
      setError("Rol adı en az 2 karakter olmalıdır.");
      return;
    }
    setCreatingRole(true);
    setError("");
    try {
      const role = await api<Role>("/roles", {
        method: "POST",
        body: { name, description: newRoleDescription.trim() || undefined },
      });
      setRoles((current) => [...current, role]);
      setSelectedRoleId(role.id);
      setCreateOpen(false);
      setNewRoleName("");
      setNewRoleDescription("");
      showToast("Rol oluşturuldu.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Rol oluşturulamadı.");
    } finally {
      setCreatingRole(false);
    }
  }

  async function createUser() {
    const firstName = newUserFirstName.trim();
    const lastName = newUserLastName.trim();
    const email = newUserEmail.trim();
    const password = newUserPassword.trim();
    if (!firstName || !lastName) return setError("Ad ve soyad zorunludur.");
    if (!email.includes("@")) return setError("Geçerli bir e-posta adresi girin.");
    if (password.length < 8) return setError("Şifre en az 8 karakter olmalıdır.");
    if (!newUserRoleId) return setError("Bir rol seçin.");
    setCreatingUser(true);
    setError("");
    try {
      const result = await api<{
        user: Membership["user"];
        membership: { id: string; role: string; roleName: string; status: string };
      }>("/auth/users", {
        method: "POST",
        body: { firstName, lastName, email, password, roleId: newUserRoleId },
      });
      const role = roles.find((item) => item.id === newUserRoleId);
      setMemberships((current) => [
        ...current,
        {
          id: result.membership.id,
          status: result.membership.status,
          user: result.user,
          role: { id: newUserRoleId, name: role?.name ?? result.membership.roleName, slug: result.membership.role },
        },
      ]);
      setRoles((current) => current.map((role) =>
        role.id === newUserRoleId
          ? { ...role, _count: { ...role._count, memberships: role._count.memberships + 1 } }
          : role,
      ));
      setCreateUserOpen(false);
      setNewUserFirstName("");
      setNewUserLastName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRoleId("");
      showToast("Kullanıcı oluşturuldu.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kullanıcı oluşturulamadı.");
    } finally {
      setCreatingUser(false);
    }
  }

  async function changeMembershipStatus(membershipId: string, status: "ACTIVE" | "SUSPENDED") {
    setMembershipSavingId(membershipId);
    setError("");
    try {
      const updated = await api<Membership>(`/memberships/${membershipId}/status`, {
        method: "PATCH",
        body: { status },
      });
      setMemberships((current) => current.map((membership) => membership.id === updated.id ? updated : membership));
      showToast(status === "ACTIVE" ? "Kullanıcı aktifleştirildi." : "Kullanıcı askıya alındı.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kullanıcı durumu güncellenemedi.");
    } finally {
      setMembershipSavingId(null);
    }
  }

  async function changeMembershipRole(membershipId: string, roleId: string) {
    setMembershipSavingId(membershipId);
    setError("");
    try {
      const updated = await api<Membership>(`/memberships/${membershipId}/role`, {
        method: "PATCH",
        body: { roleId },
      });
      const previous = memberships.find((membership) => membership.id === membershipId);
      setMemberships((current) => current.map((membership) => membership.id === updated.id ? updated : membership));
      setRoles((current) => current.map((role) => {
        if (previous?.role.id === role.id && previous.role.id !== updated.role.id) {
          return { ...role, _count: { ...role._count, memberships: Math.max(0, role._count.memberships - 1) } };
        }
        if (updated.role.id === role.id && previous?.role.id !== updated.role.id) {
          return { ...role, _count: { ...role._count, memberships: role._count.memberships + 1 } };
        }
        return role;
      }));
      showToast("Kullanıcı rolü güncellendi.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kullanıcı rolü güncellenemedi.");
    } finally {
      setMembershipSavingId(null);
    }
  }

  async function removeMembership(membershipId: string) {
    const membership = memberships.find((item) => item.id === membershipId);
    if (!membership) return;
    if (!window.confirm(`${membership.user.firstName} ${membership.user.lastName} kullanıcısını bu salondan kaldırmak istediğinize emin misiniz?`)) return;
    setMembershipSavingId(membershipId);
    setError("");
    try {
      await api(`/memberships/${membershipId}`, { method: "DELETE" });
      setMemberships((current) => current.filter((item) => item.id !== membershipId));
      if (membership.status === "ACTIVE") {
        setRoles((current) => current.map((role) => role.id === membership.role.id
          ? { ...role, _count: { ...role._count, memberships: Math.max(0, role._count.memberships - 1) } }
          : role,
        ));
      }
      showToast("Kullanıcı salondan kaldırıldı.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kullanıcı kaldırılamadı.");
    } finally {
      setMembershipSavingId(null);
    }
  }

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-sm text-[#73757c]">Yükleniyor…</div>;
  }

  const activeMembers = roles.reduce((sum, role) => sum + role._count.memberships, 0);
  const totalPermissions = permissions.length;
  const selectedCount = selectedPermissionIds.length;

  return (
    <div className="mx-auto w-full max-w-[1240px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 border-b border-[#e8e8e9] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 text-xs font-medium text-[#96979c]">AYARLAR / EKİP</div>
          <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[#17181b]">Roller ve Yetkiler</h1>
          <p className="mt-1 text-sm text-[#73757c]">Ekibinizin erişim seviyelerini ve sistem yetkilerini yönetin.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setCreateUserOpen(true)} className="min-h-10 rounded-xl border border-[#dfdfe1] bg-white px-4 text-sm font-medium text-[#28292d] transition hover:bg-[#fafafa]">+ Kullanıcı ekle</button>
          <button type="button" onClick={() => setCreateOpen(true)} className="min-h-10 rounded-xl bg-[#191a1d] px-4 text-sm font-semibold text-white transition hover:bg-[#303136]">+ Yeni rol</button>
        </div>
      </header>

      {error ? (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-[#f0d8d8] bg-[#fff8f8] px-4 py-3 text-sm text-[#9a4545]">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="shrink-0 text-xs font-semibold">Kapat</button>
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#e7e7e8] bg-white p-4">
          <div className="text-xs font-medium text-[#85868c]">Toplam rol</div>
          <div className="mt-2 text-[25px] font-semibold tracking-[-0.03em]">{roles.length}</div>
          <div className="mt-1 text-xs text-[#a0a1a5]">Sistem ve özel roller</div>
        </div>
        <div className="rounded-2xl border border-[#e7e7e8] bg-white p-4">
          <div className="text-xs font-medium text-[#85868c]">Aktif kullanıcı</div>
          <div className="mt-2 text-[25px] font-semibold tracking-[-0.03em]">{activeMembers}</div>
          <div className="mt-1 text-xs text-[#a0a1a5]">Ekibinizde aktif</div>
        </div>
        <div className="rounded-2xl border border-[#e7e7e8] bg-white p-4">
          <div className="text-xs font-medium text-[#85868c]">Sistem yetkisi</div>
          <div className="mt-2 text-[25px] font-semibold tracking-[-0.03em]">{totalPermissions}</div>
          <div className="mt-1 text-xs text-[#a0a1a5]">Tanımlı erişim kuralı</div>
        </div>
      </section>

      <section className="grid min-w-0 gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="min-w-0 rounded-2xl border border-[#e7e7e8] bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Roller</h2>
              <p className="mt-0.5 text-xs text-[#8c8d92]">Erişim profilleri</p>
            </div>
            <span className="rounded-full bg-[#f5f5f6] px-2.5 py-1 text-[11px] text-[#77787e]">{roles.length} rol</span>
          </div>
          <div className="space-y-2">
            {roles.map((role, index) => {
              const selected = role.id === selectedRoleId;
              const tone = ROLE_TONES[index % ROLE_TONES.length];
              return (
                <button key={role.id} type="button" onClick={() => setSelectedRoleId(role.id)} className={`flex w-full min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition ${selected ? "border-[#c8c1ff] bg-[#faf9ff] shadow-[0_0_0_3px_#f1efff]" : "border-[#e8e8e9] bg-white hover:border-[#d8d8da] hover:bg-[#fcfcfc]"}`}>
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${tone}`}>{role.name.charAt(0).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[#242529]">{role.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-[#85868c]">{role.description || "Özel erişim profili"}</span>
                  </span>
                  <span className="shrink-0 text-xs text-[#85868c]">{role._count.memberships}</span>
                  <span className="text-lg leading-none text-[#aaaab0]">›</span>
                </button>
              );
            })}
            {roles.length === 0 ? <div className="rounded-xl border border-dashed border-[#dedee0] px-4 py-8 text-center text-sm text-[#88898f]">Henüz rol oluşturulmamış.</div> : null}
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-[#e7e7e8] bg-white">
          {selectedRole ? (
            <>
              <div className="flex flex-col gap-4 border-b border-[#e8e8e9] p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold tracking-[-0.03em]">{selectedRole.name}</h2>
                    <span className="rounded-full bg-[#f4f4f5] px-2.5 py-1 text-[10px] font-semibold text-[#77787e]">{selectedRole._count.memberships} kullanıcı</span>
                  </div>
                  <p className="mt-1 text-sm text-[#85868c]">{selectedRole.description || "Bu rol için erişim seviyelerini aşağıdan yönetin."}</p>
                </div>
                <button type="button" onClick={savePermissions} disabled={saving} className="min-h-10 shrink-0 rounded-xl bg-[#191a1d] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Kaydediliyor…" : "Yetkileri kaydet"}</button>
              </div>

              <div className="p-5">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Yetki matrisi</h3>
                    <p className="mt-1 text-xs text-[#85868c]">Modül bazında hangi işlemlere erişileceğini seçin.</p>
                  </div>
                  <span className="rounded-full bg-[#f7f7f8] px-2.5 py-1 text-[11px] font-medium text-[#77787e]">{selectedCount} / {totalPermissions} seçili</span>
                </div>

                <div className="overflow-hidden rounded-xl border border-[#e8e8e9]">
                  <div className="hidden grid-cols-[minmax(150px,1fr)_repeat(6,minmax(80px,1fr))] gap-0 bg-[#fafafa] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[#8b8c91] md:grid">
                    <div>Modül</div>
                    {Object.values(ACTION_LABELS).map((label) => <div key={label} className="text-center">{label}</div>)}
                  </div>
                  <div className="divide-y divide-[#eeeeef]">
                    {groupedPermissions.map(([resource, resourcePermissions]) => {
                      const resourceIds = resourcePermissions.map((permission) => permission.id);
                      const allSelected = resourceIds.length > 0 && resourceIds.every((id) => selectedPermissionIds.includes(id));
                      return (
                        <div key={resource} className="p-3 md:grid md:grid-cols-[minmax(150px,1fr)_repeat(6,minmax(80px,1fr))] md:items-center md:gap-0">
                          <button type="button" onClick={() => toggleResource(resource)} className="mb-3 flex min-w-0 items-center gap-2 text-left md:mb-0">
                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${allSelected ? "bg-[#eeebff] text-[#6658e8]" : "bg-[#f4f4f5] text-[#77787e]"}`}>{(RESOURCE_LABELS[resource] || resource).charAt(0)}</span>
                            <span className="min-w-0"><span className="block truncate text-sm font-semibold">{RESOURCE_LABELS[resource] || resource}</span><span className="block text-[10px] text-[#9a9b9f]">{resourcePermissions.length} yetki</span></span>
                          </button>
                          {Object.keys(ACTION_LABELS).map((action) => {
                            const permission = resourcePermissions.find((item) => item.action === action);
                            const checked = permission ? selectedPermissionIds.includes(permission.id) : false;
                            return (
                              <label key={action} className="flex min-h-11 items-center justify-between gap-3 border-t border-[#f1f1f2] py-2 md:justify-center md:border-t-0 md:py-0">
                                <span className="text-xs text-[#77787e] md:hidden">{ACTION_LABELS[action]}</span>
                                {permission ? (
                                  <input aria-label={`${RESOURCE_LABELS[resource] || resource} ${ACTION_LABELS[action]}`} type="checkbox" checked={checked} onChange={() => togglePermission(permission.id)} className="h-4 w-4 accent-[#6658e8]" />
                                ) : <span className="text-xs text-[#c1c1c5]">—</span>}
                              </label>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="border-t border-[#e8e8e9] p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div><h3 className="text-sm font-semibold">Bu roldeki kullanıcılar</h3><p className="mt-1 text-xs text-[#85868c]">Rol atamalarını buradan da yönetebilirsiniz.</p></div>
                  <button type="button" onClick={() => { setNewUserRoleId(selectedRole.id); setCreateUserOpen(true); }} className="rounded-lg border border-[#dfdfe1] px-3 py-2 text-xs font-semibold">+ Kullanıcı</button>
                </div>
                <div className="divide-y divide-[#eeeeef] rounded-xl border border-[#e8e8e9]">
                  {selectedMembers.length ? selectedMembers.map((membership) => (
                    <div key={membership.id} className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f0f1f4] text-[11px] font-semibold text-[#62656e]">{membership.user.firstName.charAt(0)}{membership.user.lastName.charAt(0)}</span>
                        <div className="min-w-0"><div className="truncate text-sm font-semibold">{membership.user.firstName} {membership.user.lastName}</div><div className="truncate text-xs text-[#8a8b90]">{membership.user.email}</div></div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select value={membership.role.id} disabled={membershipSavingId === membership.id} onChange={(event) => void changeMembershipRole(membership.id, event.target.value)} className="min-h-9 rounded-lg border border-[#dfdfe1] bg-white px-2.5 text-xs">
                          {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                        </select>
                        <button type="button" disabled={membershipSavingId === membership.id} onClick={() => void changeMembershipStatus(membership.id, membership.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE")} className="min-h-9 rounded-lg border border-[#dfdfe1] px-2.5 text-xs font-medium disabled:opacity-50">{membership.status === "ACTIVE" ? "Askıya al" : "Aktifleştir"}</button>
                        <button type="button" disabled={membershipSavingId === membership.id} onClick={() => void removeMembership(membership.id)} className="min-h-9 rounded-lg border border-[#f0dddd] px-2.5 text-xs font-medium text-[#a34f4f] disabled:opacity-50">Kaldır</button>
                      </div>
                    </div>
                  )) : <div className="px-4 py-8 text-center text-sm text-[#88898f]">Bu rolde henüz kullanıcı yok.</div>}
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-[420px] items-center justify-center p-8 text-center"><div><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f4f4f5] text-lg">↗</div><h2 className="mt-3 text-base font-semibold">Bir rol seçin</h2><p className="mt-1 text-sm text-[#85868c]">Yetkilerini görmek ve düzenlemek için soldan bir rol seçin.</p></div></div>
          )}
        </div>
      </section>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true">
          <form onSubmit={(event) => { event.preventDefault(); void createRole(); }} className="w-full max-w-md rounded-2xl border border-[#e3e3e5] bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Yeni rol oluştur</h2><p className="mt-1 text-xs text-[#85868c]">Ekibiniz için yeni bir erişim profili oluşturun.</p></div><button type="button" onClick={() => setCreateOpen(false)} className="text-xl text-[#8b8c91]">×</button></div>
            <div className="mt-5 space-y-4">
              <label className="block"><span className="mb-1.5 block text-xs font-medium">Rol adı</span><input autoFocus value={newRoleName} onChange={(event) => setNewRoleName(event.target.value)} className="min-h-11 w-full rounded-xl border border-[#dfdfe1] px-3 text-sm outline-none focus:border-[#b8b0ff]" placeholder="Örn. Salon Müdürü" /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-medium">Açıklama</span><textarea value={newRoleDescription} onChange={(event) => setNewRoleDescription(event.target.value)} rows={3} className="w-full rounded-xl border border-[#dfdfe1] px-3 py-2.5 text-sm outline-none focus:border-[#b8b0ff]" placeholder="Bu rolün erişim kapsamını kısaca açıklayın." /></label>
            </div>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setCreateOpen(false)} className="min-h-10 rounded-xl border border-[#dfdfe1] px-4 text-sm">Vazgeç</button><button type="submit" disabled={creatingRole} className="min-h-10 rounded-xl bg-[#191a1d] px-4 text-sm font-semibold text-white disabled:opacity-50">{creatingRole ? "Oluşturuluyor…" : "Rol oluştur"}</button></div>
          </form>
        </div>
      ) : null}

      {createUserOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true">
          <form onSubmit={(event) => { event.preventDefault(); void createUser(); }} className="w-full max-w-lg rounded-2xl border border-[#e3e3e5] bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Yeni kullanıcı</h2><p className="mt-1 text-xs text-[#85868c]">Kullanıcıyı oluşturup bir role atayın.</p></div><button type="button" onClick={() => setCreateUserOpen(false)} className="text-xl text-[#8b8c91]">×</button></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label><span className="mb-1.5 block text-xs font-medium">Ad</span><input autoFocus value={newUserFirstName} onChange={(event) => setNewUserFirstName(event.target.value)} className="min-h-11 w-full rounded-xl border border-[#dfdfe1] px-3 text-sm" /></label>
              <label><span className="mb-1.5 block text-xs font-medium">Soyad</span><input value={newUserLastName} onChange={(event) => setNewUserLastName(event.target.value)} className="min-h-11 w-full rounded-xl border border-[#dfdfe1] px-3 text-sm" /></label>
              <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium">E-posta</span><input type="email" value={newUserEmail} onChange={(event) => setNewUserEmail(event.target.value)} className="min-h-11 w-full rounded-xl border border-[#dfdfe1] px-3 text-sm" /></label>
              <label><span className="mb-1.5 block text-xs font-medium">Geçici şifre</span><input type="password" value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} className="min-h-11 w-full rounded-xl border border-[#dfdfe1] px-3 text-sm" /></label>
              <label><span className="mb-1.5 block text-xs font-medium">Rol</span><select value={newUserRoleId} onChange={(event) => setNewUserRoleId(event.target.value)} className="min-h-11 w-full rounded-xl border border-[#dfdfe1] bg-white px-3 text-sm"><option value="">Rol seçin</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
            </div>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setCreateUserOpen(false)} className="min-h-10 rounded-xl border border-[#dfdfe1] px-4 text-sm">Vazgeç</button><button type="submit" disabled={creatingUser} className="min-h-10 rounded-xl bg-[#191a1d] px-4 text-sm font-semibold text-white disabled:opacity-50">{creatingUser ? "Oluşturuluyor…" : "Kullanıcı oluştur"}</button></div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
