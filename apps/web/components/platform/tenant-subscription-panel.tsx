"use client";

import { DatePicker } from "@/components/date-picker";
import { useEffect, useMemo, useState } from "react";
import { Select } from "@/components/ui";

import { ApiError } from "@/lib/api";
import { userErrorMessage, userLabel } from "@/lib/user-language";
import {
  assignPlatformTenantSubscription,
  getPlatformTenantSubscription,
  listPlatformPlans,
  type PlatformPlan,
  type PlatformTenantSubscription,
} from "@/lib/platform-subscriptions-api";

export function TenantSubscriptionPanel({ tenantId }: { tenantId: string }) {
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [subscription, setSubscription] = useState<PlatformTenantSubscription | null>(null);
  const [planVersionId, setPlanVersionId] = useState("");
  const [status, setStatus] = useState<"TRIAL" | "ACTIVE" | "PAST_DUE">("ACTIVE");
  const [monthly, setMonthly] = useState("");
  const [annual, setAnnual] = useState("");
  const [discount, setDiscount] = useState("0");
  const [renewsAt, setRenewsAt] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const activePlans = useMemo(() => plans.filter((plan) => plan.versionId), [plans]);

  useEffect(() => {
    let active = true;
    Promise.all([listPlatformPlans(), getPlatformTenantSubscription(tenantId)])
      .then(([planRows, current]) => {
        if (!active) return;
        setPlans(planRows);
        setSubscription(current);
        if (current) {
          setPlanVersionId(current.planVersionId);
          setStatus(current.status === "TRIAL" || current.status === "PAST_DUE" ? current.status : "ACTIVE");
          setMonthly(current.contractedMonthlyPrice ?? "");
          setAnnual(current.contractedAnnualPrice ?? "");
          setDiscount(current.discountPercent ?? "0");
          setRenewsAt(current.renewsAt ? current.renewsAt.slice(0, 10) : "");
        }
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof ApiError ? userErrorMessage(reason.message, "Abonelik bilgileri yüklenemedi.") : "Abonelik bilgileri yüklenemedi.");
      });
    return () => { active = false; };
  }, [tenantId]);

  async function save() {
    if (!planVersionId) {
      setError("Bir plan sürümü seçin.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const next = await assignPlatformTenantSubscription(tenantId, {
        planVersionId,
        status,
        contractedMonthlyPrice: monthly === "" ? null : Number(monthly),
        contractedAnnualPrice: annual === "" ? null : Number(annual),
        discountPercent: Number(discount || 0),
        renewsAt: renewsAt || null,
      });
      setSubscription(next);
      setMessage("Yeni abonelik kaydı oluşturuldu; önceki aktif sözleşme kapatıldı.");
    } catch (reason: unknown) {
      setError(reason instanceof ApiError ? userErrorMessage(reason.message, "Abonelik güncellenemedi.") : "Abonelik güncellenemedi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[26px] border border-white/10 bg-white/[.035] p-5 backdrop-blur-xl sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[.15em] text-white/30">Abonelik ve sözleşme</p>
          <h2 className="mt-1 text-base font-semibold text-white">Plan ve abonelik</h2>
          <p className="mt-2 text-xs text-white/40">Plan kataloğundaki sürüm bilgisi ile işletmenin sözleşme fiyatı ayrı tutulur.</p>
        </div>
        <div className="rounded-2xl border border-white/[.08] bg-black/15 px-4 py-3 text-xs text-white/55">
          {subscription ? `${subscription.planName} · Sürüm ${subscription.planVersion} · ${userLabel(subscription.status)}` : "Aktif abonelik yok"}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <label className="xl:col-span-2 text-[10px] text-white/45">Plan
          <Select value={planVersionId} onChange={(e) => setPlanVersionId(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs text-white">
            <option value="">Plan seç</option>
            {activePlans.map((plan) => <option key={plan.versionId!} value={plan.versionId!}>{plan.name} · Sürüm {plan.version}</option>)}
          </Select>
        </label>
        <label className="text-[10px] text-white/45">Durum
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs text-white">
            <option value="TRIAL">Deneme</option><option value="ACTIVE">Aktif</option><option value="PAST_DUE">Ödemesi gecikmiş</option>
          </Select>
        </label>
        <label className="text-[10px] text-white/45">Aylık sözleşme bedeli
          <input value={monthly} onChange={(e) => setMonthly(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs text-white" />
        </label>
        <label className="text-[10px] text-white/45">Yıllık sözleşme bedeli
          <input value={annual} onChange={(e) => setAnnual(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs text-white" />
        </label>
        <label className="text-[10px] text-white/45">İndirim %
          <input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs text-white" />
        </label>
        <label className="text-[10px] text-white/45">Yenileme tarihi
          <DatePicker
            value={renewsAt}
            onChange={setRenewsAt}
            ariaLabel="Yenileme tarihi"
            className="mt-1 !border-white/10 !bg-black/25"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={saving} className="rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-2.5 text-xs font-semibold text-violet-100 disabled:opacity-50">
          {saving ? "Kaydediliyor…" : "Abonelik kaydını oluştur"}
        </button>
        {subscription ? <span className="text-[10px] text-white/35">Sözleşme para birimi: {subscription.currency} · Değişiklik no: {subscription.version}</span> : null}
      </div>
      {message ? <p className="mt-3 text-xs text-emerald-300/80">{message}</p> : null}
      {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}
    </section>
  );
}
