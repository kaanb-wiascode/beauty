"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { userPermissionLabel } from "@/lib/user-language";

const sections = [
  { href: "/settings/users", title: "Kullanıcılar", description: "İşletme üyeliklerini, rolleri ve erişim durumlarını yönetin.", glyph: "◎" },
  { href: "/settings/invitations", title: "Kullanıcı davetleri", description: "Tek kullanımlık ve süreli davetlerle yeni kullanıcıların sisteme güvenli şekilde katılmasını yönetin.", glyph: "+" },
  { href: "/settings/temporary-access", title: "Geçici erişim", description: "Süreli, şube kapsamlı ve denetlenebilir ek yetkileri yönetin.", glyph: "◷" },
  { href: "/settings/break-glass", title: "Acil erişim", description: "Parola ve iki aşamalı doğrulama ile açılan, en fazla 60 dakika süren acil yetkileri yönetin.", glyph: "!" },
  { href: "/settings/permission-simulation", title: "Yetki simülasyonu", description: "Bir kullanıcının etkin rol, şube, geçici ve yüksek riskli yetkilerini güvenli şekilde önizleyin.", glyph: "◉" },
  { href: "/settings/field-security", title: "Alan güvenliği", description: "T.C. kimlik numarası, IBAN, ücret ve bordro gibi hassas alanları özel yetki kurallarıyla koruyun.", glyph: "▤" },
  { href: "/settings/security", title: "Güvenlik merkezi", description: "Aktif oturumları izleyin, riskli oturumları uzaktan kapatın ve hesap güvenliğini yönetin.", glyph: "□" },
  { href: "/settings/roles", title: "Roller ve yetkiler", description: "Ekibinizin erişim seviyelerini, rollerini ve sistem yetkilerini yönetin.", glyph: "◇" },
  { href: "/settings/role-templates", title: "Rol şablonları", description: "Hazır başlangıç şablonlarından şirkete özel roller oluşturun.", glyph: "◇*" },
  { href: "/settings/role-clone", title: "Rol kopyalama", description: "Mevcut bir rolün kapsam ve yetkilerini temel alarak şirkete özel yeni roller oluşturun.", glyph: "◇+" },
  { href: "/settings/approval-workflows", title: "Onay akışları", description: "Finans, insan kaynakları ve operasyonlar için merkezi ve sürümlenebilir onay kuralları tanımlayın.", glyph: "⇢" },
  { href: "/settings/approval-inbox", title: "Onay kutusu", description: "Bekleyen merkezi onay taleplerini inceleyin, onaylayın veya reddedin.", glyph: "✓" },
  { href: "/settings/approval-delegations", title: "Onay vekaletleri", description: "Geçici onay vekaletlerini işlem alanı, süre ve gerekçeye göre yönetin.", glyph: "↔" },
  { href: "/settings/sod-policies", title: "Görevlerin ayrılığı", description: "Talep eden ve onaylayan kişilerin aynı kişi olmasını veya yetki çakışmalarını işlem alanına göre yönetin.", glyph: "≠" },
  { href: "/settings/business-policies", title: "İş politikaları", description: "İndirim, iade, masraf ve benzeri iş kurallarını yetkilerden ayrı olarak sürümlendirin.", glyph: "ƒ" },
  { href: "/settings/numbering", title: "Numaralandırma", description: "Belge numaralarını şirket, şube ve yıla göre güvenli ve çakışmasız şekilde yönetin.", glyph: "№" },
  { href: "/settings/notifications", title: "Bildirim politikaları", description: "İş olaylarının hangi kitlelere hangi kanallardan bildirileceğini yönetin.", glyph: "◫" },
  { href: "/settings/entitlements", title: "Plan özellikleri", description: "Abonelik planınızla kullanılabilen özellikleri ve modülleri görüntüleyin.", glyph: "◆" },
  { href: "/settings/integrations", title: "Entegrasyonlar", description: "Bankacılık ve ödeme entegrasyonlarının bağlantı sağlığını, veri güncelleme ve yapılandırma durumunu izleyin.", glyph: "∞" },
  { href: "/settings/privacy", title: "Veri ve gizlilik", description: "Veri saklama sürelerini ve veri taleplerini kayıt altına alınan bir yönetim süreciyle yönetin.", glyph: "◌" },
  { href: "/settings/organization", title: "Şirket ve şubeler", description: "Şirket kapsamını, şubeleri ve organizasyon kullanımını görüntüleyin.", glyph: "▦" },
  { href: "/settings/audit", title: "Denetim kayıtları", description: "Kritik yönetim değişikliklerini, işlemi yapan kişileri ve önceki/sonraki durumları inceleyin.", glyph: "≋" },
];

type Dashboard = {
  users: { active: number; suspended: number; withoutBranchScope: number; broadCentral: number };
  invitations: { pending: number };
  roles: { total: number };
  branches: { active: number; inactive: number };
  temporaryAccess: { active: number; expiringSoon: number };
  mfa: { enrolled: number; eligible: number; coveragePercent: number };
  integrations: { total: number; unhealthy: number };
  recentAudit: Array<{ id: string; resource: string; action: string; createdAt: string }>;
};

export default function SettingsPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);

  useEffect(() => {
    api<Dashboard>("/admin/dashboard").then(setDashboard).catch(() => setDashboard(null));
  }, []);

  const metrics = dashboard ? [
    ["Aktif kullanıcı", dashboard.users.active],
    ["Bekleyen davet", dashboard.invitations.pending],
    ["İki aşamalı doğrulama", `%${dashboard.mfa.coveragePercent}`],
    ["Şube erişimi eksik", dashboard.users.withoutBranchScope],
    ["Geçici erişim", dashboard.temporaryAccess.active],
    ["Sorunlu entegrasyon", dashboard.integrations.unhealthy],
  ] : [];

  return (
    <main className="mx-auto w-full max-w-[1240px] space-y-6 pb-10">
      <header className="border-b border-[var(--line)] pb-5">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Yönetim</div>
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">Yönetim Merkezi</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">VALOO çalışma alanınızı, kullanıcı erişimini ve yönetim politikalarını yönetin.</p>
      </header>

      {dashboard && (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--ink)]">Yapılandırma sağlığı</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">Erişim, güvenlik ve entegrasyon tarafındaki dikkat gerektiren yönetim sinyalleri.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {metrics.map(([label, value]) => (
              <div key={String(label)} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
                <div className="text-[11px] text-[var(--muted)]">{label}</div>
                <div className="mt-2 text-xl font-semibold text-[var(--ink)]">{value}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="text-xs font-semibold text-[var(--ink)]">Erişim riskleri</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-[var(--muted)]">
                <div>Tüm şirketi görebilen kullanıcı <strong className="ml-1 text-[var(--ink)]">{dashboard.users.broadCentral}</strong></div>
                <div>24 saatte bitecek erişim <strong className="ml-1 text-[var(--ink)]">{dashboard.temporaryAccess.expiringSoon}</strong></div>
                <div>Askıya alınmış kullanıcı <strong className="ml-1 text-[var(--ink)]">{dashboard.users.suspended}</strong></div>
                <div>Aktif şube <strong className="ml-1 text-[var(--ink)]">{dashboard.branches.active}</strong></div>
              </div>
            </div>
            <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="text-xs font-semibold text-[var(--ink)]">Son yönetim değişiklikleri</div>
              <div className="mt-3 space-y-2">
                {dashboard.recentAudit.length === 0 ? <div className="text-xs text-[var(--muted)]">Henüz kayıt yok.</div> : dashboard.recentAudit.slice(0, 5).map((event) => (
                  <div key={event.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate text-[var(--ink)]">{userPermissionLabel(event.resource, event.action)}</span>
                    <span className="shrink-0 text-[var(--muted)]">{new Date(event.createdAt).toLocaleString("tr-TR")}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby="settings-sections" className="space-y-3">
        <div>
          <h2 id="settings-sections" className="text-sm font-semibold text-[var(--ink)]">Erişim ve güvenlik yönetimi</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">Kullanıcıları, organizasyon kapsamını, yetkilendirme yapısını ve kritik yönetim değişikliklerini ayrı yönetim alanlarından yönetin.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => (
            <Link key={section.href} href={section.href} className="group rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:shadow-[var(--shadow-lift)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]">
              <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--accent-soft)] text-lg text-[var(--accent)]">{section.glyph}</span>
              <h3 className="mt-4 text-sm font-semibold text-[var(--ink)]">{section.title}</h3>
              <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">{section.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)]">Aç<span aria-hidden="true">→</span></span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
