"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasActiveBranch } from "@/lib/auth";
import { userLabel } from "@/lib/user-language";

type CalendarEvent = {
  id: string;
  eventType: "ALLOCATION" | "BLOCK";
  resourceKind: "ROOM" | "ASSET";
  resourceId: string;
  resourceName: string;
  startsAt: string;
  endsAt: string;
  appointmentId: string | null;
  appointmentStartAt: string | null;
  appointmentEndAt: string | null;
  customerName: string | null;
  serviceName: string | null;
  reason: string | null;
  status: string;
};

function dayStart(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function dayEnd(value = new Date()) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function inputDate(value: Date) {
  const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 10);
}

function displayTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function OperationsResourceCalendarPage() {
  const [fromDate, setFromDate] = useState(inputDate(new Date()));
  const [toDate, setToDate] = useState(inputDate(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (rangeFrom: string, rangeTo: string) => {
    if (!hasActiveBranch()) {
      setEvents([]);
      setError("Kaynak takvimi için önce aktif bir şube seçin.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const from = dayStart(new Date(`${rangeFrom}T00:00:00`));
      const to = dayEnd(new Date(`${rangeTo}T00:00:00`));
      if (from > to) {
        setError("Başlangıç tarihi bitiş tarihinden sonra olamaz.");
        return;
      }
      setEvents(
        await api<CalendarEvent[]>(
          withQuery("/operations/resource-calendar", {
            from: from.toISOString(),
            to: to.toISOString(),
          }),
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kaynak takvimi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialDate = inputDate(new Date());
    void load(initialDate, initialDate);
  }, [load]);

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; kind: "ROOM" | "ASSET"; items: CalendarEvent[] }>();
    for (const event of events) {
      const current = map.get(event.resourceId) ?? {
        name: event.resourceName,
        kind: event.resourceKind,
        items: [],
      };
      current.items.push(event);
      map.set(event.resourceId, current);
    }
    return [...map.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, "tr"));
  }, [events]);

  return (
    <div className="mx-auto max-w-[1420px] space-y-5 pb-10">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">Kaynak planlaması</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">Kaynak Takvimi</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">Oda ve cihazların rezervasyonlarını, hazırlık ve temizlik süreleri ile bakım veya kullanım dışı dönemleri aynı görünümde izleyin.</p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="grid gap-1 text-xs font-medium text-[var(--muted)]">
            Başlangıç
            <input className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm text-[var(--ink)]" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--muted)]">
            Bitiş
            <input className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm text-[var(--ink)]" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
          <Button disabled={loading} onClick={() => void load(fromDate, toDate)}>{loading ? "Yükleniyor..." : "Takvimi Getir"}</Button>
        </div>
      </section>

      {loading && !events.length ? <Spinner label="Kaynak takvimi hazırlanıyor..." /> : null}

      {!loading && !groups.length ? (
        <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] px-6 py-12 text-center shadow-sm">
          <p className="text-sm font-medium text-[var(--ink)]">Bu aralıkta kaynak hareketi yok</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Aktif rezervasyon veya kullanım dışı zaman aralığı bulunamadı.</p>
        </section>
      ) : null}

      <div className="space-y-4">
        {groups.map(([resourceId, group]) => (
          <section key={resourceId} className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">{group.kind === "ROOM" ? "Oda / Kabin" : "Cihaz / Ekipman"}</p>
                <h2 className="mt-1 text-sm font-semibold text-[var(--ink)]">{group.name}</h2>
              </div>
              <span className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">{group.items.length} kayıt</span>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {group.items.map((item) => (
                <article key={`${item.eventType}:${item.id}`} className="grid gap-3 px-6 py-4 lg:grid-cols-[220px_minmax(0,1fr)_auto] lg:items-center">
                  <div>
                    <p className="text-xs font-semibold text-[var(--ink)]">{displayTime(item.startsAt)} → {displayTime(item.endsAt)}</p>
                    <p className="mt-1 text-[11px] text-[var(--muted-soft)]">{item.eventType === "ALLOCATION" ? "Rezervasyon" : "Kullanılamazlık bloğu"}</p>
                  </div>
                  <div>
                    {item.eventType === "ALLOCATION" ? (
                      <>
                        <p className="text-sm font-medium text-[var(--ink)]">{item.customerName ?? "Müşteri"} · {item.serviceName ?? "Hizmet"}</p>
                        {item.appointmentStartAt && item.appointmentEndAt ? <p className="mt-1 text-xs text-[var(--muted)]">Randevu: {displayTime(item.appointmentStartAt)} → {displayTime(item.appointmentEndAt)}</p> : null}
                      </>
                    ) : (
                      <p className="text-sm font-medium text-[var(--ink)]">{item.reason ?? "Kaynak kullanılamıyor"}</p>
                    )}
                  </div>
                  <span className="w-fit rounded-full bg-[var(--surface-2)] px-3 py-1 text-[11px] font-semibold text-[var(--muted)]">{userLabel(item.status)}</span>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
