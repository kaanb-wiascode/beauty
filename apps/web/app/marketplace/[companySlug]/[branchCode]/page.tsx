"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";

type PublicMarketplaceListing = {
  listing: {
    company: {
      name: string;
      slug: string;
    };
    branch: {
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
  publication: {
    status: "PUBLISHED";
    public: true;
  };
};

function formatMoney(value: number | string) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

export default function PublicMarketplacePage() {
  const params = useParams<{ companySlug: string; branchCode: string }>();
  const companySlug = params.companySlug;
  const branchCode = params.branchCode;
  const [data, setData] = useState<PublicMarketplaceListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setNotFound(false);
      setError("");
      try {
        const response = await api<PublicMarketplaceListing>(
          `/public/marketplace/${encodeURIComponent(companySlug)}/${encodeURIComponent(branchCode)}`,
          { auth: false },
        );
        if (!cancelled) setData(response);
      } catch (requestError) {
        if (cancelled) return;
        if (requestError instanceof ApiError && requestError.status === 404) {
          setNotFound(true);
        } else {
          setError(
            requestError instanceof ApiError
              ? requestError.message
              : "İşletme Sayfası Yüklenemedi.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [branchCode, companySlug]);

  const services = data?.listing.services ?? [];
  const minPrice = services.length
    ? Math.min(...services.map((service) => Number(service.price ?? 0)))
    : null;

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f7f6f3] px-5 py-16 text-[#272521]">
        <div className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#ded9d3] border-t-[#745ce0]" />
            <p className="mt-4 text-sm text-[#77716b]">İşletme Hazırlanıyor...</p>
          </div>
        </div>
      </main>
    );
  }

  if (notFound || !data) {
    return (
      <main className="min-h-screen bg-[#f7f6f3] px-5 py-16 text-[#272521]">
        <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center">
          <div className="w-full rounded-[28px] border border-[#e6e1db] bg-white p-8 text-center shadow-[0_20px_60px_rgba(54,46,38,.06)] sm:p-12">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f1edff] text-[#745ce0]">V</div>
            <h1 className="mt-5 text-2xl font-semibold tracking-[-.035em]">
              {notFound ? "Bu İşletme Şu An Yayında Değil" : "Sayfa Açılamadı"}
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#77716b]">
              {notFound
                ? "İşletme Yayını Kapalı Olabilir Veya Bağlantı Artık Geçerli Olmayabilir."
                : error || "İşletme Bilgileri Şu Anda Görüntülenemiyor."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const { company, branch } = data.listing;

  return (
    <main className="min-h-screen bg-[#f7f6f3] text-[#272521]">
      <header className="border-b border-[#e8e3dd] bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-[#aa8cff] via-[#805df1] to-[#6847dc] text-base font-semibold text-white shadow-[0_8px_24px_rgba(118,87,232,.22)]">V</div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold tracking-[-.02em]">{company.name}</p>
              <p className="mt-0.5 truncate text-[11px] text-[#8d8881]">VALOO Pazar Yeri</p>
            </div>
          </div>
          <span className="rounded-full bg-[#f2efff] px-3 py-1.5 text-[10px] font-semibold text-[#6f58cf]">Doğrudan İşletme Yayını</span>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-[#e8e3dd] bg-white">
        <div aria-hidden="true" className="absolute -right-24 -top-32 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(128,93,241,.14),rgba(128,93,241,0)_68%)]" />
        <div className="relative mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#7c68d6]">{branch.name}</p>
            <h1 className="mt-3 max-w-3xl text-[38px] font-semibold leading-[1.05] tracking-[-.05em] sm:text-[52px]">Kendin İçin Doğru Hizmeti Seç.</h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-7 text-[#706a64]">{company.name} · {branch.name} Tarafından Sunulan Aktif Hizmetleri, Sürelerini Ve Güncel Fiyatlarını İnceleyin.</p>
            <div className="mt-6 flex flex-wrap gap-2 text-[11px] text-[#6d6761]">
              {branch.address ? <Pill>{branch.address}</Pill> : null}
              {branch.phone ? <Pill>{branch.phone}</Pill> : null}
              {branch.email ? <Pill>{branch.email}</Pill> : null}
            </div>
          </div>

          <div className="rounded-[24px] border border-[#e7e1da] bg-[#fbfaf8] p-5 shadow-[0_18px_50px_rgba(47,41,35,.05)]">
            <p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#969089]">Hızlı Özet</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Summary label="Hizmet" value={String(services.length)} />
              <Summary label="Başlangıç" value={minPrice === null ? "—" : formatMoney(minPrice)} />
            </div>
            <p className="mt-4 text-[11px] leading-5 text-[#8a847d]">Bu Sayfa İşletmenin VALOO Yönetim Panelinden Yayınladığı Müşteriye Açık Bilgilerden Oluşur.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#928b84]">Hizmet Kataloğu</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-.035em]">Aktif Hizmetler</h2>
          </div>
          <p className="text-[12px] text-[#8b857f]">{services.length} Hizmet Listeleniyor</p>
        </div>

        {services.length ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <article key={service.id} className="flex min-h-[230px] flex-col rounded-[24px] border border-[#e4dfd9] bg-white p-5 shadow-[0_12px_35px_rgba(48,42,36,.035)] transition-transform duration-200 hover:-translate-y-0.5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#f2efff] text-[#725bd3]">✦</div>
                  <span className="shrink-0 text-[16px] font-semibold tracking-[-.025em]">{formatMoney(service.price)}</span>
                </div>
                <h3 className="mt-5 text-[16px] font-semibold tracking-[-.025em]">{service.name}</h3>
                <p className="mt-2 line-clamp-3 text-[12px] leading-5 text-[#77716b]">{service.description || "Bu Hizmet İçin Ayrıntılı Açıklama Henüz Eklenmemiş."}</p>
                <div className="mt-auto pt-5">
                  <span className="inline-flex rounded-full bg-[#f6f4f1] px-3 py-1.5 text-[10px] font-medium text-[#706a64]">{service.durationMinutes} Dakika</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-[#ddd7d0] bg-white px-6 py-16 text-center">
            <h3 className="text-[16px] font-semibold">Aktif Hizmet Bulunmuyor</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#817b74]">İşletme Bu Şube İçin Henüz Pazar Yerinde Gösterilecek Aktif Bir Hizmet Yayınlamamış.</p>
          </div>
        )}
      </section>

      <footer className="border-t border-[#e6e1db] bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-[11px] text-[#98918a] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>{company.name} · {branch.name}</span>
          <span>VALOO Pazar Yeri</span>
        </div>
      </footer>
    </main>
  );
}

function Pill({ children }: { children: string }) {
  return <span className="rounded-full border border-[#e3ded8] bg-[#faf9f7] px-3 py-1.5">{children}</span>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] bg-white p-4 shadow-[inset_0_0_0_1px_#ebe6e0]">
      <p className="text-[9px] font-semibold uppercase tracking-[.1em] text-[#99928b]">{label}</p>
      <p className="mt-2 truncate text-[17px] font-semibold tracking-[-.03em]">{value}</p>
    </div>
  );
}
