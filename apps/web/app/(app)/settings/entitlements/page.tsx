"use client";

import { useEffect, useState } from "react";
import { CardInfo } from "@/components/card-info";
import { api, ApiError } from "@/lib/api";
import { userErrorMessage, userFieldLabel, userLabel } from "@/lib/user-language";
import { getCardHelp } from "@/lib/card-help";

type Entitlement = {
  key: string;
  name: string;
  description: string | null;
  valueType: "BOOLEAN" | "INTEGER" | "STRING" | "JSON";
  effectiveValue: unknown;
  source: "OVERRIDE" | "PLAN" | "DEFAULT";
  overrideEndsAt: string | null;
};

type Payload = { tenantId: string; companyId: string; items: Entitlement[] };

const SOURCE_LABELS: Record<Entitlement["source"], string> = {
  OVERRIDE: "Geçici Tanım",
  PLAN: "Abonelik Planı",
  DEFAULT: "Varsayılan",
};

function renderValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Etkin" : "Kapalı";
  if (typeof value === "string") return userLabel(value);
  if (typeof value === "number") return new Intl.NumberFormat("tr-TR").format(value);
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? userLabel(item) : String(item)).join(", ");
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${userFieldLabel(key)}: ${typeof item === "string" ? userLabel(item) : String(item ?? "—")}`)
      .join(" · ");
  }
  return "—";
}

export default function EntitlementsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Payload>("/admin/entitlements").then(setData).catch((e) => setError(e instanceof ApiError ? userErrorMessage(e.message, "Plan özellikleri yüklenemedi.") : "Plan özellikleri yüklenemedi."));
  }, []);

  return (
    <main className="mx-auto w-full max-w-[1100px] space-y-6 pb-10">
      <header className="border-b border-[var(--line)] pb-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Yönetim / Sistem</div>
        <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">Plan Özellikleri</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Abonelik planınızla kullanabildiğiniz özellikleri ve modülleri görüntüleyin. Kullanıcı yetkileri bu ekrandan yönetilmez.</p>
      </header>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-500">{error}</div>}
      {!data && !error && <div className="text-sm text-[var(--muted)]">Yükleniyor…</div>}
      {data && (
        <section className="grid gap-4 md:grid-cols-2">
          {data.items.map((item) => (
            <div key={item.key} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold text-[var(--ink)]">{item.name}</div>
                    <CardInfo help={getCardHelp(item.name, item.description ?? "Abonelik planınızda bu özelliğin etkin değerini gösterir.")} />
                  </div>
                </div>
                <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">{SOURCE_LABELS[item.source]}</span>
              </div>
              <div className="mt-4 text-xl font-semibold text-[var(--ink)]">{renderValue(item.effectiveValue)}</div>
              {item.description && <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{item.description}</p>}
              {item.overrideEndsAt && <div className="mt-3 text-[11px] text-[var(--muted)]">Geçici tanımın bitişi: {new Date(item.overrideEndsAt).toLocaleString("tr-TR")}</div>}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
