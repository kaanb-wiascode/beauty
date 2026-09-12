"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DataView } from "@/components/data-view";
import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type StaffMember = {
  id: string;
  firstName: string;
  lastName: string;
  branchId: string;
  status: string;
  email?: string | null;
  phone?: string | null;
};

type Gap = {
  competencyId: string;
  competencyCode: string;
  competencyName: string;
  requiredLevel: number;
  currentLevel?: number | null;
  gap: number;
  latestSource?: string | null;
  lastAssessedAt?: string | null;
  weight: number;
};

type AssignmentStatus = "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "EXPIRED";
type Assignment = {
  id: string;
  status: AssignmentStatus;
  sourceType: string;
  assignedAt: string;
  dueAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  courseCode: string;
  courseTitle: string;
};

type DevelopmentPlan = {
  id: string;
  title: string;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  startDate: string;
  targetDate?: string | null;
  itemCount: number;
  completedItemCount: number;
};

type Review = {
  id: string;
  status: "OPEN" | "COMPLETED" | "CANCELLED";
  openedAt: string;
  dueAt: string;
  completedAt?: string | null;
  profileCode: string;
  profileName: string;
  profileVersion: number;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function assignmentTone(status: AssignmentStatus) {
  if (status === "COMPLETED") return "bg-[var(--success-soft)] text-[var(--success)]";
  if (status === "EXPIRED") return "bg-[var(--danger-soft)] text-[var(--danger)]";
  if (status === "IN_PROGRESS") return "bg-[var(--accent-soft)] text-[var(--accent)]";
  if (status === "CANCELLED") return "bg-[var(--surface-2)] text-[var(--muted)]";
  return "bg-[var(--warning-soft)] text-[var(--warning)]";
}

export default function StaffTrainingPage() {
  const params = useParams<{ staffId: string }>();
  const staffId = params.staffId;
  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [plans, setPlans] = useState<DevelopmentPlan[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [action, setAction] = useState<string | null>(null);
  const canManage = hasPermission("training", "manage");

  const load = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    setError("");
    try {
      const [staffRow, gapRows, assignmentRows, planRows, reviewRows] = await Promise.all([
        api<StaffMember>(`/staff/${staffId}`),
        api<Gap[]>(`/training/competencies/staff/${staffId}/gaps`),
        api<Assignment[]>(withQuery("/training/assignments", { staffId, limit: 100 })),
        api<DevelopmentPlan[]>(withQuery("/training/planning/development-plans", { staffId })),
        api<Review[]>(withQuery("/training/competency-reviews", { staffId, limit: 100 })),
      ]);
      setStaff(staffRow);
      setGaps(gapRows ?? []);
      setAssignments(assignmentRows ?? []);
      setPlans(planRows ?? []);
      setReviews(reviewRows ?? []);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Personel gelişim verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openAssignments = useMemo(
    () => assignments.filter((item) => item.status === "ASSIGNED" || item.status === "IN_PROGRESS"),
    [assignments],
  );
  const openReviews = useMemo(() => reviews.filter((item) => item.status === "OPEN"), [reviews]);
  const criticalGaps = useMemo(() => gaps.filter((item) => Number(item.gap) >= 20), [gaps]);
  const averageGap = useMemo(() => {
    if (!gaps.length) return 0;
    return Math.round(gaps.reduce((total, item) => total + Number(item.gap || 0), 0) / gaps.length);
  }, [gaps]);

  const perform = useCallback(async (key: string, job: () => Promise<unknown>, message: string) => {
    setAction(key);
    setError("");
    setSuccess("");
    try {
      await job();
      setSuccess(message);
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "İşlem tamamlanamadı.");
    } finally {
      setAction(null);
    }
  }, [load]);

  if (loading) {
    return <div className="flex min-h-[420px] items-center justify-center rounded-[22px] border border-[var(--line)] bg-[var(--surface)]"><Spinner label="Personel gelişim profili hazırlanıyor..." /></div>;
  }

  if (!staff) {
    return <Alert>Personel kaydı bulunamadı veya aktif kapsam dışında.</Alert>;
  }

  const name = `${staff.firstName} ${staff.lastName}`.trim();

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/training" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">← Learning Operations</Link>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-soft)]">Personel Gelişim Profili</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">{name}</h1>
          <p className="mt-2 max-w-[780px] text-[13px] leading-6 text-[var(--muted)]">Yetkinlik açıkları, eğitim atamaları, gelişim planları ve recurring review geçmişini aynı personel kapsamında izleyin.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void load()} disabled={action !== null}>Yenile</Button>
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {success ? <Alert tone="success" onClose={() => setSuccess("")}>{success}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceMetric label="Yetkinlik Açığı" value={averageGap ? `%${averageGap}` : "0"} detail={`${criticalGaps.length} kritik açık`} tone={criticalGaps.length ? "danger" : "success"} />
        <FinanceMetric label="Aktif Eğitim" value={openAssignments.length} detail={`${assignments.length} toplam atama`} tone={openAssignments.length ? "info" : "neutral"} />
        <FinanceMetric label="Açık Review" value={openReviews.length} detail={`${reviews.length} toplam değerlendirme`} tone={openReviews.length ? "warning" : "success"} />
        <FinanceMetric label="Gelişim Planı" value={plans.filter((item) => item.status === "ACTIVE" || item.status === "DRAFT").length} detail={`${plans.length} toplam plan`} tone="neutral" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <FinancePanel title="Yetkinlik Gap Analizi" description="Aktif competency profile gereksinimlerine karşı son ölçülen seviye.">
          {gaps.length ? (
            <DataView>
              <div className="divide-y divide-[var(--line)]">
                {gaps.map((gap) => {
                  const required = Number(gap.requiredLevel || 0);
                  const current = Number(gap.currentLevel || 0);
                  const percent = required > 0 ? Math.min(Math.round((current / required) * 100), 100) : 100;
                  return (
                    <article key={gap.competencyId} className="px-4 py-4 sm:px-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">{gap.competencyCode}</p>
                          <h3 className="mt-1 text-[13px] font-semibold text-[var(--ink)]">{gap.competencyName}</h3>
                          <p className="mt-1 text-[10px] text-[var(--muted-soft)]">Kaynak: {gap.latestSource || "Henüz ölçüm yok"} · Son ölçüm: {formatDate(gap.lastAssessedAt)}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[18px] font-semibold text-[var(--ink)]">{current} / {required}</p>
                          <p className={`mt-1 text-[10px] font-semibold ${Number(gap.gap) >= 20 ? "text-[var(--danger)]" : "text-[var(--muted)]"}`}>Gap {Number(gap.gap)}</p>
                        </div>
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${percent}%` }} /></div>
                    </article>
                  );
                })}
              </div>
            </DataView>
          ) : <FinanceEmpty title="Yetkinlik açığı yok" description="Aktif profil bulunmuyor olabilir veya tüm gereksinimler karşılanıyor." />}
        </FinancePanel>

        <FinancePanel title="Personel Bilgisi" description="Aktif kapsam ve temel iletişim bilgileri.">
          <dl className="space-y-4 text-[11px]">
            <div><dt className="text-[var(--muted-soft)]">Durum</dt><dd className="mt-1 font-semibold text-[var(--ink)]">{staff.status}</dd></div>
            <div><dt className="text-[var(--muted-soft)]">Şube</dt><dd className="mt-1 font-semibold text-[var(--ink)]">{staff.branchId}</dd></div>
            <div><dt className="text-[var(--muted-soft)]">E-posta</dt><dd className="mt-1 font-semibold text-[var(--ink)]">{staff.email || "—"}</dd></div>
            <div><dt className="text-[var(--muted-soft)]">Telefon</dt><dd className="mt-1 font-semibold text-[var(--ink)]">{staff.phone || "—"}</dd></div>
          </dl>
        </FinancePanel>
      </div>

      <FinancePanel title="Eğitim Atamaları" description="Personelin manuel, kalite ve competency-gap kaynaklı eğitim yaşam döngüsü.">
        {assignments.length ? (
          <DataView>
            <div className="divide-y divide-[var(--line)]">
              {assignments.map((item) => (
                <article key={item.id} className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_150px_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${assignmentTone(item.status)}`}>{item.status}</span>
                      <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-medium text-[var(--muted)]">{item.sourceType}</span>
                    </div>
                    <h3 className="mt-2 truncate text-[13px] font-semibold text-[var(--ink)]">{item.courseCode} · {item.courseTitle}</h3>
                    <p className="mt-1 text-[10px] text-[var(--muted-soft)]">Atandı {formatDate(item.assignedAt)} · Vade {formatDate(item.dueAt)}</p>
                  </div>
                  <div className="text-[10px] text-[var(--muted)]">{item.completedAt ? `Tamamlandı ${formatDate(item.completedAt)}` : item.startedAt ? `Başladı ${formatDate(item.startedAt)}` : "Henüz başlamadı"}</div>
                  {canManage ? (
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      {item.status === "ASSIGNED" ? <Button variant="secondary" disabled={action !== null} onClick={() => void perform(`start:${item.id}`, () => api(`/training/assignments/${item.id}/start`, { method: "POST", body: { note: "Learning Operations personel görünümünden başlatıldı." } }), "Eğitim ataması başlatıldı.")}>{action === `start:${item.id}` ? "Başlatılıyor..." : "Başlat"}</Button> : null}
                      {item.status === "IN_PROGRESS" ? <Button disabled={action !== null} onClick={() => void perform(`complete:${item.id}`, () => api(`/training/assignments/${item.id}/complete`, { method: "POST", body: { note: "Learning Operations personel görünümünden tamamlandı." } }), "Eğitim ataması tamamlandı.")}>{action === `complete:${item.id}` ? "Tamamlanıyor..." : "Tamamla"}</Button> : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </DataView>
        ) : <FinanceEmpty title="Eğitim ataması yok" description="Bu personel için henüz bir eğitim ataması bulunmuyor." />}
      </FinancePanel>

      <div className="grid gap-6 xl:grid-cols-2">
        <FinancePanel title="Recurring Reviews" description="Açık ve tamamlanmış competency review kayıtları.">
          {reviews.length ? <div className="space-y-3">{reviews.map((review) => <div key={review.id} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[12px] font-semibold text-[var(--ink)]">{review.profileCode} · {review.profileName}</p><p className="mt-1 text-[10px] text-[var(--muted-soft)]">Profil v{review.profileVersion} · Açılış {formatDate(review.openedAt)}</p></div><span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[9px] font-semibold text-[var(--muted)]">{review.status}</span></div><p className="mt-3 text-[10px] text-[var(--muted)]">Vade {formatDate(review.dueAt)}</p></div>)}</div> : <FinanceEmpty title="Review kaydı yok" description="Recurring review motoru bu personel için henüz değerlendirme açmamış." />}
        </FinancePanel>

        <FinancePanel title="Gelişim Planları" description="Personel bazlı öğrenme ve gelişim planı ilerlemesi.">
          {plans.length ? <div className="space-y-3">{plans.map((plan) => { const percent = plan.itemCount > 0 ? Math.round((plan.completedItemCount / plan.itemCount) * 100) : 0; return <div key={plan.id} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-[12px] font-semibold text-[var(--ink)]">{plan.title}</p><p className="mt-1 text-[10px] text-[var(--muted-soft)]">{plan.completedItemCount}/{plan.itemCount} öğe · {plan.status}</p></div><span className="text-[12px] font-semibold text-[var(--ink)]">%{percent}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(percent, 100)}%` }} /></div></div>; })}</div> : <FinanceEmpty title="Gelişim planı yok" description="Bu personel için henüz gelişim planı oluşturulmamış." />}
        </FinancePanel>
      </div>
    </div>
  );
}
