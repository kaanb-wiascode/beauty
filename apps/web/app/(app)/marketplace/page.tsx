"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  EmptyState,
  PageHeader,
  Spinner,
  StatusBadge,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { hasPermission } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";

type MarketplacePublication = {
  status: "UNPUBLISHED" | "PUBLISHED";
  public: boolean;
  publishedAt: string | null;
  unpublishedAt: string | null;
};

type MarketplacePreview = {
  listing: {
    company: {
      id: string;
      name: string;
      slug: string;
    };
    branch: {
      id: string;
      name: string;
      code: string;
      address: string | null;
      phone: string | null;
      email: string | null;
    };
    services: Array<{
      id: string;
      name: string;
      description: string | null;
      durationMinutes: number;
      price: number | string;
    }>;
  };
  publication: MarketplacePublication;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatMoney(value: number | string) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

export default function MarketplacePage() {
  const { showToast } = useToast();
  const [preview, setPreview] = useState<MarketplacePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const canManage = hasPermission("services", "update");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<MarketplacePreview>("/marketplace/preview");
      setPreview(data);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Pazar Yeri Önizlemesi Yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const publication = preview?.publication;
  const isPublished = publication?.status === "PUBLISHED";
  const serviceCount = preview?.listing.services.length ?? 0;
  const publicHref = preview
    ? `/marketplace/${encodeURIComponent(preview.listing.company.slug)}/${encodeURIComponent(preview.listing.branch.code)}`
    : null;
  const averagePrice = useMemo(() => {
    if (!preview?.listing.services.length) return 0;
    const sum = preview.listing.services.reduce(
      (total, service) => total + Number(service.price ?? 0),
      0,
    );
    return sum / preview.listing.services.length;
  }, [preview]);

  async function changePublication(action: "publish" | "unpublish") {
    if (!canManage || saving) return;
    setSaving(true);
    setError("");
    try {
      await api<MarketplacePublication>(`/marketplace/publication/${action}`, {
        method: "POST",
      });
      showToast(
        action === "publish"
          ? "Şube Pazar Yerinde Yayına Alındı."
          : "Şube Pazar Yeri Yayınından Kaldırıldı.",
      );
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Pazar Yeri Yayın Durumu Güncellenemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading && !preview) {
    return (
      <div className="mx-auto max-w-[1480px] py-16">
        <Spinner label="Pazar Yeri Hazırlanıyor..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1480px] space-y-6 pb-10">
      <PageHeader
        title="Pazar Yeri Yayını"
        description="Aktif Şubenizin Müşterilere Açık Görünümünü İnceleyin Ve Yayın Durumunu Yönetin."
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isPublished && publicHref ? (
              <Link
                href={publicHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-10 items-center justify-center rounded-[14px] bg-white/70 px-4 py-2.5 text-[14px] font-medium text-[var(--ink)] shadow-[inset_0_0_0_1px_var(--line)] transition-colors hover:bg-white"
              >
                Müşteri Sayfasını Aç
              </Link>
            ) : null}
            {canManage ? (
              <Button
                variant={isPublished ? "danger" : "primary"}
                disabled={saving || !preview}
                onClick={() =>
                  void changePublication(isPublished ? "unpublish" : "publish")
                }
              >
                {saving
                  ? "Güncelleniyor..."
                  : isPublished
                    ? "Yayından Kaldır"
                    : "Yayınla"}
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      {preview ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Yayın Durumu" value={isPublished ? "Yayında" : "Kapalı"} />
            <MetricCard label="Aktif Hizmet" value={String(serviceCount)} />
            <MetricCard label="Ortalama Fiyat" value={formatMoney(averagePrice)} />
            <MetricCard label="Son Yayın" value={formatDate(publication?.publishedAt ?? null)} compact />
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
            <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
              <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[var(--muted-soft)]">
                    Müşteri Görünümü Önizlemesi
                  </p>
                  <h2 className="mt-2 text-[22px] font-semibold tracking-[-.03em] text-[var(--ink)]">
                    {preview.listing.company.name}
                  </h2>
                  <p className="mt-1 text-[13px] text-[var(--muted)]">
                    {preview.listing.branch.name} · {preview.listing.branch.code}
                  </p>
                </div>
                <StatusBadge
                  status={isPublished ? "ACTIVE" : "ARCHIVED"}
                  label={isPublished ? "Herkese Açık" : "Yayın Kapalı"}
                />
              </div>

              <div className="grid gap-4 border-b border-[var(--line)] bg-[var(--surface-2)]/40 px-5 py-4 text-[12px] text-[var(--muted)] md:grid-cols-3">
                <Info label="Adres" value={preview.listing.branch.address || "—"} />
                <Info label="Telefon" value={preview.listing.branch.phone || "—"} />
                <Info label="E-Posta" value={preview.listing.branch.email || "—"} />
              </div>

              <div className="px-5 py-5">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-[15px] font-semibold text-[var(--ink)]">Yayınlanacak Hizmetler</h3>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">Yalnız Aktif Ve Müşteriye Uygun Bilgiler Gösterilir.</p>
                  </div>
                  <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">{serviceCount} Hizmet</span>
                </div>

                {preview.listing.services.length ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {preview.listing.services.map((service) => (
                      <article key={service.id} className="rounded-[18px] border border-[var(--line)] bg-white/50 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <h4 className="text-[13px] font-semibold text-[var(--ink)]">{service.name}</h4>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-[var(--muted)]">{service.description || "Açıklama Eklenmemiş."}</p>
                          </div>
                          <span className="shrink-0 text-[13px] font-semibold text-[var(--ink)]">{formatMoney(service.price)}</span>
                        </div>
                        <div className="mt-4 text-[10px] font-medium text-[var(--muted-soft)]">{service.durationMinutes} Dakika</div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="Yayınlanacak Hizmet Yok"
                    description="Bu Şubede Aktif Hizmet Bulunmadığı İçin Müşteri Görünümünde Hizmet Kartı Gösterilmiyor."
                  />
                )}
              </div>
            </section>

            <aside className="space-y-5">
              <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted-soft)]">Yayın Durumu</p>
                    <h2 className="mt-2 text-[16px] font-semibold text-[var(--ink)]">{isPublished ? "Şube Yayında" : "Şube Yayında Değil"}</h2>
                  </div>
                  <span className={`h-3 w-3 rounded-full ${isPublished ? "bg-[#2d7a56]" : "bg-[var(--muted-soft)]"}`} aria-hidden="true" />
                </div>

                <div className="mt-5 space-y-3 text-[11px]">
                  <Info label="Durum" value={isPublished ? "Yayında" : "Yayında Değil"} />
                  <Info label="Yayın Tarihi" value={formatDate(publication?.publishedAt ?? null)} />
                  <Info label="Son Yayından Kaldırma" value={formatDate(publication?.unpublishedAt ?? null)} />
                  <Info label="Yayın Adresi" value={preview.listing.company.slug} />
                  <Info label="Şube Kodu" value={preview.listing.branch.code} />
                </div>

                {isPublished && publicHref ? (
                  <Link
                    href={publicHref}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex min-h-10 w-full items-center justify-center rounded-[14px] bg-[var(--surface-2)] px-4 py-2.5 text-[12px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                  >
                    Müşteri Görünümünü Kontrol Et
                  </Link>
                ) : null}

                {!canManage ? (
                  <div className="mt-5 rounded-[16px] bg-[var(--surface-2)] px-4 py-3 text-[11px] leading-5 text-[var(--muted)]">
                    Yayın Durumunu Değiştirmek İçin Hizmet Yönetim Yetkisi Gerekiyor.
                  </div>
                ) : null}
              </section>

              <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
                <h2 className="text-[15px] font-semibold text-[var(--ink)]">Güvenli Yayın İlkeleri</h2>
                <div className="mt-4 space-y-3 text-[11px] leading-5 text-[var(--muted)]">
                  <Policy text="Yayın Yalnızca Kullanıcı Onayıyla Açılır Ve Varsayılan Olarak Kapalıdır." />
                  <Policy text="İç Sistem Kimlikleri Müşteri Sayfasında Gösterilmez." />
                  <Policy text="Yalnızca Aktif Şube Ve Aktif Hizmet Bilgileri Yayınlanır." />
                  <Policy text="Yayından Kaldırma İşlemi Müşteri Erişimini Kapatır." />
                </div>
              </section>
            </aside>
          </div>
        </>
      ) : (
        <EmptyState
          title="Pazar Yeri Önizlemesi Bulunamadı"
          description="Aktif Bir Şube Seçili Olduğundan Ve Şubenin Erişilebilir Olduğundan Emin Olun."
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Yeniden Dene
            </Button>
          }
        />
      )}
    </div>
  );
}

function MetricCard({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_8px_28px_rgba(17,70,104,.035)]">
      <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted-soft)]">{label}</p>
      <p className={`mt-3 font-semibold tracking-[-.035em] text-[var(--ink)] ${compact ? "text-[15px]" : "text-[28px]"}`}>{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--muted-soft)]">{label}</p>
      <p className="mt-1 break-words text-[12px] font-medium text-[var(--ink)]">{value}</p>
    </div>
  );
}

function Policy({ text }: { text: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden="true" />
      <p>{text}</p>
    </div>
  );
}
