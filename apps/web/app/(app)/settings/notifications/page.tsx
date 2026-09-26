"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Policy = {
  id: string;
  eventKey: string;
  audience: string;
  channels: string[];
  enabled: boolean;
  description: string | null;
};

const CHANNELS = ["IN_APP", "EMAIL", "SMS", "WHATSAPP"];

export default function NotificationPoliciesPage() {
  const [items, setItems] = useState<Policy[]>([]);
  const [eventKey, setEventKey] = useState("");
  const [audience, setAudience] = useState("");
  const [channels, setChannels] = useState<string[]>(["IN_APP"]);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => api<Policy[]>("/admin/notification-policies").then(setItems).catch((e) => setError(e instanceof Error ? e.message : "Bildirim politikaları yüklenemedi."));
  useEffect(() => { load(); }, []);

  async function save() {
    setError(null);
    try {
      await api("/admin/notification-policies", {
        method: "PUT",
        body: JSON.stringify({ eventKey, audience, channels, description, enabled: true }),
      });
      setEventKey(""); setAudience(""); setDescription(""); setChannels(["IN_APP"]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Politika kaydedilemedi.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1100px] space-y-6 pb-10">
      <header className="border-b border-[var(--line)] pb-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Yönetim / Sistem</div>
        <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">Bildirim Politikaları</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">İş olaylarının hangi hedef kitlelere hangi kanallardan bildirileceğini şirket bazında yönetin.</p>
      </header>

      <section className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <input className="rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm" placeholder="Olay anahtarı (örn. finance.expense.approved)" value={eventKey} onChange={(e) => setEventKey(e.target.value)} />
          <input className="rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm" placeholder="Hedef kitle (örn. finance-manager)" value={audience} onChange={(e) => setAudience(e.target.value)} />
          <input className="rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm md:col-span-2" placeholder="Açıklama" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {CHANNELS.map((channel) => {
            const selected = channels.includes(channel);
            return <button key={channel} type="button" onClick={() => setChannels(selected ? channels.filter((x) => x !== channel) : [...channels, channel])} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${selected ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)] text-[var(--muted)]"}`}>{channel}</button>;
          })}
        </div>
        {error && <div className="mt-3 text-xs text-red-500">{error}</div>}
        <button onClick={save} className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white">Politikayı Kaydet</button>
      </section>

      <section className="space-y-3">
        {items.length === 0 ? <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 text-sm text-[var(--muted)]">Henüz bildirim politikası tanımlanmamış.</div> : items.map((item) => (
          <div key={item.id} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-[var(--ink)]">{item.eventKey}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">Hedef: {item.audience}</div>
              </div>
              <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)]">{item.enabled ? "Aktif" : "Pasif"}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">{item.channels.map((channel) => <span key={channel} className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--muted)]">{channel}</span>)}</div>
            {item.description && <p className="mt-3 text-xs text-[var(--muted)]">{item.description}</p>}
          </div>
        ))}
      </section>
    </main>
  );
}
