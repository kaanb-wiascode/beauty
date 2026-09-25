"use client";

import { DatePicker } from "@/components/date-picker";
import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { userErrorMessage } from "@/lib/user-language";
import {
  addPlatformCustomerNote,
  getPlatformCustomerContext,
  updatePlatformCustomerContext,
  type PlatformCustomerContext,
} from "@/lib/platform-customer-context-api";

const dateTime = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function CustomerContextPanel({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<PlatformCustomerContext | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [legalName, setLegalName] = useState("");
  const [accountOwnerUserId, setAccountOwnerUserId] = useState("");
  const [customerSuccessOwnerUserId, setCustomerSuccessOwnerUserId] = useState("");
  const [goLiveAt, setGoLiveAt] = useState("");
  const [renewalAt, setRenewalAt] = useState("");

  const refresh = useCallback(async () => {
    const value = await getPlatformCustomerContext(tenantId);
    setData(value);
    setLegalName(value.account?.legalName ?? "");
    setAccountOwnerUserId(value.account?.accountOwnerUserId ?? "");
    setCustomerSuccessOwnerUserId(value.account?.customerSuccessOwnerUserId ?? "");
    setGoLiveAt(toDateInput(value.account?.goLiveAt));
    setRenewalAt(toDateInput(value.account?.renewalAt));
  }, [tenantId]);

  useEffect(() => {
    refresh().catch((reason: unknown) => {
      setError(reason instanceof ApiError ? userErrorMessage(reason.message, "Müşteri bilgileri yüklenemedi.") : "Müşteri bilgileri yüklenemedi.");
    });
  }, [refresh]);

  async function saveAccount() {
    setBusy(true);
    setError("");
    try {
      await updatePlatformCustomerContext(tenantId, {
        legalName: legalName || null,
        accountOwnerUserId: accountOwnerUserId || null,
        customerSuccessOwnerUserId: customerSuccessOwnerUserId || null,
        goLiveAt: goLiveAt ? new Date(`${goLiveAt}T00:00:00`).toISOString() : null,
        renewalAt: renewalAt ? new Date(`${renewalAt}T00:00:00`).toISOString() : null,
      });
      await refresh();
    } catch (reason) {
      setError(reason instanceof ApiError ? userErrorMessage(reason.message, "Müşteri bilgileri güncellenemedi.") : "Müşteri bilgileri güncellenemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function submitNote() {
    if (!note.trim()) return;
    setBusy(true);
    setError("");
    try {
      await addPlatformCustomerNote(tenantId, note.trim());
      setNote("");
      await refresh();
    } catch (reason) {
      setError(reason instanceof ApiError ? userErrorMessage(reason.message, "Not eklenemedi.") : "Not eklenemedi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[26px] border border-white/10 bg-white/[.035] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] backdrop-blur-xl sm:p-6">
      <p className="text-[9px] font-semibold uppercase tracking-[.15em] text-white/30">Müşteri yönetimi</p>
      <h2 className="mt-1 text-base font-semibold text-white">Müşteri sahipliği ve iç notlar</h2>

      {error ? <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[.07] px-4 py-3 text-xs text-red-100">{error}</div> : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-white/[.07] bg-black/15 p-4">
          <Field label="Resmî müşteri adı" value={legalName} onChange={setLegalName} />
          <Field label="Hesap sorumlusu kullanıcı kayıt no." value={accountOwnerUserId} onChange={setAccountOwnerUserId} />
          <Field label="Müşteri başarı sorumlusu kullanıcı kayıt no." value={customerSuccessOwnerUserId} onChange={setCustomerSuccessOwnerUserId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <DateField label="Canlı kullanım başlangıcı" value={goLiveAt} onChange={setGoLiveAt} />
            <DateField label="Yenileme" value={renewalAt} onChange={setRenewalAt} />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={saveAccount}
            className="rounded-xl border border-violet-400/25 bg-violet-400/10 px-4 py-2.5 text-xs font-semibold text-violet-100 disabled:opacity-50"
          >
            Müşteri bilgilerini kaydet
          </button>
          {data?.account ? (
            <div className="grid gap-2 pt-2 text-[10px] text-white/35 sm:grid-cols-2">
              <span>Hesap sorumlusu: {data.account.accountOwnerEmail ?? "—"}</span>
              <span>Müşteri başarı sorumlusu: {data.account.customerSuccessOwnerEmail ?? "—"}</span>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-white/[.07] bg-black/15 p-4">
          <textarea
            value={note}
            maxLength={4000}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Satış, destek, yenileme veya müşteri başarısı için yalnız platform ekibinin göreceği bir not ekleyin…"
            className="min-h-28 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-xs text-white outline-none placeholder:text-white/20 focus:border-violet-400/40"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[10px] text-white/25">{note.length}/4000 · Eklenen notlar sonradan değiştirilemez</span>
            <button
              type="button"
              disabled={busy || !note.trim()}
              onClick={submitNote}
              className="rounded-xl border border-white/10 bg-white/[.06] px-4 py-2 text-xs font-semibold text-white/80 disabled:opacity-40"
            >
              Not ekle
            </button>
          </div>

          <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
            {data?.notes.map((item) => (
              <article key={item.id} className="rounded-xl border border-white/[.06] bg-white/[.025] p-3">
                <p className="whitespace-pre-wrap text-xs leading-5 text-white/70">{item.body}</p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-white/25">
                  <span>{item.authorEmail ?? item.authorUserId}</span>
                  <span>{dateTime.format(new Date(item.createdAt))}</span>
                </div>
              </article>
            ))}
            {data && !data.notes.length ? <p className="py-5 text-center text-xs text-white/30">Henüz iç not bulunmuyor.</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-[9px] font-semibold uppercase tracking-[.12em] text-white/25">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs text-white outline-none focus:border-violet-400/40"
      />
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-[9px] font-semibold uppercase tracking-[.12em] text-white/25">{label}</span>
      <DatePicker
        value={value}
        onChange={onChange}
        ariaLabel={label}
        className="mt-1.5 !border-white/10 !bg-black/20"
      />
    </label>
  );
}

function toDateInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}
