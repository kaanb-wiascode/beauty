"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog, Modal } from "@/components/modal";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  GlassCard,
  PageHeader,
  Pagination,
  Panel,
  Spinner,
  StatusBadge,
  TableWrap,
  Td,
  TextArea,
  TextInput,
  Th,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError, withQuery } from "@/lib/api";
import {
  formatDuration,
  formatPrice,
  optionalText,
  serviceStatusLabel,
} from "@/lib/format";
import type { CreateServiceInput, Paginated, Service } from "@/lib/types";

type FormState = {
  name: string;
  description: string;
  durationMinutes: string;
  price: string;
};

const emptyForm: FormState = {
  name: "",
  description: "",
  durationMinutes: "60",
  price: "",
};

type Performance = {
  id: string;
  name?: string;
  collected: number;
  appointmentCount: number;
};

type PerformanceResponse = Performance[] | {
  data?: Performance[];
};

function toPayload(form: FormState): CreateServiceInput {
  return {
    name: form.name.trim(),
    durationMinutes: Number(form.durationMinutes),
    price: Number(form.price),
    ...(optionalText(form.description)
      ? { description: form.description.trim() }
      : {}),
  };
}

export default function ServicesPage() {
  const { showToast } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [performance, setPerformance] = useState<Record<string, Performance>>({});
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<Service | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Service | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await api<Paginated<Service>>(
        withQuery("/services", {
          page,
          limit: 20,
          search: search.trim() || undefined,
        }),
      );

      const from = new Date();
      from.setHours(0, 0, 0, 0);

      const to = new Date();
      to.setHours(23, 59, 59, 999);

      const performanceResult = await api<PerformanceResponse>(
        withQuery("/services/performance", {
          from: from.toISOString(),
          to: to.toISOString(),
        }),
      );

      const rows = Array.isArray(performanceResult)
        ? performanceResult
        : performanceResult.data ?? [];

      const performanceMap: Record<string, Performance> = {};
      for (const row of rows) {
        performanceMap[row.id] = row;
      }

      setServices(result.data);
      setPerformance(performanceMap);
      setTotalPages(result.meta.totalPages || 1);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Hizmetler yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(service: Service) {
    setEditing(service);
    setForm({
      name: service.name,
      description: service.description ?? "",
      durationMinutes: String(service.durationMinutes),
      price: String(service.price),
    });
    setFormError("");
    setModalOpen(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    const name = form.name.trim();
    const durationMinutes = Number(form.durationMinutes);
    const price = Number(form.price);

    if (!name) {
      setFormError("Hizmet adı gerekli.");
      return;
    }

    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
      setFormError("Süre 1 ile 1440 dakika arasında olmalı.");
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      setFormError("Fiyat 0 veya daha büyük olmalı.");
      return;
    }

    setSaving(true);
    setFormError("");
    setError("");

    try {
      const payload = toPayload(form);

      if (editing) {
        await api<Service>(`/services/${editing.id}`, {
          method: "PATCH",
          body: payload,
        });
      } else {
        await api<Service>("/services", {
          method: "POST",
          body: payload,
        });
      }

      setModalOpen(false);
      showToast(editing ? "Hizmet güncellendi." : "Hizmet eklendi.");
      await load();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Hizmet kaydedilemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!pendingDelete) return;

    setSaving(true);
    setError("");

    try {
      await api(`/services/${pendingDelete.id}`, { method: "DELETE" });
      setPendingDelete(null);
      showToast("Hizmet arşivlendi.");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Hizmet silinemedi.",
      );
      setPendingDelete(null);
    } finally {
      setSaving(false);
    }
  }

  const activeCount = useMemo(
    () => services.filter((service) => service.status === "ACTIVE").length,
    [services],
  );

  const archivedCount = useMemo(
    () => services.filter((service) => service.status === "ARCHIVED").length,
    [services],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <PageHeader
        title="Hizmetler"
        description="Salon hizmetlerini ve fiyatları yönetin."
        action={<Button onClick={openCreate}>Yeni hizmet</Button>}
      />

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Toplam hizmet" value={services.length} />
        <SummaryCard label="Aktif" value={activeCount} />
        <SummaryCard label="Arşivlenen" value={archivedCount} />
      </section>

      <Panel>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-md">
            <TextInput
              value={search}
              placeholder="Hizmet ara..."
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>

          <span className="text-[12px] text-[var(--muted)]">
            {search.trim() ? `"${search.trim()}" sonuçları` : "Tüm hizmetler"}
          </span>
        </div>

        {loading ? (
          <Spinner label="Hizmetler yükleniyor..." />
        ) : services.length === 0 ? (
          <EmptyState
            title={search.trim() ? "Eşleşen hizmet yok" : "Henüz hizmet yok"}
            description={
              search.trim()
                ? "Arama kriterinizi değiştirerek tekrar deneyin."
                : "Yeni hizmet ekleyerek başlayın."
            }
          />
        ) : (
          <>
            <TableWrap>
              <thead className="border-b border-stone-100 bg-stone-50/80">
                <tr>
                  <Th>Hizmet</Th>
                  <Th>Açıklama</Th>
                  <Th>Süre</Th>
                  <Th>Fiyat</Th>
                  <Th>Durum</Th>
                  <Th>Bugün</Th>
                  <Th>İşlemler</Th>
                </tr>
              </thead>

              <tbody className="divide-y divide-stone-100">
                {services.map((service) => {
                  const stats = performance[service.id];

                  return (
                    <tr key={service.id} className="hover:bg-stone-50/60">
                      <Td label="Hizmet" className="font-medium">
                        {service.name}
                      </Td>
                      <Td label="Açıklama" className="max-w-xs truncate">
                        {service.description ?? "—"}
                      </Td>
                      <Td label="Süre">
                        {formatDuration(service.durationMinutes)}
                      </Td>
                      <Td label="Fiyat">{formatPrice(service.price)}</Td>
                      <Td label="Durum">
                        <StatusBadge
                          status={service.status}
                          label={serviceStatusLabel(service.status)}
                        />
                      </Td>
                      <Td label="Bugün">
                        <div className="text-[12px] text-[var(--muted)]">
                          <div>{stats?.appointmentCount ?? 0} randevu</div>
                          <div className="mt-1 font-medium text-[var(--ink)]">
                            {new Intl.NumberFormat("tr-TR", {
                              style: "currency",
                              currency: "TRY",
                              maximumFractionDigits: 0,
                            }).format(stats?.collected ?? 0)}
                          </div>
                        </div>
                      </Td>
                      <Td label="İşlemler" actions>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="ghost"
                            className="px-3 py-1.5"
                            onClick={() => openEdit(service)}
                          >
                            Düzenle
                          </Button>

                          <Button
                            variant="danger"
                            className="px-3 py-1.5"
                            onClick={() => setPendingDelete(service)}
                            disabled={service.status === "ARCHIVED"}
                          >
                            Arşivle
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>

            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </Panel>

      <Modal
        open={modalOpen}
        onClose={() => {
          if (!saving) {
            setModalOpen(false);
            setFormError("");
          }
        }}
        title={editing ? "Hizmeti düzenle" : "Yeni hizmet"}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Hizmet">
            <TextInput
              required
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </Field>

          <Field label="Açıklama">
            <TextArea
              rows={3}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Süre (dakika)">
              <TextInput
                type="number"
                min={1}
                max={1440}
                required
                value={form.durationMinutes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    durationMinutes: event.target.value,
                  }))
                }
              />
            </Field>

            <Field label="Fiyat">
              <TextInput
                type="number"
                min={0}
                step="0.01"
                required
                value={form.price}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    price: event.target.value,
                  }))
                }
              />
            </Field>
          </div>

          {formError ? <Alert>{formError}</Alert> : null}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              Vazgeç
            </Button>

            <Button type="submit" disabled={saving}>
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Hizmeti arşivle"
        description="Bu hizmet arşivlenecek. Devam edilsin mi?"
        loading={saving}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void onDelete()}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <GlassCard>
      <p className="text-[12px] font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-3 text-[30px] font-semibold tracking-[-0.04em] text-[var(--ink)]">
        {value}
      </p>
    </GlassCard>
  );
}
