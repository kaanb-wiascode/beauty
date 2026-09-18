"use client";

import { useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";

type Permission = { id: string; resource: string; action: string; description: string | null };
type RolePermission = { permission: Permission };
type Role = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  rolePermissions?: RolePermission[];
  _count: { memberships: number; rolePermissions?: number };
};

const RESOURCE_LABELS: Record<string, string> = {
  customers: "Müşteriler", appointments: "Randevular", payments: "Ödemeler", reports: "Raporlar",
  staff: "Personel", services: "Hizmetler", roles: "Roller ve Yetkiler", inventory: "Envanter",
  crm: "Müşteri İlişkileri", training: "Eğitim ve Gelişim", quality: "Kalite Yönetimi",
  finance: "Finans Yönetimi", accounting: "Muhasebe", hr: "İnsan Kaynakları", platform: "Platform",
};
const ACTION_LABELS: Record<string, string> = {
  read: "Görüntüleme", create: "Oluşturma", update: "Düzenleme", delete: "Silme", cancel: "İptal",
  refund: "İade", write: "Yönetme", manage: "Yönetme", approve: "Onaylama", reconcile: "Mutabakat", export: "Dışa Aktarma",
};

export default function RolesPage() {
  const { showToast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);
  const [savedPermissionIds, setSavedPermissionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [resourceFilter, setResourceFilter] = useState("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [creatingRole, setCreatingRole] = useState(false);

  const selectedRole = useMemo(() => roles.find((role) => role.id === selectedRoleId) ?? null, [roles, selectedRoleId]);
  const dirty = useMemo(() => [...selectedPermissionIds].sort().join(",") !== [...savedPermissionIds].sort().join(","), [savedPermissionIds, selectedPermissionIds]);
  const resources = useMemo(() => [...new Set(permissions.map((permission) => permission.resource))].sort(), [permissions]);
  const groupedPermissions = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("tr-TR");
    const groups = new Map<string, Permission[]>();
    permissions.forEach((permission) => {
      if (resourceFilter !== "ALL" && permission.resource !== resourceFilter) return;
      const label = `${RESOURCE_LABELS[permission.resource] ?? permission.resource} ${ACTION_LABELS[permission.action] ?? permission.action} ${permission.description ?? ""}`.toLocaleLowerCase("tr-TR");
      if (normalized && !label.includes(normalized)) return;
      groups.set(permission.resource, [...(groups.get(permission.resource) ?? []), permission]);
    });
    return [...groups.entries()];
  }, [permissions, resourceFilter, search]);

  useEffect(() => {
    let active = true;
    Promise.all([api<Role[]>("/roles"), api<Permission[]>("/roles/permissions")])
      .then(([roleData, permissionData]) => {
        if (!active) return;
        setRoles(roleData);
        setPermissions(permissionData);
        setSelectedRoleId(roleData[0]?.id ?? "");
      })
      .catch((err) => { if (active) setError(err instanceof ApiError ? err.message : "Roller yüklenemedi."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedRoleId) { setSelectedPermissionIds([]); setSavedPermissionIds([]); return; }
    let active = true;
    api<Role>(`/roles/${selectedRoleId}`)
      .then((role) => {
        if (!active) return;
        const ids = (role.rolePermissions ?? []).map((item) => item.permission.id);
        setSelectedPermissionIds(ids);
        setSavedPermissionIds(ids);
      })
      .catch((err) => { if (active) setError(err instanceof ApiError ? err.message : "Rol yetkileri yüklenemedi."); });
    return () => { active = false; };
  }, [selectedRoleId]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function selectRole(roleId: string) {
    if (dirty && !window.confirm("Kaydedilmemiş yetki değişiklikleri var. Rol değiştirmek istiyor musunuz?")) return;
    setSelectedRoleId(roleId);
  }
  function togglePermission(id: string) {
    setSelectedPermissionIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }
  function toggleResource(resource: string) {
    const ids = permissions.filter((permission) => permission.resource === resource).map((permission) => permission.id);
    const all = ids.length > 0 && ids.every((id) => selectedPermissionIds.includes(id));
    setSelectedPermissionIds((current) => all ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  }
  async function savePermissions() {
    if (!selectedRole) return;
    setSaving(true); setError("");
    try {
      const updated = await api<Role>(`/roles/${selectedRole.id}/permissions`, { method: "PATCH", body: { permissionIds: selectedPermissionIds } });
      const ids = (updated.rolePermissions ?? []).map((item) => item.permission.id);
      setSelectedPermissionIds(ids); setSavedPermissionIds(ids);
      setRoles((current) => current.map((role) => role.id === updated.id ? { ...role, _count: { ...role._count, rolePermissions: ids.length } } : role));
      showToast("Rol yetkileri güncellendi.");
    } catch (err) { setError(err instanceof ApiError ? err.message : "Yetkiler kaydedilemedi."); }
    finally { setSaving(false); }
  }
  async function createRole() {
    const name = newRoleName.trim();
    if (name.length < 2) return setError("Rol adı en az 2 karakter olmalıdır.");
    setCreatingRole(true); setError("");
    try {
      const role = await api<Role>("/roles", { method: "POST", body: { name, description: newRoleDescription.trim() || undefined } });
      setRoles((current) => [...current, role]); setSelectedRoleId(role.id); setCreateOpen(false); setNewRoleName(""); setNewRoleDescription("");
      showToast("Rol oluşturuldu.");
    } catch (err) { setError(err instanceof ApiError ? err.message : "Rol oluşturulamadı."); }
    finally { setCreatingRole(false); }
  }
  async function deleteRole() {
    if (!selectedRole || selectedRole.slug === "owner") return;
    if (selectedRole._count.memberships > 0) return setError("Kullanıcılara atanmış bir rol silinemez.");
    if (!window.confirm(`${selectedRole.name} rolünü silmek istediğinize emin misiniz?`)) return;
    try {
      await api(`/roles/${selectedRole.id}`, { method: "DELETE" });
      const remaining = roles.filter((role) => role.id !== selectedRole.id);
      setRoles(remaining); setSelectedRoleId(remaining[0]?.id ?? ""); showToast("Rol silindi.");
    } catch (err) { setError(err instanceof ApiError ? err.message : "Rol silinemedi."); }
  }

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center text-sm text-[var(--muted)]">Yükleniyor…</div>;

  return <main className="mx-auto w-full max-w-[1240px] space-y-6 pb-10">
    <header className="flex flex-col gap-4 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="mb-1 text-xs font-medium text-[var(--muted)]">Yönetim / Erişim</div><h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">Roller ve Yetkiler</h1><p className="mt-1 text-sm text-[var(--muted)]">Rolleri ve izin matrisini yönetin. Kullanıcı üyelikleri Kullanıcılar ekranından yönetilir.</p></div>
      <button type="button" onClick={() => setCreateOpen(true)} className="min-h-10 rounded-xl bg-[var(--ink)] px-4 text-sm font-semibold text-white">+ Yeni Rol</button>
    </header>
    {error ? <div className="rounded-xl border border-[#f0d8d8] bg-[#fff8f8] px-4 py-3 text-sm text-[#9a4545]">{error}</div> : null}
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <aside className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3"><div className="mb-2 px-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Roller</div><div className="space-y-1">{roles.map((role) => <button key={role.id} type="button" onClick={() => selectRole(role.id)} className={`w-full rounded-xl px-3 py-3 text-left transition ${selectedRoleId === role.id ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "hover:bg-[var(--surface-2)]"}`}><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{role.name}</span><span className="text-[11px] text-[var(--muted)]">{role._count.memberships} kullanıcı</span></div>{role.description ? <div className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{role.description}</div> : null}</button>)}</div></aside>
      <section className="space-y-4">{selectedRole ? <>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h2 className="text-lg font-semibold text-[var(--ink)]">{selectedRole.name}</h2><p className="text-xs text-[var(--muted)]">{selectedPermissionIds.length} yetki seçili · {selectedRole._count.memberships} kullanıcı atanmış</p></div><div className="flex gap-2">{selectedRole.slug !== "owner" ? <button disabled={selectedRole._count.memberships > 0} type="button" onClick={() => void deleteRole()} className="rounded-lg border border-[#f0d8d8] px-3 py-2 text-xs font-medium text-[#9a4545] disabled:opacity-40">Rolü Sil</button> : null}<button disabled={saving || !dirty} type="button" onClick={() => void savePermissions()} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">{saving ? "Kaydediliyor…" : dirty ? "Değişiklikleri Kaydet" : "Kaydedildi"}</button></div></div></div>
        <div className="grid gap-3 md:grid-cols-[1fr_240px]"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Yetki ara…" className="min-h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-sm" /><select value={resourceFilter} onChange={(event) => setResourceFilter(event.target.value)} className="min-h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-sm"><option value="ALL">Tüm Modüller</option>{resources.map((resource) => <option key={resource} value={resource}>{RESOURCE_LABELS[resource] ?? resource}</option>)}</select></div>
        <div className="space-y-3">{groupedPermissions.map(([resource, list]) => <div key={resource} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]"><div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3"><div><h3 className="text-sm font-semibold text-[var(--ink)]">{RESOURCE_LABELS[resource] ?? resource}</h3><p className="text-xs text-[var(--muted)]">{list.filter((permission) => selectedPermissionIds.includes(permission.id)).length}/{list.length} seçili</p></div><button type="button" onClick={() => toggleResource(resource)} className="text-xs font-semibold text-[var(--accent)]">{list.every((permission) => selectedPermissionIds.includes(permission.id)) ? "Tümünü Kaldır" : "Tümünü Seç"}</button></div><div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">{list.map((permission) => <label key={permission.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] p-3 hover:bg-[var(--surface-2)]"><input type="checkbox" checked={selectedPermissionIds.includes(permission.id)} onChange={() => togglePermission(permission.id)} className="mt-0.5 h-4 w-4" /><span><span className="block text-sm font-medium text-[var(--ink)]">{ACTION_LABELS[permission.action] ?? permission.action}</span>{permission.description ? <span className="mt-0.5 block text-xs text-[var(--muted)]">{permission.description}</span> : null}</span></label>)}</div></div>)}</div>
      </> : <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-10 text-center text-sm text-[var(--muted)]">Henüz rol bulunmuyor.</div>}</section>
    </div>
    {createOpen ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><h2 className="text-lg font-semibold">Yeni Rol</h2><div className="mt-4 space-y-3"><input value={newRoleName} onChange={(event) => setNewRoleName(event.target.value)} placeholder="Rol adı" className="min-h-10 w-full rounded-xl border border-[var(--line)] px-3 text-sm" /><textarea value={newRoleDescription} onChange={(event) => setNewRoleDescription(event.target.value)} placeholder="Açıklama (opsiyonel)" className="min-h-24 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm" /></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm">Vazgeç</button><button disabled={creatingRole} type="button" onClick={() => void createRole()} className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{creatingRole ? "Oluşturuluyor…" : "Oluştur"}</button></div></div></div> : null}
  </main>;
}
