"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CardInfo } from "@/components/card-info";

import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import { getCardHelp } from "@/lib/card-help";
import { useOperationRealtime } from "@/lib/use-operation-realtime";
import type { Customer, Paginated, Visit } from "@/lib/types";
import { ServiceExecutionPanel } from "../service-execution-panel";

export default function ServiceExecutionsPage() {
  const canUpdate = hasPermission("operations", "manage");
  const [visits, setVisits] = useState<Visit[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
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
        api<Paginated<Customer>>(withQuery("/customers", { page: 1, limit: 100 })),
      ]);
      setVisits(visitResult);
      setCustomers(customerResult.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Hizmet icra kayıtları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useOperationRealtime((event) => {
    if (
      event.aggregateType === "visit" ||
      event.aggregateType === "appointment" ||
      event.aggregateType === "service_execution" ||
      event.aggregateType === "session"
    ) {
      void load();
    }
  });

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
          <div className="mt-2 flex items-start gap-2">
            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
              Hizmet Uygulama Kayıtları
            </h1>
            <CardInfo help={getCardHelp("Hizmet Uygulama Kayıtları")} />
          </div>
          <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
            Hizmetlerin başlangıç ve tamamlanma kayıtlarını ziyaret, randevu, oda ve cihaz bilgileriyle birlikte yönetin. Bağlı paket seansı hizmet tamamlandığında otomatik işlenir.
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
                  <div className="flex items-start gap-2">
                    <h2 className="text-sm font-semibold text-[var(--ink)]">
                      {customerMap.get(visit.customerId) ?? "Müşteri"}
                    </h2>
                    <CardInfo help={getCardHelp("Hizmet Uygulama Kaydı")} />
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {visit.appointmentIds?.length ?? 0} randevu · kayıt sürümü {visit.version}
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
            Müşteri hizmet aşamasına geçtiğinde hizmet uygulaması burada başlatılabilir.
          </p>
        </section>
      )}
    </div>
  );
}
