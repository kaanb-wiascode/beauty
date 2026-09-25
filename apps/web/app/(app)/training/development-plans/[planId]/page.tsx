"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Select, Spinner, TextArea, TextInput } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type ItemType = "COMPETENCY"|"COURSE"|"PROGRAM"|"ACTION"|"COACHING"|"MENTORING"|"PROJECT"|"STRETCH_ASSIGNMENT";
type ItemStatus = "PLANNED"|"IN_PROGRESS"|"COMPLETED"|"CANCELLED";
type PlanStatus = "DRAFT"|"ACTIVE"|"COMPLETED"|"CANCELLED";

type PlanItem = {
  id:string; sequence:number; itemType:ItemType; status:ItemStatus;
  competencyId?:string|null; competencyCode?:string|null; competencyName?:string|null;
  courseId?:string|null; courseCode?:string|null; courseTitle?:string|null;
  programId?:string|null; programCode?:string|null; programTitle?:string|null;
  targetLevel?:number|null; note?:string|null; dueDate?:string|null;
  activityTitle?:string|null; activityDescription?:string|null;
  facilitatorStaffId?:string|null; facilitatorFirstName?:string|null; facilitatorLastName?:string|null;
  completedAt?:string|null;
};

type Plan = {
  id:string; branchId:string; staffId:string; title:string; status:PlanStatus;
  startDate:string; targetDate?:string|null; completedAt?:string|null;
  staffFirstName:string; staffLastName:string; itemCount:number; completedItemCount:number; progressPercent:number;
  items:PlanItem[];
};
type Course = { id:string; code:string; title:string; isActive:boolean };
type LearningPath = { id:string; code:string; title:string; isActive:boolean; publishedVersionId?:string|null };
type Competency = { id:string; code:string; name:string; isActive:boolean };
type StaffMember = { id:string; firstName:string; lastName:string; branchId:string; status:string };
type StaffResponse = { data:StaffMember[] };

const TYPE_LABELS:Record<ItemType,string>={COMPETENCY:"Yetkinlik",COURSE:"Kurs",PROGRAM:"Eğitim yolu",ACTION:"Aksiyon",COACHING:"Koçluk",MENTORING:"Mentorluk",PROJECT:"Proje",STRETCH_ASSIGNMENT:"Gelişim görevi"};
const STATUS_LABELS:Record<ItemStatus,string>={PLANNED:"Planlandı",IN_PROGRESS:"Devam Ediyor",COMPLETED:"Tamamlandı",CANCELLED:"İptal"};
const ACTIVITY_TYPES = new Set<ItemType>(["ACTION","COACHING","MENTORING","PROJECT","STRETCH_ASSIGNMENT"]);

function dateOnly(value?:string|null){if(!value)return "—";const d=new Date(value);if(Number.isNaN(d.getTime()))return "—";return new Intl.DateTimeFormat("tr-TR",{day:"2-digit",month:"short",year:"numeric"}).format(d);}
function itemTone(status:ItemStatus){if(status==="COMPLETED")return "bg-[var(--success-soft)] text-[var(--success)]";if(status==="IN_PROGRESS")return "bg-[var(--accent-soft)] text-[var(--accent)]";if(status==="CANCELLED")return "bg-[var(--surface)] text-[var(--muted)]";return "bg-[var(--warning-soft)] text-[var(--warning)]";}
function itemTitle(item:PlanItem){if(item.itemType==="COMPETENCY")return `${item.competencyCode??""} ${item.competencyName??"Yetkinlik"}`.trim();if(item.itemType==="COURSE")return `${item.courseCode??""} ${item.courseTitle??"Kurs"}`.trim();if(item.itemType==="PROGRAM")return `${item.programCode??""} ${item.programTitle??"Eğitim yolu"}`.trim();return item.activityTitle||TYPE_LABELS[item.itemType];}

export default function DevelopmentPlanDetailPage(){
  const params=useParams<{planId:string}>();
  const planId=params.planId;
  const canManage=hasPermission("training","manage");
  const [plan,setPlan]=useState<Plan|null>(null);
  const [courses,setCourses]=useState<Course[]>([]);
  const [paths,setPaths]=useState<LearningPath[]>([]);
  const [competencies,setCompetencies]=useState<Competency[]>([]);
  const [staff,setStaff]=useState<StaffMember[]>([]);
  const [loading,setLoading]=useState(true);
  const [action,setAction]=useState<string|null>(null);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [form,setForm]=useState({itemType:"COURSE" as ItemType,resourceId:"",targetLevel:"",activityTitle:"",activityDescription:"",facilitatorStaffId:"",dueDate:"",note:""});

  const load=useCallback(async()=>{
    if(!planId)return;
    setLoading(true);setError("");
    try{
      const [planRow,courseRows,pathRows,competencyRows,staffRows]=await Promise.all([
        api<Plan>(`/training/planning/development-plans/${planId}`),
        api<Course[]>("/training/courses"),
        api<LearningPath[]>("/training/learning-paths"),
        api<Competency[]>("/training/competencies/definitions"),
        api<StaffResponse>(withQuery("/staff",{page:1,limit:200,status:"ACTIVE"})),
      ]);
      setPlan(planRow);setCourses(courseRows??[]);setPaths(pathRows??[]);setCompetencies(competencyRows??[]);setStaff(staffRows.data??[]);
    }catch(requestError){setError(requestError instanceof ApiError?requestError.message:"Gelişim planı yüklenemedi.");}
    finally{setLoading(false);}
  },[planId]);

  useEffect(()=>{void load();},[load]);

  const facilitators=useMemo(()=>plan?staff.filter((member)=>member.branchId===plan.branchId&&member.id!==plan.staffId):[],[plan,staff]);
  const openItems=useMemo(()=>plan?.items.filter((item)=>item.status==="PLANNED"||item.status==="IN_PROGRESS").length??0,[plan]);
  const overdue=useMemo(()=>{const today=new Date();today.setHours(0,0,0,0);return plan?.items.filter((item)=>item.dueDate&&(item.status==="PLANNED"||item.status==="IN_PROGRESS")&&new Date(item.dueDate).getTime()<today.getTime()).length??0;},[plan]);

  const perform=useCallback(async(key:string,job:()=>Promise<unknown>,message:string)=>{setAction(key);setError("");setSuccess("");try{await job();setSuccess(message);await load();}catch(requestError){setError(requestError instanceof ApiError?requestError.message:"İşlem tamamlanamadı.");}finally{setAction(null);}},[load]);

  async function addItem(){
    if(!plan)return;
    const type=form.itemType;
    const payload:Record<string,unknown>={sequence:plan.items.length+1,itemType:type,dueDate:form.dueDate||null,note:form.note.trim()||null};
    if(type==="COMPETENCY"){if(!form.resourceId||!form.targetLevel)return setError("Yetkinlik ve hedef seviye seçin.");payload.competencyId=form.resourceId;payload.targetLevel=Number(form.targetLevel);}
    else if(type==="COURSE"){if(!form.resourceId)return setError("Kurs seçin.");payload.courseId=form.resourceId;}
    else if(type==="PROGRAM"){if(!form.resourceId)return setError("Eğitim yolu seçin.");payload.programId=form.resourceId;}
    else {if(type!=="ACTION"&&!form.activityTitle.trim())return setError("Gelişim aktivitesi başlığı gerekli.");payload.activityTitle=form.activityTitle.trim()||null;payload.activityDescription=form.activityDescription.trim()||null;payload.facilitatorStaffId=form.facilitatorStaffId||null;}
    await perform("add-item",()=>api(`/training/planning/development-plans/${plan.id}/items`,{method:"POST",body:payload}),"Gelişim maddesi eklendi.");
    setForm({itemType:"COURSE",resourceId:"",targetLevel:"",activityTitle:"",activityDescription:"",facilitatorStaffId:"",dueDate:"",note:""});
  }

  if(loading)return <div className="flex min-h-[420px] items-center justify-center rounded-[22px] border border-[var(--line)] bg-[var(--surface)]"><Spinner label="Gelişim planı hazırlanıyor..."/></div>;
  if(!plan)return <Alert>{error||"Gelişim planı bulunamadı."}</Alert>;
  const closed=plan.status==="COMPLETED"||plan.status==="CANCELLED";

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-10">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><Link href="/training/development-plans" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">← Gelişim Planları</Link><p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-soft)]">Bireysel gelişim planı</p><h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">{plan.title}</h1><p className="mt-2 text-[13px] text-[var(--muted)]">{plan.staffFirstName} {plan.staffLastName} · {dateOnly(plan.startDate)} → {dateOnly(plan.targetDate)}</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={()=>void load()} disabled={action!==null}>Yenile</Button>{canManage&&!closed?<><Button variant="secondary" disabled={action!==null||openItems>0} onClick={()=>void perform("complete-plan",()=>api(`/training/planning/development-plans/${plan.id}/COMPLETED`,{method:"POST"}),"Gelişim planı tamamlandı.")}>Planı Tamamla</Button><Button variant="secondary" disabled={action!==null} onClick={()=>void perform("cancel-plan",()=>api(`/training/planning/development-plans/${plan.id}/CANCELLED`,{method:"POST"}),"Gelişim planı iptal edildi.")}>Planı İptal Et</Button></>:null}</div></header>
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}{success?<Alert tone="success" onClose={()=>setSuccess("")}>{success}</Alert>:null}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><FinanceMetric label="İlerleme" value={`%${plan.progressPercent}`} detail={`${plan.completedItemCount}/${plan.itemCount} tamamlandı`} tone="info"/><FinanceMetric label="Açık Madde" value={openItems} detail="Planlanan + devam eden" tone={openItems?"warning":"success"}/><FinanceMetric label="Geciken" value={overdue} detail="Hedef tarihi geçen madde" tone={overdue?"danger":"success"}/><FinanceMetric label="Plan Durumu" value={plan.status} detail={closed?`Kapanış: ${dateOnly(plan.completedAt)}`:"Aktif gelişim döngüsü"} tone={plan.status==="COMPLETED"?"success":"neutral"}/></section>

    {canManage&&!closed?<FinancePanel title="Gelişim Maddesi Ekle" description="Kurs, eğitim yolu, yetkinlik veya saha gelişim etkinliğini aynı gelişim planında tanımlayın."><div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
      <label><span className="mb-1 block text-[10px] font-semibold uppercase text-[var(--muted-soft)]">Tür</span><Select value={form.itemType} onChange={(e)=>setForm((v)=>({...v,itemType:e.target.value as ItemType,resourceId:"",targetLevel:"",activityTitle:"",activityDescription:"",facilitatorStaffId:""}))}>{Object.entries(TYPE_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></label>
      {form.itemType==="COURSE"?<label><span className="mb-1 block text-[10px] font-semibold uppercase text-[var(--muted-soft)]">Kurs</span><Select value={form.resourceId} onChange={(e)=>setForm((v)=>({...v,resourceId:e.target.value}))}><option value="">Kurs seçin</option>{courses.filter((c)=>c.isActive).map((c)=><option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</Select></label>:null}
      {form.itemType==="PROGRAM"?<label><span className="mb-1 block text-[10px] font-semibold uppercase text-[var(--muted-soft)]">Eğitim yolu</span><Select value={form.resourceId} onChange={(e)=>setForm((v)=>({...v,resourceId:e.target.value}))}><option value="">Eğitim yolu seçin</option>{paths.filter((p)=>p.isActive&&p.publishedVersionId).map((p)=><option key={p.id} value={p.id}>{p.code} · {p.title}</option>)}</Select></label>:null}
      {form.itemType==="COMPETENCY"?<><label><span className="mb-1 block text-[10px] font-semibold uppercase text-[var(--muted-soft)]">Yetkinlik</span><Select value={form.resourceId} onChange={(e)=>setForm((v)=>({...v,resourceId:e.target.value}))}><option value="">Yetkinlik seçin</option>{competencies.filter((c)=>c.isActive).map((c)=><option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</Select></label><label><span className="mb-1 block text-[10px] font-semibold uppercase text-[var(--muted-soft)]">Hedef Seviye</span><TextInput type="number" min="0" max="100" value={form.targetLevel} onChange={(e)=>setForm((v)=>({...v,targetLevel:e.target.value}))} placeholder="80"/></label></>:null}
      {ACTIVITY_TYPES.has(form.itemType)?<><label><span className="mb-1 block text-[10px] font-semibold uppercase text-[var(--muted-soft)]">Aktivite Başlığı</span><TextInput value={form.activityTitle} onChange={(e)=>setForm((v)=>({...v,activityTitle:e.target.value}))} placeholder="Saha koçluğu / proje..."/></label><label><span className="mb-1 block text-[10px] font-semibold uppercase text-[var(--muted-soft)]">Mentor / Coach</span><Select value={form.facilitatorStaffId} onChange={(e)=>setForm((v)=>({...v,facilitatorStaffId:e.target.value}))}><option value="">Opsiyonel</option>{facilitators.map((m)=><option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}</Select></label></>:null}
      <label><span className="mb-1 block text-[10px] font-semibold uppercase text-[var(--muted-soft)]">Hedef Tarih</span><TextInput type="date" value={form.dueDate} onChange={(e)=>setForm((v)=>({...v,dueDate:e.target.value}))}/></label>
    </div>{ACTIVITY_TYPES.has(form.itemType)?<div className="mt-3"><span className="mb-1 block text-[10px] font-semibold uppercase text-[var(--muted-soft)]">Aktivite Açıklaması</span><TextArea value={form.activityDescription} onChange={(e)=>setForm((v)=>({...v,activityDescription:e.target.value}))} placeholder="Beklenen çıktı, uygulama kapsamı ve başarı kriteri..."/></div>:null}<div className="mt-3"><span className="mb-1 block text-[10px] font-semibold uppercase text-[var(--muted-soft)]">Not</span><TextArea value={form.note} onChange={(e)=>setForm((v)=>({...v,note:e.target.value}))} placeholder="Gelişim hedefi için ek not..."/></div><div className="mt-3 flex justify-end"><Button disabled={action!==null} onClick={()=>void addItem()}>{action==="add-item"?"Ekleniyor...":"Madde Ekle"}</Button></div></FinancePanel>:null}

    <FinancePanel title="Gelişim Yol Haritası" description="Plan maddeleri sıralı olarak izlenir; her durum değişikliği işlem geçmişine kaydedilir.">{!plan.items.length?<FinanceEmpty title="Plan maddesi bulunamadı" description="İlk gelişim hedefini ekleyin."/>:<div className="space-y-3">{plan.items.map((item)=><article key={item.id} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface-2)] p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[9px] font-semibold text-[var(--accent)]">{item.sequence}. {TYPE_LABELS[item.itemType]}</span><span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${itemTone(item.status)}`}>{STATUS_LABELS[item.status]}</span></div><h2 className="mt-2 text-[14px] font-semibold text-[var(--ink)]">{itemTitle(item)}</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Hedef: {dateOnly(item.dueDate)}{item.targetLevel!=null?` · Seviye ${item.targetLevel}`:""}{item.facilitatorFirstName?` · ${item.facilitatorFirstName} ${item.facilitatorLastName??""}`:""}</p>{item.activityDescription?<p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">{item.activityDescription}</p>:null}{item.note?<p className="mt-1 text-[10px] leading-5 text-[var(--muted-soft)]">Not: {item.note}</p>:null}</div>{canManage&&!closed&&item.status!=="COMPLETED"&&item.status!=="CANCELLED"?<div className="flex shrink-0 gap-2">{item.status==="PLANNED"?<Button variant="secondary" disabled={action!==null} onClick={()=>void perform(`start:${item.id}`,()=>api(`/training/planning/development-plans/${plan.id}/items/${item.id}/IN_PROGRESS`,{method:"POST"}),"Gelişim maddesi başlatıldı.")}>Başlat</Button>:null}<Button disabled={action!==null} onClick={()=>void perform(`complete:${item.id}`,()=>api(`/training/planning/development-plans/${plan.id}/items/${item.id}/COMPLETED`,{method:"POST"}),"Gelişim maddesi tamamlandı.")}>Tamamla</Button><Button variant="secondary" disabled={action!==null} onClick={()=>void perform(`cancel:${item.id}`,()=>api(`/training/planning/development-plans/${plan.id}/items/${item.id}/CANCELLED`,{method:"POST"}),"Gelişim maddesi iptal edildi.")}>İptal</Button></div>:null}</div></article>)}</div>}</FinancePanel>
  </div>;
}
