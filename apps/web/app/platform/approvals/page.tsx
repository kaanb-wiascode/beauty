"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/lib/api";
import { userLabel, userPermissionLabel } from "@/lib/user-language";
import {
  decidePlatformPrivilegedOperation,
  executePlatformPrivilegedOperation,
  listPlatformPrivilegedOperations,
  type PlatformPrivilegedOperationList,
} from "@/lib/platform-api";

const dateTime = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function PlatformApprovalsPage() {
  const [status, setStatus] = useState("PENDING");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<PlatformPrivilegedOperationList | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const limit = 25;

  const load = useCallback(async () => {
    setError("");
    try {
      const value = await listPlatformPrivilegedOperations({
        status: status || undefined,
        limit,
        offset,
      });
      setData(value);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Onay kuyruğu yüklenemedi.");
    }
  }, [status, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil((data?.pagination.total ?? 0) / limit));
  const page = Math.floor(offset / limit) + 1;
  const pendingCount = useMemo(
    () => data?.items.filter((item) => item.status === "PENDING").length ?? 0,
    [data],
  );

  async function decide(requestId: string, decision: "APPROVED" | "REJECTED") {
    const reason = decisionReason.trim();
    if (reason.length < 8) {
      setError("Karar nedeni en az 8 karakter olmalı.");
      return;
    }
    setBusyId(requestId);
    setError("");
    setNotice("");
    try {
      await decidePlatformPrivilegedOperation(requestId, { decision, reason });
      setDecisionReason("");
      setNotice(decision === "APPROVED" ? "İşlem onaylandı ve uygulanmaya hazır." : "İşlem reddedildi.");
      await load();
    } catch (reasonValue) {
      setError(reasonValue instanceof ApiError ? reasonValue.message : "Karar kaydedilemedi.");
    } finally {
      setBusyId(null);
    }
  }

  async function execute(requestId: string) {
    setBusyId(requestId);
    setError("");
    setNotice("");
    try {
      const result = await executePlatformPrivilegedOperation(requestId);
      setNotice(
        result.status === "EXECUTED"
          ? "Onaylanan işlem güvenli şekilde uygulandı ve denetim kaydı oluşturuldu."
          : "Onay süresi dolduğu için işlem kapatıldı.",
      );
      await load();
    } catch (reasonValue) {
      setError(reasonValue instanceof ApiError ? reasonValue.message : "İşlem uygulanamadı.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1380px] space-y-7 pb-12">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-violet-300">Kritik İşlem Yönetimi</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] text-white sm:text-4xl">Onay Kuyruğu</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">Yüksek riskli platform işlemlerini ikinci kişi kontrolüyle yönetin. Karar geçmişi değiştirilemez ve onaylanan işlem yalnızca bir kez uygulanabilir.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {["PENDING", "APPROVED", "REJECTED", "EXECUTED", "EXPIRED", ""].map((value) => (
            <button
              key={value || "ALL"}
              type="button"
              onClick={() => { setStatus(value); setOffset(0); }}
              className={`rounded-xl border px-3 py-2 text-[10px] font-semibold transition ${status === value ? "border-violet-400/30 bg-violet-400/10 text-violet-100" : "border-white/10 bg-white/[.035] text-white/45 hover:bg-white/[.06]"}`}
            >
              {value ? userLabel(value) : "Tümü"}
            </button>
          ))}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Görünen kayıt" value={data?.items.length ?? 0} />
        <Metric label="Bekleyen" value={pendingCount} />
        <Metric label="Toplam" value={data?.pagination.total ?? 0} />
      </section>

      <section className="rounded-[26px] border border-white/10 bg-white/[.035] p-5 sm:p-6">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="block">
            <span className="text-[9px] font-semibold uppercase tracking-[.13em] text-white/30">Karar nedeni</span>
            <input
              value={decisionReason}
              onChange={(event) => setDecisionReason(event.target.value)}
              maxLength={500}
              placeholder="Onay veya ret için gerekçeyi yazın…"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-violet-400/30"
            />
          </label>
          <p className="pb-3 text-[10px] text-white/30">En az 8 karakter · Talebi oluşturan kişi kendi talebini onaylayamaz</p>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-red-400/20 bg-red-400/[.07] px-5 py-4 text-sm text-red-100">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[.07] px-5 py-4 text-sm text-emerald-100">{notice}</div> : null}

      <section className="space-y-3">
        {data?.items.map((item) => (
          <article key={item.id} className="rounded-[24px] border border-white/10 bg-white/[.035] p-5 sm:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Risk value={item.riskLevel} />
                  <Status value={item.status} />
                  <span className="rounded-lg border border-white/[.07] bg-black/20 px-2 py-1 text-[10px] text-violet-200">{userPermissionLabel(item.resource, item.action)}</span>
                </div>
                <p className="mt-4 text-sm font-semibold text-white">{item.reason}</p>
                <div className="mt-3 grid gap-2 text-[10px] text-white/35 sm:grid-cols-2 xl:grid-cols-4">
                  <span>Talep Eden: {item.requesterEmail}</span>
                  <span>İlgili Kayıt: {item.targetEntityId ? "Belirlendi" : "—"}</span>
                  <span>Oluşturulma: {dateTime.format(new Date(item.createdAt))}</span>
                  <span>Onay İçin Son Tarih: {dateTime.format(new Date(item.expiresAt))}</span>
                </div>
                {item.approverEmail ? <p className="mt-2 text-[10px] text-white/35">Onaylayan: {item.approverEmail}{item.decisionReason ? ` · ${item.decisionReason}` : ""}</p> : null}
                {item.executedAt ? <p className="mt-2 text-[10px] text-emerald-300/60">Uygulanma: {dateTime.format(new Date(item.executedAt))}</p> : null}
              </div>

              {item.status === "PENDING" ? (
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void decide(item.id, "REJECTED")}
                    className="rounded-xl border border-red-400/20 bg-red-400/[.07] px-3 py-2 text-[10px] font-semibold text-red-100 transition hover:bg-red-400/[.12] disabled:opacity-40"
                  >Reddet</button>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void decide(item.id, "APPROVED")}
                    className="rounded-xl border border-emerald-400/20 bg-emerald-400/[.08] px-3 py-2 text-[10px] font-semibold text-emerald-100 transition hover:bg-emerald-400/[.13] disabled:opacity-40"
                  >Onayla</button>
                </div>
              ) : null}

              {item.status === "APPROVED" ? (
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void execute(item.id)}
                  className="shrink-0 rounded-xl border border-violet-400/25 bg-violet-400/[.1] px-4 py-2.5 text-[10px] font-semibold text-violet-100 transition hover:bg-violet-400/[.16] disabled:opacity-40"
                >Uygula</button>
              ) : null}
            </div>
          </article>
        ))}
        {data && !data.items.length ? <p className="rounded-[24px] border border-white/10 bg-white/[.03] px-6 py-12 text-center text-sm text-white/35">Bu filtrede kritik işlem talebi bulunmuyor.</p> : null}
      </section>

      <div className="flex items-center justify-between gap-4">
        <p className="text-[10px] text-white/30">Sayfa {page} / {pageCount}</p>
        <div className="flex gap-2">
          <button type="button" disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - limit))} className="rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-[10px] text-white/55 disabled:opacity-30">Önceki</button>
          <button type="button" disabled={!data || offset + limit >= data.pagination.total} onClick={() => setOffset((value) => value + limit)} className="rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-[10px] text-white/55 disabled:opacity-30">Sonraki</button>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-[22px] border border-white/10 bg-white/[.035] p-5"><p className="text-[9px] font-semibold uppercase tracking-[.15em] text-white/35">{label}</p><p className="mt-3 text-2xl font-semibold text-white">{value}</p></div>;
}
function Risk({ value }: { value: string }) {
  const className = value === "CRITICAL" ? "border-red-400/25 bg-red-400/[.08] text-red-200" : value === "HIGH" ? "border-amber-400/25 bg-amber-400/[.08] text-amber-200" : "border-sky-400/20 bg-sky-400/[.07] text-sky-200";
  return <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold ${className}`}>{userLabel(value)}</span>;
}
function Status({ value }: { value: string }) {
  return <span className="rounded-full border border-white/10 bg-white/[.04] px-2.5 py-1 text-[9px] font-semibold text-white/50">{userLabel(value)}</span>;
}
