"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Select } from "@/components/ui";

import { ApiError } from "@/lib/api";
import { userErrorMessage, userLabel } from "@/lib/user-language";
import {
  createPlatformEntitlementOverride,
  getPlatformTenantEntitlements,
  revokePlatformEntitlementOverride,
  type PlatformTenantEntitlement,
} from "@/lib/platform-entitlements-api";

export function TenantEntitlementsPanel({ tenantId }: { tenantId: string }) {
  const [items, setItems] = useState<PlatformTenantEntitlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [rawValue, setRawValue] = useState("");
  const [reason, setReason] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => items.find((item) => item.key === selectedKey) ?? null, [items, selectedKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getPlatformTenantEntitlements(tenantId);
      setItems(data.items);
      if (!selectedKey && data.items[0]) setSelectedKey(data.items[0].key);
    } catch (reason: unknown) {
      setError(reason instanceof ApiError ? userErrorMessage(reason.message, "Kullanım hakkı bilgileri yüklenemedi.") : "Kullanım hakkı bilgileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [selectedKey, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitOverride = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const value = parseValue(selected.valueType, rawValue);
      await createPlatformEntitlementOverride(tenantId, {
        entitlementKey: selected.key,
        value,
        reason,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      });
      setRawValue("");
      setReason("");
      setEndsAt("");
      await load();
    } catch (reasonValue: unknown) {
      setError(reasonValue instanceof ApiError ? userErrorMessage(reasonValue.message, "Geçici özel ayar oluşturulamadı.") : "Geçici özel ayar oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (item: PlatformTenantEntitlement) => {
    if (!item.overrideId) return;
    const revokeReason = reason.trim();
    if (revokeReason.length < 8) {
      setError("Geçici özel ayarı kaldırmak için en az 8 karakterlik bir gerekçe girin.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await revokePlatformEntitlementOverride(tenantId, item.overrideId, revokeReason);
      setReason("");
      await load();
    } catch (reasonValue: unknown) {
      setError(reasonValue instanceof ApiError ? userErrorMessage(reasonValue.message, "Geçici özel ayar kaldırılamadı.") : "Geçici özel ayar kaldırılamadı.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[26px] border border-white/10 bg-white/[.035] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] backdrop-blur-xl sm:p-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[.15em] text-white/30">Ticari erişim</p>
          <h2 className="mt-1 text-base font-semibold text-white">Özellik ve kullanım hakları</h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-white/40">
            Geçerli kullanım hakkı; varsa geçici özel ayar, ardından plan ve son olarak varsayılan değer dikkate alınarak belirlenir. Süresi dolan özel ayarlar otomatik olarak devreden çıkar.
          </p>
        </div>
        <div className="rounded-full border border-violet-300/20 bg-violet-400/[.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-violet-200">
          {items.length} kullanım hakkı
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[.07] px-4 py-3 text-xs text-red-100">{error}</div> : null}

      {loading ? (
        <div className="mt-5 h-28 animate-pulse rounded-2xl bg-white/[.04]" />
      ) : (
        <div className="mt-5 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {items.map((item) => (
            <div key={item.key} className="rounded-2xl border border-white/[.08] bg-black/15 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white">{item.name}</p>
                  {item.description ? <p className="mt-1 text-[10px] leading-4 text-white/30">{item.description}</p> : null}
                </div>
                <span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${sourceClass(item.source)}`}>{userLabel(item.source)}</span>
              </div>
              <p className="mt-4 text-lg font-semibold tracking-tight text-white">{formatValue(item.effectiveValue)}</p>
              {item.overrideEndsAt ? <p className="mt-1 text-[10px] text-amber-200/70">Özel ayarın bitişi: {new Date(item.overrideEndsAt).toLocaleString("tr-TR")}</p> : null}
              {item.overrideId ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void revoke(item)}
                  className="mt-4 rounded-xl border border-red-300/15 bg-red-400/[.06] px-3 py-2 text-[10px] font-semibold text-red-100 disabled:opacity-40"
                >
                  Özel ayarı kaldır
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-white/[.08] bg-black/15 p-4">
        <p className="text-xs font-semibold text-white">Geçici işletme ayarı</p>
        <div className="mt-4 grid gap-3 xl:grid-cols-[1.25fr_1fr_1fr_1.5fr_auto]">
          <Select value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none">
            {items.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
          </Select>
          <input value={rawValue} onChange={(event) => setRawValue(event.target.value)} placeholder={selected?.valueType === "BOOLEAN" ? "Evet / Hayır" : "Değer"} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none" />
          <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none" />
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Gerekçe (en az 8 karakter)" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none" />
          <button type="button" disabled={busy || !selected || reason.trim().length < 8} onClick={() => void submitOverride()} className="rounded-xl bg-violet-400 px-4 py-2 text-xs font-semibold text-black disabled:opacity-40">
            Özel ayar ekle
          </button>
        </div>
      </div>
    </section>
  );
}

function parseValue(type: PlatformTenantEntitlement["valueType"], raw: string): unknown {
  if (type === "BOOLEAN") {
    const value = raw.trim().toLowerCase();
    if (value === "true" || value === "evet") return true;
    if (value === "false" || value === "hayır" || value === "hayir") return false;
    throw new Error("Bu alan için Evet veya Hayır girin.");
  }
  if (type === "INTEGER") {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) throw new Error("Bu alan için sıfır veya pozitif bir tam sayı girin.");
    return value;
  }
  if (type === "JSON") {
    try { return JSON.parse(raw); } catch { throw new Error("Geçerli bir yapılandırma değeri girin."); }
  }
  return raw;
}

function formatValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Etkin" : "Devre dışı";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function sourceClass(source: PlatformTenantEntitlement["source"]) {
  if (source === "OVERRIDE") return "bg-amber-400/10 text-amber-200";
  if (source === "PLAN") return "bg-emerald-400/10 text-emerald-200";
  return "bg-white/[.06] text-white/45";
}
