"use client";

import { Select, FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Field, Spinner, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type QuestionType="SINGLE_CHOICE"|"MULTIPLE_CHOICE"|"TRUE_FALSE";
type BankQuestion={id:string;code:string;version:number;status:"DRAFT"|"PUBLISHED"|"RETIRED";category:string;questionType:QuestionType;prompt:string;options?:unknown;correctAnswer:unknown;defaultPoints:number;tags:string[];publishedAt?:string|null;createdAt:string};
type DraftExam={id:string;title:string;passScore:number;maxAttempts?:number|null;courseVersionId:string;version:number;courseId:string;courseCode:string;courseTitle:string;questionCount:number};
type QuestionForm={code:string;category:string;questionType:QuestionType;prompt:string;options:string;correctAnswer:string;defaultPoints:string;tags:string};

const EMPTY:QuestionForm={code:"",category:"GENERAL",questionType:"SINGLE_CHOICE",prompt:"",options:"",correctAnswer:"",defaultPoints:"1",tags:""};
const STATUS:Record<BankQuestion["status"],string>={DRAFT:"Taslak",PUBLISHED:"Yayında",RETIRED:"Emekli"};

function errorMessage(error:unknown,fallback:string){return error instanceof ApiError?error.message:error instanceof Error?error.message:fallback;}
function displayAnswer(value:unknown){return Array.isArray(value)?value.map(String).join(", "):typeof value==="boolean"?(value?"Doğru":"Yanlış"):String(value??"");}
function displayOptions(value:unknown){return Array.isArray(value)?value.map(String):[];}

export default function QuestionBankPage(){
  const [questions,setQuestions]=useState<BankQuestion[]>([]);
  const [draftExams,setDraftExams]=useState<DraftExam[]>([]);
  const [form,setForm]=useState<QuestionForm>(EMPTY);
  const [status,setStatus]=useState<string>("");
  const [targetExamId,setTargetExamId]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const [questionRows,examRows]=await Promise.all([
        api<BankQuestion[]>(`/training/lms/question-bank${status?`?status=${status}`:""}`),
        api<DraftExam[]>("/training/lms/question-bank/draft-exams"),
      ]);
      setQuestions(questionRows??[]);setDraftExams(examRows??[]);
      setTargetExamId(current=>(examRows??[]).some(item=>item.id===current)?current:(examRows?.[0]?.id??""));
    }catch(requestError){setError(errorMessage(requestError,"Soru bankası yüklenemedi."));}
    finally{setLoading(false);}
  },[status]);
  useEffect(()=>{void load();},[load]);

  const published=useMemo(()=>questions.filter(item=>item.status==="PUBLISHED"),[questions]);
  const drafts=useMemo(()=>questions.filter(item=>item.status==="DRAFT"),[questions]);
  const categories=useMemo(()=>new Set(questions.map(item=>item.category)).size,[questions]);
  const targetExam=useMemo(()=>draftExams.find(item=>item.id===targetExamId)??null,[draftExams,targetExamId]);

  function payload(){
    const options=form.questionType==="TRUE_FALSE"?undefined:form.options.split("\n").map(item=>item.trim()).filter(Boolean);
    let correctAnswer:unknown=form.correctAnswer.trim();
    if(form.questionType==="TRUE_FALSE")correctAnswer=form.correctAnswer!=="false";
    if(form.questionType==="MULTIPLE_CHOICE")correctAnswer=form.correctAnswer.split(",").map(item=>item.trim()).filter(Boolean);
    return{code:form.code,category:form.category,questionType:form.questionType,prompt:form.prompt,options,correctAnswer,defaultPoints:Number(form.defaultPoints),tags:form.tags.split(",").map(item=>item.trim()).filter(Boolean)};
  }

  async function create(event:FormEvent){
    event.preventDefault();if(busy)return;setBusy("create");setError("");setSuccess("");
    try{await api("/training/lms/question-bank",{method:"POST",body:payload()});setForm(EMPTY);setSuccess("Soru taslağı oluşturuldu. Yayınlandıktan sonra course-version sınavlarında tekrar kullanılabilir.");await load();}
    catch(requestError){setError(errorMessage(requestError,"Soru oluşturulamadı."));}
    finally{setBusy(null);}
  }

  async function publish(question:BankQuestion){
    if(busy)return;setBusy(`publish:${question.id}`);setError("");setSuccess("");
    try{await api(`/training/lms/question-bank/${question.id}/publish`,{method:"POST"});setSuccess(`${question.code} v${question.version} yayınlandı.`);await load();}
    catch(requestError){setError(errorMessage(requestError,"Soru yayınlanamadı."));}
    finally{setBusy(null);}
  }

  async function addToExam(question:BankQuestion){
    if(!targetExam||busy)return;setBusy(`attach:${question.id}`);setError("");setSuccess("");
    try{const result=await api<{duplicate?:boolean}>(`/training/lms/question-bank/${question.id}/exams/${targetExam.id}`,{method:"POST",body:{sequence:targetExam.questionCount+1,points:question.defaultPoints}});setSuccess(result.duplicate?"Bu soru sürümü seçili sınavda zaten bulunuyor.":`${question.code} v${question.version}, ${targetExam.courseCode} · ${targetExam.title} sınavına snapshot olarak eklendi.`);await load();}
    catch(requestError){setError(errorMessage(requestError,"Soru sınava eklenemedi."));}
    finally{setBusy(null);}
  }

  if(loading)return <div className="flex min-h-[420px] items-center justify-center rounded-[22px] border border-[var(--line)] bg-[var(--surface)]"><Spinner label="Versioned Soru Bankası Hazırlanıyor..."/></div>;

  return <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
    <header><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-soft)]">Assessment Consolidation</p><h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">Soru Bankası</h1><p className="mt-2 max-w-[880px] text-[13px] leading-6 text-[var(--muted)]">Reusable ve versioned soruları yönetin. Yayınlanmış banka soruları draft course-version sınavlarına immutable snapshot olarak eklenir; learner grading tek LMS assessment motoru üzerinden çalışır.</p></header>
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}{success?<Alert tone="success" onClose={()=>setSuccess("")}>{success}</Alert>:null}
    <section className="grid gap-3 sm:grid-cols-4"><FinanceMetric label="Gösterilen" value={questions.length} detail="Bank Question Version" tone="neutral"/><FinanceMetric label="Yayında" value={published.length} detail="Reusable" tone="success"/><FinanceMetric label="Taslak" value={drafts.length} detail="Yayın Bekliyor" tone={drafts.length?"warning":"neutral"}/><FinanceMetric label="Kategori" value={categories} detail="Aktif Görünüm" tone="info"/></section>

    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <FinancePanel title="Yeni Banka Sorusu" description="Aynı code için yeni kayıt yeni version üretir; yayınlama önceki published version'ı RETIRED yapar."><form onSubmit={create} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Soru Kodu" required><TextInput required value={form.code} onChange={event=>setForm({...form,code:event.target.value})} placeholder="HYGIENE-001"/></Field><Field label="Kategori"><TextInput value={form.category} onChange={event=>setForm({...form,category:event.target.value})} placeholder="HYGIENE"/></Field></div>
        <Field label="Soru Tipi"><Select className="control h-11 w-full" value={form.questionType} onChange={event=>setForm({...form,questionType:event.target.value as QuestionType,correctAnswer:event.target.value==="TRUE_FALSE"?"true":""})}><option value="SINGLE_CHOICE">Tek Seçim</option><option value="MULTIPLE_CHOICE">Çoklu Seçim</option><option value="TRUE_FALSE">Doğru / Yanlış</option></Select></Field>
        <Field label="Soru Metni" required><textarea required className="control min-h-[100px] w-full resize-y" value={form.prompt} onChange={event=>setForm({...form,prompt:event.target.value})}/></Field>
        {form.questionType!=="TRUE_FALSE"?<Field label="Seçenekler"><textarea className="control min-h-[110px] w-full resize-y" value={form.options} onChange={event=>setForm({...form,options:event.target.value})} placeholder={"Her satıra bir seçenek\nA\nB\nC"}/></Field>:null}
        {form.questionType==="TRUE_FALSE"?<Field label="Doğru Cevap"><Select className="control h-11 w-full" value={form.correctAnswer||"true"} onChange={event=>setForm({...form,correctAnswer:event.target.value})}><option value="true">Doğru</option><option value="false">Yanlış</option></Select></Field>:<Field label={form.questionType==="MULTIPLE_CHOICE"?"Doğru Cevaplar (virgülle)":"Doğru Cevap"} required><TextInput required value={form.correctAnswer} onChange={event=>setForm({...form,correctAnswer:event.target.value})}/></Field>}
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Varsayılan Puan"><TextInput type="number" min="0.1" step="0.1" value={form.defaultPoints} onChange={event=>setForm({...form,defaultPoints:event.target.value})}/></Field><Field label="Etiketler"><TextInput value={form.tags} onChange={event=>setForm({...form,tags:event.target.value})} placeholder="hijyen, güvenlik"/></Field></div>
        <div className="flex justify-end"><Button type="submit" disabled={busy!==null}>{busy==="create"?"Kaydediliyor...":"Taslak Soru Oluştur"}</Button></div>
      </form></FinancePanel>

      <FinancePanel title="Course-Version Sınavına Bağla" description="Yalnızca DRAFT course version üzerindeki LMS sınavları hedeflenebilir."><div className="space-y-4"><Field label="Hedef Sınav"><Select className="control h-11 w-full" value={targetExamId} onChange={event=>setTargetExamId(event.target.value)}><option value="">Draft sınav seçin</option>{draftExams.map(exam=><option key={exam.id} value={exam.id}>{exam.courseCode} · {exam.courseTitle} · v{exam.version} · {exam.title} ({exam.questionCount} soru)</option>)}</Select></Field>{targetExam?<Alert tone="success">Seçili hedef: {targetExam.courseCode} v{targetExam.version} / {targetExam.title}. Banka sorusu eklendiğinde cevap ve seçenekler bu sürüme snapshot olarak kopyalanır.</Alert>:<FinanceEmpty title="Draft Sınav Yok" description="Önce Kurs Yazarlığı alanında theory exam oluşturun."/>}</div></FinancePanel>
    </div>

    <FinancePanel title="Versioned Soru Kataloğu" description="Taslak, yayınlanmış ve emekli sürümleri tek katalogdan yönetin."><div className="mb-4 flex flex-wrap gap-2">{["","DRAFT","PUBLISHED","RETIRED"].map(value=><Button key={value||"ALL"} variant={status===value?"primary":"secondary"} onClick={()=>setStatus(value)}>{value?STATUS[value as BankQuestion["status"]]:"Tümü"}</Button>)}</div><div className="space-y-3">{questions.length?questions.map(question=>{const options=displayOptions(question.options);return <article key={question.id} className="rounded-[18px] border border-[var(--line)] p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">{question.code} · v{question.version}</span><span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[9px] font-semibold text-[var(--muted)]">{STATUS[question.status]}</span><span className="text-[9px] font-medium text-[var(--muted-soft)]">{question.category}</span></div><p className="mt-2 text-[13px] font-semibold leading-6 text-[var(--ink)]">{question.prompt}</p>{options.length?<div className="mt-3 flex flex-wrap gap-2">{options.map(option=><span key={option} className="rounded-[10px] border border-[var(--line)] px-2.5 py-1.5 text-[10px] text-[var(--muted)]">{option}</span>)}</div>:null}<p className="mt-3 text-[10px] text-[var(--muted-soft)]">{question.questionType} · {question.defaultPoints} puan · Cevap: {displayAnswer(question.correctAnswer)}{question.tags?.length?` · ${question.tags.join(", ")}`:""}</p></div><div className="flex shrink-0 flex-wrap gap-2">{question.status==="DRAFT"?<Button disabled={busy!==null} onClick={()=>void publish(question)}>{busy===`publish:${question.id}`?"Yayınlanıyor...":"Yayınla"}</Button>:null}{question.status==="PUBLISHED"?<Button variant="secondary" disabled={!targetExam||busy!==null} onClick={()=>void addToExam(question)}>{busy===`attach:${question.id}`?"Ekleniyor...":"Sınava Ekle"}</Button>:null}</div></div></article>}):<FinanceEmpty title="Soru Bulunmuyor" description="Seçili filtre için banka sorusu bulunmuyor."/>}</div></FinancePanel>
  </div>;
}
