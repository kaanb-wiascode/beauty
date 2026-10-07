import { ValooLogo } from "@/components/valoo-logo";

const productLinks = [
  ["CRM", "Müşteriler ve satış fırsatları"],
  ["Operasyon", "Günün akışı ve kapasite"],
  ["Finans", "Tahsilat, gider ve görünürlük"],
  ["People", "Ekip, çalışma ve gelişim"],
  ["Inventory", "Stok, tedarik ve hareketler"],
  ["Insights", "Kararlar için anlamlı veri"],
] as const;

const solutionLinks = [
  ["Büyüyen işletmeler", "Karmaşa büyümeden sistemi kurun"],
  ["Çok şubeli yapılar", "Merkezden görün, yerinde yönetin"],
  ["Kurumsal organizasyonlar", "Yetki, süreç ve kontrol tek modelde"],
] as const;

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="/" aria-label="VALOO ana sayfa"><ValooLogo className="brand-logo" priority /></a>

        <nav className="desktop-nav" aria-label="Ana navigasyon">
          <a href="/platform">Platform</a>
          <div className="nav-menu nav-hover">
            <a className="nav-trigger" href="/urunler" aria-haspopup="true">Ürünler</a>
            <div className="mega-menu">
              <p className="mega-kicker">VALOO ürünleri</p>
              <div className="mega-grid">
                {productLinks.map(([title, description]) => (
                  <a href="/urunler" key={title}>
                    <strong>{title}</strong>
                    <span>{description}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
          <div className="nav-menu nav-hover">
            <a className="nav-trigger" href="/cozumler" aria-haspopup="true">Çözümler</a>
            <div className="mega-menu mega-menu-small">
              <p className="mega-kicker">İşletmenize göre</p>
              <div className="mega-stack">
                {solutionLinks.map(([title, description]) => (
                  <a href="/cozumler" key={title}>
                    <strong>{title}</strong>
                    <span>{description}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
          <a href="/sektorler">Sektörler</a>
          <a href="/#resources">Kaynaklar</a>
        </nav>

        <div className="header-actions">
          <button className="icon-button" type="button" aria-label="Ara">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
          </button>
          <a className="login-link" href="#login">Giriş</a>
          <a className="demo-button" href="/demo">Demo</a>
          <details className="mobile-menu">
            <summary aria-label="Menüyü aç"><span /><span /></summary>
            <nav aria-label="Mobil navigasyon">
              <a href="/platform">Platform</a>
              <a href="/urunler">Ürünler</a>
              <a href="/cozumler">Çözümler</a>
              <a href="/sektorler">Sektörler</a>
              <a href="/#resources">Kaynaklar</a>
              <a href="/demo">Demo planlayın</a>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
