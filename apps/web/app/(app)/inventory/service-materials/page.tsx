"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  Field,
  PageHeader,
  Panel,
  Select,
  Spinner,
  TextInput,
} from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasActiveBranch } from "@/lib/auth";

type Service = {
  id: string;
  name: string;
  status: string;
  durationMinutes: number;
};

type PaginatedServices = {
  data: Service[];
  meta: { total: number; totalPages: number };
};

type Product = {
  id: string;
  name: string;
  sku?: string | null;
  unit: string;
  status: string;
};

type ServiceMaterial = {
  id: string;
  productId: string;
  productName: string;
  unit: string;
  quantity: number | string;
};

type MaterialLine = {
  key: string;
  productId: string;
  quantity: string;
};

const UNIT_LABELS: Record<string, string> = {
  UNIT: "Adet",
  ML: "Ml",
  LITER: "Lt",
  GRAM: "Gr",
  KG: "Kg",
  METER: "M",
  PAIR: "Çift",
  BOX: "Kutu",
};

function newLine(productId = "", quantity = "1"): MaterialLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    productId,
    quantity,
  };
}

export default function ServiceMaterialsPage() {
  const activeBranch = hasActiveBranch();
  const [services, setServices] = useState<Service[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [lines, setLines] = useState<MaterialLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadBase = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [serviceResponse, productRows] = await Promise.all([
        api<PaginatedServices>(withQuery("/services", { page: 1, limit: 100 })),
        api<Product[]>("/inventory/products"),
      ]);
      const activeServices = serviceResponse.data.filter((service) => service.status === "ACTIVE");
      const activeProducts = productRows.filter((product) => product.status === "ACTIVE");
      setServices(activeServices);
      setProducts(activeProducts);
      setSelectedServiceId((current) => current || activeServices[0]?.id || "");
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Hizmet Malzemeleri Yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (!selectedServiceId) {
      setLines([]);
      return;
    }

    let active = true;
    setMaterialsLoading(true);
    setError("");
    setNotice("");

    api<ServiceMaterial[]>(`/inventory/services/${selectedServiceId}/materials`)
      .then((materials) => {
        if (!active) return;
        setLines(
          materials.map((material) =>
            newLine(material.productId, String(material.quantity)),
          ),
        );
      })
      .catch((requestError) => {
        if (!active) return;
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : "Hizmet Malzemeleri Yüklenemedi.",
        );
      })
      .finally(() => {
        if (active) setMaterialsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedServiceId]);

  const selectedService = services.find((service) => service.id === selectedServiceId) ?? null;
  const selectedProductIds = useMemo(
    () => new Set(lines.map((line) => line.productId).filter(Boolean)),
    [lines],
  );

  function addLine() {
    setLines((current) => [...current, newLine()]);
  }

  function updateLine(key: string, patch: Partial<MaterialLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  async function save() {
    if (!selectedServiceId || saving) return;
    if (!activeBranch) {
      setError("Hizmet Malzemelerini Düzenlemek İçin Önce Bir Şube Seçin.");
      return;
    }

    const materials = lines.map((line) => ({
      productId: line.productId,
      quantity: Number(line.quantity),
    }));

    if (materials.some((material) => !material.productId)) {
      setError("Her Malzeme Satırında Bir Ürün Seçin.");
      return;
    }
    if (materials.some((material) => !Number.isFinite(material.quantity) || material.quantity <= 0)) {
      setError("Malzeme Miktarları Sıfırdan Büyük Olmalıdır.");
      return;
    }
    if (new Set(materials.map((material) => material.productId)).size !== materials.length) {
      setError("Aynı Ürün Bir Hizmette Yalnızca Bir Kez Kullanılabilir.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await api<ServiceMaterial[]>(
        `/inventory/services/${selectedServiceId}/materials`,
        {
          method: "POST",
          body: { materials },
        },
      );
      setLines(
        saved.map((material) =>
          newLine(material.productId, String(material.quantity)),
        ),
      );
      setNotice("Hizmet Malzemeleri Güncellendi. Hizmet Tamamlandığında Bu Miktarlar Stoktan Otomatik Düşülecek.");
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Hizmet Malzemeleri Kaydedilemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Spinner label="Hizmet Malzemeleri Hazırlanıyor..." />;
  }

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 pb-10">
      <PageHeader
        title="Hizmet Malzemeleri"
        description="Her Hizmette Kullanılan Sarf Ürünlerini Ve Miktarlarını Tanımlayın. Hizmet Tamamlandığında Stok Tüketimi Otomatik Oluşur."
      />

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice("")}>{notice}</Alert> : null}
      {!activeBranch ? (
        <Alert>Hizmet Malzemelerini Düzenlemek İçin Çalışma Kapsamından Belirli Bir Şube Seçin.</Alert>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Panel>
          <div className="p-5">
            <h2 className="text-[17px] font-semibold tracking-[-.02em] text-[var(--ink)]">Hizmet Seçimi</h2>
            <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">
              Aktif Şubedeki Bir Hizmeti Seçerek Otomatik Tüketilecek Malzemeleri Yönetin.
            </p>
            <div className="mt-5">
              <Field label="Hizmet">
                <Select
                  value={selectedServiceId}
                  onChange={(event) => setSelectedServiceId(event.target.value)}
                >
                  <option value="">Hizmet Seçin</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {selectedService ? (
              <div className="mt-5 rounded-[18px] bg-[var(--surface-2)] p-4">
                <p className="text-[13px] font-semibold text-[var(--ink)]">{selectedService.name}</p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">{selectedService.durationMinutes} Dakika</p>
                <p className="mt-3 text-[11px] leading-5 text-[var(--muted)]">
                  Tanımlı Malzemeler Randevu Tamamlandığında Şube Deposundan Otomatik Olarak Düşülür.
                </p>
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] p-5">
            <div>
              <h2 className="text-[17px] font-semibold tracking-[-.02em] text-[var(--ink)]">Sarf Malzeme Listesi</h2>
              <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">
                Bir Randevu Tamamlandığında Tüketilecek Standart Ürün Miktarları.
              </p>
            </div>
            <Button
              variant="secondary"
              disabled={!selectedServiceId || materialsLoading || !activeBranch}
              onClick={addLine}
            >
              Malzeme Ekle
            </Button>
          </div>

          {materialsLoading ? (
            <div className="py-12"><Spinner label="Malzemeler Yükleniyor..." /></div>
          ) : selectedServiceId ? (
            <div className="p-5">
              <div className="hidden grid-cols-[minmax(0,1fr)_160px_90px] gap-3 border-b border-[var(--line)] px-1 pb-3 text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)] md:grid">
                <span>Ürün</span>
                <span>Miktar</span>
                <span>İşlem</span>
              </div>

              <div className="divide-y divide-[var(--line)]">
                {lines.map((line) => {
                  const selectedProduct = products.find((product) => product.id === line.productId);
                  return (
                    <div key={line.key} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_160px_90px] md:items-end">
                      <Field label="Ürün" className="md:[&>label]:sr-only">
                        <Select
                          value={line.productId}
                          disabled={!activeBranch}
                          onChange={(event) => updateLine(line.key, { productId: event.target.value })}
                        >
                          <option value="">Ürün Seçin</option>
                          {products.map((product) => (
                            <option
                              key={product.id}
                              value={product.id}
                              disabled={selectedProductIds.has(product.id) && product.id !== line.productId}
                            >
                              {product.name}{product.sku ? ` · ${product.sku}` : ""}
                            </option>
                          ))}
                        </Select>
                      </Field>

                      <Field
                        label={`Miktar${selectedProduct ? ` (${UNIT_LABELS[selectedProduct.unit] ?? selectedProduct.unit})` : ""}`}
                        className="md:[&>label]:sr-only"
                      >
                        <TextInput
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={line.quantity}
                          disabled={!activeBranch}
                          onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                        />
                      </Field>

                      <Button
                        variant="ghost"
                        disabled={!activeBranch}
                        onClick={() => removeLine(line.key)}
                      >
                        Kaldır
                      </Button>
                    </div>
                  );
                })}
              </div>

              {!lines.length ? (
                <div className="py-14 text-center">
                  <p className="text-[13px] font-medium text-[var(--ink)]">Bu Hizmet İçin Malzeme Tanımlanmamış.</p>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">Malzeme Ekle Düğmesiyle Otomatik Tüketim Reçetesini Oluşturun.</p>
                </div>
              ) : null}

              <div className="mt-5 flex justify-end border-t border-[var(--line)] pt-5">
                <Button
                  disabled={!activeBranch || saving || materialsLoading || !selectedServiceId}
                  onClick={() => void save()}
                >
                  {saving ? "Kaydediliyor..." : "Hizmet Malzemelerini Kaydet"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="px-5 py-14 text-center">
              <p className="text-[13px] font-medium text-[var(--ink)]">Önce Bir Hizmet Seçin.</p>
              <p className="mt-1 text-[11px] text-[var(--muted)]">Seçilen Hizmetin Sarf Malzemeleri Burada Görünecek.</p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
