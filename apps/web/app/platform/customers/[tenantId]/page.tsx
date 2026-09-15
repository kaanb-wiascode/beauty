"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { CustomerContextPanel } from "@/components/platform/customer-context-panel";
import { TenantGovernancePanel } from "@/components/platform/tenant-governance-panel";
import { ApiError } from "@/lib/api";
import {
  getPlatformCustomer360,
  type PlatformCustomer360,
} from "@/lib/platform-api";

const number = new Intl.NumberFormat("tr-TR");
const date = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default function PlatformCustomer360Page() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [data, setData] = useState<PlatformCustomer360 | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getPlatformCustomer360(tenantId)
      .then((value) => active && setData(value))
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof ApiError
            ? reason.message
            : "Tenant 360 verileri yüklenemedi.",
        );
      });
    return () => {
      active = false;
    };
  }, [tenantId]);

  if (error) {
    return (
      <div className="mx-auto max-w-[1380px]">
        <Link href="/platform/customers" className="text-xs font-semibold text-violet-300">
          ← Customers
        </Link>
        <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/[.07] px-5 py-4 text-sm text-red-100">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid min-h-[55vh] place-items-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-violet-400" />
      </div>
    );
  }

  const tenant = data.tenant;

  return (
    <div className="mx-auto max-w-[1380px] space-y-7 pb-12">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <Link href="/platform/customers" className="text-xs font-semibold text-violet-300">
            ← Customers
          </Link>
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-[.18em] text-violet-300">
            Tenant 360
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] text-white sm:text-4xl">
            {tenant.name}
          </h1>
          <p className="mt-2 text-sm text-white/40">{tenant.slug} · {tenant.id}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[.035] px-4 py-3 text-xs text-white/50">
          Oluşturulma: <span className="font-semibold text-white/75">{date.format(new Date(tenant.createdAt))}</span>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <Metric label="Şirket" value={tenant.companyCount} detail={`${tenant.activeCompanyCount} aktif`} />
        <Metric label="Şube" value={tenant.branchCount} detail={`${tenant.activeBranchCount} aktif`} />
        <Metric label="Aktif kullanıcı" value={tenant.activeMembershipCount} />
        <Metric label="Aktif owner" value={tenant.ownerCount} />
        <Metric
          label="Şirket aktiflik"
          value={tenant.companyCount ? Math.round((tenant.activeCompanyCount / tenant.companyCount) * 100) : 0}
          suffix="%"
        />
        <Metric
          label="Şube aktiflik"
          value={tenant.branchCount ? Math.round((tenant.activeBranchCount / tenant.branchCount) * 100) : 0}
          suffix="%"
        />
      </section>

      <TenantGovernancePanel tenantId={tenant.id} />
      <CustomerContextPanel tenantId={tenant.id} />

      <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <Panel title="Organizasyon yapısı" eyebrow="Companies & branches">
          <div className="divide-y divide-white/[.07]">
            {data.companies.map((company) => (
              <div key={company.id} className="grid gap-4 py-4 sm:grid-cols-[1.5fr_.7fr_.7fr_.7fr] sm:items-center">
                <div>
                  <p className="text-sm font-semibold text-white">{company.name}</p>
                  <p className="mt-1 text-[10px] text-white/30">{company.slug}</p>
                </div>
                <Cell label="Durum" value={company.status} />
                <Cell label="Şube" value={`${company.activeBranchCount} / ${company.branchCount}`} />
                <Cell label="Oluşturulma" value={date.format(new Date(company.createdAt))} />
              </div>
            ))}
            {!data.companies.length ? (
              <p className="py-8 text-center text-sm text-white/35">Şirket kaydı bulunmuyor.</p>
            ) : null}
          </div>
        </Panel>

        <Panel title="Üyelik dağılımı" eyebrow="Membership state">
          <div className="space-y-3">
            {data.membershipBreakdown.map((membership) => (
              <div key={`${membership.role}-${membership.status}`} className="rounded-2xl border border-white/[.07] bg-black/15 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-white">{membership.role}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[.11em] text-white/30">{membership.status}</p>
                  </div>
                  <strong className="text-xl font-semibold tracking-tight text-white">{number.format(membership.count)}</strong>
                </div>
              </div>
            ))}
            {!data.membershipBreakdown.length ? (
              <p className="py-8 text-center text-sm text-white/35">Üyelik kaydı bulunmuyor.</p>
            ) : null}
          </div>
        </Panel>
      </div>

      <Panel title="Tenant kimliği" eyebrow="Account metadata">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <Cell label="Tenant ID" value={tenant.id} />
          <Cell label="Slug" value={tenant.slug} />
          <Cell label="Lifecycle" value={`${tenant.lifecycleState} · v${tenant.lifecycleVersion}`} />
          <Cell label="Oluşturulma" value={date.format(new Date(tenant.createdAt))} />
          <Cell label="Son güncelleme" value={date.format(new Date(tenant.updatedAt))} />
          <Cell label="Lifecycle nedeni" value={tenant.lifecycleReason ?? "—"} />
        </div>
      </Panel>
    </div>
  );
}

function Metric({ label, value, detail, suffix = "" }: { label: string; value: number; detail?: string; suffix?: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[.035] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] backdrop-blur-xl">
      <p className="text-[9px] font-semibold uppercase tracking-[.15em] text-white/35">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-[-.04em] text-white">{number.format(value)}{suffix}</p>
      {detail ? <p className="mt-1 text-[10px] text-emerald-300/70">{detail}</p> : null}
    </div>
  );
}

function Panel({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[26px] border border-white/10 bg-white/[.035] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] backdrop-blur-xl sm:p-6">
      <p className="text-[9px] font-semibold uppercase tracking-[.15em] text-white/30">{eyebrow}</p>
      <h2 className="mt-1 text-base font-semibold text-white">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-white/25">{label}</p>
      <p className="mt-1 truncate text-xs font-medium text-white/65" title={value}>{value}</p>
    </div>
  );
}
