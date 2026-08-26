"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ConfirmDialog, Modal } from "@/components/modal";
import {
  Alert,
  Button,
  EmptyState,
  Field,
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
  const [page, setPage] = useState(1);
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
        withQuery("/services", { page, limit: 20 }),
      );
      setServices(result.data);
      setTotalPages(result.meta.totalPages || 1);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Hizmetler yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
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
    setSaving(true);
    setFormError("");

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

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <PageHeader
        title="Hizmetler"
        description="Salon hizmetlerini ve fiyatları yönetin."
        action={<Button onClick={openCreate}>Yeni hizmet</Button>}
      />

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <Panel>
        {loading ? (
          <Spinner label="Hizmetler yükleniyor..." />
        ) : services.length === 0 ? (
          <EmptyState
            title="Henüz hizmet yok"
            description="Yeni hizmet ekleyerek başlayın."
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
                  <Th>İşlemler</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {services.map((service) => (
                  <tr key={service.id} className="hover:bg-stone-50/60">
                    <Td label="Hizmet" className="font-medium">
                      {service.name}
                    </Td>
                    <Td label="Açıklama" className="max-w-xs truncate">
                      {service.description ?? "—"}
                    </Td>
                    <Td label="Süre">{formatDuration(service.durationMinutes)}</Td>
                    <Td label="Fiyat">{formatPrice(service.price)}</Td>
                    <Td label="Durum">
                      <StatusBadge
                        status={service.status}
                        label={serviceStatusLabel(service.status)}
                      />
                    </Td>
                    <Td label="İşlemler" actions>
                      <div className="flex gap-2">
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
                        >
                          Sil
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
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
        onClose={() => setModalOpen(false)}
        title={editing ? "Hizmeti düzenle" : "Yeni hizmet"}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Hizmet">
            <TextInput
              required
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
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
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
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
        title="Hizmeti sil"
        description="Bu hizmet arşivlenecek. Devam edilsin mi?"
        loading={saving}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void onDelete()}
      />
    </div>
  );
}
