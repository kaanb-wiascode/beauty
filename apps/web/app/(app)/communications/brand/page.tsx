"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Spinner, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { userErrorMessage, userLabel } from "@/lib/user-language";

type Asset = {
  id: string;
  name: string;
  assetType: string;
  externalUrl?: string | null;
  storageKey?: string | null;
  version?: string | null;
  usageRules?: string | null;
};

type GovernanceProfile = {
  id: string;
  branchId: string | null;
  branchName?: string | null;
  name: string;
  toneOfVoice?: string | null;
  brandPersonality: string[];
  allowedPhrases: string[];
  forbiddenPhrases: string[];
  hashtagRules: {
    required?: string[];
    preferred?: string[];
    forbidden?: string[];
    maxCount?: number | null;
    notes?: string | null;
  };
  colorTokens: Array<{ name: string; hex: string; usage?: string }>;
  fontTokens: Array<{
    name: string;
    family: string;
    role: string;
    weight?: string;
    usage?: string;
  }>;
  logoRules: {
    allowedBackgrounds?: string[];
    forbiddenUses?: string[];
    safeArea?: string | null;
    minimumSize?: string | null;
    notes?: string | null;
  };
  contentRules: {
    requiredDisclosures?: string[];
    forbiddenClaims?: string[];
    ctaGuidelines?: string | null;
    visualGuidelines?: string | null;
    notes?: string | null;
  };
  revision: number;
};

type GovernanceResponse = {
  profiles: GovernanceProfile[];
  companyDefault: GovernanceProfile | null;
  branchOverride: GovernanceProfile | null;
};

type ContextOptions = {
  activeBranchId: string | null;
  branches: Array<{ id: string; name: string }>;
};

const fieldClass =
  "mt-2 h-11 w-full rounded-[12px] border border-[var(--line)] bg-white px-3 text-[11px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const areaClass =
  "mt-2 min-h-24 w-full rounded-[12px] border border-[var(--line)] bg-white p-3 text-[11px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

const split = (value: string) =>
  value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
const join = (values?: string[]) => values?.join("\n") ?? "";

export default function BrandCenterPage() {
  const canManage = hasPermission("communications", "manage");

  const [rows, setRows] = useState<Asset[]>([]);
  const [governance, setGovernance] = useState<GovernanceResponse | null>(null);
  const [context, setContext] = useState<ContextOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [error, setError] = useState("");
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [showAssetForm, setShowAssetForm] = useState(false);

  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState("GUIDELINE");
  const [externalUrl, setExternalUrl] = useState("");
  const [version, setVersion] = useState("");
  const [usageRules, setUsageRules] = useState("");

  const [policyName, setPolicyName] = useState("");
  const [tone, setTone] = useState("");
  const [personality, setPersonality] = useState("");
  const [allowed, setAllowed] = useState("");
  const [forbidden, setForbidden] = useState("");
  const [requiredHashtags, setRequiredHashtags] = useState("");
  const [preferredHashtags, setPreferredHashtags] = useState("");
  const [forbiddenHashtags, setForbiddenHashtags] = useState("");
  const [maxHashtags, setMaxHashtags] = useState("8");
  const [primaryColor, setPrimaryColor] = useState("#00BF63");
  const [bodyFont, setBodyFont] = useState("Inter");
  const [logoForbidden, setLogoForbidden] = useState("");
  const [forbiddenClaims, setForbiddenClaims] = useState("");
  const [ctaGuidelines, setCtaGuidelines] = useState("");
  const [visualGuidelines, setVisualGuidelines] = useState("");

  const activeProfile = useMemo(
    () => governance?.branchOverride ?? governance?.companyDefault ?? null,
    [governance],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [assets, policies, ctx] = await Promise.all([
        api<Asset[]>("/corporate-communications/brand-assets"),
        api<GovernanceResponse>("/corporate-communications/brand-governance"),
        api<ContextOptions>("/auth/context/options"),
      ]);
      setRows(assets);
      setGovernance(policies);
      setContext(ctx);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(e.message, "Marka merkezi yüklenemedi.")
          : "Marka merkezi yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!activeProfile) {
      setPolicyName(
        context?.activeBranchId
          ? "Şube Marka Politikası"
          : "Şirket Marka Politikası",
      );
      return;
    }

    setPolicyName(activeProfile.name);
    setTone(activeProfile.toneOfVoice ?? "");
    setPersonality(join(activeProfile.brandPersonality));
    setAllowed(join(activeProfile.allowedPhrases));
    setForbidden(join(activeProfile.forbiddenPhrases));
    setRequiredHashtags(join(activeProfile.hashtagRules.required));
    setPreferredHashtags(join(activeProfile.hashtagRules.preferred));
    setForbiddenHashtags(join(activeProfile.hashtagRules.forbidden));
    setMaxHashtags(String(activeProfile.hashtagRules.maxCount ?? 8));
    setPrimaryColor(activeProfile.colorTokens[0]?.hex ?? "#00BF63");
    setBodyFont(
      activeProfile.fontTokens.find((font) => font.role === "BODY")?.family ??
        "Inter",
    );
    setLogoForbidden(join(activeProfile.logoRules.forbiddenUses));
    setForbiddenClaims(join(activeProfile.contentRules.forbiddenClaims));
    setCtaGuidelines(activeProfile.contentRules.ctaGuidelines ?? "");
    setVisualGuidelines(activeProfile.contentRules.visualGuidelines ?? "");
  }, [activeProfile, context?.activeBranchId]);

  async function createAsset(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await api("/corporate-communications/brand-assets", {
        method: "POST",
        body: {
          name,
          assetType,
          externalUrl,
          version: version || undefined,
          usageRules: usageRules || undefined,
        },
      });
      setName("");
      setExternalUrl("");
      setVersion("");
      setUsageRules("");
      setShowAssetForm(false);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? userErrorMessage(err.message, "Marka varlığı oluşturulamadı.")
          : "Marka varlığı oluşturulamadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function savePolicy(event: FormEvent) {
    event.preventDefault();
    setPolicySaving(true);
    setError("");

    try {
      await api("/corporate-communications/brand-governance", {
        method: "POST",
        body: {
          branchId: context?.activeBranchId ?? null,
          name: policyName,
          toneOfVoice: tone || null,
          brandPersonality: split(personality),
          allowedPhrases: split(allowed),
          forbiddenPhrases: split(forbidden),
          hashtagRules: {
            required: split(requiredHashtags),
            preferred: split(preferredHashtags),
            forbidden: split(forbiddenHashtags),
            maxCount: Number(maxHashtags) || 0,
          },
          colorTokens: primaryColor
            ? [{ name: "Ana Renk", hex: primaryColor, usage: "Ana marka rengi" }]
            : [],
          fontTokens: bodyFont
            ? [{ name: "Gövde", family: bodyFont, role: "BODY" }]
            : [],
          logoRules: {
            allowedBackgrounds: [],
            forbiddenUses: split(logoForbidden),
          },
          contentRules: {
            requiredDisclosures: [],
            forbiddenClaims: split(forbiddenClaims),
            ctaGuidelines: ctaGuidelines || null,
            visualGuidelines: visualGuidelines || null,
          },
        },
      });
      setShowPolicyForm(false);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? userErrorMessage(err.message, "Marka politikası kaydedilemedi.")
          : "Marka politikası kaydedilemedi.",
      );
    } finally {
      setPolicySaving(false);
    }
  }

  if (loading && !rows.length && !governance) {
    return (
      <div className="py-20">
        <Spinner label="Marka merkezi yükleniyor..." />
      </div>
    );
  }

  const activeBranchName = context?.activeBranchId
    ? context.branches.find((branch) => branch.id === context.activeBranchId)
        ?.name
    : "Şirket Geneli";

  return (
    <div className="space-y-5 pb-12">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">
              Kurumsal İletişim
            </p>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-.04em] text-[var(--ink)]">
              Marka Merkezi
            </h1>
            <p className="mt-2 max-w-4xl text-[12px] leading-5 text-[var(--muted)]">
              İletişim dili, görsel kimlik, logo kullanımı, içerik kuralları ve
              marka varlıklarını tek merkezden yönetin.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/communications/assets">
              <Button variant="secondary">Varlık Kütüphanesi</Button>
            </Link>
            {canManage ? (
              <Button onClick={() => setShowPolicyForm((value) => !value)}>
                {showPolicyForm
                  ? "Düzenlemeyi Kapat"
                  : activeProfile
                    ? "Politikayı Düzenle"
                    : "Politika Oluştur"}
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Marka Politikası"
          value={activeProfile ? "Tanımlı" : "Eksik"}
          detail={activeBranchName ?? "Şirket Geneli"}
          attention={!activeProfile}
        />
        <Metric
          label="Politika Revizyonu"
          value={activeProfile ? "Rev. " + activeProfile.revision : "—"}
          detail="Son geçerli politika sürümü"
        />
        <Metric
          label="Marka Varlığı"
          value={String(rows.length)}
          detail="Kayıtlı logo, kılavuz ve materyal"
        />
        <Metric
          label="Ana Marka Rengi"
          value={activeProfile?.colorTokens[0]?.hex ?? "—"}
          detail="Aktif kapsam için tanımlı"
        />
      </section>

      {showPolicyForm && canManage ? (
        <form
          onSubmit={(event) => void savePolicy(event)}
          className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]"
        >
          <div className="mb-5">
            <h2 className="text-[14px] font-semibold text-[var(--ink)]">
              Marka Politikasını Düzenle
            </h2>
            <p className="mt-1 text-[8px] text-[var(--muted)]">
              Aktif kapsam: {activeBranchName ?? "Şirket Geneli"}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Politika Adı">
              <input
                required
                className={fieldClass}
                value={policyName}
                onChange={(e) => setPolicyName(e.target.value)}
              />
            </Field>

            <Field label="Ana Marka Rengi">
              <input
                required
                pattern="#[0-9A-Fa-f]{6}"
                className={fieldClass}
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
              />
            </Field>

            <Field label="İletişim Dili ve Tonu" wide>
              <textarea
                className={areaClass}
                value={tone}
                onChange={(e) => setTone(e.target.value)}
              />
            </Field>

            <Field label="Marka Kişiliği">
              <textarea
                className={areaClass}
                placeholder="premium, modern, güvenilir"
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
              />
            </Field>

            <Field label="Ana Yazı Tipi">
              <input
                className={fieldClass}
                value={bodyFont}
                onChange={(e) => setBodyFont(e.target.value)}
              />
            </Field>

            <Field label="İzinli İfadeler">
              <textarea
                className={areaClass}
                value={allowed}
                onChange={(e) => setAllowed(e.target.value)}
              />
            </Field>

            <Field label="Yasaklı İfadeler">
              <textarea
                className={areaClass}
                value={forbidden}
                onChange={(e) => setForbidden(e.target.value)}
              />
            </Field>

            <Field label="Zorunlu Etiketler">
              <textarea
                className={areaClass}
                value={requiredHashtags}
                onChange={(e) => setRequiredHashtags(e.target.value)}
              />
            </Field>

            <Field label="Tercih Edilen Etiketler">
              <textarea
                className={areaClass}
                value={preferredHashtags}
                onChange={(e) => setPreferredHashtags(e.target.value)}
              />
            </Field>

            <Field label="Yasak Etiketler">
              <textarea
                className={areaClass}
                value={forbiddenHashtags}
                onChange={(e) => setForbiddenHashtags(e.target.value)}
              />
            </Field>

            <Field label="Maksimum Etiket Sayısı">
              <input
                type="number"
                min="0"
                max="100"
                className={fieldClass}
                value={maxHashtags}
                onChange={(e) => setMaxHashtags(e.target.value)}
              />
            </Field>

            <Field label="Logo Yasak Kullanımları">
              <textarea
                className={areaClass}
                value={logoForbidden}
                onChange={(e) => setLogoForbidden(e.target.value)}
              />
            </Field>

            <Field label="Yasak İddialar">
              <textarea
                className={areaClass}
                value={forbiddenClaims}
                onChange={(e) => setForbiddenClaims(e.target.value)}
              />
            </Field>

            <Field label="Eylem Çağrısı Kuralları" wide>
              <textarea
                className={areaClass}
                value={ctaGuidelines}
                onChange={(e) => setCtaGuidelines(e.target.value)}
              />
            </Field>

            <Field label="Görsel Kurallar" wide>
              <textarea
                className={areaClass}
                value={visualGuidelines}
                onChange={(e) => setVisualGuidelines(e.target.value)}
              />
            </Field>
          </div>

          <div className="mt-5 flex justify-end">
            <Button disabled={policySaving} type="submit">
              {policySaving
                ? "Politika Kaydediliyor..."
                : activeProfile
                  ? "Politikayı Güncelle"
                  : "Politika Oluştur"}
            </Button>
          </div>
        </form>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
        <Panel
          title="Aktif Marka Politikası"
          description="İçerik üretirken ekiplerin uyması gereken temel kurallar."
        >
          {activeProfile ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Summary
                label="İletişim Tonu"
                value={activeProfile.toneOfVoice || "Tanımlanmadı"}
              />
              <Summary
                label="Marka Kişiliği"
                value={
                  activeProfile.brandPersonality.join(", ") || "Tanımlanmadı"
                }
              />
              <Summary
                label="Yasaklı İfadeler"
                value={activeProfile.forbiddenPhrases.join(", ") || "Yok"}
              />
              <Summary
                label="Yasak İddialar"
                value={
                  (activeProfile.contentRules.forbiddenClaims ?? []).join(", ") ||
                  "Yok"
                }
              />
              <Summary
                label="Yazı Tipleri"
                value={
                  activeProfile.fontTokens
                    .map((font) => font.role + ": " + font.family)
                    .join(", ") || "Tanımlanmadı"
                }
              />
              <Summary
                label="Etiket Sınırı"
                value={
                  activeProfile.hashtagRules.maxCount == null
                    ? "Tanımlanmadı"
                    : String(activeProfile.hashtagRules.maxCount)
                }
              />
            </div>
          ) : (
            <div className="rounded-[14px] bg-[var(--warning-soft)] p-4 text-[9px] leading-5 text-[var(--warning)]">
              Bu kapsam için marka politikası tanımlanmadı. İçerik ve dış iletişim
              standartlarını merkezi hale getirmek için politika oluşturun.
            </div>
          )}
        </Panel>

        <Panel
          title="Marka Varlıkları"
          description="Logo, renk, yazı tipi, kılavuz ve onaylı materyaller."
          action={
            canManage ? (
              <button
                type="button"
                onClick={() => setShowAssetForm((value) => !value)}
                className="text-[9px] font-semibold text-[var(--accent)]"
              >
                {showAssetForm ? "Formu Kapat" : "Yeni Varlık"}
              </button>
            ) : null
          }
        >
          {showAssetForm && canManage ? (
            <form
              onSubmit={(event) => void createAsset(event)}
              className="mb-4 rounded-[14px] bg-[var(--surface-2)] p-4"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Ad">
                  <input
                    required
                    className={fieldClass}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>

                <Field label="Tür">
                  <Select
                    className={fieldClass}
                    value={assetType}
                    onChange={(e) => setAssetType(e.target.value)}
                  >
                    <option value="LOGO">Logo</option>
                    <option value="COLOR_PALETTE">Renk Paleti</option>
                    <option value="FONT">Yazı Tipi</option>
                    <option value="GUIDELINE">Marka Kılavuzu</option>
                    <option value="TEMPLATE">Şablon</option>
                    <option value="PHOTO">Fotoğraf</option>
                    <option value="VIDEO">Video</option>
                    <option value="OTHER">Diğer</option>
                  </Select>
                </Field>

                <Field label="Dosya / Referans Bağlantısı" wide>
                  <input
                    required
                    type="url"
                    className={fieldClass}
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                  />
                </Field>

                <Field label="Versiyon">
                  <input
                    className={fieldClass}
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                  />
                </Field>

                <Field label="Kullanım Kuralları">
                  <textarea
                    className={areaClass}
                    value={usageRules}
                    onChange={(e) => setUsageRules(e.target.value)}
                  />
                </Field>
              </div>

              <Button className="mt-4" disabled={saving} type="submit">
                {saving ? "Kaydediliyor..." : "Varlığı Kaydet"}
              </Button>
            </form>
          ) : null}

          {rows.length ? (
            <div className="divide-y divide-[var(--line)]">
              {rows.slice(0, 8).map((row) => (
                <a
                  key={row.id}
                  href={row.externalUrl ?? "#"}
                  target={row.externalUrl ? "_blank" : undefined}
                  rel="noreferrer"
                  className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-semibold text-[var(--ink)]">
                      {row.name}
                    </p>
                    <p className="mt-1 text-[8px] text-[var(--muted)]">
                      {row.version ? "v" + row.version : "Versiyon belirtilmedi"}
                    </p>
                  </div>
                  <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--accent)]">
                    {userLabel(row.assetType)}
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-[9px] text-[var(--muted)]">
              Henüz marka varlığı bulunmuyor.
            </p>
          )}

          <Link
            href="/communications/assets"
            className="mt-4 inline-block text-[9px] font-semibold text-[var(--accent)]"
          >
            Varlık Kütüphanesini Aç →
          </Link>
        </Panel>
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
      <strong className="mt-3 block text-[20px] font-semibold text-[var(--ink)]">
        {value}
      </strong>
      <p className="mt-2 text-[8px] text-[var(--muted)]">{detail}</p>
    </div>
  );
}

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[13px] font-semibold text-[var(--ink)]">
            {title}
          </h2>
          <p className="mt-1 text-[8px] leading-4 text-[var(--muted)]">
            {description}
          </p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-[var(--surface-2)] p-3">
      <p className="text-[7px] font-semibold uppercase tracking-[.1em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1.5 text-[9px] leading-4 text-[var(--ink)]">{value}</p>
    </div>
  );
}
