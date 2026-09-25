"use client";

import { useEffect, useState } from "react";

import { Alert, Button, Field, Spinner, TextInput } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";

type Category = "OPENING" | "CLOSING";
type TemplateItem = {
  id?: string;
  code: string;
  title: string;
  sortOrder?: number;
  isRequired: boolean;
};
type Template = {
  id: string;
  branchId: string | null;
  category: Category;
  name: string;
  version: number;
  items: TemplateItem[];
};
type RunItem = {
  id: string;
  itemCode: string;
  title: string;
  isRequired: boolean;
  status: "PENDING" | "COMPLETED" | "NA";
  note: string | null;
  version: number;
};
type Run = {
  id: string;
  category: Category;
  templateName: string;
  templateVersion: number;
  businessDate: string;
  status: "OPEN" | "COMPLETED";
  startedAt: string;
  completedAt: string | null;
  version: number;
  items: RunItem[];
};

const categoryLabel: Record<Category, string> = {
  OPENING: "Açılış",
  CLOSING: "Kapanış",
};

const starterItems: Record<Category, TemplateItem[]> = {
  OPENING: [
    { code: "CASH_READY", title: "Kasa / ödeme alanı hazır", isRequired: true },
    { code: "ROOMS_READY", title: "Odalar ve kabinler hazır", isRequired: true },
    { code: "DEVICES_READY", title: "Cihaz kontrolleri tamamlandı", isRequired: true },
    { code: "CONSUMABLES_READY", title: "Sarf malzemeler yeterli", isRequired: true },
    { code: "WAITING_AREA_READY", title: "Bekleme alanı hazır", isRequired: false },
  ],
  CLOSING: [
    { code: "DEVICES_SHUTDOWN", title: "Cihazlar güvenli şekilde kapatıldı", isRequired: true },
    { code: "ROOMS_CLEAN", title: "Odalar / kabinler temiz ve hazır", isRequired: true },
    { code: "STOCK_REVIEWED", title: "Stok ve kritik sarflar kontrol edildi", isRequired: true },
    { code: "CASH_HANDOFF", title: "Kasa kapanış devri tamamlandı", isRequired: true },
    { code: "EXCEPTIONS_REVIEWED", title: "Gün sonu operasyon istisnaları gözden geçirildi", isRequired: false },
  ],
};

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function BranchChecklistsPage() {
  const canUpdate = hasPermission("appointments", "update");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [runs, setRuns] = useState<Partial<Record<Category, Run>>>({});
  const [date, setDate] = useState(today());
  const [draftCategory, setDraftCategory] = useState<Category>("OPENING");
  const [draftName, setDraftName] = useState("Şube Açılış Standardı");
  const [draftItems, setDraftItems] = useState<TemplateItem[]>(starterItems.OPENING);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    if (!hasActiveBranch()) {
      setError("Şube kontrol listelerini kullanmak için önce aktif bir şube seçin.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [templateResult, runList] = await Promise.all([
        api<Template[]>("/operations/branch-checklists/templates"),
        api<Array<Omit<Run, "items">>>(
          withQuery("/operations/branch-checklists/runs", { from: date, to: date }),
        ),
      ]);
      setTemplates(templateResult);
      const loadedRuns: Partial<Record<Category, Run>> = {};
      for (const run of runList) {
        loadedRuns[run.category] = await api<Run>(
          `/operations/branch-checklists/runs/${run.id}`,
        );
      }
      setRuns(loadedRuns);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Şube kontrol listeleri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Initial branch/day snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeDraftCategory(category: Category) {
    setDraftCategory(category);
    const existing = templates.find((item) => item.category === category);
    setDraftName(existing?.name ?? `Şube ${categoryLabel[category]} Standardı`);
    setDraftItems(existing?.items?.length ? existing.items.map(({ code, title, isRequired }) => ({ code, title, isRequired })) : starterItems[category]);
  }

  async function publishTemplate() {
    if (!canUpdate || !draftItems.length) return;
    setBusy("template");
    setError("");
    setMessage("");
    try {
      const result = await api<{ unchanged: boolean }>(
        "/operations/branch-checklists/templates",
        {
          method: "POST",
          body: {
            category: draftCategory,
            name: draftName,
            items: draftItems.map((item) => ({
              code: item.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "_"),
              title: item.title.trim(),
              isRequired: item.isRequired,
            })),
          },
        },
      );
      setMessage(result.unchanged ? "Aynı kontrol listesi zaten aktif; yeni sürüm oluşturulmadı." : "Yeni kontrol listesi sürümü yayınlandı.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kontrol listesi yayınlanamadı.");
    } finally {
      setBusy("");
    }
  }

  async function startRun(category: Category) {
    if (!canUpdate) return;
    setBusy(`start:${category}`);
    setError("");
    try {
      const run = await api<Run>("/operations/branch-checklists/runs/start", {
        method: "POST",
        body: { category, businessDate: `${date}T00:00:00.000Z` },
      });
      setRuns((current) => ({ ...current, [category]: run }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kontrol listesi başlatılamadı.");
    } finally {
      setBusy("");
    }
  }

  async function updateItem(run: Run, item: RunItem, status: "COMPLETED" | "NA") {
    if (!canUpdate) return;
    setBusy(`item:${item.id}`);
    setError("");
    try {
      await api(`/operations/branch-checklists/runs/${run.id}/items/${item.id}`, {
        method: "PATCH",
        body: { expectedVersion: item.version, status },
      });
      const fresh = await api<Run>(`/operations/branch-checklists/runs/${run.id}`);
      setRuns((current) => ({ ...current, [run.category]: fresh }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kontrol listesi maddesi güncellenemedi.");
    } finally {
      setBusy("");
    }
  }

  async function completeRun(run: Run) {
    if (!canUpdate) return;
    setBusy(`complete:${run.id}`);
    setError("");
    try {
      await api(`/operations/branch-checklists/runs/${run.id}/complete`, {
        method: "POST",
        body: { expectedVersion: run.version },
      });
      const fresh = await api<Run>(`/operations/branch-checklists/runs/${run.id}`);
      setRuns((current) => ({ ...current, [run.category]: fresh }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kontrol listesi tamamlanamadı.");
    } finally {
      setBusy("");
    }
  }

  if (loading) return <div className="mx-auto max-w-[1420px] py-10"><Spinner label="Şube kontrol listeleri hazırlanıyor..." /></div>;

  return (
    <div className="mx-auto max-w-[1420px] space-y-5 pb-10">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">Şube operasyonları</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">Açılış / Kapanış Kontrol Listeleri</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">Merkez standardını sürümler halinde yönetin, şubeler için günlük kontrol süreci başlatın ve gerekli maddeler tamamlanmadan operasyon gününü kapatmayın.</p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {message ? <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[#2d6a49]">{message}</div> : null}

      <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <Field label="İş günü"><TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
          <Button variant="secondary" onClick={() => void load()}>Günü Yükle</Button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {(["OPENING", "CLOSING"] as Category[]).map((category) => {
          const run = runs[category];
          const required = run?.items.filter((item) => item.isRequired) ?? [];
          const completedRequired = required.filter((item) => item.status === "COMPLETED").length;
          return (
            <div key={category} className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">{categoryLabel[category]}</p>
                  <h2 className="mt-1 text-lg font-semibold text-[var(--ink)]">{run?.templateName ?? `${categoryLabel[category]} kontrol listesi`}</h2>
                  {run ? <p className="mt-1 text-xs text-[var(--muted)]">v{run.templateVersion} · Zorunlu {completedRequired}/{required.length}</p> : <p className="mt-1 text-xs text-[var(--muted)]">Bu gün için kontrol süreci henüz başlamadı.</p>}
                </div>
                {run ? <span className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-semibold text-[var(--ink)]">{run.status === "COMPLETED" ? "Tamamlandı" : "Açık"}</span> : null}
              </div>

              {!run ? (
                <Button className="mt-4" disabled={!canUpdate || busy === `start:${category}`} onClick={() => void startRun(category)}>{busy === `start:${category}` ? "Başlatılıyor..." : `${categoryLabel[category]} kontrol listesini başlat`}</Button>
              ) : (
                <div className="mt-4 space-y-2">
                  {run.items.map((item) => (
                    <div key={item.id} className="flex flex-col gap-3 rounded-[14px] bg-[var(--surface-2)] p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-[var(--ink)]">{item.title}</p>
                        <p className="mt-1 text-[11px] text-[var(--muted)]">{item.isRequired ? "Zorunlu" : "Opsiyonel"} · {item.status === "PENDING" ? "Bekliyor" : item.status === "COMPLETED" ? "Tamamlandı" : "Uygulanamaz"}</p>
                      </div>
                      {run.status === "OPEN" && item.status === "PENDING" && canUpdate ? (
                        <div className="flex gap-2">
                          <Button disabled={busy === `item:${item.id}`} onClick={() => void updateItem(run, item, "COMPLETED")}>Tamamla</Button>
                          {!item.isRequired ? <Button variant="secondary" disabled={busy === `item:${item.id}`} onClick={() => void updateItem(run, item, "NA")}>Uygulanamaz</Button> : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {run.status === "OPEN" && canUpdate ? (
                    <div className="flex justify-end pt-2"><Button disabled={completedRequired !== required.length || busy === `complete:${run.id}`} onClick={() => void completeRun(run)}>{busy === `complete:${run.id}` ? "Tamamlanıyor..." : `${categoryLabel[category]} kontrolünü tamamla`}</Button></div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Kontrol Listesi Yönetimi</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["OPENING", "CLOSING"] as Category[]).map((category) => <Button key={category} variant={draftCategory === category ? undefined : "secondary"} onClick={() => changeDraftCategory(category)}>{categoryLabel[category]}</Button>)}
        </div>
        <div className="mt-4"><Field label="Kontrol listesi adı"><TextInput value={draftName} onChange={(event) => setDraftName(event.target.value)} /></Field></div>
        <div className="mt-4 space-y-2">
          {draftItems.map((item, index) => (
            <div key={`${item.code}:${index}`} className="grid gap-2 rounded-[14px] bg-[var(--surface-2)] p-3 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-center">
              <TextInput value={item.code} onChange={(event) => setDraftItems((items) => items.map((current, i) => i === index ? { ...current, code: event.target.value } : current))} />
              <TextInput value={item.title} onChange={(event) => setDraftItems((items) => items.map((current, i) => i === index ? { ...current, title: event.target.value } : current))} />
              <label className="flex items-center gap-2 text-xs font-medium text-[var(--muted)]"><input type="checkbox" checked={item.isRequired} onChange={(event) => setDraftItems((items) => items.map((current, i) => i === index ? { ...current, isRequired: event.target.checked } : current))} /> Zorunlu</label>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setDraftItems((items) => [...items, { code: `ITEM_${items.length + 1}`, title: "Yeni kontrol maddesi", isRequired: false }])}>Madde Ekle</Button>
          <Button disabled={!canUpdate || busy === "template"} onClick={() => void publishTemplate()}>{busy === "template" ? "Yayınlanıyor..." : "Yeni sürümü yayınla"}</Button>
        </div>
      </section>
    </div>
  );
}
