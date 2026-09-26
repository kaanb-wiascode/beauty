"use client";

import { useEffect, useState } from "react";

import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasActiveBranch } from "@/lib/auth";

type Rule = {
  id: string;
  weekday: number;
  isClosed: boolean;
  opensAt: string | null;
  closesAt: string | null;
  crossesMidnight: boolean;
  timeZone: string;
  version: number;
};

type Draft = {
  weekday: number;
  isClosed: boolean;
  opensAt: string;
  closesAt: string;
  crossesMidnight: boolean;
  timeZone: string;
  version: number;
};

const DAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

function defaultDraft(weekday: number): Draft {
  return { weekday, isClosed: false, opensAt: "09:00", closesAt: "18:00", crossesMidnight: false, timeZone: "Europe/Istanbul", version: 0 };
}

export default function BranchWorkingHoursPage() {
  const [drafts, setDrafts] = useState<Draft[]>(DAYS.map((_, index) => defaultDraft(index)));
  const [loading, setLoading] = useState(true);
  const [savingDay, setSavingDay] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = () => {
    if (!hasActiveBranch()) {
      setError("Çalışma saatlarını yönetmek için önce aktif bir şube seçin.");
      setLoading(false);
      return;
    }
    setLoading(true);
    api<Rule[]>("/operations/branch-working-hours")
      .then((rules) => {
        const byDay = new Map(rules.map((rule) => [rule.weekday, rule]));
        setDrafts(DAYS.map((_, weekday) => {
          const rule = byDay.get(weekday);
          if (!rule) return defaultDraft(weekday);
          return {
            weekday,
            isClosed: rule.isClosed,
            opensAt: rule.opensAt?.slice(0, 5) ?? "09:00",
            closesAt: rule.closesAt?.slice(0, 5) ?? "18:00",
            crossesMidnight: rule.crossesMidnight,
            timeZone: rule.timeZone,
            version: rule.version,
          };
        }));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Çalışma saatları yüklenemedi."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const patch = (weekday: number, next: Partial<Draft>) => {
    setDrafts((items) => items.map((item) => item.weekday === weekday ? { ...item, ...next } : item));
  };

  const save = async (draft: Draft) => {
    setSavingDay(draft.weekday);
    setError("");
    setMessage("");
    try {
      const saved = await api<Rule>("/operations/branch-working-hours", {
        method: "PUT",
        body: JSON.stringify({
          weekday: draft.weekday,
          isClosed: draft.isClosed,
          opensAt: draft.isClosed ? null : draft.opensAt,
          closesAt: draft.isClosed ? null : draft.closesAt,
          crossesMidnight: draft.isClosed ? false : draft.crossesMidnight,
          timeZone: draft.timeZone,
          expectedVersion: draft.version,
        }),
      });
      patch(draft.weekday, {
        version: saved.version,
        isClosed: saved.isClosed,
        opensAt: saved.opensAt?.slice(0, 5) ?? draft.opensAt,
        closesAt: saved.closesAt?.slice(0, 5) ?? draft.closesAt,
        crossesMidnight: saved.crossesMidnight,
        timeZone: saved.timeZone,
      });
      setMessage(`${DAYS[draft.weekday]} çalışma saatları kaydedildi.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Çalışma saatları kaydedilemedi.");
    } finally {
      setSavingDay(null);
    }
  };

  if (loading) return <div className="mx-auto max-w-[1180px] py-10"><Spinner label="Şube çalışma saatları yükleniyor..." /></div>;

  return (
    <div className="mx-auto max-w-[1180px] space-y-5 pb-10">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">Scheduling Guard</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">Şube Çalışma Saatları</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">Waitlist slot önerileri ve rezervasyon kabulü bu haftalık kuralları dikkate alır. Hiç kural tanımlanmamış şubelerde geriye uyumluluk için mevcut booking akışı engellenmez.</p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {message ? <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--ink)]">{message}</div> : null}

      <section className="space-y-3">
        {drafts.map((draft) => (
          <div key={draft.weekday} className="grid gap-4 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm md:grid-cols-[150px_120px_1fr_1fr_150px_130px] md:items-end">
            <div>
              <div className="text-xs font-semibold text-[var(--muted)]">Gün</div>
              <div className="mt-2 text-sm font-semibold text-[var(--ink)]">{DAYS[draft.weekday]}</div>
            </div>
            <label className="flex min-h-10 items-center gap-2 text-sm text-[var(--ink)]">
              <input type="checkbox" checked={draft.isClosed} onChange={(event) => patch(draft.weekday, { isClosed: event.target.checked, crossesMidnight: event.target.checked ? false : draft.crossesMidnight })} /> Kapalı
            </label>
            <label className="text-xs font-semibold text-[var(--muted)]">Açılış
              <input type="time" disabled={draft.isClosed} value={draft.opensAt} onChange={(event) => patch(draft.weekday, { opensAt: event.target.value })} className="mt-2 w-full rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-50" />
            </label>
            <label className="text-xs font-semibold text-[var(--muted)]">Kapanış
              <input type="time" disabled={draft.isClosed} value={draft.closesAt} onChange={(event) => patch(draft.weekday, { closesAt: event.target.value })} className="mt-2 w-full rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-50" />
            </label>
            <label className="flex min-h-10 items-center gap-2 text-sm text-[var(--ink)]">
              <input type="checkbox" disabled={draft.isClosed} checked={draft.crossesMidnight} onChange={(event) => patch(draft.weekday, { crossesMidnight: event.target.checked })} /> Geceye taşar
            </label>
            <Button onClick={() => save(draft)} disabled={savingDay !== null}>{savingDay === draft.weekday ? "Kaydediliyor..." : "Kaydet"}</Button>
          </div>
        ))}
      </section>

      <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4 text-xs text-[var(--muted)]">Saatler şube zaman diliminde değerlendirilir. Varsayılan zaman dilimi Europe/Istanbul’dur. Geceye taşan bir kural örneğin 22:00–02:00 aralığını kapsayabilir.</div>
    </div>
  );
}
