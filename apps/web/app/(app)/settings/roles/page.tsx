"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  GlassCard,
  PageHeader,
  Select,
  TextInput,
  Spinner,
  StatusBadge,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";

type Permission = {
  id: string;
  resource: string;
  action: string;
  description: string | null;
};

type RolePermission = {
  permission: Permission;
};

type Role = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  rolePermissions?: RolePermission[];
  _count: {
    memberships: number;
    rolePermissions?: number;
  };
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
  role: {
    id: string;
    name: string;
    slug: string;
  };
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

export default function RolesPage() {
  const { showToast } = useToast();

  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);

  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<
    string[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [membershipSavingId, setMembershipSavingId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [creatingRole, setCreatingRole] = useState(false);

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  );

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, Permission[]>();

    for (const permission of permissions) {
      const existing = groups.get(permission.resource) ?? [];
      existing.push(permission);
      groups.set(permission.resource, existing);
    }

    return [...groups.entries()];
  }, [permissions]);

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

      if (!selectedRoleId && roleData.length > 0) {
        setSelectedRoleId(roleData[0].id);
      } else if (
        selectedRoleId &&
        !roleData.some((role) => role.id === selectedRoleId)
      ) {
        setSelectedRoleId(roleData[0]?.id ?? "");
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Roller ve kullanıcılar yüklenemedi.",
      );
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
      .then((role) => {
        setSelectedPermissionIds(
          (role.rolePermissions ?? []).map(
            (item) => item.permission.id,
          ),
        );
      })
      .catch((err) => {
        setError(
          err instanceof ApiError
            ? err.message
            : "Rol izinleri yüklenemedi.",
        );
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

  async function savePermissions() {
    if (!selectedRole) return;

    setSaving(true);
    setError("");

    try {
      const updated = await api<Role>(
        `/roles/${selectedRole.id}/permissions`,
        {
          method: "PATCH",
          body: {
            permissionIds: selectedPermissionIds,
          },
        },
      );

      setRoles((current) =>
        current.map((role) =>
          role.id === updated.id ? updated : role,
        ),
      );

      setSelectedPermissionIds(
        (updated.rolePermissions ?? []).map(
          (item) => item.permission.id,
        ),
      );

      showToast("Rol yetkileri güncellendi.");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Yetkiler kaydedilemedi.",
      );
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
        body: {
          name,
          description:          newRoleDescription.trim() || undefined,
        },
      });

      setRoles((current) => [...current, role]);
      setSelectedRoleId(role.id);
      setCreateOpen(false);
      setNewRoleName("");
      setNewRoleDescription("");
      showToast("Rol oluşturuldu.");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Rol oluşturulamadı.",
      );
    } finally {
      setCreatingRole(false);
    }
  }

  async function changeMembershipRole(
    membershipId: string,
    roleId: string,
  ) {
    setMembershipSavingId(membershipId);
    setError("");

    try {
      const updated = await api<Membership>(
        `/memberships/${membershipId}/role`,
        {
          method: "PATCH",
          body: {
            roleId,
          },
        },
      );

      setMemberships((current) =>
        current.map((membership) =>
          membership.id === updated.id
            ? updated
            : membership,
        ),
      );

      setRoles((current) =>
        current.map((role) => {
          if (role.id === updated.role.id) {
            return {
              ...role,
              _count: {
                ...role._count,
                memberships: role._count.memberships + 1,
              },
            };
          }

          const oldMembership = memberships.find(
            (membership) => membership.id === membershipId,
          );

          if (
            oldMembership &&
            role.id === oldMembership.role.id
          ) {
            return {
              ...role,
              _count: {
                ...role._count,
                memberships: Math.max(
                  0,
                  role._count.memberships - 1,
                ),
              },
            };
          }

          return role;
        }),
      );

      showToast("Kullanıcı rolü güncellendi.");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Kullanıcı rolü güncellenemedi.",
      );
    } finally {
      setMembershipSavingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Roller & Yetkiler"
        description="Rollerin erişimlerini ve kullanıcı atamalarını yönetin."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            Yeni rol
          </Button>
        }
      />

      {error ? (
        <Alert onClose={() => setError("")}>
          {error}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <GlassCard className="p-4">
          <div className="mb-3 text-sm font-medium text-[var(--ink)]">
            Roller
          </div>

          <div className="space-y-1">
            {roles.map((role) => {
              const active = role.id === selectedRoleId;

              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setSelectedRoleId(role.id)}
                  className={[
                    "w-full rounded-[14px] px-3 py-3 text-left transition",
                    active
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "text-[var(--muted)] hover:bg-black/[0.035] hover:text-[var(--ink)]",
                  ].join(" ")}
                >
                  <div className="font-medium">
                    {role.name}
                  </div>
                  <div className="mt-1 text-xs opacity-70">
                    {role._count.memberships} kullanıcı
                  </div>
                </button>
              );
            })}
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          {selectedRole ? (
            <>
              <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-lg font-semibold text-[var(--ink)]">
                    {selectedRole.name}
                  </div>

                  <div className="mt-1 text-sm text-[var(--muted)]">
                    {selectedRole.description ?? "Rol izinlerini yönetin."}
                  </div>
                </div>

                <Button
                  onClick={() => void savePermissions()}
                  disabled={saving}
                >
                  {saving ? "Kaydediliyor..." : "Değişiklikleri kaydet"}
                </Button>
              </div>

              <div className="space-y-5">
                {groupedPermissions.map(
                  ([resource, resourcePermissions]) => (
                    <div
                      key={resource}
                      className="rounded-[16px] border border-[var(--line)] bg-white/50 p-4"
                    >
                      <div className="mb-3 font-medium text-[var(--ink)]">
                        {RESOURCE_LABELS[resource] ?? resource}
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        {resourcePermissions.map(
                          (permission) => {
                            const checked =
                              selectedPermissionIds.includes(
                                permission.id,
                              );

                            return (
                              <label
                                key={permission.id}
                                className="flex cursor-pointer items-start gap-3 rounded-[12px] px-3 py-2 hover:bg-black/[0.025]"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    togglePermission(
                                      permission.id,
                                    )
                                  }
                                  className="mt-1"
                                />

                                <span>
                                  <span className="block text-sm text-[var(--ink)]">
                                    {ACTION_LABELS[
                                      permission.action
                                    ] ??
                                      permission.action}
                                  </span>

                                  <span className="text-xs text-[var(--muted)]">
                                    {permission.resource}.
                                    {permission.action}
                                  </span>
                                </span>
                              </label>
                            );
                          },
                        )}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-sm text-[var(--muted)]">
              Yönetilecek rol bulunamadı.
            </div>
          )}
        </GlassCard>
      </div>

      <GlassCard className="p-5">
        <div className="mb-5">
          <div className="text-lg font-semibold text-[var(--ink)]">
            Kullanıcılar
          </div>

          <div className="mt-1 text-sm text-[var(--muted)]">
            Kullanıcıların tenant içindeki rollerini değiştirin.
          </div>
        </div>

        {memberships.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--muted)]">
            Henüz kullanıcı bulunamadı.
          </div>
        ) : (
          <div className="space-y-3">
            {memberships.map((membership) => (
              <div
                key={membership.id}
                className="flex flex-col gap-4 rounded-[16px] border border-[var(--line)] bg-white/50 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-[var(--ink)]">
                    {membership.user.firstName}{" "}
                    {membership.user.lastName}
                  </div>

                  <div className="mt-1 truncate text-sm text-[var(--muted)]">
                    {membership.user.email}
                  </div>

                  <div className="mt-2">
                    <StatusBadge
                      status={membership.status}
                      label={
                        membership.status === "ACTIVE"
                          ? "Aktif"
                          : membership.status
                      }
                    />
                  </div>
                </div>

                <div className="w-full sm:max-w-[220px]">
                  <Select
                    value={membership.role.id}
                    disabled={
                      membershipSavingId === membership.id
                    }
                    onChange={(event) =>
                      void changeMembershipRole(
                        membership.id,
                        event.target.value,
                      )
                    }
                  >
                    {roles.map((role) => (
                      <option
                        key={role.id}
                        value={role.id}
                      >
                        {role.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
