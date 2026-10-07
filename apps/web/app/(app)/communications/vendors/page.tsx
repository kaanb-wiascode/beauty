"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MarketingFinanceTransferPanel } from "@/components/marketing-finance-transfer-panel";
import { Alert, Button, Spinner, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { userErrorMessage, userLabel } from "@/lib/user-language";
import { hasPermission } from "@/lib/auth";

type Vendor = {
  id: string;
  name: string;
  vendorType: string;
  status: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contractStartsAt?: string | null;
  contractEndsAt?: string | null;
  serviceScope?: string | null;
  monthlyFee: string | number;
  currency: string;
  paymentModel: string;
  kpiCommitments: Record<string, unknown>;
  performanceNotes?: string | null;
  attributedRevenue: string | number;
  marketingExpenseId?: string | null;
  marketingFinanceStatus?: string | null;
  supplierBillId?: string | null;
  financePeriod?: string | null;
};

const field =
  "mt-2 h-11 w-full rounded-[12px] border border-[var(--line)] bg-white px-3 text-[11px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const area =
  "mt-2 min-h-24 w-full rounded-[12px] border border-[var(--line)] bg-white p-3 text-[11px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

const types = [
  "SOCIAL_MEDIA_AGENCY",
  "AD_AGENCY",
  "PRODUCTION",
  "PHOTOGRAPHER",
  "INFLUENCER_AGENCY",
  "FREELANCER",
  "PR_AGENCY",
  "OTHER",
];

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
});

function formatDate(value?: string | null) {
  if (!value) return "Belirtilmedi";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default function MarketingVendorsPage() {
  const canManage = hasPermission("communications", "manage");
  const canFinanceManage = hasPermission("finance", "manage");
  const financePeriodSynced = useRef(false);
  const [rows, setRows] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [financeVendor, setFinanceVendor] = useState<Vendor | null>(null);

  const [name, setName] = useState("");
  const [vendorType, setVendorType] = useState("SOCIAL_MEDIA_AGENCY");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [serviceScope, setServiceScope] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [paymentModel, setPaymentModel] = useState("MONTHLY_RETAINER");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [targetRoas, setTargetRoas] = useState("");
  const [maxCpl, setMaxCpl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let syncWarning = "";

    try {
      if (canManage && !financePeriodSynced.current) {
        financePeriodSynced.current = true;
        try {
          await api("/corporate-communications/vendors/sync-finance-period", {
            method: "POST",
          });
        } catch (syncError) {
          syncWarning =
            syncError instanceof ApiError
              ? userErrorMessage(
                  syncError.message,
                  "Bu ayın ajans giderleri finans kuyruğuna hazırlanamadı.",
                )
              : "Bu ayın ajans giderleri finans kuyruğuna hazırlanamadı.";
        }
      }

      const q = new URLSearchParams({ limit: "100" });
      if (search.trim()) q.set("search", search.trim());
      setRows(
        await api<Vendor[]>(
          "/corporate-communications/vendors?" + q.toString(),
        ),
      );

      if (syncWarning) setError(syncWarning);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(
              e.message,
              "Ajans ve iş ortakları yüklenemedi.",
            )
          : "Ajans ve iş ortakları yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, [search, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const now = new Date();
    const inThirtyDays = new Date(
      now.getTime() + 30 * 24 * 60 * 60 * 1000,
    );

    const active = rows.filter((row) => row.status === "ACTIVE");
    const expiring = rows.filter((row) => {
      if (!row.contractEndsAt || !["ACTIVE", "PAUSED"].includes(row.status)) {
        return false;
      }
      const date = new Date(row.contractEndsAt);
      return date >= now && date <= inThirtyDays;
    });

    return {
      active: active.length,
      monthly: active.reduce(
        (sum, row) => sum + Number(row.monthlyFee || 0),
        0,
      ),
      revenue: rows.reduce(
        (sum, row) => sum + Number(row.attributedRevenue || 0),
        0,
      ),
      expiring: expiring.length,
      financePending: active.filter(
        (row) =>
          Number(row.monthlyFee || 0) > 0 &&
          row.marketingFinanceStatus !== "POSTED",
      ).length,
    };
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) => !statusFilter || row.status === statusFilter,
      ),
    [rows, statusFilter],
  );

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await api("/corporate-communications/vendors", {
        method: "POST",
        body: {
          name,
          vendorType,
          contactName: contactName || null,
          contactEmail: contactEmail || null,
          contactPhone: contactPhone || null,
          serviceScope: serviceScope || null,
          monthlyFee: Number(monthlyFee || 0),
          currency: "TRY",
          paymentModel,
          contractStartsAt: startsAt
            ? new Date(startsAt + "T00:00:00").toISOString()
            : null,
          contractEndsAt: endsAt
            ? new Date(endsAt + "T00:00:00").toISOString()
            : null,
          kpiCommitments: {
            ...(targetRoas ? { targetRoas: Number(targetRoas) } : {}),
            ...(maxCpl ? { maxCpl: Number(maxCpl) } : {}),
          },
          metadata: { source: "VENDOR_WORKSPACE" },
        },
      });

      setName("");
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setServiceScope("");
      setMonthlyFee("");
      setStartsAt("");
      setEndsAt("");
      setTargetRoas("");
      setMaxCpl("");
      setShowForm(false);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? userErrorMessage(err.message, "İş ortağı kaydedilemedi.")
          : "İş ortağı kaydedilemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setError("");
    try {
      await api("/corporate-communications/vendors/" + id, {
        method: "PATCH",
        body: { status },
      });
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? userErrorMessage(err.message, "Durum güncellenemedi.")
          : "Durum güncellenemedi.",
      );
    }
  }

  if (loading && !rows.length) {
    return (
      <div className="py-20">
        <Spinner label="Ajanslar ve iş ortakları yükleniyor..." />
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
              Ajanslar & İş Ortakları
            </h1>
            <p className="mt-2 max-w-4xl text-[12px] leading-5 text-[var(--muted)]">
              Sözleşme, hizmet kapsamı, aylık maliyet, performans hedefi ve
              ilişkilendirilen geliri aynı portföyden yönetin.
            </p>
          </div>

          {canManage ? (
            <Button onClick={() => setShowForm((value) => !value)}>
              {showForm ? "Formu Kapat" : "Yeni İş Ortağı"}
            </Button>
          ) : null}
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          label="Aktif İş Ortağı"
          value={String(stats.active)}
          detail={rows.length + " toplam kayıt"}
        />
        <Metric
          label="Aylık Sabit Maliyet"
          value={money.format(stats.monthly)}
          detail="Aktif sözleşmeler"
        />
        <Metric
          label="Atfedilen Gelir"
          value={money.format(stats.revenue)}
          detail="İş ortaklarına bağlanan gelir"
        />
        <Metric
          label="Sözleşmesi Yaklaşan"
          value={String(stats.expiring)}
          detail="30 gün içinde sona erecek"
          attention={stats.expiring > 0}
        />
        <Metric
          label="Finans Bekleyen"
          value={String(stats.financePending)}
          detail="Bu ay finans aktarımı tamamlanmamış"
          attention={stats.financePending > 0}
        />
      </section>

      {showForm && canManage ? (
        <form
          onSubmit={(event) => void create(event)}
          className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]"
        >
          <div className="mb-5">
            <h2 className="text-[14px] font-semibold text-[var(--ink)]">
              Yeni İş Ortağı
            </h2>
            <p className="mt-1 text-[8px] text-[var(--muted)]">
              Sözleşme ve performans beklentilerini birlikte kaydedin.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Firma Adı">
              <input
                required
                className={field}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <Field label="Tür">
              <Select
                className={field}
                value={vendorType}
                onChange={(e) => setVendorType(e.target.value)}
              >
                {types.map((item) => (
                  <option key={item} value={item}>
                    {userLabel(item)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Yetkili">
              <input
                className={field}
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </Field>

            <Field label="E-posta">
              <input
                type="email"
                className={field}
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </Field>

            <Field label="Telefon">
              <input
                className={field}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </Field>

            <Field label="Ödeme Modeli">
              <Select
                className={field}
                value={paymentModel}
                onChange={(e) => setPaymentModel(e.target.value)}
              >
                <option value="MONTHLY_RETAINER">Aylık Sabit Ücret</option>
                <option value="PROJECT">Proje Bazlı</option>
                <option value="PERFORMANCE">Performansa Göre</option>
                <option value="HOURLY">Saatlik</option>
                <option value="MIXED">Karma</option>
                <option value="OTHER">Diğer</option>
              </Select>
            </Field>

            <Field label="Aylık Ücret">
              <input
                type="number"
                min="0"
                className={field}
                value={monthlyFee}
                onChange={(e) => setMonthlyFee(e.target.value)}
              />
            </Field>

            <Field label="Sözleşme Başlangıcı">
              <input
                type="date"
                className={field}
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </Field>

            <Field label="Sözleşme Bitişi">
              <input
                type="date"
                className={field}
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </Field>

            <Field label="Hedef Reklam Getirisi">
              <input
                type="number"
                min="0"
                step="0.1"
                className={field}
                value={targetRoas}
                onChange={(e) => setTargetRoas(e.target.value)}
              />
            </Field>

            <Field label="En Yüksek Talep Maliyeti">
              <input
                type="number"
                min="0"
                className={field}
                value={maxCpl}
                onChange={(e) => setMaxCpl(e.target.value)}
              />
            </Field>

            <Field label="Hizmet Kapsamı" wide>
              <textarea
                className={area}
                value={serviceScope}
                onChange={(e) => setServiceScope(e.target.value)}
              />
            </Field>
          </div>

          <div className="mt-5 flex justify-end">
            <Button disabled={saving} type="submit">
              {saving ? "Kaydediliyor..." : "İş Ortağını Kaydet"}
            </Button>
          </div>
        </form>
      ) : null}

      {financeVendor?.marketingExpenseId ? (
        <MarketingFinanceTransferPanel
          expenseId={financeVendor.marketingExpenseId}
          title={financeVendor.name + " · Aylık Hizmet Bedeli"}
          amountLabel={money.format(Number(financeVendor.monthlyFee || 0))}
          onClose={() => setFinanceVendor(null)}
          onDone={async () => {
            setFinanceVendor(null);
            await load();
          }}
        />
      ) : null}

      <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--ink)]">
              İş Ortağı Portföyü
            </h2>
            <p className="mt-1 text-[8px] text-[var(--muted)]">
              {filtered.length} kayıt gösteriliyor
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="h-10 min-w-[240px] rounded-[11px] border border-[var(--line)] bg-white px-3 text-[10px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              placeholder="Firma veya yetkili ara…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 min-w-[145px] rounded-[11px] border border-[var(--line)] bg-white px-3 text-[10px]"
            >
              <option value="">Tüm Durumlar</option>
              <option value="ACTIVE">Aktif</option>
              <option value="PAUSED">Duraklatıldı</option>
              <option value="ENDED">Sona Erdi</option>
              <option value="BLACKLISTED">Kullanım Dışı</option>
            </Select>
          </div>
        </div>

        {filtered.length ? (
          <div className="divide-y divide-[var(--line)]">
            {filtered.map((vendor) => (
              <article
                key={vendor.id}
                className="grid gap-4 p-4 transition hover:bg-[var(--surface-2)]/35 xl:grid-cols-[minmax(230px,1.15fr)_minmax(200px,.9fr)_minmax(190px,.8fr)_150px_minmax(190px,.85fr)] xl:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[11px] font-semibold text-[var(--ink)]">
                      {vendor.name}
                    </p>
                    <Badge text={vendor.status} />
                  </div>
                  <p className="mt-1 text-[8px] text-[var(--muted)]">
                    {userLabel(vendor.vendorType)} ·{" "}
                    {vendor.contactName ?? "Yetkili tanımsız"}
                  </p>
                  <p className="mt-1 text-[8px] text-[var(--muted-soft)]">
                    {vendor.contactEmail ?? vendor.contactPhone ?? "İletişim bilgisi yok"}
                  </p>
                </div>

                <div>
                  <p className="line-clamp-2 text-[8px] leading-4 text-[var(--muted)]">
                    {vendor.serviceScope ?? "Hizmet kapsamı belirtilmedi."}
                  </p>
                  <p className="mt-2 text-[8px] text-[var(--muted-soft)]">
                    {formatDate(vendor.contractStartsAt)} →{" "}
                    {formatDate(vendor.contractEndsAt)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Mini
                    label="Aylık Ücret"
                    value={money.format(Number(vendor.monthlyFee || 0))}
                  />
                  <Mini
                    label="Atfedilen Gelir"
                    value={money.format(Number(vendor.attributedRevenue || 0))}
                  />
                </div>

                <div>
                  <span className="block text-[7px] text-[var(--muted)]">
                    Finans · {vendor.financePeriod ?? "Bu Ay"}
                  </span>
                  <FinanceBadge
                    status={vendor.marketingFinanceStatus}
                    amount={Number(vendor.monthlyFee || 0)}
                  />
                </div>

                <div className="flex flex-wrap gap-2 xl:justify-end">
                  {canManage ? (
                    vendor.status === "ACTIVE" ? (
                      <Button
                        variant="secondary"
                        onClick={() => void setStatus(vendor.id, "PAUSED")}
                      >
                        Duraklat
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => void setStatus(vendor.id, "ACTIVE")}
                      >
                        Aktifleştir
                      </Button>
                    )
                  ) : null}

                  {canFinanceManage &&
                  Number(vendor.monthlyFee || 0) > 0 &&
                  vendor.marketingExpenseId &&
                  vendor.marketingFinanceStatus !== "POSTED" ? (
                    <button
                      type="button"
                      onClick={() => setFinanceVendor(vendor)}
                      className="h-9 rounded-[10px] border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 text-[8px] font-semibold text-[var(--accent)]"
                    >
                      Finansa Aktar
                    </button>
                  ) : null}

                  {!canManage &&
                  !(canFinanceManage &&
                    vendor.marketingExpenseId &&
                    vendor.marketingFinanceStatus !== "POSTED") ? (
                    <span className="text-[8px] text-[var(--muted)]">
                      {userLabel(vendor.paymentModel)}
                    </span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center text-[9px] text-[var(--muted)]">
            Seçili filtrelerde iş ortağı bulunamadı.
          </div>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label
      className={
        wide
          ? "text-[10px] font-semibold text-[var(--muted)] md:col-span-2 xl:col-span-3"
          : "text-[10px] font-semibold text-[var(--muted)]"
      }
    >
      {label}
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
      <p className="mt-3 text-[21px] font-semibold tracking-[-.04em] text-[var(--ink)]">
        {value}
      </p>
      <p className="mt-2 text-[8px] text-[var(--muted)]">{detail}</p>
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

function FinanceBadge({
  status,
  amount,
}: {
  status?: string | null;
  amount: number;
}) {
  const label =
    amount <= 0
      ? "Ücret Yok"
      : status === "POSTED"
        ? "Finansa Aktarıldı"
        : status === "APPROVED"
          ? "Finansa Hazır"
          : "Finans Bekliyor";

  return (
    <span
      className={
        status === "POSTED"
          ? "mt-1 inline-flex rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--accent)]"
          : amount > 0
            ? "mt-1 inline-flex rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--warning)]"
            : "mt-1 inline-flex rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[7px] font-semibold text-[var(--muted)]"
      }
    >
      {label}
    </span>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--accent)]">
      {userLabel(text)}
    </span>
  );
}
