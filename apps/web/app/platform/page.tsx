"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import {
  getPlatformCommandCenter,
  type PlatformCommandCenter,
} from "@/lib/platform-api";

const number = new Intl.NumberFormat("tr-TR");
const date = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default function PlatformCommandCenterPage() {
  const [data, setData] = useState<PlatformCommandCenter | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getPlatformCommandCenter()
      .then((value) => active && setData(value))
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof ApiError
            ? reason.message
            : "Platform yönetim özeti yüklenemedi.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-[1380px] space-y-8 pb-12">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-violet-300">
            Platform yönetimi
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] text-white sm:text-4xl">
            Yönetim merkezi
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">
            Platformdaki işletmeleri, organizasyon yapılarını ve aktif kullanıcıları tek ekrandan izleyin.
          </p>
        </div>
        <Link
          href="/platform/customers"
          className="inline-flex w-fit items-center rounded-2xl border border-violet-400/25 bg-violet-400/10 px-4 py-3 text-xs font-semibold text-violet-100 transition hover:bg-violet-400/15"
        >
          İşletmeleri görüntüle →
        </Link>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-400/[.07] px-5 py-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {!data && !error ? <LoadingGrid /> : null}

      {data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <Metric label="İşletme" value={data.counts.tenantCount} />
            <Metric label="Şirket" value={data.counts.companyCount} detail={`${number.format(data.counts.activeCompanyCount)} aktif`} />
            <Metric label="Şube" value={data.counts.branchCount} detail={`${number.format(data.counts.activeBranchCount)} aktif`} />
            <Metric label="Aktif kullanıcı" value={data.counts.activeMembershipCount} />
            <Metric
              label="Şirket aktiflik"
              value={data.counts.companyCount ? Math.round((data.counts.activeCompanyCount / data.counts.companyCount) * 100) : 0}
              suffix="%"
            />
            <Metric
              label="Şube aktiflik"
              value={data.counts.branchCount ? Math.round((data.counts.activeBranchCount / data.counts.branchCount) * 100) : 0}
              suffix="%"
            />
          </section>

          <section className="rounded-[26px] border border-white/10 bg-white/[.035] shadow-[inset_0_1px_0_rgba(255,255,255,.04)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-white/35">Son işlemler</p>
                <h2 className="mt-1 text-base font-semibold text-white">Son oluşturulan işletmeler</h2>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1 text-[10px] font-semibold text-white/45">
                Son {data.recentTenants.length}
              </span>
            </div>
            <div className="divide-y divide-white/[.07]">
              {data.recentTenants.map((tenant) => (
                <Link
                  key={tenant.id}
                  href={`/platform/customers/${tenant.id}`}
                  className="grid gap-3 px-5 py-4 transition hover:bg-white/[.025] sm:grid-cols-[1.6fr_.8fr_.8fr_.8fr] sm:items-center sm:px-6"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{tenant.name}</p>
                    <p className="mt-1 text-[11px] text-white/35">{tenant.slug}</p>
                  </div>
                  <DataCell label="Aktif kullanıcı" value={number.format(tenant.activeMembershipCount)} />
                  <DataCell label="Aktif şube" value={number.format(tenant.activeBranchCount)} />
                  <DataCell label="Oluşturulma" value={date.format(new Date(tenant.createdAt))} />
                </Link>
              ))}
              {!data.recentTenants.length ? (
                <p className="px-6 py-10 text-center text-sm text-white/35">Henüz işletme kaydı bulunmuyor.</p>
              ) : null}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Metric({ label, value, detail, suffix = "" }: { label: string; value: number; detail?: string; suffix?: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[.035] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] backdrop-blur-xl">
      <p className="text-[9px] font-semibold uppercase tracking-[.15em] text-white/35">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-[-.04em] text-white">
        {number.format(value)}{suffix}
      </p>
      {detail ? <p className="mt-1 text-[10px] text-emerald-300/70">{detail}</p> : null}
    </div>
  );
}

function DataCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-white/25">{label}</p>
      <p className="mt-1 text-xs font-medium text-white/65">{value}</p>
    </div>
  );
}

function LoadingGrid() {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-28 animate-pulse rounded-[22px] border border-white/[.06] bg-white/[.025]" />
      ))}
    </section>
  );
}
