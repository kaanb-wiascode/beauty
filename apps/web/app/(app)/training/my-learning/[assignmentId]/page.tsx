"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Lesson={id:string;sequence:number;title:string;contentType:string;contentText?:string|null;contentRef?:string|null;durationMinutes?:number|null;isRequired:boolean;hasDocument?:boolean;status:string};
type Module={id:string;sequence:number;title:string;description?:string|null;lessons:Lesson[]};
type Exam={id:string;title:string;passScore:number;maxAttempts?:number|null;questionCount:number;attemptCount:number;bestScore?:number|null;passed?:boolean|null};
type Result={theoryScore?:number|null;theoryPassed?:boolean|null;practicalScore?:number|null;practicalPassed?:boolean|null;finalPassed:boolean;finalizedAt?:string|null};
type Detail={id:string;status:string;courseCode:string;courseTitle:string;courseDescription?:string|null;courseVersion:number;versionDescription?:string|null;requiresTheory:boolean;requiresPractical:boolean;dueAt?:string|null;modules:Module[];ungroupedLessons:Lesson[];exams:Exam[];progress:{requiredLessons:number;completedRequiredLessons:number;requiredComplete:boolean;totalLessons:number;completedLessons:number};result?:Result|null;completion:{lessonsComplete:boolean;needsAssessment:boolean;readyForAssessment:boolean;completed:boolean}};
type DocumentResponse={downloadUrl:string};

function message(error:unknown,fallback:string){return error instanceof ApiError?error.message:error instanceof Error?error.message:fallback;}
function formatDate(value?:string|null){return value?new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium"}).format(new Date(value)):"—";}

export default function MyLearningDetailPage(){
  const {assignmentId}=useParams<{assignmentId:string}>();
  const [detail,setDetail]=useState<Detail|null>(null);
  const [loading,setLoading]=useState(true);
  const [action,setAction]=useState<string|null>(null);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{setLoading(true);setError("");try{setDetail(await api<Detail>(`/training/learner/me/assignments/${assignmentId}`));}catch(requestError){setError(message(requestError,"Eğitim içeriği yüklenemedi."));}finally{setLoading(false);}},[assignmentId]);
  useEffect(()=>{void load();},[load]);

  const allLessons=useMemo(()=>detail?[...detail.modules.flatMap(module=>module.lessons),...detail.ungroupedLessons]:[],[detail]);
  const progressPercent=detail?Math.min(100,Math.round((detail.progress.completedRequiredLessons/Math.max(detail.progress.requiredLessons,1))*100)):0;

  async function post(key:string,path:string,fallback:string){if(action)return;setAction(key);setError("");try{await api(path,{method:"POST"});await load();}catch(requestError){setError(message(requestError,fallback));}finally{setAction(null);}}
  async function openDocument(lesson:Lesson){if(action)return;setAction(`doc:${lesson.id}`);setError("");try{const response=await api<DocumentResponse>(`/training/learner/me/assignments/${assignmentId}/lessons/${lesson.id}/document`);window.open(response.downloadUrl,"_blank","noopener,noreferrer");}catch(requestError){setError(message(requestError,"Doküman açılamadı."));}finally{setAction(null);}}

  if(loading)return <div className="flex min-h-[420px] items-center justify-center rounded-[22px] border border-[var(--line)] bg-[var(--surface)]"><Spinner label="Eğitim Açılıyor..."/></div>;
  if(!detail)return <div className="space-y-4"><Link href="/training/my-learning" className="text-[12px] font-semibold text-[var(--accent)]">← Eğitimlerim</Link>{error?<Alert>{error}</Alert>:<FinanceEmpty title="Eğitim Bulunamadı" description="Bu atama hesabınıza ait olmayabilir."/>}</div>;

  const lessonCard=(lesson:Lesson)=>{const complete=lesson.status==="COMPLETED";return <div key={lesson.id} className="rounded-[16px] border border-[var(--line)] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-[12px] font-semibold text-[var(--ink)]">{lesson.sequence}. {lesson.title}</p>{lesson.isRequired?<span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[9px] font-semibold text-[var(--accent)]">Zorunlu</span>:null}{complete?<span className="rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[9px] font-semibold text-[var(--success)]">Tamamlandı</span>:null}</div><p className="mt-1 text-[10px] text-[var(--muted)]">{lesson.contentType}{lesson.durationMinutes!=null?` · ${lesson.durationMinutes} dk`:""}</p>{lesson.contentType==="TEXT"&&lesson.contentText?<div className="mt-3 whitespace-pre-wrap rounded-[12px] bg-[var(--surface-2)] p-3 text-[12px] leading-6 text-[var(--ink)]">{lesson.contentText}</div>:null}{["VIDEO","LINK"].includes(lesson.contentType)&&lesson.contentRef?<a className="mt-3 inline-flex text-[11px] font-semibold text-[var(--accent)] hover:underline" href={lesson.contentRef} target="_blank" rel="noreferrer">İçeriği Aç ↗</a>:null}</div><div className="flex shrink-0 gap-2">{lesson.hasDocument?<Button variant="secondary" disabled={action!==null} onClick={()=>void openDocument(lesson)}>Dokümanı Aç</Button>:null}{!complete&&!["COMPLETED","CANCELLED","EXPIRED"].includes(detail.status)?<>{lesson.status==="NOT_STARTED"?<Button variant="secondary" disabled={action!==null} onClick={()=>void post(`start:${lesson.id}`,`/training/learner/me/assignments/${assignmentId}/lessons/${lesson.id}/start`,"Ders başlatılamadı.")}>Başla</Button>:null}<Button disabled={action!==null} onClick={()=>void post(`complete:${lesson.id}`,`/training/learner/me/assignments/${assignmentId}/lessons/${lesson.id}/complete`,"Ders tamamlanamadı.")}>Tamamla</Button></>:null}</div></div></div>};

  return <div className="space-y-6 pb-10">
    <header><Link href="/training/my-learning" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">← Eğitimlerim</Link><p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-soft)]">{detail.courseCode} · v{detail.courseVersion}</p><h1 className="mt-1 text-[30px] font-semibold tracking-[-0.04em] text-[var(--ink)]">{detail.courseTitle}</h1><p className="mt-2 max-w-[840px] text-[13px] leading-6 text-[var(--muted)]">{detail.versionDescription??detail.courseDescription??"Zorunlu dersleri tamamlayın ve gerekli değerlendirme aşamalarını takip edin."}</p></header>
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><FinanceMetric label="İlerleme" value={`%${progressPercent}`} detail={`${detail.progress.completedRequiredLessons}/${detail.progress.requiredLessons} zorunlu ders`} tone={detail.progress.requiredComplete?"success":"info"}/><FinanceMetric label="Durum" value={detail.status==="COMPLETED"?"Tamamlandı":detail.status==="IN_PROGRESS"?"Devam":"Atandı"} detail={`Son tarih ${formatDate(detail.dueAt)}`} tone={detail.status==="COMPLETED"?"success":"neutral"}/><FinanceMetric label="Assessment" value={detail.completion.needsAssessment?"Gerekli":"Yok"} detail={detail.completion.readyForAssessment?"Hazır":detail.completion.needsAssessment?"Dersleri tamamlayın":"Ders bazlı"} tone={detail.completion.readyForAssessment?"warning":"neutral"}/><FinanceMetric label="Toplam Ders" value={detail.progress.totalLessons} detail={`${detail.progress.completedLessons} tamamlandı`} tone="neutral"/></section>

    {detail.completion.readyForAssessment&&!detail.completion.completed?<Alert tone="success">Zorunlu dersler tamamlandı. Teori/pratik değerlendirme aşamasına geçebilirsiniz.</Alert>:null}

    <FinancePanel title="Kurs İçeriği" description="Modülleri sırayla ilerleyin; zorunlu dersler completion rule içinde değerlendirilir."><div className="space-y-5">{detail.modules.map(module=><section key={module.id}><div className="mb-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">Modül {module.sequence}</p><h2 className="mt-1 text-[14px] font-semibold text-[var(--ink)]">{module.title}</h2>{module.description?<p className="mt-1 text-[11px] text-[var(--muted)]">{module.description}</p>:null}</div><div className="space-y-3">{module.lessons.map(lessonCard)}</div></section>)}{detail.ungroupedLessons.length?<section><h2 className="mb-3 text-[14px] font-semibold text-[var(--ink)]">Diğer Dersler</h2><div className="space-y-3">{detail.ungroupedLessons.map(lessonCard)}</div></section>:null}{allLessons.length===0?<FinanceEmpty title="Ders Bulunmuyor" description="Bu course version için henüz learner içeriği tanımlanmamış."/>:null}</div></FinancePanel>

    {detail.requiresTheory?<FinancePanel title="Teori Assessment" description="Zorunlu dersler tamamlandıktan sonra sınava girebilirsiniz."><div className="space-y-3">{detail.exams.map(exam=><div key={exam.id} className="flex flex-col gap-3 rounded-[16px] border border-[var(--line)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[12px] font-semibold text-[var(--ink)]">{exam.title}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{exam.questionCount} soru · Başarı ≥ {exam.passScore} · {exam.attemptCount} deneme{exam.bestScore!=null?` · En iyi ${exam.bestScore}`:""}</p></div>{detail.progress.requiredComplete&&detail.status!=="COMPLETED"?<Link href={`/training/my-learning/${assignmentId}/exam/${exam.id}`} className="inline-flex h-9 items-center justify-center rounded-[10px] bg-[var(--accent)] px-4 text-[11px] font-semibold text-white">{exam.attemptCount?"Sınava Tekrar Gir":"Sınava Gir"}</Link>:<span className="text-[10px] font-medium text-[var(--muted-soft)]">Önce zorunlu dersler</span>}</div>)}</div></FinancePanel>:null}

    {detail.completion.readyForAssessment&&!detail.completion.completed?<FinancePanel title="Eğitimi Sonuçlandır" description="Teori ve/veya pratik başarı kriterleri sağlandıktan sonra final sonucu hesaplayın."><Button disabled={action!==null} onClick={()=>void post("finalize",`/training/learner/me/assignments/${assignmentId}/finalize`,"Eğitim henüz sonuçlandırılamadı.")}>{action==="finalize"?"Hesaplanıyor...":"Sonucu Finalize Et"}</Button></FinancePanel>:null}

    {detail.result?<FinancePanel title="Değerlendirme Sonucu" description="Final assessment sonucu ve completion durumu."><div className="grid gap-3 sm:grid-cols-3"><FinanceMetric label="Teori" value={detail.result.theoryScore==null?"—":String(detail.result.theoryScore)} detail={detail.result.theoryPassed==null?"Gerekli Değil":detail.result.theoryPassed?"Başarılı":"Başarısız"} tone={detail.result.theoryPassed?"success":"neutral"}/><FinanceMetric label="Pratik" value={detail.result.practicalScore==null?"—":String(detail.result.practicalScore)} detail={detail.result.practicalPassed==null?"Gerekli Değil":detail.result.practicalPassed?"Başarılı":"Başarısız"} tone={detail.result.practicalPassed?"success":"neutral"}/><FinanceMetric label="Final" value={detail.result.finalPassed?"Başarılı":"Tamamlanmadı"} detail={formatDate(detail.result.finalizedAt)} tone={detail.result.finalPassed?"success":"warning"}/></div></FinancePanel>:null}
  </div>;
}
