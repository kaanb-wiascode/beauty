type Chapter = {
  kicker: string;
  title: string;
  body: string;
  points: readonly string[];
};

type EditorialLandingProps = {
  eyebrow: string;
  title: string;
  accent: string;
  intro: string;
  chapters: readonly Chapter[];
  localLinks: readonly { label: string; href: string }[];
};

export function EditorialLanding({
  eyebrow,
  title,
  accent,
  intro,
  chapters,
  localLinks,
}: EditorialLandingProps) {
  return (
    <>
      <div className="editorial-local-nav">
        <div className="editorial-local-nav-inner">
          <strong>VALOO</strong>
          <nav aria-label="Sayfa bölümleri">
            {localLinks.map((link) => (
              <a href={link.href} key={link.href}>{link.label}</a>
            ))}
          </nav>
          <a href="/demo">Demo</a>
        </div>
      </div>

      <section className="editorial-hero">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}<span>{accent}</span></h1>
        <p>{intro}</p>
      </section>

      <div className="editorial-chapters">
        {chapters.map((chapter, index) => (
          <section className={"editorial-chapter chapter-" + ((index % 3) + 1)} id={"bolum-" + (index + 1)} key={chapter.title}>
            <div className="editorial-chapter-copy">
              <p className="eyebrow">{chapter.kicker}</p>
              <h2>{chapter.title}</h2>
              <p>{chapter.body}</p>
            </div>
            <div className="editorial-chapter-points">
              {chapter.points.map((point, pointIndex) => (
                <div key={point}>
                  <span>{String(pointIndex + 1).padStart(2, "0")}</span>
                  <strong>{point}</strong>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="editorial-end">
        <p className="eyebrow">VALOO</p>
        <h2>Görmek başka.<br /><span>Kullanmak başka.</span></h2>
        <a className="primary-link" href="/demo">Demo planlayın</a>
      </section>
    </>
  );
}
