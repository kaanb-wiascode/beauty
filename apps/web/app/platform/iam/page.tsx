"use client";

import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { getPlatformIamOverview, type PlatformIamOverview } from "@/lib/platform-api";

const number = new Intl.NumberFormat("tr-TR");

export default function PlatformIamPage() {
  const [data, setData] = useState<PlatformIamOverview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getPlatformIamOverview()
      .then((value) => active && setData(value))
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof ApiError ? reason.message : "Platform IAM verileri yüklenemedi.");
      });
    return () => { active = false; };
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;

  return (
    <div className="mx-auto max-w-[1380px] space-y-7 pb-12">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-violet-300">Identity & access</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] text-white sm:text-4xl">Platform IAM</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">Platform yöneticilerini, sistem rollerini ve permission matrisini tenant rollerinden bağımsız olarak incele.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Platform admin" value={data.summary.adminCount} />
        <Metric label="Aktif admin" value={data.summary.activeAdminCount} />
        <Metric label="Rol" value={data.summary.roleCount} />
        <Metric label="Permission" value={data.summary.permissionCount} />
      </section>

      <Panel title="Platform yöneticileri" eyebrow="Explicit assignments">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-xs">
            <thead><tr className="border-b border-white/[.07] text-[9px] uppercase tracking-[.13em] text-white/30"><th className="py-3 pr-4">Yönetici</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3">Roller</th><th className="pl-4 py-3">User ID</th></tr></thead>
            <tbody className="divide-y divide-white/[.06]">
              {data.admins.map((admin) => <tr key={admin.userId}><td className="py-4 pr-4"><p className="font-semibold text-white">{admin.firstName} {admin.lastName}</p><p className="mt-1 text-[10px] text-white/35">{admin.email}</p></td><td className="px-4 py-4"><Status value={admin.status} /></td><td className="px-4 py-4"><div className="flex flex-wrap gap-1.5">{admin.roles.map((role) => <span key={role.slug} className="rounded-full border border-violet-400/20 bg-violet-400/[.08] px-2.5 py-1 text-[9px] font-semibold text-violet-200">{role.name}</span>)}{!admin.roles.length ? <span className="text-white/30">Rol atanmamış</span> : null}</div></td><td className="pl-4 py-4 font-mono text-[10px] text-white/35">{admin.userId}</td></tr>)}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Rol ve permission matrisi" eyebrow="Authorization model">
        <div className="grid gap-4 xl:grid-cols-3">
          {data.roles.map((role) => <div key={role.slug} className="rounded-[20px] border border-white/[.08] bg-black/15 p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-white">{role.name}</p><p className="mt-1 font-mono text-[9px] text-white/30">{role.slug}</p></div><span className="rounded-full border border-white/10 bg-white/[.04] px-2.5 py-1 text-[9px] text-white/45">{number.format(role.userCount)} kullanıcı</span></div><p className="mt-3 min-h-10 text-[11px] leading-5 text-white/40">{role.description ?? "Açıklama yok."}</p><div className="mt-4 flex flex-wrap gap-1.5">{role.permissions.map((permission) => <span key={`${permission.resource}.${permission.action}`} className="rounded-lg border border-white/[.08] bg-white/[.035] px-2 py-1 text-[9px] text-white/55">{permission.resource}.{permission.action}</span>)}</div></div>)}
        </div>
      </Panel>

      <Panel title="Permission kataloğu" eyebrow="Available permissions">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{data.permissions.map((permission) => <div key={`${permission.resource}.${permission.action}`} className="rounded-2xl border border-white/[.07] bg-black/15 p-4"><div className="flex items-center justify-between gap-3"><code className="text-[11px] font-semibold text-violet-200">{permission.resource}.{permission.action}</code><span className="text-[9px] text-white/30">{permission.roleCount} rol</span></div><p className="mt-2 text-[10px] leading-5 text-white/40">{permission.description ?? "Açıklama yok."}</p></div>)}</div>
      </Panel>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-[22px] border border-white/10 bg-white/[.035] p-5"><p className="text-[9px] font-semibold uppercase tracking-[.15em] text-white/35">{label}</p><p className="mt-3 text-2xl font-semibold text-white">{number.format(value)}</p></div>; }
function Panel({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) { return <section className="rounded-[26px] border border-white/10 bg-white/[.035] p-5 sm:p-6"><p className="text-[9px] font-semibold uppercase tracking-[.15em] text-white/30">{eyebrow}</p><h2 className="mt-1 text-base font-semibold text-white">{title}</h2><div className="mt-5">{children}</div></section>; }
function Status({ value }: { value: string }) { const active = value === "ACTIVE"; return <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold ${active ? "border-emerald-400/20 bg-emerald-400/[.08] text-emerald-200" : "border-amber-400/20 bg-amber-400/[.08] text-amber-200"}`}>{value}</span>; }
function Loading() { return <div className="grid min-h-[55vh] place-items-center"><div className="h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-violet-400" /></div>; }
function ErrorBox({ message }: { message: string }) { return <div className="mx-auto max-w-[1380px] rounded-2xl border border-red-400/20 bg-red-400/[.07] px-5 py-4 text-sm text-red-100">{message}</div>; }
