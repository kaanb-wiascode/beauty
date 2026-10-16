# Eğitim, Gelişim, LMS ve Yetkinlik Yönetimi Geliştirme Yol Haritası

## 1. Belgenin amacı

Bu belge Beauty ERP içerisindeki Eğitim & Gelişim alanının mevcut teknik durumunu, ürün boşluklarını ve hedef mimarisini tanımlar. Amaç klasik bir eğitim takip ekranı oluşturmak değil; işletmenin müdürlerinin, yöneticilerinin, İK/eğitim ekiplerinin ve yetkili eğitmenlerinin kurs oluşturabildiği, içerik ve materyal yayınlayabildiği, personele eğitim atayabildiği, teorik ve pratik değerlendirme yapabildiği, yetkinlik ve sertifika üretebildiği uçtan uca bir Learning & Development platformu oluşturmaktır.

Nihai hedef özellikle güzellik, estetik, spa ve klinik operasyonlarında şu zinciri kurmaktır:

`Eğitim → İçerik → Sınav → Pratik Değerlendirme → Yetkinlik → Sertifika → Hizmet/Cihaz Yetkisi → Operasyonel Uygunluk`

Kod her zaman uygulamanın mevcut durumunun kaynağıdır. Bu roadmap yönü belirler; herhangi bir madde uygulanmadan önce mevcut kod ve son commitler kontrol edilmelidir.

---

## 2. Mevcut durum

Aktif geliştirme branch'i: `feature/core-commerce-foundation`.

Mevcut sistem sıfırdan bir LMS değildir. Backend tarafında önemli eğitim, planlama, LMS ve yetkinlik altyapıları bulunmaktadır; temel problem bunların yöneticinin kullanabileceği bütünleşik bir ürün deneyimine dönüştürülmemiş olmasıdır.

### Mevcut ana parçalar

- Training courses
- Training assignments
- Assignment lifecycle ve event geçmişi
- Quality finding kaynaklı otomatik eğitim atamaları
- Training sessions ve enrollment
- Development plans
- Competency definitions
- Competency profiles
- Staff competency assessments
- Competency gap hesaplama
- Recurring competency reviews
- Question bank / quizzes
- LMS course versions
- Lesson/content altyapısı
- Exam/question altyapısı
- Practical assessment
- Final result/finalization
- Certificate altyapısı
- Training analytics
- Personel gelişim dizini

### Mevcut kurs kaydı

Kurs oluşturma backend seviyesinde desteklenmektedir. Temel alanlar:

- code
- title
- description
- category
- deliveryType

Mevcut sabit kategoriler yaklaşık olarak SERVICE, SALES, CUSTOMER_EXPERIENCE, CORPORATE, MANAGEMENT, QUALITY ve OTHER eksenindedir. Delivery type tarafında THEORY, PRACTICAL ve BLENDED bulunmaktadır.

### LMS altyapısı

Mevcut LMS katmanında course version, lesson content, exam, question, publish, attempt, practical assessment, finalization ve certificate gibi önemli parçalar bulunmaktadır. İçerik tiplerinde TEXT, VIDEO, LINK ve DOCUMENT desteği vardır.

Bu nedenle yeni bir LMS motoru sıfırdan yazılmamalıdır. Mevcut altyapı incelenerek genişletilmeli ve tek bir ürün deneyiminde birleştirilmelidir.

### Temel ürün problemi

Mevcut `/training` ekranı daha çok operasyonel izleme ekranıdır. Kurslar ve eğitim süreçleri görüntülenebilmesine rağmen kullanıcı açısından eksik olan ana akış şudur:

`Kurs Oluştur → Modül/Ders Oluştur → Materyal Ekle → Sınav/Pratik Değerlendirme Ekle → Yetkinlik Bağla → Yayınla → Personel/Rol/Şubeye Ata → İlerlemesini İzle → Değerlendir → Sertifikalandır`

Bu nedenle backend kapasitesi ile kullanıcı deneyimi arasında önemli bir fark bulunmaktadır.

---

## 3. Ürün vizyonu

Eğitim & Gelişim modülü dört ana domain altında ele alınmalıdır:

1. Learning
2. Competency
3. Development
4. Compliance

Sistem yalnızca video izlenen bir LMS olmamalıdır. İşletmenin çalışan yetkinliğini ve operasyonel uygunluğunu kanıtlayan bir sistem olmalıdır.

Örnek:

`Alexandrite Lazer Eğitimi → Teori Sınavı → Uygulamalı Değerlendirme → Alexandrite Yetkinliği → Sertifika → Alexandrite hizmetini uygulama yetkisi`

---

## 4. Kurs yönetimi

### Course Builder

Yönetici veya yetkili müdür yeni bir kurs oluşturabilmelidir.

Önerilen temel alanlar:

- Kurs adı
- Kurs kodu
- Açıklama
- Kategori
- Alt kategori
- Seviye
- Eğitim türü
- Tahmini süre
- Eğitmen/sorumlu
- Teorik başarı puanı
- Pratik başarı puanı
- Sertifika üretme politikası
- Sertifika geçerlilik süresi
- Zorunlu/opsiyonel durumu
- Scope
- Dil
- Etiketler
- Ön koşullar

### Kurs yaşam döngüsü

Önerilen durumlar:

`DRAFT → IN_REVIEW → APPROVED → PUBLISHED → RETIRED → ARCHIVED`

Kurs üzerinde doğrudan destructive değişiklik yapmak yerine yayınlanan versiyonlar korunmalıdır.

### Kurs kapsamı

Kursun erişim/yönetim scope'u desteklenmelidir:

- TENANT
- COMPANY
- REGION (ileride)
- BRANCH

Merkezi kurumsal kursların şube yöneticileri tarafından izinsiz değiştirilmesi engellenmelidir.

---

## 5. Kurs içerik mimarisi

Hedef hiyerarşi:

`Course → Version → Module → Lesson → Content`

Mevcut lesson/content altyapısı korunmalı, gerekli ise Module seviyesi incremental olarak eklenmelidir.

Örnek Alexandrite kursu:

- Modül 1: Temel Teori
  - Lazer fiziği
  - Alexandrite çalışma prensibi
  - Dalga boyu
  - Cilt tipleri
- Modül 2: Güvenlik
  - Göz güvenliği
  - Riskler
  - Kontrendikasyonlar
- Modül 3: Uygulama
  - Cihaz hazırlığı
  - Müşteri hazırlığı
  - Parametre seçimi
  - İşlem
- Modül 4: Değerlendirme
  - Teori sınavı
  - Pratik sınav

Lesson-level progress tutulmalıdır:

- NOT_STARTED
- IN_PROGRESS
- COMPLETED

---

## 6. Materyal kütüphanesi

Mevcut lesson content referansları zamanla reusable bir Learning Asset Library'ye dönüştürülmelidir.

Desteklenecek içerik/materyal türleri:

- Text
- PDF
- Word/document
- Presentation
- Video
- Image
- URL
- Procedure
- SOP
- Checklist
- Device manual
- Policy
- Training note

Bir materyal birden fazla kursta kullanılabilmelidir.

Materyallerde mümkün olduğunca:

- tenant/company ownership
- version
- createdBy
- updatedBy
- visibility
- audit
- private access
- document reference

korunmalıdır.

---

## 7. Eğitim kategorileri

Beauty ERP için eğitim alanları yalnızca mevcut sabit enumlarla sınırlı kalmamalıdır.

Başlangıç kategorileri:

- Personal Development
- Sales
- Customer Experience
- Service
- Device & Equipment
- Hygiene
- Health & Safety
- Occupational Safety
- Management
- Leadership
- Compliance
- Quality
- Onboarding
- Product
- Technology
- Corporate
- Other

Uzun vadede kategori yapısı tenant-configurable olmalıdır. Hard-coded enum genişletmek kalıcı çözüm değildir.

---

## 8. Kurs versiyonlama

Mevcut course version yaklaşımı korunmalıdır.

Örnek:

- Alexandrite Training v1
- Alexandrite Training v2
- Alexandrite Training v3 (current)

Bir personelin geçmiş kaydı hangi course version'ı tamamladığını açıkça göstermelidir.

Yayınlanmış eski versiyon geçmiş kayıtlar için immutable davranmalıdır.

---

## 9. Atama motoru

Mevcut manual ve rule-based assignment altyapısı genişletilmelidir.

Eğitim şu hedeflere atanabilmelidir:

- tek personel
- çoklu personel
- şube
- şirket
- departman
- pozisyon
- rol
- competency gap taşıyan çalışanlar
- yeni işe başlayanlar
- sertifikası sona yaklaşanlar

Toplu atama desteklenmelidir.

Atama kaynakları zamanla aşağıdaki gibi genişleyebilir:

- MANUAL
- QUALITY_RULE
- COMPETENCY_GAP
- DEVELOPMENT_PLAN
- ONBOARDING
- POSITION_CHANGE
- CERTIFICATE_EXPIRY
- DEVICE_AUTHORIZATION
- COMPLIANCE_RULE

Idempotency korunmalıdır; otomasyon aynı eğitimi yanlışlıkla tekrar tekrar atamamalıdır.

---

## 10. Otomatik eğitim kuralları

Mevcut Quality Finding → Training Assignment mekanizması korunmalı ve genel bir training rule engine'e doğru genişletilmelidir.

Örnekler:

`EMPLOYEE_HIRED → onboarding training`

`POSITION_CHANGED → role training`

`COMPETENCY_GAP → corrective training`

`QUALITY_FINDING → remedial training`

`CERTIFICATE_EXPIRING → recertification`

`NEW_DEVICE_ASSIGNED → device training`

Kurallar tenant/company/branch izolasyonunu, cooldown, idempotency ve audit gereksinimlerini korumalıdır.

---

## 11. Learning Paths / Akademiler

Tekil kursların üzerinde curriculum/learning path katmanı oluşturulmalıdır.

Örnek: Yeni Estetisyen Akademisi

1. Şirket Oryantasyonu
2. Hijyen
3. Müşteri İletişimi
4. Cilt Bakımı Temelleri
5. Satış Teknikleri
6. Cihaz Güvenliği
7. Alexandrite Eğitimi
8. Final Değerlendirme

Tamamlandığında rol veya yetkinlik seviyesi üretilebilir.

Rol bazlı learning path örnekleri:

### Şube Müdürü

- Leadership
- People Management
- CRM
- Sales Management
- Financial Basics
- Complaint Handling
- KVKK/Compliance
- Performance Management

### Satış Danışmanı

- Customer Communication
- Needs Analysis
- Consultative Selling
- Package Sales
- CRM Usage
- Objection Handling
- Closing
- Retention

### Estetisyen

- Hygiene
- Customer Safety
- Skin Analysis
- Device Safety
- Device-specific courses
- Service Protocols
- Customer Experience
- Upsell

---

## 12. Ön koşullar ve bağımlılıklar

Kurslar prerequisite desteklemelidir.

Örnek:

`Basic Alexandrite + Safety Training → Advanced Alexandrite`

Learning path üzerinde sıralı veya koşullu ilerleme desteklenebilir.

---

## 13. Kişisel gelişim

Sistem teknik eğitimlerle sınırlı olmamalıdır.

Örnek alanlar:

- iletişim
- zaman yönetimi
- stres yönetimi
- liderlik
- takım çalışması
- problem çözme
- çatışma yönetimi
- sunum
- geri bildirim
- müşteri psikolojisi

Bu eğitimler development plan ve kariyer gelişimiyle ilişkilendirilebilmelidir.

---

## 14. Satış Akademisi

Beauty ERP içerisinde satış performansı ile eğitim arasında güçlü bağ kurulmalıdır.

Örnek kurslar:

- İhtiyaç Analizi
- Paket Sunumu
- Fiyat İtirazı
- Closing
- Upsell
- Cross-sell
- Telefon Satışı
- WhatsApp Satışı
- Lead Follow-up
- Retention

Sadece teori sınavı değil, role-play/practical assessment da desteklenmelidir.

İleride eğitim öncesi/sonrası CRM ve satış KPI'ları karşılaştırılarak training effectiveness ölçülebilir.

---

## 15. Cihaz ve ekipman eğitimi

Bu alan Beauty ERP'nin dikey avantajlarından biri olmalıdır.

Hedef ilişki:

`Device/Equipment → Required Course → Assessment → Competency → Authorization`

Örnek:

`Candela GentleMax Pro → Operator Training → Practical Exam → GentleMax Operator Competency → Authorized`

Device/equipment domain'i mevcut kodda uygulanmadan önce mutlaka incelenmeli ve yeni duplicate cihaz modeli oluşturulmamalıdır.

---

## 16. Hizmet ve cihaz yetkinlik kapısı

Uzun vadede Appointment/Service operasyonuna competency gate bağlanmalıdır.

Örnek:

Bir hizmet şunları gerektiriyor olabilir:

- Alexandrite competency >= 80
- valid certificate
- required hygiene training valid

Personel bu koşulları karşılamıyorsa sistem randevu atamasında uyarı veya policy'ye göre blok uygulayabilir.

Bu davranış configurable policy olmalıdır; tüm tenantlar için hard block varsayılmamalıdır.

---

## 17. Sınav ve soru bankası

Mevcut question bank ve LMS exam yapıları dikkatle konsolide edilmelidir.

Mevcut sistemde eski/temel `/training/quizzes` yaklaşımı ile course-version odaklı LMS exam altyapısının paralel çalıştığı görülmektedir. Yeni üçüncü bir sınav motoru oluşturulmamalıdır.

Hedef model:

`Question Bank → Assessment Definition → Course Version`

Soru türleri en az:

- Single Choice
- Multiple Choice
- True/False

İleride ihtiyaç doğrulanırsa:

- free text
- matching
- ordering
- scenario

şeklinde genişletilebilir.

Assessment tarafında:

- pass score
- attempt limit
- randomization
- question pool
- time limit
- result
- audit

kademeli olarak desteklenebilir.

---

## 18. Pratik değerlendirme

Mevcut practical assessment altyapısı korunmalıdır.

UI tarafında rubric tabanlı değerlendirme yapılmalıdır.

Örnek cihaz uygulama rubriği:

- Cihaz açılışı: 10
- Güvenlik kontrolü: 15
- Cilt değerlendirmesi: 20
- Parametre seçimi: 20
- Uygulama: 25
- İşlem sonrası bakım: 10

Sonuç: örneğin `87/100 – Başarılı`.

Pratik değerlendirme kanıtı, assessor ve timestamp saklanmalıdır.

---

## 19. Yetkinlik yönetimi

Mevcut competency definition/profile/assessment/gap altyapısı korunmalı ve ürünleştirilmelidir.

Önerilen anlaşılır yetkinlik seviyeleri:

- L0 — Yetkin Değil
- L1 — Başlangıç
- L2 — Gözetim Altında
- L3 — Bağımsız Uygulayabilir
- L4 — İleri
- L5 — Eğitmen

Arka planda mevcut 0–100 skor sistemi korunabilir. Level mapping configurable olabilir.

Yetkinlik kanıt kaynakları:

- MANUAL
- EXAM
- PRACTICAL
- TRAINING
- QUALITY
- OBSERVATION
- CERTIFICATE
- EXTERNAL_CERTIFICATION
- MANAGER_ASSESSMENT

Mevcut source type'lar değiştirilmeden önce migration ve compatibility etkisi incelenmelidir.

---

## 20. Yetkinlik profilleri ve Skill Matrix

Pozisyon/rol bazlı required competency profile tanımlanmalıdır.

Örnek Estetisyen profili:

- Hygiene: 90
- Customer Safety: 90
- Skin Analysis: 80
- Customer Communication: 75
- Alexandrite: 80

Skill Matrix ekranında personel × yetkinlik matrisi gösterilmelidir.

Yetersiz alanlar otomatik gap olarak işaretlenmelidir.

---

## 21. Sertifikalar ve recertification

Sertifika modeli aşağıdaki bilgileri desteklemelidir:

- certificateNumber
- employee/staff
- course/courseVersion
- competency
- issuedAt
- expiresAt
- issuer
- score/result
- status

Önerilen durumlar:

- VALID
- EXPIRING
- EXPIRED
- REVOKED

Sertifika süresi sona yaklaşınca otomatik recertification eğitimi atanabilmelidir.

Örnek:

`Certificate Expiring → New Course Assignment → Reminder → Exam/Practical → Renew`

---

## 22. Hijyen, güvenlik ve compliance

Beauty işletmelerinde aşağıdaki alanlar zorunlu eğitim olarak tanımlanabilmelidir:

- hijyen
- sterilizasyon
- dezenfeksiyon
- çapraz bulaş
- atık yönetimi
- cihaz temizliği
- müşteri hazırlığı
- iş güvenliği
- acil durum
- kurum prosedürleri

Kurslarda `mandatory` politikası bulunmalıdır.

Zorunlu eğitim matrisi rol/pozisyona göre oluşturulabilmelidir.

---

## 23. Personel Learning 360

Mevcut personel gelişim dizini genişletilmelidir.

Personel detayında:

- Genel Bakış
- Atanan Eğitimler
- Devam Eden Eğitimler
- Tamamlanan Eğitimler
- Sertifikalar
- Yetkinlikler
- Yetkinlik Açıkları
- Sınavlar
- Pratik Değerlendirmeler
- Gelişim Planı
- Önerilen Eğitimler
- Eğitim/assessment geçmişi

tek bir Learning 360 görünümünde sunulmalıdır.

---

## 24. Individual Development Plan

Mevcut development plan altyapısı korunmalıdır.

Plan, yalnızca kurs item'larından oluşmamalıdır. Gelişim aktiviteleri zamanla şunları destekleyebilir:

- COURSE
- COACHING
- MENTORING
- READING
- PRACTICE
- SHADOWING
- PROJECT
- EXTERNAL_TRAINING

Örnek hedef:

`Senior Estetisyen olmak`

Gap:

- Sales 62 → 80
- Alexandrite 70 → 90
- Customer Communication 75 → 85

Aksiyonlar:

- Advanced Laser Course
- Sales Masterclass
- 2 practical observations
- Manager coaching

---

## 25. Eğitim oturumları ve takvim

Mevcut session/enrollment altyapısı kullanıcıya tam yönetim ekranı olarak açılmalıdır.

Yeni oturum alanları:

- Course/Course Version
- Instructor
- Date
- Start
- End
- Location
- Online meeting link
- Capacity
- Branch/scope

Katılımcı durumları mevcut modele uyumlu şekilde yönetilmeli; gerekirse aşağıdaki business semantics desteklenmelidir:

- Enrolled
- Attended
- Absent
- Completed
- Failed

Takvim filtreleri:

- branch
- instructor
- course
- category
- delivery type

---

## 26. Eğitmen ve assessor yönetimi

Bir personelin eğitim verme veya assessment yapma yetkisi ayrıca tanımlanabilmelidir.

Örnek:

Ayşe, Alexandrite eğitmeni olabilir fakat Sales Academy eğitmeni olmayabilir.

Uzun vadede Instructor Qualification / Assessor Qualification ilişkisi kurulabilir.

---

## 27. Çalışan self-service learning portal

Çalışan için ayrı bir `Eğitimlerim` deneyimi oluşturulmalıdır.

Gösterilecek alanlar:

- Devam Et
- Başlamadın
- Son Tarih
- Tamamlandı
- Sertifikalarım
- Yetkinliklerim
- Önerilen Eğitimler
- Learning Path ilerlemesi

Çalışan sadece yetkisi dahilindeki içeriğe erişmelidir.

---

## 28. Eğitim önerileri

İlk aşamada AI gerekmemektedir.

Deterministik recommendation engine şu girdileri kullanabilir:

- position
- competency gaps
- quality findings
- performance KPI
- development plan
- career goal
- expiring certificate

Örnek:

`Paket satış dönüşüm oranı düşük → İtiraz Yönetimi eğitimi öner`

AI tabanlı öneriler ancak temiz veri, yetki ve güvenlik modeli oturduktan sonra düşünülmelidir.

---

## 29. Eğitim etkinliği ve ROI

İlerleyen aşamada eğitim öncesi/sonrası KPI karşılaştırmaları yapılmalıdır.

Örnek:

`Sales Training → Pre Conversion 18% → Post Conversion 27%`

Training Effectiveness raporları:

- completion rate
- pass rate
- competency uplift
- quality finding reduction
- sales/performance uplift
- recertification compliance

Daha ileri aşamada training cost ve business outcome ilişkisi üzerinden ROI analizi yapılabilir.

---

## 30. Önerilen navigasyon

### EĞİTİM & GELİŞİM

- Genel Bakış

### ÖĞRENME

- Kurslar
- Öğrenme Yolları
- Materyal Kütüphanesi
- Eğitim Takvimi
- Canlı Eğitimler
- Soru Bankası

### YETKİNLİK

- Yetkinlikler
- Yetkinlik Profilleri
- Değerlendirmeler
- Skill Matrix
- Sertifikalar

### PERSONEL GELİŞİMİ

- Personel Gelişim Dizini
- Gelişim Planları
- Koçluk & Mentorluk

### YÖNETİM

- Eğitim Atamaları
- Zorunlu Eğitimler
- Süresi Dolacak Sertifikalar
- Eğitmenler
- Eğitim Kuralları

### ANALİTİK

- Tamamlama
- Başarı
- Yetkinlik Açıkları
- Eğitim Etkinliği
- Şube Karşılaştırmaları

---

## 31. Yetkilendirme hedefi

Mevcut `training.read` / `training.manage` modeli ilk aşamada korunmalıdır. Daha granular permission modeline geçiş compatibility analizi sonrasında yapılmalıdır.

Potansiyel hedefler:

- training.course.read
- training.course.create
- training.course.edit
- training.course.publish
- training.assignment.manage
- training.session.manage
- training.assessment.manage
- training.competency.manage
- training.assessor
- training.analytics.read

Roller örneği:

- L&D Admin
- HR Admin
- Regional Manager
- Branch Manager
- Instructor
- Assessor
- Employee
- Auditor

Permission değişiklikleri mevcut RBAC mimarisi incelenmeden uygulanmamalıdır.

---

## 32. Audit, güvenlik ve izolasyon

Tüm geliştirmelerde mevcut platform ilkeleri korunmalıdır:

- strict tenant isolation
- company isolation
- branch scope
- permission enforcement
- auditability
- idempotency
- concurrency safety
- immutable published history where appropriate
- private material access
- no plaintext secrets

Eğitim sonuçları, assessment ve sertifika gibi kritik kayıtlar destructive olarak silinmemeli; gerekiyorsa revoke/cancel/supersede semantiği kullanılmalıdır.

---

## 33. Entegrasyon hedefleri

### Quality

Mevcut Quality Finding → Training Assignment entegrasyonu korunmalı ve güçlendirilmelidir.

Örnek:

`3 hygiene findings → Mandatory Hygiene Retraining`

### HR

Employee hire, position, role, development plan ve performance süreçleri eğitim motoruna bağlanabilir.

### Appointment / Services

Uzun vadede required competency ve certificate kontrolü yapılabilir.

### Devices / Equipment

Device-specific training ve authorization kurulabilir.

### CRM / Sales

Sales Academy eğitimleri ile conversion, follow-up, retention gibi KPI'lar karşılaştırılabilir.

Bu entegrasyonların hiçbiri ilgili mevcut domain kodu incelenmeden yeni duplicate model yaratılarak yapılmamalıdır.

---

## 34. Geliştirme fazları

### Faz 1 — Course Management & Authoring

Öncelik budur.

- Courses management UI
- Create course
- Course detail
- Edit draft course
- Course versions
- Module/lesson authoring
- Content/material attachment
- Course metadata
- Publish workflow
- Archive/retire
- Existing LMS backend ile UI entegrasyonu

Bu faz tamamlandığında bir müdür/yönetici gerçekten kurs oluşturup yayınlayabilmelidir.

### Faz 2 — Assignment & Learner Experience

- personel/rol/şube bazlı atama
- bulk assignment
- deadlines
- reminders
- employee `Eğitimlerim`
- lesson progress
- course progress
- completion rules

### Faz 3 — Assessment Consolidation

- mevcut quiz ve LMS exam yapılarının detaylı karşılaştırılması
- duplicate assessment davranışlarının kaldırılması
- reusable question bank
- course-version assessments
- attempts
- pass/fail
- practical rubric
- assessor workflows

Yeni üçüncü assessment motoru oluşturulmamalıdır.

### Faz 4 — Competency & Certification

- competency level UX
- role competency profiles
- evidence
- skill matrix
- certificates
- expiry
- recertification
- mandatory compliance training

### Faz 5 — Learning Paths & Development

- curricula / learning paths
- prerequisites
- role academies
- career learning paths
- IDP
- coaching
- mentoring
- non-course development activities

### Faz 6 — Beauty Operations Integration

- service competency requirements
- device competency requirements
- appointment eligibility
- quality-triggered retraining enhancement
- HR/performance integration
- configurable blocking/warning policies

### Faz 7 — Analytics & Intelligence

- completion analytics
- pass/fail analytics
- competency coverage
- compliance readiness
- branch comparison
- training effectiveness
- business KPI uplift
- ROI
- deterministic recommendations
- AI-assisted content/question/recommendation features only after governance is ready

---

## 35. Faz 1 kabul kriterleri

Faz 1 tamamlanmış sayılmadan önce en az şu uçtan uca senaryo çalışmalıdır:

1. `training.manage` veya yeni uygun permission'a sahip yönetici Kurslar ekranını açar.
2. Yeni kurs oluşturur.
3. Kurs metadata'sını kaydeder.
4. Draft course version oluşturur.
5. En az bir modül/ders oluşturur.
6. Text/video/link/document içeriği ekleyebilir.
7. Mevcut assessment altyapısından sınav bağlayabilir veya oluşturabilir.
8. Teorik/pratik başarı kriterlerini belirleyebilir.
9. Kursu publish edebilir.
10. Published version immutable/versioned history semantiğini korur.
11. Kurs assignment için kullanılabilir hale gelir.
12. Tenant/company/branch scope ihlali mümkün değildir.
13. Relevant audit bilgileri korunur.
14. Relevant API tests, typecheck ve lint geçer.

---

## 36. Uygulama prensipleri

- Önce mevcut kodu incele, sonra değişiklik yap.
- Mevcut servis, endpoint, migration veya modeli yeniden oluşturma.
- Büyük yeniden yazımlar yerine incremental geliştirme yap.
- Mevcut LMS engine'i yeniden kullan.
- Question Bank ile LMS assessment yapısını konsolide et; üçüncü motor oluşturma.
- Multi-tenant/company/branch izolasyonunu her sorgu ve mutasyonda koru.
- Published eğitim geçmişini bozma.
- Assessment, competency ve certificate değişikliklerini audit edilebilir tut.
- Otomatik atamalarda idempotency/cooldown/duplicate protection koru.
- UI'de manager ve employee deneyimlerini ayır.
- Güzellik sektörüne özel domain entegrasyonlarını generic LMS çekirdeğinden temiz sınırlarla ayır.

---

## 37. Devam protokolü

Yeni bir ChatGPT/Work/Codex oturumunda geliştirmeye devam edilirken aşağıdaki protokol kullanılmalıdır:

```text
Repository: kaanb-wiascode/beauty
Development branch: feature/core-commerce-foundation

Read /docs/TRAINING-DEVELOPMENT-ROADMAP.md first.
Then inspect the current training/LMS/competency code and recent commits before making changes.
Do not assume roadmap tasks are still incomplete; verify each item in code.
Continue from the first incomplete item in the current phase.
Preserve tenant/company/branch isolation, permissions, auditability, idempotency and concurrency safety.
Do not create duplicate course, LMS, assessment, competency, certificate, document or training services if equivalents already exist.
Pay special attention to the existing legacy quiz/question-bank flow and the newer LMS course-version exam flow; consolidate instead of introducing a third assessment engine.
Reuse the existing Quality → Training automation architecture where appropriate.
Inspect HR, Services/Appointments, Devices/Equipment and Quality domains before adding cross-domain relations.
After each logical increment, run relevant tests, typecheck and lint, then commit to feature/core-commerce-foundation.
Do not merge to main unless explicitly instructed.
Update TRAINING-DEVELOPMENT-ROADMAP.md when a phase, architectural decision or major task materially changes.
```

---

## 38. Hedef sonuç

Eğitim & Gelişim modülünün hedefi şudur:

**İşletmedeki her çalışanın ne öğrenmesi gerektiğini, hangi eğitimi tamamladığını, hangi sınavı geçtiğini, hangi pratik beceriyi kanıtladığını, hangi cihaz veya hizmette yetkin olduğunu, sertifikasının geçerliliğini ve gelişim planını tek zincirde yöneten kurumsal bir Academy ve Competency platformu.**

Beauty ERP açısından nihai fark yaratan zincir:

`Personel → Rol → Gerekli Eğitimler → Learning Path → Assessment → Competency → Certificate → Service/Device Authorization → Quality & Performance`
