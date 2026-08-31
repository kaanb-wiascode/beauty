# Beauty ERP — Product Requirements

> Bu doküman Beauty ERP'nin ürün kapsamını ve temel iş gereksinimlerini tanımlar.
>
> Teknik uygulama detayları bu dokümanda değil, System Architecture ve ilgili teknik dokümanlarda tutulur.

---

# 1. Product Vision

Beauty ERP; güzellik merkezleri, klinikler ve benzeri çok şubeli hizmet işletmelerinin:

- operasyonlarını
- müşterilerini
- çalışanlarını
- randevularını
- satışlarını
- paketlerini
- ödemelerini
- muhasebesini
- stoklarını
- insan kaynaklarını
- bordrosunu
- kalite süreçlerini
- pazarlamasını
- raporlamasını

tek bir sistem üzerinden yönetmesini sağlayan multi-tenant ERP platformudur.

Temel prensip:

> Müşterinin şubeye gelişinden finansal ve operasyonel raporlamaya kadar gerçekleşen gerçek dünya işlemi tek bir güvenilir işlem zinciri olarak takip edilmelidir.

---

# 2. Core Customer Transaction

Temel müşteri işlem zinciri:

```text
Müşteri şubeye geldi
        ↓
Check-in
        ↓
Hizmet aldı
        ↓
Paketinden seans düştü
        ↓
Gerekirse satış / ödeme gerçekleşti
        ↓
Muhasebe kaydı oluştu
        ↓
Stok tüketimi gerçekleşti
        ↓
Müşteriye bildirim gönderildi
        ↓
Raporlara yansıdı
        ↓
Müşteriden geri bildirim istendi
        ↓
Kalite değerlendirmesi
        ↓
Gerekirse Google Review workflow

Bu zincirin mümkün olduğunca otomatik ve tutarlı olması hedeflenmektedir.

3. Multi-Tenant SaaS

Sistem birden fazla işletmeye hizmet verecektir.

Her Tenant:

kendi müşterilerine
kendi çalışanlarına
kendi şubelerine
kendi finansal kayıtlarına
kendi operasyonlarına
kendi raporlarına

sahip olur.

Tenant verileri kesin olarak izole edilmelidir.

4. Organization Management

Sistem aşağıdaki organizasyon yapısını desteklemelidir:

Tenant
│
├── Legal Entity
│
├── Headquarters
│
├── Region
│   └── Branch
│
├── Department
│
├── Employee
│
└── User

Desteklenecek organizasyon ihtiyaçları:

Çoklu tüzel kişilik
Merkez departmanları
Bölge yönetimi
Şube yönetimi
Şube sınıflandırması
Çalışanın birden fazla şubede çalışması
Günlük görevlendirme
Saatlik görevlendirme
Geçici görevlendirme
Vekalet / yetki devri
5. Customer Management

Customer Management sistemin ana domainlerinden biridir.

Müşteri kaydı:

Kimlik bilgileri
İletişim bilgileri
Hizmet geçmişi
Randevu geçmişi
Paketler
Seanslar
Satışlar
Ödemeler
Borçlar
Kampanyalar
Fırsatlar
Geri bildirimler
Şikayetler
Bildirimler
Belgeler

ile ilişkilendirilebilir.

6. Customer Account

Müşterinin sistemde kullanıcı hesabı oluşturulabilmelidir.

Müşteri hesabından:

Randevular
Hizmet geçmişi
Paketler
Kalan seanslar
Ödemeler
Borçlar
Kampanyalar
Fırsatlar
Bildirimler

görülebilmelidir.

7. Appointment Management

Randevu sistemi:

Randevu oluşturma
Randevu değiştirme
Randevu iptali
Randevu onayı
Check-in
Hizmet başlatma
Hizmet tamamlama
No-show
Yeniden planlama

işlemlerini desteklemelidir.

Randevu:

Customer
+
Branch
+
Service
+
Employee
+
Time

ilişkisine sahip olmalıdır.

8. Service Management

İşletme hizmetlerini tanımlayabilmelidir.

Hizmetler:

Kategori
Süre
Fiyat
Personel gereksinimi
Ekipman gereksinimi
Stok tüketimi
Komisyon
Şube kullanılabilirliği

gibi özelliklere sahip olabilir.

9. Package Management

Müşterilere paket satışı yapılabilmelidir.

Örnek:

Laser Package
10 Sessions

Paket:

Satış
Müşteri
Hizmet
Seans
Fiyat
İndirim
Son kullanma tarihi

ile ilişkilidir.

Hizmet tamamlandığında ilgili paket seansı otomatik olarak düşmelidir.

10. Sales Management

Sistem:

Hizmet satışı
Paket satışı
Ürün satışı
İndirim
Kampanya
Taksit
Bakiye

gibi satış senaryolarını desteklemelidir.

Satış ile ödeme birbirinden ayrılmalıdır.

11. Payment Management

Ödeme sistemi:

Nakit
Kart
Banka transferi
Sanal POS
Ödeme linki
Diğer yöntemler

ile çalışabilmelidir.

Desteklenecek işlemler:

Tahsilat
Kısmi ödeme
Taksit
İade
Bakiye
Ödeme doğrulama

Finansal işlemler idempotent ve audit edilebilir olmalıdır.

12. Online Payment

Müşteri online ödeme yapabilmelidir.

Örnek:

Customer
    ↓
Payment Link
    ↓
Secure Payment Page
    ↓
Payment Provider
    ↓
Webhook
    ↓
Payment Confirmation

Ödeme sağlayıcılarından gelen webhook'lar doğrulanmalıdır.

Browser redirect sonucu tek başına ödeme kanıtı olarak kabul edilmemelidir.

13. Accounting

Sistem gerçek muhasebe altyapısına sahip olacak şekilde tasarlanmalıdır.

Planlanan kapsam:

Hesap planı
Yevmiye
Borç / alacak
Cari
Kasa
Banka
Fatura
Tahsilat
Ödeme
Vergi
Finansal raporlama

Satış ve ödeme işlemleri muhasebe süreçleriyle ilişkilendirilebilmelidir.

14. Inventory

Stok sistemi:

Ürün
Depo
Şube stoğu
Stok hareketi
Transfer
Tüketim
İade
Fire
Sayım
Düzeltme

gibi işlemleri desteklemelidir.

Hizmet sırasında kullanılan tüketim ürünleri otomatik stok hareketi oluşturabilmelidir.

15. Service → Stock Automation

Örneğin:

Laser Service Completed
        ↓
Consumable Used
        ↓
Stock Movement
        ↓
Stock -1

Bu hareket hizmet tamamlanmasıyla ilişkilendirilebilir.

16. HR

İnsan kaynakları modülü:

Çalışan
Özlük
Departman
Şube
Görevlendirme
İzin
Puantaj
Performans
İşe giriş
İşten çıkış

süreçlerini desteklemelidir.

17. Payroll

Bordro sistemi gerçek bordro süreçlerini destekleyecek şekilde tasarlanmalıdır.

Planlanan kapsam:

Brüt / net ücret
Prim
Fazla mesai
Kesintiler
İzin
SGK
Vergi
Puantaj
Bordro
İşe giriş / çıkış

Türkiye mevzuatına ilişkin gereksinimler ayrıca doğrulanacaktır.

18. CRM

CRM:

Lead
Customer
Opportunity
Campaign
Follow-up
Customer history

süreçlerini kapsamalıdır.

Müşteri hizmet aldıktan sonra yeni satış fırsatları oluşturulabilmelidir.

19. Marketing

Marketing sistemi:

Kampanya
Segment
Teklif
İndirim
Müşteri hedefleme
Bildirim
Follow-up

özelliklerini desteklemelidir.

20. Customer Feedback

Hizmet tamamlandıktan sonra müşteriden mümkün olduğunca hızlı geri bildirim alınmalıdır.

Temel akış:

Service Completed
       ↓
Feedback Request
       ↓
Customer
       ↓
Feedback

Feedback:

Genel memnuniyet
Hizmet kalitesi
Personel deneyimi
Bekleme süresi
Hijyen
Şube deneyimi

gibi başlıkları içerebilir.

21. Instant Feedback

Geri bildirim mümkün olduğunca işlem sonrasında hızlı şekilde alınmalıdır.

Amaç:

Müşterinin deneyimini olayın hemen sonrasında ölçmek.

Bu nedenle feedback request notification sistemiyle ilişkilendirilecektir.

22. Quality Management

Olumsuz veya kritik geri bildirimler kalite departmanına aktarılabilmelidir.

Akış:

Feedback
    ↓
Evaluation
    ↓
Quality Case
    ↓
Quality Department
    ↓
Investigation
    ↓
Resolution
    ↓
Customer Follow-up

Quality Case:

Şube
Çalışan
Hizmet
Müşteri
Kategori
Öncelik
Durum
Sorumlu kişi
Çözüm

ile ilişkilendirilebilir.

23. Google Review Workflow

Müşteri geri bildirimleri uygun kurallar doğrultusunda Google yorum sürecine yönlendirilebilmelidir.

Örnek:

Service Completed
        ↓
Feedback
        ↓
Review Decision
        ↓
Google Review Workflow

Bu süreçte müşteri iradesi ve ilgili platform kuralları dikkate alınmalıdır.

Sistem müşteriyi manipüle edecek veya sahte yorum oluşturacak şekilde tasarlanmamalıdır.

24. Notifications

Bildirim sistemi:

In-app
Push
Email
SMS
WhatsApp

kanallarını destekleyebilecek şekilde tasarlanmalıdır.

Bildirim örnekleri:

Randevu oluşturuldu
Randevu değiştirildi
Randevu hatırlatması
Ödeme alındı
Paket seansı düştü
Hizmet tamamlandı
Geri bildirim isteği
Kampanya
Kalite takibi
25. Reporting

Raporlama:

Şube
Bölge
Çalışan
Hizmet
Satış
Ödeme
Stok
Muhasebe
Müşteri
Kalite
Kampanya

bazında yapılabilmelidir.

Raporlar kullanıcının authorization scope'una uymalıdır.

26. Management Dashboard

Yönetim için özet KPI'lar sağlanmalıdır.

Örnek:

Günlük ciro
Aylık ciro
Şube performansı
Bölge performansı
Personel performansı
Müşteri sayısı
Yeni müşteri
Tekrar gelen müşteri
Paket satışı
Seans kullanımı
Tahsilat
Stok durumu
Memnuniyet
Kalite vakaları
27. Audit

Kritik işlemler audit edilebilmelidir.

Özellikle:

Ödeme
İade
Muhasebe
Yetki değişikliği
Çalışan değişikliği
Stok düzeltmesi
Veri importu
Müşteri verisi değişiklikleri

izlenmelidir.

28. Data Migration

Eski sistemlerden veri aktarımı desteklenmelidir.

Kaynaklar:

CSV
Excel
API
Database
CRM
ERP

Migration süreci:

Import
 ↓
Mapping
 ↓
Validation
 ↓
Preview
 ↓
Approval
 ↓
Execution
 ↓
Audit

şeklinde çalışmalıdır.

29. Integrations

Sistem entegrasyonlara açık olmalıdır.

Planlanan entegrasyon kategorileri:

Ödeme
Google
WhatsApp
SMS
Email
E-imza
Sosyal medya
Harici CRM
Harici ERP
Muhasebe sistemleri

Provider-specific kodlar business logic'e gömülmemelidir.

30. Localization

İlk hedef pazar:

Türkiye

İlk dil:

tr-TR

Ancak mimari:

Multi-language
Multi-currency
Localization

destekleyecek şekilde hazırlanmalıdır.

31. Web / Mobile

Ürün:

Web
+
iOS
+
Android

kanallarından kullanılabilir olmalıdır.

Tüm client'lar aynı backend business logic'ini kullanmalıdır.

32. Security Requirements

Minimum güvenlik gereksinimleri:

Authentication
Authorization
Tenant isolation
Input validation
Rate limiting
Secure secrets
Audit logging
Encryption
Access control
Sensitive data protection
33. Performance Requirements

Sistem:

Normal kullanıcı işlemlerinde düşük latency
Büyük raporlarda asynchronous processing
Büyük importlarda background processing
Cache gereken alanlarda Redis
Uzun işlemlerde queue

kullanacak şekilde tasarlanmalıdır.

34. Reliability Requirements

Kritik işlemler:

Payment
Accounting
Inventory
Package sessions

tutarlı şekilde çalışmalıdır.

Aynı işlemin iki kez uygulanması engellenmelidir.

35. MVP Principle

İlk hedef:

Gerçek bir müşterinin günlük operasyonunu uçtan uca yönetebilen çalışan bir Beauty ERP MVP'si.

MVP'de her modülün tüm ileri özellikleri bulunmak zorunda değildir.

Ancak çekirdek transaction zinciri güvenilir olmalıdır.

36. Core MVP Transaction

MVP'nin en önemli akışı:

Customer
 ↓
Appointment
 ↓
Check-in
 ↓
Service
 ↓
Package Session / Sale
 ↓
Payment
 ↓
Inventory
 ↓
Accounting
 ↓
Notification
 ↓
Feedback
 ↓
Quality / Review
 ↓
Reporting

Bu zincir sistemin temel değer önerisidir.

37. Product Success Criteria

MVP'nin başarılı kabul edilmesi için:

Şube günlük operasyonu sistem üzerinden yürütülebilmeli.
Müşteri hizmet geçmişi görülebilmeli.
Paket seansı doğru düşmeli.
Ödeme doğru kaydedilmeli.
Stok hareketi oluşmalı.
Muhasebe bağlantısı kurulmalı.
Müşteriye bildirim gönderilebilmeli.
Hizmet sonrası feedback alınabilmeli.
Kritik feedback kaliteye aktarılabilmeli.
Sonuç raporlara yansıyabilmeli.
38. Non-Functional Principle

Fonksiyonların yanında sistem:

Güvenli
İzlenebilir
Test edilebilir
Ölçeklenebilir
Dokümante edilebilir
Bakımı kolay
Multi-tenant güvenli

olmalıdır.

39. Product Evolution

Ürün aşağıdaki sırayla büyütülebilir:

Core Operations
      ↓
CRM
      ↓
Finance / Accounting
      ↓
HR / Payroll
      ↓
Inventory
      ↓
Quality
      ↓
Marketing
      ↓
Advanced Analytics
      ↓
Integrations
      ↓
AI / Automation

Bu sıra ihtiyaçlara göre değişebilir.

40. Product Principle

Beauty ERP'nin temel ürün prensibi:

Bir işlemi sisteme kaydetmek yeterli değildir; o işlemin işletmenin diğer süreçlerine doğru şekilde yansımasını sağlamak gerekir.

Örneğin:

Service Completed

sadece bir "hizmet tamamlandı" kaydı değildir.

Bunun sonucunda gerektiğinde:

Package
Inventory
Finance
Accounting
Notification
Feedback
Quality
Reporting

etkilenmelidir.