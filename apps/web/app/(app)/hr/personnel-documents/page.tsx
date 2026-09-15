"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { userLabel } from "@/lib/user-language";

type Row={id:string;staffId:string;documentType:string;title:string;expiresAt:string;restricted:boolean;firstName:string;lastName:string};
const date=(v:string)=>v?new Date(v).toLocaleDateString("tr-TR"):"—";
const remaining=(v:string)=>Math.ceil((new Date(v).getTime()-Date.now())/86400000);

export default function PersonnelDocumentsPage(){
  const[rows,setRows]=useState<Row[]>([]),[days,setDays]=useState(60),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const sensitive=hasPermission("hr_sensitive","read");
  async function load(){setLoading(true);setError("");try{const path=sensitive?`/hr/personnel-documents/expiring/sensitive?days=${days}`:`/hr/personnel-documents/expiring?days=${days}`;setRows(await api<Row[]>(path))}catch(e){setError(e instanceof ApiError?e.message:"Belge takibi yüklenemedi.")}finally{setLoading(false)}}
  useEffect(()=>{void load()},[days,sensitive]);
  const urgent=useMemo(()=>rows.filter(x=>remaining(x.expiresAt)<=30).length,[rows]);
  return <div className="mx-auto max-w-[1280px] space-y-5 pb-10">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[.15em] text-[var(--muted-soft)]">İnsan Kaynakları · Uyum</p><h1 className="mt-1 text-[30px] font-semibold tracking-[-.035em] text-[var(--ink)]">Personel Belge Takibi</h1><p className="mt-1 text-xs text-[var(--muted)]">Süresi yaklaşan personel belgelerini, doğrulama durumlarını ve yenileme ihtiyacını merkezi olarak izleyin.</p></div><select className="control h-10 min-w-[160px]" value={days} onChange={e=>setDays(Number(e.target.value))}><option value={30}>30 gün</option><option value={60}>60 gün</option><option value={90}>90 gün</option><option value={180}>180 gün</option><option value={365}>365 gün</option></select></header>
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
    <section className="grid gap-3 md:grid-cols-3"><Metric label="Yaklaşan Belge" value={rows.length}/><Metric label="30 Gün İçinde" value={urgent}/><Metric label="Görünüm" value={sensitive?"Yetkili İK":"Standart"}/></section>
    <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] overflow-hidden">{loading?<div className="flex h-56 items-center justify-center"><Spinner/></div>:<div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-xs"><thead><tr className="border-b border-[var(--line)] bg-[var(--surface-2)]/40 text-[10px] uppercase tracking-[.08em] text-[var(--muted-soft)]"><th className="p-4">Personel</th><th className="p-4">Belge</th><th className="p-4">Tür</th><th className="p-4">Son Geçerlilik</th><th className="p-4">Kalan</th><th className="p-4">Erişim</th><th className="p-4">İşlem</th></tr></thead><tbody>{rows.map(x=>{const left=remaining(x.expiresAt);return <tr key={x.id} className="border-b border-[var(--line)] last:border-0"><td className="p-4 font-medium text-[var(--ink)]">{x.firstName} {x.lastName}</td><td className="p-4 text-[var(--muted)]">{x.title}</td><td className="p-4 text-[var(--muted)]">{userLabel(x.documentType)}</td><td className="p-4 text-[var(--muted)]">{date(x.expiresAt)}</td><td className="p-4"><span className={`rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px] font-semibold ${left<=30?"text-[var(--danger)]":"text-[var(--muted)]"}`}>{left} gün</span></td><td className="p-4 text-[var(--muted)]">{x.restricted?"Kısıtlı":"Standart"}</td><td className="p-4"><Link className="font-semibold text-[var(--accent)]" href={`/hr/employees/${x.staffId}`}>360° profili →</Link></td></tr>})}</tbody></table>{!rows.length?<div className="p-10 text-center text-xs text-[var(--muted)]">Seçilen süre içinde yenilenmesi gereken belge bulunmuyor.</div>:null}</div>}</section>
    {!sensitive?<p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 text-[10px] text-[var(--muted)]">Kısıtlı personel belgeleri bu görünümde gösterilmez. Hassas belge takibi için hr_sensitive.read yetkisi gerekir.</p>:null}
  </div>;
}
function Metric({label,value}:{label:string;value:string|number}){return <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4"><p className="text-[10px] uppercase tracking-[.08em] text-[var(--muted-soft)]">{label}</p><p className="mt-2 text-xl font-semibold text-[var(--ink)]">{value}</p></div>}
