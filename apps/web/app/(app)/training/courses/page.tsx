"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type Course = {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  category: string;
  deliveryType: string;
  isActive: boolean;
  createdAt?: string;
};

type CourseVersion = {
  id: string;
  version: number;
  status: "DRAFT" | "PUBLISHED" | "RETIRED" | string;
  title: string;
  description?: string | null;
  deliveryType: string;
  theoryPassScore?: number | null;
  practicalPassScore?: number | null;
  requiresTheory: boolean;
  requiresPractical: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  publishedAt?: string | null;
  createdAt?: string;
};

type CourseForm = {
  code: string;
  title: string;
  description: string;
  category: string;
  deliveryType: string;
};

const EMPTY_FORM: CourseForm = {
  code: "",
  title: "",
  description: "",
  category: "SERVICE",
  deliveryType: "BLENDED",
};

const CATEGORY_LABELS: Record<string, string> = {
  SERVICE: "Hizmet",
  SALES: "Satış",
  CUSTOMER_EXPERIENCE: "Müşteri Deneyimi",
  CORPORATE: "Kurumsal",
  MANAGEMENT: "Yönetim",
  QUALITY: "Kalite",
  OTHER: "Diğer",
};

const DELIVERY_LABELS: Record<string, string> = {
  THEORY: "Teorik",
  PRACTICAL: "Pratik",
  BLENDED: "Karma",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function statusTone(status: string) {
  if (status === "PUBLISHED") return "bg-[var(--success-soft)] text-[var(--success)]";
  if (status === "DRAFT") return "bg-[var(--warning-soft)] text-[var(--warning)]";
  return "bg-[var(--surface-2)] text-[var(--muted)]";
}

function statusLabel(status: string) {
  if (status === "PUBLISHED") return "Yayında";
  if (status === "DRAFT") return "Taslak";
  if (status === "RETIRED") return "Emekli";
  return status;
}

export default function TrainingCoursesPage() {
  const canManage = hasPermission("training", "manage");
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [versions, setVersions] = useState<CourseVersion[]>([]);
  const [form, setForm] = useState<CourseForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [versionAction, setVersionAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );

  const draftVersion = useMemo(
    () => versions.find((version) => version.status === "DRAFT") ?? null,
    [versions],
  );

  const publishedVersion = useMemo(
    () => versions.find((version) => version.status === "PUBLISHED") ?? null,
    [versions],
  );

  const loadCourses = useCallback(async (preferredCourseId?: string) => {
    setLoading(true);
    setError("");
    try {
      const rows = await api<Course[]>("/training/courses");
      const next = rows ?? [];
      setCourses(next);
      setSelectedCourseId((current) => {
        if (preferredCourseId && next.some((course) => course.id === preferredCourseId)) return preferredCourseId;
        if (current && next.some((course) => course.id === current)) return current;
        return next[0]?.id ?? "";
      });
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Kurslar yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadVersions = useCallback(async (courseId: string) => {
    if (!courseId) {
      setVersions([]);
      return;
    }
    setVersionsLoading(true);
    setError("");
    try {
      const rows = await api<CourseVersion[]>(`/training/lms/courses/${courseId}/versions`);
      setVersions(rows ?? []);
    } catch (requestError) {
      setVersions([]);
      setError(requestError instanceof ApiError ? requestError.message : "Kurs sürümleri yüklenemedi.");
    } finally {
      setVersionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    void loadVersions(selectedCourseId);
  }, [loadVersions, selectedCourseId]);

  async function createCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const created = await api<Course>("/training/courses", {
        method: "POST",
        body: {
          code: form.code,
          title: form.title,
          description: form.description || null,
          category: form.category,
          deliveryType: form.deliveryType,
        },
      });
      setForm(EMPTY_FORM);
      setSuccess(`${created.code} kodlu kurs oluşturuldu.`);
      await loadCourses(created.id);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Kurs oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function createDraftVersion() {
    if (!selectedCourse || !canManage || versionAction) return;
    setVersionAction("create");
    setError("");
    setSuccess("");
    try {
      const created = await api<CourseVersion>(`/training/lms/courses/${selectedCourse.id}/versions`, {
        method: "POST",
        body: {},
      });
      setSuccess(`v${created.version} taslak sürümü oluşturuldu.`);
      await loadVersions(selectedCourse.id);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Taslak sürüm oluşturulamadı.");
    } finally {
      setVersionAction(null);
    }
  }

  async function publishVersion(version: CourseVersion) {
    if (!selectedCourse || !canManage || versionAction || version.status !== "DRAFT") return;
    setVersionAction(version.id);
    setError("");
    setSuccess("");
    try {
      await api(`/training/lms/versions/${version.id}/publish`, { method: "POST" });
      setSuccess(`v${version.version} yayınlandı. Önceki yayınlanmış sürüm varsa otomatik olarak emekliye ayrıldı.`);
      await loadVersions(selectedCourse.id);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Kurs sürümü yayınlanamadı.");
    } finally {
      setVersionAction(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
        <Spinner label="Kurs Yönetimi Hazırlanıyor..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-soft)]">Öğrenme</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">Kurs Yönetimi</h1>
          <p className="mt-2 max-w-[820px] text-[13px] leading-6 text-[var(--muted)]">
            Kurs kataloğunu yönetin, taslak sürümler oluşturun ve hazır içerikleri kontrollü biçimde yayınlayın.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void loadCourses(selectedCourseId)} disabled={saving || versionAction !== null}>
          Yenile
        </Button>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {success ? <Alert tone="success" onClose={() => setSuccess("")}>{success}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceMetric label="Toplam Kurs" value={courses.length} detail="Şirket Kataloğu" tone="info" />
        <FinanceMetric label="Aktif Kurs" value={courses.filter((course) => course.isActive).length} detail="Kullanılabilir Kurs" tone="success" />
        <FinanceMetric label="Seçili Kurs Sürümü" value={versions.length} detail={selectedCourse?.code ?? "Kurs Seçilmedi"} tone="neutral" />
        <FinanceMetric label="Yayın Durumu" value={publishedVersion ? `v${publishedVersion.version}` : "—"} detail={publishedVersion ? "Güncel Yayın" : "Henüz Yayın Yok"} tone={publishedVersion ? "success" : "warning"} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.72fr)_minmax(0,1.28fr)]">
        <FinancePanel title="Kurs Kataloğu" description="Kursu seçerek metadata ve sürüm geçmişini görüntüleyin.">
          {courses.length ? (
            <div className="space-y-2">
              {courses.map((course) => {
                const active = course.id === selectedCourseId;
                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => setSelectedCourseId(course.id)}
                    className={`w-full rounded-[16px] border p-4 text-left transition-colors ${active ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-[var(--ink)]">{course.code} · {course.title}</p>
                        <p className="mt-1 text-[10px] text-[var(--muted)]">{CATEGORY_LABELS[course.category] ?? course.category} · {DELIVERY_LABELS[course.deliveryType] ?? course.deliveryType}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-semibold ${course.isActive ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>
                        {course.isActive ? "Aktif" : "Arşiv"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <FinanceEmpty title="Henüz Kurs Yok" description="İlk kursu sağdaki formdan oluşturabilirsiniz." />
          )}
        </FinancePanel>

        <div className="space-y-6">
          <FinancePanel title="Kurs Detayı" description="Seçili kursun temel metadata ve sürüm yönetimi.">
            {selectedCourse ? (
              <div className="space-y-5">
                <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">{selectedCourse.code}</p>
                      <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.025em] text-[var(--ink)]">{selectedCourse.title}</h2>
                      <p className="mt-2 max-w-[760px] text-[12px] leading-5 text-[var(--muted)]">{selectedCourse.description || "Açıklama eklenmemiş."}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[10px]">
                      <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 font-medium text-[var(--muted)]">{CATEGORY_LABELS[selectedCourse.category] ?? selectedCourse.category}</span>
                      <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 font-medium text-[var(--muted)]">{DELIVERY_LABELS[selectedCourse.deliveryType] ?? selectedCourse.deliveryType}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-[13px] font-semibold text-[var(--ink)]">Kurs Sürümleri</h3>
                    <p className="mt-1 text-[10px] text-[var(--muted)]">Yayınlanan sürümler immutable geçmiş olarak korunur; yeni değişiklikler yeni taslak sürüm üzerinden ilerler.</p>
                  </div>
                  {canManage ? (
                    <Button variant="secondary" disabled={versionAction !== null || Boolean(draftVersion)} onClick={() => void createDraftVersion()}>
                      {versionAction === "create" ? "Oluşturuluyor..." : draftVersion ? "Taslak Mevcut" : "Yeni Taslak Sürüm"}
                    </Button>
                  ) : null}
                </div>

                {versionsLoading ? (
                  <Spinner label="Sürümler Yükleniyor..." />
                ) : versions.length ? (
                  <div className="space-y-3">
                    {versions.map((version) => (
                      <article key={version.id} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${statusTone(version.status)}`}>{statusLabel(version.status)}</span>
                              <span className="text-[11px] font-semibold text-[var(--ink)]">v{version.version}</span>
                            </div>
                            <p className="mt-2 truncate text-[13px] font-semibold text-[var(--ink)]">{version.title}</p>
                            <p className="mt-1 text-[10px] text-[var(--muted)]">
                              {version.requiresTheory ? `Teori ≥ ${version.theoryPassScore ?? 70}` : "Teori Yok"} · {version.requiresPractical ? `Pratik ≥ ${version.practicalPassScore ?? 70}` : "Pratik Yok"} · Oluşturma {formatDate(version.createdAt)}
                            </p>
                          </div>
                          {canManage && version.status === "DRAFT" ? (
                            <Button disabled={versionAction !== null} onClick={() => void publishVersion(version)}>
                              {versionAction === version.id ? "Yayınlanıyor..." : "Yayınla"}
                            </Button>
                          ) : version.publishedAt ? (
                            <p className="shrink-0 text-[10px] text-[var(--muted-soft)]">Yayın: {formatDate(version.publishedAt)}</p>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <FinanceEmpty title="Sürüm Yok" description="Kursu içerik yazarlığına açmak için ilk taslak sürümü oluşturun." />
                )}
              </div>
            ) : (
              <FinanceEmpty title="Kurs Seçilmedi" description="Detay ve sürüm yönetimi için katalogdan bir kurs seçin." />
            )}
          </FinancePanel>

          {canManage ? (
            <FinancePanel title="Yeni Kurs" description="Kurs metadata kaydını oluşturun; ardından seçili kursta ilk taslak sürümü açın.">
              <form className="grid gap-4 sm:grid-cols-2" onSubmit={createCourse}>
                <label className="block">
                  <span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">Kurs Kodu</span>
                  <input required maxLength={80} value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} placeholder="LASER-101" className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">Kurs Adı</span>
                  <input required maxLength={300} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Alexandrite Temel Eğitimi" className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">Kategori</span>
                  <Select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]">
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">Eğitim Tipi</span>
                  <Select value={form.deliveryType} onChange={(event) => setForm((current) => ({ ...current, deliveryType: event.target.value }))} className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]">
                    {Object.entries(DELIVERY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-2 block text-[12px] font-medium text-[var(--muted)]">Açıklama</span>
                  <textarea rows={4} maxLength={5000} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Kursun amacı, kapsamı ve hedef kitlesi..." className="w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
                </label>
                <div className="sm:col-span-2 flex justify-end">
                  <Button type="submit" disabled={saving}>{saving ? "Oluşturuluyor..." : "Kurs Oluştur"}</Button>
                </div>
              </form>
            </FinancePanel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
