"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DataView } from "@/components/data-view";
import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type Course = {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  category: string;
  deliveryType: string;
  isActive: boolean;
};

type AssignmentStatus = "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "EXPIRED";
type Assignment = {
  id: string;
  branchId: string;
  branchName?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  sourceType: string;
  status: AssignmentStatus;
  assignedAt: string;
  dueAt?: string | null;
  completedAt?: string | null;
  courseId: string;
  courseCode: string;
  courseTitle: string;
};

type TrainingSession = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  capacity?: number | null;
  location?: string | null;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  branchId: string;
  courseCode: string;
  courseTitle: string;
  enrolledCount: number;
};

type DevelopmentPlan = {
  id: string;
  staffId: string;
  title: string;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  startDate: string;
  targetDate?: string | null;
  ownerUserId?: string | null;
  itemCount: number;
  completedItemCount: number;
};

type ActionKey = "expired" | "quality-rules" | "refresh" | null;

const STATUS_LABELS: Record<AssignmentStatus, string> = {
  ASSIGNED: "Atandı",
  IN_PROGRESS: "Devam ediyor",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal edildi",
  EXPIRED: "Süresi doldu",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
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

function sessionTone(status: TrainingSession["status"]) {
  if (status === "COMPLETED") return "bg-[var(--success-soft)] text-[var(--success)]";
  if (status === "IN_PROGRESS") return "bg-[var(--accent-soft)] text-[var(--accent)]";
  if (status === "CANCELLED") return "bg-[var(--surface-2)] text-[var(--muted)]";
  return "bg-[var(--warning-soft)] text-[var(--warning)]";
}

export default function TrainingOperationsPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [plans, setPlans] = useState<DevelopmentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [action, setAction] = useState<ActionKey>(null);
  const canManage = hasPermission("training", "manage");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const from = new Date();
      const to = new Date(from.getTime() + 30 * 86400000);
      const [courseRows, assignmentRows, sessionRows, planRows] = await Promise.all([
        api<Course[]>("/training/courses"),
        api<Assignment[]>(withQuery("/training/assignments", { limit: 100 })),
        api<TrainingSession[]>(withQuery("/training/planning/calendar", { from: from.toISOString(), to: to.toISOString() })),
        api<DevelopmentPlan[]>("/training/planning/development-plans"),
      ]);
      setCourses(courseRows ?? []);
      setAssignments(assignmentRows ?? []);
      setSessions(sessionRows ?? []);
      setPlans(planRows ?? []);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Eğitim ve yetkinlik verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openAssignments = useMemo(
    () => assignments.filter((item) => item.status === "ASSIGNED" || item.status === "IN_PROGRESS"),
    [assignments],
  );
  const expiredAssignments = useMemo(() => assignments.filter((item) => item.status === "EXPIRED"), [assignments]);
  const activePlans = useMemo(() => plans.filter((item) => item.status === "ACTIVE" || item.status === "DRAFT"), [plans]);
  const upcomingSessions = useMemo(
    () => sessions.filter((item) => item.status === "SCHEDULED" || item.status === "IN_PROGRESS"),
    [sessions],
  );
  const dueSoon = useMemo(() => {
    const limit = Date.now() + 7 * 86400000;
    return openAssignments.filter((item) => item.dueAt && new Date(item.dueAt).getTime() <= limit).length;
  }, [openAssignments]);

  const run = useCallback(async (key: Exclude<ActionKey, null>, job: () => Promise<unknown>, message: string) => {
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

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-soft)]">Eğitim, LMS & Yetkinlik</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">Learning Operations</h1>
          <p className="mt-2 max-w-[820px] text-[13px] leading-6 text-[var(--muted)]">
            Eğitim atamalarını, yaklaşan oturumları, gelişim planlarını ve kurs kataloğunu tek operasyon ekranından izleyin. Kalite ve yetkinlik motorlarının oluşturduğu atamalar aynı yaşam döngüsünde görünür.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void run("refresh", () => Promise.resolve(), "Eğitim verileri yenilendi.")} disabled={loading || action !== null}>
            {action === "refresh" ? "Yenileniyor..." : "Yenile"}
          </Button>
          {canManage ? (
            <>
              <Button
                variant="secondary"
                disabled={action !== null}
                onClick={() => void run("expired", () => api("/training/assignments/process-expired", { method: "POST", body: { limit: 100 } }), "Süresi geçen eğitim atamaları işlendi.")}
              >
                {action === "expired" ? "Taranıyor..." : "Süre Aşımı Taraması"}
              </Button>
              <Button
                disabled={action !== null}
                onClick={() => void run("quality-rules", () => api("/training/quality-rules/process", { method: "POST", body: { limit: 100 } }), "Kalite kaynaklı eğitim kuralları işlendi.")}
              >
                {action === "quality-rules" ? "İşleniyor..." : "Kalite Kurallarını Çalıştır"}
              </Button>
            </>
          ) : null}
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {success ? <Alert tone="success" onClose={() => setSuccess("")}>{success}</Alert> : null}

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
          <Spinner label="Learning Operations hazırlanıyor..." />
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FinanceMetric label="Aktif Atama" value={openAssignments.length} detail={`${dueSoon} atama 7 gün içinde vadeli`} tone={dueSoon ? "warning" : "info"} />
            <FinanceMetric label="Yaklaşan Oturum" value={upcomingSessions.length} detail="Önümüzdeki 30 gün" tone="info" />
            <FinanceMetric label="Aktif Gelişim Planı" value={activePlans.length} detail={`${plans.length} toplam plan`} tone="neutral" />
            <FinanceMetric label="Süresi Dolan" value={expiredAssignments.length} detail="Takip gerektiren atamalar" tone={expiredAssignments.length ? "danger" : "success"} />
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.85fr)]">
            <FinancePanel title="Eğitim Atamaları" description="Manuel, kalite kuralı ve yetkinlik açığı kaynaklı son eğitim atamaları.">
              {assignments.length ? (
                <DataView>
                  <div className="divide-y divide-[var(--line)]">
                    {assignments.slice(0, 20).map((item) => (
                      <article key={item.id} className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_150px_130px] lg:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${assignmentTone(item.status)}`}>{STATUS_LABELS[item.status]}</span>
                            <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-medium text-[var(--muted)]">{item.sourceType}</span>
                          </div>
                          <h3 className="mt-2 truncate text-[13px] font-semibold text-[var(--ink)]">{item.courseCode} · {item.courseTitle}</h3>
                          <p className="mt-1 truncate text-[10px] text-[var(--muted-soft)]">{item.staffName || "Şube kapsamlı atama"} · {item.branchName || item.branchId}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">Atanma</p>
                          <p className="mt-1 text-[11px] font-medium text-[var(--ink)]">{formatDate(item.assignedAt)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">Son Tarih</p>
                          <p className="mt-1 text-[11px] font-medium text-[var(--ink)]">{formatDate(item.dueAt)}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </DataView>
              ) : <FinanceEmpty title="Eğitim ataması yok" description="Atamalar oluşturulduğunda burada görünecek." />}
            </FinancePanel>

            <FinancePanel title="Yaklaşan Eğitim Takvimi" description="Planlanan ve devam eden sınıf/operasyon oturumları.">
              {upcomingSessions.length ? (
                <div className="space-y-3">
                  {upcomingSessions.slice(0, 8).map((session) => (
                    <div key={session.id} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-semibold text-[var(--ink)]">{session.title}</p>
                          <p className="mt-1 truncate text-[10px] text-[var(--muted)]">{session.courseCode} · {session.courseTitle}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-semibold ${sessionTone(session.status)}`}>{session.status}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[10px] text-[var(--muted-soft)]">
                        <span>{formatDate(session.startsAt)}</span>
                        <span>{session.enrolledCount}/{session.capacity ?? "∞"} katılımcı</span>
                      </div>
                      {session.location ? <p className="mt-2 truncate text-[10px] text-[var(--muted)]">{session.location}</p> : null}
                    </div>
                  ))}
                </div>
              ) : <FinanceEmpty title="Yaklaşan oturum yok" description="Önümüzdeki 30 gün için planlanmış eğitim oturumu bulunmuyor." />}
            </FinancePanel>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <FinancePanel title="Gelişim Planları" description="Personel bazlı competency/course/program/action gelişim planlarının ilerleme görünümü.">
              {plans.length ? (
                <div className="space-y-3">
                  {plans.slice(0, 10).map((plan) => {
                    const percent = plan.itemCount > 0 ? Math.round((plan.completedItemCount / plan.itemCount) * 100) : 0;
                    return (
                      <div key={plan.id} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-semibold text-[var(--ink)]">{plan.title}</p>
                            <p className="mt-1 text-[10px] text-[var(--muted-soft)]">{plan.completedItemCount}/{plan.itemCount} öğe tamamlandı</p>
                          </div>
                          <span className="text-[12px] font-semibold text-[var(--ink)]">%{percent}</span>
                        </div>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(percent, 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <FinanceEmpty title="Gelişim planı yok" description="Personel gelişim planları oluşturulduğunda burada takip edilecek." />}
            </FinancePanel>

            <FinancePanel title="Kurs Kataloğu" description="Aktif LMS kursları ve teslim modeli.">
              {courses.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {courses.filter((course) => course.isActive).slice(0, 12).map((course) => (
                    <div key={course.id} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">{course.code}</p>
                          <p className="mt-1 line-clamp-2 text-[12px] font-semibold text-[var(--ink)]">{course.title}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-1 text-[9px] font-medium text-[var(--muted)]">{course.deliveryType}</span>
                      </div>
                      <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">{course.category}</p>
                    </div>
                  ))}
                </div>
              ) : <FinanceEmpty title="Aktif kurs yok" description="Kurs kataloğu oluşturulduğunda burada görünür." />}
            </FinancePanel>
          </div>
        </>
      )}
    </div>
  );
}
