"use client";

import { useEffect, useMemo, useState } from "react";
import { Select } from "@/components/ui";

import { ApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { userLabel, userPermissionKeyLabel, userPermissionLabel } from "@/lib/user-language";
import {
  assignPlatformRole,
  getPlatformIamOverview,
  grantPlatformRolePermission,
  provisionPlatformAdmin,
  removePlatformRole,
  revokePlatformRolePermission,
  setPlatformAdminStatus,
  type PlatformIamOverview,
} from "@/lib/platform-api";

const number = new Intl.NumberFormat("tr-TR");

export default function PlatformIamPage() {
  const [data, setData] = useState<PlatformIamOverview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState("PLATFORM_ADMIN");
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [permissionDrafts, setPermissionDrafts] = useState<Record<string, string>>({});

  const load = async () => {
    const value = await getPlatformIamOverview();
    setData(value);
  };

  useEffect(() => {
    let active = true;
    getPlatformIamOverview()
      .then((value) => active && setData(value))
      .catch((reasonValue: unknown) => {
        if (!active) return;
        setError(reasonValue instanceof ApiError ? reasonValue.message : "Platform erişim yönetimi verileri yüklenemedi.");
      });
    return () => { active = false; };
  }, []);

  const actorUserId = useMemo(() => decodeSubject(getAccessToken()), []);
  const actor = data?.admins.find((admin) => admin.userId === actorUserId);
  const canManage = Boolean(actor?.roles.some((role) => role.slug === "PLATFORM_OWNER"));
  const reasonValid = reason.trim().length >= 8 && reason.trim().length <= 500;
  const permissionKeys = data?.permissions.map((permission) => `${permission.resource}.${permission.action}`) ?? [];

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    if (!reasonValid) {
      setError("Yetki değişikliği için 8-500 karakter arasında bir işlem gerekçesi girilmelidir.");
      return;
    }
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await action();
      await load();
      setNotice(success);
    } catch (reasonValue) {
      setError(reasonValue instanceof ApiError ? reasonValue.message : "Platform erişim işlemi tamamlanamadı.");
    } finally {
      setBusy("");
    }
  };

  if (error && !data) return <ErrorBox message={error} />;
  if (!data) return <Loading />;

  return (
    <div className="mx-auto max-w-[1380px] space-y-7 pb-12">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-violet-300">Kimlik ve Erişim</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] text-white sm:text-4xl">Platform Erişim Yönetimi</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">Platform yöneticilerini, sistem rollerini ve erişim yetkilerini şirket rollerinden bağımsız olarak yönetin.</p>
        </div>
        <span className={`w-fit rounded-full border px-3 py-2 text-[10px] font-semibold uppercase tracking-[.12em] ${canManage ? "border-emerald-400/20 bg-emerald-400/[.08] text-emerald-200" : "border-white/10 bg-white/[.04] text-white/40"}`}>
          {canManage ? "Yönetim Yetkisi Etkin" : "Yalnızca Görüntüleme"}
        </span>
      </header>

      {error ? <ErrorBox message={error} /> : null}
      {notice ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[.07] px-5 py-4 text-sm text-emerald-100">{notice}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Platform Yöneticisi" value={data.summary.adminCount} />
        <Metric label="Aktif Yönetici" value={data.summary.activeAdminCount} />
        <Metric label="Rol" value={data.summary.roleCount} />
        <Metric label="Yetki" value={data.summary.permissionCount} />
      </section>

      {canManage ? (
        <Panel title="Yetki Değişikliği Gerekçesi" eyebrow="Gerekçe Zorunlu">
          <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-[.12em] text-white/35">İşlem Gerekçesi</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} placeholder="Bu yetki değişikliğinin neden gerekli olduğunu açıklayın…" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-violet-400/30" />
            </label>
            <p className={`pb-1 text-[10px] ${reasonValid ? "text-emerald-300/70" : "text-amber-200/60"}`}>{reason.trim().length}/500 · minimum 8 karakter</p>
          </div>
        </Panel>
      ) : null}

      {canManage ? (
        <Panel title="Platform Yöneticisi Ekle" eyebrow="Açık Yetki Ataması">
          <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr_auto] lg:items-end">
            <Field label="Kullanıcı Kayıt No"><input value={newUserId} onChange={(event) => setNewUserId(event.target.value)} placeholder="users.id" className="input" /></Field>
            <Field label="Başlangıç rolü"><Select value={newRole} onChange={(event) => setNewRole(event.target.value)} className="input">{data.roles.map((role) => <option key={role.slug} value={role.slug}>{role.name}</option>)}</Select></Field>
            <button type="button" disabled={!reasonValid || !newUserId.trim() || busy === "provision"} onClick={() => run("provision", () => provisionPlatformAdmin({ userId: newUserId.trim(), roleSlug: newRole, reason: reason.trim() }), "Platform yöneticisi erişimi tanımlandı.")} className="action-button">{busy === "provision" ? "İşleniyor…" : "Yönetici Ekle"}</button>
          </div>
        </Panel>
      ) : null}

      <Panel title="Platform Yöneticileri" eyebrow="Atanmış Yöneticiler">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-xs">
            <thead><tr className="border-b border-white/[.07] text-[9px] uppercase tracking-[.13em] text-white/30"><th className="py-3 pr-4">Yönetici</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3">Roller</th>{canManage ? <th className="px-4 py-3">Rol ata</th> : null}<th className="pl-4 py-3">Kullanıcı Kayıt No</th>{canManage ? <th className="pl-4 py-3 text-right">Durum işlemi</th> : null}</tr></thead>
            <tbody className="divide-y divide-white/[.06]">
              {data.admins.map((admin) => (
                <tr key={admin.userId}>
                  <td className="py-4 pr-4"><p className="font-semibold text-white">{admin.firstName} {admin.lastName}</p><p className="mt-1 text-[10px] text-white/35">{admin.email}</p></td>
                  <td className="px-4 py-4"><Status value={admin.status} /></td>
                  <td className="px-4 py-4"><div className="flex flex-wrap gap-1.5">{admin.roles.map((role) => <span key={role.slug} className="inline-flex items-center gap-1 rounded-full border border-violet-400/20 bg-violet-400/[.08] px-2.5 py-1 text-[9px] font-semibold text-violet-200">{role.name}{canManage && admin.userId !== actorUserId ? <button type="button" disabled={!reasonValid || busy === `remove-${admin.userId}-${role.slug}`} onClick={() => run(`remove-${admin.userId}-${role.slug}`, () => removePlatformRole(admin.userId, role.slug, reason.trim()), `${role.name} rolü kaldırıldı.`)} className="ml-1 text-violet-200/50 hover:text-white">×</button> : null}</span>)}{!admin.roles.length ? <span className="text-white/30">Rol atanmamış</span> : null}</div></td>
                  {canManage ? <td className="px-4 py-4"><div className="flex gap-2"><Select value={roleDrafts[admin.userId] ?? data.roles[0]?.slug ?? ""} onChange={(event) => setRoleDrafts((current) => ({ ...current, [admin.userId]: event.target.value }))} className="input min-w-[160px]"><option value="">Rol seç</option>{data.roles.map((role) => <option key={role.slug} value={role.slug}>{role.name}</option>)}</Select><button type="button" disabled={!reasonValid || !roleDrafts[admin.userId] || busy === `assign-${admin.userId}`} onClick={() => run(`assign-${admin.userId}`, () => assignPlatformRole(admin.userId, { roleSlug: roleDrafts[admin.userId], reason: reason.trim() }), "Platform rolü atandı.")} className="small-button">Ata</button></div></td> : null}
                  <td className="pl-4 py-4 font-mono text-[10px] text-white/35">{admin.userId}</td>
                  {canManage ? <td className="pl-4 py-4 text-right"><button type="button" disabled={!reasonValid || admin.userId === actorUserId || busy === `status-${admin.userId}`} onClick={() => run(`status-${admin.userId}`, () => setPlatformAdminStatus(admin.userId, { status: admin.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE", reason: reason.trim() }), admin.status === "ACTIVE" ? "Platform yöneticisi askıya alındı." : "Platform yöneticisi yeniden aktifleştirildi.")} className="small-button">{admin.status === "ACTIVE" ? "Askıya Al" : "Aktifleştir"}</button></td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Rol ve Yetki Matrisi" eyebrow="Yetkilendirme Yapısı">
        <div className="grid gap-4 xl:grid-cols-3">
          {data.roles.map((role) => {
            const selected = permissionDrafts[role.slug] ?? permissionKeys[0] ?? "";
            const [resource = "", action = ""] = selected.split(".");
            const hasPermission = role.permissions.some((permission) => permission.resource === resource && permission.action === action);
            return <div key={role.slug} className="rounded-[20px] border border-white/[.08] bg-black/15 p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-white">{role.name}</p></div><span className="rounded-full border border-white/10 bg-white/[.04] px-2.5 py-1 text-[9px] text-white/45">{number.format(role.userCount)} kullanıcı</span></div><p className="mt-3 min-h-10 text-[11px] leading-5 text-white/40">{role.description ?? "Açıklama yok."}</p><div className="mt-4 flex flex-wrap gap-1.5">{role.permissions.map((permission) => <span key={`${permission.resource}.${permission.action}`} className="rounded-lg border border-white/[.08] bg-white/[.035] px-2 py-1 text-[9px] text-white/55">{userPermissionLabel(permission.resource, permission.action)}</span>)}</div>{canManage ? <div className="mt-4 border-t border-white/[.07] pt-4"><Select value={selected} onChange={(event) => setPermissionDrafts((current) => ({ ...current, [role.slug]: event.target.value }))} className="input w-full">{permissionKeys.map((key) => <option key={key} value={key}>{userPermissionKeyLabel(key)}</option>)}</Select><button type="button" disabled={!reasonValid || !selected || busy === `permission-${role.slug}`} onClick={() => run(`permission-${role.slug}`, () => hasPermission ? revokePlatformRolePermission(role.slug, { resource, action, reason: reason.trim() }) : grantPlatformRolePermission(role.slug, { resource, action, reason: reason.trim() }), hasPermission ? "Yetki rolden kaldırıldı." : "Yetki role eklendi.")} className="small-button mt-2 w-full">{hasPermission ? "Yetkiyi Kaldır" : "Yetkiyi Ekle"}</button></div> : null}</div>;
          })}
        </div>
      </Panel>

      <Panel title="Yetki Kataloğu" eyebrow="Kullanılabilir Yetkiler">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{data.permissions.map((permission) => <div key={`${permission.resource}.${permission.action}`} className="rounded-2xl border border-white/[.07] bg-black/15 p-4"><div className="flex items-center justify-between gap-3"><span className="text-[11px] font-semibold text-violet-200">{userPermissionLabel(permission.resource, permission.action)}</span><span className="text-[9px] text-white/30">{permission.roleCount} rol</span></div><p className="mt-2 text-[10px] leading-5 text-white/40">{permission.description ?? "Açıklama yok."}</p></div>)}</div>
      </Panel>

      <style jsx>{` .input{border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.2);border-radius:12px;padding:9px 11px;color:white;font-size:11px;outline:none}.action-button,.small-button{border:1px solid rgba(139,92,246,.28);background:rgba(139,92,246,.12);border-radius:12px;padding:10px 14px;color:#ede9fe;font-size:10px;font-weight:700;transition:.2s}.small-button{padding:8px 10px}.action-button:disabled,.small-button:disabled{opacity:.3;cursor:not-allowed}`}</style>
    </div>
  );
}

function decodeSubject(token: string | null) { if (!token) return null; try { const encoded = token.split(".")[1]; if (!encoded) return null; const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/"); const payload = JSON.parse(window.atob(normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "="))) as { sub?: unknown }; return typeof payload.sub === "string" ? payload.sub : null; } catch { return null; } }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="text-[10px] font-semibold uppercase tracking-[.12em] text-white/35">{label}</span><div className="mt-2">{children}</div></label>; }
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-[22px] border border-white/10 bg-white/[.035] p-5"><p className="text-[9px] font-semibold uppercase tracking-[.15em] text-white/35">{label}</p><p className="mt-3 text-2xl font-semibold text-white">{number.format(value)}</p></div>; }
function Panel({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) { return <section className="rounded-[26px] border border-white/10 bg-white/[.035] p-5 sm:p-6"><p className="text-[9px] font-semibold uppercase tracking-[.15em] text-white/30">{eyebrow}</p><h2 className="mt-1 text-base font-semibold text-white">{title}</h2><div className="mt-5">{children}</div></section>; }
function Status({ value }: { value: string }) { const active = value === "ACTIVE"; return <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold ${active ? "border-emerald-400/20 bg-emerald-400/[.08] text-emerald-200" : "border-amber-400/20 bg-amber-400/[.08] text-amber-200"}`}>{userLabel(value)}</span>; }
function Loading() { return <div className="grid min-h-[55vh] place-items-center"><div className="h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-violet-400" /></div>; }
function ErrorBox({ message }: { message: string }) { return <div className="mx-auto max-w-[1380px] rounded-2xl border border-red-400/20 bg-red-400/[.07] px-5 py-4 text-sm text-red-100">{message}</div>; }
