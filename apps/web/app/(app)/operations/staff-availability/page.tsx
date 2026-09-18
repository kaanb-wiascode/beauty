"use client";

import { useEffect, useState } from "react";

import { Alert, Button, Field, Spinner, TextInput } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasActiveBranch } from "@/lib/auth";

type Availability = "AVAILABLE" | "WITH_CUSTOMER" | "OFF_SHIFT" | "ON_LEAVE";

type Board = {
  at: string;
  shiftAware: boolean;
  dateBasis: "UTC_DATE";
  limitations: string[];
  totals: Record<Availability, number>;
  staff: Array<{
    staffId: string;
    staffName: string;
    availability: Availability;
    reason: string;
    attendance: { status: string; checkIn: string | null; checkOut: string | null } | null;
    current: {
      executionId: string | null;
      appointmentId: string | null;
      serviceName: string | null;
      startAt: string | null;
      endAt: string | null;
    } | null;
    nextAppointment: {
      id: string;
      serviceName: string | null;
      startAt: string | null;
      endAt: string | null;
    } | null;
  }>;
};

const labels: Record<Availability, string> = {
  AVAILABLE: "Müsait",
  WITH_CUSTOMER: "Müşteriyle",
  OFF_SHIFT: "Mesai Dışı / Yok",
  ON_LEAVE: "İzinli",
};

function localInput(date: Date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export default function StaffAvailabilityPage() {
  const [at, setAt] = useState(localInput(new Date()));
  const [data, setData] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(target = at) {
    if (!hasActiveBranch()) {
      setError("Personel uygunluğu için önce çalışma kapsamından bir şube seçin.");
      setLoading(false);
      return;
    }
    const instant = new Date(target);
    if (Number.isNaN(instant.getTime())) {
      setError("Geçerli bir tarih ve saat seçin.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      setData(
        await api<Board>(
          withQuery("/operations/staff-availability", {
            at: instant.toISOString(),
          }),
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Personel uygunluğu yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Initial operational snapshot only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-[1420px] space-y-5 pb-10">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">
          Staff Availability
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
          Personel Uygunluk Panosu
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
          HR personel/izin/puantaj verisi ile Appointment ve canlı ServiceExecution kayıtlarını tek operasyon görünümünde birleştirir. Ayrı bir çalışan durum kaynağı oluşturmaz.
        </p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Operasyon zamanı">
            <TextInput type="datetime-local" value={at} onChange={(event) => setAt(event.target.value)} />
          </Field>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            {loading ? "Yükleniyor..." : "Görünümü Yenile"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const now = localInput(new Date());
              setAt(now);
              void load(now);
            }}
            disabled={loading}
          >
            Şimdi
          </Button>
        </div>
      </section>

      {loading && !data ? <Spinner label="Personel uygunluğu hazırlanıyor..." /> : null}

      {data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(Object.keys(labels) as Availability[]).map((status) => (
              <div key={status} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
                <p className="text-xs font-semibold text-[var(--muted)]">{labels[status]}</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">{data.totals[status]}</p>
              </div>
            ))}
          </section>

          {!data.shiftAware ? (
            <div className="rounded-[16px] border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--muted)]">
              HR tarafında ayrı bir vardiya/çalışma planı kaynağı henüz bulunmadığı için kayıt bulunmayan personel otomatik olarak “mesai dışı” sayılmaz. Approved izin ve explicit puantaj yokluğu/absence sinyalleri kullanılır.
            </div>
          ) : null}

          <section className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] shadow-sm">
            <div className="border-b border-[var(--line)] px-6 py-4">
              <h2 className="text-sm font-semibold text-[var(--ink)]">Şube Personeli</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">{data.staff.length} aktif personel</p>
            </div>
            {data.staff.length ? (
              <div className="divide-y divide-[var(--line)]">
                {data.staff.map((member) => (
                  <div key={member.staffId} className="grid gap-3 px-6 py-4 lg:grid-cols-[minmax(0,1fr)_180px_minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center">
                    <div>
                      <p className="text-sm font-semibold text-[var(--ink)]">{member.staffName}</p>
                      {member.attendance ? (
                        <p className="mt-1 text-xs text-[var(--muted)]">Puantaj: {member.attendance.status}</p>
                      ) : (
                        <p className="mt-1 text-xs text-[var(--muted)]">Puantaj kaydı yok</p>
                      )}
                    </div>
                    <span className="w-fit rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-semibold text-[var(--ink)]">
                      {labels[member.availability]}
                    </span>
                    <div>
                      <p className="text-xs font-medium text-[var(--ink)]">{member.reason}</p>
                      {member.current?.serviceName ? (
                        <p className="mt-1 text-xs text-[var(--muted)]">Aktif hizmet: {member.current.serviceName}</p>
                      ) : null}
                    </div>
                    <div className="text-xs text-[var(--muted)]">
                      {member.nextAppointment ? (
                        <>
                          <p>Sonraki: {member.nextAppointment.serviceName ?? "Hizmet"}</p>
                          <p className="mt-1">{member.nextAppointment.startAt ? new Date(member.nextAppointment.startAt).toLocaleString("tr-TR") : "-"}</p>
                        </>
                      ) : (
                        <p>Planlanmış sonraki randevu yok</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-10 text-center text-sm text-[var(--muted)]">Aktif şube personeli bulunamadı.</div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
