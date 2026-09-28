"use client";

import { useMemo, useState, type FormEvent } from "react";

import { Alert, Button, Field, Modal, Select, TextArea, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

export type QuickCreatedEntity = {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  price?: number | string;
  durationMinutes?: number;
  status?: string;
  active?: boolean;
};

export type QuickCreateKind = "customer" | "service" | "package";

type ServiceOption = {
  id: string;
  name: string;
  price?: number | string;
};

export function MasterDataQuickCreate({
  open,
  kind,
  initialName = "",
  services = [],
  onClose,
  onCreated,
}: {
  open: boolean;
  kind: QuickCreateKind;
  initialName?: string;
  services?: ServiceOption[];
  onClose: () => void;
  onCreated: (entity: QuickCreatedEntity) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const title = useMemo(() => {
    if (kind === "customer") return "Yeni müşteri";
    if (kind === "service") return "Yeni hizmet";
    return "Yeni paket";
  }, [kind]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");

    try {
      let created: QuickCreatedEntity;

      if (kind === "customer") {
        const firstName = String(form.get("firstName") || "").trim();
        const lastName = String(form.get("lastName") || "").trim();
        const phone = String(form.get("phone") || "").trim();
        const email = String(form.get("email") || "").trim();

        if (!firstName || !lastName) {
          setError("Ad ve soyad zorunludur.");
          return;
        }
        if (!phone && !email) {
          setError("Telefon veya e-posta bilgilerinden en az biri gereklidir.");
          return;
        }

        created = await api<QuickCreatedEntity>("/customers", {
          method: "POST",
          body: {
            firstName,
            lastName,
            ...(phone ? { phone } : {}),
            ...(email ? { email } : {}),
          },
        });
      } else if (kind === "service") {
        const name = String(form.get("name") || "").trim();
        const durationMinutes = Number(form.get("durationMinutes") || 60);
        const price = Number(form.get("price") || 0);
        const category = String(form.get("category") || "").trim();

        if (!name) {
          setError("Hizmet adı zorunludur.");
          return;
        }
        if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
          setError("Hizmet süresi en az 1 dakika olmalıdır.");
          return;
        }
        if (!Number.isFinite(price) || price < 0) {
          setError("Hizmet fiyatı 0 veya daha büyük olmalıdır.");
          return;
        }

        created = await api<QuickCreatedEntity>("/services", {
          method: "POST",
          body: {
            name,
            durationMinutes,
            price,
            category: category || undefined,
            currency: "TRY",
            taxRate: 20,
            preparationMinutes: 0,
            cleanupMinutes: 0,
            requiresConsultation: false,
          },
        });
      } else {
        const name = String(form.get("name") || "").trim();
        const price = Number(form.get("price") || 0);
        const serviceId = String(form.get("serviceId") || "");
        const quantity = Number(form.get("quantity") || 1);

        if (!name) {
          setError("Paket adı zorunludur.");
          return;
        }
        if (!serviceId) {
          setError("Paket için en az bir hizmet seçilmelidir.");
          return;
        }
        if (!Number.isInteger(quantity) || quantity < 1) {
          setError("Seans adedi en az 1 olmalıdır.");
          return;
        }

        created = await api<QuickCreatedEntity>("/packages", {
          method: "POST",
          body: {
            name,
            price,
            items: [{ serviceId, quantity }],
          },
        });
      }

      onCreated(created);
      onClose();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Kayıt oluşturulamadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description="Ana formdan ayrılmadan yeni kaydı oluşturun. Kaydedildiğinde otomatik seçilir."
    >
      <form onSubmit={submit} className="space-y-4">
        {kind === "customer" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ad" required>
              <TextInput name="firstName" required autoFocus />
            </Field>
            <Field label="Soyad" required>
              <TextInput name="lastName" required />
            </Field>
            <Field label="Telefon">
              <TextInput name="phone" placeholder="+90" />
            </Field>
            <Field label="E-posta">
              <TextInput name="email" type="email" />
            </Field>
          </div>
        ) : null}

        {kind === "service" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Hizmet adı" required>
              <TextInput name="name" required defaultValue={initialName} autoFocus />
            </Field>
            <Field label="Kategori">
              <TextInput name="category" placeholder="Örn. Cilt Bakımı" />
            </Field>
            <Field label="Süre (dk)" required>
              <TextInput name="durationMinutes" type="number" min="1" defaultValue="60" required />
            </Field>
            <Field label="Fiyat" required>
              <TextInput name="price" type="number" min="0" step="0.01" defaultValue="0" required />
            </Field>
          </div>
        ) : null}

        {kind === "package" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Paket adı" required>
              <TextInput name="name" required defaultValue={initialName} autoFocus />
            </Field>
            <Field label="Paket fiyatı" required>
              <TextInput name="price" type="number" min="0" step="0.01" defaultValue="0" required />
            </Field>
            <Field label="Hizmet" required>
              <Select name="serviceId" required defaultValue="">
                <option value="">Hizmet seçin</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Seans adedi" required>
              <TextInput name="quantity" type="number" min="1" step="1" defaultValue="1" required />
            </Field>
          </div>
        ) : null}

        {error ? <Alert>{error}</Alert> : null}

        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Vazgeç
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Oluşturuluyor..." : "Oluştur ve seç"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
