"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { userErrorMessage } from "@/lib/user-language";

type EmployeeNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  referenceType?: string | null;
  referenceId?: string | null;
  readAt?: string | null;
  createdAt: string;
};

export function EmployeeNotificationsPanel() {
  const [items, setItems] = useState<EmployeeNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await api<EmployeeNotification[]>("/hr/self-service/me/notifications");
      setItems(Array.isArray(rows) ? rows : []);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? userErrorMessage(requestError.message, "Bildirimleriniz yüklenemedi.")
          : "Bildirimleriniz yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unreadCount = useMemo(() => items.filter((item) => !item.readAt).length, [items]);

  async function markRead(id: string) {
    setWorking(id);
    setError("");
    try {
      await api("/hr/self-service/me/notifications/" + id + "/read", { method: "POST" });
      setItems((current) =>
        current.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item),
      );
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? userErrorMessage(requestError.message, "Bildirim okundu olarak işaretlenemedi.")
          : "Bildirim okundu olarak işaretlenemedi.",
      );
    } finally {
      setWorking("");
    }
  }

  async function markAllRead() {
    setWorking("all");
    setError("");
    try {
      await api("/hr/self-service/me/notifications/read-all", { method: "POST" });
      const now = new Date().toISOString();
      setItems((current) => current.map((item) => item.readAt ? item : { ...item, readAt: now }));
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? userErrorMessage(requestError.message, "Bildirimler okundu olarak işaretlenemedi.")
          : "Bildirimler okundu olarak işaretlenemedi.",
      );
    } finally {
      setWorking("");
    }
  }

  return (
    <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">
            Bildirimlerim
          </p>
          <h2 className="mt-1 text-base font-semibold text-[var(--ink)]">
            {unreadCount > 0 ? unreadCount + " okunmamış bildiriminiz var" : "Tüm bildirimler okundu"}
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Maaş ödemesi gibi çalışan hesabınıza ait önemli insan kaynakları bildirimlerini buradan takip edin.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={loading || unreadCount === 0 || Boolean(working)}
          onClick={() => void markAllRead()}
        >
          {working === "all" ? "İşleniyor..." : "Tümünü Okundu İşaretle"}
        </Button>
      </div>

      {error ? <div className="mt-4"><Alert onClose={() => setError("")}>{error}</Alert></div> : null}

      {loading ? (
        <div className="mt-5"><Spinner label="Bildirimler yükleniyor..." /></div>
      ) : items.length === 0 ? (
        <p className="mt-5 text-sm text-[var(--muted)]">Henüz bildiriminiz bulunmuyor.</p>
      ) : (
        <div className="mt-5 space-y-3">
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-soft)] p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-[var(--ink)]">{item.title}</h3>
                    {!item.readAt ? (
                      <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ink)]">
                        Okunmamış
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted)]">{item.message}</p>
                  <p className="mt-2 text-[11px] text-[var(--muted-soft)]">
                    {new Date(item.createdAt).toLocaleString("tr-TR")}
                  </p>
                </div>
                {!item.readAt ? (
                  <Button
                    variant="secondary"
                    disabled={Boolean(working)}
                    onClick={() => void markRead(item.id)}
                  >
                    {working === item.id ? "İşleniyor..." : "Okundu İşaretle"}
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
