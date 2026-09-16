"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DataView, DataViewMeta } from "@/components/data-view";
import { FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import type { Paginated, Staff } from "@/lib/types";

type Performance = {
  id: string;
  collected: number;
  appointmentCount: number;
};

type PerformanceResponse = Performance[] | { data?: Performance[] };

type ModuleLink = {
  href: string;
  title: string;
  description: string;
  badge: string;
};

const MODULES: readonly ModuleLink[] = [
  { href: "/staff", title: "Personel Yönetimi", description: "Çalışan kartları, yetkiler ve performans görünümü.", badge: "Personel" },
  { href: "/hr/employees", title: "Çalışan Kayıtları", description: "İK çalışan profilleri ve özlük alanları.", badge: "İK" },
  { href: "/hr/personnel-files", title: "Özlük Dosyaları", description: "Kimlik, görev, banka ve işe giriş kayıtları.", badge: "Özlük" },
  { href: "/hr/attendance", title: "Puantaj", description: "Çalışma, mola, fazla mesai ve devam kayıtları.", badge: "Operasyon" },
  { href: "/hr/leaves", title: "İzinler", description: "Yıllık, sağlık, mazeret ve diğer izin kayıtları.", badge: "İzin" },
  { href: "/hr/payroll-dashboard", title: "Bordro Kontrol Merkezi", description: "Tahakkuk, ödeme, yükümlülük ve maliyet merkezi görünümü.", badge: "Bordro" },
  { href: "/hr/payments", title: "Maaş Ödemeleri", description: "Dönemsel personel ödeme kayıtları.", badge: "Ödeme" },
  { href: "/hr/sgk", title: "SGK İşlemleri", description: "Dönem, belge ve durum bazlı SGK kayıtları.", badge: "SGK" },
];

function money(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value);
}

function initials(member: Staff) {
  return `${member.firstName?.[0] ?? ""}${member.lastName?.[0] ?? ""}`.toUpperCase();
}

export default function HRDashboardPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [performance, setPerformance] = useState<Record<string, Performance>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const staffResult = await api<Paginated<Staff>>(withQuery("/staff", { page: 1, limit: 100 }));
      setStaff(staffResult.data ?? []);

      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date();
      to.setHours(23, 59, 59, 999);

      try {
        const performanceResult = await api<PerformanceResponse>(
          withQuery("/staff/performance", { from: from.toISOString(), to: to.toISOString() }),
        );
        const rows = Array.isArray(performanceResult) ? performanceResult : performanceResult.data ?? [];
        const map: Record<string, Performance> = {};
        for (const row of rows) map[row.id] = row;
        setPerformance(map);
      } catch {
        setPerformance({});
      }
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "İK verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeStaff = useMemo(() => staff.filter((item) => item.status === "ACTIVE"), [staff]);
  const archivedStaff = useMemo(() => staff.filter((item) => item.status !== "ACTIVE"), [staff]);
  const totalAppointments = useMemo(
    () => Object.values(performance).reduce((sum, item) => sum + item.appointmentCount, 0),
    [performance],
  );
  const totalCollected = useMemo(
    () => Object.values(performance).reduce((sum, item) => sum + item.collected, 0),
    [performance],
  );
  const ranking = useMemo(
    () =>
      [...activeStaff]
        .sort((a, b) => (performance[b.id]?.collected ?? 0) - (performance[a.id]?.collected ?? 0))
        .slice(0, 5),
    [activeStaff, performance],
  );
  const maxCollected = Math.max(1, ...ranking.map((item) => performance[item.id]?.collected ?? 0));

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-soft)]">
            İnsan Kaynakları & Özlük Yönetimi
          </p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">İK Kontrol Merkezi</h1>
          <p className="mt-2 max-w-[760px] text-[13px] leading-6 text-[var(--muted)]">
            Personel, özlük, puantaj, izin, bordro, ödeme ve SGK operasyonlarını gerçek modül ekranlarından yönetin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>Yenile</Button>
          <Link href="/staff"><Button>Personel Yönetimi</Button></Link>
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      {loading ? (
        <div className="flex min-h-[260px] items-center justify-center rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
          <Spinner label="İK verileri hazırlanıyor..." />
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FinanceMetric label="Toplam Çalışan" value={staff.length} detail={`${activeStaff.length} aktif · ${archivedStaff.length} arşiv`} tone="info" />
            <FinanceMetric label="Aktif Çalışan" value={activeStaff.length} detail="Mevcut personel kayıtları" tone="success" />
            <FinanceMetric label="Bugünkü Randevu" value={totalAppointments} detail="Personel performans API'si" tone="neutral" />
            <FinanceMetric label="Bugünkü Tahsilat" value={money(totalCollected)} detail="Personel performans API'si" tone="success" />
          </section>

          <FinancePanel
            title="İK Modülleri"
            description="Placeholder sekmeler yerine doğrudan gerçek veri ve CRUD ekranlarına gidin."
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {MODULES.map((module) => (
                <Link
                  key={module.href}
                  href={module.href}
                  className="group rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-4 transition hover:-translate-y-0.5 hover:border-[rgba(22,116,189,.24)] hover:shadow-[0_10px_28px_rgba(17,70,104,.06)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[9px] font-semibold text-[var(--accent)]">
                      {module.badge}
                    </span>
                    <span aria-hidden="true" className="text-[var(--muted-soft)] transition group-hover:translate-x-0.5 group-hover:text-[var(--accent)]">→</span>
                  </div>
                  <h3 className="mt-4 text-[13px] font-semibold text-[var(--ink)]">{module.title}</h3>
                  <p className="mt-1 text-[10px] leading-5 text-[var(--muted)]">{module.description}</p>
                </Link>
              ))}
            </div>
          </FinancePanel>

          <FinancePanel
            title="Personel Performansı"
            description="Bugünkü randevu ve tahsilat performansı; en yüksek tahsilata göre ilk 5 aktif çalışan."
            actions={<Link href="/staff" className="text-[11px] font-semibold text-[var(--accent)]">Tüm personeli aç</Link>}
          >
            <DataView>
              <div className="divide-y divide-[var(--line)]">
                {ranking.map((member) => {
                  const collected = performance[member.id]?.collected ?? 0;
                  const width = Math.max(4, Math.round((collected / maxCollected) * 100));
                  return (
                    <div key={member.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[40px_minmax(140px,190px)_minmax(120px,1fr)_110px] sm:items-center">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[10px] font-semibold text-[var(--accent)]">
                        {initials(member)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold text-[var(--ink)]">{member.firstName} {member.lastName}</p>
                        <p className="mt-1 text-[10px] text-[var(--muted)]">{performance[member.id]?.appointmentCount ?? 0} randevu</p>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${width}%` }} />
                      </div>
                      <div className="text-left text-[11px] font-semibold text-[var(--ink)] sm:text-right">{money(collected)}</div>
                    </div>
                  );
                })}
              </div>
              {!ranking.length ? (
                <div className="px-5 py-10 text-center text-[11px] text-[var(--muted)]">Performans verisi bulunamadı.</div>
              ) : null}
              <DataViewMeta>
                <span>{totalAppointments} randevu</span>
                <span>{money(totalCollected)} tahsilat</span>
                <span>{activeStaff.length} aktif çalışan</span>
              </DataViewMeta>
            </DataView>
          </FinancePanel>
        </>
      )}
    </div>
  );
}
