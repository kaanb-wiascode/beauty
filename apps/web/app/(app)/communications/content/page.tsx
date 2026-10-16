"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Alert, Button, Spinner, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { userErrorMessage, userLabel } from "@/lib/user-language";

type ContentItem = {
  id: string;
  title: string;
  platform: string;
  format: string;
  status: string;
  caption?: string | null;
  cta?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  pendingApprovalId?: string | null;
  updatedAt: string;
};

type Campaign = { id: string; name: string };

type ViewMode = "LIST" | "FLOW" | "CALENDAR";

const fieldClass =
  "mt-2 h-11 w-full rounded-[12px] border border-[var(--line)] bg-white px-3 text-[11px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const areaClass =
  "mt-2 min-h-24 w-full rounded-[12px] border border-[var(--line)] bg-white px-3 py-3 text-[11px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

const columns = [
  "IDEA",
  "BRIEF",
  "PRODUCTION",
  "REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
];

const statusLabel: Record<string, string> = {
  IDEA: "Fikir",
  BRIEF: "İçerik Özeti",
  PRODUCTION: "Hazırlanıyor",
  REVIEW: "İncelemede",
  APPROVED: "Onaylandı",
  SCHEDULED: "Planlandı",
  PUBLISHED: "Yayınlandı",
  ARCHIVED: "Arşiv",
};

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function localDateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function monthTitle(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

const calendarWeekdays = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export default function ContentOperationsPage() {
  const canManage = hasPermission("communications", "manage");
  const [items, setItems] = useState<ContentItem[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<ViewMode>("LIST");
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPlatform, setFilterPlatform] = useState("");

  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("INSTAGRAM");
  const [format, setFormat] = useState("POST");
  const [campaignId, setCampaignId] = useState("");
  const [caption, setCaption] = useState("");
  const [cta, setCta] = useState("");
  const [scheduleId, setScheduleId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [contentRows, campaignRows] = await Promise.all([
        api<ContentItem[]>("/corporate-communications/content?limit=200"),
        api<Campaign[]>("/corporate-communications/campaigns?limit=200"),
      ]);
      setItems(contentRows);
      setCampaigns(campaignRows);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(e.message, "İçerik merkezi yüklenemedi.")
          : "İçerik merkezi yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    return items.filter((item) => {
      const matchesSearch =
        !needle ||
        item.title.toLocaleLowerCase("tr-TR").includes(needle) ||
        (item.campaignName ?? "")
          .toLocaleLowerCase("tr-TR")
          .includes(needle);
      const matchesStatus =
        !filterStatus || item.status === filterStatus;
      const matchesPlatform =
        !filterPlatform || item.platform === filterPlatform;
      return matchesSearch && matchesStatus && matchesPlatform;
    });
  }, [items, search, filterStatus, filterPlatform]);

  const grouped = useMemo(
    () =>
      Object.fromEntries(
        columns.map((status) => [
          status,
          filtered.filter((item) => item.status === status),
        ]),
      ),
    [filtered],
  );

  const stats = useMemo(
    () => ({
      active: items.filter(
        (item) => !["PUBLISHED", "ARCHIVED"].includes(item.status),
      ).length,
      review: items.filter((item) => item.status === "REVIEW").length,
      ready: items.filter((item) =>
        ["APPROVED", "SCHEDULED"].includes(item.status),
      ).length,
      published: items.filter((item) => item.status === "PUBLISHED").length,
    }),
    [items],
  );

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await api("/corporate-communications/content", {
        method: "POST",
        body: {
          title,
          platform,
          format,
          campaignId: campaignId || undefined,
          caption: caption || undefined,
          cta: cta || undefined,
        },
      });

      setTitle("");
      setCaption("");
      setCta("");
      setCampaignId("");
      setShowForm(false);
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(e.message, "İçerik kaydedilemedi.")
          : "İçerik kaydedilemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitReview(id: string) {
    setActingId(id);
    setError("");
    try {
      await api(
        "/corporate-communications/content/" + id + "/submit-review",
        { method: "POST" },
      );
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(
              e.message,
              "İçerik incelemeye gönderilemedi.",
            )
          : "İçerik incelemeye gönderilemedi.",
      );
    } finally {
      setActingId("");
    }
  }

  async function publish(id: string) {
    setActingId(id);
    setError("");
    try {
      await api("/corporate-communications/content/" + id + "/publish", {
        method: "POST",
        body: {},
      });
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(
              e.message,
              "İçerik yayınlandı olarak işaretlenemedi.",
            )
          : "İçerik yayınlandı olarak işaretlenemedi.",
      );
    } finally {
      setActingId("");
    }
  }

  async function schedule(event: FormEvent) {
    event.preventDefault();
    if (!scheduleId) return;
    setActingId(scheduleId);
    setError("");

    try {
      await api(
        "/corporate-communications/content/" + scheduleId + "/schedule",
        {
          method: "POST",
          body: { scheduledAt: new Date(scheduledAt).toISOString() },
        },
      );
      setScheduleId("");
      setScheduledAt("");
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(e.message, "İçerik planlanamadı.")
          : "İçerik planlanamadı.",
      );
    } finally {
      setActingId("");
    }
  }

  if (loading && !items.length) {
    return (
      <div className="py-20">
        <Spinner label="İçerik merkezi yükleniyor..." />
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
              İçerik Merkezi
            </h1>
            <p className="mt-2 max-w-3xl text-[12px] leading-5 text-[var(--muted)]">
              İçeriği fikirden yayına kadar yönetin; inceleme, onay ve yayın
              planını aynı operasyon akışında takip edin.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/communications/approvals">
              <Button variant="secondary">Onay Merkezi</Button>
            </Link>
            {canManage ? (
              <Button onClick={() => setShowForm((value) => !value)}>
                {showForm ? "Formu Kapat" : "Yeni İçerik"}
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Aktif İçerik"
          value={stats.active}
          detail="Yayın öncesi süreçte"
        />
        <Metric
          label="İncelemede"
          value={stats.review}
          detail="Onay kararı bekleyen akış"
          attention={stats.review > 0}
        />
        <Metric
          label="Yayına Hazır"
          value={stats.ready}
          detail="Onaylı veya planlanmış"
        />
        <Metric
          label="Yayınlanan"
          value={stats.published}
          detail="Tamamlanan içerik"
        />
      </section>

      {showForm && canManage ? (
        <form
          onSubmit={(event) => void create(event)}
          className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]"
        >
          <div className="mb-5">
            <h2 className="text-[14px] font-semibold text-[var(--ink)]">
              Yeni İçerik
            </h2>
            <p className="mt-1 text-[8px] text-[var(--muted)]">
              İçerik fikrini oluşturun; daha sonra inceleme ve yayın
              akışından ilerletin.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-[10px] font-semibold text-[var(--muted)] md:col-span-2">
              Başlık
              <input
                required
                className={fieldClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>

            <label className="text-[10px] font-semibold text-[var(--muted)]">
              Platform
              <Select
                className={fieldClass}
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                <option value="INSTAGRAM">Instagram</option>
                <option value="FACEBOOK">Facebook</option>
                <option value="TIKTOK">TikTok</option>
                <option value="YOUTUBE">YouTube</option>
                <option value="LINKEDIN">LinkedIn</option>
                <option value="WEBSITE">Web Sitesi</option>
                <option value="EMAIL">E-posta</option>
                <option value="SMS">SMS</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="OTHER">Diğer</option>
              </Select>
            </label>

            <label className="text-[10px] font-semibold text-[var(--muted)]">
              İçerik Türü
              <Select
                className={fieldClass}
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                <option value="POST">Gönderi</option>
                <option value="REEL">Kısa Video</option>
                <option value="STORY">Hikâye</option>
                <option value="VIDEO">Video</option>
                <option value="ARTICLE">Makale</option>
                <option value="EMAIL">E-posta</option>
                <option value="SMS">SMS</option>
                <option value="BANNER">Banner</option>
                <option value="OTHER">Diğer</option>
              </Select>
            </label>

            <label className="text-[10px] font-semibold text-[var(--muted)] md:col-span-2">
              Kampanya
              <Select
                className={fieldClass}
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
              >
                <option value="">Kampanyasız</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </Select>
            </label>

            <label className="text-[10px] font-semibold text-[var(--muted)] md:col-span-2">
              Eylem Çağrısı
              <input
                className={fieldClass}
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                placeholder="Randevu al, Teklif iste..."
              />
            </label>

            <label className="text-[10px] font-semibold text-[var(--muted)] md:col-span-2 xl:col-span-4">
              İçerik Metni
              <textarea
                className={areaClass}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />
            </label>
          </div>

          <div className="mt-5 flex justify-end">
            <Button disabled={saving} type="submit">
              {saving ? "Kaydediliyor..." : "İçeriği Oluştur"}
            </Button>
          </div>
        </form>
      ) : null}

      {scheduleId ? (
        <form
          onSubmit={(event) => void schedule(event)}
          className="flex flex-col gap-3 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 md:flex-row md:items-end"
        >
          <label className="flex-1 text-[10px] font-semibold text-[var(--muted)]">
            Yayın Zamanı
            <input
              required
              type="datetime-local"
              className={fieldClass}
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </label>
          <Button disabled={actingId === scheduleId} type="submit">
            Planla
          </Button>
          <Button
            variant="secondary"
            type="button"
            onClick={() => setScheduleId("")}
          >
            Vazgeç
          </Button>
        </form>
      ) : null}

      <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
        <div className="border-b border-[var(--line)] p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-[13px] font-semibold text-[var(--ink)]">
                İçerik Operasyonu
              </h2>
              <p className="mt-1 text-[8px] text-[var(--muted)]">
                {filtered.length} içerik gösteriliyor
              </p>
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:flex-wrap">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="İçerik veya kampanya ara…"
                className="h-10 min-w-[230px] rounded-[11px] border border-[var(--line)] bg-white px-3 text-[10px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              />

              <Select
                value={filterStatus}
                onChange={(event) => setFilterStatus(event.target.value)}
                className="h-10 min-w-[140px] rounded-[11px] border border-[var(--line)] bg-white px-3 text-[10px] text-[var(--ink)]"
              >
                <option value="">Tüm Aşamalar</option>
                {columns.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel[status]}
                  </option>
                ))}
              </Select>

              <Select
                value={filterPlatform}
                onChange={(event) => setFilterPlatform(event.target.value)}
                className="h-10 min-w-[140px] rounded-[11px] border border-[var(--line)] bg-white px-3 text-[10px] text-[var(--ink)]"
              >
                <option value="">Tüm Platformlar</option>
                {[
                  "INSTAGRAM",
                  "FACEBOOK",
                  "TIKTOK",
                  "YOUTUBE",
                  "LINKEDIN",
                  "WEBSITE",
                  "EMAIL",
                  "SMS",
                  "WHATSAPP",
                ].map((item) => (
                  <option key={item} value={item}>
                    {userLabel(item)}
                  </option>
                ))}
              </Select>

              <div className="flex rounded-[11px] border border-[var(--line)] bg-white p-1">
                <button
                  type="button"
                  onClick={() => setView("LIST")}
                  className={
                    view === "LIST"
                      ? "rounded-[8px] bg-[var(--accent-soft)] px-3 py-1.5 text-[9px] font-semibold text-[var(--accent)]"
                      : "rounded-[8px] px-3 py-1.5 text-[9px] font-semibold text-[var(--muted)]"
                  }
                >
                  Liste
                </button>
                <button
                  type="button"
                  onClick={() => setView("FLOW")}
                  className={
                    view === "FLOW"
                      ? "rounded-[8px] bg-[var(--accent-soft)] px-3 py-1.5 text-[9px] font-semibold text-[var(--accent)]"
                      : "rounded-[8px] px-3 py-1.5 text-[9px] font-semibold text-[var(--muted)]"
                  }
                >
                  Akış
                </button>
                <button
                  type="button"
                  onClick={() => setView("CALENDAR")}
                  className={
                    view === "CALENDAR"
                      ? "rounded-[8px] bg-[var(--accent-soft)] px-3 py-1.5 text-[9px] font-semibold text-[var(--accent)]"
                      : "rounded-[8px] px-3 py-1.5 text-[9px] font-semibold text-[var(--muted)]"
                  }
                >
                  Takvim
                </button>
              </div>
            </div>
          </div>
        </div>

        {view === "LIST" ? (
          <ContentList
            items={filtered}
            canManage={canManage}
            actingId={actingId}
            onReview={submitReview}
            onSchedule={setScheduleId}
            onPublish={publish}
          />
        ) : view === "FLOW" ? (
          <ContentFlow
            grouped={grouped}
            canManage={canManage}
            actingId={actingId}
            onReview={submitReview}
            onSchedule={setScheduleId}
            onPublish={publish}
          />
        ) : (
          <ContentCalendar
            items={filtered}
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
          />
        )}
      </section>
    </div>
  );
}

function ContentList({
  items,
  canManage,
  actingId,
  onReview,
  onSchedule,
  onPublish,
}: {
  items: ContentItem[];
  canManage: boolean;
  actingId: string;
  onReview: (id: string) => Promise<void>;
  onSchedule: (id: string) => void;
  onPublish: (id: string) => Promise<void>;
}) {
  if (!items.length) {
    return (
      <div className="p-10 text-center text-[10px] text-[var(--muted)]">
        Seçili filtrelerde içerik bulunamadı.
      </div>
    );
  }

  return (
    <div className="divide-y divide-[var(--line)]">
      {items.map((item) => (
        <article
          key={item.id}
          className="grid gap-3 p-4 transition hover:bg-[var(--surface-2)]/35 lg:grid-cols-[minmax(240px,1.3fr)_150px_160px_minmax(180px,.8fr)_220px] lg:items-center"
        >
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold text-[var(--ink)]">
              {item.title}
            </p>
            <p className="mt-1 truncate text-[8px] text-[var(--muted)]">
              {item.campaignName ?? "Kampanyasız"}
            </p>
          </div>

          <div>
            <Status value={item.status} />
          </div>

          <div>
            <p className="text-[9px] font-medium text-[var(--ink)]">
              {userLabel(item.platform)}
            </p>
            <p className="mt-1 text-[7px] text-[var(--muted)]">
              {userLabel(item.format)}
            </p>
          </div>

          <div>
            <span className="block text-[7px] text-[var(--muted)]">
              Yayın zamanı
            </span>
            <span className="mt-1 block text-[9px] font-medium text-[var(--ink)]">
              {item.scheduledAt
                ? formatDateTime(item.scheduledAt)
                : "Planlanmadı"}
            </span>
          </div>

          <ContentActions
            item={item}
            canManage={canManage}
            actingId={actingId}
            onReview={onReview}
            onSchedule={onSchedule}
            onPublish={onPublish}
          />
        </article>
      ))}
    </div>
  );
}

function ContentFlow({
  grouped,
  canManage,
  actingId,
  onReview,
  onSchedule,
  onPublish,
}: {
  grouped: Record<string, ContentItem[]>;
  canManage: boolean;
  actingId: string;
  onReview: (id: string) => Promise<void>;
  onSchedule: (id: string) => void;
  onPublish: (id: string) => Promise<void>;
}) {
  return (
    <div className="overflow-x-auto p-4">
      <div className="grid min-w-[1500px] grid-cols-7 gap-3">
        {columns.map((status) => (
          <section
            key={status}
            className="rounded-[15px] bg-[var(--surface-2)] p-3"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[10px] font-semibold text-[var(--ink)]">
                {statusLabel[status]}
              </h3>
              <span className="rounded-full bg-white px-2 py-0.5 text-[8px] text-[var(--muted)]">
                {grouped[status]?.length ?? 0}
              </span>
            </div>

            <div className="space-y-2">
              {(grouped[status] ?? []).map((item) => (
                <article
                  key={item.id}
                  className="rounded-[12px] border border-[var(--line)] bg-white p-3"
                >
                  <p className="text-[10px] font-semibold text-[var(--ink)]">
                    {item.title}
                  </p>
                  <p className="mt-1 text-[7px] text-[var(--muted)]">
                    {userLabel(item.platform)} · {userLabel(item.format)}
                  </p>
                  {item.campaignName ? (
                    <p className="mt-2 text-[8px] text-[var(--muted)]">
                      {item.campaignName}
                    </p>
                  ) : null}
                  {item.scheduledAt ? (
                    <p className="mt-2 text-[8px] text-[var(--muted)]">
                      {formatDateTime(item.scheduledAt)}
                    </p>
                  ) : null}

                  <div className="mt-3">
                    <ContentActions
                      item={item}
                      canManage={canManage}
                      actingId={actingId}
                      onReview={onReview}
                      onSchedule={onSchedule}
                      onPublish={onPublish}
                      compact
                    />
                  </div>
                </article>
              ))}

              {!grouped[status]?.length ? (
                <p className="py-5 text-center text-[8px] text-[var(--muted-soft)]">
                  Kayıt yok
                </p>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ContentCalendar({
  items,
  month,
  onMonthChange,
}: {
  items: ContentItem[];
  month: Date;
  onMonthChange: (date: Date) => void;
}) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(
    firstDay.getFullYear(),
    firstDay.getMonth(),
    1 - mondayOffset,
  );
  const totalCells = Math.ceil((mondayOffset + lastDay.getDate()) / 7) * 7;

  const calendarItems = items.filter(
    (item) => item.scheduledAt || item.publishedAt,
  );

  const itemsByDay = new Map<string, ContentItem[]>();
  for (const item of calendarItems) {
    const value = item.scheduledAt ?? item.publishedAt;
    if (!value) continue;
    const key = localDateKey(value);
    const current = itemsByDay.get(key) ?? [];
    current.push(item);
    itemsByDay.set(key, current);
  }

  for (const dayItems of itemsByDay.values()) {
    dayItems.sort((a, b) => {
      const aDate = new Date(a.scheduledAt ?? a.publishedAt ?? 0).getTime();
      const bDate = new Date(b.scheduledAt ?? b.publishedAt ?? 0).getTime();
      return aDate - bDate;
    });
  }

  const days = Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });

  const todayKey = localDateKey(new Date());

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-[13px] font-semibold capitalize text-[var(--ink)]">
            {monthTitle(month)}
          </h3>
          <p className="mt-1 text-[8px] text-[var(--muted)]">
            Planlanmış ve yayınlanmış içeriklerin gerçek yayın takvimi.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              onMonthChange(
                new Date(month.getFullYear(), month.getMonth() - 1, 1),
              )
            }
            className="h-9 rounded-[10px] border border-[var(--line)] px-3 text-[9px] font-semibold text-[var(--ink)]"
          >
            Önceki
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              onMonthChange(new Date(now.getFullYear(), now.getMonth(), 1));
            }}
            className="h-9 rounded-[10px] border border-[var(--line)] px-3 text-[9px] font-semibold text-[var(--ink)]"
          >
            Bu Ay
          </button>
          <button
            type="button"
            onClick={() =>
              onMonthChange(
                new Date(month.getFullYear(), month.getMonth() + 1, 1),
              )
            }
            className="h-9 rounded-[10px] border border-[var(--line)] px-3 text-[9px] font-semibold text-[var(--ink)]"
          >
            Sonraki
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[920px]">
          <div className="grid grid-cols-7 border-b border-[var(--line)]">
            {calendarWeekdays.map((weekday) => (
              <div
                key={weekday}
                className="px-2 py-2 text-[8px] font-semibold uppercase tracking-[.08em] text-[var(--muted)]"
              >
                {weekday}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((date) => {
              const key = localDateKey(date);
              const dayItems = itemsByDay.get(key) ?? [];
              const inMonth = date.getMonth() === month.getMonth();
              const isToday = key === todayKey;

              return (
                <div
                  key={key}
                  className={
                    "min-h-[132px] border-b border-r border-[var(--line)] p-2 " +
                    (inMonth ? "bg-white" : "bg-[var(--surface-2)]/45")
                  }
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span
                      className={
                        isToday
                          ? "inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[8px] font-semibold text-white"
                          : inMonth
                            ? "text-[8px] font-semibold text-[var(--ink)]"
                            : "text-[8px] font-medium text-[var(--muted-soft)]"
                      }
                    >
                      {date.getDate()}
                    </span>
                    {dayItems.length ? (
                      <span className="text-[7px] font-semibold text-[var(--muted)]">
                        {dayItems.length}
                      </span>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    {dayItems.slice(0, 3).map((item) => {
                      const dateValue = item.scheduledAt ?? item.publishedAt;
                      return (
                        <div
                          key={item.id}
                          className="rounded-[9px] border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5"
                        >
                          <p className="truncate text-[8px] font-semibold text-[var(--ink)]">
                            {item.title}
                          </p>
                          <p className="mt-0.5 truncate text-[7px] text-[var(--muted)]">
                            {dateValue
                              ? new Intl.DateTimeFormat("tr-TR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }).format(new Date(dateValue))
                              : ""}{" "}
                            · {userLabel(item.platform)}
                          </p>
                          <div className="mt-1">
                            <Status value={item.status} />
                          </div>
                        </div>
                      );
                    })}

                    {dayItems.length > 3 ? (
                      <p className="px-1 text-[7px] font-semibold text-[var(--accent)]">
                        +{dayItems.length - 3} içerik daha
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {!calendarItems.length ? (
        <div className="mt-4 rounded-[12px] border border-dashed border-[var(--line)] p-5 text-center text-[9px] text-[var(--muted)]">
          Seçili filtrelerde yayın zamanı olan içerik bulunmuyor.
        </div>
      ) : null}
    </div>
  );
}

function ContentActions({
  item,
  canManage,
  actingId,
  onReview,
  onSchedule,
  onPublish,
  compact,
}: {
  item: ContentItem;
  canManage: boolean;
  actingId: string;
  onReview: (id: string) => Promise<void>;
  onSchedule: (id: string) => void;
  onPublish: (id: string) => Promise<void>;
  compact?: boolean;
}) {
  if (!canManage) {
    return (
      <span className="text-[8px] text-[var(--muted)]">
        Görüntüleme yetkisi
      </span>
    );
  }

  if (["IDEA", "BRIEF", "PRODUCTION"].includes(item.status)) {
    return (
      <Button
        className={compact ? "w-full" : ""}
        disabled={actingId === item.id}
        onClick={() => void onReview(item.id)}
      >
        İncelemeye Gönder
      </Button>
    );
  }

  if (item.status === "APPROVED") {
    return (
      <div className={compact ? "grid gap-2" : "flex flex-wrap gap-2"}>
        <Button
          variant="secondary"
          onClick={() => onSchedule(item.id)}
        >
          Planla
        </Button>
        <Button
          disabled={actingId === item.id}
          onClick={() => void onPublish(item.id)}
        >
          Yayınla
        </Button>
      </div>
    );
  }

  if (item.status === "SCHEDULED") {
    return (
      <Button
        className={compact ? "w-full" : ""}
        disabled={actingId === item.id}
        onClick={() => void onPublish(item.id)}
      >
        Yayınlandı İşaretle
      </Button>
    );
  }

  return (
    <span className="text-[8px] text-[var(--muted)]">
      Bu aşamada işlem beklemiyor
    </span>
  );
}

function Metric({
  label,
  value,
  detail,
  attention,
}: {
  label: string;
  value: number;
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
      <strong className="mt-3 block text-[22px] font-semibold tracking-[-.04em] text-[var(--ink)]">
        {value}
      </strong>
      <p className="mt-2 text-[8px] text-[var(--muted)]">{detail}</p>
    </div>
  );
}

function Status({ value }: { value: string }) {
  return (
    <span className="inline-flex rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--accent)]">
      {statusLabel[value] ?? userLabel(value)}
    </span>
  );
}
