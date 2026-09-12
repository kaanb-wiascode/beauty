"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { Modal } from "@/components/modal";
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
import { api, ApiError, withQuery } from "@/lib/api";

type OrganizationType =
  | "MANUFACTURER"
  | "DISTRIBUTOR"
  | "IMPORTER"
  | "WHOLESALER"
  | "RETAILER"
  | "SERVICE_PROVIDER"
  | "OTHER";

type OrganizationStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "ARCHIVED";
type FilterStatus = "ALL" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";

type SupplierOrganization = {
  id: string;
  slug: string;
  legalName: string;
  displayName: string;
  organizationType: OrganizationType;
  status: OrganizationStatus;
  verificationStatus: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  taxCountry: string | null;
  taxNumber: string | null;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  slug: string;
  legalName: string;
  displayName: string;
  organizationType: OrganizationType;
  status: Exclude<OrganizationStatus, "ARCHIVED">;
  website: string;
  email: string;
  phone: string;
  taxCountry: string;
  taxNumber: string;
};

const emptyForm: FormState = {
  slug: "",
  legalName: "",
  displayName: "",
  organizationType: "OTHER",
  status: "ACTIVE",
  website: "",
  email: "",
  phone: "",
  taxCountry: "TR",
  taxNumber: "",
};

const typeLabels: Record<OrganizationType, string> = {
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

const statusLabels: Record<OrganizationStatus, string> = {
  ACTIVE: "Aktif",
  INACTIVE: "Pasif",
  SUSPENDED: "Askıda",
  ARCHIVED: "Arşivlendi",
};

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function optional(value: string) {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(date);
}

export default function PlatformSuppliersPage() {
  const { showToast } = useToast();
  const [organizations, setOrganizations] = useState<SupplierOrganization[]>([]);
  const [filter, setFilter] = useState<FilterStatus>("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierOrganization | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await api<SupplierOrganization[]>(
        withQuery("/platform/supplier-network/organizations", {
          status: filter === "ALL" ? undefined : filter,
          limit: 200,
        }),
      );
      setOrganizations(rows);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Tedarikçiler Yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({
      verified: organizations.filter((item) => item.verificationStatus === "VERIFIED").length,
      pending: organizations.filter((item) => item.verificationStatus === "PENDING").length,
      active: organizations.filter((item) => item.status === "ACTIVE").length,
    }),
    [organizations],
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(item: SupplierOrganization) {
    setEditing(item);
    setForm({
      slug: item.slug,
      legalName: item.legalName,
      displayName: item.displayName,
      organizationType: item.organizationType,
      status: item.status === "ARCHIVED" ? "INACTIVE" : item.status,
      website: item.website ?? "",
      email: item.email ?? "",
      phone: item.phone ?? "",
      taxCountry: item.taxCountry ?? "",
      taxNumber: item.taxNumber ?? "",
    });
    setModalOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const legalName = form.legalName.trim();
    const displayName = form.displayName.trim();
    const slug = normalizeSlug(form.slug || displayName);
    const hasTaxCountry = Boolean(form.taxCountry.trim());
    const hasTaxNumber = Boolean(form.taxNumber.trim());

    if (!legalName || !displayName || (!editing && !slug)) {
      setError("Firma Ünvanı, Görünen Ad Ve Yayın Adı Zorunludur.");
      return;
    }
    if (hasTaxCountry !== hasTaxNumber) {
      setError("Vergi Ülkesi Ve Vergi Numarası Birlikte Girilmelidir.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        legalName,
        displayName,
        organizationType: form.organizationType,
        status: form.status,
        website: optional(form.website),
        email: optional(form.email)?.toLowerCase() ?? null,
        phone: optional(form.phone),
        taxCountry: hasTaxCountry ? form.taxCountry.trim().toUpperCase() : null,
        taxNumber: hasTaxNumber ? form.taxNumber.trim() : null,
      };

      if (editing) {
        await api(`/platform/supplier-network/organizations/${editing.id}`, {
          method: "PATCH",
          body: payload,
        });
        showToast("Tedarikçi Güncellendi.");
      } else {
        await api("/platform/supplier-network/organizations", {
          method: "POST",
          body: { ...payload, slug },
        });
        showToast("Tedarikçi Oluşturuldu.");
      }

      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Tedarikçi Kaydedilemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1480px] space-y-6 pb-10">
      <PageHeader
        title="Tedarikçi Yönetimi"
        description="VALOO Genelinde Kullanılacak Tedarikçi Kayıtlarını Oluşturun, Güncelleyin Ve Doğrulama Durumlarını İzleyin."
        action={<Button onClick={openCreate}>Yeni Tedarikçi</Button>}
      />

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Görünen Kayıt" value={organizations.length} />
        <Metric label="Aktif" value={counts.active} />
        <Metric label="Doğrulanmış" value={counts.verified} />
        <Metric label="İncelemede" value={counts.pending} />
      </section>

      <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--ink)]">Tedarikçi Kayıtları</h2>
            <p className="mt-1 text-[11px] text-[var(--muted)]">Firma Bilgileri Ve Doğrulama Durumları</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["ALL", "ACTIVE", "SUSPENDED", "ARCHIVED"] as FilterStatus[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                  filter === value
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
              >
                {value === "ALL"
                  ? "Tümü"
                  : value === "ACTIVE"
                    ? "Aktif"
                    : value === "SUSPENDED"
                      ? "Askıda"
                      : "Arşiv"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <Spinner label="Tedarikçiler Yükleniyor..." />
        ) : organizations.length ? (
          <div className="divide-y divide-[var(--line)]">
            {organizations.map((item) => (
              <article
                key={item.id}
                className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,.8fr)_minmax(0,.8fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-[14px] font-semibold text-[var(--ink)]">{item.displayName}</h3>
                    <StatusBadge status={item.status} label={statusLabels[item.status]} />
                  </div>
                  <p className="mt-1 truncate text-[11px] text-[var(--muted)]">{item.legalName}</p>
                  <p className="mt-2 text-[10px] text-[var(--muted-soft)]">{item.email || item.phone || item.website || "İletişim Bilgisi Yok"}</p>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--muted-soft)]">Tedarikçi Türü</p>
                  <p className="mt-1 text-[12px] font-medium text-[var(--ink)]">{typeLabels[item.organizationType]}</p>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--muted-soft)]">Doğrulama Durumu</p>
                  <p className="mt-1 text-[12px] font-medium text-[var(--ink)]">{verificationLabels[item.verificationStatus] ?? "Kontrol Ediliyor"}</p>
                  <p className="mt-1 text-[10px] text-[var(--muted-soft)]">{formatDate(item.updatedAt)}</p>
                </div>

                <Button variant="secondary" onClick={() => openEdit(item)}>Düzenle</Button>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Tedarikçi Bulunamadı"
            description="Seçili Durum Filtresinde Tedarikçi Kaydı Bulunmuyor."
          />
        )}
      </section>

      <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="text-[15px] font-semibold text-[var(--ink)]">Yönetim Bilgisi</h2>
        <div className="mt-4 grid gap-3 text-[11px] leading-5 text-[var(--muted)] md:grid-cols-3">
          <Boundary text="Bu Alan Yalnızca Yetkili Platform Yöneticileri Tarafından Kullanılabilir." />
          <Boundary text="Doğrulama Durumu Bu Formdan Değiştirilemez Ve Ayrı Bir Kontrol Süreciyle Yönetilir." />
          <Boundary text="İşletmelerin Kendi Tedarikçi Kartları Ayrı Tutulur Ve Gerektiğinde Bu Kayıtlarla Eşleştirilir." />
        </div>
      </section>

      <Modal
        open={modalOpen}
        onClose={() => {
          if (!saving) setModalOpen(false);
        }}
        title={editing ? "Tedarikçiyi Düzenle" : "Yeni Tedarikçi"}
        description="Tedarikçinin Temel Firma Bilgilerini Yönetin. Doğrulama Kararı Bu Formun Dışında Tutulur."
      >
        <form className="space-y-5" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Görünen Ad" required>
              <TextInput
                value={form.displayName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    displayName: event.target.value,
                    ...(!editing && !current.slug ? { slug: normalizeSlug(event.target.value) } : {}),
                  }))
                }
                required
              />
            </Field>
            <Field label="Yasal Ünvan" required>
              <TextInput
                value={form.legalName}
                onChange={(event) => setForm((current) => ({ ...current, legalName: event.target.value }))}
                required
              />
            </Field>
            <Field label="Yayın Adı" required={!editing}>
              <TextInput
                value={form.slug}
                disabled={Boolean(editing)}
                onChange={(event) =>
                  setForm((current) => ({ ...current, slug: normalizeSlug(event.target.value) }))
                }
                required={!editing}
              />
            </Field>
            <Field label="Tedarikçi Türü">
              <Select
                value={form.organizationType}
                onChange={(event) =>
                  setForm((current) => ({ ...current, organizationType: event.target.value as OrganizationType }))
                }
              >
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Durum">
              <Select
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({ ...current, status: event.target.value as FormState["status"] }))
                }
              >
                <option value="ACTIVE">Aktif</option>
                <option value="INACTIVE">Pasif</option>
                <option value="SUSPENDED">Askıda</option>
              </Select>
            </Field>
            <Field label="Web Sitesi">
              <TextInput
                type="url"
                value={form.website}
                onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))}
                placeholder="https://..."
              />
            </Field>
            <Field label="E-Posta">
              <TextInput
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
            </Field>
            <Field label="Telefon">
              <TextInput
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              />
            </Field>
            <Field label="Vergi Ülkesi">
              <TextInput
                maxLength={2}
                value={form.taxCountry}
                onChange={(event) =>
                  setForm((current) => ({ ...current, taxCountry: event.target.value.toUpperCase() }))
                }
                placeholder="TR"
              />
            </Field>
            <Field label="Vergi Numarası">
              <TextInput
                value={form.taxNumber}
                onChange={(event) => setForm((current) => ({ ...current, taxNumber: event.target.value }))}
              />
            </Field>
          </div>

          <div className="rounded-[16px] bg-[var(--surface-2)] px-4 py-3 text-[11px] leading-5 text-[var(--muted)]">
            Doğrulama Durumu Bu Formdan Değiştirilemez. Arşivleme Gibi Yüksek Etkili İşlemler Ayrı Bir Kontrol Süreciyle Yönetilir.
          </div>

          <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Vazgeç</Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Kaydediliyor..." : editing ? "Değişiklikleri Kaydet" : "Tedarikçiyi Oluştur"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted-soft)]">{label}</p>
      <p className="mt-3 text-[28px] font-semibold tracking-[-.04em] text-[var(--ink)]">{value.toLocaleString("tr-TR")}</p>
    </div>
  );
}

function Boundary({ text }: { text: string }) {
  return (
    <div className="flex gap-3 rounded-[16px] bg-[var(--surface-2)] px-4 py-3">
      <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
      <p>{text}</p>
    </div>
  );
}
