# Beauty ERP — System Architecture

> Bu doküman Beauty ERP'nin teknik mimarisini tanımlar.
>
> Amaç; ürünün güvenli, ölçeklenebilir, multi-tenant, modüler ve uzun vadede geliştirilebilir bir altyapı üzerinde ilerlemesini sağlamaktır.

---

# 1. Architecture Goals

Beauty ERP aşağıdaki temel hedeflere göre tasarlanacaktır:

1. Multi-tenant SaaS
2. Güçlü tenant izolasyonu
3. Modüler domain mimarisi
4. Güvenli authentication / authorization
5. Web + iOS + Android desteği
6. Finansal işlemlerde yüksek auditability
7. Harici sistemlerle entegrasyon
8. Veri migration desteği
9. Yüksek gözlemlenebilirlik
10. Ölçeklenebilir altyapı
11. Background job / event desteği
12. Güvenli ödeme altyapısı
13. Gerçek zamanlı veya asenkron bildirim desteği
14. Uzun vadeli ERP genişletilebilirliği

---

# 2. High-Level Architecture

Genel mimari:

```text
                         ┌─────────────────────┐
                         │      Customers      │
                         │                     │
                         │ Web / iOS / Android │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │       API Layer     │
                         │       NestJS        │
                         └──────────┬──────────┘
                                    │
                 ┌──────────────────┼──────────────────┐
                 │                  │                  │
                 ▼                  ▼                  ▼
          Application          Domain Layer      Infrastructure
             Layer                                   Layer
                 │                  │                  │
                 │                  │          ┌───────┼────────┐
                 │                  │          │       │        │
                 │                  │          ▼       ▼        ▼
                 │                  │      PostgreSQL Redis   External
                 │                  │                         Services
                 │                  │
                 └──────────────────┴──────────────────┘
3. Monorepo Architecture

Repository:

beauty-erp/
│
├── apps/
│   ├── api/
│   ├── web/
│   └── mobile/
│
├── packages/
│   ├── config/
│   ├── database/
│   ├── types/
│   └── ui/
│
├── infrastructure/
│
├── docs/
│
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── turbo.json

Monorepo yönetimi:

pnpm
+
Turborepo

kullanılarak yapılacaktır.

4. Applications
4.1 API
apps/api

Backend uygulamasıdır.

Teknoloji:

NestJS
TypeScript

API:

Authentication
Authorization
Business operations
Domain orchestration
Integration endpoints
Reporting endpoints
Customer APIs
Administrative APIs

gibi işlemleri sağlar.

5. Web Application
apps/web

Web kullanıcılarının ana uygulamasıdır.

Hedef kullanıcılar:

Genel Müdür
Bölge Müdürü
Şube Müdürü
Merkez departmanları
Şube çalışanları
İnsan Kaynakları
Muhasebe
Finans
Kalite
Yönetim
Diğer yetkili kullanıcılar

Web uygulaması backend business logic'i tekrar uygulamaz.

Business kuralları API/domain katmanında bulunur.

6. Mobile Application
apps/mobile

Mobil uygulama iOS ve Android'i destekleyecektir.

Ana kullanıcı grupları:

Çalışanlar
Yöneticiler
Şube kullanıcıları
Müşteriler

Mobil uygulama aynı API ve authorization sistemini kullanır.

7. Shared Packages
packages/database

Prisma ve database abstraction katmanıdır.

İçerir:

Prisma schema
Prisma migrations
PrismaService
DatabaseModule
Database-related infrastructure
packages/types

Paylaşılan TypeScript type'ları içindir.

Örneğin:

API contracts
Domain types
Enums
Shared DTO-related types

Ancak business logic bu pakete taşınmamalıdır.

packages/ui

Web ve mobil tarafında paylaşılabilecek UI abstraction'ları için kullanılabilir.

UI package'a backend logic koyulmamalıdır.

packages/config

Paylaşılan configuration tanımları için kullanılabilir.

Environment configuration ile business configuration birbirinden ayrılmalıdır.

8. Backend Layering

Backend modülleri genel olarak:

Controller
    ↓
Application
    ↓
Domain
    ↓
Infrastructure

modeline göre tasarlanacaktır.

9. Controller Layer

Controller yalnızca HTTP/API sınırıdır.

Sorumlulukları:

Request almak
Authentication context almak
DTO validation
Application service çağırmak
Response dönmek

Controller içerisinde karmaşık business logic bulunmamalıdır.

10. Application Layer

Application layer use-case'leri yönetir.

Örneğin:

CreateCustomer
BookAppointment
CompleteService
CreateSale
ReceivePayment
RescheduleAppointment
CreateFeedback

gibi operasyonlar application layer tarafından orkestre edilir.

Application layer:

Domain servislerini çağırabilir.
Repository abstraction kullanabilir.
Transaction yönetimini başlatabilir.
Domain event yayınlayabilir.
11. Domain Layer

Domain layer gerçek business kurallarını içerir.

Örneğin:

PackageSession

için:

remainingSessions > 0

kontrolü domain kuralıdır.

Benzer şekilde:

Appointment rules
Authorization rules
Payment rules
Package rules
Inventory rules
Accounting rules

domain katmanında tanımlanabilir.

12. Infrastructure Layer

Infrastructure dış sistemler ve teknik servislerle iletişimi sağlar.

Örnek:

Infrastructure
├── PostgreSQL
├── Redis
├── Queue
├── Storage
├── Email
├── SMS
├── WhatsApp
├── Payment Providers
├── Google
└── Other External Services

Business logic doğrudan üçüncü taraf SDK'larına bağımlı olmamalıdır.

13. Current Infrastructure

Şu anda:

PostgreSQL
Redis

aktif altyapı bileşenleridir.

14. PostgreSQL

Ana transactional database:

PostgreSQL

görevi:

Tenant data
Customers
Employees
Appointments
Sales
Payments
Inventory
Accounting
HR
Quality
Audit metadata

gibi kalıcı verileri saklamaktır.

15. Prisma

ORM:

Prisma

olarak kullanılmaktadır.

Prisma:

Schema management
Migration
Type-safe database access
Generated client

için kullanılacaktır.

Prisma business rules'ın tamamını temsil eden tek katman olarak kullanılmamalıdır.

16. Redis

Redis:

RedisModule
    ↓
RedisService

şeklinde merkezi infrastructure service olarak kullanılacaktır.

Redis kullanım alanları:

Cache
Session-related data
Rate limiting
Short-lived state
Distributed locks
Queue support
Temporary data
Background processing support

gibi alanları kapsayabilir.

Business module'leri kendi Redis bağlantılarını oluşturmamalıdır.

17. Queue / Background Jobs

Uzun süren veya kullanıcı request'inden ayrıştırılması gereken işler background job olarak çalıştırılabilir.

Örnek:

Payment Webhook
      ↓
Queue
      ↓
Payment Processing

ve:

Service Completed
      ↓
Queue
      ├── Notification
      ├── Feedback Request
      ├── Reporting
      └── Integration

Aday kullanım alanları:

Email
SMS
WhatsApp
Push notifications
Payment reconciliation
Report generation
Data migration
Import processing
Integration synchronization

Queue teknolojisi kesinleştirilmeden önce ihtiyaç ve operasyonel maliyet değerlendirilecektir.

18. Event-Driven Operations

Bazı business işlemleri domain event üzerinden ilerleyebilir.

Örneğin:

ServiceCompleted

sonrasında:

ServiceCompleted
       │
       ├── Deduct Package Session
       ├── Inventory Consumption
       ├── Payment / Balance
       ├── Accounting
       ├── Notification
       ├── Feedback
       └── Reporting

Event-driven architecture her işlemde zorunlu değildir.

Senkron işlemler ile event-driven işlemler kullanım senaryosuna göre ayrılacaktır.

19. Transaction Boundaries

Bir business operation birden fazla database değişikliği gerektiriyorsa transaction sınırı application layer tarafından belirlenmelidir.

Örneğin:

Complete Service
       │
       ├── Appointment
       ├── Package Session
       ├── Inventory
       └── Related Financial State

Atomic olması gereken database değişiklikleri aynı transaction içerisinde gerçekleştirilebilir.

Harici sistem çağrıları database transaction'ına doğrudan bağlanmamalıdır.

Bunun yerine:

Database Transaction
        ↓
Outbox / Event
        ↓
External Integration

gibi bir yapı gerektiğinde kullanılabilir.

20. Multi-Tenant Architecture

Tenant sınırı backend'in en temel güvenlik sınırıdır.

Request context içerisinde tenant bilgisi bulunmalıdır.

Örneğin:

Request
 ↓
Authentication
 ↓
User
 ↓
Tenant Context
 ↓
Authorization
 ↓
Application
 ↓
Repository / Query

Database sorgularında tenant izolasyonu korunmalıdır.

21. Tenant Context

Her tenant-aware operation mümkün olduğunca tenant context ile çalışmalıdır.

Örnek:

TenantContext
├── tenantId
├── userId
├── legalEntityId
├── regionId
├── branchId
└── permissions

Bu context'in tamamı her request için zorunlu olmayabilir.

Ancak gerekli domain scope'u authorization tarafından belirlenmelidir.

22. Authentication

Authentication kullanıcının kim olduğunu belirler.

Planlanan kullanıcı türleri:

Employee User
Customer User
Administrative User

Authentication sistemi:

Login
Logout
Session / token
Password management
Password reset
Email / phone verification
MFA-ready architecture

gibi özellikleri desteklemelidir.

Authentication ile authorization birbirinden ayrılmalıdır.

23. Authorization

Authorization:

Can this user perform this operation
on this resource
within this scope?

sorusunu cevaplar.

Kontrol:

User
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

bağlamında yapılabilir.

24. Authorization Flow
HTTP Request
      ↓
Authentication
      ↓
User Identity
      ↓
Tenant Resolution
      ↓
Permission Check
      ↓
Scope Check
      ↓
Application Use Case
      ↓
Domain Rules
      ↓
Database

Authorization controller'da tek bir guard kontrolüne indirgenmemelidir.

Domain seviyesinde gerekli business authorization kontrolleri ayrıca yapılmalıdır.

25. API Design

API REST-first olarak tasarlanacaktır.

Temel yaklaşım:

/api/v1/...

şeklinde versioned API kullanılması planlanmaktadır.

Örnek:

/api/v1/customers
/api/v1/appointments
/api/v1/services
/api/v1/sales
/api/v1/payments

API versioning geriye dönük uyumluluğu korumaya yardımcı olacaktır.

26. DTO Validation

API'ye gelen inputlar güvenilir kabul edilmemelidir.

Validation:

Request
 ↓
DTO / Schema Validation
 ↓
Application

şeklinde yapılmalıdır.

Zod veya NestJS validation yaklaşımı domain ihtiyaçlarına göre kullanılabilir.

Validation ile authorization farklı kavramlardır.

27. Error Handling

Global exception handling kullanılacaktır.

API response formatları mümkün olduğunca standartlaştırılmalıdır.

Örneğin:

{
  "success": false,
  "error": {
    "code": "APPOINTMENT_NOT_AVAILABLE",
    "message": "Selected time is not available.",
    "requestId": "..."
  }
}

Internal exception detayları production ortamında müşteriye açılmamalıdır.

28. Request ID / Correlation ID

Her request mümkün olduğunca benzersiz bir request ID ile ilişkilendirilmelidir.

Örnek:

Request
 ↓
requestId
 ↓
Logger
 ↓
Error
 ↓
Audit
 ↓
External Integration

Bu ID troubleshooting ve distributed operasyon takibi için kullanılacaktır.

29. Logging

Application logging merkezi ve structured formatta tasarlanacaktır.

Log seviyeleri:

DEBUG
INFO
WARN
ERROR

olabilir.

Loglarda:

Password
Card data
Sensitive personal data
Secrets
Access tokens

gibi hassas bilgiler tutulmamalıdır.

30. Audit Logging

Audit log business audit ile application log'dan ayrıdır.

Application log:

API request failed

gibi teknik olayları kaydeder.

Audit log:

User changed customer payment status

gibi iş açısından önemli değişiklikleri kaydeder.

Audit kayıtları mümkün olduğunca değiştirilemez / güvenilir şekilde saklanmalıdır.

31. Security Baseline

Temel güvenlik katmanı:

HTTPS
Authentication
Authorization
Input Validation
Rate Limiting
Secure Headers
Tenant Isolation
Audit Logging
Secret Management
Encryption

içermelidir.

Production ortamında:

Secrets repository'ye yazılmamalıdır.
Environment variables güvenli yönetilmelidir.
Database credentials kod içine gömülmemelidir.
Payment credentials loglanmamalıdır.
32. Payment Architecture

Ödeme sağlayıcıları abstraction üzerinden bağlanacaktır.

Genel yapı:

Payment Application Service
          ↓
Payment Provider Interface
          ↓
┌─────────┼─────────┐
│         │         │
Provider A Provider B Provider C

Böylece tek bir ödeme sağlayıcısına bağımlılık azaltılır.

33. Payment Link

Ödeme linki akışı:

Sale / Outstanding Balance
        ↓
Create Payment Link
        ↓
Payment Provider
        ↓
Customer
        ↓
Secure Payment Page
        ↓
Webhook
        ↓
Payment Verification
        ↓
Payment Record
        ↓
Accounting
        ↓
Notification

Payment status yalnızca browser redirect sonucuna göre PAID yapılmamalıdır.

Provider doğrulaması / webhook sonucu esas alınmalıdır.

34. Virtual POS

Sanal POS entegrasyonu:

Customer
   ↓
Payment UI
   ↓
API
   ↓
Payment Provider
   ↓
Virtual POS
   ↓
Provider Response / Webhook
   ↓
Payment

Kart bilgileri mümkün olduğunca Beauty ERP backend'inde tutulmamalıdır.

PCI ve ilgili ödeme güvenliği gereksinimleri ayrıca değerlendirilecektir.

35. Webhooks

Harici servislerden gelen webhook'lar:

Webhook
 ↓
Authentication / Signature Verification
 ↓
Validation
 ↓
Idempotency
 ↓
Queue / Processing
 ↓
Domain Operation

şeklinde ele alınmalıdır.

Aynı webhook'un birden fazla gelmesi sistemde duplicate finansal işlem oluşturmamalıdır.

36. Idempotency

Özellikle finansal işlemlerde idempotency zorunlu bir prensiptir.

Örneğin:

Payment Provider
      ↓
Webhook #123
      ↓
Payment Created

Aynı:

Webhook #123

tekrar geldiğinde ikinci bir Payment oluşturulmamalıdır.

Aynı prensip:

Payment
Refund
Invoice
Migration import
External synchronization

gibi alanlarda uygulanabilir.

37. Customer Portal Architecture

Müşteri portalı API üzerinden çalışır.

Customer Mobile/Web
        ↓
Customer Authentication
        ↓
Customer Authorization Scope
        ↓
Customer API
        ↓
Customer Domain

Müşteri yalnızca kendisine ait verilere erişebilmelidir.

Örneğin:

Customer A

asla:

Customer B

verilerini göremez.

38. Appointment Change Architecture

Müşteri randevusunu değiştirmek istediğinde:

Customer
 ↓
Request Reschedule
 ↓
Authorization
 ↓
Availability Check
 ↓
Business Rules
 ↓
Appointment Update
 ↓
Notification

işlemi uygulanabilir.

Branch çalışma saatleri, personel müsaitliği, hizmet süresi, paket koşulları ve işletme kuralları dikkate alınmalıdır.

39. Feedback Architecture

Hizmet tamamlandığında:

ServiceCompleted
        ↓
Feedback Request
        ↓
Customer
        ↓
Feedback

Feedback:

Positive
Negative
Neutral
Critical

gibi kategorilere ayrılabilir.

Kurallar sonucunda:

Feedback
├── Normal
├── Quality Case
└── Review Workflow

oluşabilir.

40. Quality Architecture

Quality domain:

Feedback
 ↓
Quality Case
 ↓
Assignment
 ↓
Investigation
 ↓
Action
 ↓
Resolution
 ↓
Customer Follow-up

akışını desteklemelidir.

Kalite vakaları:

Branch
Employee
Service
Customer
Severity
Category

ile ilişkilendirilebilir.

41. Notification Architecture

Notification merkezi bir servis üzerinden yönetilmelidir.

Domain Event
      ↓
Notification Service
      ↓
Channel Resolver
      ├── Push
      ├── Email
      ├── SMS
      ├── WhatsApp
      └── In-App

Business module'leri doğrudan SMS veya Email provider SDK çağırmamalıdır.

42. File Storage

Dosya yüklemeleri database blob olarak saklanmak yerine object storage kullanacak şekilde tasarlanabilir.

Örnek:

Customer Document
       ↓
Object Storage
       ↓
Metadata in PostgreSQL

Database:

File ID
Owner
Tenant
Storage key
File type
Size
Hash
Created at

gibi metadata'yı saklayabilir.

43. Data Migration Architecture

Migration ayrı bir bounded context olarak ele alınacaktır.

Migration
├── Source
├── Import
├── Mapping
├── Validation
├── Transformation
├── Preview
├── Approval
├── Execution
└── Audit

Büyük import işlemleri synchronous HTTP request içerisinde çalıştırılmamalıdır.

Queue/background processing kullanılabilir.

44. Reporting Architecture

Raporlama doğrudan her request'te karmaşık transactional query çalıştıracak şekilde tasarlanmamalıdır.

Başlangıçta PostgreSQL üzerinden sorgular kullanılabilir.

İhtiyaç büyüdükçe:

Transactional DB
      ↓
Reporting / Read Model
      ↓
Analytics

mimarisi değerlendirilebilir.

Raporlar authorization scope'a uymalıdır.

45. Search Architecture

Müşteri, çalışan, ürün veya belge aramaları ilk aşamada PostgreSQL search özellikleriyle yapılabilir.

İhtiyaç büyürse ayrı search engine değerlendirilebilir.

Search sistemi tenant isolation ve authorization sınırlarını ihlal etmemelidir.

46. Caching

Cache yalnızca güvenli ve yeniden üretilebilir veriler için kullanılmalıdır.

Örnek:

Service catalog
Branch configuration
Permission metadata
Campaign configuration

gibi veriler cache'lenebilir.

Finansal kayıtların source of truth'u PostgreSQL'dir.

Redis source of truth olarak kullanılmamalıdır.

47. Observability

Production sisteminde:

Logs
Metrics
Traces
Health Checks

birlikte değerlendirilmelidir.

Temel sağlık kontrolü:

GET /health

mevcuttur.

İleride:

/health/live
/health/ready

gibi ayrımlar değerlendirilebilir.

48. Configuration Management

Configuration:

Environment
+
Validated Config

üzerinden yönetilecektir.

Örnek:

DATABASE_URL
REDIS_URL
JWT_SECRET
PAYMENT_PROVIDER_KEY
SMTP credentials

gibi bilgiler source code içine yazılmamalıdır.

Configuration validation application startup sırasında yapılmalıdır.

49. Environment Strategy

En azından:

development
test
staging
production

ortamları desteklenmelidir.

Development credentials production ortamında kullanılmamalıdır.

50. Testing Architecture

Test seviyeleri:

Unit Tests
Integration Tests
API Tests
E2E Tests

olarak ele alınacaktır.

Özellikle kritik alanlarda:

Authorization
Payment
Accounting
Inventory
Appointment
Package sessions
Tenant isolation

yüksek test kapsamına sahip olmalıdır.

51. Database Testing

Database integration testleri gerçek PostgreSQL davranışını mümkün olduğunca yansıtmalıdır.

Özellikle:

Transactions
Constraints
Unique indexes
Foreign keys
Tenant isolation

test edilmelidir.

52. API Testing

API testlerinde:

Authentication
Authorization
Validation
Business Rule
Error Handling

birlikte doğrulanmalıdır.

53. Domain Event Testing

Event-driven işlemlerde:

Event Published
       ↓
Handler
       ↓
Expected Side Effect

test edilmelidir.

Örneğin:

ServiceCompleted

sonrasında:

session deduction
feedback request
inventory movement

gibi beklenen sonuçlar doğrulanabilir.

54. Data Consistency

Aynı business olayının farklı modüllerde farklı sonuçlar üretmemesi gerekir.

Örneğin:

Service Completed

sonrası:

Package Session
Inventory
Payment / Balance
Accounting

arasında tutarlılık sağlanmalıdır.

Asenkron işlemlerde eventual consistency kabul edilebilir ancak kritik finansal durumların source of truth'u net tanımlanmalıdır.

55. Source of Truth

Genel prensip:

PostgreSQL
    ↓
Transactional Source of Truth

Redis:

Cache / Temporary State

External providers:

External Source

olarak değerlendirilir.

Payment provider'dan gelen doğrulanmış sonuç ile Beauty ERP'nin kendi payment record'u senkronize edilmelidir.

56. Auditability

Aşağıdaki alanlar yüksek audit gerektirir:

Payments
Refunds
Accounting
Payroll
Employee permissions
Authorization changes
Customer sensitive data
Inventory adjustments
Data migration
Administrative actions
57. Integration Boundary

Harici sistemler:

Beauty ERP
    ↓
Integration Interface
    ↓
Provider Adapter
    ↓
External System

modelinde bağlanmalıdır.

Örneğin:

GoogleIntegration
PaymentIntegration
WhatsAppIntegration
EmailIntegration

gibi abstraction'lar oluşturulabilir.

Provider değiştiğinde domain logic değiştirilmemelidir.

58. API and Domain Independence

Web ve Mobile uygulamalar business logic'in sahibi değildir.

Web ───────┐
           │
Mobile ────┼──→ API / Application / Domain
           │
External ──┘

Aynı business kuralı farklı client'larda tekrar edilmemelidir.

59. Scalability Strategy

İlk aşamada sistem modular monolith olarak geliştirilecektir.

Single API
    ↓
Modular Domains
    ↓
Shared Infrastructure

Mikroservis mimarisine başlangıçta zorunlu geçiş yapılmayacaktır.

Gerekli domainler ileride bağımsız servis haline getirilebilecek sınırlar içerisinde tasarlanacaktır.

60. Why Modular Monolith

Başlangıçta modular monolith tercih edilmesinin nedenleri:

Daha düşük operasyonel karmaşıklık
Daha kolay local development
Daha kolay transaction yönetimi
Daha kolay debugging
Daha hızlı MVP geliştirme
Daha düşük deployment maliyeti

Ancak domain boundaries korunacağı için ileride gerektiğinde servis ayrıştırma mümkün olmalıdır.

61. Domain Module Structure

API içerisinde hedeflenen yapı:

apps/api/src/
│
├── config/
│
├── infrastructure/
│   ├── database/
│   ├── redis/
│   ├── logging/
│   ├── queue/
│   ├── storage/
│   └── integrations/
│
├── modules/
│   ├── identity/
│   ├── organization/
│   ├── crm/
│   ├── customer/
│   ├── appointments/
│   ├── services/
│   ├── sales/
│   ├── payments/
│   ├── inventory/
│   ├── accounting/
│   ├── finance/
│   ├── hr/
│   ├── payroll/
│   ├── quality/
│   ├── marketing/
│   ├── notifications/
│   ├── reporting/
│   └── migration/
│
└── health/

Bu liste nihai değildir.

62. Module Independence

Bir module:

Kendi application service'lerine
Kendi domain logic'ine
Kendi repository abstraction'larına
Kendi DTO'larına

sahip olabilir.

Başka bir module'ın internal implementation detaylarına doğrudan erişilmemelidir.

63. Cross-Domain Communication

Domainler arasında iletişim için:

Application Service
Domain Service
Domain Event
Integration Interface

gibi kontrollü mekanizmalar kullanılacaktır.

Örnek:

Appointment
     ↓
ServiceCompleted
     ↓
Inventory

Inventory modülü Appointment'ın database tablolarını doğrudan yönetmemelidir.

64. Financial Domain Isolation

Finans ve muhasebe domainleri özel dikkat gerektirir.

Payment:

Payment
 ↓
Finance
 ↓
Accounting

akışına sahip olabilir.

Ancak Payment domaini muhasebe implementation detaylarını doğrudan yönetmemelidir.

65. Customer Data Protection

Customer verileri tenant izolasyonuna ek olarak role/scope bazlı korunmalıdır.

Bazı hassas müşteri bilgileri yalnızca yetkili personel tarafından görüntülenebilir.

Özellikle:

Personal data
Financial data
Medical / sensitive service records
Documents

için ayrı erişim kuralları gerekebilir.

66. Medical / Sensitive Data Boundary

Medikal estetik ve klinik senaryolarında hassas veriler bulunabileceğinden:

General Customer Data

ile:

Sensitive / Medical Data

arasında erişim sınırı tasarlanmalıdır.

Bu alanların kesin kapsamı ayrıca mevzuat ve ürün gereksinimleri üzerinden belirlenecektir.

67. Privacy

Privacy architecture:

Data minimization
Access control
Audit
Retention
Deletion / anonymization
Consent where required

prensiplerini dikkate almalıdır.

Türkiye'deki KVKK gereksinimleri ayrıca ele alınacaktır.

68. Backup and Recovery

Production ortamında:

Database Backup
+
Point-in-Time Recovery
+
Object Storage Backup

gibi mekanizmalar değerlendirilmelidir.

Backup sisteminin kendisi de tenant ve security sınırları içinde korunmalıdır.

69. Disaster Recovery

İlerleyen aşamalarda:

RPO
RTO
Backup frequency
Restore testing
Failover strategy

belirlenecektir.

70. Deployment Architecture

İlk aşamada:

Web
  ↓
API
  ↓
PostgreSQL
  ↓
Redis

temel deployment yapısı yeterlidir.

İleride:

Load Balancer
CDN
API Instances
Worker Instances
PostgreSQL
Redis
Object Storage
Monitoring

gibi ölçekleme yapılabilir.

71. Current Development Infrastructure

Development ortamında:

Docker
 ├── PostgreSQL
 └── Redis

çalışmaktadır.

API local development ortamında çalışmaktadır.

72. Current Health Architecture

Mevcut:

GET /health

kontrolü:

API
 ├── Database
 └── Redis

durumlarını kontrol etmektedir.

Beklenen:

{
  "status": "ok",
  "services": {
    "database": "up",
    "redis": "up"
  }
}
73. Current Implementation State

Şu anda tamamlanan temel altyapı:

Monorepo               ✅
pnpm workspace         ✅
Turborepo              ✅
Docker                 ✅
PostgreSQL             ✅
Redis                  ✅
NestJS API             ✅
Prisma                 ✅
DatabaseModule         ✅
PrismaService          ✅
RedisModule            ✅
RedisService           ✅
Environment Validation ✅
HealthModule           ✅
74. Next Technical Foundation

Bir sonraki teknik sıra:

Logger
   ↓
Request ID
   ↓
Global Exception Handling
   ↓
Validation Pipeline
   ↓
Security Baseline
   ↓
OpenAPI

Daha sonra:

Authentication
   ↓
Authorization
   ↓
Identity Domain
75. Architecture Evolution Rule

Mimari kararlar proje büyüdükçe değişebilir.

Ancak değişiklikler:

Dokümante edilmeli.
Karar kaydına eklenmeli.
Etkilenen modüller belirlenmeli.
Migration gerekiyorsa planlanmalı.
Git checkpoint oluşturulmalıdır.

Mevcut kararlar sessizce değiştirilmemelidir.

76. Final Architecture Principle

Beauty ERP'nin temel mimari prensibi:

Basit başlayacağız, ancak yanlış basitleştirmeyeceğiz.

Sistem başlangıçta modular monolith olacaktır.

Ancak:

Tenant isolation
Domain boundaries
Authorization boundaries
Financial boundaries
Integration boundaries
Auditability

başlangıçtan itibaren doğru tasarlanacaktır.

Amaç gelecekte sistemi yeniden yazmak değil, aynı çekirdek üzerinden kontrollü şekilde büyütmektir.