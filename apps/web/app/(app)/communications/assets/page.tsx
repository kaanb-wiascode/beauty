"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Spinner, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { userErrorMessage, userLabel } from "@/lib/user-language";
import { hasPermission } from "@/lib/auth";

type Asset = {
  id: string;
  branchId: string | null;
  branchName?: string | null;
  name: string;
  assetType: string;
  externalUrl?: string | null;
  storageKey?: string | null;
  version?: string | null;
  usageRules?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: string | null;
  widthPx?: number | null;
  heightPx?: number | null;
  durationSeconds?: string | number | null;
  checksumSha256?: string | null;
  rightsOwner?: string | null;
  licenseExpiresAt?: string | null;
  licenseState: "VALID" | "EXPIRING" | "EXPIRED" | "UNTRACKED";
  tags: string[];
};

type ContextOptions = {
  activeBranchId: string | null;
  branches: Array<{ id: string; name: string }>;
};

const field =
  "mt-2 h-11 w-full rounded-[12px] border border-[var(--line)] bg-white px-3 text-[11px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const area =
  "mt-2 min-h-24 w-full rounded-[12px] border border-[var(--line)] bg-white p-3 text-[11px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

const types = [
  "LOGO",
  "COLOR_PALETTE",
  "FONT",
  "GUIDELINE",
  "TEMPLATE",
  "PHOTO",
  "VIDEO",
  "OTHER",
];

export default function DigitalAssetsPage() {
  const canManage = hasPermission("communications", "manage");
  const [rows, setRows] = useState<Asset[]>([]);
  const [context, setContext] = useState<ContextOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [licenseState, setLicenseState] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState("PHOTO");
  const [externalUrl, setExternalUrl] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [fileSizeBytes, setFileSizeBytes] = useState("");
  const [widthPx, setWidthPx] = useState("");
  const [heightPx, setHeightPx] = useState("");
  const [durationSeconds, setDurationSeconds] = useState("");
  const [checksum, setChecksum] = useState("");
  const [rightsOwner, setRightsOwner] = useState("");
  const [licenseExpiresAt, setLicenseExpiresAt] = useState("");
  const [tags, setTags] = useState("");
  const [usageRules, setUsageRules] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ limit: "100" });
      if (search.trim()) query.set("search", search.trim());
      if (licenseState) query.set("licenseState", licenseState);

      const [assets, ctx] = await Promise.all([
        api<Asset[]>(
          "/corporate-communications/digital-assets?" + query.toString(),
        ),
        api<ContextOptions>("/auth/context/options"),
      ]);
      setRows(assets);
      setContext(ctx);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(e.message, "Dijital varlıklar yüklenemedi.")
          : "Dijital varlıklar yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, [search, licenseState]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(
    () => ({
      total: rows.length,
      expiring: rows.filter((r) => r.licenseState === "EXPIRING").length,
      expired: rows.filter((r) => r.licenseState === "EXPIRED").length,
      untracked: rows.filter((r) => r.licenseState === "UNTRACKED").length,
    }),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) => !assetTypeFilter || row.assetType === assetTypeFilter,
      ),
    [rows, assetTypeFilter],
  );

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await api("/corporate-communications/digital-assets", {
        method: "POST",
        body: {
          name,
          assetType,
          externalUrl,
          mimeType: mimeType || undefined,
          fileSizeBytes: fileSizeBytes ? Number(fileSizeBytes) : undefined,
          widthPx: widthPx ? Number(widthPx) : undefined,
          heightPx: heightPx ? Number(heightPx) : undefined,
          durationSeconds: durationSeconds
            ? Number(durationSeconds)
            : undefined,
          checksumSha256: checksum || undefined,
          rightsOwner: rightsOwner || undefined,
          licenseExpiresAt: licenseExpiresAt
            ? new Date(licenseExpiresAt).toISOString()
            : null,
          tags: tags
            .split(/[,\n]/)
            .map((value) => value.trim())
            .filter(Boolean),
          usageRules: usageRules || undefined,
          metadata: { source: "DIGITAL_ASSET_LIBRARY" },
        },
      });

      setName("");
      setExternalUrl("");
      setMimeType("");
      setFileSizeBytes("");
      setWidthPx("");
      setHeightPx("");
      setDurationSeconds("");
      setChecksum("");
      setRightsOwner("");
      setLicenseExpiresAt("");
      setTags("");
      setUsageRules("");
      setShowForm(false);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? userErrorMessage(err.message, "Dijital varlık oluşturulamadı.")
          : "Dijital varlık oluşturulamadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function archive(id: string) {
    setError("");
    try {
      await api("/corporate-communications/digital-assets/" + id + "/archive", {
        method: "POST",
      });
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? userErrorMessage(err.message, "Dijital varlık arşivlenemedi.")
          : "Dijital varlık arşivlenemedi.",
      );
    }
  }

  if (loading && !rows.length) {
    return (
      <div className="py-20">
        <Spinner label="Varlık kütüphanesi yükleniyor..." />
      </div>
    );
  }

  const branchName = context?.activeBranchId
    ? context.branches.find((branch) => branch.id === context.activeBranchId)
        ?.name
    : "Şirket Geneli";

  return (
    <div className="space-y-5 pb-12">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">
              Marka Yönetimi
            </p>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-.04em] text-[var(--ink)]">
              Varlık Kütüphanesi
            </h1>
            <p className="mt-2 max-w-4xl text-[12px] leading-5 text-[var(--muted)]">
              Logo, fotoğraf, video, şablon ve kılavuzları kullanım hakkı,
              lisans süresi ve kapsam bilgileriyle yönetin. Aktif kapsam:{" "}
              {branchName ?? "Şirket Geneli"}.
            </p>
          </div>

          {canManage ? (
            <Button onClick={() => setShowForm((value) => !value)}>
              {showForm ? "Formu Kapat" : "Yeni Varlık"}
            </Button>
          ) : null}
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Aktif Varlık"
          value={stats.total}
          detail="Kütüphanedeki kullanılabilir kayıtlar"
        />
        <Metric
          label="Lisansı Yaklaşan"
          value={stats.expiring}
          detail="30 gün içinde sona erecek"
          attention={stats.expiring > 0}
        />
        <Metric
          label="Lisansı Dolmuş"
          value={stats.expired}
          detail="Kullanım hakkı kontrol edilmeli"
          danger={stats.expired > 0}
        />
        <Metric
          label="Lisans Takipsiz"
          value={stats.untracked}
          detail="Bitiş tarihi kayıtlı değil"
          attention={stats.untracked > 0}
        />
      </section>

      {showForm && canManage ? (
        <form
          onSubmit={(event) => void create(event)}
          className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]"
        >
          <div className="mb-5">
            <h2 className="text-[14px] font-semibold text-[var(--ink)]">
              Yeni Dijital Varlık
            </h2>
            <p className="mt-1 text-[8px] text-[var(--muted)]">
              Dosyayı, kullanım hakkını ve teknik bilgileri merkezi kayda alın.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Ad" wide>
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
                value={assetType}
                onChange={(e) => setAssetType(e.target.value)}
              >
                {types.map((item) => (
                  <option key={item} value={item}>
                    {userLabel(item)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Dosya Bağlantısı" wide>
              <input
                required
                type="url"
                className={field}
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
              />
            </Field>

            <Field label="Hak Sahibi">
              <input
                className={field}
                value={rightsOwner}
                onChange={(e) => setRightsOwner(e.target.value)}
              />
            </Field>

            <Field label="Lisans Bitişi">
              <input
                type="datetime-local"
                className={field}
                value={licenseExpiresAt}
                onChange={(e) => setLicenseExpiresAt(e.target.value)}
              />
            </Field>

            <Field label="Dosya Türü">
              <input
                className={field}
                placeholder="Örn. image/jpeg"
                value={mimeType}
                onChange={(e) => setMimeType(e.target.value)}
              />
            </Field>

            <Field label="Dosya Boyutu (bayt)">
              <input
                type="number"
                min="0"
                className={field}
                value={fileSizeBytes}
                onChange={(e) => setFileSizeBytes(e.target.value)}
              />
            </Field>

            <Field label="Genişlik (px)">
              <input
                type="number"
                min="1"
                className={field}
                value={widthPx}
                onChange={(e) => setWidthPx(e.target.value)}
              />
            </Field>

            <Field label="Yükseklik (px)">
              <input
                type="number"
                min="1"
                className={field}
                value={heightPx}
                onChange={(e) => setHeightPx(e.target.value)}
              />
            </Field>

            <Field label="Video Süresi (sn)">
              <input
                type="number"
                min="0"
                step="0.001"
                className={field}
                value={durationSeconds}
                onChange={(e) => setDurationSeconds(e.target.value)}
              />
            </Field>

            <Field label="Dosya Doğrulama Kodu" wide>
              <input
                className={field}
                pattern="[0-9A-Fa-f]{64}"
                value={checksum}
                onChange={(e) => setChecksum(e.target.value)}
              />
            </Field>

            <Field label="Etiketler" wide>
              <textarea
                className={area}
                placeholder="kampanya, yaz, instagram"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </Field>

            <Field label="Kullanım Kuralları" wide>
              <textarea
                className={area}
                value={usageRules}
                onChange={(e) => setUsageRules(e.target.value)}
              />
            </Field>
          </div>

          <div className="mt-5 flex justify-end">
            <Button disabled={saving} type="submit">
              {saving ? "Kaydediliyor..." : "Varlığı Kaydet"}
            </Button>
          </div>
        </form>
      ) : null}

      <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--ink)]">
              Kütüphane
            </h2>
            <p className="mt-1 text-[8px] text-[var(--muted)]">
              {filtered.length} varlık gösteriliyor
            </p>
          </div>

          <div className="flex flex-col gap-2 md:flex-row">
            <input
              className="h-10 min-w-[240px] rounded-[11px] border border-[var(--line)] bg-white px-3 text-[10px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              placeholder="Ad veya hak sahibi ara…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <Select
              value={assetTypeFilter}
              onChange={(e) => setAssetTypeFilter(e.target.value)}
              className="h-10 min-w-[145px] rounded-[11px] border border-[var(--line)] bg-white px-3 text-[10px]"
            >
              <option value="">Tüm Türler</option>
              {types.map((item) => (
                <option key={item} value={item}>
                  {userLabel(item)}
                </option>
              ))}
            </Select>

            <Select
              value={licenseState}
              onChange={(e) => setLicenseState(e.target.value)}
              className="h-10 min-w-[155px] rounded-[11px] border border-[var(--line)] bg-white px-3 text-[10px]"
            >
              <option value="">Tüm Lisanslar</option>
              <option value="VALID">Geçerli</option>
              <option value="EXPIRING">Yakında Bitiyor</option>
              <option value="EXPIRED">Süresi Dolmuş</option>
              <option value="UNTRACKED">Takipsiz</option>
            </Select>
          </div>
        </div>

        {filtered.length ? (
          <div className="divide-y divide-[var(--line)]">
            {filtered.map((asset) => (
              <article
                key={asset.id}
                className="grid gap-4 p-4 transition hover:bg-[var(--surface-2)]/35 xl:grid-cols-[minmax(240px,1.2fr)_minmax(190px,.8fr)_minmax(230px,1fr)_180px] xl:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[11px] font-semibold text-[var(--ink)]">
                      {asset.name}
                    </p>
                    <License state={asset.licenseState} />
                  </div>
                  <p className="mt-1 text-[8px] text-[var(--muted)]">
                    {userLabel(asset.assetType)} ·{" "}
                    {asset.branchName ?? "Şirket Geneli"}
                  </p>
                  <p className="mt-1 text-[8px] text-[var(--muted-soft)]">
                    {asset.rightsOwner
                      ? "Hak sahibi: " + asset.rightsOwner
                      : "Hak sahibi belirtilmedi"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Mini
                    label="Dosya Türü"
                    value={asset.mimeType ?? "—"}
                  />
                  <Mini
                    label="Boyut"
                    value={
                      asset.fileSizeBytes
                        ? formatBytes(Number(asset.fileSizeBytes))
                        : "—"
                    }
                  />
                </div>

                <div>
                  <span className="block text-[7px] text-[var(--muted)]">
                    Lisans Bitişi
                  </span>
                  <strong className="mt-1 block text-[9px] text-[var(--ink)]">
                    {asset.licenseExpiresAt
                      ? new Date(asset.licenseExpiresAt).toLocaleDateString(
                          "tr-TR",
                        )
                      : "Takip edilmiyor"}
                  </strong>

                  {asset.tags?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {asset.tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[7px] text-[var(--muted)]"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2 xl:justify-end">
                  {asset.externalUrl ? (
                    <a
                      className="inline-flex h-9 items-center rounded-[10px] border border-[var(--line)] px-3 text-[9px] font-semibold text-[var(--accent)]"
                      href={asset.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Aç
                    </a>
                  ) : null}

                  {canManage &&
                  asset.branchId === context?.activeBranchId ? (
                    <button
                      type="button"
                      className="h-9 rounded-[10px] border border-[var(--line)] px-3 text-[9px] font-semibold text-[var(--muted)] hover:text-[var(--danger)]"
                      onClick={() => void archive(asset.id)}
                    >
                      Arşivle
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center text-[9px] text-[var(--muted)]">
            Seçili filtrelerde dijital varlık bulunamadı.
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
          ? "text-[10px] font-semibold text-[var(--muted)] md:col-span-2 xl:col-span-4"
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
  danger,
}: {
  label: string;
  value: number;
  detail: string;
  attention?: boolean;
  danger?: boolean;
}) {
  const className = danger
    ? "rounded-[18px] border border-[var(--danger)]/20 bg-[var(--danger-soft)] p-4"
    : attention
      ? "rounded-[18px] border border-[var(--warning)]/25 bg-[var(--warning-soft)] p-4"
      : "rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]";

  return (
    <div className={className}>
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

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[11px] bg-[var(--surface-2)] p-2.5">
      <span className="block text-[7px] text-[var(--muted)]">{label}</span>
      <strong className="mt-1 block truncate text-[8px] text-[var(--ink)]">
        {value}
      </strong>
    </div>
  );
}

function License({ state }: { state: Asset["licenseState"] }) {
  const labels = {
    VALID: "Geçerli",
    EXPIRING: "Yakında Bitiyor",
    EXPIRED: "Süresi Doldu",
    UNTRACKED: "Takipsiz",
  };

  const className =
    state === "EXPIRED"
      ? "rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--danger)]"
      : state === "EXPIRING"
        ? "rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--warning)]"
        : state === "VALID"
          ? "rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--accent)]"
          : "rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[7px] font-semibold text-[var(--muted)]";

  return <span className={className}>{labels[state]}</span>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
