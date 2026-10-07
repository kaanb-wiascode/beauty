"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Spinner, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { userErrorMessage, userLabel } from "@/lib/user-language";
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

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
});

const fieldClass =
  "mt-2 h-11 w-full rounded-[12px] border border-[var(--line)] bg-white px-3 text-[11px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

const statusOptions = [
  ["ALL", "Tüm Durumlar"],
  ["DRAFT", "Taslak"],
  ["PLANNED", "Planlandı"],
  ["ACTIVE", "Aktif"],
  ["PAUSED", "Duraklatıldı"],
  ["COMPLETED", "Tamamlandı"],
  ["CANCELLED", "İptal Edildi"],
] as const;

function formatDate(value?: string | null) {
  if (!value) return "Belirtilmedi";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default function CampaignsPage() {
  const canManage = hasPermission("communications", "manage");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");

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
      setCampaigns(
        await api<Campaign[]>(
          "/corporate-communications/campaigns?limit=200",
        ),
      );
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(e.message, "Kampanyalar yüklenemedi.")
          : "Kampanyalar yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(
    () =>
      campaigns.reduce(
        (acc, row) => ({
          spend: acc.spend + Number(row.spentAmount || 0),
          budget: acc.budget + Number(row.plannedBudget || 0),
          leads: acc.leads + Number(row.leadCount || 0),
          revenue: acc.revenue + Number(row.revenue || 0),
          active: acc.active + (row.status === "ACTIVE" ? 1 : 0),
        }),
        { spend: 0, budget: 0, leads: 0, revenue: 0, active: 0 },
      ),
    [campaigns],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    return campaigns.filter((campaign) => {
      const matchesStatus = status === "ALL" || campaign.status === status;
      const matchesSearch =
        !needle ||
        campaign.name.toLocaleLowerCase("tr-TR").includes(needle) ||
        userLabel(campaign.channel)
          .toLocaleLowerCase("tr-TR")
          .includes(needle) ||
        userLabel(campaign.objective)
          .toLocaleLowerCase("tr-TR")
          .includes(needle);
      return matchesStatus && matchesSearch;
    });
  }, [campaigns, search, status]);

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

      setName("");
      setBudget("0");
      setStartsAt("");
      setEndsAt("");
      setShowForm(false);
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(e.message, "Kampanya oluşturulamadı.")
          : "Kampanya oluşturulamadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading && !campaigns.length) {
    return (
      <div className="py-20">
        <Spinner label="Kampanyalar yükleniyor..." />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-12">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">
              Kurumsal İletişim
            </p>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-.04em] text-[var(--ink)]">
              Kampanya Merkezi
            </h1>
            <p className="mt-2 max-w-3xl text-[12px] leading-5 text-[var(--muted)]">
              Kampanyaların bütçe kullanımını, müşteri talebini ve gelir
              etkisini tek görünümden izleyin.
            </p>
          </div>

          {canManage ? (
            <Button onClick={() => setShowForm((value) => !value)}>
              {showForm ? "Formu Kapat" : "Yeni Kampanya"}
            </Button>
          ) : null}
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Aktif Kampanya"
          value={String(totals.active)}
          detail={campaigns.length + " toplam kampanya"}
        />
        <Metric
          label="Planlanan Bütçe"
          value={money.format(totals.budget)}
          detail={
            totals.budget > 0
              ? "%" +
                Math.round(
                  Math.min(100, (totals.spend / totals.budget) * 100),
                ) +
                " kullanıldı"
              : "Henüz bütçe planı yok"
          }
        />
        <Metric
          label="Pazarlama Harcaması"
          value={money.format(totals.spend)}
          detail={totals.leads + " potansiyel müşteri"}
        />
        <Metric
          label="Atfedilen Gelir"
          value={money.format(totals.revenue)}
          detail={
            totals.spend > 0
              ? (totals.revenue / totals.spend).toFixed(2) +
                "x reklam getirisi"
              : "Getiri henüz hesaplanamadı"
          }
        />
      </section>

      {showForm && canManage ? (
        <form
          onSubmit={(event) => void createCampaign(event)}
          className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]"
        >
          <div className="mb-5">
            <h2 className="text-[14px] font-semibold text-[var(--ink)]">
              Yeni Kampanya
            </h2>
            <p className="mt-1 text-[8px] text-[var(--muted)]">
              Kampanyanın amacı, kanalı, bütçesi ve çalışma tarihlerini
              belirleyin.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Kampanya Adı">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={fieldClass}
                placeholder="Örn. Sonbahar Müşteri Kazanımı"
              />
            </Field>

            <Field label="Amaç">
              <Select
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className={fieldClass}
              >
                <option value="LEAD_GENERATION">
                  Potansiyel Müşteri Kazanımı
                </option>
                <option value="AWARENESS">Bilinirlik</option>
                <option value="APPOINTMENT">Randevu</option>
                <option value="SALES">Satış</option>
                <option value="RETENTION">Sadakat</option>
                <option value="REACTIVATION">Yeniden Kazanım</option>
              </Select>
            </Field>

            <Field label="Kanal">
              <Select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className={fieldClass}
              >
                <option value="META">Meta</option>
                <option value="GOOGLE_ADS">Google Ads</option>
                <option value="TIKTOK">TikTok</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="MULTI_CHANNEL">Çoklu Kanal</option>
                <option value="OTHER">Diğer</option>
              </Select>
            </Field>

            <Field label="Planlanan Bütçe">
              <input
                type="number"
                min="0"
                step="0.01"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className={fieldClass}
              />
            </Field>

            <Field label="Başlangıç">
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className={fieldClass}
              />
            </Field>

            <Field label="Bitiş">
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className={fieldClass}
              />
            </Field>
          </div>

          <div className="mt-5 flex justify-end">
            <Button disabled={saving} type="submit">
              {saving ? "Oluşturuluyor..." : "Kampanyayı Oluştur"}
            </Button>
          </div>
        </form>
      ) : null}

      <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--ink)]">
              Kampanyalar
            </h2>
            <p className="mt-1 text-[8px] text-[var(--muted)]">
              {filtered.length} kampanya gösteriliyor
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Kampanya, kanal veya amaç ara…"
              className="h-10 min-w-[260px] rounded-[11px] border border-[var(--line)] bg-white px-3 text-[10px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            />
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="h-10 min-w-[150px] rounded-[11px] border border-[var(--line)] bg-white px-3 text-[10px] text-[var(--ink)]"
            >
              {statusOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {filtered.length ? (
          <div className="divide-y divide-[var(--line)]">
            {filtered.map((campaign) => (
              <CampaignRow key={campaign.id} campaign={campaign} />
            ))}
          </div>
        ) : (
          <div className="p-10 text-center">
            <p className="text-[11px] font-semibold text-[var(--ink)]">
              Eşleşen kampanya bulunamadı.
            </p>
            <p className="mt-1 text-[9px] text-[var(--muted)]">
              Arama veya durum filtresini değiştirin.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function CampaignRow({ campaign }: { campaign: Campaign }) {
  const budget = Number(campaign.plannedBudget || 0);
  const spent = Number(campaign.spentAmount || 0);
  const revenue = Number(campaign.revenue || 0);
  const usage = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const roas = spent > 0 ? revenue / spent : null;

  return (
    <article className="p-4 transition hover:bg-[var(--surface-2)]/35 sm:p-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(230px,1.35fr)_minmax(190px,.9fr)_minmax(210px,1fr)_minmax(230px,1fr)] xl:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[12px] font-semibold text-[var(--ink)]">
              {campaign.name}
            </h3>
            <Badge>{userLabel(campaign.status)}</Badge>
          </div>
          <p className="mt-1.5 text-[8px] text-[var(--muted)]">
            {userLabel(campaign.objective)} · {userLabel(campaign.channel)}
          </p>
          <p className="mt-1 text-[8px] text-[var(--muted-soft)]">
            {formatDate(campaign.startsAt)} → {formatDate(campaign.endsAt)}
          </p>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3 text-[8px]">
            <span className="text-[var(--muted)]">Bütçe kullanımı</span>
            <strong className="text-[var(--ink)]">
              {budget > 0 ? "%" + Math.round(usage) : "—"}
            </strong>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className="h-full rounded-full bg-[var(--accent)]"
              style={{ width: usage + "%" }}
            />
          </div>
          <p className="mt-1.5 text-[8px] text-[var(--muted)]">
            {money.format(spent)} / {money.format(budget)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Mini label="Potansiyel Müşteri" value={String(campaign.leadCount)} />
          <Mini label="Atfedilen Gelir" value={money.format(revenue)} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Mini
            label="Reklam Getirisi"
            value={roas == null ? "—" : roas.toFixed(2) + "x"}
          />
          <Mini
            label="Talep Başına Harcama"
            value={
              campaign.leadCount > 0
                ? money.format(spent / campaign.leadCount)
                : "—"
            }
          />
        </div>
      </div>
    </article>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="text-[10px] font-semibold text-[var(--muted)]">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
      <p className="text-[8px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-3 text-[22px] font-semibold tracking-[-.04em] text-[var(--ink)]">
        {value}
      </p>
      <p className="mt-2 text-[8px] leading-4 text-[var(--muted)]">
        {detail}
      </p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[11px] bg-[var(--surface-2)] p-2.5">
      <span className="block text-[7px] text-[var(--muted)]">{label}</span>
      <strong className="mt-1 block text-[9px] text-[var(--ink)]">
        {value}
      </strong>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--accent)]">
      {children}
    </span>
  );
}
