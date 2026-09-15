"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Select, Spinner, TextInput } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type DevelopmentPlan = {
  id: string;
  staffId: string;
  title: string;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  startDate: string;
  targetDate?: string | null;
  itemCount: number;
  completedItemCount: number;
};

type StaffMember = { id:string; firstName:string; lastName:string; branchId:string; status:string };
type StaffResponse = { data: StaffMember[] };

const STATUS_LABELS: Record<DevelopmentPlan["status"], string> = {
  DRAFT: "Taslak",
  ACTIVE: "Aktif",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal",
};

function dateOnly(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", { day:"2-digit", month:"short", year:"numeric" }).format(date);
}

export default function DevelopmentPlansPage() {
  const canManage = hasPermission("training", "manage");
  const [plans,setPlans] = useState<DevelopmentPlan[]>([]);
  const [staff,setStaff] = useState<StaffMember[]>([]);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const [success,setSuccess] = useState("");
  const [form,setForm] = useState({ staffId:"", title:"", startDate:"", targetDate:"" });

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [planRows,staffRows] = await Promise.all([
        api<DevelopmentPlan[]>("/training/planning/development-plans"),
        api<StaffResponse>(withQuery("/staff",{page:1,limit:200,status:"ACTIVE"})),
      ]);
      setPlans(planRows ?? []);
      setStaff(staffRows.data ?? []);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Gelişim planları yüklenemedi.");
    } finally { setLoading(false); }
  },[]);

  useEffect(() => { void load(); },[load]);

  const metrics = useMemo(() => ({
    active: plans.filter((item) => item.status === "ACTIVE" || item.status === "DRAFT").length,
    completed: plans.filter((item) => item.status === "COMPLETED").length,
    openItems: plans.reduce((total,item) => total + Math.max(item.itemCount-item.completedItemCount,0),0),
    people: new Set(plans.filter((item) => item.status === "ACTIVE" || item.status === "DRAFT").map((item) => item.staffId)).size,
  }),[plans]);

  async function createPlan() {
    const member = staff.find((item) => item.id === form.staffId);
    if (!member || !form.title.trim()) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      await api("/training/planning/development-plans",{
        method:"POST",
        body:{
          branchId: member.branchId,
          staffId: member.id,
          title: form.title.trim(),
          startDate: form.startDate || undefined,
          targetDate: form.targetDate || null,
        },
      });
      setForm({staffId:"",title:"",startDate:"",targetDate:""});
      setSuccess("Gelişim planı oluşturuldu.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Gelişim planı oluşturulamadı.");
    } finally { setSaving(false); }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/training" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">← Learning Operations</Link>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-soft)]">Individual Development Plans</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">Gelişim Planları</h1>
          <p className="mt-2 max-w-[900px] text-[13px] leading-6 text-[var(--muted)]">Yetkinlik açığı, kurs, akademi, koçluk, mentorluk, proje ve stretch assignment hedeflerini personel bazlı tek gelişim planında yönetin.</p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading || saving}>Yenile</Button>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {success ? <Alert tone="success" onClose={() => setSuccess("")}>{success}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceMetric label="Aktif IDP" value={metrics.active} detail={`${metrics.people} personel`} tone="info" />
        <FinanceMetric label="Açık Gelişim Maddesi" value={metrics.openItems} detail="Tamamlanmayı bekleyen hedef" tone={metrics.openItems ? "warning" : "success"} />
        <FinanceMetric label="Tamamlanan Plan" value={metrics.completed} detail="Kapatılmış gelişim döngüsü" tone="success" />
        <FinanceMetric label="Toplam Plan" value={plans.length} detail="Tüm plan geçmişi" tone="neutral" />
      </section>

      {canManage ? (
        <FinancePanel title="Yeni Gelişim Planı" description="Plan personelin aktif şube kapsamına bağlanır; plan maddeleri ayrı ekranda tanımlanır.">
          <div className="grid gap-3 xl:grid-cols-[1.1fr_1.5fr_170px_170px_auto] xl:items-end">
            <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase text-[var(--muted-soft)]">Personel</span><Select value={form.staffId} onChange={(e)=>setForm((v)=>({...v,staffId:e.target.value}))}><option value="">Personel seçin</option>{staff.map((member)=><option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>)}</Select></label>
            <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase text-[var(--muted-soft)]">Plan Başlığı</span><TextInput value={form.title} onChange={(e)=>setForm((v)=>({...v,title:e.target.value}))} placeholder="2026 Uzmanlık Gelişim Planı" /></label>
            <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase text-[var(--muted-soft)]">Başlangıç</span><TextInput type="date" value={form.startDate} onChange={(e)=>setForm((v)=>({...v,startDate:e.target.value}))} /></label>
            <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase text-[var(--muted-soft)]">Hedef Tarih</span><TextInput type="date" value={form.targetDate} onChange={(e)=>setForm((v)=>({...v,targetDate:e.target.value}))} /></label>
            <Button onClick={() => void createPlan()} disabled={saving || !form.staffId || !form.title.trim()}>{saving ? "Oluşturuluyor..." : "Plan Oluştur"}</Button>
          </div>
        </FinancePanel>
      ) : null}

      <FinancePanel title="Gelişim Planları" description="Aktif planlardan tamamlanan gelişim geçmişine kadar tüm IDP kayıtları.">
        {loading ? <div className="flex min-h-[260px] items-center justify-center"><Spinner label="Gelişim planları yükleniyor..." /></div> : !plans.length ? <FinanceEmpty title="Gelişim planı bulunamadı" description="İlk bireysel gelişim planını oluşturarak başlayın." /> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {plans.map((plan) => {
              const member = staff.find((item) => item.id === plan.staffId);
              const progress = plan.itemCount ? Math.round((plan.completedItemCount/plan.itemCount)*100) : 0;
              return <Link key={plan.id} href={`/training/development-plans/${plan.id}`} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface-2)] p-4 transition hover:border-[var(--accent)]/40">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">{member ? `${member.firstName} ${member.lastName}` : "Personel"}</p><h2 className="mt-1 truncate text-[16px] font-semibold text-[var(--ink)]">{plan.title}</h2></div><span className="rounded-full bg-[var(--surface)] px-2.5 py-1 text-[9px] font-semibold text-[var(--muted)]">{STATUS_LABELS[plan.status]}</span></div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{width:`${progress}%`}} /></div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--muted-soft)]"><span>{plan.completedItemCount}/{plan.itemCount} madde · %{progress}</span><span>{dateOnly(plan.startDate)} → {dateOnly(plan.targetDate)}</span></div>
              </Link>;
            })}
          </div>
        )}
      </FinancePanel>
    </div>
  );
}
