"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { userLabel } from "@/lib/user-language";

type Course={id:string;code:string;title:string;isActive:boolean};
type Branch={id:string;name:string};
type Staff={id:string;name:string;branchId:string;positionId?:string|null;positionName?:string|null};
type Position={id:string;name:string;code:string;staffCount:number};
type Targets={branches:Branch[];staff:Staff[];positions:Position[]};
type Assignment={id:string;branchName:string;staffName?:string|null;status:string;courseCode:string;courseTitle:string;dueAt?:string|null;assignedAt:string;sourceType:string};
type BulkResult={courseVersion:number;matchedStaff:number;created:number;duplicates:number};
type ReminderResult={processed:number;created:number};

type TargetType="PERSONNEL"|"BRANCH"|"POSITION";

function errorMessage(error:unknown){return error instanceof ApiError?error.message:error instanceof Error?error.message:"Atama işlemi tamamlanamadı.";}
function newKey(){return typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;}

export default function TrainingAssignmentsPage(){
  const canManage=hasPermission("training","manage");
  const [courses,setCourses]=useState<Course[]>([]);
  const [targets,setTargets]=useState<Targets>({branches:[],staff:[],positions:[]});
  const [assignments,setAssignments]=useState<Assignment[]>([]);
  const [courseId,setCourseId]=useState("");
  const [targetType,setTargetType]=useState<TargetType>("PERSONNEL");
  const [targetIds,setTargetIds]=useState<string[]>([]);
  const [dueAt,setDueAt]=useState("");
  const [note,setNote]=useState("");
  const [batchKey,setBatchKey]=useState(newKey);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const [courseRows,assignmentRows,targetRows]=await Promise.all([
        api<Course[]>("/training/courses"),
        api<Assignment[]>("/training/assignments?limit=100"),
        canManage?api<Targets>("/training/assignments/targets"):Promise.resolve({branches:[],staff:[],positions:[]}),
      ]);
      const active=(courseRows??[]).filter(item=>item.isActive);
      setCourses(active);setAssignments(assignmentRows??[]);setTargets(targetRows);
      setCourseId(current=>active.some(item=>item.id===current)?current:(active[0]?.id??""));
    }catch(requestError){setError(errorMessage(requestError));}
    finally{setLoading(false);}
  },[canManage]);

  useEffect(()=>{void load();},[load]);

  const options=useMemo(()=>targetType==="PERSONNEL"?targets.staff:targetType==="BRANCH"?targets.branches:targets.positions,[targetType,targets]);
  const activeCount=assignments.filter(item=>item.status==="ASSIGNED"||item.status==="IN_PROGRESS").length;
  const overdueCount=assignments.filter(item=>(item.status==="ASSIGNED"||item.status==="IN_PROGRESS")&&item.dueAt&&new Date(item.dueAt)<new Date()).length;

  function changeTargetType(next:TargetType){setTargetType(next);setTargetIds([]);}

  async function submit(event:FormEvent){
    event.preventDefault();if(!courseId||!targetIds.length||busy)return;
    setBusy(true);setError("");setSuccess("");
    try{
      const result=await api<BulkResult>("/training/assignments/bulk",{method:"POST",body:{courseId,targetType,targetIds,dueAt:dueAt?new Date(dueAt).toISOString():null,note:note||null,idempotencyKey:batchKey}});
      setSuccess(`Sürüm ${result.courseVersion} üzerinden ${result.created} atama oluşturuldu. ${result.duplicates?`${result.duplicates} yinelenen atama oluşturulmadı.`:""}`.trim());
      setTargetIds([]);setNote("");setBatchKey(newKey());await load();
    }catch(requestError){setError(errorMessage(requestError));}
    finally{setBusy(false);}
  }

  async function generateReminders(){
    if(busy)return;setBusy(true);setError("");setSuccess("");
    try{const result=await api<ReminderResult>("/training/reminders/process",{method:"POST",body:{limit:500}});setSuccess(`${result.processed} açık atama değerlendirildi; ${result.created} yeni hatırlatma oluşturuldu.`);}
    catch(requestError){setError(errorMessage(requestError));}
    finally{setBusy(false);}
  }

  if(loading)return <div className="flex min-h-[420px] items-center justify-center rounded-[22px] border border-[var(--line)] bg-[var(--surface)]"><Spinner label="Eğitim Atamaları Hazırlanıyor..."/></div>;

  return <div className="space-y-6 pb-10">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-soft)]">Eğitim Operasyonları</p><h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">Eğitim Atamaları</h1><p className="mt-2 max-w-[850px] text-[13px] leading-6 text-[var(--muted)]">Yayınlanmış eğitimleri personele, şubeye veya pozisyona toplu olarak atayın. Bir atama oluşturulduğunda kullanılan eğitim sürümü korunur; sonraki güncellemeler geçmiş eğitim kayıtlarını değiştirmez.</p></div>{canManage?<Button variant="secondary" disabled={busy} onClick={()=>void generateReminders()}>Hatırlatmaları Üret</Button>:null}</header>
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}{success?<Alert tone="success" onClose={()=>setSuccess("")}>{success}</Alert>:null}
    <section className="grid gap-3 sm:grid-cols-3"><FinanceMetric label="Son Kayıtlar" value={assignments.length} detail="Listelenen Atama" tone="neutral"/><FinanceMetric label="Aktif" value={activeCount} detail="Atanmış veya devam eden" tone="info"/><FinanceMetric label="Süresi Geçmiş" value={overdueCount} detail="Henüz Expired İşlenmemiş" tone={overdueCount?"warning":"neutral"}/></section>

    {canManage?<FinancePanel title="Toplu Atama" description="Hedef seçimi aktif tenant/company/branch scope ile sınırlandırılır."><form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
      <label><span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">Kurs</span><Select required value={courseId} onChange={e=>setCourseId(e.target.value)} className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"><option value="">Kurs seçin</option>{courses.map(course=><option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}</Select></label>
      <label><span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">Hedef Tipi</span><Select value={targetType} onChange={e=>changeTargetType(e.target.value as TargetType)} className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"><option value="PERSONNEL">Personel</option><option value="BRANCH">Şube</option><option value="POSITION">Pozisyon / Rol</option></Select></label>
      <label className="lg:col-span-2"><span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">Hedefler</span><Select multiple required value={targetIds} onChange={e=>setTargetIds(Array.from(e.target.selectedOptions,item=>item.value))} className="min-h-[150px] w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 text-[13px]">{options.map(item=><option key={item.id} value={item.id}>{"staffCount" in item?`${item.name} · ${item.staffCount} personel`:item.name}</option>)}</Select><span className="mt-1 block text-[10px] text-[var(--muted-soft)]">Birden fazla seçim için masaüstünde Ctrl/Cmd tuşunu kullanabilirsiniz.</span></label>
      <label><span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">Son Tarih</span><input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)} className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/></label>
      <label><span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">Not</span><input value={note} onChange={e=>setNote(e.target.value)} maxLength={2000} placeholder="Atama açıklaması" className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/></label>
      <div className="lg:col-span-2 flex items-center justify-between gap-3"><p className="text-[10px] text-[var(--muted-soft)]">Seçili hedef: {targetIds.length}. Aynı atama tekrar gönderilirse yinelenen kayıt oluşturulmaz.</p><Button type="submit" disabled={busy||!courseId||!targetIds.length}>{busy?"İşleniyor...":"Eğitimi Ata"}</Button></div>
    </form></FinancePanel>:<FinanceEmpty title="Yalnızca Görüntüleme" description="Toplu eğitim ataması yapabilmek için düzenleme yetkisi gerekir."/>}

    <FinancePanel title="Son Eğitim Atamaları" description="Personel, eğitim, şube, durum ve son tarih bilgilerini birlikte görüntüleyin.">{assignments.length?<div className="overflow-x-auto"><table className="min-w-full text-left text-[11px]"><thead><tr className="border-b border-[var(--line)] text-[var(--muted-soft)]"><th className="px-3 py-2 font-medium">Personel</th><th className="px-3 py-2 font-medium">Kurs</th><th className="px-3 py-2 font-medium">Şube</th><th className="px-3 py-2 font-medium">Durum</th><th className="px-3 py-2 font-medium">Son Tarih</th></tr></thead><tbody>{assignments.map(item=><tr key={item.id} className="border-b border-[var(--line)] last:border-0"><td className="px-3 py-3 font-medium text-[var(--ink)]">{item.staffName??"Şube Geneli"}</td><td className="px-3 py-3 text-[var(--muted)]">{item.courseCode} · {item.courseTitle}</td><td className="px-3 py-3 text-[var(--muted)]">{item.branchName}</td><td className="px-3 py-3 text-[var(--muted)]">{userLabel(item.status)}</td><td className="px-3 py-3 text-[var(--muted)]">{item.dueAt?new Date(item.dueAt).toLocaleString("tr-TR"):"—"}</td></tr>)}</tbody></table></div>:<FinanceEmpty title="Atama Yok" description="Henüz eğitim ataması bulunmuyor."/>}</FinancePanel>
  </div>;
}