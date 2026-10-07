import { ValooLogo } from "@/components/valoo-logo";

const groups = [
  {
    title: "Platform",
    links: [
      { label: "VALOO’yu Keşfet", href: "/platform" },
      { label: "Ürünler", href: "/urunler" },
      { label: "Çözümler", href: "/cozumler" },
      { label: "Sektörler", href: "/sektorler" },
    ],
  },
  {
    title: "Ürünler",
    links: [
      { label: "CRM", href: "/urunler#bolum-1" },
      { label: "Operasyon", href: "/urunler#bolum-1" },
      { label: "Finans", href: "/urunler#bolum-2" },
      { label: "Inventory", href: "/urunler#bolum-2" },
      { label: "People", href: "/urunler#bolum-3" },
      { label: "Insights", href: "/urunler#bolum-3" },
    ],
  },
  {
    title: "Çözümler",
    links: [
      { label: "Büyüyen İşletmeler", href: "/cozumler#bolum-1" },
      { label: "Çok Şubeli İşletmeler", href: "/cozumler#bolum-2" },
      { label: "Kurumsal Yapılar", href: "/cozumler#bolum-3" },
      { label: "Sektör Çözümleri", href: "/sektorler" },
    ],
  },
  {
    title: "Keşfedin",
    links: [
      { label: "Nasıl Çalışır", href: "/platform" },
      { label: "Entegrasyonlar", href: "/#integrations" },
      { label: "Demo", href: "/demo" },
    ],
  },
  {
    title: "VALOO",
    links: [
      { label: "Ana Sayfa", href: "/" },
      { label: "Platform", href: "/platform" },
      { label: "Demo Planlayın", href: "/demo" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="site-footer" id="resources">
      <div className="footer-inner">
        <div className="footer-brand-row">
          <div>
            <a className="footer-brand" href="/" aria-label="VALOO ana sayfa">
              <ValooLogo className="footer-logo" />
            </a>
            <p>İşin tamamını görmenin daha iyi bir yolu.</p>
          </div>
          <span>Türkiye · Türkçe</span>
        </div>

        <div className="footer-groups">
          {groups.map((group) => (
            <section className="footer-group" key={group.title}>
              <h2>{group.title}</h2>
              <div>
                {group.links.map((link) => (
                  <a href={link.href} key={link.label}>{link.label}</a>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="footer-demo">
          <p>Gerisini göstermemiz daha kolay.</p>
          <a href="/demo">Demo planlayın <span aria-hidden="true">→</span></a>
        </div>

        <div className="footer-legal">
          <p>Copyright © 2026 VALOO. Tüm hakları saklıdır.</p>
          <p className="footer-legal-note">
            Gizlilik, KVKK, kullanım ve çerez metinleri hukuk onayı sonrasında yayınlanacaktır.
          </p>
          <span>Türkiye</span>
        </div>
      </div>
    </footer>
  );
}
