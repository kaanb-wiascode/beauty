"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { userErrorMessage } from "@/lib/user-language";

type AttendanceEvent = {
  id: string;
  eventType: "DAY_START" | "BREAK_START" | "BREAK_END" | "DAY_END";
  occurredAt: string;
  approvalStatus?: string | null;
};

type SelfServiceHome = {
  attendanceToday?: AttendanceEvent[];
};

type AttendanceAction = {
  label: string;
  path: string;
  eventType: AttendanceEvent["eventType"];
  success: string;
};

const ACTIONS: AttendanceAction[] = [
  {
    label: "Güne Başla",
    path: "/hr/self-service/me/attendance/clock-in",
    eventType: "DAY_START",
    success: "Güne başlama hareketiniz kaydedildi ve yönetici onayına gönderildi.",
  },
  {
    label: "Molaya Çık",
    path: "/hr/self-service/me/attendance/break-start",
    eventType: "BREAK_START",
    success: "Mola başlangıcınız kaydedildi ve yönetici onayına gönderildi.",
  },
  {
    label: "Moladan Dön",
    path: "/hr/self-service/me/attendance/break-end",
    eventType: "BREAK_END",
    success: "Mola bitişiniz kaydedildi ve yönetici onayına gönderildi.",
  },
  {
    label: "Günü Bitir",
    path: "/hr/self-service/me/attendance/clock-out",
    eventType: "DAY_END",
    success: "Günü bitirme hareketiniz kaydedildi ve yönetici onayına gönderildi.",
  },
];

function allowedActions(events: AttendanceEvent[]) {
  const lifecycle = events
    .filter((event) => ["PENDING", "APPROVED"].includes(String(event.approvalStatus ?? "")))
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

  if (lifecycle.some((event) => event.eventType === "DAY_END")) return new Set<AttendanceEvent["eventType"]>();

  const last = lifecycle.at(-1)?.eventType ?? null;
  if (!last) return new Set<AttendanceEvent["eventType"]>(["DAY_START"]);
  if (last === "BREAK_START") return new Set<AttendanceEvent["eventType"]>(["BREAK_END"]);
  if (last === "DAY_START" || last === "BREAK_END") {
    return new Set<AttendanceEvent["eventType"]>(["BREAK_START", "DAY_END"]);
  }
  return new Set<AttendanceEvent["eventType"]>();
}

function statusText(events: AttendanceEvent[]) {
  const lifecycle = events
    .filter((event) => ["PENDING", "APPROVED"].includes(String(event.approvalStatus ?? "")))
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

  const last = lifecycle.at(-1)?.eventType ?? null;
  if (!last) return "Çalışma gününüz henüz başlamadı.";
  if (last === "BREAK_START") return "Şu anda moladasınız.";
  if (last === "DAY_END") return "Bugünkü çalışma gününüz tamamlandı.";
  return "Çalışma gününüz devam ediyor.";
}

export function AttendanceActionsPanel() {
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const home = await api<SelfServiceHome>("/hr/self-service/me");
      setEvents(Array.isArray(home.attendanceToday) ? home.attendanceToday : []);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? userErrorMessage(requestError.message, "Bugünkü puantaj durumunuz yüklenemedi.")
          : "Bugünkü puantaj durumunuz yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allowed = useMemo(() => allowedActions(events), [events]);
  const currentStatus = useMemo(() => statusText(events), [events]);

  async function run(action: AttendanceAction) {
    setWorking(action.label);
    setError("");
    setNotice("");
    try {
      await api(action.path, { method: "POST" });
      setNotice(action.success);
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? userErrorMessage(requestError.message)
          : "Puantaj hareketi kaydedilemedi.",
      );
    } finally {
      setWorking("");
    }
  }

  return (
    <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">
            Bugünkü Puantajım
          </p>
          <h2 className="mt-1 text-base font-semibold text-[var(--ink)]">{currentStatus}</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Saat bilgisi sistem tarafından otomatik kaydedilir; tarih veya saat seçmeniz gerekmez.
          </p>
        </div>
        {loading ? <Spinner label="Puantaj durumu yükleniyor..." /> : (
          <div className="flex flex-wrap gap-2">
            {ACTIONS.map((action) => (
              <Button
                key={action.eventType}
                variant={allowed.has(action.eventType) ? "primary" : "secondary"}
                disabled={Boolean(working) || !allowed.has(action.eventType)}
                onClick={() => void run(action)}
              >
                {working === action.label ? "İşleniyor..." : action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
      {error ? <div className="mt-4"><Alert onClose={() => setError("")}>{error}</Alert></div> : null}
      {notice ? <div className="mt-4"><Alert tone="success" onClose={() => setNotice("")}>{notice}</Alert></div> : null}
    </section>
  );
}
