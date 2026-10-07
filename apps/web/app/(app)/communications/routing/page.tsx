"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Spinner, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { userErrorMessage, userLabel } from "@/lib/user-language";

type Rule = {
  id: string;
  name: string;
  priority: number;
  active: boolean;
  provider?: string | null;
  campaignId?: string | null;
  targetBranchName?: string | null;
  targetUserId?: string | null;
  strategy: string;
  conditions?: {
    autoFollowUp?: boolean;
    followUpSlaMinutes?: number;
    followUpChannel?: string;
  } | null;
};

type Campaign = { id: string; name: string };

type RoutingOptions = {
  branches: Array<{ id: string; name: string; code: string }>;
  users: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  }>;
};

const strategyLabels: Record<string, string> = {
  FIXED: "Sabit Atama",
  ROUND_ROBIN: "Sırayla Dağıtım",
  LEAST_LOADED: "En Az Yoğun Personele",
};

const contactChannelLabels: Record<string, string> = {
  CALL: "Telefon",
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  EMAIL: "E-posta",
  IN_PERSON: "Yüz Yüze",
  OTHER: "Diğer",
};

const fieldClass =
  "mt-2 h-11 w-full rounded-[12px] border border-[var(--line)] bg-white px-3 text-[11px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

export default function RoutingPage() {
  const canManage = hasPermission("communications", "manage");

  const [rules, setRules] = useState<Rule[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [routingOptions, setRoutingOptions] = useState<RoutingOptions>({
    branches: [],
    users: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("");

  const [name, setName] = useState("");
  const [priority, setPriority] = useState("100");
  const [provider, setProvider] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [targetBranchId, setTargetBranchId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [strategy, setStrategy] = useState("FIXED");
  const [autoFollowUp, setAutoFollowUp] = useState(true);
  const [followUpSlaMinutes, setFollowUpSlaMinutes] = useState("15");
  const [followUpChannel, setFollowUpChannel] = useState("CALL");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [ruleRows, campaignRows, options] = await Promise.all([
        api<Rule[]>("/corporate-communications/routing-rules"),
        api<Campaign[]>("/corporate-communications/campaigns?limit=200"),
        api<RoutingOptions>("/corporate-communications/routing-options"),
      ]);
      setRules(ruleRows);
      setCampaigns(campaignRows);
      setRoutingOptions(options);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(
              e.message,
              "Talep dağıtım kuralları yüklenemedi.",
            )
          : "Talep dağıtım kuralları yüklenemedi.",
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
      total: rules.length,
      active: rules.filter((rule) => rule.active).length,
      autoFollowUp: rules.filter(
        (rule) => rule.active && rule.conditions?.autoFollowUp !== false,
      ).length,
      sources: new Set(
        rules
          .filter((rule) => rule.active && rule.provider)
          .map((rule) => rule.provider),
      ).size,
    }),
    [rules],
  );

  const filtered = useMemo(
    () =>
      rules.filter(
        (rule) =>
          !sourceFilter ||
          (sourceFilter === "ALL_SOURCES"
            ? !rule.provider
            : rule.provider === sourceFilter),
      ),
    [rules, sourceFilter],
  );

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await api("/corporate-communications/routing-rules", {
        method: "POST",
        body: {
          name,
          priority: Number(priority),
          provider: provider || undefined,
          campaignId: campaignId || undefined,
          targetBranchId: targetBranchId || undefined,
          targetUserId: targetUserId || undefined,
          strategy,
          conditions: {
            autoFollowUp,
            followUpSlaMinutes: Number(followUpSlaMinutes),
            followUpChannel,
          },
        },
      });

      setName("");
      setTargetBranchId("");
      setTargetUserId("");
      setProvider("");
      setCampaignId("");
      setPriority("100");
      setShowForm(false);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? userErrorMessage(
              err.message,
              "Talep dağıtım kuralı oluşturulamadı.",
            )
          : "Talep dağıtım kuralı oluşturulamadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(rule: Rule) {
    setActingId(rule.id);
    setError("");

    try {
      await api(
        "/corporate-communications/routing-rules/" + rule.id + "/status",
        {
          method: "PATCH",
          body: { active: !rule.active },
        },
      );
      setRules((current) =>
        current.map((item) =>
          item.id === rule.id ? { ...item, active: !rule.active } : item,
        ),
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? userErrorMessage(
              err.message,
              "Dağıtım kuralı durumu güncellenemedi.",
            )
          : "Dağıtım kuralı durumu güncellenemedi.",
      );
    } finally {
      setActingId("");
    }
  }

  if (loading && !rules.length) {
    return (
      <div className="py-20">
        <Spinner label="Talep dağıtım kuralları yükleniyor..." />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-12">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">
              Talep Yönetimi
            </p>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-.04em] text-[var(--ink)]">
              Talep Dağıtımı
            </h1>
            <p className="mt-2 max-w-4xl text-[12px] leading-5 text-[var(--muted)]">
              Hangi kaynaktan gelen talebin hangi şube veya sorumluya
              atanacağını, nasıl paylaştırılacağını ve ilk temasın kaç dakika
              içinde yapılacağını belirleyin.
            </p>
          </div>

          {canManage ? (
            <Button onClick={() => setShowForm((value) => !value)}>
              {showForm ? "Formu Kapat" : "Yeni Dağıtım Kuralı"}
            </Button>
          ) : null}
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Aktif Kural"
          value={stats.active}
          detail={stats.total + " toplam dağıtım kuralı"}
        />
        <Metric
          label="Otomatik Takip"
          value={stats.autoFollowUp}
          detail="İlk temas görevi oluşturan kural"
        />
        <Metric
          label="Kaynak Kapsamı"
          value={stats.sources}
          detail="Özel kural tanımlı kaynak"
        />
        <Metric
          label="Dağıtılabilir Sorumlu"
          value={routingOptions.users.length}
          detail={routingOptions.branches.length + " aktif şube"}
        />
      </section>

      {showForm && canManage ? (
        <form
          onSubmit={(event) => void create(event)}
          className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]"
        >
          <div className="mb-5">
            <h2 className="text-[14px] font-semibold text-[var(--ink)]">
              Yeni Dağıtım Kuralı
            </h2>
            <p className="mt-1 text-[8px] leading-4 text-[var(--muted)]">
              Kaynağı, hedefi ve ilk temas davranışını tek akışta tanımlayın.
              Daha küçük sıra numarası daha önce değerlendirilir.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Kural Adı" wide>
              <input
                required
                className={fieldClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Örn. Meta talepleri Anadolu Yakası"
              />
            </Field>

            <Field label="Çalışma Sırası">
              <input
                type="number"
                min="1"
                className={fieldClass}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
            </Field>

            <Field label="Talepler Nasıl Dağıtılsın?">
              <Select
                className={fieldClass}
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
              >
                <option value="FIXED">Belirli Şube / Sorumlu</option>
                <option value="ROUND_ROBIN">Sırayla Paylaştır</option>
                <option value="LEAST_LOADED">En Az Yoğun Personele</option>
              </Select>
            </Field>

            <Field label="Hangi Kaynaktan Gelenler?">
              <Select
                className={fieldClass}
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                <option value="">Tüm Kaynaklar</option>
                <option value="META">Meta</option>
                <option value="GOOGLE_ADS">Google Ads</option>
                <option value="TIKTOK">TikTok</option>
                <option value="WEBSITE">Web Sitesi</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="OTHER">Diğer</option>
              </Select>
            </Field>

            <Field label="Hangi Kampanyadan Gelenler?">
              <Select
                className={fieldClass}
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
              >
                <option value="">Tüm Kampanyalar</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Hangi Şubeye?">
              <Select
                className={fieldClass}
                value={targetBranchId}
                onChange={(e) => {
                  setTargetBranchId(e.target.value);
                  setTargetUserId("");
                }}
              >
                <option value="">Sistem Dağıtsın / Şube Seçilmedi</option>
                {routingOptions.branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Hangi Sorumluya?">
              <Select
                className={fieldClass}
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
              >
                <option value="">Sistem Dağıtsın / Sorumlu Seçilmedi</option>
                {routingOptions.users.map((user) => {
                  const fullName = [user.firstName, user.lastName]
                    .filter(Boolean)
                    .join(" ")
                    .trim();
                  return (
                    <option key={user.id} value={user.id}>
                      {fullName || user.email}
                    </option>
                  );
                })}
              </Select>
            </Field>
          </div>

          <div className="mt-5 rounded-[16px] bg-[var(--surface-2)] p-4">
            <label className="flex items-center gap-3 text-[10px] font-semibold text-[var(--ink)]">
              <input
                type="checkbox"
                checked={autoFollowUp}
                onChange={(e) => setAutoFollowUp(e.target.checked)}
              />
              CRM'e aktarıldığında otomatik ilk temas görevi oluştur
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="En Geç Kaç Dakikada Dönüş Yapılsın?">
                <input
                  type="number"
                  min="1"
                  max="10080"
                  disabled={!autoFollowUp}
                  className={fieldClass}
                  value={followUpSlaMinutes}
                  onChange={(e) => setFollowUpSlaMinutes(e.target.value)}
                />
              </Field>

              <Field label="İlk Temas Kanalı">
                <Select
                  disabled={!autoFollowUp}
                  className={fieldClass}
                  value={followUpChannel}
                  onChange={(e) => setFollowUpChannel(e.target.value)}
                >
                  <option value="CALL">Telefon</option>
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="SMS">SMS</option>
                  <option value="EMAIL">E-posta</option>
                  <option value="IN_PERSON">Yüz Yüze</option>
                  <option value="OTHER">Diğer</option>
                </Select>
              </Field>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <Button disabled={saving} type="submit">
              {saving ? "Kaydediliyor..." : "Kuralı Kaydet"}
            </Button>
          </div>
        </form>
      ) : null}

      <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--ink)]">
              Dağıtım Kuralları
            </h2>
            <p className="mt-1 text-[8px] text-[var(--muted)]">
              Kurallar çalışma sırasına göre uygulanır.
            </p>
          </div>

          <Select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="h-10 min-w-[170px] rounded-[11px] border border-[var(--line)] bg-white px-3 text-[10px]"
          >
            <option value="">Tüm Kurallar</option>
            <option value="ALL_SOURCES">Tüm Kaynak Kuralı</option>
            <option value="META">Meta</option>
            <option value="GOOGLE_ADS">Google Ads</option>
            <option value="TIKTOK">TikTok</option>
            <option value="WEBSITE">Web Sitesi</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="OTHER">Diğer</option>
          </Select>
        </div>

        {filtered.length ? (
          <div className="divide-y divide-[var(--line)]">
            {filtered.map((rule) => (
              <article
                key={rule.id}
                className="grid gap-4 p-4 transition hover:bg-[var(--surface-2)]/35 xl:grid-cols-[minmax(240px,1.1fr)_minmax(180px,.8fr)_minmax(190px,.85fr)_minmax(190px,.8fr)_140px] xl:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[11px] font-semibold text-[var(--ink)]">
                      {rule.name}
                    </p>
                    <span
                      className={
                        rule.active
                          ? "rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--accent)]"
                          : "rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[7px] font-semibold text-[var(--muted)]"
                      }
                    >
                      {rule.active ? "Aktif" : "Pasif"}
                    </span>
                  </div>
                  <p className="mt-1 text-[8px] text-[var(--muted)]">
                    Çalışma sırası {rule.priority} ·{" "}
                    {rule.provider
                      ? userLabel(rule.provider)
                      : "Tüm kaynaklar"}
                  </p>
                </div>

                <div>
                  <span className="block text-[7px] text-[var(--muted)]">
                    Dağıtım Yöntemi
                  </span>
                  <strong className="mt-1 block text-[9px] text-[var(--ink)]">
                    {strategyLabels[rule.strategy] ?? "Dağıtım kuralı"}
                  </strong>
                </div>

                <div>
                  <span className="block text-[7px] text-[var(--muted)]">
                    Hedef
                  </span>
                  <strong className="mt-1 block text-[9px] text-[var(--ink)]">
                    {rule.targetBranchName ??
                      (rule.targetUserId
                        ? "Belirli sorumlu"
                        : "Dinamik dağıtım")}
                  </strong>
                </div>

                <div>
                  <span className="block text-[7px] text-[var(--muted)]">
                    İlk Temas
                  </span>
                  <strong className="mt-1 block text-[9px] text-[var(--ink)]">
                    {rule.conditions?.autoFollowUp === false
                      ? "Otomatik takip kapalı"
                      : (rule.conditions?.followUpSlaMinutes ?? 15) +
                        " dk · " +
                        (contactChannelLabels[
                          rule.conditions?.followUpChannel ?? "CALL"
                        ] ?? "Telefon")}
                  </strong>
                </div>

                <div className="flex xl:justify-end">
                  {canManage ? (
                    <button
                      type="button"
                      disabled={actingId === rule.id}
                      onClick={() => void toggleRule(rule)}
                      className={
                        rule.active
                          ? "h-9 rounded-[10px] border border-[var(--line)] px-3 text-[8px] font-semibold text-[var(--muted)] transition hover:text-[var(--danger)] disabled:opacity-50"
                          : "h-9 rounded-[10px] bg-[var(--accent)] px-3 text-[8px] font-semibold text-white transition disabled:opacity-50"
                      }
                    >
                      {actingId === rule.id
                        ? "İşleniyor..."
                        : rule.active
                          ? "Pasifleştir"
                          : "Aktifleştir"}
                    </button>
                  ) : (
                    <span className="text-[8px] text-[var(--muted)]">
                      Görüntüleme yetkisi
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center text-[9px] text-[var(--muted)]">
            Seçili kapsamda dağıtım kuralı bulunamadı.
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
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
      <p className="text-[8px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">
        {label}
      </p>
      <strong className="mt-3 block text-[22px] font-semibold tracking-[-.04em] text-[var(--ink)]">
        {value}
      </strong>
      <p className="mt-2 text-[8px] text-[var(--muted)]">{detail}</p>
    </div>
  );
}
