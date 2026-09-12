"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import {
  Alert,
  Button,
  EmptyState,
  Field,
  PageHeader,
  Select,
  Spinner,
  StatusBadge,
  TextInput,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { hasPermission } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import type { InventorySupplier } from "@/lib/inventory-types";

type SupplierOrganizationType =
  | "MANUFACTURER"
  | "DISTRIBUTOR"
  | "IMPORTER"
  | "WHOLESALER"
  | "RETAILER"
  | "SERVICE_PROVIDER"
  | "OTHER";

type SupplierConnection = {
  id: string;
  supplierOrganizationId: string;
  inventorySupplierId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  supplier: {
    id: string;
    slug: string;
    displayName: string;
    organizationType: SupplierOrganizationType;
    verificationStatus: string;
    website: string | null;
    email: string | null;
    phone: string | null;
  };
};

type SupplierAuditRow = {
  id: string;
  action: string;
  supplierOrganizationId: string | null;
  inventorySupplierId: string | null;
  connectionId: string | null;
  actorUserId: string;
  createdAt: string;
};

const organizationTypeLabels: Record<SupplierOrganizationType, string> = {
  MANUFACTURER: "Üretici",
  DISTRIBUTOR: "Distribütör",
  IMPORTER: "İthalatçı",
  WHOLESALER: "Toptancı",
  RETAILER: "Perakendeci",
  SERVICE_PROVIDER: "Hizmet sağlayıcı",
  OTHER: "Diğer",
};

const verificationLabels: Record<string, string> = {
  UNVERIFIED: "Doğrulanmadı",
  PENDING: "İncelemede",
  VERIFIED: "Doğrulandı",
  REJECTED: "Reddedildi",
  SUSPENDED: "Askıda",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function shortId(value: string | null) {
  if (!value) return "—";
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

export default function SupplierNetworkPage() {
  const { showToast } = useToast();
  const [connections, setConnections] = useState<SupplierConnection[]>([]);
  const [inventorySuppliers, setInventorySuppliers] = useState<InventorySupplier[]>([]);
  const [audit, setAudit] = useState<SupplierAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [supplierOrganizationId, setSupplierOrganizationId] = useState("");
  const [inventorySupplierId, setInventorySupplierId] = useState("");
  const canManage = hasPermission("roles", "update");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [connectionRows, supplierRows, auditRows] = await Promise.all([
        api<SupplierConnection[]>("/supplier-network/connections"),
        api<InventorySupplier[]>("/inventory/suppliers"),
        api<SupplierAuditRow[]>("/supplier-network/audit?limit=50"),
      ]);
      setConnections(connectionRows);
      setInventorySuppliers(supplierRows);
      setAudit(auditRows);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Tedarikçi ağı yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connectedInventoryIds = useMemo(
    () => new Set(connections.map((item) => item.inventorySupplierId)),
    [connections],
  );

  const unconnectedSuppliers = useMemo(
    () =>
      inventorySuppliers.filter(
        (supplier) => !connectedInventoryIds.has(supplier.id),
      ),
    [connectedInventoryIds, inventorySuppliers],
  );

  const verifiedCount = useMemo(
    () =>
      connections.filter(
        (connection) => connection.supplier.verificationStatus === "VERIFIED",
      ).length,
    [connections],
  );

  async function connectSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supplierOrganizationId.trim() || !inventorySupplierId) return;

    setSaving(true);
    setError("");
    try {
      await api("/supplier-network/connections", {
        method: "POST",
        body: {
          supplierOrganizationId: supplierOrganizationId.trim(),
          inventorySupplierId,
        },
      });
      showToast("Tedarikçi ağı bağlantısı kaydedildi.");
      setSupplierOrganizationId("");
      setInventorySupplierId("");
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Tedarikçi bağlantısı oluşturulamadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading && !connections.length && !inventorySuppliers.length) {
    return (
      <div className="mx-auto max-w-[1480px] py-16">
        <Spinner label="Tedarikçi ağı hazırlanıyor..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1480px] space-y-6 pb-10">
      <PageHeader
        title="Tedarikçi Ağı"
        description="Şirket içi tedarikçi kartlarını VALOO platformundaki doğrulanabilir tedarikçi organizasyonlarıyla güvenli biçimde eşleştirin ve bağlantı geçmişini izleyin."
        action={
          <Link
            href="/inventory"
            className="inline-flex min-h-10 items-center justify-center rounded-[14px] bg-white/70 px-4 py-2.5 text-[14px] font-medium text-[var(--ink)] shadow-[inset_0_0_0_1px_var(--line)] transition-colors hover:bg-white"
          >
            Envantere dön
          </Link>
        }
      />

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Platform bağlantısı" value={connections.length} />
        <MetricCard label="Doğrulanmış" value={verifiedCount} />
        <MetricCard
          label="Yerel tedarikçi"
          value={inventorySuppliers.length}
        />
        <MetricCard label="Bağlantı bekleyen" value={unconnectedSuppliers.length} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
          <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--ink)]">
                Aktif bağlantılar
              </h2>
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                Tenant/company kapsamındaki platform eşleştirmeleri
              </p>
            </div>
            <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">
              {connections.length} kayıt
            </span>
          </div>

          {connections.length ? (
            <div className="divide-y divide-[var(--line)]">
              {connections.map((connection) => {
                const inventorySupplier = inventorySuppliers.find(
                  (supplier) => supplier.id === connection.inventorySupplierId,
                );
                return (
                  <article
                    key={connection.id}
                    className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,.9fr)_auto] lg:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-[14px] font-semibold text-[var(--ink)]">
                          {connection.supplier.displayName}
                        </h3>
                        <StatusBadge
                          status={
                            connection.supplier.verificationStatus === "VERIFIED"
                              ? "ACTIVE"
                              : connection.supplier.verificationStatus
                          }
                          label={
                            verificationLabels[
                              connection.supplier.verificationStatus
                            ] ?? connection.supplier.verificationStatus
                          }
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--muted)]">
                        {organizationTypeLabels[
                          connection.supplier.organizationType
                        ] ?? connection.supplier.organizationType}
                        {connection.supplier.slug
                          ? ` · ${connection.supplier.slug}`
                          : ""}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--muted-soft)]">
                        {connection.supplier.email ? (
                          <span>{connection.supplier.email}</span>
                        ) : null}
                        {connection.supplier.phone ? (
                          <span>{connection.supplier.phone}</span>
                        ) : null}
                        {connection.supplier.website ? (
                          <span>{connection.supplier.website}</span>
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted-soft)]">
                        Yerel kart
                      </p>
                      <p className="mt-1 text-[13px] font-medium text-[var(--ink)]">
                        {inventorySupplier?.name ?? "Tedarikçi kartı"}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-[var(--muted-soft)]">
                        {shortId(connection.inventorySupplierId)}
                      </p>
                    </div>

                    <div className="lg:text-right">
                      <StatusBadge status={connection.status} label="Aktif" />
                      <p className="mt-2 text-[10px] text-[var(--muted-soft)]">
                        {formatDate(connection.updatedAt)}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Henüz bağlantı yok"
              description="Şirket içi tedarikçi kartlarından birini platform tedarikçi organizasyonu ile eşleştirdiğinizde burada görünecek."
            />
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="mb-5">
              <h2 className="text-[15px] font-semibold text-[var(--ink)]">
                Platforma bağla
              </h2>
              <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">
                Mevcut özel tedarikçi kaydını bir SupplierOrganization kimliğiyle eşleştirin.
              </p>
            </div>

            {canManage ? (
              <form className="space-y-4" onSubmit={connectSupplier}>
                <Field label="Yerel tedarikçi" required>
                  <Select
                    value={inventorySupplierId}
                    onChange={(event) => setInventorySupplierId(event.target.value)}
                    required
                  >
                    <option value="">Tedarikçi seçin</option>
                    {inventorySuppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                        {connectedInventoryIds.has(supplier.id)
                          ? " · bağlı"
                          : ""}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="SupplierOrganization ID" required>
                  <TextInput
                    value={supplierOrganizationId}
                    onChange={(event) =>
                      setSupplierOrganizationId(event.target.value)
                    }
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    autoComplete="off"
                    required
                  />
                </Field>

                <div className="rounded-[16px] bg-[var(--surface-2)] px-4 py-3 text-[11px] leading-5 text-[var(--muted)]">
                  Platform organizasyonu bu ekrandan oluşturulmaz. Global supplier yönetimi platform-admin sınırında kalır; bu işlem yalnız şirketinizdeki özel tedarikçi kartını mevcut organizasyona bağlar.
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    saving ||
                    !inventorySupplierId ||
                    !supplierOrganizationId.trim()
                  }
                >
                  {saving ? "Bağlanıyor..." : "Bağlantıyı kaydet"}
                </Button>
              </form>
            ) : (
              <div className="rounded-[16px] bg-[var(--surface-2)] px-4 py-4 text-[12px] leading-5 text-[var(--muted)]">
                Tedarikçi ağı bağlantısı oluşturmak için yönetim yetkisi gerekiyor.
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
            <div className="border-b border-[var(--line)] p-5">
              <h2 className="text-[15px] font-semibold text-[var(--ink)]">
                Bağlantı durumu
              </h2>
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                Yerel tedarikçi kapsamı
              </p>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {inventorySuppliers.slice(0, 8).map((supplier) => (
                <div
                  key={supplier.id}
                  className="flex items-center justify-between gap-4 px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium text-[var(--ink)]">
                      {supplier.name}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted-soft)]">
                      {supplier.email || supplier.phone || "İletişim bilgisi yok"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                      connectedInventoryIds.has(supplier.id)
                        ? "bg-[rgba(47,122,86,0.10)] text-[#2d5c45]"
                        : "bg-black/[0.04] text-[var(--muted)]"
                    }`}
                  >
                    {connectedInventoryIds.has(supplier.id) ? "Bağlı" : "Bekliyor"}
                  </span>
                </div>
              ))}
              {!inventorySuppliers.length ? (
                <div className="px-5 py-8 text-center text-[12px] text-[var(--muted)]">
                  Yerel tedarikçi kaydı bulunmuyor.
                </div>
              ) : null}
            </div>
          </section>
        </aside>
      </div>

      <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--ink)]">
              Audit geçmişi
            </h2>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Son 50 tenant/company kapsamlı supplier-network olayı
            </p>
          </div>
          <Button variant="ghost" onClick={() => void load()} disabled={loading}>
            Yenile
          </Button>
        </div>

        {audit.length ? (
          <div className="divide-y divide-[var(--line)]">
            {audit.map((row) => (
              <div
                key={row.id}
                className="grid gap-2 px-5 py-4 text-[11px] md:grid-cols-[minmax(0,1fr)_170px_170px_160px] md:items-center"
              >
                <div>
                  <p className="font-semibold text-[var(--ink)]">
                    {row.action === "SUPPLIER_CONNECTION_UPSERT"
                      ? "Tedarikçi bağlantısı güncellendi"
                      : row.action}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-[var(--muted-soft)]">
                    bağlantı {shortId(row.connectionId)}
                  </p>
                </div>
                <div className="text-[var(--muted)]">
                  org {shortId(row.supplierOrganizationId)}
                </div>
                <div className="text-[var(--muted)]">
                  yerel {shortId(row.inventorySupplierId)}
                </div>
                <div className="text-[var(--muted-soft)] md:text-right">
                  {formatDate(row.createdAt)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Audit kaydı yok"
            description="Tedarikçi ağı üzerinde yapılan bağlantı işlemleri append-only audit geçmişiyle burada görünür."
          />
        )}
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_8px_28px_rgba(17,70,104,.035)]">
      <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted-soft)]">
        {label}
      </p>
      <p className="mt-3 text-[28px] font-semibold tracking-[-.04em] text-[var(--ink)]">
        {value.toLocaleString("tr-TR")}
      </p>
    </div>
  );
}
