"use client";

import { useEffect, useState } from "react";
import { CardInfo } from "@/components/card-info";
import { Alert, EmptyState, PageHeader, Select, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { getCardHelp } from "@/lib/card-help";
import { userErrorMessage, userFieldLabel, userText } from "@/lib/user-language";

type Staff={id:string;firstName:string;lastName:string};
type RewardData={total?:unknown;compensation?:unknown;benefits?:unknown;earnings?:unknown;advances?:unknown;expenses?:unknown};

function rows(value:unknown){if(Array.isArray(value))return value;if(value&&typeof value==="object")return [value];return[]}
function show(value:unknown){if(value===null||value===undefined||value==="")return"—";if(typeof value==="number")return new Intl.NumberFormat("tr-TR",{maximumFractionDigits:2}).format(value);if(typeof value==="string")return userText(value);return "Ayrıntılar mevcut"}
function keys(value:unknown){const r=rows(value);if(!r.length)return[];return [...new Set(r.flatMap(x=>Object.keys(x as Record<string,unknown>)))].filter(k=>!["id","tenantId","companyId","staffId"].includes(k)).slice(0,8)}

export default function HRRewardsPage(){
 const[staff,setStaff]=useState<Staff[]>([]),[staffId,setStaffId]=useState(""),[data,setData]=useState<RewardData>({}),[loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{void(async()=>{try{const response=await api<Staff[]|{data?:Staff[]}>("/hr/employees");const list=Array.isArray(response)?response:Array.isArray(response.data)?response.data:[];setStaff(list);if(list[0])setStaffId(list[0].id)}catch(e){setError(e instanceof ApiError?userErrorMessage(e.message,"Çalışanlar yüklenemedi."):"Çalışanlar yüklenemedi.")}finally{setLoading(false)}})()},[]);
 useEffect(()=>{if(!staffId)return;void(async()=>{setLoading(true);setError("");try{const[total,compensation,benefits,earnings,advances,expenses]=await Promise.all([
 api(`/hr/rewards/employees/${staffId}/total`),api(`/hr/rewards/employees/${staffId}/compensation`),api(`/hr/rewards/employees/${staffId}/benefits`),api(`/hr/rewards/employees/${staffId}/variable-earnings`),api(`/hr/rewards/employees/${staffId}/advances`),api(`/hr/rewards/employees/${staffId}/expenses`)
 ]);setData({total,compensation,benefits,earnings,advances,expenses})}catch(e){setError(e instanceof ApiError?userErrorMessage(e.message,"Ücret ve yan hak bilgileri yüklenemedi."):"Ücret ve yan hak bilgileri yüklenemedi.")}finally{setLoading(false)}})()},[staffId]);
 return <div className="mx-auto max-w-[1450px] space-y-6 pb-12">
 <PageHeader title="Ücret ve Yan Haklar" description="Maaş, yan hak, prim, avans ve çalışan masraflarını çalışan bazında tek ekrandan izleyin."/>
 {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
 <div className="max-w-md"><Select value={staffId} onChange={e=>setStaffId(e.target.value)}><option value="">Çalışan seçin</option>{staff.map(x=><option key={x.id} value={x.id}>{x.firstName} {x.lastName}</option>)}</Select></div>
 {loading?<Spinner label="Ücret ve yan hak görünümü hazırlanıyor..."/>:<div className="grid gap-5">{Object.entries({total:"Ücret ve Yan Hak Özeti",compensation:"Ücret Geçmişi",benefits:"Yan Haklar",earnings:"Prim ve Ek Kazançlar",advances:"Avanslar",expenses:"Çalışan Masrafları"}).map(([key,title])=><Section key={key} title={title} value={data[key as keyof RewardData]}/>)}</div>}
 </div>
}
function Section({title,value}:{title:string;value:unknown}){const r=rows(value),ks=keys(value);return <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]"><div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4"><h2 className="text-[14px] font-semibold">{title}</h2><CardInfo help={getCardHelp(title)} /></div>{r.length?<div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="border-b border-[var(--line)] bg-[var(--surface-2)]/40">{ks.map(k=><th key={k} className="px-4 py-3">{userFieldLabel(k)}</th>)}</tr></thead><tbody>{r.map((row,i)=><tr key={String((row as Record<string,unknown>).id??i)} className="border-b border-[var(--line)] last:border-0">{ks.map(k=><td key={k} className="px-4 py-4 text-[var(--muted)]">{show((row as Record<string,unknown>)[k])}</td>)}</tr>)}</tbody></table></div>:<EmptyState title="Kayıt bulunamadı" description="Bu çalışan için bu başlıkta henüz kayıt bulunmuyor."/>}</section>}
