"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Spinner, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { userErrorMessage, userLabel } from "@/lib/user-language";

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
  notes?: string | null;
  marketingExpenseId?: string | null;
  marketingFinanceStatus?: string | null;
  supplierBillId?: string | null;
};

type FinanceSupplier = {
  id: string;
  name: string;
  contactName?: string | null;
  status: string;
};

type CampaignEditForm = {
  name: string;
  objective: string;
  channel: string;
  plannedBudget: string;
  spentAmount: string;
  startsAt: string;
  endsAt: string;
  notes: string;
};

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
});

const fieldClass =
  "mt-2 h-11 w-full rounded-[12px] border border-[var(--line)] bg-white px-3 text-[11px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const areaClass =
  "mt-2 min-h-24 w-full rounded-[12px] border border-[var(--line)] bg-white px-3 py-3 text-[11px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

const statusOptions = [
  ["ALL", "Tüm Durumlar"],
  ["DRAFT", "Taslak"],
  ["PLANNED", "Planlandı"],
  ["ACTIVE", "Aktif"],
  ["PAUSED", "Duraklatıldı"],
  ["COMPLETED", "Tamamlandı"],
  ["CANCELLED", "İptal Edildi"],
] as const;

function toLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDate(value?: string | null) {
  if (!value) return "Belirtilmedi";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function financeLabel(status?: string | null, spent = 0) {
  if (spent <= 0) return "Harcama Yok";
  if (status === "POSTED") return "Finansa Aktarıldı";
  if (status === "APPROVED") return "Finansa Hazır";
  if (status === "PENDING_FINANCE") return "Finans Bekliyor";
  return "Finans Kaydı Bekliyor";
}

export default function CampaignsPage() {
  const canManage = hasPermission("communications", "manage");
  const canFinanceRead =
    hasPermission("finance", "read") || hasPermission("finance", "manage");
  const canFinanceManage = hasPermission("finance", "manage");

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [suppliers, setSuppliers] = useState<FinanceSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState("");
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

  const [editing, setEditing] = useState<Campaign | null>(null);
  const [editForm, setEditForm] = useState<CampaignEditForm | null>(null);

  const [financeCampaign, setFinanceCampaign] = useState<Campaign | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [dueAt, setDueAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const requests: Promise<unknown>[] = [
        api<Campaign[]>("/corporate-communications/campaigns?limit=200"),
      ];
      if (canFinanceManage) {
        requests.push(api<FinanceSupplier[]>("/marketing-finance/suppliers"));
      }

      const results = await Promise.all(requests);
      setCampaigns(results[0] as Campaign[]);
      if (canFinanceManage) {
        setSuppliers(results[1] as FinanceSupplier[]);
      }
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(e.message, "Kampanyalar yüklenemedi.")
          : "Kampanyalar yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, [canFinanceManage]);

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
          financePending:
            acc.financePending +
            (Number(row.spentAmount || 0) > 0 &&
            row.marketingFinanceStatus !== "POSTED"
              ? 1
              : 0),
        }),
        {
          spend: 0,
          budget: 0,
          leads: 0,
          revenue: 0,
          active: 0,
          financePending: 0,
        },
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

  function openEdit(campaign: Campaign) {
    setEditing(campaign);
    setEditForm({
      name: campaign.name,
      objective: campaign.objective,
      channel: campaign.channel,
      plannedBudget: String(campaign.plannedBudget ?? 0),
      spentAmount: String(campaign.spentAmount ?? 0),
      startsAt: toLocalInput(campaign.startsAt),
      endsAt: toLocalInput(campaign.endsAt),
      notes: campaign.notes ?? "",
    });
    setError("");
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing || !editForm) return;

    setSaving(true);
    setError("");
    try {
      await api("/corporate-communications/campaigns/" + editing.id, {
        method: "PATCH",
        body: {
          name: editForm.name,
          objective: editForm.objective,
          channel: editForm.channel,
          plannedBudget: Number(editForm.plannedBudget || 0),
          spentAmount: Number(editForm.spentAmount || 0),
          startsAt: editForm.startsAt
            ? new Date(editForm.startsAt).toISOString()
            : null,
          endsAt: editForm.endsAt
            ? new Date(editForm.endsAt).toISOString()
            : null,
          notes: editForm.notes.trim() || null,
        },
      });
      setEditing(null);
      setEditForm(null);
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(e.message, "Kampanya güncellenemedi.")
          : "Kampanya güncellenemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(campaign: Campaign, nextStatus: string) {
    if (
      ["COMPLETED", "CANCELLED"].includes(nextStatus) &&
      !window.confirm(
        nextStatus === "COMPLETED"
          ? "Kampanya tamamlandı olarak işaretlensin mi?"
          : "Kampanya iptal edilsin mi?",
      )
    ) {
      return;
    }

    setActingId(campaign.id);
    setError("");
    try {
      await api(
        "/corporate-communications/campaigns/" + campaign.id + "/status",
        {
          method: "PATCH",
          body: { status: nextStatus },
        },
      );
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(e.message, "Kampanya durumu güncellenemedi.")
          : "Kampanya durumu güncellenemedi.",
      );
    } finally {
      setActingId("");
    }
  }

  function openFinance(campaign: Campaign) {
    setFinanceCampaign(campaign);
    setSupplierId("");
    setInvoiceNumber("");
    setDueAt("");
    setError("");
  }

  async function postToFinance(event: FormEvent) {
    event.preventDefault();
    if (!financeCampaign?.marketingExpenseId || !supplierId) return;

    setSaving(true);
    setError("");
    try {
      await api(
        "/marketing-finance/expenses/" +
          financeCampaign.marketingExpenseId +
          "/account",
        {
          method: "POST",
          body: {
            supplierId,
            invoiceNumber: invoiceNumber.trim() || undefined,
            dueAt: dueAt
              ? new Date(dueAt + "T12:00:00").toISOString()
              : undefined,
          },
        },
      );
      setFinanceCampaign(null);
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(
              e.message,
              "Pazarlama gideri finans sistemine aktarılamadı.",
            )
          : "Pazarlama gideri finans sistemine aktarılamadı.",
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
            <p className="mt-2 max-w-4xl text-[12px] leading-5 text-[var(--muted)]">
              Kampanyaların bütçe, gerçekleşen harcama, dönüşüm, gelir ve finans
              aktarımını tek merkezden yönetin.
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
        <Metric
          label="Finans Bekleyen"
          value={String(totals.financePending)}
          detail="Finans aktarımı tamamlanmamış harcama"
          attention={totals.financePending > 0}
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
              Kampanyanın amacı, kanalı, bütçesi ve çalışma tarihlerini belirleyin.
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
              <ObjectiveSelect value={objective} onChange={setObjective} />
            </Field>

            <Field label="Kanal">
              <ChannelSelect value={channel} onChange={setChannel} />
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

      {editing && editForm ? (
        <form
          onSubmit={(event) => void saveEdit(event)}
          className="rounded-[20px] border border-[var(--accent)]/20 bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-[14px] font-semibold text-[var(--ink)]">
                Kampanyayı Düzenle
              </h2>
              <p className="mt-1 text-[8px] text-[var(--muted)]">
                Gerçekleşen harcama değiştiğinde finans kuyruğu otomatik güncellenir.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setEditForm(null);
              }}
              className="text-[9px] font-semibold text-[var(--muted)]"
            >
              Kapat
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Kampanya Adı">
              <input
                required
                className={fieldClass}
                value={editForm.name}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
              />
            </Field>

            <Field label="Amaç">
              <ObjectiveSelect
                value={editForm.objective}
                onChange={(value) =>
                  setEditForm({ ...editForm, objective: value })
                }
              />
            </Field>

            <Field label="Kanal">
              <ChannelSelect
                value={editForm.channel}
                onChange={(value) =>
                  setEditForm({ ...editForm, channel: value })
                }
              />
            </Field>

            <Field label="Planlanan Bütçe">
              <input
                type="number"
                min="0"
                step="0.01"
                className={fieldClass}
                value={editForm.plannedBudget}
                onChange={(e) =>
                  setEditForm({ ...editForm, plannedBudget: e.target.value })
                }
              />
            </Field>

            <Field label="Gerçekleşen Harcama">
              <input
                type="number"
                min="0"
                step="0.01"
                className={fieldClass}
                value={editForm.spentAmount}
                onChange={(e) =>
                  setEditForm({ ...editForm, spentAmount: e.target.value })
                }
              />
            </Field>

            <Field label="Başlangıç">
              <input
                type="datetime-local"
                className={fieldClass}
                value={editForm.startsAt}
                onChange={(e) =>
                  setEditForm({ ...editForm, startsAt: e.target.value })
                }
              />
            </Field>

            <Field label="Bitiş">
              <input
                type="datetime-local"
                className={fieldClass}
                value={editForm.endsAt}
                onChange={(e) =>
                  setEditForm({ ...editForm, endsAt: e.target.value })
                }
              />
            </Field>

            <label className="text-[10px] font-semibold text-[var(--muted)] md:col-span-2 xl:col-span-3">
              Not
              <textarea
                className={areaClass}
                value={editForm.notes}
                onChange={(e) =>
                  setEditForm({ ...editForm, notes: e.target.value })
                }
              />
            </label>
          </div>

          <div className="mt-5 flex justify-end">
            <Button disabled={saving} type="submit">
              {saving ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
            </Button>
          </div>
        </form>
      ) : null}

      {financeCampaign ? (
        <form
          onSubmit={(event) => void postToFinance(event)}
          className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-[14px] font-semibold text-[var(--ink)]">
                Finansa Aktar · {financeCampaign.name}
              </h2>
              <p className="mt-1 text-[8px] text-[var(--muted)]">
                {money.format(Number(financeCampaign.spentAmount || 0))} tutarındaki
                reklam gideri Accounts Payable kaydına dönüşecek.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFinanceCampaign(null)}
              className="text-[9px] font-semibold text-[var(--muted)]"
            >
              Kapat
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <Field label="Finans Tedarikçisi">
              <Select
                required
                className={fieldClass}
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">Tedarikçi seçin</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Fatura Numarası">
              <input
                className={fieldClass}
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="İsteğe bağlı"
              />
            </Field>

            <Field label="Vade Tarihi">
              <input
                type="date"
                className={fieldClass}
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </Field>
          </div>

          <div className="mt-5 flex justify-end">
            <Button disabled={saving || !supplierId} type="submit">
              {saving ? "Finansa Aktarılıyor..." : "Finansa Aktar"}
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
              <CampaignRow
                key={campaign.id}
                campaign={campaign}
                canManage={canManage}
                canFinanceRead={canFinanceRead}
                canFinanceManage={canFinanceManage}
                acting={actingId === campaign.id}
                onStatus={changeStatus}
                onEdit={openEdit}
                onFinance={openFinance}
              />
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

function CampaignRow({
  campaign,
  canManage,
  canFinanceRead,
  canFinanceManage,
  acting,
  onStatus,
  onEdit,
  onFinance,
}: {
  campaign: Campaign;
  canManage: boolean;
  canFinanceRead: boolean;
  canFinanceManage: boolean;
  acting: boolean;
  onStatus: (campaign: Campaign, status: string) => Promise<void>;
  onEdit: (campaign: Campaign) => void;
  onFinance: (campaign: Campaign) => void;
}) {
  const budget = Number(campaign.plannedBudget || 0);
  const spent = Number(campaign.spentAmount || 0);
  const revenue = Number(campaign.revenue || 0);
  const usage = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const roas = spent > 0 ? revenue / spent : null;

  return (
    <article className="p-4 transition hover:bg-[var(--surface-2)]/35 sm:p-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(230px,1.15fr)_minmax(170px,.75fr)_minmax(180px,.8fr)_minmax(175px,.8fr)_minmax(170px,.75fr)_minmax(240px,1.1fr)] xl:items-center">
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
          <Mini label="Talep" value={String(campaign.leadCount)} />
          <Mini label="Gelir" value={money.format(revenue)} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Mini
            label="Reklam Getirisi"
            value={roas == null ? "—" : roas.toFixed(2) + "x"}
          />
          <Mini
            label="Talep Maliyeti"
            value={
              campaign.leadCount > 0
                ? money.format(spent / campaign.leadCount)
                : "—"
            }
          />
        </div>

        <div>
          <span className="block text-[7px] text-[var(--muted)]">
            Finans Durumu
          </span>
          <FinanceBadge status={campaign.marketingFinanceStatus} spent={spent} />
          {canFinanceRead && campaign.supplierBillId ? (
            <p className="mt-1 text-[7px] text-[var(--muted-soft)]">
              Finans kaydı oluşturuldu
            </p>
          ) : null}
        </div>

        <CampaignActions
          campaign={campaign}
          canManage={canManage}
          canFinanceManage={canFinanceManage}
          acting={acting}
          onStatus={onStatus}
          onEdit={onEdit}
          onFinance={onFinance}
        />
      </div>
    </article>
  );
}

function CampaignActions({
  campaign,
  canManage,
  canFinanceManage,
  acting,
  onStatus,
  onEdit,
  onFinance,
}: {
  campaign: Campaign;
  canManage: boolean;
  canFinanceManage: boolean;
  acting: boolean;
  onStatus: (campaign: Campaign, status: string) => Promise<void>;
  onEdit: (campaign: Campaign) => void;
  onFinance: (campaign: Campaign) => void;
}) {
  const actions: Array<{ label: string; status: string; primary?: boolean }> =
    campaign.status === "DRAFT"
      ? [
          { label: "Planla", status: "PLANNED" },
          { label: "Başlat", status: "ACTIVE", primary: true },
          { label: "İptal", status: "CANCELLED" },
        ]
      : campaign.status === "PLANNED"
        ? [
            { label: "Başlat", status: "ACTIVE", primary: true },
            { label: "Taslağa Al", status: "DRAFT" },
            { label: "İptal", status: "CANCELLED" },
          ]
        : campaign.status === "ACTIVE"
          ? [
              { label: "Duraklat", status: "PAUSED" },
              { label: "Tamamla", status: "COMPLETED", primary: true },
              { label: "İptal", status: "CANCELLED" },
            ]
          : campaign.status === "PAUSED"
            ? [
                { label: "Devam Ettir", status: "ACTIVE", primary: true },
                { label: "Tamamla", status: "COMPLETED" },
                { label: "İptal", status: "CANCELLED" },
              ]
            : [];

  return (
    <div className="flex flex-wrap gap-1.5 xl:justify-end">
      {canManage && !["COMPLETED", "CANCELLED"].includes(campaign.status) ? (
        <button
          type="button"
          disabled={acting}
          onClick={() => onEdit(campaign)}
          className="h-8 rounded-[9px] border border-[var(--line)] px-2.5 text-[8px] font-semibold text-[var(--ink)] disabled:opacity-50"
        >
          Düzenle
        </button>
      ) : null}

      {actions.map((action) => (
        <button
          key={action.status}
          type="button"
          disabled={acting}
          onClick={() => void onStatus(campaign, action.status)}
          className={
            action.primary
              ? "h-8 rounded-[9px] bg-[var(--accent)] px-2.5 text-[8px] font-semibold text-white disabled:opacity-50"
              : action.status === "CANCELLED"
                ? "h-8 rounded-[9px] border border-[var(--line)] px-2.5 text-[8px] font-semibold text-[var(--danger)] disabled:opacity-50"
                : "h-8 rounded-[9px] border border-[var(--line)] px-2.5 text-[8px] font-semibold text-[var(--ink)] disabled:opacity-50"
          }
        >
          {acting ? "İşleniyor..." : action.label}
        </button>
      ))}

      {canFinanceManage &&
      Number(campaign.spentAmount || 0) > 0 &&
      campaign.marketingExpenseId &&
      campaign.marketingFinanceStatus !== "POSTED" ? (
        <button
          type="button"
          onClick={() => onFinance(campaign)}
          className="h-8 rounded-[9px] border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2.5 text-[8px] font-semibold text-[var(--accent)]"
        >
          Finansa Aktar
        </button>
      ) : null}

      {!canManage && !canFinanceManage ? (
        <span className="text-[8px] text-[var(--muted)]">Görüntüleme yetkisi</span>
      ) : null}
    </div>
  );
}

function ObjectiveSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={fieldClass}
    >
      <option value="LEAD_GENERATION">Potansiyel Müşteri Kazanımı</option>
      <option value="AWARENESS">Bilinirlik</option>
      <option value="APPOINTMENT">Randevu</option>
      <option value="SALES">Satış</option>
      <option value="RETENTION">Sadakat</option>
      <option value="REACTIVATION">Yeniden Kazanım</option>
    </Select>
  );
}

function ChannelSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={fieldClass}
    >
      <option value="META">Meta</option>
      <option value="GOOGLE_ADS">Google Ads</option>
      <option value="TIKTOK">TikTok</option>
      <option value="WHATSAPP">WhatsApp</option>
      <option value="MULTI_CHANNEL">Çoklu Kanal</option>
      <option value="OTHER">Diğer</option>
    </Select>
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
  attention,
}: {
  label: string;
  value: string;
  detail: string;
  attention?: boolean;
}) {
  return (
    <div
      className={
        attention
          ? "rounded-[18px] border border-[var(--warning)]/25 bg-[var(--warning-soft)] p-4"
          : "rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]"
      }
    >
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

function FinanceBadge({
  status,
  spent,
}: {
  status?: string | null;
  spent: number;
}) {
  const label = financeLabel(status, spent);
  const className =
    status === "POSTED"
      ? "mt-1 inline-flex rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--accent)]"
      : spent > 0
        ? "mt-1 inline-flex rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--warning)]"
        : "mt-1 inline-flex rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[7px] font-semibold text-[var(--muted)]";

  return <span className={className}>{label}</span>;
}
