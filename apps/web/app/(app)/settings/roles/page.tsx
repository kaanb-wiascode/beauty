"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  GlassCard,
  PageHeader,
  Spinner,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Permission = {
  id: string;
  resource: string;
  action: string;
  description: string | null;
};

type Role = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  rolePermissions: Array<{
    permission: Permission;
  }>;
  _count: {
    memberships: number;
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
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<
    string[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
      const [roleData, permissionData] = await Promise.all([
        api<Role[]>("/roles"),
        api<Permission[]>("/roles/permissions"),
      ]);

      setRoles(roleData);
      setPermissions(permissionData);

      const firstRole = roleData[0] ?? null;
      setSelectedRoleId((current) =>
        current && roleData.some((role) => role.id === current)
          ? current
          : firstRole?.id ?? "",
      );

      if (firstRole) {
        setSelectedPermissionIds(
          firstRole.rolePermissions.map(
            (item) => item.permission.id,
          ),
        );
      } else {
        setSelectedPermissionIds([]);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Roller yüklenemedi.",
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
          role.rolePermissions.map(
            (item) => item.permission.id,
          ),
        );
      })
      .catch(() => {
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

  async function save() {
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
        updated.rolePermissions.map(
          (item) => item.permission.id,
        ),
      );
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

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roller & Yetkiler"
        description="Hangi rolün hangi işlemlere erişebileceğini yönetin."
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
                    {selectedRole.description ??
                      "Rol izinlerini yönetin."}
                  </div>
                </div>

                <Button
                  onClick={() => void save()}
                  disabled={saving}
                >
                  {saving
                    ? "Kaydediliyor..."
                    : "Değişiklikleri kaydet"}
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
    </div>
  );
}
