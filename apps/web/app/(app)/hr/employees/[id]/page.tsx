"use client";

import Link from "next/link";
import { CardInfo } from "@/components/card-info";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Field as FormField, Modal, Spinner, TextArea, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { getCardHelp } from "@/lib/card-help";
import { hasPermission } from "@/lib/auth";
import { userLabel } from "@/lib/user-language";

type R=Record<string,string|number|boolean|null|undefined>;type EmployeeRecord={firstName?:string|null;lastName?:string|null;branch?:{name?:string|null}|null;status?:string|null;personnelNumber?:string|null;hireDate?:string|null;email?:string|null;phone?:string|null;employmentType?:string|null;terminationDate?:string|null;identityNumber?:string|null;dateOfBirth?:string|null;personalEmail?:string|null;address?:string|null;bankName?:string|null;iban?:string|null;grossSalary?:string|number|null;salaryType?:string|null};type Employee360={employee:EmployeeRecord;organization:{current:R|null;history:R[]};employment:{history:R[];timeline:R[]};attendance:R;leave:R;payroll?:{recentPeriods:R[];recentPayments:R[]};performance:{goals:R[];reviews:R[];appointments:R;recentAppointments:R[]};sensitiveDataIncluded?:boolean};type Onboarding={plans:R[];current:R|null;tasks:R[];progress:number};type Probation={periods:R[];current:R|null;reviews:R[]};type Offboarding={plans:R[];current:R|null;tasks:R[];progress:number};
const money=(v:unknown)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY",maximumFractionDigits:2}).format(Number(v||0)),date=(v:unknown)=>v?new Date(String(v)).toLocaleDateString("tr-TR"):"—",value=(v:unknown)=>v===null||v===undefined||v===""?"—":typeof v==="string"?userLabel(v):String(v),isoToday=()=>new Date().toISOString().slice(0,10);
export default function Employee360Page(){const{id}=useParams<{id:string}>(),[data,setData]=useState<Employee360|null>(null),[onboarding,setOnboarding]=useState<Onboarding|null>(null),[probation,setProbation]=useState<Probation|null>(null),[offboarding,setOffboarding]=useState<Offboarding|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[error,setError]=useState(""),[offboardingStartOpen,setOffboardingStartOpen]=useState(false),[offboardingReason,setOffboardingReason]=useState("");const sensitivePermission=hasPermission("hr_sensitive","read"),canManage=hasPermission("hr","manage");
const load=useCallback(async()=>{setLoading(true);setError("");const profilePath=sensitivePermission?`/hr/employees/${id}/360/sensitive`:`/hr/employees/${id}/360`,results=await Promise.allSettled([api<Employee360>(profilePath),api<Onboarding>(`/hr/employees/${id}/onboarding`),api<Probation>(`/hr/employees/${id}/probation`),api<Offboarding>(`/hr/employees/${id}/offboarding`)]);const profile=results[0];if(profile.status==="rejected"){const e=profile.reason;setError(e instanceof ApiError?e.message:"Çalışan bilgileri yüklenemedi.");setLoading(false);return}setData(profile.value);setOnboarding(results[1].status==="fulfilled"?results[1].value:null);setProbation(results[2].status==="fulfilled"?results[2].value:null);setOffboarding(results[3].status==="fulfilled"?results[3].value:null);setLoading(false)},[id,sensitivePermission]);useEffect(()=>{void load()},[load]);
async function action(key:string,path:string,method:"POST"|"PATCH",body?:R){setBusy(key);setError("");try{await api(path,{method,body});await load()}catch(e){setError(e instanceof ApiError?e.message:"İnsan kaynakları işlemi tamamlanamadı.")}finally{setBusy("")}}
if(error&&!data)return <div className="mx-auto max-w-[1280px] py-6"><Alert>{error}</Alert></div>;if(loading||!data)return <div className="flex h-72 items-center justify-center"><Spinner/></div>;const e=data.employee,o=data.organization.current,a=data.attendance,l=data.leave,p=data.performance.appointments,goals=data.performance.goals??[],reviews=data.performance.reviews??[],latestReview=reviews[0]??null,activeGoals=goals.filter((goal)=>String(goal.status??"")==="ACTIVE").length,sensitive=sensitivePermission&&data.sensitiveDataIncluded===true;
return <div className="mx-auto max-w-[1280px] space-y-5 pb-12">{error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}<header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><Link href="/hr/employees" className="text-xs font-medium text-[var(--accent)]">← Çalışanlar</Link><p className="mt-4 text-[11px] font-semibold uppercase tracking-[.15em] text-[var(--muted-soft)]">Çalışan Genel Görünümü</p><h1 className="mt-1 text-[30px] font-semibold tracking-[-.035em] text-[var(--ink)]">{e.firstName} {e.lastName}</h1><p className="mt-1 text-xs text-[var(--muted)]">{value(o?.positionName)} · {value(o?.departmentName)} · {value(e.branch?.name)}</p></div><div className="flex gap-2"><span className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold">{userLabel(e.status||"ACTIVE")}</span>{sensitive?<span className="rounded-full border border-[var(--line)] px-4 py-2 text-xs font-semibold text-[var(--accent)]">Özel Bilgilere Erişim Açık</span>:null}</div></header>
<section className="flex flex-wrap gap-2 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-3">
  <EmployeeActionLink href={"/hr/employees/"+id+"/documents"} label="Belgeler"/>
  <EmployeeActionLink href={"/hr/employees/"+id+"/certifications"} label="Sertifikalar"/>
  <EmployeeActionLink href={"/hr/employees/"+id+"/assets"} label="Zimmet ve Ekipman"/>
</section>
<section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{[["Sicil No",e.personnelNumber],["İşe Giriş",date(e.hireDate)],["Çalışılan Süre",`${Math.round(Number(a.workedMinutes||0)/60)} saat`],["Onaylı İzin",`${Number(l.approvedDays||0)} gün`],["Hizmet Geliri",money(p.collectedRevenue)]].map(([k,v])=><Card key={String(k)} k={String(k)} v={v}/>)}</section>
<div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><Panel title="Özlük ve İletişim"><div className="grid gap-x-8 gap-y-4 sm:grid-cols-2"><Field k="E-Posta" v={e.email}/><Field k="Telefon" v={e.phone}/><Field k="Çalışma Şekli" v={e.employmentType}/><Field k="İşe Giriş" v={date(e.hireDate)}/><Field k="İşten Ayrılış" v={date(e.terminationDate)}/><Field k="Sicil No" v={e.personnelNumber}/>{sensitive?<><Field k="T.C. Kimlik No" v={e.identityNumber}/><Field k="Doğum Tarihi" v={date(e.dateOfBirth)}/><Field k="Kişisel E-Posta" v={e.personalEmail}/><Field k="Adres" v={e.address}/><Field k="Banka" v={e.bankName}/><Field k="IBAN" v={e.iban}/><Field k="Brüt Ücret" v={e.grossSalary==null?null:money(e.grossSalary)}/><Field k="Ücretlendirme Şekli" v={e.salaryType}/></>:null}</div>{!sensitive?<p className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 text-[10px] text-[var(--muted)]">Kimlik, banka ve ücret gibi özel çalışan bilgilerini görüntülemek için ek yetki gerekir.</p>:null}</Panel><Panel title="Organizasyon"><Field k="Departman" v={o?.departmentName}/><Field k="Takım" v={o?.teamName}/><Field k="Pozisyon" v={o?.positionName}/><Field k="Yönetici" v={o?.managerFirstName?`${o.managerFirstName} ${o.managerLastName||""}`:null}/></Panel></div>
<Panel title="İşe Başlangıç Süreci"><Workflow current={onboarding?.current??null} tasks={onboarding?.tasks??[]} progress={onboarding?.progress??0} canManage={canManage} busy={busy} onStart={()=>action("onboarding-start",`/hr/employees/${id}/onboarding`,"POST",{})} onTask={(task,status,note)=>action(`onboarding-${task.id}`,`/hr/employees/${id}/onboarding/tasks/${task.id}`,"PATCH",{status,completionNote:note})}/></Panel>
<Panel title="Deneme Süresi"><ProbationView data={probation} canManage={canManage} busy={busy} onStart={()=>action("probation-start",`/hr/employees/${id}/probation`,"POST",{})} onReview={(r,status,rating,note)=>action(`review-${r.id}`,`/hr/employees/${id}/probation/reviews/${r.id}`,"PATCH",{status,rating,managerNote:note})} onDecision={(decision,extra)=>action(`decision-${decision}`,`/hr/employees/${id}/probation/decision`,"POST",{decision,...extra})}/></Panel>
<Panel title="İşten Ayrılış"><Workflow current={offboarding?.current??null} tasks={offboarding?.tasks??[]} progress={offboarding?.progress??0} offboarding canManage={canManage} busy={busy} onStart={()=>{setOffboardingReason("");setOffboardingStartOpen(true)}} onTask={(task,status,note)=>action(`offboarding-${task.id}`,`/hr/employees/${id}/offboarding/tasks/${task.id}`,"PATCH",{status,completionNote:note})} onComplete={()=>action("offboarding-complete",`/hr/employees/${id}/offboarding/complete`,"POST")}/></Panel>
<section className="grid gap-5 lg:grid-cols-4"><Metric title="Puantaj" rows={[["Kayıt",a.recordCount],["Mevcut",a.presentCount],["Fazla Mesai",`${Math.round(Number(a.overtimeMinutes||0)/60)} saat`]]}/><Metric title="İzin" rows={[["Talep",l.requestCount],["Onaylı",`${l.approvedDays||0} gün`],["Bekleyen",`${l.pendingDays||0} gün`]]}/><Metric title="Performans" rows={[["Aktif Hedef",activeGoals],["Değerlendirme",reviews.length],["Sonuç Puanı",latestReview?.finalScore??"—"]]}/><Metric title="Operasyon Sonuçları" rows={[["Toplam Randevu",p.totalAppointments],["Tamamlanan",p.completedAppointments],["Tahsilat",money(p.collectedRevenue)]]}/></section><Panel title="Performans ve Gelişim"><div className="grid gap-5 lg:grid-cols-2"><div><p className="mb-3 text-[11px] font-semibold text-[var(--ink)]">Hedefler</p><div className="space-y-2">{goals.length?goals.slice(0,6).map((goal)=><div key={String(goal.id??"")} className="rounded-xl border border-[var(--line)] p-3"><div className="flex items-center justify-between gap-3"><span className="text-xs font-medium">{value(goal.name)}</span><span className="text-[10px] text-[var(--muted)]">{value(goal.status)}</span></div><p className="mt-1 text-[10px] text-[var(--muted)]">Hedef {value(goal.target)}{goal.unit?` ${goal.unit}`:""} · Gerçekleşen {value(goal.actual)}{goal.unit?` ${goal.unit}`:""}</p></div>):<p className="text-xs text-[var(--muted)]">Henüz hedef kaydı bulunmuyor.</p>}</div></div><div><p className="mb-3 text-[11px] font-semibold text-[var(--ink)]">Değerlendirmeler</p><div className="space-y-2">{reviews.length?reviews.slice(0,6).map((review)=><div key={String(review.id??"")} className="rounded-xl border border-[var(--line)] p-3"><div className="flex items-center justify-between gap-3"><span className="text-xs font-medium">{value(review.cycle)}</span><span className="text-[10px] text-[var(--muted)]">{value(review.status)}</span></div><p className="mt-1 text-[10px] text-[var(--muted)]">Sonuç puanı: {value(review.finalScore)}</p>{review.developmentPlan?<p className="mt-2 text-[10px] leading-5 text-[var(--muted)]">{String(review.developmentPlan)}</p>:null}</div>):<p className="text-xs text-[var(--muted)]">Henüz performans değerlendirmesi bulunmuyor.</p>}</div></div></div></Panel><Panel title="Çalışan Yaşam Döngüsü"><div className="space-y-3">{data.employment.timeline.map((x,i)=><div key={`${String(x.source??"")}-${String(x.id??"")}-${i}`} className="border-l border-[var(--line)] pl-4 text-xs"><strong>{x.source==="ORGANIZATION"?"Organizasyon Ataması":value(x.eventType)}</strong><span className="ml-3 text-[var(--muted)]">{date(x.date)}</span><p className="mt-1 text-[var(--muted)]">{[x.branchName,x.departmentName,x.positionName,x.employmentType,sensitive&&x.grossSalary!=null?money(x.grossSalary):null].filter(Boolean).join(" · ")}</p></div>)}</div></Panel><Panel title="Bordro ve Ödeme Bilgileri">{sensitive&&data.payroll?<Payroll data={data.payroll}/>:<p className="text-xs text-[var(--muted)]">Bu ücret ve ödeme bilgilerini görüntülemek için ek yetki gerekir.</p>}</Panel>
<Modal open={offboardingStartOpen} onClose={()=>{if(!busy){setOffboardingStartOpen(false);setOffboardingReason("")}}} title="İşten Ayrılış Sürecini Başlat" description="Ayrılış gerekçesini kaydedin. Süreç görevleri oluşturulduktan sonra çalışan kaydı geçmişi korunarak yönetilir.">
  <div className="space-y-4">
    <FormField label="İşten Ayrılış Nedeni" required><TextArea rows={4} value={offboardingReason} onChange={e=>setOffboardingReason(e.target.value)} placeholder="Ayrılış gerekçesini yazın…"/></FormField>
    <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
      <Button variant="secondary" disabled={!!busy} onClick={()=>{setOffboardingStartOpen(false);setOffboardingReason("")}}>Vazgeç</Button>
      <Button variant="danger" disabled={!!busy||!offboardingReason.trim()} onClick={()=>{if(!offboardingReason.trim())return;setOffboardingStartOpen(false);void action("offboarding-start",`/hr/employees/${id}/offboarding`,"POST",{terminationDate:isoToday(),terminationReason:offboardingReason.trim()});setOffboardingReason("")}}>Süreci Başlat</Button>
    </div>
  </div>
</Modal>
</div>}
function EmployeeActionLink({href,label}:{href:string;label:string}){return <Link href={href} className="inline-flex min-h-10 items-center justify-center rounded-[12px] border border-[var(--line)] bg-white px-4 text-xs font-semibold text-[var(--ink)] shadow-[0_1px_2px_rgba(17,70,104,.03)] transition hover:border-[var(--line-strong)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]">{label}</Link>}
function Workflow({current,tasks,progress,offboarding=false,canManage,busy,onStart,onTask,onComplete}:{current:R|null;tasks:R[];progress:number;offboarding?:boolean;canManage:boolean;busy:string;onStart:()=>void;onTask:(t:R,s:string,n?:string)=>void;onComplete?:()=>void}){
  const[skipTask,setSkipTask]=useState<R|null>(null);
  const[skipNote,setSkipNote]=useState("");
  if(!current)return <div className="flex items-center justify-between"><p className="text-xs text-[var(--muted)]">Henüz başlatılmış bir süreç bulunmuyor.</p>{canManage?<Button type="button" onClick={onStart} disabled={!!busy}>{offboarding?"İşten ayrılış sürecini başlat":"İşe başlangıç sürecini başlat"}</Button>:null}</div>;
  return <>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><p className="text-xs font-semibold">{offboarding?`Planlanan işten ayrılış: ${date(current.termination_date)}`:current.name}</p><p className="text-[10px] text-[var(--muted)]">{value(current.status)} · %{progress}</p></div>
        {offboarding&&canManage&&progress===100?<Button type="button" onClick={onComplete} disabled={!!busy}>İşten Ayrılışı Tamamla</Button>:null}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]"><div className="h-full bg-[var(--accent)]" style={{width:`${Math.min(100,Math.max(0,progress))}%`}}/></div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {tasks.map(t=><div key={String(t.id??"")} className="rounded-xl border border-[var(--line)] p-3">
          <p className="text-xs font-medium">{t.title}</p>
          <p className="mt-1 text-[10px] text-[var(--muted)]">{value(t.status)}</p>
          {canManage&&current.status==="ACTIVE"&&!["COMPLETED","SKIPPED"].includes(String(t.status??""))?<div className="mt-3 flex gap-2">
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={()=>onTask(t,"COMPLETED")}>Tamamla</Button>
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={()=>{setSkipTask(t);setSkipNote("")}}>Atla</Button>
          </div>:null}
        </div>)}
      </div>
    </div>
    <Modal open={Boolean(skipTask)} onClose={()=>{if(!busy){setSkipTask(null);setSkipNote("")}}} title="Görevi Atla" description="Bu görevin neden uygulanmadığını açıklayın. Açıklama çalışan sürecinde saklanır.">
      <div className="space-y-4">
        <FormField label="Atlama Açıklaması" required><TextArea rows={4} value={skipNote} onChange={e=>setSkipNote(e.target.value)} placeholder="Görevin neden atlandığını yazın…"/></FormField>
        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
          <Button variant="secondary" disabled={!!busy} onClick={()=>{setSkipTask(null);setSkipNote("")}}>Vazgeç</Button>
          <Button disabled={!!busy||!skipNote.trim()} onClick={()=>{if(skipTask&&skipNote.trim()){onTask(skipTask,"SKIPPED",skipNote.trim());setSkipTask(null);setSkipNote("")}}}>Görevi Atla</Button>
        </div>
      </div>
    </Modal>
  </>;
}
function ProbationView({data,canManage,busy,onStart,onReview,onDecision}:{data:Probation|null;canManage:boolean;busy:string;onStart:()=>void;onReview:(r:R,s:string,rating?:number,note?:string)=>void;onDecision:(s:string,e?:R)=>void}){
  const[reviewTarget,setReviewTarget]=useState<R|null>(null);
  const[rating,setRating]=useState("5");
  const[decisionMode,setDecisionMode]=useState<"EXTEND"|"TERMINATE"|null>(null);
  const[decisionValue,setDecisionValue]=useState("");
  const p=data?.current;
  if(!p)return <div className="flex items-center justify-between"><p className="text-xs text-[var(--muted)]">Deneme süreci bulunmuyor.</p>{canManage?<Button type="button" onClick={onStart} disabled={!!busy}>Deneme Süresi Başlat</Button>:null}</div>;
  const numericRating=Number(rating);
  const ratingValid=Number.isFinite(numericRating)&&numericRating>=0&&numericRating<=5;
  return <>
    <div className="space-y-4">
      <p className="text-xs font-semibold">{date(p.started_at)} → {date(p.end_at)} · {value(p.status)}</p>
      <div className="grid gap-3 md:grid-cols-3">
        {(data?.reviews??[]).map(r=><div key={String(r.id??"")} className="rounded-xl border border-[var(--line)] p-4">
          <strong className="text-sm">{r.review_day}. Gün</strong>
          <p className="mt-2 text-[10px] text-[var(--muted)]">{date(r.scheduled_date)} · {value(r.status)}</p>
          {canManage&&p.status==="ACTIVE"&&!["COMPLETED","SKIPPED"].includes(String(r.status??""))?<Button size="sm" variant="secondary" className="mt-3" disabled={!!busy} onClick={()=>{setReviewTarget(r);setRating("5")}}>Değerlendir</Button>:null}
        </div>)}
      </div>
      {canManage&&p.status==="ACTIVE"?<div className="flex flex-wrap gap-2">
        <Button type="button" onClick={()=>onDecision("CONFIRMED")} disabled={!!busy}>Kadroyu Onayla</Button>
        <Button type="button" variant="secondary" onClick={()=>{setDecisionMode("EXTEND");setDecisionValue("")}} disabled={!!busy}>Uzat</Button>
        <Button type="button" variant="danger" onClick={()=>{setDecisionMode("TERMINATE");setDecisionValue("")}} disabled={!!busy}>İşten Ayrılış Başlat</Button>
      </div>:null}
    </div>

    <Modal open={Boolean(reviewTarget)} onClose={()=>{if(!busy)setReviewTarget(null)}} title="Deneme Süresi Değerlendirmesi" description="Çalışanın bu kontrol dönemindeki değerlendirme puanını kaydedin.">
      <div className="space-y-4">
        <FormField label="Değerlendirme Puanı (0-5)" required><TextInput type="number" min={0} max={5} step="0.1" value={rating} onChange={e=>setRating(e.target.value)}/></FormField>
        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4"><Button variant="secondary" disabled={!!busy} onClick={()=>setReviewTarget(null)}>Vazgeç</Button><Button disabled={!!busy||!ratingValid} onClick={()=>{if(reviewTarget&&ratingValid){onReview(reviewTarget,"COMPLETED",numericRating);setReviewTarget(null)}}}>Değerlendirmeyi Kaydet</Button></div>
      </div>
    </Modal>

    <Modal open={decisionMode==="EXTEND"} onClose={()=>{if(!busy){setDecisionMode(null);setDecisionValue("")}}} title="Deneme Süresini Uzat" description="Yeni bitiş tarihini seçin.">
      <div className="space-y-4">
        <FormField label="Yeni Bitiş Tarihi" required><TextInput type="date" value={decisionValue} onChange={e=>setDecisionValue(e.target.value)}/></FormField>
        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4"><Button variant="secondary" disabled={!!busy} onClick={()=>setDecisionMode(null)}>Vazgeç</Button><Button disabled={!!busy||!decisionValue} onClick={()=>{if(decisionValue){onDecision("EXTENDED",{endAt:decisionValue});setDecisionMode(null);setDecisionValue("")}}}>Süreyi Uzat</Button></div>
      </div>
    </Modal>

    <Modal open={decisionMode==="TERMINATE"} onClose={()=>{if(!busy){setDecisionMode(null);setDecisionValue("")}}} title="İşten Ayrılış Sürecini Başlat" description="Deneme sürecinin neden işten ayrılışla sonuçlandığını açıklayın.">
      <div className="space-y-4">
        <FormField label="Ayrılış Nedeni" required><TextArea rows={4} value={decisionValue} onChange={e=>setDecisionValue(e.target.value)} placeholder="Ayrılış gerekçesini yazın…"/></FormField>
        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4"><Button variant="secondary" disabled={!!busy} onClick={()=>setDecisionMode(null)}>Vazgeç</Button><Button variant="danger" disabled={!!busy||!decisionValue.trim()} onClick={()=>{if(decisionValue.trim()){onDecision("TERMINATED",{terminationDate:isoToday(),terminationReason:decisionValue.trim(),note:decisionValue.trim()});setDecisionMode(null);setDecisionValue("")}}}>İşten Ayrılışı Başlat</Button></div>
      </div>
    </Modal>
  </>;
}
function Payroll({data}:{data:{recentPeriods:R[];recentPayments:R[]}}){return <div className="grid gap-5 lg:grid-cols-2"><Metric title="Son Bordrolar" rows={data.recentPeriods.map(x=>[`${x.year}/${String(x.month).padStart(2,"0")}`,money(x.netAmount)])}/><Metric title="Son Maaş Ödemeleri" rows={data.recentPayments.map(x=>[date(x.paidAt),money(x.amount)])}/></div>}function Panel({title,children}:{title:string;children:React.ReactNode}){return <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><div className="mb-4 flex items-start justify-between gap-3"><h2 className="text-sm font-semibold">{title}</h2><CardInfo help={getCardHelp(title)} /></div>{children}</section>}function Field({k,v}:{k:string;v:unknown}){return <div className="mb-3"><p className="text-[10px] uppercase text-[var(--muted-soft)]">{k}</p><p className="mt-1 text-xs font-medium">{value(v)}</p></div>}function Card({k,v}:{k:string;v:React.ReactNode}){return <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><div className="flex items-start justify-between gap-3"><p className="text-[10px] font-semibold uppercase text-[var(--muted-soft)]">{k}</p><CardInfo help={getCardHelp(k)} /></div><p className="mt-2 text-xl font-semibold">{v}</p></div>}function Metric({title,rows}:{title:string;rows:unknown[][]}){return <Panel title={title}><div className="divide-y divide-[var(--line)]">{rows.map(([k,v])=><div key={String(k)} className="flex justify-between py-3 text-xs"><span className="text-[var(--muted)]">{value(k)}</span><strong>{value(v)}</strong></div>)}</div></Panel>}
