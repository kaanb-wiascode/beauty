"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Question={id:string;sequence:number;questionType:"SINGLE_CHOICE"|"MULTIPLE_CHOICE"|"TRUE_FALSE";prompt:string;options?:unknown;points:number};
type Attempt={id:string;attemptNo:number;score:number;passed:boolean;submittedAt:string};
type Exam={id:string;title:string;passScore:number;maxAttempts?:number|null;questions:Question[];attempts:Attempt[];attemptCount:number;attemptsRemaining?:number|null};
type SubmitResult={id?:string;attemptNo?:number;score:number;passed:boolean;submittedAt?:string};

function errorMessage(error:unknown,fallback:string){return error instanceof ApiError?error.message:error instanceof Error?error.message:fallback;}
function optionsOf(value:unknown):string[]{if(Array.isArray(value))return value.map(String);if(value&&typeof value==="object")return Object.entries(value as Record<string,unknown>).map(([key,val])=>`${key}: ${String(val)}`);return [];}

export default function LearnerExamPage(){
  const params=useParams<{assignmentId:string;examId:string}>();
  const {assignmentId,examId}=params;
  const [exam,setExam]=useState<Exam|null>(null);
  const [answers,setAnswers]=useState<Record<string,unknown>>({});
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);
  const [result,setResult]=useState<SubmitResult|null>(null);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{setLoading(true);setError("");try{setExam(await api<Exam>(`/training/learner/me/assignments/${assignmentId}/exams/${examId}`));}catch(requestError){setError(errorMessage(requestError,"Sınav yüklenemedi."));}finally{setLoading(false);}},[assignmentId,examId]);
  useEffect(()=>{void load();},[load]);

  const unanswered=useMemo(()=>exam?.questions.filter(question=>answers[question.id]===undefined||(Array.isArray(answers[question.id])&&(answers[question.id] as unknown[]).length===0)).length??0,[answers,exam]);
  const exhausted=exam?.attemptsRemaining===0;

  function setMultiple(questionId:string,option:string,checked:boolean){setAnswers(current=>{const existing=Array.isArray(current[questionId])?current[questionId] as string[]:[];const next=checked?[...new Set([...existing,option])]:existing.filter(item=>item!==option);return{...current,[questionId]:next};});}

  async function submit(){if(!exam||unanswered>0||submitting||exhausted)return;setSubmitting(true);setError("");try{const response=await api<SubmitResult>(`/training/learner/me/assignments/${assignmentId}/exams/${examId}/attempts`,{method:"POST",body:{answers}});setResult(response);await load();}catch(requestError){setError(errorMessage(requestError,"Sınav gönderilemedi."));}finally{setSubmitting(false);}}

  if(loading)return <div className="flex min-h-[420px] items-center justify-center rounded-[22px] border border-[var(--line)] bg-[var(--surface)]"><Spinner label="Sınav Hazırlanıyor..."/></div>;
  if(!exam)return <div className="space-y-4"><Link href={`/training/my-learning/${assignmentId}`} className="text-[12px] font-semibold text-[var(--accent)]">← Eğitime Dön</Link>{error?<Alert>{error}</Alert>:null}</div>;

  return <div className="mx-auto max-w-[980px] space-y-6 pb-10">
    <header><Link href={`/training/my-learning/${assignmentId}`} className="text-[11px] font-semibold text-[var(--accent)] hover:underline">← Eğitime Dön</Link><p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-soft)]">Assessment</p><h1 className="mt-1 text-[30px] font-semibold tracking-[-0.04em] text-[var(--ink)]">{exam.title}</h1><p className="mt-2 text-[13px] text-[var(--muted)]">Başarı puanı ≥ {exam.passScore}. Cevap anahtarı hiçbir zaman istemciye gönderilmez; değerlendirme sunucuda yapılır.</p></header>
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
    {result?<Alert tone={result.passed?"success":"error"}>Son deneme: %{Number(result.score).toFixed(1)} — {result.passed?"Başarılı":"Başarısız"}.</Alert>:null}
    <section className="grid gap-3 sm:grid-cols-3"><FinanceMetric label="Soru" value={exam.questions.length} detail={`${unanswered} cevapsız`} tone={unanswered?"warning":"success"}/><FinanceMetric label="Deneme" value={exam.attemptCount} detail={exam.attemptsRemaining==null?"Sınırsız":`${exam.attemptsRemaining} hak kaldı`} tone={exhausted?"warning":"neutral"}/><FinanceMetric label="Başarı Barajı" value={`%${exam.passScore}`} detail={exam.attempts.some(attempt=>attempt.passed)?"Başarılı deneme var":"Henüz tamamlanmadı"} tone={exam.attempts.some(attempt=>attempt.passed)?"success":"neutral"}/></section>
    <FinancePanel title="Sorular" description="Tüm soruları yanıtladıktan sonra sınavı gönderin."><div className="space-y-5">{exam.questions.map(question=>{const options=optionsOf(question.options);return <div key={question.id} className="rounded-[18px] border border-[var(--line)] p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-soft)]">Soru {question.sequence} · {question.points} puan</p><p className="mt-2 text-[13px] font-semibold leading-6 text-[var(--ink)]">{question.prompt}</p></div></div><div className="mt-4 space-y-2">{question.questionType==="TRUE_FALSE"?<>{[true,false].map(value=><label key={String(value)} className="flex cursor-pointer items-center gap-3 rounded-[12px] border border-[var(--line)] px-3 py-2 text-[12px] text-[var(--ink)]"><input type="radio" name={question.id} checked={answers[question.id]===value} onChange={()=>setAnswers(current=>({...current,[question.id]:value}))}/>{value?"Doğru":"Yanlış"}</label>)}</>:question.questionType==="MULTIPLE_CHOICE"?options.map(option=><label key={option} className="flex cursor-pointer items-center gap-3 rounded-[12px] border border-[var(--line)] px-3 py-2 text-[12px] text-[var(--ink)]"><input type="checkbox" checked={Array.isArray(answers[question.id])&&(answers[question.id] as string[]).includes(option)} onChange={event=>setMultiple(question.id,option,event.target.checked)}/>{option}</label>):options.map(option=><label key={option} className="flex cursor-pointer items-center gap-3 rounded-[12px] border border-[var(--line)] px-3 py-2 text-[12px] text-[var(--ink)]"><input type="radio" name={question.id} checked={answers[question.id]===option} onChange={()=>setAnswers(current=>({...current,[question.id]:option}))}/>{option}</label>)}</div></div>})}</div></FinancePanel>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[11px] text-[var(--muted)]">{unanswered?`${unanswered} soru daha yanıtlanmalı.`:"Tüm sorular yanıtlandı."}</p><Button disabled={Boolean(unanswered)||submitting||exhausted} onClick={()=>void submit()}>{submitting?"Değerlendiriliyor...":exhausted?"Deneme Hakkı Bitti":"Sınavı Gönder"}</Button></div>
    {exam.attempts.length?<FinancePanel title="Deneme Geçmişi" description="Önceki sınav denemeleriniz."><div className="space-y-2">{exam.attempts.map(attempt=><div key={attempt.id} className="flex items-center justify-between rounded-[12px] border border-[var(--line)] px-3 py-2 text-[11px]"><span className="text-[var(--muted)]">Deneme #{attempt.attemptNo}</span><span className="font-semibold text-[var(--ink)]">%{Number(attempt.score).toFixed(1)} · {attempt.passed?"Başarılı":"Başarısız"}</span></div>)}</div></FinancePanel>:null}
  </div>;
}
