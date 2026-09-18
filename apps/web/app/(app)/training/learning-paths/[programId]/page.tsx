"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { hasPermission } from "@/lib/auth";
import { api, ApiError, type ApiOptions } from "@/lib/api";

type Course = { id:string; code:string; title:string; category:string; isActive:boolean };
type Item = { id:string; sequence:number; courseId:string; courseCode:string; courseTitle:string; category:string; isRequired:boolean; dueOffsetDays?:number|null; prerequisiteItemIds:string[] };
type Version = { id:string; version:number; status:string; title:string; publishedAt?:string|null; items:Item[] };
type Workspace = { id:string; code:string; title:string; description?:string|null; isActive:boolean; versions:Version[] };

const selectClass = "w-full rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--accent)]";

export default function LearningPathDetailPage() {
  const params = useParams<{programId:string}>();
  const programId = String(params.programId);
  const canManage = hasPermission("training","manage");
  const [data,setData] = useState<Workspace|null>(null);
  const [courses,setCourses] = useState<Course[]>([]);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const [courseId,setCourseId] = useState("");
  const [required,setRequired] = useState(true);
  const [dueOffsetDays,setDueOffsetDays] = useState("");
  const [prerequisites,setPrerequisites] = useState<Record<string,string>>({});

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [workspace, courseRows] = await Promise.all([
        api<Workspace>(`/training/learning-paths/${programId}`),
        api<Course[]>("/training/courses"),
      ]);
      setData(workspace); setCourses((courseRows ?? []).filter((course)=>course.isActive));
    } catch (e) { setError(e instanceof ApiError ? e.message : "Learning Path yüklenemedi."); }
    finally { setLoading(false); }
  },[programId]);

  useEffect(()=>{ void load(); },[load]);

  const draft = useMemo(()=>data?.versions.find((version)=>version.status==="DRAFT") ?? null,[data]);
  const published = useMemo(()=>data?.versions.find((version)=>version.status==="PUBLISHED") ?? null,[data]);
  const active = draft ?? published;

  async function mutate(path:string,options:ApiOptions={}) {
    setSaving(true); setError("");
    try { await api(path,options); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "İşlem tamamlanamadı."); }
    finally { setSaving(false); }
  }

  async function createDraft() { await mutate(`/training/programs/${programId}/versions`,{method:"POST"}); }
  async function publish() { if (draft) await mutate(`/training/programs/versions/${draft.id}/publish`,{method:"POST"}); }
  async function addCourse() {
    if (!draft || !courseId) return;
    const sequence = draft.items.length ? Math.max(...draft.items.map((item)=>item.sequence))+1 : 1;
    await mutate(`/training/programs/versions/${draft.id}/items`,{method:"POST",body:{sequence,courseId,isRequired:required,dueOffsetDays:dueOffsetDays===""?null:Number(dueOffsetDays)}});
    setCourseId(""); setDueOffsetDays("");
  }
  async function addPrerequisite(itemId:string) {
    if (!draft) return;
    const prerequisiteItemId = prerequisites[itemId];
    if (!prerequisiteItemId) return;
    await mutate(`/training/learning-paths/versions/${draft.id}/items/${itemId}/prerequisites`,{method:"POST",body:{prerequisiteItemId}});
    setPrerequisites((value)=>({...value,[itemId]:""}));
  }
  async function removePrerequisite(itemId:string, prerequisiteItemId:string) {
    if (!draft) return;
    await mutate(`/training/learning-paths/versions/${draft.id}/items/${itemId}/prerequisites/${prerequisiteItemId}`,{method:"DELETE"});
  }

  if (loading && !data) return <div className="flex min-h-[420px] items-center justify-center"><Spinner label="Learning Path çalışma alanı hazırlanıyor..." /></div>;

  return (
    <div className="mx-auto max-w-[1450px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/training/learning-paths" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">← Akademiler & Learning Paths</Link>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-soft)]">{data?.code ?? "Learning Path"}</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">{data?.title ?? "Learning Path"}</h1>
          <p className="mt-2 max-w-[900px] text-[13px] leading-6 text-[var(--muted)]">{data?.description || "Curriculum adımlarını ve prerequisite ilişkilerini yönetin."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!draft && canManage ? <Button onClick={()=>void createDraft()} disabled={saving}>Yeni Draft</Button> : null}
          {draft && canManage ? <Button onClick={()=>void publish()} disabled={saving || !draft.items.length}>v{draft.version} Yayınla</Button> : null}
          <Button variant="secondary" onClick={()=>void load()} disabled={loading}>Yenile</Button>
        </div>
      </header>

      {error ? <Alert onClose={()=>setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceMetric label="Published" value={published ? `v${published.version}` : "—"} detail={published ? `${published.items.length} curriculum adımı` : "Henüz yayın yok"} tone={published ? "success" : "warning"} />
        <FinanceMetric label="Draft" value={draft ? `v${draft.version}` : "—"} detail={draft ? `${draft.items.length} düzenlenebilir adım` : "Draft bulunmuyor"} tone={draft ? "warning" : "info"} />
        <FinanceMetric label="Zorunlu Adım" value={active?.items.filter((item)=>item.isRequired).length ?? 0} detail="Completion hesabına dahil" tone="info" />
        <FinanceMetric label="Prerequisite" value={active?.items.reduce((sum,item)=>sum+(item.prerequisiteItemIds?.length??0),0) ?? 0} detail="Tanımlı bağımlılık" tone="info" />
      </section>

      {draft && canManage ? (
        <FinancePanel title="Curriculum'a Kurs Ekle" description="Kurslar path içine sıralı adımlar olarak eklenir. Published course version, path personele atandığında pinlenir.">
          <div className="grid gap-3 lg:grid-cols-[1fr_150px_150px_auto] lg:items-end">
            <div><p className="mb-1 text-[10px] font-semibold uppercase text-[var(--muted-soft)]">Kurs</p><select className={selectClass} value={courseId} onChange={(e)=>setCourseId(e.target.value)}><option value="">Kurs seçin</option>{courses.map((course)=><option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}</select></div>
            <div><p className="mb-1 text-[10px] font-semibold uppercase text-[var(--muted-soft)]">Due Offset</p><input className={selectClass} type="number" min={0} value={dueOffsetDays} onChange={(e)=>setDueOffsetDays(e.target.value)} placeholder="Gün" /></div>
            <label className="flex h-[42px] items-center gap-2 text-[11px] font-medium text-[var(--muted)]"><input type="checkbox" checked={required} onChange={(e)=>setRequired(e.target.checked)} /> Zorunlu adım</label>
            <Button onClick={()=>void addCourse()} disabled={saving || !courseId}>Kurs Ekle</Button>
          </div>
        </FinancePanel>
      ) : null}

      <FinancePanel title={draft ? `Draft v${draft.version} Curriculum` : published ? `Published v${published.version} Curriculum` : "Curriculum"} description={draft ? "Prerequisite ilişkileri yalnız draft üzerinde değiştirilebilir." : "Yeni düzenleme için draft oluşturun."}>
        {!active?.items.length ? <FinanceEmpty title="Curriculum adımı yok" description="Draft sürüme ilk kursu ekleyerek learning path'i oluşturun." /> : (
          <div className="space-y-3">
            {active.items.map((item,index) => {
              const prerequisiteLabels = item.prerequisiteItemIds
                .map((id)=>active.items.find((candidate)=>candidate.id===id))
                .filter((candidate): candidate is Item => candidate !== undefined);
              const possiblePrerequisites = draft?.items.filter((candidate)=>candidate.id!==item.id && !item.prerequisiteItemIds.includes(candidate.id)) ?? [];
              return <div key={item.id} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface-2)] p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)]">{index+1}</div><div><p className="text-[10px] font-semibold uppercase text-[var(--accent)]">{item.courseCode} · {item.category}</p><h3 className="mt-1 text-[14px] font-semibold text-[var(--ink)]">{item.courseTitle}</h3><p className="mt-1 text-[10px] text-[var(--muted)]">{item.isRequired ? "Zorunlu" : "Opsiyonel"}{item.dueOffsetDays!=null ? ` · Atamadan +${item.dueOffsetDays} gün` : ""}</p></div></div>
                  {draft && canManage && possiblePrerequisites.length ? <div className="flex min-w-[340px] gap-2"><select className={selectClass} value={prerequisites[item.id]??""} onChange={(e)=>setPrerequisites((value)=>({...value,[item.id]:e.target.value}))}><option value="">Ön koşul seçin</option>{possiblePrerequisites.map((candidate)=><option key={candidate.id} value={candidate.id}>{candidate.sequence}. {candidate.courseTitle}</option>)}</select><Button variant="secondary" onClick={()=>void addPrerequisite(item.id)} disabled={saving || !prerequisites[item.id]}>Bağla</Button></div> : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">{prerequisiteLabels.length ? prerequisiteLabels.map((pre)=><span key={pre.id} className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[10px] text-[var(--muted)]">Ön koşul: {pre.courseCode}{draft && canManage ? <button type="button" className="font-bold text-[var(--danger)]" onClick={()=>void removePrerequisite(item.id,pre.id)}>×</button> : null}</span>) : <span className="text-[10px] text-[var(--muted-soft)]">Ön koşul yok</span>}</div>
              </div>;
            })}
          </div>
        )}
      </FinancePanel>
    </div>
  );
}
