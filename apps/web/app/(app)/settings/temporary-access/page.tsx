"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Select } from "@/components/ui";

import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";

type Membership = {
  id: string;
  status: string;
  user: { id: string; email: string; firstName: string; lastName: string };
  role: { id: string; name: string; slug: string };
};

type Permission = { id: string; resource: string; action: string; description: string | null };
type Branch = { id: string; name: string; code: string; status: string };
type Grant = {
  id: string;
  membershipId: string;
  permissionId: string;
  permissionResource: string;
  permissionAction: string;
  userId: string;
  userEmail: string;
  branchId: string | null;
  branchName: string | null;
  startsAt: string;
  endsAt: string;
  reason: string;
  revokedAt: string | null;
  status: "ACTIVE" | "SCHEDULED" | "EXPIRED" | "REVOKED";
};

function toIso(value: string) {
  return new Date(value).toISOString();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const badgeClass: Record<Grant["status"], string> = {
  ACTIVE: "bg-[#eaf7ef] text-[#378a5e]",
  SCHEDULED: "bg-[#eef3ff] text-[#4567a8]",
  EXPIRED: "bg-[#f1f1f1] text-[#666]",
  REVOKED: "bg-[#fff0f0] text-[#9a4545]",
};

export default function TemporaryAccessPage() {
  const { showToast } = useToast();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [membershipId, setMembershipId] = useState("");
  const [permissionId, setPermissionId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [membershipRows, permissionRows, branchRows, grantRows] = await Promise.all([
        api<Membership[]>("/memberships"),
        api<Permission[]>("/roles/permissions"),
        api<Branch[]>("/admin/organization/branches"),
        api<Grant[]>("/admin/temporary-access"),
      ]);
      setMemberships(membershipRows.filter((item) => item.status === "ACTIVE"));
      setPermissions(permissionRows);
      setBranches(branchRows.filter((item) => item.status === "ACTIVE"));
      setGrants(grantRows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Geçici erişim bilgileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(
    () => grants.filter((grant) => statusFilter === "ALL" || grant.status === statusFilter),
    [grants, statusFilter],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!membershipId || !permissionId || !startsAt || !endsAt) return;
    try {
      setSaving(true);
      await api("/admin/temporary-access", {
        method: "POST",
        body: {
          membershipId,
          permissionId,
          branchId: branchId || null,
          startsAt: toIso(startsAt),
          endsAt: toIso(endsAt),
          reason,
        },
      });
      showToast("Geçici erişim tanımlandı.");
      setPermissionId("");
      setBranchId("");
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Geçici erişim oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm("Bu geçici erişimi iptal etmek istediğinize emin misiniz?")) return;
    try {
      setRevoking(id);
      await api(`/admin/temporary-access/${id}/revoke`, { method: "POST" });
      showToast("Geçici erişim iptal edildi.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Geçici erişim iptal edilemedi.");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1320px] space-y-6 pb-10">
      <header className="border-b border-[var(--line)] pb-5">
        <div className="mb-1 text-xs font-medium text-[var(--muted)]">Yönetim / Erişim</div>
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">Geçici Erişim</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">Denetçi, muhasebeci, danışman veya geçici görevlere başlangıç/bitiş tarihli ve denetlenebilir yetkiler verin.</p>
      </header>

      {error ? <div className="rounded-xl border border-[#f0d8d8] bg-[#fff8f8] px-4 py-3 text-sm text-[#9a4545]">{error}</div> : null}

      <form onSubmit={submit} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
        <div className="mb-4"><h2 className="text-sm font-semibold text-[var(--ink)]">Yeni Geçici Yetki</h2><p className="mt-1 text-xs text-[var(--muted)]">Şube seçilmezse grant şirket kapsamındadır. Aynı yetki ve kapsam için çakışan tarih aralıklarına izin verilmez.</p></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-xs font-medium text-[var(--muted)]">Kullanıcı<Select required value={membershipId} onChange={(e) => setMembershipId(e.target.value)} className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]"><option value="">Seçin</option>{memberships.map((m) => <option key={m.id} value={m.id}>{m.user.firstName} {m.user.lastName} · {m.role.name}</option>)}</Select></label>
          <label className="text-xs font-medium text-[var(--muted)]">Yetki<Select required value={permissionId} onChange={(e) => setPermissionId(e.target.value)} className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]"><option value="">Seçin</option>{permissions.map((p) => <option key={p.id} value={p.id}>{p.resource}.{p.action}</option>)}</Select></label>
          <label className="text-xs font-medium text-[var(--muted)]">Şube (opsiyonel)<Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]"><option value="">Şirket geneli</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</Select></label>
          <label className="text-xs font-medium text-[var(--muted)]">Başlangıç<input required type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]" /></label>
          <label className="text-xs font-medium text-[var(--muted)]">Bitiş<input required type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]" /></label>
          <label className="text-xs font-medium text-[var(--muted)]">Gerekçe<input required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Örn. Eylül bağımsız denetim çalışması" className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]" /></label>
        </div>
        <div className="mt-5 flex justify-end"><button disabled={saving} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Kaydediliyor…" : "Geçici Erişim Ver"}</button></div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold text-[var(--ink)]">Grant Geçmişi</h2><p className="mt-1 text-xs text-[var(--muted)]">Aktif, planlanmış, süresi dolmuş ve iptal edilmiş yetkiler.</p></div><Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs"><option value="ALL">Tüm Durumlar</option><option value="ACTIVE">Aktif</option><option value="SCHEDULED">Planlandı</option><option value="EXPIRED">Süresi Doldu</option><option value="REVOKED">İptal</option></Select></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs text-[var(--muted)]"><tr><th className="px-4 py-3 font-medium">Kullanıcı</th><th className="px-4 py-3 font-medium">Yetki</th><th className="px-4 py-3 font-medium">Kapsam</th><th className="px-4 py-3 font-medium">Geçerlilik</th><th className="px-4 py-3 font-medium">Gerekçe</th><th className="px-4 py-3 font-medium">Durum</th><th className="px-4 py-3 text-right font-medium">İşlem</th></tr></thead><tbody>
          {!loading && filtered.map((grant) => <tr key={grant.id} className="border-b border-[var(--line)] last:border-0"><td className="px-4 py-4 text-xs text-[var(--ink)]">{grant.userEmail}</td><td className="px-4 py-4 font-mono text-xs">{grant.permissionResource}.{grant.permissionAction}</td><td className="px-4 py-4 text-xs text-[var(--muted)]">{grant.branchName ?? "Şirket geneli"}</td><td className="px-4 py-4 text-xs text-[var(--muted)]">{formatDate(grant.startsAt)}<br />{formatDate(grant.endsAt)}</td><td className="max-w-[260px] px-4 py-4 text-xs text-[var(--muted)]">{grant.reason}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass[grant.status]}`}>{grant.status}</span></td><td className="px-4 py-4 text-right">{grant.status === "ACTIVE" || grant.status === "SCHEDULED" ? <button type="button" disabled={revoking === grant.id} onClick={() => void revoke(grant.id)} className="rounded-lg border border-[#f0d8d8] px-3 py-2 text-xs font-medium text-[#9a4545] disabled:opacity-50">{revoking === grant.id ? "İptal ediliyor…" : "İptal Et"}</button> : <span className="text-xs text-[var(--muted)]">—</span>}</td></tr>)}
          {!loading && !filtered.length ? <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-[var(--muted)]">Kayıt bulunamadı.</td></tr> : null}{loading ? <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-[var(--muted)]">Yükleniyor…</td></tr> : null}
        </tbody></table></div>
      </section>
    </main>
  );
}
