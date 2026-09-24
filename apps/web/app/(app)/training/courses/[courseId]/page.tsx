"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type Course = { id:string; code:string; title:string; description?:string|null; category:string; deliveryType:string; isActive:boolean };
type CourseVersion = { id:string; version:number; status:string; title:string; description?:string|null; requiresTheory:boolean; requiresPractical:boolean; theoryPassScore?:number|null; practicalPassScore?:number|null; effectiveFrom?:string|null; effectiveTo?:string|null; publishedAt?:string|null };
type Lesson = { id:string; sequence:number; title:string; contentType:string; contentText?:string|null; contentRef?:string|null; durationMinutes?:number|null; isRequired:boolean };
type Question = { id:string; sequence:number; questionType:string; prompt:string; options?:unknown; correctAnswer?:unknown; points:number };
type Exam = { id:string; title:string; passScore:number; maxAttempts?:number|null; isActive:boolean; questions:Question[] };
type DraftDetail = CourseVersion & { lessons:Lesson[]; exams:Exam[] };
type UploadPreparation = { objectKey:string; uploadUrl:string; method:"PUT"; requiredHeaders?:Record<string,string>; maxBytes:number };
type VerifiedDocument = { objectKey:string; verified:boolean };

type LessonForm = { title:string; contentType:"TEXT"|"VIDEO"|"LINK"|"DOCUMENT"; contentText:string; contentRef:string; durationMinutes:string; isRequired:boolean };
type ExamForm = { title:string; passScore:string; maxAttempts:string; isActive:boolean };
type QuestionForm = { questionType:"SINGLE_CHOICE"|"MULTIPLE_CHOICE"|"TRUE_FALSE"; prompt:string; options:string; correctAnswer:string; points:string };

const EMPTY_LESSON:LessonForm={title:"",contentType:"TEXT",contentText:"",contentRef:"",durationMinutes:"",isRequired:true};
const EMPTY_EXAM:ExamForm={title:"",passScore:"70",maxAttempts:"3",isActive:true};
const EMPTY_QUESTION:QuestionForm={questionType:"SINGLE_CHOICE",prompt:"",options:"",correctAnswer:"",points:"1"};

function message(error:unknown,fallback:string){return error instanceof ApiError?error.message:error instanceof Error?error.message:fallback;}
function dateValue(value?:string|null){return value?String(value).slice(0,10):"";}
function questionOptions(value:unknown){return Array.isArray(value)?value.map(String).join("\n"):"";}
function answerValue(value:unknown){return Array.isArray(value)?value.map(String).join(", "):typeof value==="boolean"?String(value):value==null?"":String(value);}

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
  const [lessonFile,setLessonFile]=useState<File|null>(null);
  const [editingLessonId,setEditingLessonId]=useState<string|null>(null);
  const [exam,setExam]=useState<ExamForm>(EMPTY_EXAM);
  const [examId,setExamId]=useState("");
  const [editingExamId,setEditingExamId]=useState<string|null>(null);
  const [question,setQuestion]=useState<QuestionForm>(EMPTY_QUESTION);
  const [editingQuestionId,setEditingQuestionId]=useState<string|null>(null);
  const [meta,setMeta]=useState({title:"",description:"",theoryPassScore:"70",practicalPassScore:"70",effectiveFrom:"",effectiveTo:""});

  const draftVersion=useMemo(()=>versions.find(item=>item.status==="DRAFT")??null,[versions]);
  const published=useMemo(()=>versions.find(item=>item.status==="PUBLISHED")??null,[versions]);
  const selectedExam=useMemo(()=>draft?.exams.find(item=>item.id===examId)??null,[draft,examId]);

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
      if(activeDraft&&found?.isActive&&canManage){
        const detail=await api<DraftDetail>(`/training/authoring/versions/${activeDraft.id}`);
        setDraft(detail);
        setMeta({title:detail.title??"",description:detail.description??"",theoryPassScore:String(detail.theoryPassScore??70),practicalPassScore:String(detail.practicalPassScore??70),effectiveFrom:dateValue(detail.effectiveFrom),effectiveTo:dateValue(detail.effectiveTo)});
        setExamId(current=>detail.exams.some(item=>item.id===current)?current:(detail.exams[0]?.id??""));
      }else{setDraft(null);setExamId("");}
    }catch(requestError){setError(message(requestError,"Kurs yazarlık alanı yüklenemedi."));}
    finally{setLoading(false);}
  },[canManage,courseId]);

  useEffect(()=>{void load();},[load]);

  async function run(key:string,job:()=>Promise<unknown>,successMessage:string){
    if(action)return;setAction(key);setError("");setSuccess("");
    try{await job();setSuccess(successMessage);await load();}
    catch(requestError){setError(message(requestError,"İşlem tamamlanamadı."));}
    finally{setAction(null);}
  }

  function createDraft(){return run("draft",()=>api(`/training/lms/courses/${courseId}/versions`,{method:"POST",body:{}}),"Yeni taslak sürüm oluşturuldu.");}
  function publish(){if(!draft)return;return run("publish",()=>api(`/training/lms/versions/${draft.id}/publish`,{method:"POST"}),`Sürüm ${draft.version} yayınlandı.`);}
  function archiveCourse(){if(!course||!confirm(`${course.code} kursu arşivlensin mi? Aktif taslak ve yayındaki sürümler kullanımdan kaldırılacak.`))return;return run("archive",()=>api(`/training/courses/${course.id}/archive`,{method:"POST"}),"Kurs arşivlendi ve aktif sürümleri emekliye ayrıldı.");}
  function restoreCourse(){if(!course)return;return run("restore",()=>api(`/training/courses/${course.id}/restore`,{method:"POST"}),"Kurs yeniden aktifleştirildi. Yeni değişiklikler için yeni taslak sürüm oluşturabilirsiniz.");}

  async function saveMetadata(event:FormEvent){
    event.preventDefault();if(!draft)return;
    await run("meta",()=>api(`/training/authoring/versions/${draft.id}`,{method:"PATCH",body:{title:meta.title,description:meta.description||null,theoryPassScore:draft.requiresTheory?Number(meta.theoryPassScore):null,practicalPassScore:draft.requiresPractical?Number(meta.practicalPassScore):null,effectiveFrom:meta.effectiveFrom||null,effectiveTo:meta.effectiveTo||null}}),"Taslak kurs bilgileri güncellendi.");
  }

  async function uploadDocument(versionId:string,file:File){
    const prepared=await api<UploadPreparation>(`/training/content/versions/${versionId}/documents/prepare`,{method:"POST",body:{filename:file.name,mimeType:file.type||"application/octet-stream",byteSize:file.size}});
    const response=await fetch(prepared.uploadUrl,{method:"PUT",headers:prepared.requiredHeaders??{},body:file});
    if(!response.ok)throw new Error("Doküman yüklenemedi. Lütfen tekrar deneyin.");
    const verified=await api<VerifiedDocument>(`/training/content/versions/${versionId}/documents/verify`,{method:"POST",body:{objectKey:prepared.objectKey}});
    if(!verified.verified)throw new Error("Yüklenen doküman doğrulanamadı.");
    return verified.objectKey;
  }

  async function saveLesson(event:FormEvent){
    event.preventDefault();if(!draft)return;
    const key=editingLessonId?`lesson-edit:${editingLessonId}`:"lesson-create";
    setAction(key);setError("");setSuccess("");
    try{
      let contentRef=lesson.contentRef||null;
      if(lesson.contentType==="DOCUMENT"&&lessonFile)contentRef=await uploadDocument(draft.id,lessonFile);
      if(lesson.contentType==="DOCUMENT"&&!contentRef)throw new Error("Doküman dersi için bir dosya seçin.");
      if(editingLessonId){
        await api(`/training/authoring/lessons/${editingLessonId}`,{method:"PATCH",body:{title:lesson.title,contentType:lesson.contentType,contentText:lesson.contentText||null,contentRef,durationMinutes:lesson.durationMinutes?Number(lesson.durationMinutes):null,isRequired:lesson.isRequired}});
        setSuccess("Ders güncellendi.");
      }else{
        await api(`/training/authoring/versions/${draft.id}/lessons`,{method:"POST",body:{sequence:draft.lessons.length+1,title:lesson.title,contentType:lesson.contentType,contentText:lesson.contentText||null,contentRef,durationMinutes:lesson.durationMinutes?Number(lesson.durationMinutes):null,isRequired:lesson.isRequired}});
        setSuccess("Ders taslağa eklendi.");
      }
      setLesson(EMPTY_LESSON);setLessonFile(null);setEditingLessonId(null);await load();
    }catch(requestError){setError(message(requestError,"Ders kaydedilemedi."));}
    finally{setAction(null);}
  }

  function editLesson(item:Lesson){setEditingLessonId(item.id);setLesson({title:item.title,contentType:item.contentType as LessonForm["contentType"],contentText:item.contentText??"",contentRef:item.contentRef??"",durationMinutes:item.durationMinutes==null?"":String(item.durationMinutes),isRequired:item.isRequired});setLessonFile(null);}
  function cancelLessonEdit(){setEditingLessonId(null);setLesson(EMPTY_LESSON);setLessonFile(null);}
  function deleteLesson(item:Lesson){if(!confirm(`“${item.title}” dersi silinsin mi?`))return;return run(`lesson-delete:${item.id}`,()=>api(`/training/authoring/lessons/${item.id}`,{method:"DELETE"}),"Ders silindi.");}
  function moveLesson(item:Lesson,direction:-1|1){if(!draft)return;const index=draft.lessons.findIndex(row=>row.id===item.id);const target=index+direction;if(target<0||target>=draft.lessons.length)return;const ids=draft.lessons.map(row=>row.id);[ids[index],ids[target]]=[ids[target],ids[index]];return run(`lesson-move:${item.id}`,()=>api(`/training/authoring/versions/${draft.id}/lessons/reorder`,{method:"POST",body:{lessonIds:ids}}),"Ders sırası güncellendi.");}

  async function saveExam(event:FormEvent){
    event.preventDefault();if(!draft)return;
    if(editingExamId){await run(`exam-edit:${editingExamId}`,()=>api(`/training/authoring/exams/${editingExamId}`,{method:"PATCH",body:{title:exam.title,passScore:Number(exam.passScore),maxAttempts:exam.maxAttempts?Number(exam.maxAttempts):null,isActive:exam.isActive}}),"Sınav güncellendi.");setEditingExamId(null);setExam(EMPTY_EXAM);return;}
    let createdId="";
    await run("exam-create",async()=>{const created=await api<Exam>(`/training/lms/versions/${draft.id}/exams`,{method:"POST",body:{title:exam.title,passScore:Number(exam.passScore),maxAttempts:exam.maxAttempts?Number(exam.maxAttempts):null}});createdId=created.id;},"Teori sınavı taslağa eklendi.");
    if(createdId)setExamId(createdId);setExam(EMPTY_EXAM);
  }
  function editExam(item:Exam){setEditingExamId(item.id);setExam({title:item.title,passScore:String(item.passScore),maxAttempts:item.maxAttempts==null?"":String(item.maxAttempts),isActive:item.isActive});}
  function cancelExamEdit(){setEditingExamId(null);setExam(EMPTY_EXAM);}
  function deleteExam(item:Exam){if(!confirm(`“${item.title}” sınavı ve tüm soruları silinsin mi?`))return;return run(`exam-delete:${item.id}`,()=>api(`/training/authoring/exams/${item.id}`,{method:"DELETE"}),"Sınav silindi.");}

  function parseQuestionForm(form:QuestionForm){
    let options:unknown=undefined;let correctAnswer:unknown=form.correctAnswer;
    if(form.questionType==="TRUE_FALSE")correctAnswer=form.correctAnswer!=="false";
    else{options=form.options.split("\n").map(item=>item.trim()).filter(Boolean);if(form.questionType==="MULTIPLE_CHOICE")correctAnswer=form.correctAnswer.split(",").map(item=>item.trim()).filter(Boolean);}
    return {questionType:form.questionType,prompt:form.prompt,options,correctAnswer,points:Number(form.points)};
  }
  async function saveQuestion(event:FormEvent){
    event.preventDefault();if(!examId)return;const payload=parseQuestionForm(question);
    if(editingQuestionId){await run(`question-edit:${editingQuestionId}`,()=>api(`/training/authoring/questions/${editingQuestionId}`,{method:"PATCH",body:payload}),"Soru güncellendi.");setEditingQuestionId(null);setQuestion(EMPTY_QUESTION);return;}
    const sequence=(selectedExam?.questions.length??0)+1;
    await run("question-create",()=>api(`/training/lms/exams/${examId}/questions`,{method:"POST",body:{sequence,...payload}}),"Soru sınava eklendi.");setQuestion(EMPTY_QUESTION);
  }
  function editQuestion(item:Question){setEditingQuestionId(item.id);setQuestion({questionType:item.questionType as QuestionForm["questionType"],prompt:item.prompt,options:questionOptions(item.options),correctAnswer:answerValue(item.correctAnswer),points:String(item.points)});}
  function cancelQuestionEdit(){setEditingQuestionId(null);setQuestion(EMPTY_QUESTION);}
  function deleteQuestion(item:Question){if(!confirm("Bu soru silinsin mi?"))return;return run(`question-delete:${item.id}`,()=>api(`/training/authoring/questions/${item.id}`,{method:"DELETE"}),"Soru silindi.");}
  function moveQuestion(item:Question,direction:-1|1){if(!selectedExam)return;const index=selectedExam.questions.findIndex(row=>row.id===item.id);const target=index+direction;if(target<0||target>=selectedExam.questions.length)return;const ids=selectedExam.questions.map(row=>row.id);[ids[index],ids[target]]=[ids[target],ids[index]];return run(`question-move:${item.id}`,()=>api(`/training/authoring/exams/${selectedExam.id}/questions/reorder`,{method:"POST",body:{questionIds:ids}}),"Soru sırası güncellendi.");}

  if(loading)return <div className="flex min-h-[420px] items-center justify-center rounded-[22px] border border-[var(--line)] bg-[var(--surface)]"><Spinner label="Kurs Yazarlığı Hazırlanıyor..."/></div>;
  if(!course)return <FinanceEmpty title="Kurs Bulunamadı" description="Kurs şirket kapsamı dışında olabilir."/>;

  return <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><Link href="/training/courses" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">← Kurs Yönetimi</Link><p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-soft)]">{course.code}</p><div className="mt-1 flex flex-wrap items-center gap-3"><h1 className="text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">{course.title}</h1><span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${course.isActive?"bg-[var(--success-soft)] text-[var(--success)]":"bg-[var(--surface-2)] text-[var(--muted)]"}`}>{course.isActive?"Aktif":"Arşiv"}</span></div><p className="mt-2 max-w-[820px] text-[13px] leading-6 text-[var(--muted)]">Taslak kurs bilgilerini, ders materyallerini ve teori sınavını hazırlayın; geçmiş yayınları değiştirmeden yeni sürümü kontrollü biçimde yayınlayın.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={action!==null} onClick={()=>void load()}>Yenile</Button>{canManage&&course.isActive&&!draftVersion?<Button disabled={action!==null} onClick={()=>void createDraft()}>{action==="draft"?"Oluşturuluyor...":"Taslak Sürüm Oluştur"}</Button>:null}{canManage&&draft?<Button disabled={action!==null} onClick={()=>void publish()}>{action==="publish"?"Yayınlanıyor...":`Sürüm ${draft.version} Yayınla`}</Button>:null}{canManage&&course.isActive?<Button variant="secondary" disabled={action!==null} onClick={()=>void archiveCourse()}>{action==="archive"?"Arşivleniyor...":"Kursu Arşivle"}</Button>:canManage?<Button disabled={action!==null} onClick={()=>void restoreCourse()}>{action==="restore"?"Aktifleştiriliyor...":"Kursu Aktifleştir"}</Button>:null}</div>
    </header>
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}{success?<Alert tone="success" onClose={()=>setSuccess("")}>{success}</Alert>:null}
    {!course.isActive?<Alert>Bu kurs arşivde. Aktif taslak ve yayındaki sürümler kullanımdan kaldırılmıştır. Yeni taslak oluşturmak için kursu yeniden aktifleştirin.</Alert>:null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><FinanceMetric label="Sürüm" value={draft?`Sürüm ${draft.version}`:published?`Sürüm ${published.version}`:"—"} detail={draft?"Taslak Düzenleniyor":published?"Yayındaki Sürüm":course.isActive?"Sürüm Yok":"Arşiv"} tone={draft?"warning":published?"success":"neutral"}/><FinanceMetric label="Ders" value={draft?.lessons.length??0} detail="Taslak İçerik" tone="info"/><FinanceMetric label="Sınav" value={draft?.exams.length??0} detail="Teori Sınavı" tone="neutral"/><FinanceMetric label="Soru" value={draft?.exams.reduce((sum,item)=>sum+item.questions.length,0)??0} detail="Toplam Soru" tone="neutral"/></section>

    {!draft?<FinancePanel title="Taslak Bulunmuyor" description="Yayınlanmış ve kullanımdan kaldırılmış sürümler sonradan değiştirilemez."><FinanceEmpty title={!course.isActive?"Kurs Arşivde":published?`Sürüm ${published.version} Yayında`:"Henüz Yayın Yok"} description={!course.isActive?"Kursu yeniden aktifleştirerek yeni bir taslak sürüm açabilirsiniz.":"Yeni değişiklik yapmak için taslak sürüm oluşturun."}/></FinancePanel>:
    <div className="space-y-6">
      <FinancePanel title="Taslak Kurs Bilgileri" description="Başlık, açıklama, geçerlilik ve başarı eşiklerini yayın öncesinde yönetin.">
        <form className="grid gap-4 md:grid-cols-2" onSubmit={saveMetadata}><label className="md:col-span-2"><span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">Sürüm Başlığı</span><input required value={meta.title} onChange={e=>setMeta(v=>({...v,title:e.target.value}))} className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px] outline-none focus:border-[var(--accent)]"/></label><label className="md:col-span-2"><span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">Açıklama</span><textarea rows={4} value={meta.description} onChange={e=>setMeta(v=>({...v,description:e.target.value}))} className="w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-[13px] outline-none focus:border-[var(--accent)]"/></label>{draft.requiresTheory?<label><span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">Teori Başarı Puanı</span><input type="number" min="0" max="100" value={meta.theoryPassScore} onChange={e=>setMeta(v=>({...v,theoryPassScore:e.target.value}))} className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/></label>:null}{draft.requiresPractical?<label><span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">Pratik Başarı Puanı</span><input type="number" min="0" max="100" value={meta.practicalPassScore} onChange={e=>setMeta(v=>({...v,practicalPassScore:e.target.value}))} className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/></label>:null}<label><span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">Geçerlilik Başlangıcı</span><input type="date" value={meta.effectiveFrom} onChange={e=>setMeta(v=>({...v,effectiveFrom:e.target.value}))} className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/></label><label><span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">Geçerlilik Bitişi</span><input type="date" value={meta.effectiveTo} onChange={e=>setMeta(v=>({...v,effectiveTo:e.target.value}))} className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/></label><div className="md:col-span-2 flex justify-end"><Button type="submit" disabled={action!==null}>{action==="meta"?"Kaydediliyor...":"Taslağı Kaydet"}</Button></div></form>
      </FinancePanel>

      <div className="grid gap-6 xl:grid-cols-2">
        <FinancePanel title="Dersler & Materyaller" description="Dersleri sıralayın; metin, video, bağlantı veya doğrulanmış private doküman ekleyin.">
          <div className="space-y-3">{draft.lessons.length?draft.lessons.map((item,index)=><div key={item.id} className="rounded-[16px] border border-[var(--line)] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[12px] font-semibold text-[var(--ink)]">{item.sequence}. {item.title}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{item.contentType} · {item.durationMinutes?`${item.durationMinutes} dk · `:""}{item.isRequired?"Zorunlu":"Opsiyonel"}</p></div><div className="flex flex-wrap justify-end gap-1"><Button variant="secondary" disabled={action!==null||index===0} onClick={()=>void moveLesson(item,-1)}>↑</Button><Button variant="secondary" disabled={action!==null||index===draft.lessons.length-1} onClick={()=>void moveLesson(item,1)}>↓</Button><Button variant="secondary" disabled={action!==null} onClick={()=>editLesson(item)}>Düzenle</Button><Button variant="secondary" disabled={action!==null} onClick={()=>void deleteLesson(item)}>Sil</Button></div></div></div>):<FinanceEmpty title="Henüz Ders Yok" description="İlk dersi aşağıdaki formdan ekleyin."/>}</div>
          <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={saveLesson}><input required value={lesson.title} onChange={e=>setLesson(v=>({...v,title:e.target.value}))} placeholder="Ders başlığı" className="sm:col-span-2 min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/><Select value={lesson.contentType} onChange={e=>{setLesson(v=>({...v,contentType:e.target.value as LessonForm["contentType"],contentRef:""}));setLessonFile(null);}} className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"><option value="TEXT">Metin</option><option value="VIDEO">Video</option><option value="LINK">Bağlantı</option><option value="DOCUMENT">Private Doküman</option></Select><input type="number" min="0" value={lesson.durationMinutes} onChange={e=>setLesson(v=>({...v,durationMinutes:e.target.value}))} placeholder="Süre (dk)" className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/><textarea rows={3} value={lesson.contentText} onChange={e=>setLesson(v=>({...v,contentText:e.target.value}))} placeholder="Metin içerik / açıklama" className="sm:col-span-2 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-[13px]"/>{lesson.contentType==="DOCUMENT"?<label className="sm:col-span-2 block"><span className="mb-2 block text-[11px] text-[var(--muted)]">Private materyal dosyası</span><input type="file" onChange={e=>setLessonFile(e.target.files?.[0]??null)} className="block w-full text-[12px] text-[var(--muted)]"/>{editingLessonId&&lesson.contentRef&&!lessonFile?<span className="mt-1 block text-[10px] text-[var(--muted-soft)]">Mevcut doğrulanmış doküman korunacak.</span>:null}</label>:lesson.contentType!=="TEXT"?<input required value={lesson.contentRef} onChange={e=>setLesson(v=>({...v,contentRef:e.target.value}))} placeholder={lesson.contentType==="VIDEO"?"Video URL":"Bağlantı URL"} className="sm:col-span-2 min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/>:null}<label className="flex items-center gap-2 text-[12px] text-[var(--muted)]"><input type="checkbox" checked={lesson.isRequired} onChange={e=>setLesson(v=>({...v,isRequired:e.target.checked}))}/> Zorunlu ders</label><div className="flex justify-end gap-2">{editingLessonId?<Button type="button" variant="secondary" onClick={cancelLessonEdit}>Vazgeç</Button>:null}<Button type="submit" disabled={action!==null}>{action?.startsWith("lesson")?"Kaydediliyor...":editingLessonId?"Dersi Güncelle":"Ders Ekle"}</Button></div></form>
        </FinancePanel>

        <FinancePanel title="Teori Sınavı" description="Sınavları ve soruları düzenleyin; soru sırası yayın öncesinde değiştirilebilir.">
          {!draft.requiresTheory?<FinanceEmpty title="Teori Sınavı Gerekmiyor" description="Bu eğitim için teori sınavı gerekmiyor."/>:<>
            <div className="space-y-3">{draft.exams.map(item=><div key={item.id} className={`rounded-[16px] border p-4 ${examId===item.id?"border-[var(--accent)] bg-[var(--accent-soft)]":"border-[var(--line)]"}`}><button type="button" onClick={()=>{setExamId(item.id);cancelQuestionEdit();}} className="w-full text-left"><div className="flex items-center justify-between gap-3"><p className="text-[12px] font-semibold text-[var(--ink)]">{item.title}</p><span className="text-[10px] text-[var(--muted)]">≥ {item.passScore} · {item.questions.length} soru · {item.isActive?"Aktif":"Pasif"}</span></div></button><div className="mt-3 flex justify-end gap-2"><Button variant="secondary" disabled={action!==null} onClick={()=>editExam(item)}>Düzenle</Button><Button variant="secondary" disabled={action!==null} onClick={()=>void deleteExam(item)}>Sil</Button></div></div>)}</div>
            <form className="mt-5 grid gap-3 sm:grid-cols-3" onSubmit={saveExam}><input required value={exam.title} onChange={e=>setExam(v=>({...v,title:e.target.value}))} placeholder="Sınav adı" className="sm:col-span-3 min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/><input required type="number" min="0" max="100" value={exam.passScore} onChange={e=>setExam(v=>({...v,passScore:e.target.value}))} placeholder="Başarı" className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/><input type="number" min="1" value={exam.maxAttempts} onChange={e=>setExam(v=>({...v,maxAttempts:e.target.value}))} placeholder="Deneme" className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/><label className="flex items-center gap-2 text-[11px] text-[var(--muted)]"><input type="checkbox" checked={exam.isActive} onChange={e=>setExam(v=>({...v,isActive:e.target.checked}))}/> Aktif</label><div className="sm:col-span-3 flex justify-end gap-2">{editingExamId?<Button type="button" variant="secondary" onClick={cancelExamEdit}>Vazgeç</Button>:null}<Button type="submit" disabled={action!==null}>{editingExamId?"Sınavı Güncelle":"Sınav Ekle"}</Button></div></form>
            {selectedExam?<div className="mt-6 space-y-3"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">{selectedExam.title} · Sorular</p>{selectedExam.questions.length?selectedExam.questions.map((item,index)=><div key={item.id} className="rounded-[14px] border border-[var(--line)] p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold text-[var(--ink)]">{item.sequence}. {item.prompt}</p><p className="mt-1 text-[9px] text-[var(--muted)]">{item.questionType} · {item.points} puan</p></div><div className="flex flex-wrap justify-end gap-1"><Button variant="secondary" disabled={action!==null||index===0} onClick={()=>void moveQuestion(item,-1)}>↑</Button><Button variant="secondary" disabled={action!==null||index===selectedExam.questions.length-1} onClick={()=>void moveQuestion(item,1)}>↓</Button><Button variant="secondary" disabled={action!==null} onClick={()=>editQuestion(item)}>Düzenle</Button><Button variant="secondary" disabled={action!==null} onClick={()=>void deleteQuestion(item)}>Sil</Button></div></div></div>):<FinanceEmpty title="Soru Yok" description="Yayınlama için aktif teori sınavında en az bir soru gereklidir."/>}</div>:null}
            {examId?<form className="mt-6 grid gap-3" onSubmit={saveQuestion}><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">{editingQuestionId?"Soruyu Düzenle":"Seçili Sınava Soru Ekle"}</p><div className="grid gap-3 sm:grid-cols-2"><Select value={question.questionType} onChange={e=>setQuestion(v=>({...v,questionType:e.target.value as QuestionForm["questionType"],correctAnswer:e.target.value==="TRUE_FALSE"?(v.correctAnswer||"true"):v.correctAnswer}))} className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"><option value="SINGLE_CHOICE">Tek Seçim</option><option value="MULTIPLE_CHOICE">Çoklu Seçim</option><option value="TRUE_FALSE">Doğru / Yanlış</option></Select><input required type="number" min="0.1" step="0.1" value={question.points} onChange={e=>setQuestion(v=>({...v,points:e.target.value}))} placeholder="Puan" className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/></div><textarea required rows={3} value={question.prompt} onChange={e=>setQuestion(v=>({...v,prompt:e.target.value}))} placeholder="Soru metni" className="rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-[13px]"/>{question.questionType!=="TRUE_FALSE"?<textarea required rows={3} value={question.options} onChange={e=>setQuestion(v=>({...v,options:e.target.value}))} placeholder="Seçenekler — her satıra bir seçenek" className="rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-[13px]"/>:null}{question.questionType==="TRUE_FALSE"?<Select value={question.correctAnswer||"true"} onChange={e=>setQuestion(v=>({...v,correctAnswer:e.target.value}))} className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"><option value="true">Doğru</option><option value="false">Yanlış</option></Select>:<input required value={question.correctAnswer} onChange={e=>setQuestion(v=>({...v,correctAnswer:e.target.value}))} placeholder={question.questionType==="MULTIPLE_CHOICE"?"Doğru cevaplar, virgülle ayırın":"Doğru cevap"} className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/>}<div className="flex justify-end gap-2">{editingQuestionId?<Button type="button" variant="secondary" onClick={cancelQuestionEdit}>Vazgeç</Button>:null}<Button type="submit" disabled={action!==null}>{editingQuestionId?"Soruyu Güncelle":"Soru Ekle"}</Button></div></form>:null}
          </>}
        </FinancePanel>
      </div>
    </div>}
  </div>;
}
