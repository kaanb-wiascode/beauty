"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type Course = { id:string; code:string; title:string; description?:string|null; category:string; deliveryType:string; isActive:boolean };
type CourseVersion = { id:string; version:number; status:string; title:string; description?:string|null; requiresTheory:boolean; requiresPractical:boolean; theoryPassScore?:number|null; practicalPassScore?:number|null; effectiveFrom?:string|null; effectiveTo?:string|null; publishedAt?:string|null };
type Lesson = { id:string; sequence:number; title:string; contentType:string; contentText?:string|null; contentRef?:string|null; durationMinutes?:number|null; isRequired:boolean };
type Question = { id:string; sequence:number; questionType:string; prompt:string; options?:unknown; points:number };
type Exam = { id:string; title:string; passScore:number; maxAttempts?:number|null; isActive:boolean; questions:Question[] };
type DraftDetail = CourseVersion & { lessons:Lesson[]; exams:Exam[] };

type LessonForm = { sequence:string; title:string; contentType:"TEXT"|"VIDEO"|"LINK"|"DOCUMENT"; contentText:string; contentRef:string; durationMinutes:string; isRequired:boolean };
type ExamForm = { title:string; passScore:string; maxAttempts:string };
type QuestionForm = { sequence:string; questionType:"SINGLE_CHOICE"|"MULTIPLE_CHOICE"|"TRUE_FALSE"; prompt:string; options:string; correctAnswer:string; points:string };

const EMPTY_LESSON:LessonForm={sequence:"1",title:"",contentType:"TEXT",contentText:"",contentRef:"",durationMinutes:"",isRequired:true};
const EMPTY_EXAM:ExamForm={title:"",passScore:"70",maxAttempts:"3"};
const EMPTY_QUESTION:QuestionForm={sequence:"1",questionType:"SINGLE_CHOICE",prompt:"",options:"",correctAnswer:"",points:"1"};

function message(error:unknown,fallback:string){return error instanceof ApiError?error.message:fallback;}
function dateValue(value?:string|null){return value?String(value).slice(0,10):"";}

export default function TrainingCourseAuthoringPage(){
  const params=useParams<{courseId:string}>();
  const courseId=params.courseId;
  const canManage=hasPermission("training","manage");
  const [course,setCourse]=useState<Course|null>(null);
  const [versions,setVersions]=useState<CourseVersion[]>([]);
  const [draft,setDraft]=useState<DraftDetail|null>(null);
  const [loading,setLoading]=useState(true);
  const [action,setAction]=useState<string|null>(null);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [lesson,setLesson]=useState<LessonForm>(EMPTY_LESSON);
  const [exam,setExam]=useState<ExamForm>(EMPTY_EXAM);
  const [examId,setExamId]=useState("");
  const [question,setQuestion]=useState<QuestionForm>(EMPTY_QUESTION);
  const [meta,setMeta]=useState({title:"",description:"",theoryPassScore:"70",practicalPassScore:"70",effectiveFrom:"",effectiveTo:""});

  const draftVersion=useMemo(()=>versions.find(item=>item.status==="DRAFT")??null,[versions]);
  const published=useMemo(()=>versions.find(item=>item.status==="PUBLISHED")??null,[versions]);

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const [courses,versionRows]=await Promise.all([
        api<Course[]>("/training/courses"),
        api<CourseVersion[]>(`/training/lms/courses/${courseId}/versions`),
      ]);
      const found=(courses??[]).find(item=>item.id===courseId)??null;
      setCourse(found);setVersions(versionRows??[]);
      const activeDraft=(versionRows??[]).find(item=>item.status==="DRAFT");
      if(activeDraft){
        const detail=await api<DraftDetail>(`/training/authoring/versions/${activeDraft.id}`);
        setDraft(detail);
        setMeta({
          title:detail.title??"",description:detail.description??"",
          theoryPassScore:String(detail.theoryPassScore??70),practicalPassScore:String(detail.practicalPassScore??70),
          effectiveFrom:dateValue(detail.effectiveFrom),effectiveTo:dateValue(detail.effectiveTo),
        });
        setLesson(current=>({...current,sequence:String((detail.lessons?.length??0)+1)}));
        const firstExam=detail.exams?.[0]?.id??"";setExamId(current=>detail.exams?.some(item=>item.id===current)?current:firstExam);
        const selected=detail.exams?.find(item=>item.id===(firstExam||examId));
        setQuestion(current=>({...current,sequence:String((selected?.questions?.length??0)+1)}));
      }else{
        setDraft(null);setExamId("");
      }
    }catch(requestError){setError(message(requestError,"Kurs yazarlık alanı yüklenemedi."));}
    finally{setLoading(false);}
  },[courseId,examId]);

  useEffect(()=>{void load();},[load]);

  async function run(key:string,job:()=>Promise<unknown>,successMessage:string){
    if(action)return;setAction(key);setError("");setSuccess("");
    try{await job();setSuccess(successMessage);await load();}
    catch(requestError){setError(message(requestError,"İşlem tamamlanamadı."));}
    finally{setAction(null);}
  }

  function createDraft(){return run("draft",()=>api(`/training/lms/courses/${courseId}/versions`,{method:"POST",body:{}}),"Yeni taslak sürüm oluşturuldu.");}

  async function saveMetadata(event:FormEvent){
    event.preventDefault();if(!draft)return;
    await run("meta",()=>api(`/training/authoring/versions/${draft.id}`,{method:"PATCH",body:{
      title:meta.title,description:meta.description||null,
      theoryPassScore:draft.requiresTheory?Number(meta.theoryPassScore):null,
      practicalPassScore:draft.requiresPractical?Number(meta.practicalPassScore):null,
      effectiveFrom:meta.effectiveFrom||null,effectiveTo:meta.effectiveTo||null,
    }}),"Taslak kurs bilgileri güncellendi.");
  }

  async function addLesson(event:FormEvent){
    event.preventDefault();if(!draft)return;
    await run("lesson",()=>api(`/training/lms/versions/${draft.id}/lessons`,{method:"POST",body:{
      sequence:Number(lesson.sequence),title:lesson.title,contentType:lesson.contentType,
      contentText:lesson.contentText||null,contentRef:lesson.contentRef||null,
      durationMinutes:lesson.durationMinutes?Number(lesson.durationMinutes):null,isRequired:lesson.isRequired,
    }}),"Ders taslağa eklendi.");
    setLesson(current=>({...EMPTY_LESSON,sequence:String(Number(current.sequence)+1)}));
  }

  async function addExam(event:FormEvent){
    event.preventDefault();if(!draft)return;
    await run("exam",async()=>{
      const created=await api<Exam>(`/training/lms/versions/${draft.id}/exams`,{method:"POST",body:{title:exam.title,passScore:Number(exam.passScore),maxAttempts:exam.maxAttempts?Number(exam.maxAttempts):null}});
      setExamId(created.id);
    },"Teori sınavı taslağa eklendi.");
    setExam(EMPTY_EXAM);
  }

  async function addQuestion(event:FormEvent){
    event.preventDefault();if(!examId)return;
    let options:unknown=undefined;
    let correctAnswer:unknown=question.correctAnswer;
    if(question.questionType==="TRUE_FALSE")correctAnswer=question.correctAnswer.toLowerCase()==="true";
    else{
      const parsed=question.options.split("\n").map(item=>item.trim()).filter(Boolean);
      options=parsed;
      if(question.questionType==="MULTIPLE_CHOICE")correctAnswer=question.correctAnswer.split(",").map(item=>item.trim()).filter(Boolean);
    }
    await run("question",()=>api(`/training/lms/exams/${examId}/questions`,{method:"POST",body:{sequence:Number(question.sequence),questionType:question.questionType,prompt:question.prompt,options,correctAnswer,points:Number(question.points)}}),"Soru sınava eklendi.");
    setQuestion(current=>({...EMPTY_QUESTION,sequence:String(Number(current.sequence)+1),questionType:current.questionType}));
  }

  function publish(){if(!draft)return;return run("publish",()=>api(`/training/lms/versions/${draft.id}/publish`,{method:"POST"}),`v${draft.version} yayınlandı.`);}

  if(loading)return <div className="flex min-h-[420px] items-center justify-center rounded-[22px] border border-[var(--line)] bg-[var(--surface)]"><Spinner label="Kurs Yazarlığı Hazırlanıyor..."/></div>;
  if(!course)return <FinanceEmpty title="Kurs Bulunamadı" description="Kurs şirket kapsamı dışında olabilir veya artık aktif değildir."/>;

  return <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><Link href="/training/courses" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">← Kurs Yönetimi</Link><p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-soft)]">{course.code}</p><h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">{course.title}</h1><p className="mt-2 max-w-[820px] text-[13px] leading-6 text-[var(--muted)]">Taslak sürüm metadata, ders içeriği ve teori assessment yapısını hazırlayın; yayın geçmişini değiştirmeden yeni sürümü kontrollü biçimde yayınlayın.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={action!==null} onClick={()=>void load()}>Yenile</Button>{canManage&&!draftVersion?<Button disabled={action!==null} onClick={()=>void createDraft()}>{action==="draft"?"Oluşturuluyor...":"Taslak Sürüm Oluştur"}</Button>:null}{canManage&&draft?<Button disabled={action!==null} onClick={()=>void publish()}>{action==="publish"?"Yayınlanıyor...":`v${draft.version} Yayınla`}</Button>:null}</div>
    </header>
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}{success?<Alert tone="success" onClose={()=>setSuccess("")}>{success}</Alert>:null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><FinanceMetric label="Sürüm" value={draft?`v${draft.version}`:published?`v${published.version}`:"—"} detail={draft?"Taslak Düzenleniyor":published?"Yayındaki Sürüm":"Sürüm Yok"} tone={draft?"warning":published?"success":"neutral"}/><FinanceMetric label="Ders" value={draft?.lessons.length??0} detail="Taslak İçerik" tone="info"/><FinanceMetric label="Sınav" value={draft?.exams.length??0} detail="Teori Assessment" tone="neutral"/><FinanceMetric label="Soru" value={draft?.exams.reduce((sum,item)=>sum+item.questions.length,0)??0} detail="Toplam Assessment Sorusu" tone="neutral"/></section>

    {!draft?<FinancePanel title="Taslak Bulunmuyor" description="Yayınlanmış sürümler immutable tutulur. Yeni değişiklik yapmak için yeni taslak sürüm açın."><FinanceEmpty title={published?`v${published.version} Yayında`:"Henüz Yayın Yok"} description="Taslak sürüm oluşturulduğunda içerik yazarlığı araçları burada açılacak."/></FinancePanel>:
    <div className="space-y-6">
      <FinancePanel title="Taslak Metadata" description="Başlık, açıklama, geçerlilik ve başarı eşiklerini yayın öncesinde yönetin.">
        <form className="grid gap-4 md:grid-cols-2" onSubmit={saveMetadata}>
          <label className="md:col-span-2"><span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">Sürüm Başlığı</span><input required value={meta.title} onChange={e=>setMeta(v=>({...v,title:e.target.value}))} className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px] outline-none focus:border-[var(--accent)]"/></label>
          <label className="md:col-span-2"><span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">Açıklama</span><textarea rows={4} value={meta.description} onChange={e=>setMeta(v=>({...v,description:e.target.value}))} className="w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-[13px] outline-none focus:border-[var(--accent)]"/></label>
          {draft.requiresTheory?<label><span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">Teori Başarı Puanı</span><input type="number" min="0" max="100" value={meta.theoryPassScore} onChange={e=>setMeta(v=>({...v,theoryPassScore:e.target.value}))} className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/></label>:null}
          {draft.requiresPractical?<label><span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">Pratik Başarı Puanı</span><input type="number" min="0" max="100" value={meta.practicalPassScore} onChange={e=>setMeta(v=>({...v,practicalPassScore:e.target.value}))} className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/></label>:null}
          <label><span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">Geçerlilik Başlangıcı</span><input type="date" value={meta.effectiveFrom} onChange={e=>setMeta(v=>({...v,effectiveFrom:e.target.value}))} className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/></label>
          <label><span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">Geçerlilik Bitişi</span><input type="date" value={meta.effectiveTo} onChange={e=>setMeta(v=>({...v,effectiveTo:e.target.value}))} className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/></label>
          {canManage?<div className="md:col-span-2 flex justify-end"><Button type="submit" disabled={action!==null}>{action==="meta"?"Kaydediliyor...":"Taslağı Kaydet"}</Button></div>:null}
        </form>
      </FinancePanel>

      <div className="grid gap-6 xl:grid-cols-2">
        <FinancePanel title="Dersler & İçerik" description="Metin, video, bağlantı veya private document reference ekleyin.">
          <div className="space-y-3">{draft.lessons.map(item=><div key={item.id} className="rounded-[16px] border border-[var(--line)] p-4"><div className="flex items-center justify-between gap-3"><p className="text-[12px] font-semibold text-[var(--ink)]">{item.sequence}. {item.title}</p><span className="rounded-full bg-[var(--surface-2)] px-2 py-1 text-[9px] text-[var(--muted)]">{item.contentType}</span></div><p className="mt-1 text-[10px] text-[var(--muted)]">{item.durationMinutes?`${item.durationMinutes} dk · `:""}{item.isRequired?"Zorunlu":"Opsiyonel"}</p></div>)}</div>
          {canManage?<form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={addLesson}><input required type="number" min="1" value={lesson.sequence} onChange={e=>setLesson(v=>({...v,sequence:e.target.value}))} placeholder="Sıra" className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/><input required value={lesson.title} onChange={e=>setLesson(v=>({...v,title:e.target.value}))} placeholder="Ders başlığı" className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/><select value={lesson.contentType} onChange={e=>setLesson(v=>({...v,contentType:e.target.value as LessonForm["contentType"]}))} className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"><option value="TEXT">Metin</option><option value="VIDEO">Video</option><option value="LINK">Bağlantı</option><option value="DOCUMENT">Doküman</option></select><input type="number" min="0" value={lesson.durationMinutes} onChange={e=>setLesson(v=>({...v,durationMinutes:e.target.value}))} placeholder="Süre (dk)" className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/><textarea rows={3} value={lesson.contentText} onChange={e=>setLesson(v=>({...v,contentText:e.target.value}))} placeholder="Metin içerik / açıklama" className="sm:col-span-2 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-[13px]"/><input value={lesson.contentRef} onChange={e=>setLesson(v=>({...v,contentRef:e.target.value}))} placeholder="Video/link/storage reference" className="sm:col-span-2 min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/><label className="flex items-center gap-2 text-[12px] text-[var(--muted)]"><input type="checkbox" checked={lesson.isRequired} onChange={e=>setLesson(v=>({...v,isRequired:e.target.checked}))}/> Zorunlu ders</label><div className="flex justify-end"><Button type="submit" disabled={action!==null}>{action==="lesson"?"Ekleniyor...":"Ders Ekle"}</Button></div></form>:null}
        </FinancePanel>

        <FinancePanel title="Teori Assessment" description="Teori gerektiren kurslarda sınav ve soru setini taslak sürüme bağlayın.">
          {!draft.requiresTheory?<FinanceEmpty title="Teori Sınavı Gerekmiyor" description="Bu kursun delivery type ayarı teori assessment gerektirmiyor."/>:<>
            <div className="space-y-3">{draft.exams.map(item=><button type="button" key={item.id} onClick={()=>setExamId(item.id)} className={`w-full rounded-[16px] border p-4 text-left ${examId===item.id?"border-[var(--accent)] bg-[var(--accent-soft)]":"border-[var(--line)]"}`}><div className="flex items-center justify-between gap-3"><p className="text-[12px] font-semibold text-[var(--ink)]">{item.title}</p><span className="text-[10px] text-[var(--muted)]">≥ {item.passScore} · {item.questions.length} soru</span></div></button>)}</div>
            {canManage?<form className="mt-5 grid gap-3 sm:grid-cols-3" onSubmit={addExam}><input required value={exam.title} onChange={e=>setExam(v=>({...v,title:e.target.value}))} placeholder="Sınav adı" className="sm:col-span-3 min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/><input required type="number" min="0" max="100" value={exam.passScore} onChange={e=>setExam(v=>({...v,passScore:e.target.value}))} placeholder="Başarı" className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/><input type="number" min="1" value={exam.maxAttempts} onChange={e=>setExam(v=>({...v,maxAttempts:e.target.value}))} placeholder="Deneme" className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/><Button type="submit" disabled={action!==null}>{action==="exam"?"Ekleniyor...":"Sınav Ekle"}</Button></form>:null}
            {examId&&canManage?<form className="mt-6 grid gap-3" onSubmit={addQuestion}><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">Seçili Sınava Soru Ekle</p><div className="grid gap-3 sm:grid-cols-3"><input required type="number" min="1" value={question.sequence} onChange={e=>setQuestion(v=>({...v,sequence:e.target.value}))} placeholder="Sıra" className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/><select value={question.questionType} onChange={e=>setQuestion(v=>({...v,questionType:e.target.value as QuestionForm["questionType"]}))} className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"><option value="SINGLE_CHOICE">Tek Seçim</option><option value="MULTIPLE_CHOICE">Çoklu Seçim</option><option value="TRUE_FALSE">Doğru / Yanlış</option></select><input required type="number" min="0.1" step="0.1" value={question.points} onChange={e=>setQuestion(v=>({...v,points:e.target.value}))} placeholder="Puan" className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/></div><textarea required rows={3} value={question.prompt} onChange={e=>setQuestion(v=>({...v,prompt:e.target.value}))} placeholder="Soru" className="rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-[13px]"/>{question.questionType!=="TRUE_FALSE"?<textarea rows={3} value={question.options} onChange={e=>setQuestion(v=>({...v,options:e.target.value}))} placeholder="Seçenekler — her satıra bir seçenek" className="rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-[13px]"/>:null}<input required value={question.correctAnswer} onChange={e=>setQuestion(v=>({...v,correctAnswer:e.target.value}))} placeholder={question.questionType==="TRUE_FALSE"?"true veya false":question.questionType==="MULTIPLE_CHOICE"?"Doğru cevapları virgülle ayırın":"Doğru cevap"} className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/><div className="flex justify-end"><Button type="submit" disabled={action!==null}>{action==="question"?"Ekleniyor...":"Soru Ekle"}</Button></div></form>:null}
          </>}
        </FinancePanel>
      </div>
    </div>}
  </div>;
}
