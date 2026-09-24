"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { FinanceEmpty } from "@/components/finance-view";
import { Alert, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { CourseModulesPanel } from "../course-modules-panel";

type Course = { id:string; code:string; title:string; isActive:boolean };
type CourseVersion = { id:string; version:number; status:string };
type Lesson = { id:string; sequence:number; title:string };
type DraftDetail = CourseVersion & { lessons:Lesson[] };

function message(error:unknown){return error instanceof ApiError?error.message:error instanceof Error?error.message:"Modül çalışma alanı yüklenemedi.";}

export default function TrainingCourseModulesPage(){
  const params=useParams<{courseId:string}>();
  const courseId=params.courseId;
  const canManage=hasPermission("training","manage");
  const [course,setCourse]=useState<Course|null>(null);
  const [draft,setDraft]=useState<DraftDetail|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const [courses,versions]=await Promise.all([
        api<Course[]>("/training/courses"),
        api<CourseVersion[]>(`/training/lms/courses/${courseId}/versions`),
      ]);
      const found=(courses??[]).find(item=>item.id===courseId)??null;
      setCourse(found);
      const draftVersion=(versions??[]).find(item=>item.status==="DRAFT")??null;
      if(found?.isActive&&draftVersion&&canManage){
        setDraft(await api<DraftDetail>(`/training/authoring/versions/${draftVersion.id}`));
      }else setDraft(null);
    }catch(requestError){setError(message(requestError));}
    finally{setLoading(false);}
  },[canManage,courseId]);

  useEffect(()=>{void load();},[load]);

  if(loading)return <div className="flex min-h-[420px] items-center justify-center rounded-[22px] border border-[var(--line)] bg-[var(--surface)]"><Spinner label="Modül yapısı hazırlanıyor..."/></div>;
  if(!course)return <FinanceEmpty title="Kurs Bulunamadı" description="Kurs şirket kapsamı dışında olabilir."/>;

  return <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
    <header><Link href="/training/courses" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">← Kurs Yönetimi</Link><p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-soft)]">{course.code}</p><h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">{course.title} · Modüller</h1><p className="mt-2 max-w-[820px] text-[13px] leading-6 text-[var(--muted)]">Kurs derslerini öğrenme modülleri altında gruplayın, modül sırasını yönetin ve dersleri modüller arasında taşıyın.</p></header>
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
    {!canManage?<FinanceEmpty title="Yalnızca görüntüleme" description="Modül içeriklerini düzenlemek için eğitim yönetimi yetkisi gerekir."/>:!course.isActive?<FinanceEmpty title="Kurs arşivde" description="Modül yapısı yalnızca aktif kursun taslak sürümünde değiştirilebilir."/>:!draft?<FinanceEmpty title="Aktif taslak yok" description="Önce İçerik ve değerlendirme sekmesinden yeni bir taslak sürüm oluşturun."/>:<CourseModulesPanel versionId={draft.id} lessons={draft.lessons}/>} 
  </div>;
}
