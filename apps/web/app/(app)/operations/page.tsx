"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import type { Customer, Paginated, Visit, VisitStatus } from "@/lib/types";

const STATUS_LABELS: Record<VisitStatus, string> = {
  EXPECTED: "Bekleniyor",
  ARRIVED: "Geldi",
  CHECKED_IN: "Giriş Yapıldı",
  WAITING: "Sırada",
  IN_SERVICE: "Hizmette",
  SERVICE_COMPLETED: "Hizmet Tamamlandı",
  CHECKOUT_PENDING: "Çıkış Bekliyor",
  CHECKED_OUT: "Çıkış Yapıldı",
  CANCELLED: "İptal",
};

const STATUS_ORDER: VisitStatus[] = [
  "CHECKED_IN",
  "WAITING",
  "IN_SERVICE",
  "SERVICE_COMPLETED",
  "CHECKOUT_PENDING",
  "EXPECTED",
  "ARRIVED",
  "CHECKED_OUT",
  "CANCELLED",
];

const NEXT_ACTION: Partial<Record<VisitStatus, { label: string; status: VisitStatus }>> = {
  EXPECTED: { label: "Giriş Yap", status: "CHECKED_IN" },
  ARRIVED: { label: "Giriş Yap", status: "CHECKED_IN" },
  CHECKED_IN: { label: "Sıraya Al", status: "WAITING" },
  WAITING: { label: "Hizmeti Başlat", status: "IN_SERVICE" },
  IN_SERVICE: { label: "Hizmeti Tamamla", status: "SERVICE_COMPLETED" },
  SERVICE_COMPLETED: { label: "Çıkışa Hazırla", status: "CHECKOUT_PENDING" },
  CHECKOUT_PENDING: { label: "Çıkış Yap", status: "CHECKED_OUT" },
};

function elapsed(value: string | null) {
  if (!value) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} sa ${rest} dk` : `${hours} sa`;
}

function visitAgeStart(visit: Visit) {
  return visit.checkedInAt ?? visit.arrivedAt ?? visit.createdAt;
}

export default function OperationsPage() {
  const canUpdate = hasPermission("appointments", "update");
  const [visits, setVisits] = useState<Visit[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function load() {
    if (!hasActiveBranch()) {
      setVisits([]);
      setCustomers([]);
      setLoading(false);
      setError("Canlı operasyon ekranı için önce çalışma kapsamından bir şube seçin.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [visitResult, customerResult] = await Promise.all([
        api<Visit[]>(withQuery("/visits", { limit: 200 })),
        api<Paginated<Customer>>(withQuery("/customers", { page: 1, limit: 200 })),
      ]);
      setVisits(visitResult);
      setCustomers(customerResult.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Operasyon verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const customerMap = useMemo(
    () => new Map(customers.map((customer) => [customer.id, `${customer.firstName} ${customer.lastName}`.trim()])),
    [customers],
  );

  const activeVisits = useMemo(
    () => visits
      .filter((visit) => visit.status !== "CHECKED_OUT" && visit.status !== "CANCELLED")
      .sort((a, b) => {
        const statusDelta = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
        if (statusDelta !== 0) return statusDelta;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }),
    [visits],
  );

  const counts = useMemo(() => ({
    checkedIn: visits.filter((visit) => visit.status === "CHECKED_IN").length,
    waiting: visits.filter((visit) => visit.status === "WAITING").length,
    inService: visits.filter((visit) => visit.status === "IN_SERVICE").length,
    checkout: visits.filter((visit) => visit.status === "CHECKOUT_PENDING").length,
  }), [visits]);

  async function advance(visit: Visit) {
    const action = NEXT_ACTION[visit.status];
    if (!action || !canUpdate) return;

    setUpdatingId(visit.id);
    setError("");
    try {
      if (action.status === "CHECKED_OUT") {
        await api(`/visits/${visit.id}/check-out`, {
          method: "POST",
          body: { expectedVersion: visit.version },
        });
      } else {
        await api(`/visits/${visit.id}/transition`, {
          method: "POST",
          body: { toStatus: action.status, expectedVersion: visit.version },
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Operasyon durumu güncellenemedi.");
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-[1420px] py-10"><Spinner label="Canlı operasyon hazırlanıyor..." /></div>;
  }

  return (
    <div className="mx-auto max-w-[1420px] space-y-5 pb-10">
      <header className="flex flex-col gap-4 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">Operasyon Kontrol Merkezi</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">Canlı Ziyaret Akışı</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">Şubedeki müşterilerin girişten hizmete ve çıkışa kadar gerçek operasyon durumunu takip edin.</p>
        </div>
        <Button onClick={() => void load()} variant="secondary">Yenile</Button>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Giriş Yapıldı", counts.checkedIn],
          ["Sırada", counts.waiting],
          ["Hizmette", counts.inService],
          ["Çıkış Bekliyor", counts.checkout],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
            <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">{value}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--ink)]">Aktif Ziyaretler</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{activeVisits.length} aktif operasyon kaydı</p>
          </div>
        </div>

        {activeVisits.length ? (
          <div className="divide-y divide-[var(--line)]">
            {activeVisits.map((visit) => {
              const action = NEXT_ACTION[visit.status];
              return (
                <div key={visit.id} className="grid gap-4 px-6 py-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,.8fr)_minmax(0,.7fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--ink)]">{customerMap.get(visit.customerId) ?? "Müşteri"}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{visit.source === "WALK_IN" ? "Walk-in" : "Randevulu"} · {elapsed(visitAgeStart(visit))}</p>
                  </div>
                  <div>
                    <span className="inline-flex rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1 text-xs font-semibold text-[var(--ink)]">{STATUS_LABELS[visit.status]}</span>
                  </div>
                  <div className="text-xs text-[var(--muted)]">Sürüm {visit.version}</div>
                  <div className="justify-self-start md:justify-self-end">
                    {action && canUpdate ? (
                      <Button disabled={updatingId === visit.id} onClick={() => void advance(visit)}>
                        {updatingId === visit.id ? "Güncelleniyor..." : action.label}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-semibold text-[var(--ink)]">Aktif ziyaret bulunmuyor</p>
            <p className="mt-2 text-xs text-[var(--muted)]">Check-in yapılan müşteriler burada gerçek zamanlı operasyon akışına girer.</p>
          </div>
        )}
      </section>
    </div>
  );
}
