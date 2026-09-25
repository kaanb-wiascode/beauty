"use client";

import { useEffect, useState } from "react";

import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import { userErrorMessage, userPermissionKeyLabel } from "@/lib/user-language";

type Template = {
  key: string;
  name: string;
  description: string;
  scope: "CENTRAL" | "COMPANY" | "BRANCH";
  permissions: string[];
  permissionCount: number;
};

const templateLabels: Record<string, { name: string; description: string }> = {
  "general-manager": { name: "Genel Müdür", description: "Şirket genelindeki operasyonları ve temel yönetim verilerini görüntüler." },
  "branch-manager": { name: "Şube Müdürü", description: "Şube operasyonlarını, personeli, müşterileri ve ticari süreçleri yönetir." },
  reception: { name: "Resepsiyon", description: "Müşteri, randevu ve ödeme kabul süreçlerini yürütür." },
  finance: { name: "Finans", description: "Finans, muhasebe, ödeme ve raporlama süreçlerini yönetir." },
  accountant: { name: "Muhasebe", description: "Muhasebe kayıtlarını ve finansal raporları yönetir." },
  hr: { name: "İnsan Kaynakları", description: "İnsan kaynakları ve personel süreçlerini yönetir." },
  warehouse: { name: "Depo ve Stok", description: "Stok, depo ve envanter hareketlerini yönetir." },
  auditor: { name: "Denetçi", description: "Finans, muhasebe, stok ve İK verilerini görüntüleme odaklı denetler." },
};

const scopeLabels = {
  CENTRAL: "Merkez / Şirket Geneli",
  COMPANY: "Şirket / Seçili Şubeler",
  BRANCH: "Şube",
} as const;

export default function RoleTemplatesPage() {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    api<Template[]>("/roles/templates")
      .then(setTemplates)
      .catch((err) => setError(err instanceof ApiError ? userErrorMessage(err.message, "Rol şablonları yüklenemedi.") : "Rol şablonları yüklenemedi."))
      .finally(() => setLoading(false));
  }, []);

  async function instantiate(template: Template) {
    const label = templateLabels[template.key];
    const name = window.prompt("Oluşturulacak rol adı", label?.name ?? template.name)?.trim();
    if (!name) return;
    setCreating(template.key);
    setError("");
    try {
      await api(`/roles/templates/${template.key}/instantiate`, {
        method: "POST",
        body: { name },
      });
      showToast(`${name} rolü oluşturuldu.`);
    } catch (err) {
      setError(err instanceof ApiError ? userErrorMessage(err.message, "Rol şablondan oluşturulamadı.") : "Rol şablondan oluşturulamadı.");
    } finally {
      setCreating(null);
    }
  }

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-sm text-[var(--muted)]">Yükleniyor…</div>;
  }

  return (
    <main className="mx-auto w-full max-w-[1240px] space-y-6 pb-10">
      <header className="border-b border-[var(--line)] pb-5">
        <div className="mb-1 text-xs font-medium text-[var(--muted)]">Yönetim / Erişim</div>
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">Rol Şablonları</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">Hazır rol şablonlarını şirketinize kopyalayarak hızlıca başlayabilirsiniz. Şablon değişmeden kalır; oluşturulan rolü daha sonra Roller ve Yetkiler ekranından özelleştirebilirsiniz.</p>
      </header>

      {error ? <div className="rounded-xl border border-[#f0d8d8] bg-[#fff8f8] px-4 py-3 text-sm text-[#9a4545]">{error}</div> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <article key={template.key} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--ink)]">{templateLabels[template.key]?.name ?? template.name}</h2>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{templateLabels[template.key]?.description ?? template.description}</p>
              </div>
              <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)]">{scopeLabels[template.scope]}</span>
            </div>
            <div className="mt-4 rounded-xl bg-[var(--surface-2)] px-3 py-3 text-xs text-[var(--muted)]">
              <strong className="text-[var(--ink)]">{template.permissionCount}</strong> başlangıç yetkisi
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {template.permissions.slice(0, 6).map((permission) => (
                <span key={permission} className="rounded-full border border-[var(--line)] px-2 py-1 text-[10px] text-[var(--muted)]">{userPermissionKeyLabel(permission)}</span>
              ))}
              {template.permissions.length > 6 ? <span className="rounded-full border border-[var(--line)] px-2 py-1 text-[10px] text-[var(--muted)]">+{template.permissions.length - 6}</span> : null}
            </div>
            <button type="button" disabled={creating === template.key} onClick={() => void instantiate(template)} className="mt-5 w-full rounded-lg bg-[var(--ink)] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">
              {creating === template.key ? "Oluşturuluyor…" : "Şablondan Rol Oluştur"}
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}
