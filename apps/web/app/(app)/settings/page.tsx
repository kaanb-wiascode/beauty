"use client";

import Link from "next/link";

const sections = [
  { href: "/settings/users", title: "Kullanıcılar", description: "İşletme Üyeliklerini, Rolleri Ve Erişim Durumlarını Yönetin.", glyph: "◎" },
  { href: "/settings/invitations", title: "Kullanıcı Davetleri", description: "Tek Kullanımlık, Süreli Davetlerle Güvenli Kullanıcı Onboarding Sürecini Yönetin.", glyph: "+" },
  { href: "/settings/temporary-access", title: "Geçici Erişim", description: "Süreli, Şube Kapsamlı Ve Denetlenebilir Ek Yetkileri Yönetin.", glyph: "◷" },
  { href: "/settings/permission-simulation", title: "Yetki Simülasyonu", description: "Bir Kullanıcının Etkin Rol, Şube, Geçici Ve Yüksek Riskli Yetkilerini Güvenli Şekilde Önizleyin.", glyph: "◉" },
  { href: "/settings/security", title: "Güvenlik Merkezi", description: "Aktif Oturumları İzleyin, Riskli Oturumları Uzaktan Kapatın Ve Hesap Güvenliğini Yönetin.", glyph: "□" },
  { href: "/settings/roles", title: "Roller Ve Yetkiler", description: "Ekibinizin Erişim Seviyelerini, Rollerini Ve Sistem Yetkilerini Yönetin.", glyph: "◇" },
  { href: "/settings/role-templates", title: "Rol Şablonları", description: "Hazır Başlangıç Reçetelerinden Şirkete Ait Özelleştirilebilir Roller Oluşturun.", glyph: "◇*" },
  { href: "/settings/role-clone", title: "Rol Klonlama", description: "Mevcut Bir Rolün Kapsam Ve Yetki Setinden Tenant-Owned Yeni Roller Türetin.", glyph: "◇+" },
  { href: "/settings/approval-workflows", title: "Onay Akışları", description: "Finance, HR Ve Operasyonlar İçin Versiyonlu Merkezi Onay Politikaları Tanımlayın.", glyph: "⇢" },
  { href: "/settings/approval-inbox", title: "Onay Kutusu", description: "Bekleyen Merkezi Onay Taleplerini İnceleyin, Onaylayın Veya Reddedin.", glyph: "✓" },
  { href: "/settings/approval-delegations", title: "Onay Delegasyonları", description: "Geçici Vekaletleri Domain, Süre Ve Gerekçeyle Yönetin.", glyph: "↔" },
  { href: "/settings/sod-policies", title: "Görevlerin Ayrılığı", description: "Requester, Approver Ve Çok Adımlı Onay Çakışmalarını Domain Bazında Yönetin.", glyph: "≠" },
  { href: "/settings/business-policies", title: "İş Politikaları", description: "İndirim, İade, Masraf Ve Benzeri İş Kurallarını Yetkiden Ayrı Olarak Versiyonlayın.", glyph: "ƒ" },
  { href: "/settings/privacy", title: "Veri & Gizlilik", description: "Retention Metadata Ve Veri Taleplerini Denetlenebilir Governance Workflow'u İle Yönetin.", glyph: "◌" },
  { href: "/settings/organization", title: "Şirket Ve Şubeler", description: "Şirket Kapsamını, Şubeleri Ve Organizasyon Kullanımını Görüntüleyin.", glyph: "▦" },
  { href: "/settings/audit", title: "Denetim Kayıtları", description: "Kritik Yönetim Değişikliklerini, Aktörleri Ve Önce/Sonra Durumlarını İnceleyin.", glyph: "≋" },
];

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-[1240px] space-y-6 pb-10">
      <header className="border-b border-[var(--line)] pb-5">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Yönetim</div>
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">Yönetim Merkezi</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">VALOO Çalışma Alanınızı, Kullanıcı Erişimini Ve Yönetim Politikalarını Yönetin.</p>
      </header>
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
