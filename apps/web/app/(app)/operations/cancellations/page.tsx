"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import type { Appointment, Paginated } from "@/lib/types";

type Outcome = "CANCELLED" | "NO_SHOW";
type Reason = { id: string; code: string; label: string; appliesTo: Outcome | "BOTH"; branchId: string | null };
type OutcomeRow = {
  id: string;
  appointmentId: string;
  outcome: Outcome;
  reasonCode: string;
  reasonLabel: string;
  note: string | null;
  occurredAt: string;
  customerName: string;
  serviceName: string;
};

function dayStart() {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value.toISOString();
}
function dayEnd() {
  const value = new Date();
  value.setHours(23, 59, 59, 999);
  return value.toISOString();
}

export default function OperationsCancellationsPage() {
  const canCancel = hasPermission("appointments", "cancel");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [history, setHistory] = useState<OutcomeRow[]>([]);
  const [outcome, setOutcome] = useState<Outcome>("CANCELLED");
  const [appointmentId, setAppointmentId] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load(selectedOutcome: Outcome = outcome) {
    if (!hasActiveBranch()) {
      setLoading(false);
      setError("İptal / no-show yönetimi için önce aktif bir şube seçin.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [appointmentResult, reasonResult, outcomeResult] = await Promise.all([
        api<Paginated<Appointment>>(withQuery("/appointments", { page: 1, limit: 200, from: dayStart(), to: dayEnd() })),
        api<Reason[]>(withQuery("/operations/appointment-outcomes/reasons", { outcome: selectedOutcome })),
        api<OutcomeRow[]>("/operations/appointment-outcomes?limit=100"),
      ]);
      setAppointments(appointmentResult.data);
      setReasons(reasonResult);
      setHistory(outcomeResult);
      setReasonId((current) => reasonResult.some((item) => item.id === current) ? current : (reasonResult[0]?.id ?? ""));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "İptal / no-show verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const eligibleAppointments = useMemo(
    () => appointments.filter((item) => !["COMPLETED", "CANCELLED", "NO_SHOW"].includes(item.status)),
    [appointments],
  );

  async function changeOutcome(next: Outcome) {
    setOutcome(next);
    setReasonId("");
    await load(next);
  }

  async function submit() {
    if (!canCancel || !appointmentId || !reasonId) return;
    setBusy(true);
    setError("");
    try {
      await api(`/operations/appointment-outcomes/appointments/${appointmentId}`, {
        method: "POST",
        body: { outcome, reasonId, note: note.trim() || null },
      });
      setAppointmentId("");
      setNote("");
      await load(outcome);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Randevu sonucu kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !appointments.length && !history.length) {
    return <div className="mx-auto max-w-[1420px] py-10"><Spinner label="İptal ve no-show görünümü hazırlanıyor..." /></div>;
  }

  return (
    <div className="mx-auto max-w-[1420px] space-y-5 pb-10">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">Customer Journey Recovery</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">İptal & No-show Yönetimi</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">Randevu terminal sonucunu neden taksonomisiyle kaydeder. Neden etiketi snapshot olarak korunur; daha sonra taksonomi değişse bile tarihsel analiz bozulmaz.</p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <Button variant={outcome === "CANCELLED" ? "primary" : "secondary"} onClick={() => void changeOutcome("CANCELLED")}>İptal</Button>
          <Button variant={outcome === "NO_SHOW" ? "primary" : "secondary"} onClick={() => void changeOutcome("NO_SHOW")}>No-show</Button>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="text-xs font-semibold text-[var(--muted)]">Randevu
            <select className="mt-2 min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm text-[var(--ink)]" value={appointmentId} onChange={(event) => setAppointmentId(event.target.value)}>
              <option value="">Randevu seçin</option>
              {eligibleAppointments.map((item) => <option key={item.id} value={item.id}>{new Date(item.startAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} · {item.id.slice(0, 8)}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--muted)]">Neden
            <select className="mt-2 min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm text-[var(--ink)]" value={reasonId} onChange={(event) => setReasonId(event.target.value)}>
              <option value="">Neden seçin</option>
              {reasons.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        </div>
        <label className="mt-4 block text-xs font-semibold text-[var(--muted)]">Operasyon notu
          <textarea className="mt-2 min-h-24 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-sm text-[var(--ink)]" value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} />
        </label>
        <div className="mt-4 flex justify-end"><Button disabled={!canCancel || !appointmentId || !reasonId || busy} onClick={() => void submit()}>{busy ? "Kaydediliyor..." : outcome === "CANCELLED" ? "Randevuyu İptal Et" : "No-show Olarak İşaretle"}</Button></div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] shadow-sm">
        <div className="border-b border-[var(--line)] px-6 py-4"><h2 className="text-sm font-semibold text-[var(--ink)]">Son Operasyon Sonuçları</h2></div>
        {history.length ? <div className="divide-y divide-[var(--line)]">{history.map((item) => <div key={item.id} className="px-6 py-4"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[var(--surface-2)] px-2 py-1 text-[10px] font-semibold text-[var(--ink)]">{item.outcome === "CANCELLED" ? "İptal" : "No-show"}</span><p className="text-sm font-semibold text-[var(--ink)]">{item.customerName} · {item.serviceName}</p></div><p className="mt-1 text-xs text-[var(--muted)]">{item.reasonLabel} · {new Date(item.occurredAt).toLocaleString("tr-TR")}</p>{item.note ? <p className="mt-2 text-xs text-[var(--muted)]">{item.note}</p> : null}</div>)}</div> : <div className="px-6 py-10 text-center text-sm text-[var(--muted)]">Henüz iptal/no-show sonucu yok.</div>}
      </section>
    </div>
  );
}
