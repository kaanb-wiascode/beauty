"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Course={id:string;code:string;title:string;category:string;deliveryType:string;isActive:boolean};
type Version={id:string;version:number;status:string};
type CourseRow=Course&{draftVersion?:number;publishedVersion?:number};

export default function TrainingAuthoringIndexPage(){
  const [rows,setRows]=useState<CourseRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const courses=await api<Course[]>("/training/courses");
      const enriched=await Promise.all((courses??[]).filter(course=>course.isActive).map(async course=>{
        const versions=await api<Version[]>(`/training/lms/courses/${course.id}/versions`);
        return {...course,draftVersion:versions.find(item=>item.status==="DRAFT")?.version,publishedVersion:versions.find(item=>item.status==="PUBLISHED")?.version};
      }));
      setRows(enriched);
    }catch(requestError){setError(requestError instanceof ApiError?requestError.message:"Kurs yazarlık listesi yüklenemedi.");}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{void load();},[load]);
  if(loading)return <div className="flex min-h-[420px] items-center justify-center rounded-[22px] border border-[var(--line)] bg-[var(--surface)]"><Spinner label="Kurs Yazarlığı Hazırlanıyor..."/></div>;

  const drafts=rows.filter(item=>item.draftVersion).length;
  const published=rows.filter(item=>item.publishedVersion).length;

  return <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-soft)]">Öğrenme</p><h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">Kurs Yazarlığı</h1><p className="mt-2 max-w-[780px] text-[13px] leading-6 text-[var(--muted)]">Taslak kurs sürümlerini açın, ders ve assessment içeriğini yönetin ve hazır sürümleri kontrollü biçimde yayınlayın.</p></div><Button variant="secondary" onClick={()=>void load()}>Yenile</Button></header>
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
    <section className="grid gap-3 sm:grid-cols-3"><FinanceMetric label="Aktif Kurs" value={rows.length} detail="Yazarlığa Açık" tone="info"/><FinanceMetric label="Taslak Sürüm" value={drafts} detail="Düzenleme Bekleyen" tone={drafts?"warning":"neutral"}/><FinanceMetric label="Yayındaki Kurs" value={published} detail="Aktif Yayın" tone={published?"success":"neutral"}/></section>
    <FinancePanel title="Kurslar" description="Bir kurs seçerek authoring workspace'e geçin.">
      {rows.length?<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map(course=><Link key={course.id} href={`/training/courses/${course.id}`} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5 transition-colors hover:bg-[var(--surface-2)]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">{course.code}</p><h2 className="mt-1 truncate text-[15px] font-semibold text-[var(--ink)]">{course.title}</h2></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${course.draftVersion?"bg-[var(--warning-soft)] text-[var(--warning)]":course.publishedVersion?"bg-[var(--success-soft)] text-[var(--success)]":"bg-[var(--surface-2)] text-[var(--muted)]"}`}>{course.draftVersion?`Taslak v${course.draftVersion}`:course.publishedVersion?`Yayında v${course.publishedVersion}`:"Sürüm Yok"}</span></div><p className="mt-4 text-[10px] text-[var(--muted)]">{course.category} · {course.deliveryType}</p><p className="mt-3 text-[11px] font-semibold text-[var(--accent)]">Yazarlık alanını aç →</p></Link>)}</div>:<FinanceEmpty title="Aktif Kurs Yok" description="Önce Kurslar ekranından bir kurs oluşturun."/>}
    </FinancePanel>
  </div>;
}
