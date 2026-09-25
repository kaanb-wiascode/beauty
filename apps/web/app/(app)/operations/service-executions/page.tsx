"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import type { Customer, Paginated, Visit } from "@/lib/types";
import { ServiceExecutionPanel } from "../service-execution-panel";

export default function ServiceExecutionsPage() {
  const canUpdate = hasPermission("appointments", "update");
  const [visits, setVisits] = useState<Visit[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    if (!hasActiveBranch()) {
      setVisits([]);
      setCustomers([]);
      setLoading(false);
      setError("Hizmet icra alanı için önce çalışma kapsamından bir şube seçin.");
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
      setError(err instanceof ApiError ? err.message : "Hizmet icra kayıtları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const customerMap = useMemo(
    () =>
      new Map(
        customers.map((customer) => [
          customer.id,
          `${customer.firstName} ${customer.lastName}`.trim(),
        ]),
      ),
    [customers],
  );

  const actionableVisits = useMemo(
    () =>
      visits.filter(
        (visit) =>
          visit.source === "APPOINTMENT" &&
          visit.status === "IN_SERVICE" &&
          (visit.appointmentIds?.length ?? 0) > 0,
      ),
    [visits],
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-[1420px] py-10">
        <Spinner label="Hizmet icra alanı hazırlanıyor..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1420px] space-y-5 pb-10">
      <header className="flex flex-col gap-4 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">
            Hizmet operasyonları
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
            Hizmet uygulama kayıtları
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
            Hizmetlerin başlangıç ve tamamlanma kayıtlarını; ziyaret, randevu, oda ve ekipman bilgileriyle birlikte yönetin. Paket kullanım kaydı ayrı bir ticari işlem olarak izlenir.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void load()}>
          Yenile
        </Button>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      {actionableVisits.length ? (
        <div className="space-y-4">
          {actionableVisits.map((visit) => (
            <section
              key={visit.id}
              className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm"
            >
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--ink)]">
                    {customerMap.get(visit.customerId) ?? "Müşteri"}
                  </h2>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Visit {visit.id.slice(0, 8)} · {visit.appointmentIds?.length ?? 0} randevu · sürüm {visit.version}
                  </p>
                </div>
                <span className="w-fit rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-semibold text-[var(--ink)]">
                  Hizmette
                </span>
              </div>
              <ServiceExecutionPanel
                visit={visit}
                canUpdate={canUpdate}
                onChanged={load}
              />
            </section>
          ))}
        </div>
      ) : (
        <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] px-6 py-14 text-center shadow-sm">
          <p className="text-sm font-semibold text-[var(--ink)]">
            İcra bekleyen randevulu ziyaret bulunmuyor
          </p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Visit IN_SERVICE durumuna geçtiğinde hizmet icrası burada başlatılabilir.
          </p>
        </section>
      )}
    </div>
  );
}
