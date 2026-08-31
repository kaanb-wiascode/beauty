# Beauty ERP — Database Conventions

> Bu doküman PostgreSQL + Prisma database katmanındaki ortak kuralları tanımlar.
>
> Amaç: schema tasarımını tutarlı, güvenli, tenant-aware, performanslı ve migration-safe tutmak.

---

# 1. Database Stack

Ana database stack:

```text
PostgreSQL
   ↓
Prisma
   ↓
@beauty-erp/database
   ↓
NestJS API

Database erişimi application tarafından doğrudan SQL connection üzerinden değil, mümkün olduğunca @beauty-erp/database package üzerinden yapılmalıdır.

2. Source of Truth

Production business data için:

PostgreSQL

source of truth'tur.

Redis:

Cache
Session
Queue
Rate Limit
Temporary State

gibi amaçlarla kullanılabilir.

Redis business data'nın kalıcı source of truth'u değildir.

3. ORM

Ana ORM:

Prisma

olarak kullanılacaktır.

Prisma schema:

packages/database/prisma/schema.prisma

içerisinde tutulur.

Generated Prisma Client application tarafından package üzerinden kullanılmalıdır.

4. Database Package Boundary

Database erişimi:

apps/api
   ↓
@beauty-erp/database
   ↓
Prisma
   ↓
PostgreSQL

şeklinde ilerlemelidir.

API'nin Prisma implementation detaylarına mümkün olduğunca doğrudan bağımlı olması engellenmelidir.

5. Database Package Responsibility

@beauty-erp/database package:

Prisma Client
Database Module
Prisma Service
Database Schema
Migrations
Database-specific helpers

sorumluluklarını taşır.

Business logic'in tamamı database package içine konulmamalıdır.

6. Naming Convention

Database modellerinde:

PascalCase

kullanılır.

Örneğin:

Tenant
Customer
Appointment
Employee
Branch
Service
Payment
Sale
7. Field Naming

Field isimleri:

camelCase

kullanır.

Örneğin:

createdAt
updatedAt
tenantId
customerId
branchId
employeeId
8. Database Column Mapping

Gerekli görüldüğünde Prisma field:

createdAt DateTime @default(now()) @map("created_at")

şeklinde PostgreSQL snake_case column'a map edilebilir.

Proje genelinde tek convention tercih edilmelidir.

Karar verilene kadar mevcut schema'daki convention korunmalıdır.

9. Table Mapping

Gerekli görüldüğünde:

model Tenant {
  ...

  @@map("tenants")
}

kullanılabilir.

Public database table isimleri için çoğul isimlendirme tercih edilebilir:

tenants
customers
appointments
payments
10. Primary Keys

Default primary key:

String UUID

olabilir.

Mevcut Tenant modelinde:

id String @id @default(uuid())

kullanılmaktadır.

Yeni modellerde farklı ID stratejisi kullanılacaksa mimari gerekçesi olmalıdır.

11. ID Exposure

Public API response'larında internal sequential database IDs tercih edilmemelidir.

UUID kullanımı:

Enumeration Risk
Guessable IDs
Cross-resource probing

risklerini azaltmaya yardımcı olur.

Ancak UUID kullanmak authorization kontrolünün yerine geçmez.

12. UUID Rule

UUID:

Identity

sağlar.

UUID:

Authorization

sağlamaz.

Örneğin:

GET /customers/{uuid}

isteğinde UUID doğru olsa bile tenant/scope authorization kontrolü yapılmalıdır.

13. Timestamps

Business entity'lerde mümkün olduğunca:

createdAt
updatedAt

alanları bulunmalıdır.

Örnek:

createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
14. Created At

createdAt:

Record creation time

ifade eder.

Application tarafından gereksiz şekilde override edilmemelidir.

Database default tercih edilmelidir.

15. Updated At

updatedAt record'un son meaningful update zamanını temsil eder.

Prisma:

@updatedAt

kullanılabilir.

Ancak audit ihtiyacı varsa updatedAt tek başına yeterli değildir.

16. Business Timestamps

createdAt ve updatedAt business event zamanlarının yerine geçmez.

Örneğin Appointment için:

createdAt
scheduledAt
confirmedAt
checkedInAt
startedAt
completedAt
cancelledAt

gibi alanlar domain ihtiyacına göre ayrıca tutulabilir.

17. UTC

Database timestamp'leri mümkün olduğunca:

UTC

olarak saklanmalıdır.

User-facing timezone conversion application/client seviyesinde yapılmalıdır.

18. Timezone

Tenant veya Branch timezone'u business logic için ayrıca tutulabilir.

Örneğin:

Branch
 └── timezone = Europe/Istanbul

Appointment scheduling local timezone ile çalışabilir ancak persisted timestamp UTC olarak tutulabilir.

19. Date vs DateTime

Sadece takvim günü anlamına gelen değerler için:

Date

semantiği kullanılmalıdır.

Örneğin:

Birth Date
Holiday Date
Payroll Period Date

Saat önemliyse:

DateTime

kullanılmalıdır.

20. Money

Para değerlerinde:

float

kullanılmamalıdır.

Precision gerektiren finansal değerlerde PostgreSQL/Prisma:

Decimal

kullanılabilir.

Örneğin:

price Decimal
21. Currency

Money amount tek başına yeterli değildir.

Gerektiğinde:

amount
currency

birlikte tutulmalıdır.

Örneğin:

amount = 1000.00
currency = TRY
22. Historical Money

Sale oluşturulduğunda o anda geçerli fiyat snapshot'ı tutulmalıdır.

Örneğin:

Service
 └── currentPrice

SaleItem
 └── unitPrice

Service fiyatı daha sonra değişse bile geçmiş SaleItem değişmez.

23. Decimal Serialization

Decimal API response'larına doğrudan framework default serialization ile bırakılmamalıdır.

API contract'ta money değerlerinin nasıl temsil edileceği ayrıca standardize edilmelidir.

Örneğin:

{
  "amount": "1000.00",
  "currency": "TRY"
}

gibi string representation tercih edilebilir.

24. Enums

Enum:

Finite and stable states

için kullanılabilir.

Örneğin:

AppointmentStatus
PaymentStatus
EmployeeStatus
25. Enum vs Lookup Table

Sık değişebilen veya tenant tarafından yönetilebilen değerler enum olmamalıdır.

Örneğin:

Service Category
Customer Tag
Campaign Type
Custom Status

gibi değerler database table olarak modellenebilir.

26. State Enums

Lifecycle state'leri için enum uygundur.

Örneğin:

SCHEDULED
CONFIRMED
CHECKED_IN
IN_SERVICE
COMPLETED
CANCELLED
NO_SHOW

Ancak state transition business logic ile kontrol edilmelidir.

Enum kullanmak tek başına geçişleri güvenli hale getirmez.

27. Soft Delete

Soft delete gerekiyorsa:

deletedAt DateTime?

kullanılabilir.

Örneğin:

deletedAt DateTime?
28. Soft Delete Rule

Soft-deleted records normal query'lerde varsayılan olarak görünmemelidir.

Ancak:

Audit
Legal
Recovery
Admin

gibi özel use case'lerde erişilebilir olabilir.

29. Soft Delete vs Status

Soft delete:

Record artık normal kullanımda değil

anlamına gelir.

Business status:

ACTIVE
INACTIVE
CANCELLED
SUSPENDED

gibi operational state'i ifade eder.

İkisi aynı kavram değildir.

30. Tenant-Owned Models

Tenant'a ait business entity'lerde mümkün olduğunca:

tenantId

bulunmalıdır.

Örneğin:

Customer
Branch
Employee
Appointment
Sale
Payment
Inventory

tenant context ile ilişkilendirilmelidir.

31. Tenant ID

Örnek:

tenantId String
tenant   Tenant @relation(fields: [tenantId], references: [id])

Tenant relation açık şekilde modellenmelidir.

32. Tenant Query Rule

Tenant-owned data query'si:

WHERE tenantId = currentTenantId

scope'u olmadan çalıştırılmamalıdır.

Bu kural repository/service abstraction ile mümkün olduğunca merkezi hale getirilmelidir.

33. Composite Unique Constraints

Tenant-scoped unique alanlarda global unique constraint kullanılmamalıdır.

Örneğin slug tenant bazında unique ise:

@@unique([tenantId, slug])

kullanılmalıdır.

Aksi durumda bir tenant'ın slug'ı başka tenant'ı gereksiz yere engelleyebilir.

34. Tenant-Scoped Indexes

Tenant-owned yüksek trafikli tablolarda:

tenantId

index tasarımında dikkate alınmalıdır.

Örneğin:

@@index([tenantId])

veya:

@@index([tenantId, createdAt])

kullanılabilir.

35. Composite Index

Index business query pattern'e göre oluşturulmalıdır.

Örneğin appointment sorguları:

tenantId
branchId
scheduledAt

üzerinden yapılıyorsa:

@@index([tenantId, branchId, scheduledAt])

gibi composite index değerlendirilebilir.

Her kolona otomatik index eklenmemelidir.

36. Index Rule

Index eklemeden önce:

Query frequency
Filter pattern
Sort pattern
Cardinality
Write cost
Storage cost

değerlendirilmelidir.

37. Unique Constraints

Business invariant'ler database seviyesinde mümkün olduğunca korunmalıdır.

Örneğin:

Tenant.slug

unique olmalıdır.

Database constraint business logic'in son savunma hattıdır.

38. Application Validation vs Database Constraint

İkisi birbirinin yerine geçmez.

Örneğin:

Application
 ↓
Check duplicate

race condition'a açıktır.

Database:

UNIQUE

constraint'i nihai consistency sağlar.

39. Foreign Keys

Entity relation'ları mümkün olduğunca database foreign key ile korunmalıdır.

Örneğin:

Appointment
 ├── tenant
 ├── customer
 ├── branch
 └── employee

relation integrity database seviyesinde korunmalıdır.

40. Cascade Delete

Cascade delete dikkatli kullanılmalıdır.

Financial/audit/business history içeren kayıtlar için:

Cascade Delete

varsayılan çözüm değildir.

41. Restrict Delete

Critical historical relations için:

RESTRICT

veya application-level deletion policy tercih edilebilir.

Örneğin Payment bağlı bir Sale'ın fiziksel olarak silinmesine izin verilmemelidir.

42. Referential Integrity

Database schema:

Customer
Appointment
Sale
Payment
Inventory
Accounting

arasında geçersiz orphan records oluşmasını mümkün olduğunca engellemelidir.

43. Nullability

Nullable field yalnızca gerçekten:

Value may not exist

anlamına geliyorsa kullanılmalıdır.

null, business state için gereksiz şekilde kullanılmamalıdır.

44. Optional vs Required

Örneğin:

Customer.name

required ise:

name String

olmalıdır.

Opsiyonel alan:

notes String?

olabilir.

45. Boolean Abuse

Birden fazla state'i temsil etmek için çok sayıda boolean kullanılmamalıdır.

Riskli:

isActive
isCompleted
isCancelled
isDeleted

kombinasyonları.

Bunun yerine uygun lifecycle enum'u kullanılabilir.

46. State Machine

Lifecycle state:

status

ile tutulabilir.

Geçiş:

SCHEDULED
 → CONFIRMED
 → CHECKED_IN
 → IN_SERVICE
 → COMPLETED

business service tarafından doğrulanmalıdır.

47. Audit Fields

Kritik entity'lerde gerektiğinde:

createdById
updatedById

gibi actor bilgileri tutulabilir.

Ancak bunlar createdAt / updatedAt yerine geçmez.

48. Audit Events

Critical mutations ayrıca audit event oluşturabilir:

AuditEvent
 ├── actorId
 ├── tenantId
 ├── action
 ├── resourceType
 ├── resourceId
 ├── metadata
 └── createdAt
49. Financial Records

Financial records:

Sale
Payment
Refund
JournalEntry
JournalLine

gibi entity'lerde destructive update/delete minimum seviyede tutulmalıdır.

50. Financial Immutability

Financial record oluşturulduktan sonra:

Amount
Currency
Source

gibi kritik alanların değiştirilmesi mümkün olduğunca engellenmelidir.

Düzeltme gerekiyorsa:

Refund
Reversal
Adjustment
Correction Entry

gibi karşı kayıtlar tercih edilmelidir.

51. Inventory Immutability

Stock movement history silinmemelidir.

Örneğin:

StockMovement
 ├── IN
 ├── OUT
 ├── TRANSFER
 └── ADJUSTMENT

geçmişi korunmalıdır.

52. Inventory Balance

Current stock:

Stock Balance

ile tutulabilir.

History:

Stock Movement

ile tutulur.

İki kavram birbirinden ayrılmalıdır.

53. Ledger Principle

Muhasebe için:

Journal Entry
+
Journal Lines

immutable history yaklaşımı kullanılmalıdır.

Düzeltme:

Reversal

veya yeni entry ile yapılabilir.

54. Transaction Boundary

Bir business invariant birden fazla database değişikliği gerektiriyorsa transaction kullanılmalıdır.

Örneğin:

Create Sale
+
Create SaleItems
+
Create Payment

business requirement'a göre transaction içinde olabilir.

55. Prisma Transaction

Prisma:

$transaction

mekanizması kullanılabilir.

Transaction mümkün olduğunca:

Short
Focused
Deterministic

olmalıdır.

56. External Calls in DB Transaction

Database transaction içinde:

HTTP request
Payment provider
SMS
Email
Long Redis operation

gibi external calls mümkün olduğunca yapılmamalıdır.

Transaction uzun sürer ve lock riskini artırır.

57. Transaction + Outbox

Business transaction ile event publication consistency gerekiyorsa:

Transaction
 ├── Business Data
 └── Outbox Event
        ↓
Commit
        ↓
Worker
        ↓
External Action

kullanılabilir.

58. Migration

Schema değişiklikleri migration üzerinden yapılmalıdır.

Örneğin:

pnpm --filter @beauty-erp/database migrate:dev --name add_customer

Development migration oluşturur.

Production'da migration:

migrate deploy

ile uygulanmalıdır.

59. Migration Naming

Migration adı değişikliğin amacını açıkça belirtmelidir.

İyi:

add_customer
add_appointment_status
add_payment_indexes
create_inventory_tables

Kötü:

update
fix
change
test
60. Migration Review

Migration SQL review edilmelidir.

Özellikle:

DROP COLUMN
DROP TABLE
ALTER TYPE
Large UPDATE
Index Creation
NOT NULL migration

gibi destructive/expensive işlemler dikkatle incelenmelidir.

61. Zero-Downtime Migration

Production migration'larda mümkün olduğunca:

Expand
 ↓
Deploy
 ↓
Migrate Data
 ↓
Switch Code
 ↓
Contract

yaklaşımı tercih edilmelidir.

62. Adding Required Columns

Mevcut büyük tabloya doğrudan:

NOT NULL

column eklemek production'da riskli olabilir.

Gerekirse:

Nullable
 ↓
Backfill
 ↓
Validate
 ↓
NOT NULL

yaklaşımı uygulanmalıdır.

63. Index Migration

Büyük tablolarda index creation production impact açısından değerlendirilmelidir.

Gerektiğinde PostgreSQL'in uygun online/concurrent index yaklaşımı kullanılmalıdır.

64. Seed Data

Development seed data:

Tenant
Branch
Employee
Service
Customer

gibi temel entity'leri sağlayabilir.

Production seed işlemleri development seed ile karıştırılmamalıdır.

65. Seed Idempotency

Seed script mümkün olduğunca tekrar çalıştırıldığında duplicate production-like data oluşturmamalıdır.

Örneğin:

upsert

kullanılabilir.

66. Test Database

Automated tests için production database kullanılmamalıdır.

Test environment:

Separate Database

kullanmalıdır.

67. Test Isolation

Integration test'lerde test data birbirini etkilememelidir.

Gerekirse:

Transaction Rollback
Database Reset
Unique Test Tenant

yaklaşımları kullanılabilir.

68. Connection Management

Prisma Client process başına uygun şekilde singleton olarak yönetilmelidir.

Her request için yeni Prisma Client oluşturulmamalıdır.

Mevcut PrismaService bu pattern'in merkezi noktasıdır.

69. Redis Connection

Redis connection da merkezi olarak yönetilmelidir.

Her service kendi Redis client'ını yaratmamalıdır.

Mevcut:

RedisModule
RedisService

bu abstraction'ın temelidir.

70. Query Performance

N+1 query pattern'lerinden kaçınılmalıdır.

Özellikle:

Customer list
Appointment list
Sales report
Inventory report

gibi endpoint'lerde query count izlenmelidir.

71. Pagination

Büyük collection endpoint'lerinde pagination kullanılmalıdır.

Örneğin:

customers
appointments
sales
payments
audit events

sınırsız şekilde döndürülmemelidir.

72. Cursor Pagination

Büyük veya zaman bazlı dataset'lerde:

Cursor Pagination

değerlendirilebilir.

Özellikle:

Audit
Notifications
Appointments
Transactions

gibi sürekli büyüyen tablolarda uygundur.

73. Offset Pagination

Admin UI gibi daha küçük dataset'lerde:

page
limit

offset pagination yeterli olabilir.

Seçim dataset ve query pattern'e göre yapılmalıdır.

74. Query Selection

Gereksiz tüm kolonlar:

SELECT *

mantığıyla çekilmemelidir.

Prisma'da gerekli alanlar:

select

ile sınırlandırılabilir.

Özellikle sensitive fields için önemlidir.

75. Sensitive Fields

Şu alanlar default query response'larında bulunmamalıdır:

Password Hash
Refresh Token
Payment Secrets
Internal Credentials
Private Keys
Sensitive Identity Data
76. Reporting Queries

Heavy reporting query'leri transactional endpoint'leri yavaşlatmamalıdır.

Gerektiğinde:

Read Model
Materialized View
Background Job
Analytics Store

yaklaşımları değerlendirilebilir.

77. Search

Search gereksinimi büyüdüğünde database query'lerini sonsuza kadar zorlamak yerine:

PostgreSQL Search

veya ileride:

Dedicated Search Index

değerlendirilebilir.

78. JSON Fields

JSON/JSONB flexible metadata için kullanılabilir.

Ancak core relational business data JSON içine gömülmemelidir.

Kötü:

Customer
 └── jsonData
      ├── branchId
      ├── status
      └── employeeId

Core relation'lar relational model olarak tutulmalıdır.

79. Metadata

JSONB:

metadata

alanlarında uygun olabilir.

Örneğin:

Webhook metadata
Integration response metadata
Audit metadata
Provider metadata
80. Large Text

Büyük text content:

Feedback
Notes
Description
Campaign Content

için uygun PostgreSQL text type kullanılabilir.

Ancak büyük content API list response'larına gereksiz şekilde dahil edilmemelidir.

81. Binary Data

Binary dosyalar database içine mümkün olduğunca konulmamalıdır.

Object storage tercih edilmelidir.

Database:

file metadata

tutabilir.

82. Referential History

Historical business data başka entity silindiğinde kaybolmamalıdır.

Örneğin:

Sale

eski bir:

Service

kaydıyla ilişkilendirilmişse service artık aktif olmasa bile Sale history korunmalıdır.

83. Snapshot Data

Historical reporting gerekiyorsa bazı değerler snapshot olarak tutulabilir.

Örneğin SaleItem:

serviceName
unitPrice
discount
tax

gibi historical values tutabilir.

84. Business Snapshot Principle

Reference:

Service.currentPrice

gelecekte değişebilir.

Historical transaction:

SaleItem.unitPrice

değişmemelidir.

Bu principle financial data için özellikle önemlidir.

85. Constraints

Database constraints mümkün olduğunca business invariant'leri desteklemelidir.

Örneğin:

UNIQUE
NOT NULL
FOREIGN KEY
CHECK

uygun yerlerde kullanılabilir.

86. Database Check Constraints

Application validation'a ek olarak matematiksel invariant'ler database seviyesinde korunabilir.

Örneğin:

amount >= 0
quantity >= 0

gibi kurallar domain'e uygunsa CHECK constraint ile desteklenebilir.

87. Negative Values

Negative values business anlamına sahipse açıkça modellenmelidir.

Örneğin:

Refund
Adjustment
Accounting reversal

için negative amount kullanılabilir.

Her amount >= 0 constraint'i otomatik olarak doğru değildir.

88. Quantity Precision

Inventory quantity integer olmak zorunda değildir.

Örneğin:

20ml
0.5kg
1.25L

gibi tüketimler varsa Decimal quantity kullanılabilir.

89. Unit of Measure

Inventory item:

quantity
unit

birlikte değerlendirilmelidir.

Örneğin:

20 ml
5 kg
3 piece
90. Data Integrity Principle

Database schema yalnızca storage modeli değildir.

Aynı zamanda:

Business Invariants
Referential Integrity
Concurrency Safety
Historical Integrity

katmanıdır.

91. Database Review Checklist

Yeni model eklenirken:

[ ] Primary key
[ ] Tenant ownership
[ ] Foreign keys
[ ] Required vs nullable
[ ] createdAt
[ ] updatedAt
[ ] Business status
[ ] Unique constraints
[ ] Indexes
[ ] Delete behavior
[ ] Audit requirements
[ ] Historical snapshot requirements
[ ] Transaction boundary
[ ] Concurrency risks
[ ] Sensitive fields

kontrol edilmelidir.

92. Current Database State

Mevcut foundation:

PostgreSQL
Prisma 6
Tenant
PrismaService
DatabaseModule
Migrations

durumundadır.

İlk migration:

init_tenant

uygulanmıştır.

93. Current Database Rule

Şu aşamada:

Tenant

ilk core entity'dir.

Sonraki domain entity'leri tenant isolation ve relationship kurallarıyla eklenecektir.

94. Implementation Order

Önerilen entity sırası:

Tenant
   ↓
Branch
   ↓
Employee
   ↓
Customer
   ↓
Service
   ↓
Appointment
   ↓
Package
   ↓
Sale
   ↓
Payment
   ↓
Inventory
   ↓
Accounting
   ↓
Feedback
   ↓
Quality
95. Final Principle

Beauty ERP database'i:

Sadece uygulamanın verisini saklayan bir katman değil; tenant isolation, historical integrity, financial correctness ve business invariants'ın son güvenlik sınırıdır.