# VALOO Marketing

VALOO marketing sitesi, operasyon uygulamasından bağımsız bir Next.js uygulamasıdır.

## Tasarım ilkeleri

- VALOO ana marka olarak sektör bağımsız konumlanır; sektör çözümleri ayrı landing page katmanıdır.
- Apple bir görsel kopya değil, bilgi mimarisi / boşluk / tipografi / scroll ritmi referansıdır.
- Tam uygulama ekran görüntüleri ana sayfada kullanılmaz. Ürün, veri parçaları, durumlar, hareket ve UI DNA'sı ile hissettirilir.
- Ana iletişim kısa, özgüvenli ve merak uyandırıcıdır. Teknik açıklama ikinci katmanda gelir.
- Her bölüm kart ızgarasına dönüştürülmez. Editorial sahneler ve değişken sayfa ritmi tercih edilir.
- Hareket dekorasyon değildir; süreçler arasındaki bağlantıyı anlatmalıdır.
- Marka paleti kontrollü kullanılır. Gradient varsayılan değildir.
- Typography display ağırlığı 600 civarında tutulur; büyük başlıklar ağırlıktan çok ölçek ve boşlukla güç kazanır.
- Footer sessiz, küçük tipografili ve bilgi odaklıdır.
- Responsive tasarım mobilde yalnız küçültme değil, yeniden kompozisyon olarak ele alınır.
- prefers-reduced-motion, klavye odağı ve semantik HTML korunur.
- Gerçek olmayan ürün, entegrasyon, sertifika, müşteri metriği veya başarı iddiası yayınlanmaz.

## Ürün gösterim kuralı

**Full UI yok. UI DNA'sı var.**

Ana sayfada tam dashboard / CRM / finans ekranı yerine:
- sayı ve metrik parçaları,
- timeline satırları,
- durum göstergeleri,
- süreç bağlantıları,
- şube / ekip / stok sinyalleri,
- markaya ait motion ve tipografi

kullanılır.

## Geliştirme

```bash
pnpm --filter marketing dev
pnpm --filter marketing typecheck
pnpm --filter marketing build
```

Her push'ta Monorepo quality workflow'u marketing typecheck ve production build çalıştırır.

## Yapısal sınır

- `apps/web`: oturum açılan VALOO uygulaması
- `apps/marketing`: public pazarlama / marka sitesi
- ortak marka tokenları ileride `packages/` altında paylaşılabilir
- marketing'e özgü editorial componentler operasyon UI paketine taşınmaz


## Deployment ortam değişkenleri

Marketing uygulaması:
- `NEXT_PUBLIC_SITE_URL`: public site kök adresi. Sitemap ve metadata için kullanılır.
- `NEXT_PUBLIC_API_URL`: VALOO API public base adresi. Aynı origin reverse proxy kullanılıyorsa `/backend` varsayılanı kullanılabilir.

API demo intake:
- `MARKETING_DEMO_TENANT_ID`: demo taleplerinin düşeceği VALOO tenant kimliği.
- `MARKETING_DEMO_COMPANY_ID`: demo taleplerinin düşeceği şirket kimliği.
- `MARKETING_DEMO_BRANCH_ID`: opsiyonel varsayılan şube.
- Marketing site origin'i API `CORS_ORIGINS` listesinde bulunmalıdır.
- Reverse proxy arkasında gerçek istemci IP'siyle rate-limit uygulanacaksa proxy güven ayarı deployment mimarisiyle uyumlu olmalıdır.

Demo formu auth gerektiren CRM endpoint'lerini doğrudan kullanmaz. Public intake endpoint'i WEBSITE marketing lead oluşturur; mevcut VALOO yönlendirme / CRM dönüşüm akışı sonrasında uygulanabilir.
