"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { Alert, Button, Spinner, TextInput } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { supplierPortalApi } from "@/lib/supplier-portal-api";
import { getSupplierPortalSession } from "@/lib/supplier-portal-auth";

type CatalogVariant = {
  id: string;
  catalogProductId: string;
  canonicalSku: string | null;
  variantName: string;
  unit: string;
  attributes: Record<string, unknown>;
  productName: string;
  categoryCode: string | null;
  brandName: string | null;
  offerId: string | null;
  offerStatus: string | null;
  offerVersion: number | null;
};

type SupplierOffer = {
  id: string;
  catalogVariantId: string;
  supplierSku: string | null;
  currency: string;
  unitPrice: number | string;
  minimumOrderQuantity: number | string;
  orderMultiple: number | string;
  availableQuantity: number | string | null;
  leadTimeDays: number | string;
  preparationDays: number | string;
  shippingDays: number | string;
  validFrom: string | null;
  validTo: string | null;
  status: string;
  version: number;
  productName: string;
  variantName: string;
  canonicalSku: string | null;
  brandName: string | null;
  createdAt: string;
  updatedAt: string;
};

type OfferDraft = {
  supplierSku: string;
  currency: string;
  unitPrice: string;
  minimumOrderQuantity: string;
  orderMultiple: string;
  availableQuantity: string;
  leadTimeDays: string;
  preparationDays: string;
  shippingDays: string;
  validFrom: string;
  validTo: string;
};

const EMPTY_DRAFT: OfferDraft = {
  supplierSku: "",
  currency: "TRY",
  unitPrice: "",
  minimumOrderQuantity: "1",
  orderMultiple: "1",
  availableQuantity: "",
  leadTimeDays: "0",
  preparationDays: "0",
  shippingDays: "0",
  validFrom: "",
  validTo: "",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Taslak",
  ACTIVE: "Aktif",
  INACTIVE: "Pasif",
  ARCHIVED: "Arşivlendi",
};

function toDateTimeLocal(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 16) : "";
}

function formatMoney(value: number | string, currency: string) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export default function SupplierOffersPage() {
  const [variants, setVariants] = useState<CatalogVariant[]>([]);
  const [offers, setOffers] = useState<SupplierOffer[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [draft, setDraft] = useState<OfferDraft>(EMPTY_DRAFT);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const session = getSupplierPortalSession();
  const canManage = session?.membership.role === "OWNER" || session?.membership.role === "ADMIN";
  const verified = session?.supplierOrganization.verificationStatus === "VERIFIED";

  const selectedOffer = useMemo(
    () => offers.find((offer) => offer.id === selectedOfferId) ?? null,
    [offers, selectedOfferId],
  );

  const selectedVariant = useMemo(
    () => variants.find((variant) => variant.id === selectedVariantId) ?? null,
    [variants, selectedVariantId],
  );

  const availableVariants = useMemo(
    () => variants.filter((variant) => !variant.offerId || variant.offerId === selectedOfferId),
    [selectedOfferId, variants],
  );

  const visibleOffers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    if (!query) return offers;
    return offers.filter((offer) =>
      [offer.productName, offer.variantName, offer.brandName ?? "", offer.canonicalSku ?? "", offer.supplierSku ?? "", STATUS_LABELS[offer.status] ?? offer.status]
        .some((value) => value.toLocaleLowerCase("tr-TR").includes(query)),
    );
  }, [offers, search]);

  const load = useCallback(async () => {
    setError("");
    try {
      const [catalogRows, offerRows] = await Promise.all([
        supplierPortalApi<CatalogVariant[]>("/supplier-portal/offers/catalog/variants"),
        supplierPortalApi<SupplierOffer[]>("/supplier-portal/offers"),
      ]);
      setVariants(catalogRows);
      setOffers(offerRows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Katalog ve teklifler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function beginCreate() {
    setSelectedOfferId(null);
    setSelectedVariantId(availableVariants[0]?.id ?? "");
    setDraft(EMPTY_DRAFT);
    setError("");
    setSuccess("");
  }

  function beginEdit(offer: SupplierOffer) {
    setSelectedOfferId(offer.id);
    setSelectedVariantId(offer.catalogVariantId);
    setDraft({
      supplierSku: offer.supplierSku ?? "",
      currency: offer.currency,
      unitPrice: String(offer.unitPrice),
      minimumOrderQuantity: String(offer.minimumOrderQuantity),
      orderMultiple: String(offer.orderMultiple),
      availableQuantity: offer.availableQuantity === null ? "" : String(offer.availableQuantity),
      leadTimeDays: String(offer.leadTimeDays),
      preparationDays: String(offer.preparationDays),
      shippingDays: String(offer.shippingDays),
      validFrom: toDateTimeLocal(offer.validFrom),
      validTo: toDateTimeLocal(offer.validTo),
    });
    setError("");
    setSuccess("");
  }

  function patchDraft(key: keyof OfferDraft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSuccess("");
  }

  function payload() {
    const unitPrice = Number(draft.unitPrice);
    const minimumOrderQuantity = Number(draft.minimumOrderQuantity);
    const orderMultiple = Number(draft.orderMultiple);
    const availableQuantity = draft.availableQuantity === "" ? null : Number(draft.availableQuantity);
    const leadTimeDays = Number(draft.leadTimeDays);
    const preparationDays = Number(draft.preparationDays);
    const shippingDays = Number(draft.shippingDays);

    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("Geçerli bir birim fiyat girin.");
    if (!Number.isFinite(minimumOrderQuantity) || minimumOrderQuantity <= 0) throw new Error("Minimum sipariş miktarı sıfırdan büyük olmalıdır.");
    if (!Number.isFinite(orderMultiple) || orderMultiple <= 0) throw new Error("Sipariş katı sıfırdan büyük olmalıdır.");
    if (availableQuantity !== null && (!Number.isFinite(availableQuantity) || availableQuantity < 0)) throw new Error("Stok miktarı negatif olamaz.");
    if (![leadTimeDays, preparationDays, shippingDays].every((value) => Number.isInteger(value) && value >= 0)) throw new Error("Termin süreleri negatif olmayan tam sayı olmalıdır.");

    return {
      supplierSku: draft.supplierSku.trim() || undefined,
      currency: draft.currency.trim().toUpperCase(),
      unitPrice,
      minimumOrderQuantity,
      orderMultiple,
      availableQuantity,
      leadTimeDays,
      preparationDays,
      shippingDays,
      validFrom: draft.validFrom ? new Date(draft.validFrom).toISOString() : null,
      validTo: draft.validTo ? new Date(draft.validTo).toISOString() : null,
    };
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || busy) return;
    if (!selectedOffer && !selectedVariantId) {
      setError("Önce canonical katalogdan bir varyant seçin.");
      return;
    }

    let commercial: ReturnType<typeof payload>;
    try {
      commercial = payload();
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Teklif bilgileri geçersiz.");
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (selectedOffer) {
        await supplierPortalApi(`/supplier-portal/offers/${selectedOffer.id}`, {
          method: "PATCH",
          body: { ...commercial, expectedVersion: selectedOffer.version },
        });
        setSuccess("Teklif bilgileri güncellendi.");
      } else {
        await supplierPortalApi("/supplier-portal/offers", {
          method: "POST",
          body: { ...commercial, catalogVariantId: selectedVariantId },
        });
        setSuccess("Teklif taslağı oluşturuldu.");
      }
      await load();
      setSelectedOfferId(null);
      setSelectedVariantId("");
      setDraft(EMPTY_DRAFT);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Teklif kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function transition(action: "activate" | "deactivate" | "archive") {
    if (!selectedOffer || !canManage || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await supplierPortalApi(`/supplier-portal/offers/${selectedOffer.id}/${action}`, {
        method: "POST",
        body: { expectedVersion: selectedOffer.version },
      });
      setSuccess(action === "activate" ? "Teklif buyer ağına açıldı." : action === "deactivate" ? "Teklif pasife alındı." : "Teklif arşivlendi.");
      await load();
      setSelectedOfferId(null);
      setSelectedVariantId("");
      setDraft(EMPTY_DRAFT);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Teklif durumu değiştirilemedi.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="py-20"><Spinner label="Katalog ve teklifler hazırlanıyor..." /></div>;

  const activeCount = offers.filter((offer) => offer.status === "ACTIVE").length;
  const draftCount = offers.filter((offer) => offer.status === "DRAFT").length;
  const inactiveCount = offers.filter((offer) => offer.status === "INACTIVE").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#1674bd]">KATALOG VE TİCARİ TEKLİFLER</p>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-.035em]">SupplierOffer Yönetimi</h1>
          <p className="mt-1 text-[14px] text-[#667482]">VALOO canonical kataloğundaki varyantlara fiyat, stok, MOQ ve termin bilgilerinizi bağlayın.</p>
        </div>
        {canManage ? <Button type="button" onClick={beginCreate} disabled={!availableVariants.length}>Yeni teklif</Button> : null}
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {success ? <Alert tone="success" onClose={() => setSuccess("")}>{success}</Alert> : null}
      {!canManage ? <Alert tone="success">MEMBER rolü teklifleri görüntüleyebilir. Ticari teklif yönetimi OWNER veya ADMIN gerektirir.</Alert> : null}
      {!verified ? <Alert>Organizasyon doğrulanmadığı için teklifler taslak/pasif olarak yönetilebilir; ACTIVE duruma geçiş backend tarafından engellenir.</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Aktif teklif" value={String(activeCount)} />
        <Metric label="Taslak" value={String(draftCount)} />
        <Metric label="Pasif" value={String(inactiveCount)} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_470px]">
        <section className="rounded-[20px] border border-[#dfe7ed] bg-white p-4 shadow-[0_12px_36px_rgba(36,63,84,0.05)]">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[16px] font-semibold">Teklifleriniz</h2>
              <p className="mt-1 text-[12px] text-[#7a8792]">Aktif teklifler buyer tarafındaki tedarikçi karşılaştırmasına katılır.</p>
            </div>
            <TextInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ürün, SKU veya durum ara..." className="sm:max-w-[280px]" />
          </div>
          <div className="space-y-2">
            {visibleOffers.map((offer) => (
              <button key={offer.id} type="button" onClick={() => beginEdit(offer)} className={`w-full rounded-[15px] border p-4 text-left transition ${selectedOfferId === offer.id ? "border-[#1674bd] bg-[#f3f9fd]" : "border-[#e3eaf0] hover:border-[#c6d4df] hover:bg-[#fafcfd]"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold">{offer.brandName ? `${offer.brandName} · ` : ""}{offer.productName}</p>
                    <p className="mt-1 text-[12px] text-[#667482]">{offer.variantName}{offer.canonicalSku ? ` · ${offer.canonicalSku}` : ""}</p>
                    <p className="mt-2 text-[11px] text-[#7a8792]">MOQ {offer.minimumOrderQuantity} · Stok {offer.availableQuantity ?? "—"} · Termin {offer.leadTimeDays} gün</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[14px] font-semibold text-[#1674bd]">{formatMoney(offer.unitPrice, offer.currency)}</p>
                    <span className="mt-2 inline-flex rounded-full bg-[#eef3f7] px-2.5 py-1 text-[10px] font-semibold text-[#51606d]">{STATUS_LABELS[offer.status] ?? offer.status} · v{offer.version}</span>
                  </div>
                </div>
              </button>
            ))}
            {!visibleOffers.length ? <div className="rounded-[14px] border border-dashed border-[#d9e2e8] px-4 py-10 text-center text-[12px] text-[#7a8792]">Henüz eşleşen teklif yok.</div> : null}
          </div>
        </section>

        <section className="rounded-[20px] border border-[#dfe7ed] bg-white p-5 shadow-[0_12px_36px_rgba(36,63,84,0.05)]">
          <h2 className="text-[16px] font-semibold">{selectedOffer ? "Teklifi düzenle" : "Yeni teklif"}</h2>
          <p className="mt-1 text-[12px] text-[#7a8792]">Fiyat güncellemeleri version kontrollüdür; eski ekran verisi yeni kaydı ezemez.</p>

          <form onSubmit={save} className="mt-5 space-y-4">
            <Field label="Canonical varyant">
              <select value={selectedVariantId} onChange={(event) => setSelectedVariantId(event.target.value)} disabled={Boolean(selectedOffer) || !canManage} className="h-11 w-full rounded-[12px] border border-[#dfe7ed] bg-white px-3 text-[13px] outline-none focus:border-[#1674bd]">
                <option value="">Varyant seçin</option>
                {availableVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.brandName ? `${variant.brandName} · ` : ""}{variant.productName} · {variant.variantName}{variant.canonicalSku ? ` · ${variant.canonicalSku}` : ""}</option>)}
              </select>
            </Field>
            {selectedVariant ? <p className="rounded-[12px] bg-[#f5f8fa] px-3 py-2 text-[11px] text-[#667482]">Birim: {selectedVariant.unit} · Kategori: {selectedVariant.categoryCode || "—"}</p> : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tedarikçi SKU"><TextInput value={draft.supplierSku} onChange={(event) => patchDraft("supplierSku", event.target.value)} disabled={!canManage} /></Field>
              <Field label="Para birimi"><TextInput value={draft.currency} maxLength={3} onChange={(event) => patchDraft("currency", event.target.value.toUpperCase())} disabled={!canManage} /></Field>
              <Field label="Birim fiyat"><TextInput type="number" min="0" step="0.0001" value={draft.unitPrice} onChange={(event) => patchDraft("unitPrice", event.target.value)} disabled={!canManage} /></Field>
              <Field label="Mevcut stok"><TextInput type="number" min="0" step="0.001" value={draft.availableQuantity} onChange={(event) => patchDraft("availableQuantity", event.target.value)} disabled={!canManage} /></Field>
              <Field label="Minimum sipariş"><TextInput type="number" min="0.001" step="0.001" value={draft.minimumOrderQuantity} onChange={(event) => patchDraft("minimumOrderQuantity", event.target.value)} disabled={!canManage} /></Field>
              <Field label="Sipariş katı"><TextInput type="number" min="0.001" step="0.001" value={draft.orderMultiple} onChange={(event) => patchDraft("orderMultiple", event.target.value)} disabled={!canManage} /></Field>
              <Field label="Toplam termin (gün)"><TextInput type="number" min="0" step="1" value={draft.leadTimeDays} onChange={(event) => patchDraft("leadTimeDays", event.target.value)} disabled={!canManage} /></Field>
              <Field label="Hazırlık (gün)"><TextInput type="number" min="0" step="1" value={draft.preparationDays} onChange={(event) => patchDraft("preparationDays", event.target.value)} disabled={!canManage} /></Field>
              <Field label="Kargo (gün)"><TextInput type="number" min="0" step="1" value={draft.shippingDays} onChange={(event) => patchDraft("shippingDays", event.target.value)} disabled={!canManage} /></Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Geçerlilik başlangıcı"><TextInput type="datetime-local" value={draft.validFrom} onChange={(event) => patchDraft("validFrom", event.target.value)} disabled={!canManage} /></Field>
              <Field label="Geçerlilik bitişi"><TextInput type="datetime-local" value={draft.validTo} onChange={(event) => patchDraft("validTo", event.target.value)} disabled={!canManage} /></Field>
            </div>

            {canManage ? <Button type="submit" disabled={busy || (!selectedOffer && !selectedVariantId)} className="w-full">{busy ? "Kaydediliyor..." : selectedOffer ? "Değişiklikleri kaydet" : "Teklif taslağı oluştur"}</Button> : null}
          </form>

          {selectedOffer && canManage ? (
            <div className="mt-5 border-t border-[#e4ebf0] pt-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[.1em] text-[#7a8792]">Durum yönetimi</p>
              <div className="flex flex-wrap gap-2">
                {(selectedOffer.status === "DRAFT" || selectedOffer.status === "INACTIVE") ? <Button type="button" onClick={() => void transition("activate")} disabled={busy || !verified}>Aktifleştir</Button> : null}
                {selectedOffer.status === "ACTIVE" ? <Button type="button" variant="secondary" onClick={() => void transition("deactivate")} disabled={busy}>Pasife al</Button> : null}
                {(selectedOffer.status === "DRAFT" || selectedOffer.status === "INACTIVE") ? <Button type="button" variant="secondary" onClick={() => void transition("archive")} disabled={busy}>Arşivle</Button> : null}
              </div>
              {!verified && (selectedOffer.status === "DRAFT" || selectedOffer.status === "INACTIVE") ? <p className="mt-2 text-[11px] text-[#9b6a21]">Aktivasyon için SupplierOrganization doğrulaması gerekir.</p> : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-[#5d6b77]">{label}</span>{children}</label>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[16px] border border-[#dfe7ed] bg-white px-4 py-4"><p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#7a8792]">{label}</p><p className="mt-2 text-[24px] font-semibold tracking-[-.03em]">{value}</p></div>;
}
