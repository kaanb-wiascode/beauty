# Beauty ERP — Architecture & Product Decisions

> Bu dosya Beauty ERP geliştirme sürecinde alınmış önemli ürün, mimari ve teknik kararların kalıcı kaydıdır.
>
> Bir karar değiştirilecekse mevcut kayıt silinmez. Yeni bir karar oluşturulur ve eski kararın durumu güncellenir.

---

# Decision Status

Kullanılabilecek durumlar:

- `ACCEPTED` — Karar kabul edildi ve geçerli.
- `PROPOSED` — Önerildi fakat henüz kesinleşmedi.
- `SUPERSEDED` — Daha yeni bir kararla değiştirildi.
- `REJECTED` — Değerlendirildi fakat kabul edilmedi.

---

# DEC-001 — Multi-Tenant Architecture

**Status:** ACCEPTED

**Decision:**

Beauty ERP multi-tenant SaaS mimarisiyle geliştirilecektir.

Her müşteri işletme ayrı bir Tenant olarak modellenir.

Tenantlar birbirlerinin verilerine erişemez.

**Reason:**

Ürünün SaaS olarak birden fazla işletmeye hizmet vermesi ve veri izolasyonunun temel güvenlik sınırı olması.

---

# DEC-002 — Multiple Legal Entities per Tenant

**Status:** ACCEPTED

**Decision:**

Bir Tenant birden fazla tüzel kişiliğe sahip olabilir.

```text
Tenant
 ├── Legal Entity A
 ├── Legal Entity B
 └── Legal Entity C

Reason:

Aynı işletme grubunun birden fazla şirket / tüzel kişilik üzerinden operasyon yürütmesine izin vermek.

Impact:

Muhasebe, finans, faturalama ve vergi süreçleri tüzel kişilik sınırını dikkate almalıdır.

DEC-003 — Employee and User Are Separate Entities

Status: ACCEPTED

Decision:

Employee ve User aynı entity değildir.

Employee
    ↓
User Account

Bir çalışan kullanıcı hesabına sahip olabilir; ancak çalışan kaydı ile kullanıcı hesabı farklı sorumluluklara sahiptir.

Reason:

İnsan kaynakları bilgileri ile sistem erişim kimliğini birbirinden ayırmak.

DEC-004 — Customer Can Be a User

Status: ACCEPTED

Decision:

Müşteriler Beauty ERP içerisinde kullanıcı hesabına sahip olabilir.

Müşteri hesabı hizmet satın alma sonrasında ilgili şube kullanıcısı tarafından oluşturulabilir.

Reason:

Müşterinin kendi:

Hizmet geçmişine
Ödeme geçmişine
Paketlerine
Kalan seanslarına
Kampanyalarına
Randevularına
Online ödemelerine

erişebilmesi.

DEC-005 — Employee Can Work at Multiple Branches

Status: ACCEPTED

Decision:

Bir çalışan yalnızca tek bir şubeye bağlı olmak zorunda değildir.

Bir çalışan:

Primary Branch
Secondary Branches
Temporary Assignments

üzerinden birden fazla şubede görev yapabilir.

Reason:

Özellikle doktor, estetisyen ve yöneticilerin birden fazla lokasyonda çalışabilmesi.

DEC-006 — Primary and Secondary Branch

Status: ACCEPTED

Decision:

Çalışanların organizasyonel bağlamında Primary Branch ve Secondary Branch ilişkileri desteklenecektir.

Reason:

Çalışanın ana çalışma merkezini ve diğer çalışma alanlarını ayırmak.

DEC-007 — Temporary Assignment

Status: ACCEPTED

Decision:

Çalışanların belirli tarih ve/veya saat aralıklarında geçici olarak başka şubelere veya operasyonlara atanabilmesi desteklenecektir.

Examples:

Geçici görev
Denetim
Yönetici görevlendirmesi
Şube desteği
Doktor görevlendirmesi
Estetisyen görevlendirmesi
DEC-008 — Delegation and Proxy

Status: ACCEPTED

Decision:

Vekalet ve geçici yetki devri sistemin temel authorization yapısının parçası olacaktır.

Yetki devri belirli:

Kullanıcı
Rol
Permission
Scope
Başlangıç tarihi
Bitiş tarihi
Sebep

ile sınırlandırılabilir.

Authorized Roles:

Başlangıçta özellikle:

Genel Müdür
İnsan Kaynakları

yetkileri kapsamında değerlendirilecektir.

DEC-009 — Role Is Not Enough for Authorization

Status: ACCEPTED

Decision:

Yetkilendirme yalnızca role göre yapılmayacaktır.

Authorization aşağıdaki bağlamları dikkate alabilir:

User
Role
Permission
Tenant
Legal Entity
Region
Branch
Department
Assignment
Temporary Scope

Reason:

Örneğin bir Bölge Müdürünün yalnızca sorumlu olduğu bölgedeki şubelere erişebilmesi.

DEC-010 — Region Structure

Status: ACCEPTED

Decision:

Tenant altında Region yapısı desteklenecektir.

Bölgeler:

Şube büyüklüğü
Kazanç / performans
Lokasyon
Operasyonel yapı

gibi işletme tarafından belirlenen kriterlere göre oluşturulabilir.

DEC-011 — Region Manager Adequacy Check

Status: ACCEPTED

Decision:

Bölge Müdürü atamasında sistem, işletmenin belirlediği kriterlere göre ilgili kişinin bölgenin sorumluluğu için yeterli olup olmadığını değerlendirebilecek bir altyapıya sahip olacaktır.

Reason:

Bölgenin büyüklüğü, şube sayısı, kazanç seviyesi ve lokasyon özellikleri yöneticinin sorumluluk kapasitesiyle ilişkilendirilebilmelidir.

DEC-012 — Central Departments and Branch Units

Status: ACCEPTED

Decision:

Şube operasyon birimleri ile merkez departmanları birbirinden ayrılacaktır.

Branch-level examples:

Estetisyenler
Resepsiyonistler
Şube Müdürleri
Mutfak Personelleri

Diğer departmanlar gerektiğinde merkez organizasyonunda bulunabilir.

DEC-013 — Daily and Hourly Assignment

Status: ACCEPTED

Decision:

Çalışanların şubelere günlük veya saatlik atanabilmesi desteklenecektir.

Bu atamalar yönetici ve İnsan Kaynakları tarafından oluşturulabilir.

DEC-014 — Full Accounting

Status: ACCEPTED

Decision:

Beauty ERP yalnızca gelir/gider takibi yapan basit bir finans modülü olmayacaktır.

Gerçek muhasebe altyapısı tasarlanacaktır.

Planned scope:

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
DEC-015 — Real Payroll

Status: ACCEPTED

Decision:

Beauty ERP gerçek bordro süreçlerini destekleyecek şekilde tasarlanacaktır.

Planned scope:

Puantaj
Ücret
Prim
Fazla mesai
İzin
Kesintiler
SGK
Vergi
İşe giriş
İşten çıkış
Özlük

Türkiye mevzuatı ayrıca ele alınacaktır.

DEC-016 — Integration Architecture

Status: ACCEPTED

Decision:

Entegrasyon altyapısı ürünün temel mimarisinde hazırlanacaktır.

Üçüncü taraf servisler doğrudan business logic içerisine gömülmeyecektir.

Planned integrations:

Ödeme sağlayıcıları
Sanal POS
Ödeme linkleri
WhatsApp
Google
E-posta
Elektronik imza
Sosyal medya
Diğer üçüncü taraf sistemler
DEC-017 — Online Payment Infrastructure

Status: ACCEPTED

Decision:

Sistem online ödeme alabilecek şekilde tasarlanacaktır.

Desteklenecek temel yöntemler:

Sanal POS
Ödeme linki
Müşteri bakiye ödemesi
Paket ödemesi
Hizmet ödemesi
DEC-018 — Customer Feedback

Status: ACCEPTED

Decision:

Hizmet tamamlandıktan sonra müşteriden mümkün olduğunca hızlı geri bildirim alınacaktır.

Geri bildirimler kalite süreçleriyle ilişkilendirilecektir.

DEC-019 — Google Review Workflow

Status: ACCEPTED

Decision:

Müşteri geri bildirimleri uygun kurallar çerçevesinde Google yorum sürecine yönlendirilebilecek şekilde tasarlanacaktır.

Olumlu ve olumsuz geri bildirimler farklı operasyonel akışlara sahip olabilir.

DEC-020 — Quality Escalation

Status: ACCEPTED

Decision:

Olumsuz, kritik veya belirli eşiklerin altındaki müşteri geri bildirimleri kalite departmanına vaka olarak aktarılabilecektir.

DEC-021 — Data Migration

Status: ACCEPTED

Decision:

Mevcut CRM / ERP sistemlerinden Beauty ERP'ye veri aktarımı desteklenecektir.

Desteklenmesi planlanan kaynaklar:

CSV
Excel
API
Database
Diğer CRM / ERP sistemleri

Migration süreci validation, mapping, preview ve audit aşamalarına sahip olmalıdır.

DEC-022 — Multi-Language

Status: ACCEPTED

Decision:

İlk pazar Türkiye olmasına rağmen sistem başlangıçtan itibaren multi-language destekleyecek şekilde tasarlanacaktır.

İlk dil:

tr-TR
DEC-023 — Multi-Currency

Status: ACCEPTED

Decision:

Beauty ERP multi-currency destekleyecektir.

İşlemlerde gerektiğinde:

İşlem para birimi
Ana para birimi
Kur
Kur tarihi
Kur kaynağı

saklanabilecektir.

DEC-024 — Web + iOS + Android

Status: ACCEPTED

Decision:

Ürün responsive web uygulaması olarak geliştirilecek ve aynı backend/business logic altyapısıyla iOS ve Android uygulamaları desteklenecektir.

DEC-025 — Strong Core Before Modular Expansion

Status: ACCEPTED

Decision:

Beauty ERP önce sağlam çekirdek ve gerçek müşterinin kullanabileceği MVP olarak geliştirilecektir.

Sonrasında modüler büyüme uygulanacaktır.

Principle:

Önce sağlam çekirdek + gerçek müşterinin kullanabileceği MVP → sonra modüler büyüme.

DEC-026 — Documentation Is Part of Development

Status: ACCEPTED

Decision:

Mimari kararlar, ürün kararları ve mevcut proje durumu koddan bağımsız olarak dokümante edilecektir.

Temel proje hafızası:

docs/state/CURRENT-STATE.md
docs/17-DECISIONS.md

Reason:

Projenin uzun süreli geliştirilmesinde kararların ve mevcut durumun kaybolmasını önlemek.

DEC-027 — Git Checkpoints

Status: ACCEPTED

Decision:

Her önemli milestone sonrasında doğrulanmış bir Git checkpoint oluşturulacaktır.

Checkpoint süreci:

Implementation
    ↓
Verification
    ↓
Tests
    ↓
Documentation Update
    ↓
Git Commit
DEC-028 — Domain Before Final Database Model

Status: ACCEPTED

Decision:

Bir domain'in nihai Prisma/database modeli oluşturulmadan önce domain modeli ve ilişkileri dokümante edilecektir.

Reason:

Database tasarımının ürün kararlarını yanlış yönlendirmesini önlemek.

DEC-029 — Centralized Infrastructure Services

Status: ACCEPTED

Decision:

Ortak altyapı servisleri merkezi module/service yapıları üzerinden yönetilecektir.

Örneğin:

RedisModule
    ↓
RedisService

Business modülleri kendi bağımsız Redis bağlantılarını oluşturmamalıdır.

Aynı prensip ileride:

Logging
Queue
Storage
External integrations

gibi altyapılar için de uygulanacaktır.

DEC-030 — Project Continuation Protocol

Status: ACCEPTED

Decision:

Yeni bir çalışma oturumunda proje önce mevcut dokümantasyon üzerinden anlaşılacaktır.

Minimum başlangıç okuma sırası:

docs/state/CURRENT-STATE.md
        ↓
docs/17-DECISIONS.md
        ↓
Relevant architecture/domain documentation

Daha sonra mevcut Git checkpoint doğrulanarak çalışmaya devam edilir.

Tamamlanmış işler gereksiz yere yeniden uygulanmaz.

Future Decisions

Yeni önemli kararlar bu dosyaya:

DEC-031
DEC-032
DEC-033
...

şeklinde eklenmelidir.

Mevcut karar değiştirilirse eski kayıt silinmemeli; yeni karar oluşturulmalı ve eski karar SUPERSEDED olarak işaretlenmelidir.