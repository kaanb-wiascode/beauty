"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { userLabel } from "@/lib/user-language";

type Counts={total:number;verified:number;missing:number;pending:number;expiring:number;expired:number;rejected:number};
type Item={requirementId:string;documentType:string;title:string;status:string;expiresAt?:string|null;restricted:boolean;compliant:boolean};
type Compliance={score:number;compliant:boolean;counts:Counts;items:Item[]};
const date=(v?:string|null)=>v?new Date(v).toLocaleDateString("tr-TR"):"—";
const statusLabel=(v:string)=>({MISSING:"Eksik",PENDING:"Bekliyor",VERIFIED:"Doğrulandı",EXPIRING:"Süresi Yaklaşıyor",EXPIRED:"Süresi Doldu",REJECTED:"Reddedildi"}[v]??userLabel(v));

export function EmployeeDocumentComplianceCard({employeeId}:{employeeId:string}){
 const[data,setData]=useState<Compliance|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{let active=true;const sensitive=hasPermission("hr_sensitive","read");setLoading(true);setError("");api<Compliance>(sensitive?`/hr/employees/${employeeId}/document-compliance/sensitive`:`/hr/employees/${employeeId}/document-compliance`).then(x=>{if(active)setData(x)}).catch(e=>{if(active)setError(e instanceof ApiError?e.message:"Belge uyum bilgisi yüklenemedi.")}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[employeeId]);
 if(loading)return <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-xs text-[var(--muted)]">Belge uyumu yükleniyor…</p></section>;
 return <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">Belgeler ve Uyum</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Zorunlu özlük belgeleri ve geçerlilik durumu.</p></div><Link href={`/hr/employees/${employeeId}/documents`} className="text-xs font-semibold text-[var(--accent)]">Belgeleri yönet →</Link></div>{error?<p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 text-xs text-[var(--danger)]">{error}</p>:data?<><div className="grid gap-2 sm:grid-cols-4"><Stat label="Uyum" value={`%${data.score}`}/><Stat label="Doğrulandı" value={data.counts.verified}/><Stat label="Eksik / Bekleyen" value={data.counts.missing+data.counts.pending+data.counts.rejected}/><Stat label="Süre Riski" value={data.counts.expiring+data.counts.expired}/></div><div className="mt-4 grid gap-2 md:grid-cols-2">{data.items.map(x=><div key={x.requirementId} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-3"><div className="min-w-0"><p className="truncate text-xs font-medium">{x.title}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{userLabel(x.documentType)}{x.expiresAt?` · ${date(x.expiresAt)}`:""}</p></div><span className={`shrink-0 rounded-full border border-[var(--line)] px-2 py-1 text-[10px] font-semibold ${x.compliant?"text-[var(--accent)]":x.status==="EXPIRING"?"text-[var(--warning)]":"text-[var(--danger)]"}`}>{statusLabel(x.status)}</span></div>)}</div>{!data.items.length?<p className="mt-4 text-xs text-[var(--muted)]">Bu çalışan için görüntülenebilen zorunlu belge gereksinimi bulunmuyor.</p>:null}</>:null}</section>
}
function Stat({label,value}:{label:string;value:string|number}){return <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)]/40 p-3"><p className="text-[9px] uppercase tracking-[.08em] text-[var(--muted-soft)]">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>}
