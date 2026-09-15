"use client";

import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { listPlatformAuditEvents, type PlatformAuditList } from "@/lib/platform-api";

const date = new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "medium" });

export default function PlatformAuditPage() {
  const [resource, setResource] = useState("");
  const [action, setAction] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [correlationId, setCorrelationId] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<PlatformAuditList | null>(null);
  const [error, setError] = useState("");
  const limit = 50;

  useEffect(() => {
    let active = true;
    setError("");
    const handle = window.setTimeout(() => {
      listPlatformAuditEvents({
        resource: resource.trim() || undefined,
        action: action.trim() || undefined,
        targetTenantId: tenantId.trim() || undefined,
        correlationId: correlationId.trim() || undefined,
        limit,
        offset,
      })
        .then((value) => active && setData(value))
        .catch((reason: unknown) => {
          if (!active) return;
          setError(reason instanceof ApiError ? reason.message : "Audit kayıtları yüklenemedi.");
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [resource, action, tenantId, correlationId, offset]);

  const total = data?.pagination.total ?? 0;

  return (
    <div className="mx-auto max-w-[1380px] space-y-7 pb-12">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-violet-300">Security & accountability</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] text-white sm:text-4xl">Platform Audit Explorer</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">Append-only platform olaylarını aktör, kaynak, işlem, tenant ve correlation ID üzerinden incele.</p>
      </header>

      <section className="grid gap-3 rounded-[24px] border border-white/10 bg-white/[.035] p-4 md:grid-cols-2 xl:grid-cols-4">
        <Filter label="Resource" value={resource} onChange={(value) => { setOffset(0); setResource(value); }} placeholder="platform_iam" />
        <Filter label="Action" value={action} onChange={(value) => { setOffset(0); setAction(value); }} placeholder="role.assign" />
        <Filter label="Tenant ID" value={tenantId} onChange={(value) => { setOffset(0); setTenantId(value); }} placeholder="tenant uuid" />
        <Filter label="Correlation ID" value={correlationId} onChange={(value) => { setOffset(0); setCorrelationId(value); }} placeholder="request / trace id" />
      </section>

      {error ? <div className="rounded-2xl border border-red-400/20 bg-red-400/[.07] px-5 py-4 text-sm text-red-100">{error}</div> : null}

      <section className="rounded-[26px] border border-white/10 bg-white/[.035]">
        <div className="flex items-center justify-between gap-4 border-b border-white/[.07] px-5 py-4">
          <div><p className="text-[9px] font-semibold uppercase tracking-[.14em] text-white/30">Event stream</p><p className="mt-1 text-sm font-semibold text-white">{total.toLocaleString("tr-TR")} kayıt</p></div>
          <span className="rounded-full border border-emerald-400/15 bg-emerald-400/[.06] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[.12em] text-emerald-200">Append-only</span>
        </div>
        <div className="divide-y divide-white/[.06]">
          {data?.items.map((event) => <AuditRow key={event.id} event={event} />)}
          {data && !data.items.length ? <p className="px-6 py-12 text-center text-sm text-white/35">Filtrelere uygun audit kaydı bulunamadı.</p> : null}
          {!data && !error ? <div className="grid min-h-52 place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-violet-400" /></div> : null}
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-white/[.07] px-5 py-4"><p className="text-[10px] text-white/30">{offset + 1}-{Math.min(offset + limit, total)} / {total}</p><div className="flex gap-2"><button type="button" disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - limit))} className="rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-[10px] font-semibold text-white/60 disabled:opacity-30">Önceki</button><button type="button" disabled={!data || offset + limit >= total} onClick={() => setOffset((value) => value + limit)} className="rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-[10px] font-semibold text-white/60 disabled:opacity-30">Sonraki</button></div></div>
      </section>
    </div>
  );
}

function AuditRow({ event }: { event: PlatformAuditList["items"][number] }) {
  const actor = [event.actorFirstName, event.actorLastName].filter(Boolean).join(" ") || event.actorEmail || event.actorUserId;
  return <details className="group px-5 py-4"><summary className="grid cursor-pointer list-none gap-3 md:grid-cols-[1fr_.8fr_1fr_.8fr] md:items-center"><div><p className="text-xs font-semibold text-white">{event.resource}.{event.action}</p><p className="mt-1 text-[10px] text-white/30">{event.id}</p></div><div><p className="text-[9px] uppercase tracking-[.11em] text-white/25">Aktör</p><p className="mt-1 text-[11px] text-white/60">{actor}</p></div><div><p className="text-[9px] uppercase tracking-[.11em] text-white/25">Hedef</p><p className="mt-1 text-[11px] text-white/60">{[event.targetEntityType, event.targetEntityId].filter(Boolean).join(": ") || event.targetTenantId || "—"}</p></div><div><p className="text-[9px] uppercase tracking-[.11em] text-white/25">Zaman</p><p className="mt-1 text-[11px] text-white/60">{date.format(new Date(event.createdAt))}</p></div></summary><div className="mt-4 grid gap-3 rounded-2xl border border-white/[.06] bg-black/15 p-4 xl:grid-cols-2"><Data label="Reason" value={event.reason} /><Data label="Correlation ID" value={event.correlationId} /><JsonBlock label="Before" value={event.beforeState} /><JsonBlock label="After" value={event.afterState} /><div className="xl:col-span-2"><JsonBlock label="Metadata" value={event.metadata} /></div></div></details>;
}
function Filter({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) { return <label><span className="mb-2 block text-[9px] font-semibold uppercase tracking-[.12em] text-white/30">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-2xl border border-white/10 bg-black/20 px-3.5 py-3 text-xs text-white outline-none placeholder:text-white/20 focus:border-violet-400/35" /></label>; }
function Data({ label, value }: { label: string; value: string | null }) { return <div><p className="text-[9px] uppercase tracking-[.11em] text-white/25">{label}</p><p className="mt-1 break-all text-[11px] text-white/60">{value || "—"}</p></div>; }
function JsonBlock({ label, value }: { label: string; value: unknown }) { return <div><p className="text-[9px] uppercase tracking-[.11em] text-white/25">{label}</p><pre className="mt-2 max-h-64 overflow-auto rounded-xl border border-white/[.06] bg-black/25 p-3 text-[10px] leading-5 text-white/55">{JSON.stringify(value, null, 2) ?? "null"}</pre></div>; }
