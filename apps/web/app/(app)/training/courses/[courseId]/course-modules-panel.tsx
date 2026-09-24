"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { FinanceEmpty, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Lesson = { id:string; sequence:number; title:string };
type CourseModule = { id:string; sequence:number; title:string; description?:string|null; lessonIds:string[] };

type Props = {
  versionId:string;
  lessons:Lesson[];
  disabled?:boolean;
};

function errorMessage(error:unknown){
  return error instanceof ApiError?error.message:error instanceof Error?error.message:"Modül işlemi tamamlanamadı.";
}

export function CourseModulesPanel({versionId,lessons,disabled=false}:Props){
  const [modules,setModules]=useState<CourseModule[]>([]);
  const [title,setTitle]=useState("");
  const [description,setDescription]=useState("");
  const [editingId,setEditingId]=useState<string|null>(null);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    try{
      const rows=await api<CourseModule[]>(`/training/authoring/versions/${versionId}/modules`);
      setModules(rows??[]);
    }catch(requestError){setError(errorMessage(requestError));}
  },[versionId]);

  useEffect(()=>{void load();},[load]);

  const lessonModule=useMemo(()=>{
    const mapping=new Map<string,string>();
    for(const courseModule of modules)for(const lessonId of courseModule.lessonIds??[])mapping.set(lessonId,courseModule.id);
    return mapping;
  },[modules]);

  async function run(key:string,job:()=>Promise<unknown>){
    if(busy||disabled)return;
    setBusy(key);setError("");
    try{await job();await load();}
    catch(requestError){setError(errorMessage(requestError));}
    finally{setBusy(null);}
  }

  async function save(event:FormEvent){
    event.preventDefault();
    if(!title.trim())return;
    if(editingId){
      await run(`edit:${editingId}`,()=>api(`/training/authoring/modules/${editingId}`,{method:"PATCH",body:{title,description:description||null}}));
    }else{
      await run("create",()=>api(`/training/authoring/versions/${versionId}/modules`,{method:"POST",body:{title,description:description||null}}));
    }
    setEditingId(null);setTitle("");setDescription("");
  }

  function edit(courseModule:CourseModule){setEditingId(courseModule.id);setTitle(courseModule.title);setDescription(courseModule.description??"");}
  function cancelEdit(){setEditingId(null);setTitle("");setDescription("");}

  function remove(courseModule:CourseModule){
    if(!confirm(`“${courseModule.title}” modülü silinsin mi? İçindeki dersler silinmez, modülsüz duruma taşınır.`))return;
    void run(`delete:${courseModule.id}`,()=>api(`/training/authoring/modules/${courseModule.id}`,{method:"DELETE"}));
  }

  function move(courseModule:CourseModule,direction:-1|1){
    const index=modules.findIndex(item=>item.id===courseModule.id);const target=index+direction;
    if(target<0||target>=modules.length)return;
    const ids=modules.map(item=>item.id);[ids[index],ids[target]]=[ids[target],ids[index]];
    void run(`move:${courseModule.id}`,()=>api(`/training/authoring/versions/${versionId}/modules/reorder`,{method:"POST",body:{moduleIds:ids}}));
  }

  function assign(lessonId:string,moduleId:string){
    if(moduleId){
      void run(`assign:${lessonId}`,()=>api(`/training/authoring/modules/${moduleId}/lessons/${lessonId}`,{method:"POST"}));
    }else{
      void run(`assign:${lessonId}`,()=>api(`/training/authoring/lessons/${lessonId}/module`,{method:"DELETE"}));
    }
  }

  return <FinancePanel title="Modül Yapısı" description="Dersleri modüller altında gruplayın. Modüller yalnızca aktif taslak sürümde değiştirilebilir.">
    <div className="space-y-4">
      {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
      {modules.length?<div className="grid gap-3 md:grid-cols-2">{modules.map((courseModule,index)=><div key={courseModule.id} className="rounded-[16px] border border-[var(--line)] p-4">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[12px] font-semibold text-[var(--ink)]">{courseModule.sequence}. {courseModule.title}</p>{courseModule.description?<p className="mt-1 text-[10px] leading-5 text-[var(--muted)]">{courseModule.description}</p>:null}<p className="mt-2 text-[9px] uppercase tracking-[0.12em] text-[var(--muted-soft)]">{courseModule.lessonIds?.length??0} ders</p></div><div className="flex flex-wrap justify-end gap-1"><Button variant="secondary" disabled={disabled||busy!==null||index===0} onClick={()=>move(courseModule,-1)}>↑</Button><Button variant="secondary" disabled={disabled||busy!==null||index===modules.length-1} onClick={()=>move(courseModule,1)}>↓</Button><Button variant="secondary" disabled={disabled||busy!==null} onClick={()=>edit(courseModule)}>Düzenle</Button><Button variant="secondary" disabled={disabled||busy!==null} onClick={()=>remove(courseModule)}>Sil</Button></div></div>
      </div>)}</div>:<FinanceEmpty title="Henüz Modül Yok" description="Kursu bölümlere ayırmak için ilk modülü oluşturun."/>}

      <form onSubmit={save} className="grid gap-3 md:grid-cols-2"><input required value={title} onChange={e=>setTitle(e.target.value)} placeholder="Modül başlığı" className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/><input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Kısa açıklama" className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px]"/><div className="md:col-span-2 flex justify-end gap-2">{editingId?<Button type="button" variant="secondary" onClick={cancelEdit}>Vazgeç</Button>:null}<Button type="submit" disabled={disabled||busy!==null}>{editingId?"Modülü Güncelle":"Modül Ekle"}</Button></div></form>

      {lessons.length?<div className="border-t border-[var(--line)] pt-4"><p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">Ders → Modül Ataması</p><div className="space-y-2">{lessons.map(lesson=><div key={lesson.id} className="flex flex-col gap-2 rounded-[14px] border border-[var(--line)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[11px] font-medium text-[var(--ink)]">{lesson.sequence}. {lesson.title}</p><p className="mt-0.5 text-[9px] text-[var(--muted)]">{lessonModule.get(lesson.id)?"Modül içinde":"Modülsüz"}</p></div><Select value={lessonModule.get(lesson.id)??""} disabled={disabled||busy!==null} onChange={e=>assign(lesson.id,e.target.value)} className="min-h-10 min-w-[220px] rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[12px]"><option value="">Modülsüz</option>{modules.map(courseModule=><option key={courseModule.id} value={courseModule.id}>{courseModule.sequence}. {courseModule.title}</option>)}</Select></div>)}</div></div>:null}
    </div>
  </FinancePanel>;
}
