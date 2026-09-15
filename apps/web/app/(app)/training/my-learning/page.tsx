"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Assignment = {
  id:string; status:string; assignedAt:string; dueAt?:string|null; startedAt?:string|null; completedAt?:string|null;
  courseId:string; courseCode:string; courseTitle:string; courseVersion:number; deliveryType:string;
  requiresTheory:boolean; requiresPractical:boolean; totalLessons:number; requiredLessons:number;
  completedLessons:number; completedRequiredLessons:number; finalPassed?:boolean|null;
};

const STATUS:Record<string,string>={ASSIGNED:"Atandı",IN_PROGRESS:"Devam Ediyor",COMPLETED:"Tamamlandı",CANCELLED:"İptal",EXPIRED:"Süresi Doldu"};
function errorMessage(error:unknown,fallback:string){return error instanceof ApiError?error.message:error instanceof Error?error.message:fallback;}
function formatDate(value?:string|null){if(!value)return "—";return new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium"}).format(new Date(value));}

export default function MyLearningPage(){
  const [items,setItems]=useState<Assignment[]>([]);
  const [loading,setLoading]=useState(true);
  const [linking,setLinking]=useState(false);
  const [unlinked,setUnlinked]=useState(false);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError("");setUnlinked(false);
    try{setItems(await api<Assignment[]>("/training/learner/me/assignments"));}
    catch(requestError){if(requestError instanceof ApiError&&requestError.status===404)setUnlinked(true);else setError(errorMessage(requestError,"Eğitimleriniz yüklenemedi."));}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);

  const active=useMemo(()=>items.filter(item=>["ASSIGNED","IN_PROGRESS"].includes(item.status)),[items]);
  const completed=useMemo(()=>items.filter(item=>item.status==="COMPLETED"),[items]);
  const overdue=useMemo(()=>active.filter(item=>item.dueAt&&new Date(item.dueAt)<new Date()),[active]);

  async function linkByEmail(){setLinking(true);setError("");try{await api("/training/learner/me/link-by-email",{method:"POST"});await load();}catch(requestError){setError(errorMessage(requestError,"Personel profiliniz otomatik eşleştirilemedi."));}finally{setLinking(false);}}

  if(loading)return <div className="flex min-h-[420px] items-center justify-center rounded-[22px] border border-[var(--line)] bg-[var(--surface)]"><Spinner label="Eğitimleriniz Hazırlanıyor..."/></div>;

  if(unlinked)return <div className="mx-auto max-w-[900px] space-y-5"><FinancePanel title="Eğitim Profilinizi Bağlayın" description="Eğitim atamalarınızı kişisel hesabınıza güvenli biçimde bağlamak için personel profilinizle eşleşme gerekir."><div className="space-y-4"><Alert>Hesabınız henüz bir personel eğitim profiline bağlı değil. Sistem yalnızca hesabınızdaki e-posta ile aktif personel e-postası birebir ve tekil eşleşirse otomatik bağlantı kurar.</Alert>{error?<Alert>{error}</Alert>:null}<Button disabled={linking} onClick={()=>void linkByEmail()}>{linking?"Eşleştiriliyor...":"Personel Profilimi E-posta ile Eşleştir"}</Button></div></FinancePanel></div>;

  return <div className="space-y-6 pb-10">
    <header><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-soft)]">Learner Workspace</p><h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">Eğitimlerim</h1><p className="mt-2 max-w-[760px] text-[13px] leading-6 text-[var(--muted)]">Size atanmış eğitimleri takip edin, dersleri tamamlayın ve assessment aşamasına ne zaman hazır olduğunuzu görün.</p></header>
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><FinanceMetric label="Aktif Eğitim" value={active.length} detail="Devam Bekleyen" tone="info"/><FinanceMetric label="Tamamlanan" value={completed.length} detail="Geçmiş Atamalar" tone="success"/><FinanceMetric label="Geciken" value={overdue.length} detail="Son Tarihi Geçen" tone={overdue.length?"warning":"neutral"}/><FinanceMetric label="Toplam" value={items.length} detail="Tüm Eğitimler" tone="neutral"/></section>
    <FinancePanel title="Aktif Eğitimler" description="Önce devam eden ve yaklaşan eğitimlerinizi tamamlayın.">
      <div className="space-y-3">{active.length?active.map(item=>{const denominator=Math.max(item.requiredLessons,1);const progress=Math.min(100,Math.round((item.completedRequiredLessons/denominator)*100));return <Link key={item.id} href={`/training/my-learning/${item.id}`} className="block rounded-[18px] border border-[var(--line)] p-4 transition hover:border-[var(--accent)] hover:bg-[var(--surface-2)]"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">{item.courseCode} · v{item.courseVersion}</p><h2 className="mt-1 text-[15px] font-semibold text-[var(--ink)]">{item.courseTitle}</h2><p className="mt-2 text-[11px] text-[var(--muted)]">{STATUS[item.status]??item.status} · Son tarih {formatDate(item.dueAt)}</p></div><div className="min-w-[150px]"><div className="flex items-center justify-between text-[10px] text-[var(--muted)]"><span>Zorunlu Dersler</span><span>%{progress}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{width:`${progress}%`}}/></div><p className="mt-2 text-right text-[10px] text-[var(--muted-soft)]">{item.completedRequiredLessons}/{item.requiredLessons}</p></div></div></Link>}):<FinanceEmpty title="Aktif Eğitim Yok" description="Şu anda tamamlamanız gereken açık bir eğitim bulunmuyor."/>}</div>
    </FinancePanel>
    <FinancePanel title="Eğitim Geçmişi" description="Tamamlanan, iptal edilen veya süresi dolan atamalar."><div className="grid gap-3 md:grid-cols-2">{items.filter(item=>!["ASSIGNED","IN_PROGRESS"].includes(item.status)).map(item=><Link key={item.id} href={`/training/my-learning/${item.id}`} className="rounded-[16px] border border-[var(--line)] p-4 hover:bg-[var(--surface-2)]"><p className="text-[12px] font-semibold text-[var(--ink)]">{item.courseTitle}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{STATUS[item.status]??item.status} · v{item.courseVersion} · {formatDate(item.completedAt??item.dueAt)}</p></Link>)}</div></FinancePanel>
  </div>;
}
