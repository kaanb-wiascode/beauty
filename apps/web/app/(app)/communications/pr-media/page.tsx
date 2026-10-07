"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Alert, Button, Spinner, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { userErrorMessage, userLabel } from "@/lib/user-language";
import { hasPermission } from "@/lib/auth";

type Activity = {
  id: string;
  activityType: string;
  status: string;
  title: string;
  outletName?: string | null;
  contactName?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  location?: string | null;
  costAmount: string | number;
  currency: string;
  estimatedReach: string | number;
  actualReach: string | number;
  estimatedMediaValue: string | number;
  attributedRevenue: string | number;
  campaignName?: string | null;
};

const field =
  "mt-2 h-11 w-full rounded-[12px] border border-[var(--line)] bg-white px-3 text-[11px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const area =
  "mt-2 min-h-24 w-full rounded-[12px] border border-[var(--line)] bg-white p-3 text-[11px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

const types = [
  "PRESS_RELEASE",
  "MEDIA_RELATION",
  "INTERVIEW",
  "EVENT",
  "SPONSORSHIP",
  "CRISIS_COMMUNICATION",
  "AWARD",
  "OTHER",
];

const statuses = [
  "PLANNED",
  "CONTACTED",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("tr-TR");

function formatDate(value?: string | null) {
  if (!value) return "Belirtilmedi";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default function PrMediaPage() {
  const canManage = hasPermission("communications", "manage");

  const [rows, setRows] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const [title, setTitle] = useState("");
  const [type, setType] = useState("MEDIA_RELATION");
  const [outlet, setOutlet] = useState("");
  const [contact, setContact] = useState("");
  const [location, setLocation] = useState("");
  const [cost, setCost] = useState("");
  const [reach, setReach] = useState("");
  const [mediaValue, setMediaValue] = useState("");
  const [objective, setObjective] = useState("");
  const [keyMessage, setKeyMessage] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ limit: "100" });
      if (search.trim()) q.set("search", search.trim());
      setRows(
        await api<Activity[]>(
          "/corporate-communications/pr-media?" + q.toString(),
        ),
      );
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(
              e.message,
              "PR ve medya faaliyetleri yüklenemedi.",
            )
          : "PR ve medya faaliyetleri yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        const matchesStatus =
          !statusFilter || row.status === statusFilter;
        const matchesType = !typeFilter || row.activityType === typeFilter;
        return matchesStatus && matchesType;
      }),
    [rows, statusFilter, typeFilter],
  );

  const stats = useMemo(
    () => ({
      active: rows.filter(
        (r) => !["COMPLETED", "CANCELLED"].includes(r.status),
      ).length,
      cost: rows.reduce((s, r) => s + Number(r.costAmount || 0), 0),
      reach: rows.reduce(
        (s, r) =>
          s + Number(r.actualReach || r.estimatedReach || 0),
        0,
      ),
      value: rows.reduce(
        (s, r) => s + Number(r.estimatedMediaValue || 0),
        0,
      ),
    }),
    [rows],
  );

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await api("/corporate-communications/pr-media", {
        method: "POST",
        body: {
          activityType: type,
          title,
          outletName: outlet || null,
          contactName: contact || null,
          location: location || null,
          costAmount: Number(cost || 0),
          currency: "TRY",
          estimatedReach: Number(reach || 0),
          actualReach: 0,
          estimatedMediaValue: Number(mediaValue || 0),
          objective: objective || null,
          keyMessage: keyMessage || null,
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          metadata: { source: "PR_MEDIA_WORKSPACE" },
        },
      });

      setTitle("");
      setOutlet("");
      setContact("");
      setLocation("");
      setCost("");
      setReach("");
      setMediaValue("");
      setObjective("");
      setKeyMessage("");
      setStartsAt("");
      setEndsAt("");
      setShowForm(false);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? userErrorMessage(err.message, "PR faaliyeti kaydedilemedi.")
          : "PR faaliyeti kaydedilemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function complete(row: Activity) {
    setError("");
    try {
      await api("/corporate-communications/pr-media/" + row.id, {
        method: "PATCH",
        body: {
          status: "COMPLETED",
          actualReach: Number(row.actualReach || row.estimatedReach || 0),
        },
      });
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(e.message, "Faaliyet güncellenemedi.")
          : "Faaliyet güncellenemedi.",
      );
    }
  }

  if (loading && !rows.length) {
    return (
      <div className="py-20">
        <Spinner label="PR ve medya merkezi yükleniyor..." />
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
              PR & Medya Merkezi
            </h1>
            <p className="mt-2 max-w-4xl text-[12px] leading-5 text-[var(--muted)]">
              Basın ilişkileri, röportaj, etkinlik, sponsorluk, kriz iletişimi
              ve medya görünürlüğünü maliyet, erişim ve medya değeriyle yönetin.
            </p>
          </div>

          {canManage ? (
            <Button onClick={() => setShowForm((value) => !value)}>
              {showForm ? "Formu Kapat" : "Yeni PR Faaliyeti"}
            </Button>
          ) : null}
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Aktif Faaliyet"
          value={String(stats.active)}
          detail={rows.length + " toplam çalışma"}
        />
        <Metric
          label="Toplam Maliyet"
          value={money.format(stats.cost)}
          detail="PR ve medya faaliyetleri"
        />
        <Metric
          label="Erişim"
          value={num.format(stats.reach)}
          detail="Gerçekleşen veya tahmini erişim"
        />
        <Metric
          label="Tahmini Medya Değeri"
          value={money.format(stats.value)}
          detail="Kayıtlı faaliyet toplamı"
        />
      </section>

      {showForm && canManage ? (
        <form
          onSubmit={(event) => void create(event)}
          className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]"
        >
          <div className="mb-5">
            <h2 className="text-[14px] font-semibold text-[var(--ink)]">
              Yeni PR Faaliyeti
            </h2>
            <p className="mt-1 text-[8px] text-[var(--muted)]">
              Faaliyetin amacı, zamanlaması, medya ilişkisi ve beklenen
              görünürlüğünü kaydedin.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Başlık" wide>
              <input
                required
                className={field}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>

            <Field label="Tür">
              <Select
                className={field}
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {types.map((item) => (
                  <option key={item} value={item}>
                    {userLabel(item)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Medya / Kurum">
              <input
                className={field}
                value={outlet}
                onChange={(e) => setOutlet(e.target.value)}
              />
            </Field>

            <Field label="İletişim Kişisi">
              <input
                className={field}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
            </Field>

            <Field label="Başlangıç">
              <input
                type="datetime-local"
                className={field}
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </Field>

            <Field label="Bitiş">
              <input
                type="datetime-local"
                className={field}
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </Field>

            <Field label="Lokasyon">
              <input
                className={field}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </Field>

            <Field label="Maliyet">
              <input
                type="number"
                min="0"
                className={field}
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </Field>

            <Field label="Tahmini Erişim">
              <input
                type="number"
                min="0"
                className={field}
                value={reach}
                onChange={(e) => setReach(e.target.value)}
              />
            </Field>

            <Field label="Tahmini Medya Değeri">
              <input
                type="number"
                min="0"
                className={field}
                value={mediaValue}
                onChange={(e) => setMediaValue(e.target.value)}
              />
            </Field>

            <Field label="Amaç" wide>
              <textarea
                className={area}
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
              />
            </Field>

            <Field label="Ana Mesaj" wide>
              <textarea
                className={area}
                value={keyMessage}
                onChange={(e) => setKeyMessage(e.target.value)}
              />
            </Field>
          </div>

          <div className="mt-5 flex justify-end">
            <Button disabled={saving} type="submit">
              {saving ? "Kaydediliyor..." : "Faaliyeti Kaydet"}
            </Button>
          </div>
        </form>
      ) : null}

      <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--ink)]">
              PR & Medya Faaliyetleri
            </h2>
            <p className="mt-1 text-[8px] text-[var(--muted)]">
              {filtered.length} faaliyet gösteriliyor
            </p>
          </div>

          <div className="flex flex-col gap-2 md:flex-row">
            <input
              className="h-10 min-w-[240px] rounded-[11px] border border-[var(--line)] bg-white px-3 text-[10px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              placeholder="Faaliyet veya medya kuruluşu ara…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 min-w-[145px] rounded-[11px] border border-[var(--line)] bg-white px-3 text-[10px]"
            >
              <option value="">Tüm Durumlar</option>
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {userLabel(item)}
                </option>
              ))}
            </Select>

            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-10 min-w-[165px] rounded-[11px] border border-[var(--line)] bg-white px-3 text-[10px]"
            >
              <option value="">Tüm Türler</option>
              {types.map((item) => (
                <option key={item} value={item}>
                  {userLabel(item)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {filtered.length ? (
          <div className="divide-y divide-[var(--line)]">
            {filtered.map((row) => (
              <article
                key={row.id}
                className="grid gap-4 p-4 transition hover:bg-[var(--surface-2)]/35 xl:grid-cols-[minmax(240px,1.3fr)_minmax(170px,.8fr)_minmax(230px,1fr)_180px] xl:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[11px] font-semibold text-[var(--ink)]">
                      {row.title}
                    </p>
                    <Badge text={row.status} />
                  </div>
                  <p className="mt-1 text-[8px] text-[var(--muted)]">
                    {userLabel(row.activityType)} ·{" "}
                    {row.outletName ?? "Medya kuruluşu tanımsız"}
                  </p>
                  <p className="mt-1 text-[8px] text-[var(--muted-soft)]">
                    {formatDate(row.startsAt)} → {formatDate(row.endsAt)}
                    {row.location ? " · " + row.location : ""}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Mini
                    label="Maliyet"
                    value={money.format(Number(row.costAmount || 0))}
                  />
                  <Mini
                    label="Medya Değeri"
                    value={money.format(
                      Number(row.estimatedMediaValue || 0),
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Mini
                    label="Tahmini Erişim"
                    value={num.format(Number(row.estimatedReach || 0))}
                  />
                  <Mini
                    label="Gerçek Erişim"
                    value={num.format(Number(row.actualReach || 0))}
                  />
                </div>

                <div className="flex xl:justify-end">
                  {canManage &&
                  !["COMPLETED", "CANCELLED"].includes(row.status) ? (
                    <Button
                      variant="secondary"
                      onClick={() => void complete(row)}
                    >
                      Tamamlandı
                    </Button>
                  ) : (
                    <span className="text-[8px] text-[var(--muted)]">
                      İşlem beklemiyor
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center text-[9px] text-[var(--muted)]">
            Seçili filtrelerde PR veya medya faaliyeti bulunamadı.
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

function Badge({ text }: { text: string }) {
  return (
    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--accent)]">
      {userLabel(text)}
    </span>
  );
}
