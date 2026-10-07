export function PlatformSubnav() {
  return (
    <div className="platform-subnav" aria-label="VALOO platform navigasyonu">
      <div className="platform-subnav-inner">
        <a className="platform-subnav-title" href="#platform">VALOO</a>
        <nav>
          <a href="#story">Genel Bakış</a>
          <a href="#products">Ürünler</a>
          <a href="#solutions">Çözümler</a>
          <a href="#industries">İçgörüler</a>
        </nav>
        <a className="platform-subnav-cta" href="#demo">Demo</a>
      </div>
    </div>
  );
}
