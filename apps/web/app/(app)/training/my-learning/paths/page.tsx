"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type PathRow = {
  programAssignmentId:string; status:string; assignedAt:string; programId:string; programVersionId:string;
  code:string; title:string; description?:string|null; version:number; totalItems:number; requiredItems:number;
  completedRequiredItems:number; progressPercent:number;
};

export default function MyLearningPathsPage(){
  const [rows,setRows]=useState<PathRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const load=useCallback(async()=>{setLoading(true);setError("");try{setRows(await api<PathRow[]>("/training/learner-paths/me"));}catch(e){setError(e instanceof ApiError?e.message:"Eğitim yollarınız yüklenemedi.");}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  const completed=useMemo(()=>rows.filter((row)=>row.progressPercent>=100).length,[rows]);
  const active=rows.length-completed;

  return <div className="mx-auto max-w-[1300px] space-y-6 pb-10">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><Link href="/training/my-learning" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">← Eğitimlerim</Link><p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-soft)]">Learner Development</p><h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">Akademilerim</h1><p className="mt-2 max-w-[760px] text-[13px] leading-6 text-[var(--muted)]">Size atanmış rol akademilerini ve gelişim yollarını takip edin. Ön koşullu adımlar önceki eğitimler tamamlandıkça açılır.</p></div><Button variant="secondary" onClick={()=>void load()} disabled={loading}>Yenile</Button></header>
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
    <section className="grid gap-3 sm:grid-cols-3"><FinanceMetric label="Atanmış Path" value={rows.length} detail="Tüm gelişim yolları" tone="info"/><FinanceMetric label="Aktif" value={active} detail="Devam eden curriculum" tone="warning"/><FinanceMetric label="Tamamlanan" value={completed} detail="Zorunlu adımlar %100" tone="success"/></section>
    <FinancePanel title="Eğitim yollarım" description="Eğitim yolundaki her kurs, atandığı sürümle izlenir; ön koşul tamamlanmadan sonraki adım başlatılamaz.">
      {loading?<div className="flex min-h-[280px] items-center justify-center"><Spinner label="Akademileriniz yükleniyor..."/></div>:!rows.length?<FinanceEmpty title="Atanmış eğitim yolu yok" description="Size henüz bir rol akademisi veya gelişim yolu atanmadı."/>:<div className="grid gap-3 md:grid-cols-2">{rows.map((row)=><Link key={row.programAssignmentId} href={`/training/my-learning/paths/${row.programAssignmentId}`} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface-2)] p-4 transition hover:border-[var(--accent)]/40"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">{row.code} · v{row.version}</p><h2 className="mt-1 text-[15px] font-semibold text-[var(--ink)]">{row.title}</h2></div><span className="text-[12px] font-semibold text-[var(--accent)]">%{row.progressPercent}</span></div><p className="mt-2 line-clamp-2 text-[11px] leading-5 text-[var(--muted)]">{row.description||"Rol bazlı gelişim yolu"}</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{width:`${Math.min(100,row.progressPercent)}%`}}/></div><p className="mt-2 text-[10px] text-[var(--muted-soft)]">{row.completedRequiredItems}/{row.requiredItems} zorunlu adım tamamlandı · Toplam {row.totalItems} adım</p></Link>)}</div>}
    </FinancePanel>
  </div>;
}
