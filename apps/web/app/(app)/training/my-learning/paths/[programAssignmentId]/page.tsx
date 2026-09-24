"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type PathItem={id:string;sequence:number;courseId:string;courseCode:string;courseTitle:string;isRequired:boolean;dueOffsetDays?:number|null;assignmentId?:string|null;assignmentStatus?:string|null;dueAt?:string|null;completedAt?:string|null;prerequisiteItemIds:string[];isUnlocked:boolean;blockedByItemIds:string[]};
type Detail={id:string;status:string;staffId:string;programId:string;programVersionId:string;code:string;title:string;staffFirstName:string;staffLastName:string;totalItems:number;requiredItems:number;completedRequiredItems:number;progressPercent:number;items:PathItem[]};

const STATUS:Record<string,string>={ASSIGNED:"Başlamadı",IN_PROGRESS:"Devam Ediyor",COMPLETED:"Tamamlandı",CANCELLED:"İptal",EXPIRED:"Süresi Doldu"};
function formatDate(value?:string|null){if(!value)return "—";return new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium"}).format(new Date(value));}

export default function MyLearningPathDetailPage(){
  const params=useParams<{programAssignmentId:string}>();
  const id=String(params.programAssignmentId);
  const [data,setData]=useState<Detail|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const load=useCallback(async()=>{setLoading(true);setError("");try{setData(await api<Detail>(`/training/learner-paths/me/${id}`));}catch(e){setError(e instanceof ApiError?e.message:"Eğitim yolu ilerlemesi yüklenemedi.");}finally{setLoading(false);}},[id]);
  useEffect(()=>{void load();},[load]);
  if(loading&&!data)return <div className="flex min-h-[420px] items-center justify-center"><Spinner label="Eğitim yolu ilerlemesi hazırlanıyor..."/></div>;

  return <div className="mx-auto max-w-[1200px] space-y-6 pb-10">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><Link href="/training/my-learning/paths" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">← Akademilerim</Link><p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-soft)]">{data?.code??"Eğitim yolu"}</p><h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">{data?.title??"Eğitim yolu"}</h1><p className="mt-2 text-[13px] text-[var(--muted)]">Sıralı curriculum ilerlemeniz ve açılan/kapalı eğitim adımları.</p></div><Button variant="secondary" onClick={()=>void load()} disabled={loading}>Yenile</Button></header>
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
    {data?<><section className="grid gap-3 sm:grid-cols-3"><FinanceMetric label="İlerleme" value={`%${data.progressPercent}`} detail={`${data.completedRequiredItems}/${data.requiredItems} zorunlu adım`} tone={data.progressPercent>=100?"success":"info"}/><FinanceMetric label="Toplam Adım" value={data.totalItems} detail="Eğitim programı kapsamı" tone="info"/><FinanceMetric label="Durum" value={data.progressPercent>=100?"Tamamlandı":"Aktif"} detail="Prerequisite kontrollü ilerleme" tone={data.progressPercent>=100?"success":"warning"}/></section><FinancePanel title="Curriculum" description="Kilitli adımların prerequisite kursları tamamlandığında sistem otomatik olarak erişilebilir hale gelir.">{!data.items.length?<FinanceEmpty title="Curriculum boş" description="Bu Learning Path içinde kurs bulunmuyor."/>:<div className="space-y-3">{data.items.map((item,index)=>{const blockers=item.blockedByItemIds.map((blocker)=>data.items.find((candidate)=>candidate.id===blocker)).filter(Boolean) as PathItem[];const completed=item.assignmentStatus==="COMPLETED";return <div key={item.id} className={`rounded-[18px] border p-4 ${item.isUnlocked?"border-[var(--line)] bg-[var(--surface-2)]":"border-[var(--warning)]/25 bg-[var(--warning-soft)]"}`}><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${completed?"bg-[var(--success-soft)] text-[var(--success)]":item.isUnlocked?"bg-[var(--accent-soft)] text-[var(--accent)]":"bg-[var(--surface)] text-[var(--muted-soft)]"}`}>{completed?"✓":index+1}</div><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">{item.courseCode}{item.isRequired?" · Zorunlu":" · Opsiyonel"}</p><h2 className="mt-1 text-[14px] font-semibold text-[var(--ink)]">{item.courseTitle}</h2><p className="mt-1 text-[10px] text-[var(--muted)]">{item.isUnlocked?(STATUS[item.assignmentStatus??"ASSIGNED"]??item.assignmentStatus??"Atanmadı"):`Kilitli · ${blockers.map((blocker)=>blocker.courseCode).join(", ")} tamamlanmalı`}{item.dueAt?` · Son tarih ${formatDate(item.dueAt)}`:""}</p></div></div>{item.assignmentId&&item.isUnlocked&&!completed?<Link href={`/training/my-learning/${item.assignmentId}`} className="inline-flex items-center justify-center rounded-[12px] bg-[var(--accent)] px-3 py-2 text-[11px] font-semibold text-white">{item.assignmentStatus==="IN_PROGRESS"?"Devam Et":"Başla"}</Link>:completed&&item.assignmentId?<Link href={`/training/my-learning/${item.assignmentId}`} className="text-[11px] font-semibold text-[var(--success)] hover:underline">Tamamlandı · Görüntüle</Link>:null}</div></div>})}</div>}</FinancePanel></>:null}
  </div>;
}
