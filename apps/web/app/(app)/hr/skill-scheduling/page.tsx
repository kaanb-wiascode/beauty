"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Field, PageHeader, Select, Spinner, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Service={id:string;name:string};
type Candidate=Record<string,unknown>;
const today=()=>new Date().toISOString().slice(0,10);
export default function SkillSchedulingPage(){
 const[services,setServices]=useState<Service[]>([]),[serviceId,setServiceId]=useState(""),[startAt,setStartAt]=useState(`${today()}T09:00`),[endAt,setEndAt]=useState(`${today()}T18:00`),[rows,setRows]=useState<Candidate[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState("");
 useEffect(()=>{void(async()=>{try{const list=await api<Service[]>("/services");setServices(list);if(list[0])setServiceId(list[0].id)}catch(e){setError(e instanceof ApiError?e.message:"Hizmetler yüklenemedi.")}})()},[]);
 async function search(){if(!serviceId)return;setLoading(true);setError("");try{const result=await api<Candidate[]>(`/hr/workforce/skill-scheduling/services/${serviceId}/candidates?startAt=${encodeURIComponent(new Date(startAt).toISOString())}&endAt=${encodeURIComponent(new Date(endAt).toISOString())}`);setRows(Array.isArray(result)?result:[])}catch(e){setError(e instanceof ApiError?e.message:"Uygun personel adayları yüklenemedi.")}finally{setLoading(false)}}
 const keys=rows.length?[...new Set(rows.slice(0,5).flatMap(x=>Object.keys(x)))].filter(k=>typeof rows[0]?.[k]!=="object").slice(0,8):[];
 return <div className="mx-auto max-w-[1400px] space-y-6 pb-12"><PageHeader title="Yetkinliğe Göre Personel Planlama" description="Hizmet, tarih ve saat aralığına göre uygun personel adaylarını sertifika/yetkinlik kurallarıyla bulun."/>
 {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
 <section className="grid gap-4 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 md:grid-cols-4">
 <Field label="Hizmet"><Select value={serviceId} onChange={e=>setServiceId(e.target.value)}><option value="">Hizmet seçin</option>{services.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
 <Field label="Başlangıç"><TextInput type="datetime-local" value={startAt} onChange={e=>setStartAt(e.target.value)}/></Field>
 <Field label="Bitiş"><TextInput type="datetime-local" value={endAt} onChange={e=>setEndAt(e.target.value)}/></Field>
 <div className="flex items-end"><Button className="w-full" onClick={()=>void search()} disabled={loading||!serviceId}>{loading?"Kontrol Ediliyor...":"Uygun Personeli Bul"}</Button></div>
 </section>
 {loading?<Spinner label="Uygunluk kontrol ediliyor..."/>:rows.length?<section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="border-b border-[var(--line)] bg-[var(--surface-2)]/40">{keys.map(k=><th key={k} className="px-4 py-3">{k.replace(/([a-z])([A-Z])/g,"$1 $2")}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={String(row.id??row.staffId??i)} className="border-b border-[var(--line)] last:border-0">{keys.map(k=><td key={k} className="px-4 py-4 text-[var(--muted)]">{String(row[k]??"—")}</td>)}</tr>)}</tbody></table></div></section>:null}
 </div>
}
