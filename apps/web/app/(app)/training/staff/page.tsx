"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DataView } from "@/components/data-view";
import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";

type StaffMember = {
  id: string;
  firstName: string;
  lastName: string;
  branchId: string;
  status: string;
  email?: string | null;
  phone?: string | null;
};

type StaffResponse = {
  data: StaffMember[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

type Assignment = {
  id: string;
  staffId?: string | null;
  status: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "EXPIRED";
};

type Review = {
  id: string;
  staffId: string;
  status: "OPEN" | "COMPLETED" | "CANCELLED";
};

export default function TrainingStaffDirectoryPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [staffRows, assignmentRows, reviewRows] = await Promise.all([
        api<StaffResponse>(withQuery("/staff", { page: 1, limit: 100, status: "ACTIVE" })),
        api<Assignment[]>(withQuery("/training/assignments", { limit: 200 })),
        api<Review[]>(withQuery("/training/competency-reviews", { limit: 300 })),
      ]);
      setStaff(staffRows.data ?? []);
      setAssignments(assignmentRows ?? []);
      setReviews(reviewRows ?? []);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Personel gelişim dizini yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeAssignmentCount = useMemo(
    () => assignments.filter((item) => item.staffId && (item.status === "ASSIGNED" || item.status === "IN_PROGRESS")).length,
    [assignments],
  );
  const openReviewCount = useMemo(() => reviews.filter((item) => item.status === "OPEN").length, [reviews]);
  const staffWithOpenWork = useMemo(() => {
    const ids = new Set<string>();
    for (const item of assignments) if (item.staffId && (item.status === "ASSIGNED" || item.status === "IN_PROGRESS")) ids.add(item.staffId);
    for (const item of reviews) if (item.status === "OPEN") ids.add(item.staffId);
    return ids.size;
  }, [assignments, reviews]);

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/training" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">← Learning Operations</Link>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-soft)]">Eğitim & Yetkinlik</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">Personel Gelişim Dizini</h1>
          <p className="mt-2 max-w-[780px] text-[13px] leading-6 text-[var(--muted)]">Aktif personelleri seçerek competency gap, eğitim ataması, recurring review ve gelişim planı detaylarına geçin.</p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>Yenile</Button>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-[22px] border border-[var(--line)] bg-[var(--surface)]"><Spinner label="Personel gelişim dizini hazırlanıyor..." /></div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FinanceMetric label="Aktif Personel" value={staff.length} detail="Aktif tenant/şube kapsamı" tone="info" />
            <FinanceMetric label="Aktif Eğitim" value={activeAssignmentCount} detail="Assigned + in progress" tone={activeAssignmentCount ? "warning" : "success"} />
            <FinanceMetric label="Açık Review" value={openReviewCount} detail="Yetkinlik değerlendirmesi" tone={openReviewCount ? "warning" : "success"} />
            <FinanceMetric label="Takip Gerektiren Personel" value={staffWithOpenWork} detail="Aktif eğitim veya açık review" tone={staffWithOpenWork ? "danger" : "success"} />
          </section>

          <FinancePanel title="Personeller" description="Her personel satırı kendi Learning Operations gelişim profiline açılır.">
            {staff.length ? (
              <DataView>
                <div className="divide-y divide-[var(--line)]">
                  {staff.map((member) => {
                    const memberAssignments = assignments.filter((item) => item.staffId === member.id && (item.status === "ASSIGNED" || item.status === "IN_PROGRESS")).length;
                    const memberReviews = reviews.filter((item) => item.staffId === member.id && item.status === "OPEN").length;
                    return (
                      <Link key={member.id} href={`/training/staff/${member.id}`} className="grid gap-4 px-4 py-4 transition hover:bg-[var(--surface-2)]/45 sm:px-5 lg:grid-cols-[minmax(0,1fr)_140px_140px_auto] lg:items-center">
                        <div className="min-w-0">
                          <h2 className="truncate text-[13px] font-semibold text-[var(--ink)]">{member.firstName} {member.lastName}</h2>
                          <p className="mt-1 truncate text-[10px] text-[var(--muted-soft)]">{member.email || member.phone || "İletişim bilgisi yok"} · {member.branchId}</p>
                        </div>
                        <div><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">Aktif Eğitim</p><p className="mt-1 text-[12px] font-semibold text-[var(--ink)]">{memberAssignments}</p></div>
                        <div><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">Açık Review</p><p className="mt-1 text-[12px] font-semibold text-[var(--ink)]">{memberReviews}</p></div>
                        <span className="text-[11px] font-semibold text-[var(--accent)]">Profili Aç →</span>
                      </Link>
                    );
                  })}
                </div>
              </DataView>
            ) : <FinanceEmpty title="Aktif personel bulunamadı" description="Aktif tenant/şube kapsamında personel kaydı yok." />}
          </FinancePanel>
        </>
      )}
    </div>
  );
}
