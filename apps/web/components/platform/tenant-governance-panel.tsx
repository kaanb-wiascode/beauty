"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/lib/api";
import { userErrorMessage, userLabel, userPermissionLabel } from "@/lib/user-language";
import {
  getPlatformTenantGovernance,
  requestPlatformCustomerLifecycle,
  type PlatformTenantGovernance,
} from "@/lib/platform-api";

type LifecycleState = "ACTIVE" | "RESTRICTED" | "SUSPENDED";

const dateTime = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const stateLabel: Record<LifecycleState, string> = {
  ACTIVE: "Aktif",
  RESTRICTED: "Kısıtlı",
  SUSPENDED: "Askıya alınmış",
};

const stateClass: Record<LifecycleState, string> = {
  ACTIVE: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  RESTRICTED: "border-amber-400/20 bg-amber-400/10 text-amber-100",
  SUSPENDED: "border-red-400/20 bg-red-400/10 text-red-100",
};

export function TenantGovernancePanel({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<PlatformTenantGovernance | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [targetState, setTargetState] = useState<LifecycleState>("RESTRICTED");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const value = await getPlatformTenantGovernance(tenantId);
      setData(value);
      setError("");
    } catch (cause) {
      setError(cause instanceof ApiError ? userErrorMessage(cause.message, "İşletme yönetim bilgileri yüklenemedi.") : "İşletme yönetim bilgileri yüklenemedi.");
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const availableStates = useMemo<LifecycleState[]>(() => {
    if (!data) return ["RESTRICTED", "SUSPENDED"];
    return (["ACTIVE", "RESTRICTED", "SUSPENDED"] as LifecycleState[])
      .filter((state) => state !== data.lifecycle.state);
  }, [data]);

  useEffect(() => {
    if (availableStates.length && !availableStates.includes(targetState)) {
      setTargetState(availableStates[0]);
    }
  }, [availableStates, targetState]);

  async function submitLifecycleRequest() {
    if (!data) return;
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 8) {
      setError("Durum değişikliği için en az 8 karakterlik bir gerekçe girin.");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const result = await requestPlatformCustomerLifecycle(tenantId, {
        state: targetState,
        expectedVersion: data.lifecycle.version,
        reason: normalizedReason,
      });
      setReason("");
      setNotice(`Onay talebi oluşturuldu. Risk düzeyi: ${userLabel(result.riskLevel)}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? userErrorMessage(cause.message, "Durum değişikliği talebi oluşturulamadı.") : "Durum değişikliği talebi oluşturulamadı.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!data) {
    return (
      <section className="rounded-[26px] border border-white/10 bg-white/[.035] p-6">
        <p className="text-xs text-white/40">İşletme yönetim bilgileri yükleniyor…</p>
        {error ? <p className="mt-3 text-xs text-red-200">{error}</p> : null}
      </section>
    );
  }

  return (
    <section className="space-y-5 rounded-[28px] border border-white/10 bg-white/[.035] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] backdrop-blur-xl sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[.16em] text-violet-300/70">İşletme yönetimi</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Hesap durumu ve kontrol geçmişi</h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-white/40">
            İşletme hesabının kritik durum değişiklikleri, uygulanmadan önce yetkili onayından geçer.
          </p>
        </div>
        <div className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.12em] ${stateClass[data.lifecycle.state]}`}>
          {stateLabel[data.lifecycle.state]}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[.72fr_1.28fr]">
        <div className="space-y-4 rounded-2xl border border-white/[.07] bg-black/15 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Info label="Durum" value={userLabel(data.lifecycle.state)} />
            <Info label="Değişiklik no" value={String(data.lifecycle.version)} />
            <Info label="Son güncelleme" value={dateTime.format(new Date(data.lifecycle.updatedAt))} />
            <Info label="Güncelleyen" value={data.lifecycle.updatedByEmail ?? "Sistem"} />
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-white/25">Mevcut neden</p>
            <p className="mt-1 text-xs leading-5 text-white/60">{data.lifecycle.reason || "Mevcut hesap durumu için ek bir gerekçe bulunmuyor."}</p>
          </div>

          <div className="border-t border-white/[.07] pt-4">
            <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-white/25">Yeni durum değişikliği talebi</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {availableStates.map((state) => (
                <button
                  key={state}
                  type="button"
                  onClick={() => setTargetState(state)}
                  className={`rounded-xl border px-2 py-2 text-[10px] font-semibold transition ${
                    targetState === state
                      ? "border-violet-400/50 bg-violet-400/15 text-violet-100"
                      : "border-white/10 bg-white/[.025] text-white/45 hover:text-white/70"
                  }`}
                >
                  {stateLabel[state]}
                </button>
              ))}
            </div>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Gerekçe (zorunlu, en az 8 karakter)"
              className="mt-3 min-h-24 w-full resize-none rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white outline-none placeholder:text-white/25 focus:border-violet-400/40"
              maxLength={500}
            />
            <button
              type="button"
              disabled={submitting || !availableStates.length}
              onClick={() => void submitLifecycleRequest()}
              className="mt-3 w-full rounded-xl border border-violet-400/30 bg-violet-400/15 px-3 py-2.5 text-xs font-semibold text-violet-100 transition hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Talep oluşturuluyor…" : "Onay talebi oluştur"}
            </button>
            {notice ? <p className="mt-3 text-[11px] leading-5 text-emerald-200">{notice}</p> : null}
            {error ? <p className="mt-3 text-[11px] leading-5 text-red-200">{error}</p> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[.07] bg-black/15 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-white/25">Onay süreci</p>
              <p className="mt-1 text-sm font-semibold text-white">Son yetkili işlem talepleri</p>
            </div>
            <Link href="/platform/approvals" className="text-[10px] font-semibold text-violet-300 hover:text-violet-200">
              Onay kuyruğu →
            </Link>
          </div>
          <div className="mt-4 divide-y divide-white/[.06]">
            {data.operations.slice(0, 8).map((operation) => (
              <div key={operation.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-white">{userPermissionLabel(operation.resource, operation.action)}</span>
                    <span className="rounded-md border border-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-white/45">{userLabel(operation.status)}</span>
                    <span className="text-[9px] font-semibold text-amber-200/70">{userLabel(operation.riskLevel)} risk düzeyi</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-white/45">{operation.reason}</p>
                  <p className="mt-1 truncate text-[9px] text-white/25">Talep eden: {operation.requesterEmail} · Onaylayan: {operation.approverEmail ?? "—"}</p>
                </div>
                <p className="text-[9px] text-white/25">{dateTime.format(new Date(operation.createdAt))}</p>
              </div>
            ))}
            {!data.operations.length ? <p className="py-8 text-center text-xs text-white/30">Bu işletme için yetkili işlem talebi bulunmuyor.</p> : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[.07] bg-black/15 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-white/25">İşlem geçmişi</p>
            <p className="mt-1 text-sm font-semibold text-white">İşletmeye ait platform işlemleri</p>
          </div>
          <Link href={`/platform/audit?targetTenantId=${encodeURIComponent(tenantId)}`} className="text-[10px] font-semibold text-violet-300 hover:text-violet-200">
            Denetim kayıtları →
          </Link>
        </div>
        <div className="mt-4 divide-y divide-white/[.06]">
          {data.auditTimeline.slice(0, 10).map((event) => (
            <div key={event.id} className="grid gap-2 py-3 lg:grid-cols-[1.1fr_1.5fr_auto] lg:items-start">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white">{userPermissionLabel(event.resource, event.action)}</p>
                <p className="mt-1 truncate text-[9px] text-white/25">{event.actorEmail ?? event.actorUserId}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] leading-5 text-white/45">{event.reason || "Gerekçe kaydı bulunmuyor."}</p>
                {event.approvalRequestId ? <p className="mt-1 truncate text-[9px] text-violet-300/55">Onay kaydı mevcut</p> : null}
              </div>
              <p className="text-[9px] text-white/25">{dateTime.format(new Date(event.createdAt))}</p>
            </div>
          ))}
          {!data.auditTimeline.length ? <p className="py-8 text-center text-xs text-white/30">Bu işletmeye ait denetim kaydı bulunmuyor.</p> : null}
        </div>
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-white/25">{label}</p>
      <p className="mt-1 truncate text-xs font-medium text-white/65" title={value}>{value}</p>
    </div>
  );
}
