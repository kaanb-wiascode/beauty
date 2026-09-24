"use client";

import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { userLabel, userPermissionLabel } from "@/lib/user-language";
import { listPlatformAuditEvents, type PlatformAuditList } from "@/lib/platform-api";

const date = new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "medium" });

export default function PlatformAuditPage() {
  const [resource, setResource] = useState("");
  const [action, setAction] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [requestId, setRequestId] = useState("");
  const [riskLevel, setRiskLevel] = useState("");
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
        requestId: requestId.trim() || undefined,
        riskLevel: riskLevel.trim() || undefined,
        limit,
        offset,
      })
        .then((value) => active && setData(value))
        .catch((reason: unknown) => {
          if (!active) return;
          setError(reason instanceof ApiError ? reason.message : "Denetim kayıtları yüklenemedi.");
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [resource, action, tenantId, requestId, riskLevel, offset]);

  const total = data?.pagination.total ?? 0;

  return (
    <div className="mx-auto max-w-[1380px] space-y-7 pb-12">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-violet-300">Güvenlik ve Sorumluluk</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] text-white sm:text-4xl">Platform Denetim Kayıtları</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">Platform üzerinde yapılan işlemleri kullanıcı, işlem türü, hedef şirket ve risk düzeyi bilgileriyle inceleyin.</p>
      </header>

      <section className="grid gap-3 rounded-[24px] border border-white/10 bg-white/[.035] p-4 md:grid-cols-2 xl:grid-cols-5">
        <Filter label="İşlem alanı" value={resource} onChange={(value) => { setOffset(0); setResource(value); }} placeholder="Örn. erişim yönetimi" />
        <Filter label="İşlem türü" value={action} onChange={(value) => { setOffset(0); setAction(value); }} placeholder="Örn. rol atama" />
        <Filter label="Şirket Kayıt No" value={tenantId} onChange={(value) => { setOffset(0); setTenantId(value); }} placeholder="Şirket kayıt numarası" />
        <Filter label="İstek Kayıt No" value={requestId} onChange={(value) => { setOffset(0); setRequestId(value); }} placeholder="İstek veya izleme numarası" />
        <Filter label="Risk Düzeyi" value={riskLevel} onChange={(value) => { setOffset(0); setRiskLevel(value); }} placeholder="Yüksek veya kritik" />
      </section>

      {error ? <div className="rounded-2xl border border-red-400/20 bg-red-400/[.07] px-5 py-4 text-sm text-red-100">{error}</div> : null}

      <section className="rounded-[26px] border border-white/10 bg-white/[.035]">
        <div className="flex items-center justify-between gap-4 border-b border-white/[.07] px-5 py-4">
          <div><p className="text-[9px] font-semibold uppercase tracking-[.14em] text-white/30">İşlem Geçmişi</p><p className="mt-1 text-sm font-semibold text-white">{total.toLocaleString("tr-TR")} kayıt</p></div>
          <span className="rounded-full border border-emerald-400/15 bg-emerald-400/[.06] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[.12em] text-emerald-200">Değiştirilemez Kayıt</span>
        </div>
        <div className="divide-y divide-white/[.06]">
          {data?.items.map((event) => <AuditRow key={event.id} event={event} />)}
          {data && !data.items.length ? <p className="px-6 py-12 text-center text-sm text-white/35">Filtrelere uygun denetim kaydı bulunamadı.</p> : null}
          {!data && !error ? <div className="grid min-h-52 place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-violet-400" /></div> : null}
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-white/[.07] px-5 py-4"><p className="text-[10px] text-white/30">{total ? offset + 1 : 0}-{Math.min(offset + limit, total)} / {total}</p><div className="flex gap-2"><button type="button" disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - limit))} className="rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-[10px] font-semibold text-white/60 disabled:opacity-30">Önceki</button><button type="button" disabled={!data || offset + limit >= total} onClick={() => setOffset((value) => value + limit)} className="rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-[10px] font-semibold text-white/60 disabled:opacity-30">Sonraki</button></div></div>
      </section>
    </div>
  );
}

function AuditRow({ event }: { event: PlatformAuditList["items"][number] }) {
  const actor = [event.actorFirstName, event.actorLastName].filter(Boolean).join(" ") || event.actorEmail || event.actorUserId;
  return <details className="group px-5 py-4"><summary className="grid cursor-pointer list-none gap-3 md:grid-cols-[1fr_.8fr_1fr_.8fr] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold text-white">{userPermissionLabel(event.resource, event.action)}</p>{event.riskLevel ? <span className="rounded-full border border-amber-400/20 bg-amber-400/[.07] px-2 py-0.5 text-[8px] font-semibold text-amber-200">{userLabel(event.riskLevel)}</span> : null}</div><p className="mt-1 text-[10px] text-white/30">Denetim kaydı</p></div><div><p className="text-[9px] uppercase tracking-[.11em] text-white/25">Aktör</p><p className="mt-1 text-[11px] text-white/60">{actor}</p></div><div><p className="text-[9px] uppercase tracking-[.11em] text-white/25">Hedef</p><p className="mt-1 text-[11px] text-white/60">{event.targetEntityType ? `${userLabel(event.targetEntityType)} kaydı` : event.targetTenantId ? "İşletme kaydı" : "—"}</p></div><div><p className="text-[9px] uppercase tracking-[.11em] text-white/25">Zaman</p><p className="mt-1 text-[11px] text-white/60">{date.format(new Date(event.createdAt))}</p></div></summary><div className="mt-4 grid gap-3 rounded-2xl border border-white/[.06] bg-black/15 p-4 xl:grid-cols-2"><Data label="Gerekçe" value={event.reason} /><Data label="İstek Kayıt No" value={event.requestId} /><Data label="Onay Talebi Kayıt No" value={event.approvalRequestId} /><Data label="Kaynak IP Adresi" value={event.sourceIp} /><Data label="Tarayıcı / Uygulama Bilgisi" value={event.userAgent} /><Data label="İşlem İzleme No" value={event.correlationId} /><Data label="Değişiklik öncesi" value={auditValueSummary(event.beforeState)} /><Data label="Değişiklik sonrası" value={auditValueSummary(event.afterState)} /><Data label="Ek kayıt bilgisi" value={event.metadata ? "Ek sistem bilgileri kaydedildi." : null} /></div></details>;
}
function Filter({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) { return <label><span className="mb-2 block text-[9px] font-semibold uppercase tracking-[.12em] text-white/30">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-2xl border border-white/10 bg-black/20 px-3.5 py-3 text-xs text-white outline-none placeholder:text-white/20 focus:border-violet-400/35" /></label>; }
function Data({ label, value }: { label: string; value: string | null }) { return <div><p className="text-[9px] uppercase tracking-[.11em] text-white/25">{label}</p><p className="mt-1 break-all text-[11px] text-white/60">{value || "—"}</p></div>; }
function auditValueSummary(value: unknown) { if (value === null || value === undefined) return null; if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value); return "Değişiklik ayrıntıları güvenli biçimde kaydedildi."; }
