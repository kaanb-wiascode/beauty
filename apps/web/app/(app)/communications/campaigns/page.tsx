"use client";

import { Select, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type Campaign = {
  id: string;
  name: string;
  objective: string;
  status: string;
  channel: string;
  plannedBudget: string | number;
  spentAmount: string | number;
  currency: string;
  leadCount: number;
  revenue: string | number;
  startsAt?: string | null;
  endsAt?: string | null;
};

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });

export default function CampaignsPage() {
  const canManage = hasPermission("communications", "manage");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("LEAD_GENERATION");
  const [channel, setChannel] = useState("META");
  const [budget, setBudget] = useState("0");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCampaigns(await api<Campaign[]>("/corporate-communications/campaigns?limit=200"));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kampanyalar yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => campaigns.reduce((acc, row) => ({
    spend: acc.spend + Number(row.spentAmount || 0),
    budget: acc.budget + Number(row.plannedBudget || 0),
    leads: acc.leads + Number(row.leadCount || 0),
    revenue: acc.revenue + Number(row.revenue || 0),
  }), { spend: 0, budget: 0, leads: 0, revenue: 0 }), [campaigns]);

  async function createCampaign(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/corporate-communications/campaigns", {
        method: "POST",
        body: {
          name,
          objective,
          channel,
          plannedBudget: Number(budget || 0),
          startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
          endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
        },
      });
      setName(""); setBudget("0"); setStartsAt(""); setEndsAt(""); setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kampanya oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !campaigns.length) return <div className="py-20"><Spinner label="Kampanyalar yükleniyor..." /></div>;

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col gap-4 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 md:flex-row md:items-end md:justify-between">
        <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">Kurumsal İletişim</p><h1 className="text-[30px] font-semibold tracking-[-.04em] text-[var(--ink)]">Kampanyalar</h1><p className="mt-2 text-[12px] text-[var(--muted)]">Bütçe, kanal, lead ve atfedilen geliri kampanya bazında yönetin.</p></div>
        {canManage ? <Button onClick={() => setShowForm((value) => !value)}>{showForm ? "Formu Kapat" : "Yeni Kampanya"}</Button> : null}
      </header>

      {error ? <Alert>{error}</Alert> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Toplam Bütçe" value={money.format(totals.budget)} />
        <Metric label="Harcama" value={money.format(totals.spend)} />
        <Metric label="Lead" value={String(totals.leads)} />
        <Metric label="Atfedilen Gelir" value={money.format(totals.revenue)} />
      </section>

      {showForm && canManage ? (
        <form onSubmit={(event) => void createCampaign(event)} className="grid gap-4 rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Kampanya Adı"><input required value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Örn. Eylül Lazer Kampanyası" /></Field>
          <Field label="Amaç"><Select value={objective} onChange={(e) => setObjective(e.target.value)} className="input"><option value="LEAD_GENERATION">Lead Üretimi</option><option value="AWARENESS">Bilinirlik</option><option value="APPOINTMENT">Randevu</option><option value="SALES">Satış</option><option value="RETENTION">Sadakat</option><option value="REACTIVATION">Yeniden Aktivasyon</option></Select></Field>
          <Field label="Kanal"><Select value={channel} onChange={(e) => setChannel(e.target.value)} className="input"><option>META</option><option>GOOGLE_ADS</option><option>TIKTOK</option><option>WHATSAPP</option><option>MULTI_CHANNEL</option><option>OTHER</option></Select></Field>
          <Field label="Planlanan Bütçe"><input type="number" min="0" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} className="input" /></Field>
          <Field label="Başlangıç"><input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="input" /></Field>
          <Field label="Bitiş"><input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="input" /></Field>
          <div className="md:col-span-2 xl:col-span-3"><Button disabled={saving} type="submit">{saving ? "Oluşturuluyor..." : "Kampanyayı Oluştur"}</Button></div>
        </form>
      ) : null}

      <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
        {campaigns.length ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead><tr className="border-b border-[var(--line)] text-[10px] uppercase tracking-[.1em] text-[var(--muted-soft)]"><th className="px-3 py-3">Kampanya</th><th className="px-3 py-3">Durum</th><th className="px-3 py-3">Kanal</th><th className="px-3 py-3 text-right">Bütçe</th><th className="px-3 py-3 text-right">Harcama</th><th className="px-3 py-3 text-right">Lead</th><th className="px-3 py-3 text-right">Gelir</th></tr></thead><tbody>{campaigns.map((row) => <tr key={row.id} className="border-b border-[var(--line)] last:border-0"><td className="px-3 py-4"><p className="text-[13px] font-semibold text-[var(--ink)]">{row.name}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{row.objective.replaceAll("_", " ")}</p></td><td className="px-3 py-4"><Badge>{row.status}</Badge></td><td className="px-3 py-4 text-[11px] text-[var(--muted)]">{row.channel}</td><td className="px-3 py-4 text-right text-[12px] text-[var(--ink)]">{money.format(Number(row.plannedBudget || 0))}</td><td className="px-3 py-4 text-right text-[12px] text-[var(--ink)]">{money.format(Number(row.spentAmount || 0))}</td><td className="px-3 py-4 text-right text-[12px] text-[var(--ink)]">{row.leadCount}</td><td className="px-3 py-4 text-right text-[12px] font-semibold text-[var(--ink)]">{money.format(Number(row.revenue || 0))}</td></tr>)}</tbody></table></div> : <div className="py-14 text-center text-[12px] text-[var(--muted)]">Henüz kampanya yok.</div>}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-2 text-[11px] font-semibold text-[var(--muted)]"><span>{label}</span>{children}</label>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--muted-soft)]">{label}</p><p className="mt-3 text-[22px] font-semibold tracking-[-.04em] text-[var(--ink)]">{value}</p></div>; }
function Badge({ children }: { children: React.ReactNode }) { return <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[9px] font-semibold text-[var(--accent)]">{children}</span>; }
