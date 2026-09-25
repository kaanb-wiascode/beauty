"use client";

import { useState } from "react";
import { Alert, Button, EmptyState, Field, PageHeader, Spinner, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Data=Record<string,unknown>;
function rows(value:unknown){if(Array.isArray(value))return value.filter((x):x is Data=>Boolean(x)&&typeof x==="object");if(value&&typeof value==="object")return[value as Data];return[]}
function keys(value:unknown){const r=rows(value);return r.length?[...new Set(r.slice(0,10).flatMap(x=>Object.keys(x)))].filter(k=>typeof r[0]?.[k]!=="object").slice(0,9):[]}
function show(v:unknown){if(v===null||v===undefined||v==="")return"—";if(typeof v==="boolean")return v?"Evet":"Hayır";if(typeof v==="number")return new Intl.NumberFormat("tr-TR",{maximumFractionDigits:2}).format(v);return String(v)}

export default function PlatformCustomerOpsPage(){
 const[tenantId,setTenantId]=useState(""),[data,setData]=useState<Record<string,unknown>>({}),[loading,setLoading]=useState(false),[error,setError]=useState("");
 async function load(){if(!tenantId.trim())return;setLoading(true);setError("");const id=encodeURIComponent(tenantId.trim());const endpoints=[
 ["Onboarding",`/platform/onboarding/${id}`],["Abonelik",`/platform/customers/${id}/subscription`],["Entitlement",`/platform/customers/${id}/entitlements`],["Müşteri Başarısı",`/platform/customer-success/${id}`],["Tenant Sağlığı",`/platform/customer-success/${id}/health`]
 ] as const;const settled=await Promise.allSettled(endpoints.map(([,path])=>api(path)));const next:Record<string,unknown>={};const failures:string[]=[];settled.forEach((r,i)=>{if(r.status==="fulfilled")next[endpoints[i][0]]=r.value;else failures.push(r.reason instanceof ApiError?r.reason.message:`${endpoints[i][0]} yüklenemedi.`)});setData(next);if(failures.length)setError(failures.join(" "));setLoading(false)}
 return <div className="mx-auto max-w-[1450px] space-y-6 pb-12"><PageHeader title="Platform Müşteri Operasyonu" description="Bir tenantın onboarding, abonelik, entitlement, müşteri başarısı ve sağlık durumunu tek platform-admin ekranında inceleyin."/>
 {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
 <section className="grid gap-4 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 md:grid-cols-[1fr_auto]"><Field label="Tenant ID"><TextInput value={tenantId} onChange={e=>setTenantId(e.target.value)} placeholder="Tenant kimliğini girin"/></Field><div className="flex items-end"><Button onClick={()=>void load()} disabled={loading||!tenantId.trim()}>{loading?"Yükleniyor...":"Müşteri Operasyonunu Aç"}</Button></div></section>
 {loading?<Spinner label="Platform müşteri bilgileri yükleniyor..."/>:Object.keys(data).length?<div className="grid gap-5">{Object.entries(data).map(([title,value])=><Section key={title} title={title} value={value}/>)}</div>:tenantId?<EmptyState title="Veri bulunamadı" description="Tenant için görüntülenebilen platform kaydı bulunamadı."/>:null}
 </div>
}
function Section({title,value}:{title:string;value:unknown}){const r=rows(value),ks=keys(value);return <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]"><div className="border-b border-[var(--line)] px-5 py-4"><h2 className="text-[14px] font-semibold">{title}</h2></div>{r.length?<div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="border-b border-[var(--line)] bg-[var(--surface-2)]/40">{ks.map(k=><th key={k} className="px-4 py-3">{k.replace(/([a-z])([A-Z])/g,"$1 $2")}</th>)}</tr></thead><tbody>{r.map((row,i)=><tr key={String(row.id??row.tenantId??i)} className="border-b border-[var(--line)] last:border-0">{ks.map(k=><td key={k} className="max-w-[340px] truncate px-4 py-4 text-[var(--muted)]">{show(row[k])}</td>)}</tr>)}</tbody></table></div>:<EmptyState title="Kayıt bulunamadı" description="Bu başlık için kayıt bulunmuyor."/>}</section>}
