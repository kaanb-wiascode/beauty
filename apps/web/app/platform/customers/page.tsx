"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import {
  listPlatformCustomers,
  type PlatformCustomerList,
} from "@/lib/platform-api";

const number = new Intl.NumberFormat("tr-TR");
const date = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default function PlatformCustomersPage() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<PlatformCustomerList | null>(null);
  const [error, setError] = useState("");
  const limit = 20;

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setOffset(0);
      setQuery(search.trim());
    }, 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    let active = true;
    setError("");
    listPlatformCustomers({ search: query || undefined, limit, offset })
      .then((value) => active && setData(value))
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof ApiError
            ? reason.message
            : "Customer kayıtları yüklenemedi.",
        );
      });
    return () => {
      active = false;
    };
  }, [query, offset]);

  const total = data?.pagination.total ?? 0;
  const page = Math.floor(offset / limit) + 1;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="mx-auto max-w-[1380px] space-y-7 pb-12">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-violet-300">
            Customer operations
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] text-white sm:text-4xl">
            Customers
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">
            Tenant hesaplarını, organizasyon ölçeğini ve aktif kullanım sinyallerini incele.
          </p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/[.035] px-4 py-2 text-xs font-medium text-white/55">
          {number.format(total)} tenant
        </div>
      </header>

      <section className="rounded-[26px] border border-white/10 bg-white/[.035] shadow-[inset_0_1px_0_rgba(255,255,255,.04)] backdrop-blur-xl">
        <div className="border-b border-white/10 p-4 sm:p-5">
          <div className="relative max-w-xl">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tenant adı veya slug ara…"
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-violet-400/35 focus:ring-2 focus:ring-violet-400/10"
            />
          </div>
        </div>

        {error ? (
          <div className="m-5 rounded-2xl border border-red-400/20 bg-red-400/[.07] px-5 py-4 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead>
              <tr className="border-b border-white/[.07] text-[9px] font-semibold uppercase tracking-[.13em] text-white/30">
                <th className="px-5 py-3.5">Tenant</th>
                <th className="px-4 py-3.5">Şirket</th>
                <th className="px-4 py-3.5">Şube</th>
                <th className="px-4 py-3.5">Aktif kullanıcı</th>
                <th className="px-4 py-3.5">Owner</th>
                <th className="px-4 py-3.5">Oluşturulma</th>
                <th className="px-5 py-3.5 text-right">Detay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[.06]">
              {data?.items.map((customer) => (
                <tr key={customer.id} className="transition hover:bg-white/[.02]">
                  <td className="px-5 py-4">
                    <p className="text-sm font-semibold text-white">{customer.name}</p>
                    <p className="mt-1 text-[10px] text-white/30">{customer.slug}</p>
                  </td>
                  <td className="px-4 py-4 text-xs text-white/60">
                    {number.format(customer.activeCompanyCount)} / {number.format(customer.companyCount)}
                  </td>
                  <td className="px-4 py-4 text-xs text-white/60">
                    {number.format(customer.activeBranchCount)} / {number.format(customer.branchCount)}
                  </td>
                  <td className="px-4 py-4 text-xs font-medium text-white/75">
                    {number.format(customer.activeMembershipCount)}
                  </td>
                  <td className="px-4 py-4 text-xs text-white/60">
                    {number.format(customer.ownerCount)}
                  </td>
                  <td className="px-4 py-4 text-xs text-white/45">
                    {date.format(new Date(customer.createdAt))}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/platform/customers/${customer.id}`}
                      className="inline-flex rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-[10px] font-semibold text-white/65 transition hover:border-violet-400/25 hover:bg-violet-400/10 hover:text-white"
                    >
                      Tenant 360 →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data && !data.items.length ? (
          <p className="px-6 py-12 text-center text-sm text-white/35">
            Arama kriterine uygun tenant bulunamadı.
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-4 border-t border-white/[.07] px-5 py-4">
          <p className="text-[10px] text-white/30">
            Sayfa {page} / {pageCount}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset((value) => Math.max(0, value - limit))}
              className="rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-[10px] font-semibold text-white/60 transition enabled:hover:bg-white/[.07] disabled:cursor-not-allowed disabled:opacity-30"
            >
              Önceki
            </button>
            <button
              type="button"
              disabled={!data || offset + limit >= total}
              onClick={() => setOffset((value) => value + limit)}
              className="rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-[10px] font-semibold text-white/60 transition enabled:hover:bg-white/[.07] disabled:cursor-not-allowed disabled:opacity-30"
            >
              Sonraki
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
