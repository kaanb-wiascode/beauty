"use client";

import { useState } from "react";
import { Alert, Button, EmptyState, Field, PageHeader, Select, Spinner, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Evidence=Record<string,unknown>;
const subjectTypes=["INSPECTION","INSPECTION_RESULT","FINDING","QUALITY_CASE","CAPA"] as const;

export default function QualityEvidencePage(){
 const[type,setType]=useState<(typeof subjectTypes)[number]>("INSPECTION"),[subjectId,setSubjectId]=useState(""),[rows,setRows]=useState<Evidence[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState("");
 async function load(){if(!subjectId.trim())return;setLoading(true);setError("");try{const result=await api<Evidence[]>(`/quality/evidence?subjectType=${type}&subjectId=${encodeURIComponent(subjectId.trim())}&limit=200`);setRows(Array.isArray(result)?result:[])}catch(e){setError(e instanceof ApiError?e.message:"Kanıt kayıtları yüklenemedi.")}finally{setLoading(false)}}
 const keys=rows.length?[...new Set(rows.slice(0,10).flatMap(r=>Object.keys(r)))].filter(k=>typeof rows[0]?.[k]!=="object").slice(0,9):[];
 return <div className="mx-auto max-w-[1400px] space-y-6 pb-12">
 <PageHeader title="Kalite Kanıtları" description="Denetim, bulgu, kalite vakası ve CAPA süreçlerine bağlı fotoğraf, belge ve diğer kanıt kayıtlarını görüntüleyin."/>
 {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
 <section className="grid gap-4 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 md:grid-cols-[260px_1fr_auto]">
 <Field label="Konu Türü"><Select value={type} onChange={e=>setType(e.target.value as (typeof subjectTypes)[number])}>{subjectTypes.map(v=><option key={v} value={v}>{v==="INSPECTION"?"Denetim":v==="INSPECTION_RESULT"?"Denetim Sonucu":v==="FINDING"?"Bulgu":v==="QUALITY_CASE"?"Kalite Vakası":"CAPA"}</option>)}</Select></Field>
 <Field label="Kayıt ID"><TextInput value={subjectId} onChange={e=>setSubjectId(e.target.value)} placeholder="İlgili kayıt kimliğini girin"/></Field>
 <div className="flex items-end"><Button onClick={()=>void load()} disabled={loading||!subjectId.trim()}>{loading?"Yükleniyor...":"Kanıtları Getir"}</Button></div>
 </section>
 {loading?<Spinner label="Kanıtlar yükleniyor..."/>:rows.length?<section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead><tr className="border-b border-[var(--line)] bg-[var(--surface-2)]/40">{keys.map(k=><th key={k} className="px-4 py-3">{k.replace(/([a-z])([A-Z])/g,"$1 $2")}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={String(row.id??i)} className="border-b border-[var(--line)] last:border-0">{keys.map(k=><td key={k} className="max-w-[320px] truncate px-4 py-4 text-[var(--muted)]">{String(row[k]??"—")}</td>)}</tr>)}</tbody></table></div></section>:subjectId?<EmptyState title="Kanıt bulunamadı" description="Bu kayıt için henüz bir kanıt kaydı bulunmuyor."/>:null}
 </div>
}
