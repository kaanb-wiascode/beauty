"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { userLabel } from "@/lib/user-language";

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
      setApprovals(await api<Approval[]>("/corporate-communications/approvals"));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Onay kuyruğu yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function decide(id: string, action: "approve" | "request-changes") {
    const note = notes[id]?.trim();
    if (!note) {
      setError("Onay kararı için açıklama yazın.");
      return;
    }
    setActingId(id);
    setError("");
    try {
      await api(`/corporate-communications/approvals/${id}/${action}`, {
        method: "POST",
        body: { note },
      });
      setNotes((current) => ({ ...current, [id]: "" }));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Onay kararı kaydedilemedi.");
    } finally {
      setActingId("");
    }
  }

  if (loading && !approvals.length) return <div className="py-20"><Spinner label="Onay merkezi yükleniyor..." /></div>;

  const pending = approvals.filter((approval) => approval.status === "PENDING");
  const history = approvals.filter((approval) => approval.status !== "PENDING");

  return (
    <div className="space-y-6 pb-12">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">Kurumsal İletişim</p>
        <h1 className="text-[30px] font-semibold tracking-[-.04em] text-[var(--ink)]">Onay Merkezi</h1>
        <p className="mt-2 max-w-3xl text-[12px] leading-5 text-[var(--muted)]">İçeriklerin yayın akışına geçmeden önce kurumsal iletişim onayından geçmesini sağlayın. Kararlar; kullanıcı, zaman ve açıklama bilgileriyle denetim geçmişine kaydedilir.</p>
      </header>

      {error ? <Alert>{error}</Alert> : null}

      <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold text-[var(--ink)]">Bekleyen Onaylar</h2><span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">{pending.length}</span></div>
        {pending.length ? <div className="mt-4 grid gap-4 xl:grid-cols-2">{pending.map((approval) => (
          <article key={approval.id} className="rounded-[17px] border border-[var(--line)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[13px] font-semibold text-[var(--ink)]">{approval.title}</p><p className="mt-1 text-[10px] uppercase tracking-[.08em] text-[var(--muted)]">{userLabel(approval.platform)} · {userLabel(approval.format)}</p></div><span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[9px] font-semibold text-[var(--muted)]">{new Date(approval.createdAt).toLocaleString("tr-TR")}</span></div>
            {canApprove ? <><textarea className="mt-4 min-h-20 w-full rounded-[13px] border border-[var(--line)] bg-white px-3 py-3 text-[12px] outline-none focus:border-[var(--accent)]" value={notes[approval.id] ?? ""} onChange={(e) => setNotes((current) => ({ ...current, [approval.id]: e.target.value }))} placeholder="Karar notu..." /><div className="mt-3 flex gap-2"><Button disabled={actingId === approval.id} onClick={() => void decide(approval.id, "approve")}>Onayla</Button><Button disabled={actingId === approval.id} onClick={() => void decide(approval.id, "request-changes")}>Revizyon İste</Button></div></> : <p className="mt-4 text-[11px] text-[var(--muted)]">Karar vermek için kurumsal iletişim onay yetkisi gerekir.</p>}
          </article>
        ))}</div> : <p className="mt-6 text-[12px] text-[var(--muted)]">Bekleyen içerik onayı yok.</p>}
      </section>

      <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="text-[15px] font-semibold text-[var(--ink)]">Karar Geçmişi</h2>
        {history.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[800px] text-left"><thead><tr className="border-b border-[var(--line)] text-[10px] uppercase tracking-[.1em] text-[var(--muted-soft)]"><th className="px-3 py-3">İçerik</th><th className="px-3 py-3">Karar</th><th className="px-3 py-3">Not</th><th className="px-3 py-3">Tarih</th></tr></thead><tbody>{history.map((approval) => <tr key={approval.id} className="border-b border-[var(--line)] last:border-0"><td className="px-3 py-3 text-[12px] font-semibold text-[var(--ink)]">{approval.title}</td><td className="px-3 py-3 text-[11px] text-[var(--muted)]">{userLabel(approval.status)}</td><td className="px-3 py-3 text-[11px] text-[var(--muted)]">{approval.decisionNote ?? "—"}</td><td className="px-3 py-3 text-[11px] text-[var(--muted)]">{approval.decidedAt ? new Date(approval.decidedAt).toLocaleString("tr-TR") : "—"}</td></tr>)}</tbody></table></div> : <p className="mt-6 text-[12px] text-[var(--muted)]">Henüz karar geçmişi yok.</p>}
      </section>
    </div>
  );
}
