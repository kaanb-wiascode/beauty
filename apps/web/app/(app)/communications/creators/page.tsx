"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { MarketingFinanceTransferPanel } from "@/components/marketing-finance-transfer-panel";
import { Alert, Button, Spinner, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { userErrorMessage, userLabel } from "@/lib/user-language";

type Creator = {
  id: string;
  displayName: string;
  category?: string | null;
  status: string;
  primaryPlatform: string;
  handle: string;
  followerCount: string | number;
  engagementRate?: string | number | null;
  rateCard: Record<string, unknown>;
  attributedRevenue: string | number;
  collaborationCount: number;
};

type Collaboration = {
  id: string;
  status: string;
  feeAmount: string | number;
  currency: string;
  couponCode?: string | null;
  deliverables: Array<{
    platform: string;
    format: string;
    quantity: number;
  }>;
  attributedRevenue: string | number;
  marketingExpenseId?: string | null;
  marketingFinanceStatus?: string | null;
  supplierBillId?: string | null;
};

const field =
  "mt-2 h-11 w-full rounded-[12px] border border-[var(--line)] bg-white px-3 text-[11px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat("tr-TR");

export default function CreatorsPage() {
  const canManage = hasPermission("communications", "manage");
  const canFinanceManage = hasPermission("finance", "manage");
  const [rows, setRows] = useState<Creator[]>([]);
  const [selected, setSelected] = useState<Creator | null>(null);
  const [collabs, setCollabs] = useState<Collaboration[]>([]);
  const [financeCollaboration, setFinanceCollaboration] =
    useState<Collaboration | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("INSTAGRAM");
  const [handle, setHandle] = useState("");
  const [followers, setFollowers] = useState("");
  const [engagement, setEngagement] = useState("");
  const [category, setCategory] = useState("");
  const [reelRate, setReelRate] = useState("");
  const [storyRate, setStoryRate] = useState("");
  const [fee, setFee] = useState("");
  const [coupon, setCoupon] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(
        await api<Creator[]>(
          "/corporate-communications/creators?limit=100",
        ),
      );
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(
              e.message,
              "İçerik üreticisi kayıtları yüklenemedi.",
            )
          : "İçerik üreticisi kayıtları yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(
    () => ({
      active: rows.filter((r) => r.status === "ACTIVE").length,
      reach: rows.reduce((s, r) => s + Number(r.followerCount || 0), 0),
      revenue: rows.reduce(
        (s, r) => s + Number(r.attributedRevenue || 0),
        0,
      ),
      collabs: rows.reduce(
        (s, r) => s + Number(r.collaborationCount || 0),
        0,
      ),
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    return rows.filter((row) => {
      const matchesSearch =
        !needle ||
        row.displayName.toLocaleLowerCase("tr-TR").includes(needle) ||
        row.handle.toLocaleLowerCase("tr-TR").includes(needle) ||
        (row.category ?? "").toLocaleLowerCase("tr-TR").includes(needle);
      const matchesPlatform =
        !platformFilter || row.primaryPlatform === platformFilter;
      const matchesStatus = !statusFilter || row.status === statusFilter;
      return matchesSearch && matchesPlatform && matchesStatus;
    });
  }, [rows, search, platformFilter, statusFilter]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await api("/corporate-communications/creators", {
        method: "POST",
        body: {
          displayName: name,
          category: category || null,
          primaryPlatform: platform,
          handle,
          followerCount: Number(followers || 0),
          engagementRate: engagement ? Number(engagement) : null,
          audienceProfile: {},
          rateCard: {
            ...(reelRate ? { reel: Number(reelRate) } : {}),
            ...(storyRate ? { story: Number(storyRate) } : {}),
          },
          metadata: { source: "CREATOR_CRM" },
        },
      });

      setName("");
      setHandle("");
      setFollowers("");
      setEngagement("");
      setCategory("");
      setReelRate("");
      setStoryRate("");
      setShowForm(false);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? userErrorMessage(err.message, "İçerik üreticisi kaydedilemedi.")
          : "İçerik üreticisi kaydedilemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function openCreator(row: Creator) {
    setSelected(row);
    setError("");
    try {
      setCollabs(
        await api<Collaboration[]>(
          "/corporate-communications/creators/" +
            row.id +
            "/collaborations",
        ),
      );
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(e.message, "İş birlikleri yüklenemedi.")
          : "İş birlikleri yüklenemedi.",
      );
    }
  }

  async function addCollaboration() {
    if (!selected) return;
    setSaving(true);
    setError("");

    try {
      await api(
        "/corporate-communications/creators/" +
          selected.id +
          "/collaborations",
        {
          method: "POST",
          body: {
            status: "CONTRACTED",
            feeAmount: Number(fee || 0),
            currency: "TRY",
            couponCode: coupon || null,
            deliverables: [
              {
                platform: selected.primaryPlatform,
                format: "REEL",
                quantity: 1,
              },
            ],
            performance: {},
            notes: null,
          },
        },
      );
      setFee("");
      setCoupon("");
      await openCreator(selected);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(e.message, "İş birliği oluşturulamadı.")
          : "İş birliği oluşturulamadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading && !rows.length) {
    return (
      <div className="py-20">
        <Spinner label="İçerik üreticileri yükleniyor..." />
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
              İçerik Üreticileri
            </h1>
            <p className="mt-2 max-w-4xl text-[12px] leading-5 text-[var(--muted)]">
              Creator profillerini, erişim ve etkileşim gücünü, ücretleri,
              iş birliklerini ve ilişkilendirilen geliri tek merkezden yönetin.
            </p>
          </div>

          {canManage ? (
            <Button onClick={() => setShowForm((value) => !value)}>
              {showForm ? "Formu Kapat" : "Yeni İçerik Üreticisi"}
            </Button>
          ) : null}
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Aktif İçerik Üreticisi"
          value={String(stats.active)}
          detail={rows.length + " toplam profil"}
        />
        <Metric
          label="Toplam Takipçi"
          value={number.format(stats.reach)}
          detail="Kayıtlı profillerin erişim tabanı"
        />
        <Metric
          label="Toplam İş Birliği"
          value={String(stats.collabs)}
          detail="Kayıtlı creator anlaşmaları"
        />
        <Metric
          label="Atfedilen Gelir"
          value={money.format(stats.revenue)}
          detail="İş birliklerine bağlanan gelir"
        />
      </section>

      {showForm && canManage ? (
        <form
          onSubmit={(event) => void create(event)}
          className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]"
        >
          <div className="mb-5">
            <h2 className="text-[14px] font-semibold text-[var(--ink)]">
              Yeni İçerik Üreticisi
            </h2>
            <p className="mt-1 text-[8px] text-[var(--muted)]">
              Profil erişimi ve temel ücret kartını kaydedin.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Görünen Ad" wide>
              <input
                required
                className={field}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <Field label="Platform">
              <Select
                className={field}
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                <option value="INSTAGRAM">Instagram</option>
                <option value="TIKTOK">TikTok</option>
                <option value="YOUTUBE">YouTube</option>
                <option value="FACEBOOK">Facebook</option>
                <option value="LINKEDIN">LinkedIn</option>
                <option value="OTHER">Diğer</option>
              </Select>
            </Field>

            <Field label="Kullanıcı Adı">
              <input
                required
                className={field}
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
              />
            </Field>

            <Field label="Kategori">
              <input
                className={field}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </Field>

            <Field label="Takipçi">
              <input
                type="number"
                min="0"
                className={field}
                value={followers}
                onChange={(e) => setFollowers(e.target.value)}
              />
            </Field>

            <Field label="Etkileşim Oranı (%)">
              <input
                type="number"
                min="0"
                step="0.01"
                className={field}
                value={engagement}
                onChange={(e) => setEngagement(e.target.value)}
              />
            </Field>

            <Field label="Kısa Video Ücreti">
              <input
                type="number"
                min="0"
                className={field}
                value={reelRate}
                onChange={(e) => setReelRate(e.target.value)}
              />
            </Field>

            <Field label="Hikâye Ücreti">
              <input
                type="number"
                min="0"
                className={field}
                value={storyRate}
                onChange={(e) => setStoryRate(e.target.value)}
              />
            </Field>
          </div>

          <div className="mt-5 flex justify-end">
            <Button disabled={saving} type="submit">
              {saving ? "Kaydediliyor..." : "İçerik Üreticisini Kaydet"}
            </Button>
          </div>
        </form>
      ) : null}

      <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--ink)]">
              İçerik Üreticisi Portföyü
            </h2>
            <p className="mt-1 text-[8px] text-[var(--muted)]">
              {filtered.length} profil gösteriliyor
            </p>
          </div>

          <div className="flex flex-col gap-2 md:flex-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="İsim, kullanıcı adı veya kategori ara…"
              className="h-10 min-w-[250px] rounded-[11px] border border-[var(--line)] bg-white px-3 text-[10px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            />

            <Select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="h-10 min-w-[140px] rounded-[11px] border border-[var(--line)] bg-white px-3 text-[10px]"
            >
              <option value="">Tüm Platformlar</option>
              {["INSTAGRAM", "TIKTOK", "YOUTUBE", "FACEBOOK", "LINKEDIN"].map(
                (item) => (
                  <option key={item} value={item}>
                    {userLabel(item)}
                  </option>
                ),
              )}
            </Select>

            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 min-w-[130px] rounded-[11px] border border-[var(--line)] bg-white px-3 text-[10px]"
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
            {filtered.map((row) => (
              <button
                type="button"
                key={row.id}
                onClick={() => void openCreator(row)}
                className="grid w-full gap-4 p-4 text-left transition hover:bg-[var(--surface-2)]/35 xl:grid-cols-[minmax(250px,1.3fr)_minmax(230px,1fr)_minmax(210px,.9fr)_130px] xl:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[11px] font-semibold text-[var(--ink)]">
                      {row.displayName}
                    </p>
                    <Badge text={row.status} />
                  </div>
                  <p className="mt-1 text-[8px] text-[var(--muted)]">
                    @{row.handle} · {userLabel(row.primaryPlatform)}
                  </p>
                  <p className="mt-1 text-[8px] text-[var(--muted-soft)]">
                    {row.category ?? "Kategori belirtilmedi"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Mini
                    label="Takipçi"
                    value={number.format(Number(row.followerCount || 0))}
                  />
                  <Mini
                    label="Etkileşim"
                    value={
                      row.engagementRate == null
                        ? "—"
                        : String(row.engagementRate) + "%"
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Mini
                    label="İş Birliği"
                    value={String(row.collaborationCount)}
                  />
                  <Mini
                    label="Atfedilen Gelir"
                    value={money.format(Number(row.attributedRevenue || 0))}
                  />
                </div>

                <span className="text-[9px] font-semibold text-[var(--accent)] xl:text-right">
                  Detay →
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center text-[9px] text-[var(--muted)]">
            Seçili filtrelerde içerik üreticisi bulunamadı.
          </div>
        )}
      </section>

      {financeCollaboration?.marketingExpenseId && selected ? (
        <MarketingFinanceTransferPanel
          expenseId={financeCollaboration.marketingExpenseId}
          title={selected.displayName + " · İçerik Üreticisi İş Birliği"}
          amountLabel={money.format(Number(financeCollaboration.feeAmount || 0))}
          onClose={() => setFinanceCollaboration(null)}
          onDone={async () => {
            setFinanceCollaboration(null);
            await openCreator(selected);
          }}
        />
      ) : null}

      {selected ? (
        <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-[14px] font-semibold text-[var(--ink)]">
                {selected.displayName} · İş Birlikleri
              </h2>
              <p className="mt-1 text-[8px] text-[var(--muted)]">
                @{selected.handle} · {userLabel(selected.primaryPlatform)}
              </p>
            </div>

            {canManage ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="h-10 rounded-[11px] border border-[var(--line)] px-3 text-[10px]"
                  placeholder="Ücret"
                  type="number"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                />
                <input
                  className="h-10 rounded-[11px] border border-[var(--line)] px-3 text-[10px]"
                  placeholder="Kupon"
                  value={coupon}
                  onChange={(e) => setCoupon(e.target.value)}
                />
                <Button
                  disabled={saving}
                  onClick={() => void addCollaboration()}
                >
                  İş Birliği Ekle
                </Button>
              </div>
            ) : null}
          </div>

          {collabs.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {collabs.map((collaboration) => (
                <div
                  key={collaboration.id}
                  className="rounded-[14px] border border-[var(--line)] p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge text={collaboration.status} />
                    <p className="text-[10px] font-semibold text-[var(--ink)]">
                      {money.format(Number(collaboration.feeAmount || 0))}
                    </p>
                  </div>
                  <p className="mt-3 text-[8px] text-[var(--muted)]">
                    {collaboration.couponCode
                      ? "Kupon: " + collaboration.couponCode
                      : "Kupon yok"}{" "}
                    ·{" "}
                    {collaboration.deliverables.reduce(
                      (sum, item) => sum + item.quantity,
                      0,
                    )}{" "}
                    içerik
                  </p>
                  <p className="mt-2 text-[8px] text-[var(--muted)]">
                    Atfedilen gelir{" "}
                    {money.format(
                      Number(collaboration.attributedRevenue || 0),
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-3">
                    <div>
                      <span className="block text-[7px] text-[var(--muted)]">
                        Finans
                      </span>
                      <FinanceBadge
                        status={collaboration.marketingFinanceStatus}
                        amount={Number(collaboration.feeAmount || 0)}
                      />
                    </div>

                    {canFinanceManage &&
                    Number(collaboration.feeAmount || 0) > 0 &&
                    collaboration.marketingExpenseId &&
                    collaboration.marketingFinanceStatus !== "POSTED" ? (
                      <button
                        type="button"
                        onClick={() => setFinanceCollaboration(collaboration)}
                        className="h-8 rounded-[9px] border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2.5 text-[8px] font-semibold text-[var(--accent)]"
                      >
                        Finansa Aktar
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-[9px] text-[var(--muted)]">
              Bu içerik üreticisi için henüz iş birliği bulunmuyor.
            </p>
          )}
        </section>
      ) : null}
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
          ? "text-[10px] font-semibold text-[var(--muted)] md:col-span-2"
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
