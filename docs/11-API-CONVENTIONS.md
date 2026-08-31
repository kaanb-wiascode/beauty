# Beauty ERP — API Conventions

> Bu doküman Beauty ERP API'sinin endpoint, request, response, authentication, authorization, pagination, filtering, error ve versioning standartlarını tanımlar.

---

# 1. API Stack

Backend:

```text
NestJS
TypeScript
PostgreSQL
Prisma
Redis

API'nin temel görevi:

HTTP Request
    ↓
Authentication
    ↓
Authorization
    ↓
Validation
    ↓
Application Service
    ↓
Domain Logic
    ↓
Database / External Services
    ↓
HTTP Response
2. API Boundary

Controller yalnızca HTTP boundary sorumluluğunu taşımalıdır.

Controller:

Request
 ↓
Validation
 ↓
Application Service
 ↓
Response

akışını yönetir.

Business logic controller içine taşınmamalıdır.

3. Endpoint Naming

REST-style resource naming tercih edilir.

Örnek:

GET    /customers
POST   /customers
GET    /customers/:id
PATCH  /customers/:id
DELETE /customers/:id

Action endpoint'leri yalnızca resource operation doğal olarak REST resource update ile ifade edilemiyorsa kullanılmalıdır.

4. Resource Names

Endpoint resource isimleri çoğul kullanılmalıdır.

İyi:

/customers
/appointments
/employees
/services
/payments

Kaçınılması gereken:

/customer
/getCustomers
/createCustomer
5. Nested Resources

İlişki açıkça endpoint yapısına katkı sağlıyorsa nested resource kullanılabilir.

Örneğin:

GET /branches/:branchId/employees
GET /customers/:customerId/appointments

Ancak gereksiz derin nesting yapılmamalıdır.

Kaçınılması gereken:

/tenants/:tenantId/branches/:branchId/employees/:employeeId/appointments/:appointmentId

Her endpoint'in URL'sinde bütün parent chain'i taşımak zorunlu değildir.

Tenant context authenticated request'ten alınabiliyorsa URL'e tekrar koyulmamalıdır.

6. Tenant Context

Tenant-aware API'de tenant:

Authenticated User
        ↓
Tenant Membership
        ↓
Current Tenant Context

üzerinden belirlenmelidir.

Client'ın gönderdiği:

tenantId

tek başına güvenilir authorization kaynağı değildir.

7. Tenant Isolation

Tenant-owned resource erişiminde:

authenticatedTenantId

ile resource'un:

tenantId

eşleşmesi zorunludur.

Örneğin:

GET /customers/customer-A

isteği farklı tenant'ın customer'ını döndürmemelidir.

8. Authentication

Authentication:

Who are you?

sorusunu cevaplar.

Authorization:

What are you allowed to do?

sorusunu cevaplar.

Bu iki kavram birbirine karıştırılmamalıdır.

9. Authentication Boundary

Authentication mümkün olduğunca merkezi guard/middleware seviyesinde uygulanmalıdır.

Controller'ların her birinde manuel token parsing yapılmamalıdır.

10. Authorization

Authorization:

Tenant
+
User
+
Role
+
Permission
+
Resource Scope

kombinasyonuna göre değerlendirilebilir.

Örneğin:

User
 ↓
Tenant membership
 ↓
Role
 ↓
Permission
 ↓
Resource access
11. Roles

Role örnekleri:

OWNER
ADMIN
MANAGER
STAFF
ACCOUNTANT
RECEPTION

gibi olabilir.

Final role listesi domain/authentication implementation aşamasında netleştirilecektir.

12. Permissions

Permission'lar mümkün olduğunca action-oriented olabilir.

Örneğin:

customers.read
customers.write
appointments.read
appointments.write
payments.read
payments.write
inventory.read
inventory.write
reports.read

Role → permission mapping application seviyesinde yönetilebilir.

13. Resource Authorization

Permission sahibi olmak resource erişiminin her zaman yeterli olduğu anlamına gelmez.

Örneğin:

User
 └── Permission: appointments.read

varsa bile user yalnızca yetkili tenant/branch scope'undaki appointment'ları görebilir.

14. HTTP Methods

Temel mapping:

GET
Read

POST
Create / Command

PUT
Full replacement

PATCH
Partial update

DELETE
Delete / Deactivate
15. POST

Yeni resource veya command oluşturmak için:

POST

kullanılır.

Örnek:

POST /customers
POST /appointments
POST /payments
16. PATCH

Kısmi update için:

PATCH /customers/:id

kullanılabilir.

Request yalnızca değişen alanları içerebilir.

17. PUT

Resource'un tamamının replacement semantiği gerekiyorsa:

PUT

kullanılabilir.

Gereksiz yere her update için PUT kullanılmamalıdır.

18. DELETE

DELETE gerçekten resource'un lifecycle'ından kaldırılması anlamına geliyorsa kullanılabilir.

Business entity'lerde çoğu zaman:

Deactivate
Archive
Cancel
Soft Delete

daha doğru olabilir.

19. Action Endpoints

Bazı business operation'lar resource state transition olarak ifade edilebilir.

Örneğin:

POST /appointments/:id/check-in
POST /appointments/:id/cancel
POST /appointments/:id/complete

gibi endpoint'ler kullanılabilir.

Bu endpoint'lerde state transition validation zorunludur.

20. State Transition

Örneğin:

SCHEDULED
 ↓
CONFIRMED
 ↓
CHECKED_IN
 ↓
IN_SERVICE
 ↓
COMPLETED

bir state machine oluşturuyorsa API yalnızca geçerli transition'lara izin vermelidir.

Frontend state kontrolü güvenlik mekanizması değildir.

21. Request Validation

Her externally supplied request validation'dan geçmelidir.

Validation:

Body
Query
Params
Headers

için uygulanabilir.

22. Validation Schema

Validation schema:

DTO
Schema

yaklaşımlarından biriyle merkezi ve explicit tutulmalıdır.

Zod kullanılıyorsa mevcut project validation yaklaşımıyla uyumlu kullanılmalıdır.

23. Unknown Fields

Request body'deki beklenmeyen field'lar mümkün olduğunca reddedilmeli veya açıkça strip edilmelidir.

Özellikle:

role
tenantId
permissions
status
createdAt

gibi client'ın değiştirmemesi gereken alanlar silently kabul edilmemelidir.

24. Mass Assignment

Client'ın gönderdiği object doğrudan database modeline aktarılmamalıdır.

Kötü:

prisma.customer.create({
  data: req.body
})

Bunun yerine:

Validated Input
      ↓
Application DTO
      ↓
Explicit Mapping
      ↓
Database

kullanılmalıdır.

25. Response Contract

API response'ları stabil ve predictable olmalıdır.

Örneğin:

{
  "id": "uuid",
  "name": "Example",
  "createdAt": "2026-08-24T16:00:00.000Z"
}
26. Response Envelope

Tek resource response'larında gereksiz envelope kullanılmamalıdır.

Örneğin:

{
  "data": {
    "id": "..."
  }
}

kullanılacaksa tüm API'de tutarlı olmalıdır.

Project-wide response envelope kararı API implementation aşamasında sabitlenecektir.

27. Collection Response

Collection endpoint'lerinde pagination metadata gerekmiyorsa:

[
  {}
]

kullanılabilir.

Pagination varsa:

{
  "items": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}

gibi structured response tercih edilebilir.

28. Pagination

Büyük collection'lar pagination olmadan döndürülmemelidir.

Örneğin:

GET /customers?page=1&limit=20
29. Pagination Limit

Client'ın:

limit=1000000

gibi request'lerle sistemi zorlaması engellenmelidir.

Default ve maximum limit belirlenmelidir.

Örnek:

default = 20
maximum = 100

Final değer endpoint ihtiyaçlarına göre değişebilir.

30. Cursor Pagination

Büyük ve sürekli büyüyen collection'larda cursor pagination tercih edilebilir.

Örneğin:

GET /audit-events?cursor=...

Cursor opaque olmalıdır.

Client cursor'un internal database ID anlamına güvenmemelidir.

31. Sorting

Sorting explicit query parameter ile yapılabilir.

Örneğin:

GET /appointments?sortBy=scheduledAt&sortOrder=asc

Allowed sort fields whitelist ile sınırlandırılmalıdır.

32. Filtering

Filtering:

GET /appointments?status=CONFIRMED

gibi query parameter'larla yapılabilir.

Client'ın arbitrary SQL/filter expression göndermesine izin verilmemelidir.

33. Search

Basit text search:

GET /customers?search=kaan

gibi yapılabilir.

Search field'ları backend tarafından whitelist edilmelidir.

34. Date Filters

Tarih filtrelerinde açık semantics kullanılmalıdır.

Örneğin:

from
to

veya:

startDate
endDate

kullanılabilir.

Timezone behavior dokümante edilmelidir.

35. Timezone

API timestamp response'ları:

ISO 8601
UTC

formatında verilmelidir.

Örnek:

2026-08-24T16:00:00.000Z
36. Business Timezone

Appointment gibi business operations local timezone'a bağlıysa:

Tenant
Branch

timezone bilgisi business logic tarafından dikkate alınmalıdır.

37. Money Response

Money response formatı API boyunca tutarlı olmalıdır.

Önerilen yapı:

{
  "amount": "1250.00",
  "currency": "TRY"
}

Floating point representation kullanılmamalıdır.

38. Error Response

Standart error contract:

{
  "statusCode": 409,
  "code": "APPOINTMENT_CONFLICT",
  "message": "The selected time is no longer available.",
  "requestId": "req_123"
}

Error code machine-readable olmalıdır.

39. Error Code

Client business logic'i:

message

string'ine göre yazmamalıdır.

Bunun yerine:

code

kullanılmalıdır.

40. Request ID

Her request mümkün olduğunca unique request ID ile ilişkilendirilmelidir.

Örneğin:

X-Request-Id: req_123

Response'ta da döndürülebilir.

41. Correlation

Request ID:

HTTP
 ↓
Application
 ↓
Database
 ↓
Redis
 ↓
Queue
 ↓
External Provider

log context'inde mümkün olduğunca korunmalıdır.

42. Idempotency

Retry edilebilen mutation endpoint'lerinde idempotency değerlendirilebilir.

Özellikle:

Payments
Orders
Sales
Webhooks
External Integrations

için önemlidir.

43. Idempotency Header

Örnek:

Idempotency-Key: <opaque-key>

kullanılabilir.

Key server tarafından doğrulanmalı ve uygun scope ile saklanmalıdır.

44. Idempotency Scope

Idempotency key yalnızca key string'i üzerinden global unique kabul edilmemelidir.

Gerekirse:

tenantId
+
userId
+
endpoint
+
idempotencyKey

kombinasyonu kullanılabilir.

45. Idempotency Conflict

Aynı key farklı request body ile kullanılırsa:

IDEMPOTENCY_KEY_REUSED

gibi stable error code döndürülebilir.

46. Authentication Errors

Authentication başarısızsa:

401 Unauthorized

kullanılır.

Sensitive authentication details response'ta açığa çıkarılmamalıdır.

47. Authorization Errors

Authenticated user resource/action için yetkili değilse:

403 Forbidden

kullanılır.

Tenant isolation durumlarında information leakage önlemek için bazı resource erişimleri 404 olarak modellenebilir.

48. Not Found

Resource bulunmuyorsa:

404 Not Found

kullanılır.

Örneğin:

GET /customers/:id
49. Conflict

Business conflict:

409 Conflict

kullanılabilir.

Örneğin:

APPOINTMENT_CONFLICT
DUPLICATE_RESOURCE
RESOURCE_VERSION_CONFLICT
IDEMPOTENCY_KEY_REUSED
50. Validation Error

Request validation:

400

veya project-wide belirlenen validation status convention'a göre:

422

ile döndürülebilir.

Tek bir convention kullanılmalıdır.

51. Rate Limit

Rate limit:

429 Too Many Requests

olmalıdır.

Gerekirse:

Retry-After

header'ı gönderilebilir.

52. Server Errors

Unexpected application errors:

500 Internal Server Error

olarak dönmelidir.

Internal stack trace client'a gönderilmemelidir.

53. External Dependency Errors

External provider geçici olarak kullanılamıyorsa:

502
503
504

uygun semantics'e göre kullanılabilir.

Client'a provider'ın internal exception message'i aktarılmamalıdır.

54. API Versioning

API versioning stratejisi erken aşamada belirlenmelidir.

Örneğin:

/api/v1

gibi URL versioning kullanılabilir.

Final versioning implementation'ı public API yayınlanmadan önce sabitlenmelidir.

55. Breaking Changes

Breaking change:

Remove field
Rename field
Change type
Change semantics
Change requiredness
Change error contract

gibi API client'larını etkileyen değişikliklerdir.

Breaking change kontrollü versioning gerektirir.

56. Non-Breaking Changes

Genellikle:

Add optional response field
Add new endpoint
Add new optional filter

non-breaking olabilir.

Ancak client parser davranışı yine değerlendirilmelidir.

57. API Documentation

Public/internal API endpoint'leri mümkün olduğunca OpenAPI/Swagger ile dokümante edilmelidir.

Dokümantasyon:

Request
Response
Authentication
Authorization
Errors
Examples

bilgilerini içermelidir.

58. DTO Naming

DTO isimleri operation'a göre açık olabilir.

Örneğin:

CreateCustomerDto
UpdateCustomerDto
CreateAppointmentDto
UpdateAppointmentDto
59. Response DTO

Database entity doğrudan API response olarak döndürülmemelidir.

Bunun yerine:

Database Model
      ↓
Mapper
      ↓
Response DTO
      ↓
HTTP

kullanılabilir.

Bu sensitive field leakage riskini azaltır.

60. API Model vs Database Model

API representation ile database representation aynı olmak zorunda değildir.

Örneğin database:

firstName
lastName

tutarken API:

{
  "fullName": "Kaan Example"
}

dönebilir.

61. API Contract Stability

Frontend/mobile client API response'larına dependency kuracaktır.

Bu nedenle:

Field names
Types
Error codes
Status codes

gereksiz şekilde değiştirilmemelidir.

62. Backward Compatibility

Mobil uygulamalar web client'tan daha uzun süre eski API versiyonuyla çalışabilir.

Bu nedenle mobile compatibility özellikle dikkate alınmalıdır.

63. Deprecation

Endpoint kaldırılacaksa doğrudan silmek yerine:

Active
 ↓
Deprecated
 ↓
Migration Period
 ↓
Removed

süreci uygulanmalıdır.

64. API Security

API:

Authentication
Authorization
Validation
Rate Limiting
Tenant Isolation
Input Sanitization

kontrollerini server-side yapmalıdır.

Client-side validation yalnızca UX içindir.

65. CORS

CORS allowed origins production ortamında explicit olarak tanımlanmalıdır.

Wildcard:

*

authentication gerektiren production API'lerde dikkatle kullanılmalıdır.

66. Secrets

API response veya logs içinde:

DATABASE_URL
REDIS_URL
JWT_SECRET
API_KEY
PASSWORD
TOKEN

gibi secret değerler bulunmamalıdır.

67. Health Endpoint

Foundation health endpoint:

GET /health

şeklindedir.

Örneğin:

{
  "status": "ok",
  "timestamp": "2026-08-24T16:08:32.760Z",
  "services": {
    "database": "up",
    "redis": "up"
  }
}

Bu endpoint deployment ve infrastructure monitoring için kullanılabilir.

68. Health Endpoint Security

Health endpoint sensitive infrastructure details açığa çıkarmamalıdır.

Internal operational health ile public liveness/readiness semantics gerektiğinde ayrılabilir.

69. Logging

Her request için full request body loglanmamalıdır.

Özellikle:

Password
Token
Payment Data
PII

loglanmamalıdır.

70. Audit vs Application Log

Application log:

System behavior
Debugging
Errors
Performance

içindir.

Audit log:

Who
Did what
To which resource
When

sorusunu cevaplar.

İkisi aynı şey değildir.

71. Audit API

Audit endpoint'leri:

GET /audit-events

gibi admin-only resource olarak modellenebilir.

Audit records normal business users tarafından değiştirilememelidir.

72. Pagination Metadata

Pagination response'larında mümkün olduğunca:

items
page/cursor
limit
hasNext

gibi client'ın navigation yapmasına yetecek bilgiler bulunmalıdır.

total hesaplaması pahalıysa her endpoint'te zorunlu değildir.

73. Query Parameter Validation

Allowed values whitelist edilmelidir.

Örneğin:

sortBy=scheduledAt

geçerli olabilirken:

sortBy=DROP TABLE

gibi arbitrary input backend query builder'a ulaşmamalıdır.

74. Bulk Operations

Bulk mutation endpoint'leri dikkatli tasarlanmalıdır.

Örneğin:

POST /customers/bulk-import

gibi işlemlerde:

Maximum batch size
Validation strategy
Partial failure behavior
Idempotency
Audit

belirlenmelidir.

75. Partial Failure

Bulk operation'da bazı records başarısız olabilir.

API contract açıkça belirtmelidir:

All-or-nothing

veya:

Partial success
76. File Upload

Dosya upload endpoint'lerinde:

File size
MIME type
Extension
Authentication
Authorization
Virus scanning
Storage

kontrolleri yapılmalıdır.

Dosya doğrudan database içine binary olarak konulmamalıdır.

77. Webhooks

Webhook endpoint'leri:

Authentication
Signature Verification
Replay Protection
Idempotency
Logging

gerektirir.

Webhook payload'ı doğrudan trusted input kabul edilmemelidir.

78. External Integrations

External API client'ları controller içine yazılmamalıdır.

Önerilen:

Controller
 ↓
Application Service
 ↓
Integration Service
 ↓
Provider Adapter
79. Provider Adapter

Provider-specific implementation:

StripeAdapter
SMSProviderAdapter
EmailProviderAdapter
AccountingProviderAdapter

gibi abstraction arkasında tutulabilir.

Business logic provider-specific response formatına bağımlı olmamalıdır.

80. Timeout

External HTTP calls için explicit timeout belirlenmelidir.

Sonsuz request beklemek kabul edilemez.

81. Retry

Retry yalnızca retryable operation'larda uygulanmalıdır.

Özellikle mutation'larda:

Retry
+
Idempotency

birlikte değerlendirilmelidir.

82. Circuit Breaker

Kritik external dependency sürekli başarısızsa circuit breaker değerlendirilebilir.

Örneğin:

Provider
 ↓
Failure spike
 ↓
Circuit Open
 ↓
Fast Fail
83. Cache

API cache kullandığında cache:

Performance optimization

olarak kabul edilmelidir.

Business correctness cache'e bağlı olmamalıdır.

84. Cache Invalidation

Write operation sonrasında ilgili cache invalidation yapılmalıdır.

Örneğin:

Update Service Price
        ↓
Invalidate Service Cache
85. Cache Failure

Redis down olduğunda mümkünse kritik business operation tamamen çalışamaz hale getirilmemelidir.

Cache failure ile source-of-truth failure birbirinden ayrılmalıdır.

86. Async Operations

Uzun süren işlemler synchronous HTTP request içinde yapılmamalıdır.

Örneğin:

Large Import
Report Generation
Bulk Notification
Data Export

queue/job sistemine taşınabilir.

87. Async Response

Async operation için:

202 Accepted

kullanılabilir.

Örneğin:

{
  "jobId": "uuid",
  "status": "queued"
}
88. Job Status

Uzun süren job için:

GET /jobs/:id

gibi status endpoint'i kullanılabilir.

89. API Observability

API'nin temel observability alanları:

Request count
Latency
4xx rate
5xx rate
Database latency
Redis latency
External provider latency
Queue failures

olmalıdır.

90. Request Latency

API latency ölçümlerinde:

p50
p95
p99

gibi percentiles değerlendirilebilir.

Average latency tek başına yeterli değildir.

91. API Checklist

Yeni endpoint eklenirken:

[ ] Resource/action name
[ ] HTTP method
[ ] Authentication
[ ] Authorization
[ ] Tenant scope
[ ] Request validation
[ ] DTO
[ ] Application service
[ ] Response contract
[ ] Error codes
[ ] Pagination
[ ] Filtering
[ ] Sorting
[ ] Idempotency
[ ] Audit
[ ] Logging
[ ] Rate limiting
[ ] OpenAPI documentation
[ ] Tests

kontrol edilmelidir.

92. Current API State

Şu anda API foundation:

NestJS
Config
Prisma
PostgreSQL
Redis
Health

içermektedir.

Current health endpoint:

GET /health

çalışmaktadır.

93. Current API Principle

Yeni feature geliştirirken hedef:

Controller
 ↓
Application Service
 ↓
Domain
 ↓
Infrastructure

separation'ını korumaktır.

94. Final Principle

Beauty ERP API:

Client'ın HTTP request'lerini business-safe, tenant-safe ve predictable application operations'a dönüştüren bir boundary'dir.

API contract:

Stable
Secure
Validated
Observable
Tenant-aware
Machine-readable

olmalıdır.