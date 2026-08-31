# Beauty ERP — Project Context

## 1. Project Identity

**Product Name:** Beauty ERP

**Product Type:** SaaS-based CRM & ERP platform

**Initial Market:** Türkiye

**Future Market:** International / multi-country

**Target Businesses:**

- Güzellik merkezleri
- Estetik merkezleri
- Medikal estetik merkezleri
- Estetik klinikleri
- Klinik ve benzeri hizmet işletmeleri

---

# 2. Product Vision

Beauty ERP; güzellik, estetik, medikal estetik ve benzeri hizmet işletmelerinin müşteri ilişkileri, operasyon, insan kaynakları, finans, muhasebe, satın alma, stok, kalite, eğitim, kurumsal iletişim ve yönetim süreçlerini tek bir platform üzerinden yönetmesini sağlayan kapsamlı bir SaaS CRM & ERP ürünüdür.

Ürün yalnızca bir CRM olarak tasarlanmayacaktır.

Ana hedef:

> İşletmenin müşteriyle ilk temasından hizmet satışına, randevudan uygulamaya, tahsilattan muhasebe kaydına, stok hareketinden personel performansına, kalite kontrolünden yönetsel raporlamaya kadar tüm operasyonel ve idari süreçlerini tek bir sistem altında yönetmek.

---

# 3. SaaS Business Model

Beauty ERP paketler ve abonelikler üzerinden sunulacaktır.

Her abonelik sahibi işletme kendi izole CRM/ERP ortamına sahip olacaktır.

Temel yapı:

```text
Beauty ERP Platform
        |
        +-- Tenant A
        |
        +-- Tenant B
        |
        +-- Tenant C
        |
        +-- Tenant N

    Her Tenant:

Kendi işletme verilerine sahip olacaktır.
Kendi kullanıcılarını yönetecektir.
Kendi şubelerini yönetecektir.
Kendi müşterilerini yönetecektir.
Kendi finansal ve operasyonel kayıtlarına sahip olacaktır.
Başka tenantların verilerine erişemeyecektir.
4. Multi-Tenant Architecture

Sistem multi-tenant olarak tasarlanacaktır.

Tenant sistemde temel organizasyon sınırıdır.

Bir tenant:

Bir veya daha fazla tüzel kişiliğe sahip olabilir.
Genel merkez yapısına sahip olabilir.
Birden fazla bölgeye sahip olabilir.
Birden fazla şubeye sahip olabilir.
Merkez departmanlarına sahip olabilir.
Şube bazlı birimlere sahip olabilir.
Çok sayıda çalışan ve kullanıcı barındırabilir.

Tenant izolasyonu sistemin en önemli güvenlik prensiplerinden biridir.

Hiçbir kullanıcı veya operasyonel süreç yetkisi dışında başka bir tenantın verisine erişememelidir.

5. Legal Entity Structure

Bir işletme tek bir tüzel kişilikle sınırlı değildir.

Bir Tenant altında birden fazla şirket / tüzel kişilik bulunabilir.

Örnek:
Tenant
 |
 +-- Legal Entity A
 |     +-- Branch 1
 |     +-- Branch 2
 |
 +-- Legal Entity B
 |     +-- Branch 3
 |     +-- Branch 4
 |
 +-- Legal Entity C
       +-- Branch 5

Muhasebe, finans, vergi, faturalama ve benzeri süreçlerde tüzel kişilik ayrımı korunacaktır.

6. Organizational Structure

Beauty ERP aşağıdaki organizasyon yapısını desteklemelidir:
Tenant
 |
 +-- Legal Entities
 |
 +-- Headquarters
 |
 +-- Regions
 |     |
 |     +-- Branches
 |
 +-- Central Departments
 |
 +-- Employees
 |
 +-- Users
 |
 +-- Roles
 |
 +-- Permissions
 Regions

Bölgeler;

Şube büyüklüğü
Kazanç / performans
Lokasyon
Operasyonel yapı
Yönetim kapasitesi

gibi kriterlere göre oluşturulabilir.

Bölge müdürü ataması yapılırken sistem, ilgili bölgenin kapsamı ve işletmenin belirlediği kriterler doğrultusunda yöneticinin yetkinliğinin yeterli olup olmadığını kontrol edebilecek şekilde tasarlanmalıdır.

7. Branch Structure

Şubeler kendi operasyonel alanlarını yönetir.

Şube kullanıcıları yetkileri dahilinde yalnızca:

Kendi şube verilerini
Kendilerine atanmış operasyonları
Yetkilendirildikleri diğer şubeleri

görebilir ve yönetebilir.

Merkez yöneticileri ise sahip oldukları yetkiye göre:

Tüm işletmenin toplam verilerini
Bölgesel verileri
Şube bazlı verileri
Karşılaştırmalı verileri

görebilir.

8. Employee Structure

Bir çalışan tek bir şubeye bağlı olmak zorunda değildir.

Bir çalışan:

Birincil şubeye
Bir veya daha fazla ikincil şubeye
Geçici görev yaptığı şubelere

sahip olabilir.

Bir çalışanın farklı şubelerde:

Günlük
Saatlik
Geçici
Denetim
Yönetici görevlendirmesi

ile çalışması desteklenmelidir.

Örneğin bir doktor veya estetisyen ana şubesi dışında başka bir şubede belirli bir tarih/saat aralığında görevlendirilebilir.

9. Primary / Secondary Branch

Kullanıcının ve çalışanın organizasyon bağlamında:

Primary Branch
Secondary Branches

bilgileri bulunabilir.

Primary Branch çalışanın temel organizasyon merkezidir.

Secondary Branch ilişkileri çalışanın diğer operasyonel çalışma alanlarını temsil eder.

Bu ilişkiler yetkilendirme sisteminde kullanılacaktır.

10. Temporary Assignment and Delegation

Sistem geçici yetkilendirme ve görev devrini desteklemelidir.

Örnek nedenler:

Yıllık izin
Doğum izni
Haftalık izin
Hastalık / rapor
İşten ayrılma
Geçici görev
Yönetici ataması
Deneme süresi
Vekalet
Şube değişikliği
Bölge değişikliği

Genel Müdür ve İnsan Kaynakları yetkileri kapsamında bu atama ve vekaletleri yönetebilmelidir.

11. User Model

Çalışan ile kullanıcı aynı kavram değildir.

Sistem:Employee
    |
    +-- User Account

ilişkisini destekleyecektir.

Her çalışan için kullanıcı hesabı oluşturulabilir.

Ancak kullanıcılar yalnızca departman bazlı olmayacaktır.

Sistem:

Departmana bağlı kullanıcılar
Departmandan bağımsız kullanıcılar
Yönetici kullanıcılar
Bölge yöneticileri
Şube yöneticileri
Operasyon kullanıcıları
Sistem yöneticileri
Müşteri kullanıcıları

gibi farklı kullanıcı yapılarını desteklemelidir.

12. Authorization Principle

Yetkilendirme yalnızca "rol" üzerinden yapılmayacaktır.

Yetkilendirme aşağıdaki unsurların birleşimine dayanacaktır:User
 +
Role
 +
Permission
 +
Tenant
 +
Legal Entity
 +
Region
 +
Branch
 +
Department
 +
Assignment
 +
Temporary Scope
Bir kullanıcının sahip olduğu rol, sistemdeki tüm verilere otomatik erişim anlamına gelmez.

Örneğin bir Bölge Müdürü:

Sorumlu olduğu bölgeleri
O bölgelerdeki şubeleri
Kendisine atanmış operasyonları

görebilir.

Ancak işletmenin tamamına otomatik erişemez.

13. Core Management Roles

Sistem başlangıçta aşağıdaki yönetim yapılarını destekleyecek şekilde tasarlanacaktır:

Genel Müdür
Bölge Müdürü
İşletme Müdürü
İnsan Kaynakları Müdürü
Muhasebe Müdürü
Eğitim Müdürü
Hijyen / Kalite Müdürü
Kurumsal İletişim Müdürü
Şube Müdürü
Resepsiyonist
Estetisyen
Doktor
Mutfak Personeli
Diğer merkez departman çalışanları

Bu liste sistemin sabit rol listesi değildir.

İşletmeler kendi rollerini ve yetkilerini oluşturabilmelidir.

14. CRM

CRM sistemi aşağıdaki süreçleri desteklemelidir:

Müşteri kaydı
Müşteri profili
Müşteri iletişim bilgileri
Müşteri geçmişi
Randevular
Hizmet geçmişi
Paketler
Seanslar
Satışlar
Ödemeler
Kalan bakiyeler
Kampanyalar
Fırsatlar
Müşteri geri bildirimleri
Reaksiyon / vaka kayıtları
Personel hizmet geçmişi
Müşteri iletişim geçmişi
15. Customer Portal

Müşteriler de sisteme kullanıcı olarak dahil olabilir.

Müşteri hesabı, hizmet satın alma sonrasında ilgili şube kullanıcısı tarafından oluşturulabilir.

Müşteri kendi portalından:

Profil bilgilerini
İşlem geçmişini
Hizmet geçmişini
Hizmeti uygulayan personeli
Paketlerini
Kalan seanslarını
Ödeme geçmişini
Kalan borçlarını
Kampanyalarını
Fırsatlarını
Randevularını
Randevu değiştirme taleplerini
Randevu erkene alma / erteleme işlemlerini
Online ödemelerini

yönetebilmelidir.

İleride ek müşteri özellikleri geliştirilebilir.

16. Operational Workflow

Temel operasyonel akış:

Müşteri şubeye geldi
        ↓
Hizmet aldı
        ↓
Paketinden seans düştü
        ↓
Ödeme yaptı
        ↓
Muhasebe kaydı oluştu
        ↓
Stok düştü
        ↓
Müşteriye bildirim gitti
        ↓
Geri bildirim istendi
        ↓
Kalite sürecine aktarıldı
        ↓
Google yorum süreci tetiklenebilir
        ↓
Raporlara yansıdı

Bu akış sistemin temel business workflow'larından biridir.

17. Customer Feedback & Quality

Hizmet tamamlandıktan sonra müşteriden mümkün olduğunca hızlı geri bildirim alınabilmelidir.

Geri bildirimler:

Hizmet
Personel
Şube
Hijyen
Memnuniyet
Bekleme süresi
Uygulama deneyimi
Reaksiyon
Şikayet
Öneri

gibi alanlara ayrılabilir.

Olumlu geri bildirimler, uygun kurallar dahilinde Google yorum sürecine yönlendirilebilir.

Olumsuz veya kritik geri bildirimler kalite departmanına vaka olarak aktarılabilir.

18. ERP Modules

Beauty ERP sadece CRM değildir.

Planlanan ana ERP alanları:

İnsan Kaynakları
Bordro
Muhasebe
Finans
Satın Alma
Stok
Depo
Eğitim
Kalite
Hijyen
Operasyon
Kurumsal İletişim
PR
Sosyal Medya
Görev Yönetimi
Teknik Operasyon
Bilgi İşlem
Kargo
Dış Satın Alma
Raporlama
19. Full Accounting

Sistem gerçek muhasebe altyapısına sahip olacak şekilde tasarlanacaktır.

Muhasebe modülü:

Hesap planı
Yevmiye kayıtları
Borç / alacak
Cari hesaplar
Kasa
Banka
Fatura
Tahsilat
Ödeme
Vergi
Finansal raporlar
Tüzel kişilik bazlı muhasebe

gibi süreçleri desteklemelidir.

20. Real Payroll

Bordro sistemi gerçek bordro süreçlerini destekleyecek şekilde tasarlanacaktır.

Kapsam:

Personel ücretleri
Bordro
Prim
Kesintiler
İzinler
Fazla mesai
Puantaj
SGK süreçleri
Vergi süreçleri
Özlük bilgileri
İşe giriş
İşten çıkış

Türkiye mevzuatına uygunluk ayrıca ele alınacaktır.

21. Payments

Online ödeme altyapısı sistemin temel parçalarından biridir.

Desteklenmesi planlanan yöntemler:

Sanal POS
Ödeme linki
Online müşteri tahsilatı
Kalan bakiye ödemesi
Paket ödemesi
Randevu / hizmet ödemesi

Ödeme sağlayıcıları sisteme entegrasyon katmanı üzerinden bağlanacaktır.

22. Integrations

Entegrasyon altyapısı baştan tasarlanacaktır.

Planlanan entegrasyonlar:

WhatsApp
Google Calendar
Google Drive
E-posta
Online sözleşme / elektronik imza
Sanal POS
Ödeme sağlayıcıları
Google yorumları
Sosyal medya
Gelecekte diğer üçüncü taraf servisler

Entegrasyonlar doğrudan business logic içine gömülmeyecek, ayrı bir integration architecture üzerinden yönetilecektir.

23. Data Migration

Başka CRM veya ERP sistemlerinden Beauty ERP'ye veri aktarımı desteklenmelidir.

Migration sistemi:

Existing System
      ↓
Import
      ↓
Validation
      ↓
Mapping
      ↓
Transformation
      ↓
Preview
      ↓
Approval
      ↓
Import
      ↓
Audit

Desteklenebilecek kaynaklar:

Excel
CSV
API
Veritabanı
Diğer CRM/ERP sistemleri

Migration işlemlerinin tamamı loglanmalı ve mümkün olduğunca geri alınabilir şekilde tasarlanmalıdır.

24. Reporting

Raporlama sistemin kritik parçalarından biridir.

İlk hedef en az 70 farklı rapor türünü desteklemektir.

Raporlar:

Tarih
Şube
Bölge
Tüzel kişilik
Departman
Personel
Hizmet
Ürün
Müşteri
Ödeme
Gelir
Gider
Randevu
Paket
Seans
Performans
Stok
Satın alma
Finans
İnsan kaynakları
Kalite

gibi filtrelerle oluşturulabilmelidir.

Kullanıcı yalnızca yetkisi dahilindeki veriler üzerinden rapor oluşturabilir.

25. Multi-Language

İlk pazar Türkiye'dir.

Ancak sistem başlangıçtan itibaren çoklu dil desteklemelidir.

İlk dil:

tr-TR

Gelecekte:

İngilizce
Arapça
Almanca
Diğer diller

eklenebilir.

Metinler kod içine sabitlenmemelidir.

26. Multi-Currency

Sistem çoklu para birimini desteklemelidir.

Her tenant ve tüzel kişilik için para birimi kuralları bulunabilir.

İşlemlerde:

İşlem para birimi
Ana para birimi
Kur
Kur tarihi
Kur kaynağı

gibi bilgiler gerektiğinde saklanabilmelidir.

27. Platforms

Beauty ERP responsive web application olarak geliştirilecektir.

Aynı backend ve business logic altyapısını kullanacak:

Web
iOS
Android

platformları desteklenecektir.

Mobil uygulama özellikle:

Personel
Yönetici
Şube
Müşteri

kullanım senaryolarını destekleyecek şekilde tasarlanacaktır.

28. Security Principles

Sistem aşağıdaki prensipleri temel almalıdır:

Tenant isolation
Least privilege
Role-based access control
Permission-based authorization
Scope-based authorization
Audit logging
Secure authentication
Session management
Encryption
Sensitive data protection
Rate limiting
Input validation
Secure integrations

Özellikle finansal, müşteri ve personel verileri yüksek güvenlik seviyesinde korunmalıdır.

29. Development Philosophy

Beauty ERP:

Önce sağlam çekirdek + gerçek müşterinin kullanabileceği MVP → sonra modüler büyüme

prensibiyle geliştirilecektir.

İlk hedef devasa bir ERP'nin tüm özelliklerini aynı anda tamamlamak değildir.

İlk hedef:

Sağlam mimari
Güvenli multi-tenancy
Güçlü identity & authorization
Gerçek CRM
Gerçek randevu / hizmet akışı
Gerçek satış / ödeme akışı
Temel stok
Temel finans / muhasebe
Kullanılabilir müşteri portalı
Gerçek müşterinin kullanabileceği MVP

oluşturmaktır.

Daha sonra modüller kontrollü şekilde genişletilecektir.

30. Architecture Principles

Beauty ERP geliştirilirken:

Domain-driven tasarım prensiplerinden yararlanılacaktır.
Business logic controller'lara yazılmayacaktır.
Modüller birbirine doğrudan bağımlı hale getirilmeyecektir.
Tenant sınırı her kritik veri işleminde korunacaktır.
Authorization business logic'in ayrılmaz parçasıdır.
Harici entegrasyonlar abstraction üzerinden yapılacaktır.
Auditability temel prensiptir.
Finansal işlemler değiştirilebilir sıradan kayıtlar olarak tasarlanmayacaktır.
Migration işlemleri kontrollü ve izlenebilir olacaktır.
Production ortamı için güvenlik ve gözlemlenebilirlik sonradan eklenen özellikler olmayacaktır.
31. Project Memory Protocol

Bu proje dokümantasyonu geliştirme sürecinin bir parçasıdır.

Önemli mimari veya ürün kararları:

docs/17-DECISIONS.md

dosyasına kaydedilecektir.

Mevcut proje durumu:

docs/state/CURRENT-STATE.md

dosyasında tutulacaktır.

Proje yol haritası:

docs/roadmap/

altında tutulacaktır.

Her önemli milestone sonrasında:

Kod doğrulanır.
Testler çalıştırılır.
Git checkpoint oluşturulur.
CURRENT-STATE.md güncellenir.
Gerekli architecture decision kayıtları güncellenir.

Yeni bir çalışma oturumunda önce:

docs/state/CURRENT-STATE.md
docs/17-DECISIONS.md

okunmalı ve mevcut state üzerinden devam edilmelidir.

Tamamlanmış çalışmalar gereksiz yere yeniden uygulanmamalıdır.
