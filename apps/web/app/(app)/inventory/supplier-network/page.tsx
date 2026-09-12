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
  createdAt: string;
};

const organizationTypeLabels: Record<SupplierOrganizationType, string> = {
  MANUFACTURER: "Üretici",
  DISTRIBUTOR: "Distribütör",
  IMPORTER: "İthalatçı",
  WHOLESALER: "Toptancı",
  RETAILER: "Perakendeci",
  SERVICE_PROVIDER: "Hizmet Sağlayıcı",
  OTHER: "Diğer",
};

const verificationLabels: Record<string, string> = {
  UNVERIFIED: "Doğrulanmadı",
  PENDING: "İncelemede",
  VERIFIED: "Doğrulandı",
  REJECTED: "Reddedildi",
  SUSPENDED: "Askıda",
};

const auditLabels: Record<string, string> = {
  SUPPLIER_CONNECTION_UPSERT: "Tedarikçi Bağlantısı Güncellendi",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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
          : "Tedarikçi Ağı Yüklenemedi.",
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
      showToast("Tedarikçi Ağı Bağlantısı Kaydedildi.");
      setSupplierOrganizationId("");
      setInventorySupplierId("");
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Tedarikçi Bağlantısı Oluşturulamadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading && !connections.length && !inventorySuppliers.length) {
    return (
      <div className="mx-auto max-w-[1480px] py-16">
        <Spinner label="Tedarikçi Ağı Hazırlanıyor..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1480px] space-y-6 pb-10">
      <PageHeader
        title="Tedarikçi Ağı"
        description="Şirketinizdeki Tedarikçi Kayıtlarını VALOO Üzerindeki Doğrulanmış Tedarikçilerle Eşleştirin Ve Bağlantıları Tek Ekrandan Yönetin."
        action={
          <Link
            href="/inventory"
            className="inline-flex min-h-10 items-center justify-center rounded-[14px] bg-white/70 px-4 py-2.5 text-[14px] font-medium text-[var(--ink)] shadow-[inset_0_0_0_1px_var(--line)] transition-colors hover:bg-white"
          >
            Envantere Dön
          </Link>
        }
      />

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Platform Bağlantısı" value={connections.length} />
        <MetricCard label="Doğrulanmış Tedarikçi" value={verifiedCount} />
        <MetricCard label="Kayıtlı Tedarikçi" value={inventorySuppliers.length} />
        <MetricCard label="Bağlantı Bekleyen" value={unconnectedSuppliers.length} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
          <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--ink)]">Aktif Bağlantılar</h2>
              <p className="mt-1 text-[11px] text-[var(--muted)]">Şirketinizdeki Tedarikçi Eşleştirmeleri</p>
            </div>
            <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">
              {connections.length} Kayıt
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
                        <h3 className="truncate text-[14px] font-semibold text-[var(--ink)]">{connection.supplier.displayName}</h3>
                        <StatusBadge
                          status={connection.supplier.verificationStatus === "VERIFIED" ? "ACTIVE" : connection.supplier.verificationStatus}
                          label={verificationLabels[connection.supplier.verificationStatus] ?? "Kontrol Ediliyor"}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--muted)]">
                        {organizationTypeLabels[connection.supplier.organizationType] ?? "Tedarikçi"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--muted-soft)]">
                        {connection.supplier.email ? <span>{connection.supplier.email}</span> : null}
                        {connection.supplier.phone ? <span>{connection.supplier.phone}</span> : null}
                        {connection.supplier.website ? <span>{connection.supplier.website}</span> : null}
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted-soft)]">Şirket Tedarikçi Kaydı</p>
                      <p className="mt-1 text-[13px] font-medium text-[var(--ink)]">{inventorySupplier?.name ?? "Tedarikçi Kaydı"}</p>
                    </div>

                    <div className="lg:text-right">
                      <StatusBadge status={connection.status} label="Aktif" />
                      <p className="mt-2 text-[10px] text-[var(--muted-soft)]">{formatDate(connection.updatedAt)}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Henüz Bağlantı Yok"
              description="Bir Tedarikçi Kaydını Platformdaki Doğrulanmış Tedarikçiyle Eşleştirdiğinizde Burada Görünecek."
            />
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="mb-5">
              <h2 className="text-[15px] font-semibold text-[var(--ink)]">Platforma Bağla</h2>
              <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Mevcut Tedarikçi Kaydınızı VALOO Üzerindeki Tedarikçiyle Eşleştirin.</p>
            </div>

            {canManage ? (
              <form className="space-y-4" onSubmit={connectSupplier}>
                <Field label="Şirket Tedarikçisi" required>
                  <Select value={inventorySupplierId} onChange={(event) => setInventorySupplierId(event.target.value)} required>
                    <option value="">Tedarikçi Seçin</option>
                    {inventorySuppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}{connectedInventoryIds.has(supplier.id) ? " · Bağlı" : ""}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Platform Tedarikçi Kodu" required>
                  <TextInput
                    value={supplierOrganizationId}
                    onChange={(event) => setSupplierOrganizationId(event.target.value)}
                    placeholder="Tedarikçi Kodunu Girin"
                    autoComplete="off"
                    required
                  />
                </Field>

                <div className="rounded-[16px] bg-[var(--surface-2)] px-4 py-3 text-[11px] leading-5 text-[var(--muted)]">
                  Bu İşlem Mevcut Tedarikçi Kaydınızı VALOO Üzerindeki Doğrulanmış Tedarikçiyle Eşleştirir. Yeni Tedarikçi Oluşturmaz.
                </div>

                <Button type="submit" className="w-full" disabled={saving || !inventorySupplierId || !supplierOrganizationId.trim()}>
                  {saving ? "Bağlanıyor..." : "Bağlantıyı Kaydet"}
                </Button>
              </form>
            ) : (
              <div className="rounded-[16px] bg-[var(--surface-2)] px-4 py-4 text-[12px] leading-5 text-[var(--muted)]">
                Tedarikçi Ağı Bağlantısı Oluşturmak İçin Yönetim Yetkisi Gereklidir.
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
            <div className="border-b border-[var(--line)] p-5">
              <h2 className="text-[15px] font-semibold text-[var(--ink)]">Bağlantı Durumu</h2>
              <p className="mt-1 text-[11px] text-[var(--muted)]">Kayıtlı Tedarikçilerin Bağlantı Durumu</p>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {inventorySuppliers.slice(0, 8).map((supplier) => (
                <div key={supplier.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium text-[var(--ink)]">{supplier.name}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted-soft)]">{supplier.email || supplier.phone || "İletişim Bilgisi Yok"}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${connectedInventoryIds.has(supplier.id) ? "bg-[rgba(47,122,86,0.10)] text-[#2d5c45]" : "bg-black/[0.04] text-[var(--muted)]"}`}>
                    {connectedInventoryIds.has(supplier.id) ? "Bağlı" : "Bekliyor"}
                  </span>
                </div>
              ))}
              {!inventorySuppliers.length ? (
                <div className="px-5 py-8 text-center text-[12px] text-[var(--muted)]">Tedarikçi Kaydı Bulunmuyor.</div>
              ) : null}
            </div>
          </section>
        </aside>
      </div>

      <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--ink)]">İşlem Geçmişi</h2>
            <p className="mt-1 text-[11px] text-[var(--muted)]">Tedarikçi Ağı Üzerinde Yapılan Son İşlemler</p>
          </div>
          <Button variant="ghost" onClick={() => void load()} disabled={loading}>Yenile</Button>
        </div>

        {audit.length ? (
          <div className="divide-y divide-[var(--line)]">
            {audit.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-4 px-5 py-4 text-[11px]">
                <p className="font-semibold text-[var(--ink)]">{auditLabels[row.action] ?? "Tedarikçi İşlemi Gerçekleştirildi"}</p>
                <div className="text-[var(--muted-soft)]">{formatDate(row.createdAt)}</div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="İşlem Geçmişi Bulunmuyor"
            description="Tedarikçi Ağı Üzerinde Yapılan Bağlantı İşlemleri Burada Görünecek."
          />
        )}
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_8px_28px_rgba(17,70,104,.035)]">
      <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted-soft)]">{label}</p>
      <p className="mt-3 text-[28px] font-semibold tracking-[-.04em] text-[var(--ink)]">{value.toLocaleString("tr-TR")}</p>
    </div>
  );
}