"use client";

import { useEffect, useState } from "react";

import { Alert, Button, Field, Spinner, TextInput } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import type { Paginated, Service } from "@/lib/types";

type ChecklistItem = {
  id?: string;
  code: string;
  title: string;
  description: string | null;
  sortOrder?: number;
  isRequired: boolean;
};

type ChecklistTemplate = {
  id: string;
  serviceId: string;
  name: string;
  version: number;
  isActive: boolean;
  duplicate?: boolean;
  items: ChecklistItem[];
};

function emptyItem(index: number): ChecklistItem {
  return {
    code: `STEP_${index + 1}`,
    title: "",
    description: null,
    isRequired: true,
  };
}

export default function OperationsChecklistsPage() {
  const canUpdate = hasPermission("appointments", "update");
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [activeTemplate, setActiveTemplate] = useState<ChecklistTemplate | null>(null);
  const [name, setName] = useState("");
  const [items, setItems] = useState<ChecklistItem[]>([emptyItem(0)]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadServices() {
      if (!hasActiveBranch()) {
        setError("SOP yönetimi için önce çalışma kapsamından bir şube seçin.");
        setLoading(false);
        return;
      }
      try {
        const result = await api<Paginated<Service>>(
          withQuery("/services", { page: 1, limit: 200 }),
        );
        setServices(result.data.filter((service) => service.status === "ACTIVE"));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Hizmetler yüklenemedi.");
      } finally {
        setLoading(false);
      }
    }
    void loadServices();
  }, []);

  async function selectService(serviceId: string) {
    setSelectedServiceId(serviceId);
    setActiveTemplate(null);
    setMessage("");
    setError("");
    if (!serviceId) {
      setName("");
      setItems([emptyItem(0)]);
      return;
    }

    try {
      const template = await api<ChecklistTemplate | null>(
        `/operations/service-checklists/services/${serviceId}/active`,
      );
      setActiveTemplate(template);
      setName(template?.name ?? "Hizmet SOP Checklist");
      setItems(
        template?.items.length
          ? template.items.map((item) => ({ ...item }))
          : [emptyItem(0)],
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Aktif SOP template yüklenemedi.",
      );
    }
  }

  function updateItem(index: number, patch: Partial<ChecklistItem>) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function saveVersion() {
    if (!canUpdate || !selectedServiceId || !name.trim()) return;
    const normalizedItems = items.map((item) => ({
      code: item.code.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, "_"),
      title: item.title.trim(),
      description: item.description?.trim() || null,
      isRequired: item.isRequired,
    }));
    if (
      !normalizedItems.length ||
      normalizedItems.some((item) => !item.code || !item.title)
    ) {
      setError("Her checklist maddesi için kod ve başlık zorunludur.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await api<ChecklistTemplate>(
        `/operations/service-checklists/services/${selectedServiceId}/versions`,
        {
          method: "POST",
          body: { name: name.trim(), items: normalizedItems },
        },
      );
      setActiveTemplate(saved);
      setName(saved.name);
      setItems(saved.items.map((item) => ({ ...item })));
      setMessage(
        saved.duplicate
          ? `Tanım değişmedi; aktif versiyon ${saved.version} korunuyor.`
          : `SOP versiyon ${saved.version} aktif edildi. Yeni hizmet icraları bu snapshot'ı kullanacak.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "SOP versiyonu kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[1420px] py-10">
        <Spinner label="SOP çalışma alanı hazırlanıyor..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1420px] space-y-5 pb-10">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">
          Service SOP Engine
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
          Hizmet SOP ve Checklist Yönetimi
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
          Hizmet bazında versiyonlu uygulama adımları tanımlayın. Hizmet başladığında aktif versiyon execution üzerine snapshot alınır; sonraki template değişiklikleri geçmiş hizmet kanıtını değiştirmez.
        </p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {message ? (
        <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[#2d6a49]">
          {message}
        </div>
      ) : null}

      <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
          <Field label="Hizmet">
            <select
              className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm"
              value={selectedServiceId}
              onChange={(event) => void selectService(event.target.value)}
            >
              <option value="">Hizmet seçin</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="rounded-[14px] bg-[var(--surface-2)] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-soft)]">
              Aktif Versiyon
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
              {activeTemplate ? `v${activeTemplate.version}` : "Henüz yok"}
            </p>
          </div>
        </div>
      </section>

      {selectedServiceId ? (
        <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
          <Field label="Checklist adı">
            <TextInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Lazer Epilasyon SOP"
            />
          </Field>

          <div className="mt-5 space-y-3">
            {items.map((item, index) => (
              <div
                key={`${item.id ?? "new"}:${index}`}
                className="rounded-[18px] border border-[var(--line)] bg-[var(--surface-2)] p-4"
              >
                <div className="grid gap-3 lg:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)_120px_auto] lg:items-end">
                  <Field label="Kod">
                    <TextInput
                      value={item.code}
                      onChange={(event) =>
                        updateItem(index, { code: event.target.value.toUpperCase() })
                      }
                    />
                  </Field>
                  <Field label="Adım">
                    <TextInput
                      value={item.title}
                      onChange={(event) => updateItem(index, { title: event.target.value })}
                      placeholder="Müşteri koruyucu ekipmanı kontrol edildi"
                    />
                  </Field>
                  <Field label="Açıklama">
                    <TextInput
                      value={item.description ?? ""}
                      onChange={(event) =>
                        updateItem(index, { description: event.target.value || null })
                      }
                      placeholder="Uygulama talimatı / kanıt notu"
                    />
                  </Field>
                  <label className="flex min-h-11 items-center gap-2 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--ink)]">
                    <input
                      type="checkbox"
                      checked={item.isRequired}
                      onChange={(event) =>
                        updateItem(index, { isRequired: event.target.checked })
                      }
                    />
                    Zorunlu
                  </label>
                  <Button
                    variant="secondary"
                    disabled={items.length === 1}
                    onClick={() => removeItem(index)}
                  >
                    Kaldır
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap justify-between gap-3">
            <Button
              variant="secondary"
              onClick={() => setItems((current) => [...current, emptyItem(current.length)])}
            >
              Adım Ekle
            </Button>
            <Button disabled={!canUpdate || saving} onClick={() => void saveVersion()}>
              {saving ? "Versiyon Kaydediliyor..." : "Yeni SOP Versiyonunu Yayınla"}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
