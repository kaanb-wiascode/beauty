"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasActiveBranch } from "@/lib/auth";
import type { Appointment, Paginated } from "@/lib/types";

type Timeline = { events: Array<{ occurredAt: string; source: string; title: string; detail: string | null }> };
type Reliability = {
  totalAppointments: number;
  noShows: number;
  lateCancellations: number;
  attendanceRate: number | null;
  confirmationRate: number | null;
  customers: Array<{ customerId: string; customerName: string; appointmentCount: number; noShowCount: number; lateCancellationCount: number; attendanceRate: number | null; confirmationRate: number | null }>;
};

export default function OperationsJourneyPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [reliability, setReliability] = useState<Reliability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      if (!hasActiveBranch()) {
        setError("Bu görünüm için önce aktif bir şube seçin.");
        setLoading(false);
        return;
      }
      try {
        const [a, r] = await Promise.all([
          api<Paginated<Appointment>>("/appointments?page=1&limit=200"),
          api<Reliability>("/operations/reliability?days=180"),
        ]);
        setAppointments(a.data);
        setReliability(r);
        setSelectedId(a.data[0]?.id ?? "");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Veriler yüklenemedi.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function showTimeline() {
    if (!selectedId) return;
    try {
      setTimeline(await api<Timeline>(`/operations/timeline/appointments/${selectedId}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Timeline yüklenemedi.");
    }
  }

  if (loading) return <div className="mx-auto max-w-[1420px] py-10"><Spinner label="Müşteri yolculuğu hazırlanıyor..." /></div>;

  return <div className="mx-auto max-w-[1420px] space-y-5 pb-10">
    <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">Customer Journey</p>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Timeline & Güvenilirlik</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">Randevu, ziyaret, hizmet, onay ve ödeme sinyallerini tek görünümde birleştirir.</p>
    </header>
    {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
    {reliability ? <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {[["Randevu", reliability.totalAppointments],["No-show", reliability.noShows],["Geç iptal", reliability.lateCancellations],["Katılım", reliability.attendanceRate == null ? "—" : `%${reliability.attendanceRate}`],["Onay", reliability.confirmationRate == null ? "—" : `%${reliability.confirmationRate}`]].map(([label,value]) => <article key={String(label)} className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-xs text-[var(--muted)]">{label}</p><p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{value}</p></article>)}
    </section> : null}
    <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end"><label className="flex-1 text-xs font-semibold text-[var(--muted)]">Randevu<select className="mt-2 min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}><option value="">Seçin</option>{appointments.map((a) => <option key={a.id} value={a.id}>{new Date(a.startAt).toLocaleString("tr-TR")} · {a.status}</option>)}</select></label><Button disabled={!selectedId} onClick={() => void showTimeline()}>Timeline Göster</Button></div>
      {timeline ? <div className="mt-5 space-y-3">{timeline.events.map((e, i) => <article key={`${e.occurredAt}-${i}`} className="rounded-[18px] bg-[var(--surface-2)] p-4"><div className="flex gap-2"><p className="text-sm font-semibold text-[var(--ink)]">{e.title}</p><span className="text-[10px] text-[var(--muted)]">{e.source}</span></div><p className="mt-1 text-xs text-[var(--muted)]">{new Date(e.occurredAt).toLocaleString("tr-TR")}</p>{e.detail ? <p className="mt-2 text-xs text-[var(--muted)]">{e.detail}</p> : null}</article>)}</div> : null}
    </section>
    {reliability ? <section className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)]"><div className="border-b border-[var(--line)] px-6 py-4"><h2 className="text-sm font-semibold text-[var(--ink)]">Müşteri Göstergeleri</h2></div><div className="divide-y divide-[var(--line)]">{reliability.customers.slice(0,30).map((c) => <div key={c.customerId} className="grid gap-2 px-6 py-4 md:grid-cols-[1fr_repeat(4,110px)]"><div><p className="text-sm font-semibold text-[var(--ink)]">{c.customerName}</p><p className="text-xs text-[var(--muted)]">{c.appointmentCount} randevu</p></div><p className="text-xs">No-show {c.noShowCount}</p><p className="text-xs">Geç iptal {c.lateCancellationCount}</p><p className="text-xs">Katılım {c.attendanceRate == null ? "—" : `%${c.attendanceRate}`}</p><p className="text-xs">Onay {c.confirmationRate == null ? "—" : `%${c.confirmationRate}`}</p></div>)}</div></section> : null}
  </div>;
}
