"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";

type Integration={id:string;displayName:string;provider:string;kind:string;status:string};
type Health={
  integrationId:string;healthy:boolean;status:string;runtimeReady:boolean;hasCredentials:boolean;lastError:string|null;
  consent:{expiresAt:string|null;expired:boolean;expiringSoon:boolean};
  sync:{lastSyncAt:string|null;lastStatus:string|null;lastCompletedAt:string|null;stale:boolean;staleAfterHours:number;activeRun:null|{id:string;startedAt:string|null;heartbeatAt:string|null;stale:boolean;staleAfterMinutes:number}};
  observability:{windowHours:number;attempts:number;successes:number;failures:number;successRate:number|null;averageDurationMs:number;staleRecoveries:number;lastRecoveredAt:string|null};
  banking:null|{activeAccountCount:number;inactiveAccountCount:number;latestBalanceAsOf:string|null;currentBalancesByCurrency:Record<string,string|number>;latestTransactionAt:string|null;unmatchedTransactionCount:number;transactionWatermark:string|null;transactionOverlapHours:number|null};
};
type AlertState={integrationId:string;state:"HEALTHY"|"WARNING"|"CRITICAL";thresholds:Record<string,number>;alerts:Array<{code:string;severity:"WARNING"|"CRITICAL";message:string}>};
type AuditLog={id:string;action:string;entityId:string|null;outcome:"SUCCESS"|"FAILED";route:string|null;method:string|null;errorMessage:string|null;actorUserId:string|null;actorRoleId:string|null;createdAt:string};

function dateTime(value?:string|null){if(!value)return "—";return new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));}
function stateClass(value:string){if(value==="HEALTHY"||value==="SUCCESS"||value==="CONNECTED")return "bg-emerald-50 text-emerald-700";if(value==="CRITICAL"||value==="FAILED"||value==="ERROR")return "bg-rose-50 text-rose-700";return "bg-amber-50 text-amber-700";}
function duration(ms:number){if(!ms)return "0 sn";if(ms<1000)return `${Math.round(ms)} ms`;if(ms<60000)return `${(ms/1000).toFixed(1)} sn`;return `${(ms/60000).toFixed(1)} dk`;}

export default function IntegrationOperationsPage(){
  const [integrations,setIntegrations]=useState<Integration[]>([]);
  const [selected,setSelected]=useState("");
  const [health,setHealth]=useState<Health|null>(null);
  const [alerts,setAlerts]=useState<AlertState|null>(null);
  const [audit,setAudit]=useState<AuditLog[]>([]);
  const [error,setError]=useState<string|null>(null);
  const [loading,setLoading]=useState(false);

  const loadIntegrations=useCallback(async()=>{
    try{
      const rows=await api<Integration[]>("/financial-integrations");
      setIntegrations(rows);
      setSelected(current=>current||rows[0]?.id||"");
    }catch(e){setError(e instanceof ApiError?e.message:"Entegrasyon listesi yüklenemedi.");}
  },[]);

  const loadSelected=useCallback(async(id:string)=>{
    if(!id)return;
    setLoading(true);setError(null);
    try{
      const [h,a,l]=await Promise.all([
        api<Health>(`/financial-integrations/${id}/health`),
        api<AlertState>(`/financial-integrations/${id}/alerts`),
        api<AuditLog[]>(`/financial-integrations/audit-logs?entityId=${encodeURIComponent(id)}&limit=50`),
      ]);
      setHealth(h);setAlerts(a);setAudit(l);
    }catch(e){setError(e instanceof ApiError?e.message:"Operasyon verileri yüklenemedi.");}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{void loadIntegrations();},[loadIntegrations]);
  useEffect(()=>{if(selected)void loadSelected(selected);},[selected,loadSelected]);
  const current=useMemo(()=>integrations.find(i=>i.id===selected)??null,[integrations,selected]);

  return <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
    <header className="rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_16px_50px_rgba(43,35,72,.07)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-[#8d76df]">Finans & CFO</p><h1 className="mt-1 text-2xl font-semibold tracking-[-.04em] text-[#242332]">Integration Operations</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#777586]">Provider health, sync heartbeat, production alert eşikleri ve audit kayıtlarını tek operasyon ekranında izleyin.</p></div><div className="flex gap-2"><select value={selected} onChange={e=>setSelected(e.target.value)} className="min-w-[260px] rounded-2xl border border-[#e9e5f1] bg-white px-3 py-2.5 text-sm">{integrations.map(i=><option key={i.id} value={i.id}>{i.displayName} · {i.provider}</option>)}</select><button type="button" onClick={()=>void loadSelected(selected)} disabled={!selected||loading} className="rounded-2xl border border-[#e8e4f4] bg-white px-4 py-2.5 text-sm font-medium text-[#6048bd] disabled:opacity-50">{loading?"Yükleniyor…":"Yenile"}</button></div></div>
    </header>
    {error?<div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>:null}

    {current&&health&&alerts?<>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric title="Alert State" value={alerts.state} subtitle={`${alerts.alerts.length} aktif alarm`} tone={alerts.state}/>
        <Metric title="Sync Success" value={health.observability.successRate==null?"—":`${health.observability.successRate}%`} subtitle={`${health.observability.attempts} deneme / 24s`}/>
        <Metric title="Ort. Süre" value={duration(health.observability.averageDurationMs)} subtitle={`${health.observability.failures} başarısız sync`}/>
        <Metric title="Stale Recovery" value={String(health.observability.staleRecoveries)} subtitle={health.observability.lastRecoveredAt?dateTime(health.observability.lastRecoveredAt):"Son 24s"}/>
        <Metric title="Unmatched Bank" value={String(health.banking?.unmatchedTransactionCount??0)} subtitle="Mutabakat bekleyen"/>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-[0_12px_40px_rgba(43,35,72,.06)]">
          <div className="flex items-center justify-between"><div><h2 className="text-base font-semibold text-[#282736]">Health & Sync Runtime</h2><p className="mt-1 text-xs text-[#8b8997]">{current.displayName} · {current.provider}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${stateClass(health.healthy?"HEALTHY":"WARNING")}`}>{health.healthy?"HEALTHY":"ATTENTION"}</span></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Info label="Integration Status" value={health.status}/><Info label="Runtime" value={health.runtimeReady?"Ready":"Partial"}/><Info label="Credentials" value={health.hasCredentials?"Configured":"Missing"}/><Info label="Last Sync" value={dateTime(health.sync.lastSyncAt)}/><Info label="Last Status" value={health.sync.lastStatus??"—"}/><Info label="Sync Stale" value={health.sync.stale?`Evet · ${health.sync.staleAfterHours}s eşik`:"Hayır"}/></div>
          <div className="mt-5 rounded-2xl border border-[#ece8f5] bg-[#faf9fd] p-4"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[#817d91]">Active Run</p>{health.sync.activeRun?<div className="mt-3 grid gap-3 sm:grid-cols-3"><Info label="Started" value={dateTime(health.sync.activeRun.startedAt)}/><Info label="Heartbeat" value={dateTime(health.sync.activeRun.heartbeatAt)}/><Info label="State" value={health.sync.activeRun.stale?`STALE · ${health.sync.activeRun.staleAfterMinutes} dk eşik`:"RUNNING · heartbeat fresh"}/></div>:<p className="mt-2 text-sm text-[#8b8997]">Aktif sync yok.</p>}</div>
          {health.banking?<div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Info label="Active Accounts" value={String(health.banking.activeAccountCount)}/><Info label="Inactive Accounts" value={String(health.banking.inactiveAccountCount)}/><Info label="Watermark" value={dateTime(health.banking.transactionWatermark)}/><Info label="Overlap" value={health.banking.transactionOverlapHours==null?"—":`${health.banking.transactionOverlapHours} saat`}/></div>:null}
          {health.lastError?<div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs leading-5 text-rose-700">{health.lastError}</div>:null}
        </div>

        <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-[0_12px_40px_rgba(43,35,72,.06)]">
          <div className="flex items-center justify-between"><div><h2 className="text-base font-semibold text-[#282736]">Production Alerts</h2><p className="mt-1 text-xs text-[#8b8997]">Eşik ihlalleri deterministik kurallardan üretilir.</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${stateClass(alerts.state)}`}>{alerts.state}</span></div>
          <div className="mt-4 space-y-2">{alerts.alerts.length?alerts.alerts.map(a=><div key={a.code} className={`rounded-2xl border p-3 ${a.severity==="CRITICAL"?"border-rose-100 bg-rose-50":"border-amber-100 bg-amber-50"}`}><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-[#373544]">{a.code}</p><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${stateClass(a.severity)}`}>{a.severity}</span></div><p className="mt-1 text-xs leading-5 text-[#716e7e]">{a.message}</p></div>):<div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700">Aktif production alarmı yok.</div>}</div>
          <div className="mt-5 border-t border-[#efecf4] pt-4"><p className="text-xs font-semibold text-[#555263]">Aktif eşikler</p><div className="mt-2 grid grid-cols-2 gap-2">{Object.entries(alerts.thresholds).map(([k,v])=><div key={k} className="rounded-xl bg-[#f7f5fb] px-3 py-2"><p className="truncate text-[10px] text-[#94919f]">{k}</p><p className="mt-0.5 text-xs font-semibold text-[#4b4858]">{v}</p></div>)}</div></div>
        </div>
      </section>

      <section className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-[0_12px_40px_rgba(43,35,72,.06)]">
        <div className="flex items-center justify-between"><div><h2 className="text-base font-semibold text-[#282736]">Audit Timeline</h2><p className="mt-1 text-xs text-[#8b8997]">Bu entegrasyon için son 50 mutation kaydı; credential değerleri audit log’a yazılmaz.</p></div><span className="rounded-full bg-[#f1edff] px-3 py-1 text-xs font-semibold text-[#7657e8]">{audit.length}</span></div>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead><tr className="border-b border-[#efecf4] text-[#8f8c99]"><th className="px-3 py-2 font-medium">Zaman</th><th className="px-3 py-2 font-medium">Action</th><th className="px-3 py-2 font-medium">Sonuç</th><th className="px-3 py-2 font-medium">Method</th><th className="px-3 py-2 font-medium">Actor</th><th className="px-3 py-2 font-medium">Hata</th></tr></thead><tbody>{audit.length?audit.map(row=><tr key={row.id} className="border-b border-[#f2eff6] last:border-0"><td className="px-3 py-3 text-[#706d7c]">{dateTime(row.createdAt)}</td><td className="px-3 py-3 font-medium text-[#343240]">{row.action}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${stateClass(row.outcome)}`}>{row.outcome}</span></td><td className="px-3 py-3 text-[#706d7c]">{row.method??"—"}</td><td className="px-3 py-3 text-[#706d7c]">{row.actorUserId?row.actorUserId.slice(0,8):"system"}</td><td className="max-w-[320px] truncate px-3 py-3 text-rose-600" title={row.errorMessage??undefined}>{row.errorMessage??"—"}</td></tr>):<tr><td colSpan={6} className="px-3 py-8 text-center text-[#9a97a4]">Audit kaydı yok.</td></tr>}</tbody></table></div>
      </section>
    </>:null}
  </div>;
}

function Metric({title,value,subtitle,tone}:{title:string;value:string;subtitle:string;tone?:string}){return <div className="rounded-[22px] border border-white/80 bg-white/90 p-4 shadow-[0_8px_30px_rgba(43,35,72,.05)]"><p className="text-[11px] font-medium uppercase tracking-[.1em] text-[#9693a0]">{title}</p><div className="mt-2 flex items-center gap-2"><p className="text-xl font-semibold tracking-[-.03em] text-[#292735]">{value}</p>{tone?<span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${stateClass(tone)}`}>{tone}</span>:null}</div><p className="mt-1 text-[11px] text-[#9996a3]">{subtitle}</p></div>}
function Info({label,value}:{label:string;value:string}){return <div className="rounded-2xl border border-[#efecf4] bg-white px-3 py-3"><p className="text-[10px] uppercase tracking-[.08em] text-[#9895a2]">{label}</p><p className="mt-1 break-words text-xs font-semibold text-[#4b4858]">{value}</p></div>}
