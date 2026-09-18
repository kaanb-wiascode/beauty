"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type PlanSummary = {
  id:string; title:string; status:string; startDate:string; targetDate?:string|null; completedAt?:string|null;
  itemCount:number; completedItemCount:number; overdueItemCount:number;
};
type PlanItem = {
  id:string; sequence:number; itemType:string; status:string; targetLevel?:number|null; note?:string|null; dueDate?:string|null; completedAt?:string|null;
  activityTitle?:string|null; activityDescription?:string|null;
  competencyCode?:string|null; competencyName?:string|null;
  courseCode?:string|null; courseTitle?:string|null;
  programCode?:string|null; programTitle?:string|null;
  facilitatorFirstName?:string|null; facilitatorLastName?:string|null;
};
type PlanDetail = PlanSummary & {
  learner:{staffId:string;firstName:string;lastName:string};
  progressPercent:number;
  items:PlanItem[];
};

const TYPE_LABELS:Record<string,string>={
  COMPETENCY:"Yetkinlik",COURSE:"Kurs",PROGRAM:"Learning Path",ACTION:"Aksiyon",COACHING:"Koçluk",MENTORING:"Mentorluk",PROJECT:"Proje",STRETCH_ASSIGNMENT:"Stretch Assignment",
};
const STATUS_LABELS:Record<string,string>={DRAFT:"Taslak",ACTIVE:"Aktif",COMPLETED:"Tamamlandı",CANCELLED:"İptal",PLANNED:"Planlandı",IN_PROGRESS:"Devam Ediyor"};

function dateOnly(value?:string|null){if(!value)return "—";const d=new Date(value);if(Number.isNaN(d.getTime()))return "—";return new Intl.DateTimeFormat("tr-TR",{day:"2-digit",month:"short",year:"numeric"}).format(d);}
function itemTitle(item:PlanItem){if(item.itemType==="COMPETENCY")return `${item.competencyCode??""} ${item.competencyName??"Yetkinlik"}`.trim();if(item.itemType==="COURSE")return `${item.courseCode??""} ${item.courseTitle??"Kurs"}`.trim();if(item.itemType==="PROGRAM")return `${item.programCode??""} ${item.programTitle??"Learning Path"}`.trim();return item.activityTitle||TYPE_LABELS[item.itemType]||item.itemType;}

export default function MyDevelopmentPage(){
  const [plans,setPlans]=useState<PlanSummary[]>([]);
  const [selectedId,setSelectedId]=useState<string>("");
  const [detail,setDetail]=useState<PlanDetail|null>(null);
  const [loading,setLoading]=useState(true);
  const [detailLoading,setDetailLoading]=useState(false);
  const [error,setError]=useState("");

  const loadPlans=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const rows=await api<PlanSummary[]>("/training/learner/me/development-plans");
      setPlans(rows??[]);
      setSelectedId((current)=>current&&rows?.some((row)=>row.id===current)?current:(rows?.[0]?.id??""));
    }catch(requestError){setError(requestError instanceof ApiError?requestError.message:"Gelişim planların yüklenemedi.");}
    finally{setLoading(false);}
  },[]);

  const loadDetail=useCallback(async(id:string)=>{
    if(!id){setDetail(null);return;}
    setDetailLoading(true);setError("");
    try{setDetail(await api<PlanDetail>(`/training/learner/me/development-plans/${id}`));}
    catch(requestError){setDetail(null);setError(requestError instanceof ApiError?requestError.message:"Gelişim planı detayı yüklenemedi.");}
    finally{setDetailLoading(false);}
  },[]);

  useEffect(()=>{void loadPlans();},[loadPlans]);
  useEffect(()=>{void loadDetail(selectedId);},[selectedId,loadDetail]);

  const metrics=useMemo(()=>({
    active:plans.filter((plan)=>plan.status==="ACTIVE"||plan.status==="DRAFT").length,
    completed:plans.filter((plan)=>plan.status==="COMPLETED").length,
    open:plans.reduce((sum,plan)=>sum+Math.max(plan.itemCount-plan.completedItemCount,0),0),
    overdue:plans.reduce((sum,plan)=>sum+Number(plan.overdueItemCount||0),0),
  }),[plans]);

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-10">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-soft)]">Personal Development</p><h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">Gelişimim</h1><p className="mt-2 max-w-[900px] text-[13px] leading-6 text-[var(--muted)]">Kurs, akademi, yetkinlik, koçluk, mentorluk ve proje hedeflerini tek kişisel gelişim görünümünde takip et.</p></div><Button variant="secondary" disabled={loading||detailLoading} onClick={()=>void loadPlans()}>Yenile</Button></header>
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><FinanceMetric label="Aktif Plan" value={metrics.active} detail="Devam eden gelişim döngüsü" tone="info"/><FinanceMetric label="Açık Hedef" value={metrics.open} detail="Tamamlanmayı bekleyen madde" tone={metrics.open?"warning":"success"}/><FinanceMetric label="Geciken" value={metrics.overdue} detail="Hedef tarihi geçen madde" tone={metrics.overdue?"danger":"success"}/><FinanceMetric label="Tamamlanan Plan" value={metrics.completed} detail="Gelişim geçmişi" tone="success"/></section>
    {loading?<div className="flex min-h-[320px] items-center justify-center"><Spinner label="Gelişim planların yükleniyor..."/></div>:!plans.length?<FinanceEmpty title="Henüz gelişim planın yok" description="Yöneticin tarafından tanımlanan bireysel gelişim planları burada görünecek."/>:<div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <FinancePanel title="Planlarım" description="Aktif ve geçmiş gelişim planların."><div className="space-y-2">{plans.map((plan)=>{const progress=plan.itemCount?Math.round((plan.completedItemCount/plan.itemCount)*100):0;const active=selectedId===plan.id;return <button key={plan.id} type="button" onClick={()=>setSelectedId(plan.id)} className={`w-full rounded-[16px] border p-3 text-left transition ${active?"border-[var(--accent)] bg-[var(--accent-soft)]":"border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--accent)]/40"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[13px] font-semibold text-[var(--ink)]">{plan.title}</p><p className="mt-1 text-[10px] text-[var(--muted-soft)]">{dateOnly(plan.startDate)} → {dateOnly(plan.targetDate)}</p></div><span className="rounded-full bg-[var(--surface)] px-2 py-1 text-[9px] font-semibold text-[var(--muted)]">{STATUS_LABELS[plan.status]??plan.status}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{width:`${progress}%`}}/></div><div className="mt-1.5 flex justify-between text-[9px] text-[var(--muted-soft)]"><span>{plan.completedItemCount}/{plan.itemCount} hedef</span><span>%{progress}</span></div></button>})}</div></FinancePanel>
      <div>{detailLoading?<div className="flex min-h-[380px] items-center justify-center rounded-[22px] border border-[var(--line)] bg-[var(--surface)]"><Spinner label="Plan detayı yükleniyor..."/></div>:detail?<FinancePanel title={detail.title} description={`${detail.learner.firstName} ${detail.learner.lastName} · ${STATUS_LABELS[detail.status]??detail.status}`}><div className="mb-5 grid gap-3 sm:grid-cols-3"><FinanceMetric label="İlerleme" value={`%${detail.progressPercent}`} detail={`${detail.completedItemCount}/${detail.itemCount} hedef`} tone="info"/><FinanceMetric label="Başlangıç" value={dateOnly(detail.startDate)} detail="Plan başlangıcı" tone="neutral"/><FinanceMetric label="Hedef" value={dateOnly(detail.targetDate)} detail="Plan hedef tarihi" tone="neutral"/></div>{!detail.items.length?<FinanceEmpty title="Plan maddesi bulunmuyor" description="Bu gelişim planına henüz hedef eklenmemiş."/>:<div className="space-y-3">{detail.items.map((item)=><div key={item.id} className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">{TYPE_LABELS[item.itemType]??item.itemType}</p><h2 className="mt-1 text-[15px] font-semibold text-[var(--ink)]">{itemTitle(item)}</h2>{item.activityDescription?<p className="mt-2 text-[12px] leading-5 text-[var(--muted)]">{item.activityDescription}</p>:null}{item.note?<p className="mt-2 text-[11px] leading-5 text-[var(--muted-soft)]">Not: {item.note}</p>:null}</div><span className="shrink-0 rounded-full bg-[var(--surface)] px-2.5 py-1 text-[9px] font-semibold text-[var(--muted)]">{STATUS_LABELS[item.status]??item.status}</span></div><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-[var(--muted-soft)]">{item.targetLevel!=null?<span>Hedef seviye: {item.targetLevel}</span>:null}<span>Hedef tarih: {dateOnly(item.dueDate)}</span>{item.facilitatorFirstName?<span>Mentor/Coach: {item.facilitatorFirstName} {item.facilitatorLastName}</span>:null}{item.completedAt?<span>Tamamlandı: {dateOnly(item.completedAt)}</span>:null}</div></div>)}</div>}</FinancePanel>:null}</div>
    </div>}
  </div>;
}
