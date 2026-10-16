# Kurumsal İletişim — Brand & Growth Operations Blueprint

## Amaç

Kurumsal İletişim, CRM'in alt modülü değildir. Marka, büyüme, dijital pazarlama, içerik, ajans/creator, PR, attribution ve performans operasyonlarını tek ticari gerçeklik üzerinde birleştiren bağımsız bir domaindir.

Ana değer önerisi yalnız erişim/tıklama raporlamak değil, pazarlama harcamasını aşağıdaki zincir üzerinden tahsilata kadar bağlamaktır:

`Campaign → Ad/Content → Marketing Lead → CRM Lead/Opportunity → Appointment → Sale → Payment → Attributed Revenue`

Bu domain CRM, Sales, Appointments, Finance ve dosya/asset altyapısıyla güçlü biçimde konuşur; provider bağımlılıklarını CRM domainine taşımaz.

## Hedef navigasyon

- Genel Bakış
- Kampanyalar
- Reklamlar
- İçerik Takvimi
- Sosyal Medya
- Lead & Dönüşüm
- Marka Merkezi
- Dijital Varlıklar
- Ajanslar & İş Ortakları
- Influencer / Creator
- PR & Medya
- Rakip Analizi
- Onay Merkezi
- Raporlar & Analitik

## Domain kapsamı

### Marka Merkezi ve Brand Governance

Logo varyasyonları, ikonlar, renk paleti, HEX/RGB/CMYK/Pantone, font ailesi, başlık/body fontları, sloganlar, fotoğraf/video stili, tone of voice, kullanılabilecek ve yasaklı ifadeler, hashtag kuralları, logo güvenli alanı, yanlış kullanım örnekleri ve şube bazlı marka varyasyonları tutulmalıdır.

Brand Governance daha sonra içerik ve creative onay akışına bağlanmalıdır. Yapay zekâ destekli marka uygunluk kontrolü gelecekte bu kuralları okuyabilmelidir.

### Kampanya Yönetimi

Her kampanya en az şu ticari bağlamı taşımalıdır:

- Amaç: Awareness, Lead Generation, Appointment, Sale, Retention, Reactivation
- Hedef kitle/segment
- Kanal/provider
- Şube
- Hizmet/paket/ürün
- Planlanan ve gerçekleşen bütçe
- Hedef KPI: CPL, CPA, CAC, ROAS, revenue
- Başlangıç/bitiş dönemi
- Owner: iç ekip, çalışan veya ajans
- Creative set
- Landing page
- UTM source/medium/campaign/content/term
- CRM lead/opportunity bağlantısı
- Appointment/Sale/Payment bağlantısı
- Attributed revenue

### Lead Attribution ve Dönüşüm

Marketing lead provider bazlı idempotent alınmalıdır. Provider external lead ID tekrarları çift kayıt oluşturmamalıdır.

Dönüşüm zinciri:

`Marketing Lead → routing → CRM Lead → Opportunity → Appointment → Sale → Payment`

Routing, tenant/company/branch izolasyonunu bozmadan FIXED, ROUND_ROBIN ve LEAST_LOADED stratejilerini desteklemelidir. Aynı marketing lead'in CRM'e tekrarlı aktarımı idempotent olmalıdır.

### Multi-touch Attribution

Sistem yalnız `source = Instagram` yaklaşımına bağlı kalmamalıdır. Touchpoint geçmişi korunmalı ve ileride aşağıdaki modeller desteklenmelidir:

- First Touch
- Last Touch
- Linear
- Position Based

Örnek yolculuk:

`Instagram Reel → Google Search → Website → WhatsApp → Appointment → Sale`

Attribution sonucu kampanya, kanal, creative, içerik, şube, hizmet ve creator düzeyinde raporlanabilmelidir.

### İçerik Operasyonu

İçerik lifecycle hedefi:

`Idea → Brief → Production → Review → Approval → Scheduled → Published → Archived`

Her içerik platform, format, caption, hashtag, CTA, kampanya, şube, hizmet, creator, tasarımcı, video editörü, onaylayan, yayın tarihi, organik sonuçlar ve paid amplification bilgilerini taşımalıdır.

Takvim ve Kanban görünümü desteklenmelidir.

### Sosyal Medya ve Reklam Yönetimi

Instagram, Facebook, TikTok, YouTube ve LinkedIn organik içerik planlama/performans verileri ayrı adapterlar üzerinden ele alınmalıdır.

Meta Ads, Google Ads ve TikTok Ads için provider adapter katmanı kullanılmalıdır. CRM veya campaign domaini provider API detaylarını bilmemelidir.

Gerçek provider bağlantıları OAuth üzerinden kurulmalı; erişim tokenları veya credential bilgileri plaintext saklanmamalı ve response'larda gösterilmemelidir. Encrypted credential vault kullanılmalıdır.

### Ajans / Marketing Vendor Management

Sosyal medya ajansı, reklam ajansı, prodüksiyon firması, fotoğrafçı, influencer ajansı ve freelancer kayıtları tutulmalıdır.

Firma kartı hedef kapsamı:

- Firma tipi ve durum
- İletişim kişileri
- Sözleşme başlangıç/bitiş
- Hizmet kapsamı
- Aylık ücret ve ödeme modeli
- KPI taahhütleri
- Teslim edilen işler
- Performans geçmişi
- Attributed revenue

### Influencer / Creator CRM

Creator profili, handle/platform, kategori, takipçi, engagement, rate card, audience profile, kampanya işbirlikleri, fee, deliverables, kupon kodu, yayın tarihi, içerik performansı ve attributed revenue tutulmalıdır.

### PR & Medya

Basın, medya, röportaj, etkinlik, sponsorluk ve kriz iletişimi operasyonları takip edilebilmelidir. Outlet/partner, temas kişisi, yayın/etkinlik tarihi, maliyet, tahmini erişim, sentiment ve kampanya bağlantısı bulunmalıdır.

### Digital Asset Library

Fotoğraf, video, logo, template ve kampanya creative dosyaları merkezi asset kütüphanesinde tutulmalıdır. Storage key/external URL, MIME type, boyut, çözünürlük, süre, checksum, kullanım hakkı sahibi, lisans bitişi, tag ve metadata desteklenmelidir.

### Approval Center

Campaign, content, ad/creative ve brand materyalleri generic approval request modeli üzerinden onaya gönderilebilmelidir. Requester, approver, durum, karar notu, due date ve immutable/auditable karar izi bulunmalıdır.

### Rakip Analizi

Rakip adı, kanal, gözlem tarihi, source URL, kampanya/iletişim özeti, fiyat notları, iletişim tonu ve dijital görünürlük skoru takip edilmelidir.

## Dashboard ve yönetim analitiği

Ana ekranda en az:

- Pazarlama harcaması
- Kampanya sayısı
- Aktif reklam sayısı
- Lead sayısı
- CPL
- Randevu dönüşüm oranı
- Satış dönüşüm oranı
- Attributed revenue
- ROAS
- En iyi kanal
- En iyi kampanya
- En iyi creative
- En iyi şube
- En iyi hizmet

sunulmalıdır.

Anomali motoru örnekleri:

- Bütçe artıyor, lead conversion düşüyor.
- Çok sayıda lead geliyor fakat appointment/sale oluşmuyor.
- CPL veya CAC eşik üstüne çıkıyor.
- Creative spend artıyor fakat incremental revenue üretmiyor.

Bu sinyaller CRM ve CFO/Finance tarafında da kullanılabilir olmalıdır.

## Authorization hedefi

Coarse permissions mevcut geçiş döneminde korunabilir:

- `communications.read`
- `communications.manage`
- `communications.approve`
- `communications.analytics`

Fine-grained hedef model:

- `communications.campaigns.manage`
- `communications.brand.manage`
- `communications.content.manage`
- `communications.analytics.read`
- `communications.approve`
- `communications.vendors.manage`
- `communications.pr.manage`
- `communications.assets.manage`

Yetkiler tenant/company/branch kapsam kurallarını gevşetmemelidir.

## Güvenlik ve bütünlük kuralları

- Tenant/company/branch scope DB ve service katmanında korunur.
- Provider ingestion idempotent olmalıdır.
- External credentials plaintext saklanmaz.
- Webhook signature doğrulanmadan işlenmez.
- Provider retry/replay çift CRM lead, appointment, sale veya attribution üretmemelidir.
- Approval ve attribution değişiklikleri audit edilebilir olmalıdır.
- Cross-branch routing, aktif kullanıcı context'i tarafından izin verilmediğinde reddedilmelidir.

## Uygulama fazları

### Faz 1 — Foundation

Campaigns, Marketing Lead Inbox, touchpoints, Brand Assets, provider connection metadata, routing rules, dashboard, standalone navigation.

### Faz 2 — CRM Automation

Marketing Lead → CRM Lead idempotent bridge, routing engine, duplicate resolution, follow-up/SLA, CRM opportunity linkage.

### Faz 3 — Content & Governance

Content lifecycle, content calendar/Kanban, Brand Governance, Digital Assets, Approval Center.

### Faz 4 — External Network

Agencies/vendors, Creator CRM, creator collaborations, PR & Media, Competitor Analysis.

### Faz 5 — Provider Integrations

Meta OAuth/webhook/Lead Ads/ad sync; ardından Google Ads ve TikTok adapterları.

### Faz 6 — Attribution & Intelligence

Appointment/Sale/Payment revenue attribution, multi-touch models, channel/campaign/creative/branch/service analytics, anomaly detection ve CFO/CRM cross-signals.

## Release gate

Bir faz yalnız UI görünür olduğunda tamamlanmış sayılmaz. İlgili faz için fresh migrations, API typecheck, unit tests, E2E, API build, web lint/typecheck/build yeşil olmalıdır. Kritik dönüşümlerde idempotency, tenant/branch denial ve permission denial testleri bulunmalıdır.
