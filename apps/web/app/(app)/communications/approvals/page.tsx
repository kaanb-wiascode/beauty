"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { userErrorMessage, userLabel } from "@/lib/user-language";

type Approval = {
  id: string;
  contentId: string;
  status: string;
  title: string;
  platform: string;
  format: string;
  contentStatus: string;
  createdAt: string;
  reviewerUserId?: string | null;
  decisionNote?: string | null;
  decidedAt?: string | null;
};

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function CommunicationsApprovalPage() {
  const canApprove = hasPermission("communications", "approve");
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setApprovals(
        await api<Approval[]>("/corporate-communications/approvals"),
      );
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(e.message, "Onay merkezi yüklenemedi.")
          : "Onay merkezi yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const pending = approvals.filter((item) => item.status === "PENDING");
    const approved = approvals.filter((item) => item.status === "APPROVED");
    const changes = approvals.filter(
      (item) => item.status === "CHANGES_REQUESTED",
    );

    return {
      pending,
      approved,
      changes,
      history: approvals.filter((item) => item.status !== "PENDING"),
    };
  }, [approvals]);

  async function decide(
    id: string,
    action: "approve" | "request-changes",
  ) {
    const note = notes[id]?.trim();
    if (!note) {
      setError("Onay kararı için açıklama yazın.");
      return;
    }

    setActingId(id);
    setError("");

    try {
      await api(
        "/corporate-communications/approvals/" + id + "/" + action,
        {
          method: "POST",
          body: { note },
        },
      );
      setNotes((current) => ({ ...current, [id]: "" }));
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(e.message, "Onay kararı kaydedilemedi.")
          : "Onay kararı kaydedilemedi.",
      );
    } finally {
      setActingId("");
    }
  }

  if (loading && !approvals.length) {
    return (
      <div className="py-20">
        <Spinner label="Onay merkezi yükleniyor..." />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-12">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">
              Kurumsal İletişim
            </p>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-.04em] text-[var(--ink)]">
              Onay Merkezi
            </h1>
            <p className="mt-2 max-w-3xl text-[12px] leading-5 text-[var(--muted)]">
              Yayına çıkmadan önce içerik kararlarını verin; onay ve revizyon
              geçmişini tek yerde izleyin.
            </p>
          </div>

          <Link href="/communications/content">
            <Button variant="secondary">İçerik Merkezine Dön</Button>
          </Link>
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Karar Bekleyen"
          value={stats.pending.length}
          detail="Şu anda onay bekliyor"
          attention={stats.pending.length > 0}
        />
        <Metric
          label="Onaylanan"
          value={stats.approved.length}
          detail="Yayına devam edebilir"
        />
        <Metric
          label="Revizyon İstenen"
          value={stats.changes.length}
          detail="İçerik ekibine geri döndü"
        />
      </section>

      <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] p-4">
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--ink)]">
              Bekleyen Onaylar
            </h2>
            <p className="mt-1 text-[8px] text-[var(--muted)]">
              Yayın sürecinin ilerlemesi için karar bekleyen içerikler.
            </p>
          </div>
          <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[8px] font-semibold text-[var(--accent)]">
            {stats.pending.length}
          </span>
        </div>

        {stats.pending.length ? (
          <div className="grid gap-4 p-4 xl:grid-cols-2">
            {stats.pending.map((approval) => (
              <article
                key={approval.id}
                className="rounded-[16px] border border-[var(--line)] bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-[var(--ink)]">
                      {approval.title}
                    </p>
                    <p className="mt-1 text-[8px] text-[var(--muted)]">
                      {userLabel(approval.platform)} ·{" "}
                      {userLabel(approval.format)}
                    </p>
                  </div>

                  <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[7px] font-semibold text-[var(--muted)]">
                    {formatDateTime(approval.createdAt)}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Mini
                    label="İçerik Durumu"
                    value={userLabel(approval.contentStatus)}
                  />
                  <Mini
                    label="Karar"
                    value="Bekliyor"
                  />
                </div>

                {canApprove ? (
                  <>
                    <label className="mt-4 block text-[9px] font-semibold text-[var(--muted)]">
                      Karar Notu
                      <textarea
                        className="mt-2 min-h-24 w-full rounded-[12px] border border-[var(--line)] bg-white px-3 py-3 text-[10px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                        value={notes[approval.id] ?? ""}
                        onChange={(e) =>
                          setNotes((current) => ({
                            ...current,
                            [approval.id]: e.target.value,
                          }))
                        }
                        placeholder="Kararınızın gerekçesini veya revizyon notunu yazın…"
                      />
                    </label>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        disabled={actingId === approval.id}
                        onClick={() => void decide(approval.id, "approve")}
                      >
                        Onayla
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={actingId === approval.id}
                        onClick={() =>
                          void decide(approval.id, "request-changes")
                        }
                      >
                        Revizyon İste
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="mt-4 rounded-[12px] bg-[var(--surface-2)] p-3 text-[8px] leading-4 text-[var(--muted)]">
                    Karar vermek için kurumsal iletişim onay yetkisi gerekir.
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center">
            <p className="text-[11px] font-semibold text-[var(--ink)]">
              Bekleyen içerik onayı yok.
            </p>
            <p className="mt-1 text-[8px] text-[var(--muted)]">
              Yeni bir içerik incelemeye gönderildiğinde burada görünecek.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
        <div className="border-b border-[var(--line)] p-4">
          <h2 className="text-[13px] font-semibold text-[var(--ink)]">
            Karar Geçmişi
          </h2>
          <p className="mt-1 text-[8px] text-[var(--muted)]">
            Daha önce verilen onay ve revizyon kararları.
          </p>
        </div>

        {stats.history.length ? (
          <div className="divide-y divide-[var(--line)]">
            {stats.history.map((approval) => (
              <article
                key={approval.id}
                className="grid gap-3 p-4 md:grid-cols-[minmax(220px,1fr)_150px_minmax(220px,1fr)_160px] md:items-center"
              >
                <div>
                  <p className="text-[10px] font-semibold text-[var(--ink)]">
                    {approval.title}
                  </p>
                  <p className="mt-1 text-[7px] text-[var(--muted)]">
                    {userLabel(approval.platform)} ·{" "}
                    {userLabel(approval.format)}
                  </p>
                </div>

                <div>
                  <DecisionBadge value={approval.status} />
                </div>

                <p className="text-[8px] leading-4 text-[var(--muted)]">
                  {approval.decisionNote ?? "Karar notu bulunmuyor."}
                </p>

                <p className="text-[8px] text-[var(--muted)]">
                  {formatDateTime(approval.decidedAt)}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center text-[9px] text-[var(--muted)]">
            Henüz karar geçmişi bulunmuyor.
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  attention,
}: {
  label: string;
  value: number;
  detail: string;
  attention?: boolean;
}) {
  return (
    <div
      className={
        attention
          ? "rounded-[18px] border border-[var(--warning)]/25 bg-[var(--warning-soft)] p-4"
          : "rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]"
      }
    >
      <p className="text-[8px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">
        {label}
      </p>
      <strong className="mt-3 block text-[22px] font-semibold tracking-[-.04em] text-[var(--ink)]">
        {value}
      </strong>
      <p className="mt-2 text-[8px] text-[var(--muted)]">{detail}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[11px] bg-[var(--surface-2)] p-2.5">
      <span className="block text-[7px] text-[var(--muted)]">{label}</span>
      <strong className="mt-1 block text-[9px] text-[var(--ink)]">
        {value}
      </strong>
    </div>
  );
}

function DecisionBadge({ value }: { value: string }) {
  const label =
    value === "APPROVED"
      ? "Onaylandı"
      : value === "CHANGES_REQUESTED"
        ? "Revizyon İstendi"
        : userLabel(value);

  return (
    <span
      className={
        value === "APPROVED"
          ? "inline-flex rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[7px] font-semibold text-[var(--accent)]"
          : "inline-flex rounded-full bg-[var(--warning-soft)] px-2.5 py-1 text-[7px] font-semibold text-[var(--warning)]"
      }
    >
      {label}
    </span>
  );
}
