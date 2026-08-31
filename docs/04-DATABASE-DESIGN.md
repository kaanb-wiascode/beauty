# Beauty ERP — Database Design

> Bu doküman Beauty ERP'nin PostgreSQL/Prisma veri modelinin tasarım prensiplerini ve temel ilişkilerini tanımlar.
>
> Bu doküman nihai Prisma schema değildir. Prisma modelleri burada tanımlanan domain ilişkileri doğrulandıktan sonra oluşturulacaktır.

---

# 1. Database Principles

Ana database:

```text
PostgreSQL

ORM:

Prisma

Temel prensipler:

Tenant isolation
Referential integrity
Explicit relationships
Auditability
Transactional consistency
Historical data preservation
Idempotency
Appropriate indexing
Soft-delete ihtiyacının domain bazında değerlendirilmesi
2. Tenant Boundary

Tenant sistemdeki en üst veri izolasyon sınırıdır.

Temel yapı:

Tenant
├── LegalEntity
├── Region
├── Branch
├── Department
├── Employee
├── User
├── Customer
├── Service
├── Appointment
├── Sale
├── Payment
├── Inventory
├── Accounting
└── Quality

Tenant'a ait business entity'lerde mümkün olduğunca açık tenantId bulunması tercih edilecektir.

Amaç:

Tenant A
    ↓
yalnızca Tenant A verisi

Tenant B
    ↓
yalnızca Tenant B verisi
3. Primary Keys

Genel primary key stratejisi:

UUID

kullanılmasıdır.

Avantajları:

Dağıtık sistemlerde güvenli ID üretimi
Client-side tahmin edilmesinin zor olması
Migration / import süreçlerinde kolaylık
Gelecekte servis ayrıştırma kolaylığı

Public API'de internal numeric sequence'lara bağımlılık oluşturulmamalıdır.

4. Timestamps

Ana entity'lerde mümkün olduğunca:

createdAt
updatedAt

alanları bulunmalıdır.

Gerektiğinde:

deletedAt

kullanılabilir.

Ancak tüm entity'lere otomatik soft delete uygulanmayacaktır.

Domain lifecycle'a göre karar verilecektir.

5. Audit Metadata

Kritik entity'lerde gerektiğinde:

createdById
updatedById

gibi alanlar bulunabilir.

Bunlar application audit log'un yerine geçmez.

Örneğin:

Payment
├── createdAt
├── createdById
└── AuditLog

şeklinde iki farklı ihtiyaç birlikte karşılanabilir.

6. Organization Hierarchy

Temel organizasyon ilişkisi:

Tenant
  │
  ├── LegalEntity
  │
  ├── Headquarters
  │
  └── Region
        │
        └── Branch

Branch bir Tenant'a ve uygun durumda bir LegalEntity'ye bağlıdır.

Region Tenant'a bağlıdır.

7. Legal Entity

Temel ilişki:

Tenant
   │
   └── LegalEntity
          │
          ├── Branch
          ├── BankAccount
          ├── CashAccount
          └── Accounting

Bir Tenant birden fazla LegalEntity içerebilir.

8. Region

İlişki:

Tenant
   │
   └── Region
          │
          └── Branch

Region başka tenant'a ait branch içeremez.

9. Branch

Branch:

Tenant
+
Region
+
LegalEntity

bağlamında değerlendirilir.

Örnek:

Branch
├── tenantId
├── regionId
└── legalEntityId

Branch altında:

Employees
Departments
Services
Appointments
Sales
Inventory
Customers

gibi ilişkiler bulunabilir.

10. Department

Department:

Tenant
    ↓
Department

ilişkisine sahiptir.

Department merkez veya branch seviyesinde olabilir.

Örneğin:

Headquarters
├── HR
├── Finance
└── Accounting

ve:

Branch
├── Reception
├── Estheticians
└── Doctors

Aynı department modeli farklı organizasyon scope'larını destekleyebilir.

11. Employee

Employee:

Tenant
    ↓
Employee

ilişkisine sahiptir.

Employee ile User ayrıdır.

Employee
   │
   └── User

ilişkisi opsiyonel olabilir.

Bir Employee kullanıcı hesabına sahip olmadan önce de sistemde bulunabilir.

12. Employee Branch Membership

Çalışanın branch ilişkisi ayrı bir junction entity üzerinden tutulmalıdır.

Örneğin:

Employee
    │
    └── EmployeeBranch
            │
            └── Branch

Bu entity:

employeeId
branchId
isPrimary
startDate
endDate

gibi alanlara sahip olabilir.

Böylece:

Employee A
├── Branch 1 (primary)
├── Branch 2
└── Branch 3

desteklenebilir.

13. Employee Assignment

Geçici görevlendirme membership'ten ayrı tutulmalıdır.

Employee
    │
    └── EmployeeAssignment
            │
            └── Branch

Assignment:

employeeId
branchId
startAt
endAt
type
reason
createdById
approvedById

gibi alanlara sahip olabilir.

14. User

User authentication identity'sidir.

User
├── Employee
├── Customer
├── Roles
├── Permissions
└── Sessions

Employee veya Customer ile ilişki domain ihtiyacına göre opsiyonel olabilir.

15. Role and Permission

Temel authorization ilişkisi:

User
   ↓
UserRole
   ↓
Role
   ↓
RolePermission
   ↓
Permission

Direct permission override ihtiyacı ileride ayrıca değerlendirilebilir.

16. Authorization Scope

Authorization ilişkileri için scope modelleri gerekebilir.

Örneğin:

User
   ↓
Role
   ↓
Scope
      ├── Tenant
      ├── LegalEntity
      ├── Region
      ├── Branch
      └── Department

Scope modeli permission modelinden bağımsız tasarlanmalıdır.

17. Customer

Customer:

Tenant
   ↓
Customer

ilişkisine sahiptir.

Customer:

Customer
├── User
├── Appointments
├── Sales
├── Payments
├── Packages
├── Feedback
└── QualityCases

ile ilişkilendirilebilir.

18. Customer Branch Relationship

Müşterinin birden fazla şubeyle geçmiş ilişkisi olabilir.

Bu nedenle yalnızca:

customer.branchId

gibi tek bir alan yeterli olmayabilir.

Gerektiğinde:

CustomerBranch

junction entity'si kullanılabilir.

Bu yapı:

Customer
    ↓
CustomerBranch
    ↓
Branch

şeklinde çalışabilir.

19. Service

Service:

Tenant
   ↓
Service

ilişkisine sahiptir.

Service'in hangi branch'lerde sunulduğu ayrı ilişki üzerinden tutulabilir:

Service
   ↓
BranchService
   ↓
Branch

Böylece aynı hizmet farklı şubelerde farklı:

fiyat
süre
availability
personel gereksinimi

ile sunulabilir.

20. Service Category

Category:

Tenant
   ↓
ServiceCategory
       ↓
Service

şeklinde modellenebilir.

Category tenant-specific olabilir.

21. Appointment

Appointment temel ilişkisi:

Customer
    ↓
Appointment
    ├── Branch
    ├── Service
    └── Employee

Appointment aynı zamanda Tenant context'i taşır.

Temel alanlar:

id
tenantId
customerId
branchId
serviceId
employeeId
startAt
endAt
status
createdAt
updatedAt
22. Appointment History

Appointment'ın durum değişimleri audit/history olarak saklanabilir.

Örneğin:

Appointment
     ↓
AppointmentStatusHistory

Örnek:

SCHEDULED
   ↓
CONFIRMED
   ↓
CHECKED_IN
   ↓
IN_SERVICE
   ↓
COMPLETED

Bu yapı randevunun geçmişini korur.

23. Package

Package satın alınmış müşteri hakkını temsil eder.

Customer
   ↓
CustomerPackage
   ├── Sale
   ├── PackageDefinition
   └── Sessions

Package definition ile customer-owned package ayrılmalıdır.

24. Package Definition

Tanımlanan ürün/paket:

PackageDefinition

Müşterinin satın aldığı gerçek paket:

CustomerPackage

olmalıdır.

Bu ayrım geçmiş fiyat ve koşulların korunmasına yardımcı olur.

25. Package Session

CustomerPackage:

CustomerPackage
     ↓
PackageSession

ilişkisine sahiptir.

Session:

status
usedAt
appointmentId
serviceId

gibi bilgiler içerebilir.

Örnek:

10 sessions
   ↓
Session 1
Session 2
Session 3
...
Session 10
26. Sale

Sale:

Tenant
 ↓
Sale
 ├── Customer
 ├── Branch
 ├── Employee / Seller
 └── SaleItems

ile ilişkilidir.

SaleItem:

SERVICE
PACKAGE
PRODUCT

gibi farklı item türlerini destekleyebilir.

27. Historical Pricing

Satış anındaki fiyat sonradan değişse bile geçmiş satış değişmemelidir.

Bu nedenle:

Service.price

ile:

SaleItem.unitPrice

aynı şey değildir.

SaleItem satış anındaki fiyatı saklamalıdır.

Aynı prensip:

Discount
Tax
Currency
Exchange rate

için de geçerlidir.

28. Payment

Payment:

Customer
   ↓
Payment
   ↓
Sale

ile ilişkilendirilebilir.

Kısmi ödeme desteklenmelidir.

Örnek:

Sale = 10,000

Payment = 3,000
Payment = 2,000

Remaining = 5,000
29. Payment Allocation

Bir ödeme birden fazla satışa veya borca uygulanabiliyorsa ayrı allocation entity'si gerekebilir.

Payment
   ↓
PaymentAllocation
   ↓
Sale

Bu model:

paymentId
saleId
amount

gibi alanlar içerebilir.

30. Payment Provider Transaction

Harici ödeme sağlayıcısının transaction ID'si ayrı saklanmalıdır.

Örneğin:

Payment
├── id
├── provider
├── providerTransactionId
├── status
└── amount

providerTransactionId uygun provider scope'unda unique olmalıdır.

31. Payment Idempotency

Ödeme işlemleri için idempotency key tutulabilir.

Payment
├── idempotencyKey
└── providerTransactionId

Aynı işlem tekrar işlendiğinde duplicate payment oluşturulmamalıdır.

32. Inventory

Inventory domain:

Product
Warehouse
Stock
StockMovement

yapısına sahip olabilir.

Örnek:

Branch
   ↓
Warehouse
   ↓
Stock
   ↓
Product
33. Stock Movement

Stock source of truth movement kayıtları üzerinden izlenebilir.

StockMovement

türleri:

PURCHASE
SALE
SERVICE_USAGE
TRANSFER
ADJUSTMENT
RETURN
WASTE

gibi olabilir.

Stok miktarı doğrudan rastgele güncellenmemeli; hareketlerle tutarlı olmalıdır.

34. Service Consumption

Hizmet tamamlandığında tüketim hareketleri oluşturulabilir.

ServiceCompleted
      ↓
ServiceConsumption
      ↓
StockMovement

Bu işlem idempotent olmalıdır.

35. Accounting

Muhasebe domaininin temel yapısı:

ChartOfAccounts
       ↓
Account
       ↓
JournalEntry
       ↓
JournalLine

olabilir.

JournalEntry:

Debit
Credit

denge prensibini korumalıdır.

36. Accounting Source Reference

Muhasebe kayıtlarının kaynağı izlenebilmelidir.

Örneğin:

JournalEntry
    ↓
sourceType
sourceId

ile:

Sale
Payment
Refund
Inventory
Payroll

gibi işlemlere referans verilebilir.

37. Financial Period

Muhasebe dönemleri desteklenmelidir.

AccountingPeriod

örneğin:

2026-08

şeklinde olabilir.

Kapatılmış dönemlerde geriye dönük değişiklikler kısıtlanmalıdır.

38. Feedback

Feedback:

Customer
   ↓
Feedback
   ├── Appointment
   ├── Service
   ├── Employee
   └── Branch

ilişkilerine sahip olabilir.

Feedback kayıtları mümkün olduğunca immutable/history-preserving tasarlanmalıdır.

39. Quality Case

Quality Case:

Feedback
   ↓
QualityCase
   ├── Customer
   ├── Branch
   ├── Employee
   └── AssignedUser

şeklinde ilişkilendirilebilir.

Feedback silinse bile kalite vakasının audit gereksinimleri korunmalıdır.

40. Notification

Notification:

User / Customer
       ↓
Notification
       ↓
NotificationDelivery

şeklinde modellenebilir.

Bir notification birden fazla kanaldan gönderilebilir.

Örneğin:

Notification
├── Push
├── Email
└── WhatsApp
41. Audit Log

AuditLog ayrı bir entity/domain olarak tutulmalıdır.

Örnek:

AuditLog
├── tenantId
├── actorId
├── action
├── entityType
├── entityId
├── before
├── after
├── createdAt
└── requestId

Sensitive data audit log'a kontrolsüz şekilde kopyalanmamalıdır.

42. Migration Data Model

Migration işlemleri:

MigrationJob
   ├── Source
   ├── Mapping
   ├── Validation
   ├── ImportBatch
   └── ImportError

yapısında olabilir.

Her migration'ın:

Tenant
Source
Status
CreatedBy
StartedAt
CompletedAt

bilgileri takip edilmelidir.

43. Tenant-Aware Indexing

Tenant-aware tabloların çoğunda sorgu desenine göre composite index kullanılmalıdır.

Örneğin:

(tenantId, slug)
(tenantId, createdAt)
(tenantId, branchId)
(tenantId, status)

gibi indexler domain ihtiyacına göre değerlendirilecektir.

Her tabloya körlemesine index eklenmeyecektir.

44. Unique Constraints

Tenant-specific unique değerlerde global unique yerine tenant-aware unique tercih edilmelidir.

Örneğin:

@@unique([tenantId, slug])

kullanılabilir.

Böylece:

Tenant A → slug = kadikoy
Tenant B → slug = kadikoy

aynı anda mümkün olabilir.

45. Foreign Keys

Database referential integrity mümkün olduğunca PostgreSQL foreign key'leriyle korunmalıdır.

Ancak cascade davranışı dikkatli seçilmelidir.

Özellikle:

Payment
Accounting
Audit
Historical records

için otomatik cascade delete kullanılmamalıdır.

46. Delete Strategy

Entity silme stratejileri domain bazında belirlenmelidir.

Örneğin:

Service

artık kullanılmıyorsa fiziksel silme yerine:

isActive = false

gibi lifecycle yaklaşımı daha uygun olabilir.

Finansal veya audit kayıtları fiziksel olarak silinmemelidir.

47. Historical Integrity

Geçmiş finansal kayıtlar bugünkü entity state'ine bağımlı olmamalıdır.

Örneğin bir hizmetin fiyatı değiştiğinde:

Current Service Price

geçmiş:

SaleItem.unitPrice

değerini değiştirmemelidir.

Aynı prensip:

Employee title
Branch name
Tax rate
Discount
Currency

gibi historical data için de değerlendirilmelidir.

48. Currency

Financial entity'lerde gerektiğinde:

currency
amount

saklanmalıdır.

Multi-currency işlemlerde:

transactionCurrency
baseCurrency
exchangeRate
exchangeRateDate

gibi bilgiler tutulabilir.

49. Money Representation

Para alanlarında floating point kullanılmamalıdır.

PostgreSQL tarafında uygun numeric/decimal yaklaşımı kullanılmalıdır.

Örneğin:

Decimal(18, 2)

gibi precision ihtiyaçları domain bazında belirlenebilir.

50. Date and Time

Database timestamp'leri timezone-aware tutulmalıdır.

Özellikle:

Appointment
Assignment
Payment
Audit
Notification

gibi alanlarda kesin zaman bilgisi korunmalıdır.

51. Appointment Time Zone

Branch'in timezone'u ayrıca tutulabilir.

Branch
└── timezone

Appointment zamanları branch timezone'u ve UTC dönüşümü dikkate alınarak yönetilmelidir.

52. Concurrency

Aynı anda iki kullanıcının aynı kaynağı değiştirmesi mümkündür.

Özellikle:

Appointment booking
Package session
Stock
Payment

alanlarında concurrency kontrolü gerekir.

Database transaction, locking veya optimistic concurrency domain ihtiyacına göre kullanılacaktır.

53. Appointment Conflict

Aynı çalışan veya kaynak için çakışan appointment'lar engellenmelidir.

Kontrol:

Employee
+
Branch
+
StartAt
+
EndAt

üzerinden yapılabilir.

Database constraint yaklaşımı ihtiyaç halinde ayrıca değerlendirilecektir.

54. Package Session Concurrency

İki request aynı anda son paketi kullanmaya çalışırsa:

Remaining = 1

değerinin iki kez tüketilmesi engellenmelidir.

Bu nedenle:

Transaction
+
Concurrency Control

kullanılmalıdır.

55. Stock Concurrency

Aynı stok aynı anda iki işlem tarafından tüketilebilir.

Stock movement ve transaction tasarımı bu durumu güvenli şekilde ele almalıdır.

56. Payment Concurrency

Payment callback veya kullanıcı request'i aynı finansal işlemi iki kez oluşturamamalıdır.

Idempotency ve unique constraints kullanılmalıdır.

57. Database Migrations

Prisma migrations:

packages/database/prisma/migrations/

altında tutulacaktır.

Migration:

Schema Change
    ↓
Migration
    ↓
Review
    ↓
Apply
    ↓
Verify

sürecinden geçmelidir.

58. Migration Rule

Production database üzerinde manuel schema değişikliklerinden kaçınılmalıdır.

Schema değişiklikleri mümkün olduğunca versioned migration üzerinden yapılmalıdır.

59. Seed Data

Development/test için seed data oluşturulabilir.

Örnek:

Tenant
Legal Entity
Branch
User
Role
Permission
Service
Customer

Seed data production customer data içermemelidir.

60. Prisma Boundary

Prisma client domain logic'in tamamı değildir.

Tercih edilen yapı:

Controller
   ↓
Application
   ↓
Domain
   ↓
Repository
   ↓
Prisma
   ↓
PostgreSQL

Application/domain katmanları doğrudan Prisma implementation detaylarına mümkün olduğunca bağımlı olmamalıdır.

61. Database Package

Mevcut:

packages/database

paketi:

Prisma
DatabaseModule
PrismaService

gibi ortak database altyapısını sağlar.

Domain-specific repository logic zamanla ilgili API domainlerine taşınabilir.

62. Current Database State

Şu anda gerçek database modelinde yalnızca başlangıç Tenant modeli bulunmaktadır:

Tenant
├── id
├── name
├── slug
├── createdAt
└── updatedAt

Bu model migration ile PostgreSQL'e uygulanmıştır.

63. Database Expansion Strategy

Database tek seferde bütün ERP'yi modellemeyecektir.

Sıralı ilerleme:

Tenant
   ↓
Organization
   ↓
Identity / Authorization
   ↓
Customer
   ↓
Service
   ↓
Appointment
   ↓
Sales
   ↓
Payment
   ↓
Inventory
   ↓
Accounting
   ↓
HR / Payroll
   ↓
Quality
   ↓
Marketing

Her domain:

Domain Design
 ↓
Database Design
 ↓
Prisma Model
 ↓
Migration
 ↓
Tests
 ↓
Checkpoint

sürecinden geçecektir.

64. Database Design Rule

Bir entity Prisma schema'ya eklenmeden önce:

Domain amacı tanımlanır.
Ownership belirlenir.
Cardinality belirlenir.
Lifecycle belirlenir.
Tenant scope belirlenir.
Authorization scope belirlenir.
Historical requirements belirlenir.
Index ihtiyaçları belirlenir.
Unique constraints belirlenir.
Delete strategy belirlenir.
65. Source of Truth

Transactional source of truth:

PostgreSQL

Redis:

Cache
Temporary State
Queue Support

olarak kullanılacaktır.

Redis'teki cache verisi kaybolduğunda PostgreSQL'den yeniden üretilebilmelidir.

66. Database Security

Production database:

Public internet'e doğrudan açılmamalıdır.
Credentials secret olarak yönetilmelidir.
Minimum privilege prensibi uygulanmalıdır.
Backup alınmalıdır.
Restore test edilmelidir.
67. Database Performance

Performans için öncelikli yaklaşım:

Correct Query
 ↓
Correct Index
 ↓
Query Analysis
 ↓
Caching where appropriate
 ↓
Read Model if necessary

Erken aşamada gereksiz denormalization yapılmayacaktır.

68. Database Evolution Principle

Database tasarımında temel prensip:

Önce doğru domain modeli, sonra doğru relational model, sonra optimizasyon.

Performans sorunları ölçüm yapılmadan tahmin üzerinden çözülmemelidir.

69. Next Database Milestone

Bir sonraki database milestone:

Organization Domain

olacaktır.

İlk genişletilecek modeller:

Tenant
LegalEntity
Region
Branch
Department
Employee
EmployeeBranch
EmployeeAssignment

Sonrasında:

User
Role
Permission
AuthorizationScope

gelecektir.