"use client";

import { FormEvent, useEffect, useState } from "react";

import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";

type Role = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  scope: "CENTRAL" | "COMPANY" | "BRANCH";
  _count: { memberships: number; rolePermissions?: number };
};

const scopeLabel = {
  CENTRAL: "Merkez / Şirket Geneli",
  COMPANY: "Şirket / Seçili Şubeler",
  BRANCH: "Şube",
} as const;

export default function RoleClonePage() {
  const { showToast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [sourceRoleId, setSourceRoleId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Role | null>(null);

  useEffect(() => {
    let active = true;
    api<Role[]>("/roles")
      .then((rows) => {
        if (!active) return;
        const cloneable = rows.filter((role) => role.slug !== "owner");
        setRoles(cloneable);
        setSourceRoleId(cloneable[0]?.id ?? "");
      })
      .catch((err) => { if (active) setError(err instanceof ApiError ? err.message : "Roller yüklenemedi."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const source = roles.find((role) => role.id === sourceRoleId) ?? null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!source || name.trim().length < 2) return;
    try {
      setSaving(true);
      setError("");
      const result = await api<Role>(`/roles/${source.id}/clone`, {
        method: "POST",
        body: { name: name.trim(), description: description.trim() || undefined },
      });
      setCreated(result);
      setName("");
      setDescription("");
      showToast("Rol ve yetki seti klonlandı.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Rol klonlanamadı.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center text-sm text-[var(--muted)]">Yükleniyor…</div>;

  return (
    <main className="mx-auto w-full max-w-[960px] space-y-6 pb-10">
      <header className="border-b border-[var(--line)] pb-5">
        <div className="mb-1 text-xs font-medium text-[var(--muted)]">Yönetim / Roller</div>
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">Rol Klonlama</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">Mevcut bir rolün kapsamını ve tüm permission setini tenant-owned yeni bir role kopyalayın.</p>
      </header>

      {error ? <div className="rounded-xl border border-[#f0d8d8] bg-[#fff8f8] px-4 py-3 text-sm text-[#9a4545]">{error}</div> : null}

      <form onSubmit={submit} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-xs font-medium text-[var(--muted)]">Kaynak rol<select required value={sourceRoleId} onChange={(e) => setSourceRoleId(e.target.value)} className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]">{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
          <label className="text-xs font-medium text-[var(--muted)]">Yeni rol adı<input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. Yardımcı Şube Müdürü" className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]" /></label>
        </div>
        <label className="mt-4 block text-xs font-medium text-[var(--muted)]">Açıklama<textarea maxLength={255} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Boş bırakılırsa kaynak rol açıklaması kullanılır." className="mt-2 min-h-24 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]" /></label>

        {source ? <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-[var(--surface-2)] p-3"><div className="text-xs text-[var(--muted)]">Kaynak</div><div className="mt-1 text-sm font-semibold">{source.name}</div></div><div className="rounded-xl bg-[var(--surface-2)] p-3"><div className="text-xs text-[var(--muted)]">Kapsam</div><div className="mt-1 text-sm font-semibold">{scopeLabel[source.scope]}</div></div><div className="rounded-xl bg-[var(--surface-2)] p-3"><div className="text-xs text-[var(--muted)]">Yetki Sayısı</div><div className="mt-1 text-sm font-semibold">{source._count.rolePermissions ?? 0}</div></div></div> : null}

        <div className="mt-5 flex justify-end"><button disabled={saving || !source} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Klonlanıyor…" : "Rolü Klonla"}</button></div>
      </form>

      {created ? <section className="rounded-2xl border border-[#cfe8d8] bg-[#f7fff9] p-5"><div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#378a5e]">Klonlama tamamlandı</div><h2 className="mt-2 text-lg font-semibold text-[var(--ink)]">{created.name}</h2><p className="mt-1 text-sm text-[var(--muted)]">{scopeLabel[created.scope]} · {created._count.rolePermissions ?? 0} yetki kopyalandı. Rolü Roller ve Yetkiler ekranından özelleştirebilirsiniz.</p></section> : null}
    </main>
  );
}
