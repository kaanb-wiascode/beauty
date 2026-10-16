import type { Metadata } from "next";

import { DemoRequestForm } from "@/components/demo-request-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Demo",
  description: "VALOO’yu işletmenizin yapısına göre hazırlanmış bir demo ile keşfedin.",
};

export default function DemoPage() {
  return (
    <>
      <SiteHeader />
      <main className="demo-page">
        <section className="demo-intro">
          <div className="demo-intro-copy">
            <p className="eyebrow">VALOO Demo</p>
            <h1>Gerisini göstermemiz<br /><span>daha kolay.</span></h1>
            <p>
              Ekran görüntüsü yerine işletmenizi konuşalım. Size gerçekten kullanacağınız
              akışları gösterelim.
            </p>
          </div>
          <div className="demo-promises" aria-label="Demo yaklaşımı">
            <div><strong>01</strong><span>İşletmenizi anlarız.</span></div>
            <div><strong>02</strong><span>İlgili akışları seçeriz.</span></div>
            <div><strong>03</strong><span>VALOO’yu gerçek senaryoda gösteririz.</span></div>
          </div>
        </section>

        <section className="demo-form-section">
          <DemoRequestForm />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
