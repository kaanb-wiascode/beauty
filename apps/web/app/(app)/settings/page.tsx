"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { userPermissionLabel } from "@/lib/user-language";

const sections = [
  { href: "/settings/users", title: "Kullanıcılar", description: "İşletme Üyeliklerini, Rolleri Ve Erişim Durumlarını Yönetin.", glyph: "◎" },
  { href: "/settings/invitations", title: "Kullanıcı Davetleri", description: "Tek kullanımlık ve süreli davetlerle yeni kullanıcıların sisteme güvenli şekilde katılmasını yönetin.", glyph: "+" },
  { href: "/settings/temporary-access", title: "Geçici Erişim", description: "Süreli, Şube Kapsamlı Ve Denetlenebilir Ek Yetkileri Yönetin.", glyph: "◷" },
  { href: "/settings/break-glass", title: "Acil Erişim", description: "Parola ve iki aşamalı doğrulama ile açılan, en fazla 60 dakika süren acil yetkileri yönetin.", glyph: "!" },
  { href: "/settings/permission-simulation", title: "Yetki Simülasyonu", description: "Bir Kullanıcının Etkin Rol, Şube, Geçici Ve Yüksek Riskli Yetkilerini Güvenli Şekilde Önizleyin.", glyph: "◉" },
  { href: "/settings/field-security", title: "Alan Güvenliği", description: "T.C. kimlik numarası, IBAN, ücret ve bordro gibi hassas alanları özel yetki kurallarıyla koruyun.", glyph: "▤" },
  { href: "/settings/security", title: "Güvenlik Merkezi", description: "Aktif Oturumları İzleyin, Riskli Oturumları Uzaktan Kapatın Ve Hesap Güvenliğini Yönetin.", glyph: "□" },
  { href: "/settings/roles", title: "Roller Ve Yetkiler", description: "Ekibinizin Erişim Seviyelerini, Rollerini Ve Sistem Yetkilerini Yönetin.", glyph: "◇" },
  { href: "/settings/role-templates", title: "Rol Şablonları", description: "Hazır Başlangıç Reçetelerinden Şirkete Ait Özelleştirilebilir Roller Oluşturun.", glyph: "◇*" },
  { href: "/settings/role-clone", title: "Rol Klonlama", description: "Mevcut bir rolün kapsam ve yetkilerini temel alarak şirkete özel yeni roller oluşturun.", glyph: "◇+" },
  { href: "/settings/approval-workflows", title: "Onay Akışları", description: "Finans, İnsan Kaynakları ve operasyonlar için merkezi ve sürümlenebilir onay kuralları tanımlayın.", glyph: "⇢" },
  { href: "/settings/approval-inbox", title: "Onay Kutusu", description: "Bekleyen Merkezi Onay Taleplerini İnceleyin, Onaylayın Veya Reddedin.", glyph: "✓" },
  { href: "/settings/approval-delegations", title: "Onay Vekaletleri", description: "Geçici onay vekaletlerini işlem alanı, süre ve gerekçeye göre yönetin.", glyph: "↔" },
  { href: "/settings/sod-policies", title: "Görevlerin Ayrılığı", description: "Talep eden ve onaylayan kişilerin aynı kişi olmasını veya yetki çakışmalarını işlem alanına göre yönetin.", glyph: "≠" },
  { href: "/settings/business-policies", title: "İş Politikaları", description: "İndirim, İade, Masraf Ve Benzeri İş Kurallarını Yetkiden Ayrı Olarak Versiyonlayın.", glyph: "ƒ" },
  { href: "/settings/numbering", title: "Numaralandırma", description: "Belge numaralarını şirket, şube ve yıla göre güvenli ve çakışmasız şekilde yönetin.", glyph: "№" },
  { href: "/settings/notifications", title: "Bildirim Politikaları", description: "İş Olaylarının Hangi Kitlelere Hangi Kanallardan Bildirileceğini Yönetin.", glyph: "◫" },
  { href: "/settings/entitlements", title: "Plan Özellikleri", description: "Abonelik planınızla kullanılabilen özellikleri ve modülleri görüntüleyin.", glyph: "◆" },
  { href: "/settings/integrations", title: "Entegrasyonlar", description: "Bankacılık Ve Ödeme Entegrasyonlarının Sağlık, Senkronizasyon Ve Yapılandırma Durumunu İzleyin.", glyph: "∞" },
  { href: "/settings/privacy", title: "Veri & Gizlilik", description: "Veri saklama sürelerini ve veri taleplerini kayıt altına alınan bir yönetim süreciyle yönetin.", glyph: "◌" },
  { href: "/settings/organization", title: "Şirket Ve Şubeler", description: "Şirket Kapsamını, Şubeleri Ve Organizasyon Kullanımını Görüntüleyin.", glyph: "▦" },
  { href: "/settings/audit", title: "Denetim Kayıtları", description: "Kritik Yönetim Değişikliklerini, Aktörleri Ve Önce/Sonra Durumlarını İnceleyin.", glyph: "≋" },
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
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">VALOO Çalışma Alanınızı, Kullanıcı Erişimini Ve Yönetim Politikalarını Yönetin.</p>
      </header>

      {dashboard && (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--ink)]">Yapılandırma Sağlığı</h2>
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
              <div className="text-xs font-semibold text-[var(--ink)]">Erişim Riskleri</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-[var(--muted)]">
                <div>Tüm şirketi görebilen kullanıcı <strong className="ml-1 text-[var(--ink)]">{dashboard.users.broadCentral}</strong></div>
                <div>24 saatte bitecek erişim <strong className="ml-1 text-[var(--ink)]">{dashboard.temporaryAccess.expiringSoon}</strong></div>
                <div>Askıya alınmış kullanıcı <strong className="ml-1 text-[var(--ink)]">{dashboard.users.suspended}</strong></div>
                <div>Aktif şube <strong className="ml-1 text-[var(--ink)]">{dashboard.branches.active}</strong></div>
              </div>
            </div>
            <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="text-xs font-semibold text-[var(--ink)]">Son Yönetim Değişiklikleri</div>
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
          <h2 id="settings-sections" className="text-sm font-semibold text-[var(--ink)]">Erişim Ve Güvenlik Yönetimi</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">Kullanıcıları, Organizasyon Kapsamını, Yetkilendirme Yapısını Ve Kritik Yönetim Değişikliklerini Ayrı Yönetim Alanlarından Yönetin.</p>
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
