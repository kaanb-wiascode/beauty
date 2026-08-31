# Beauty ERP — API Conventions

> Bu doküman Beauty ERP HTTP API'sinin endpoint naming, HTTP methods, response format, pagination, filtering, validation, errors, versioning ve genel API davranış standartlarını tanımlar.

---

# 1. Core Principle

API:

```text
Predictable
Consistent
Versionable
Machine-readable
Tenant-aware
Secure

olmalıdır.

Aynı tipteki operasyonlar mümkün olduğunca aynı API convention'larını kullanmalıdır.

2. API Style

Beauty ERP başlangıçta:

REST-oriented HTTP API

kullanacaktır.

GraphQL veya RPC ayrı bir ihtiyaç oluşmadıkça temel API modeli değildir.

3. Base URL

API endpoint'leri kavramsal olarak:

/api/v1

prefix'i altında version'lanabilir.

Örneğin:

GET /api/v1/customers

Final global prefix implementation sırasında sabitlenecektir.

4. API Versioning

Public API version'ları:

v1
v2
v3

şeklinde major version olarak yönetilebilir.

İlk public contract:

v1

olacaktır.

5. Version Principle

Breaking change:

v1
 ↓
v2

gerektirebilir.

Backward-compatible değişiklikler mümkün olduğunca mevcut version içinde yapılmalıdır.

6. Resource Naming

Resource isimleri:

plural
lowercase
kebab-case when needed

olmalıdır.

Örnek:

/customers
/appointments
/employees
/payment-methods
/inventory-items
7. Avoid Verb Endpoints

Normal CRUD operasyonlarında:

POST /createCustomer
POST /deleteCustomer
POST /updateCustomer

gibi verb-based endpoint'ler kullanılmamalıdır.

Bunun yerine:

POST /customers
PATCH /customers/:id
DELETE /customers/:id

kullanılmalıdır.

8. HTTP Methods

Temel convention:

GET
POST
PATCH
DELETE
9. GET

GET resource okumak için kullanılır.

Örnek:

GET /customers
GET /customers/:id
GET /appointments/:id

GET mutation yapmamalıdır.

10. POST

POST yeni resource veya açıkça tanımlanmış command/business operation oluşturmak için kullanılabilir.

Örneğin:

POST /customers
POST /appointments

Business action:

POST /appointments/:id/cancel

gibi endpoint gerektiğinde kullanılabilir.

11. PATCH

PATCH partial update için kullanılır.

Örneğin:

PATCH /customers/:id

request yalnızca değişen alanları içerebilir.

12. PUT

PUT yalnızca semantic olarak full replacement gerekiyorsa kullanılabilir.

İlk sürümde:

PATCH

partial update için tercih edilir.

PUT gereksiz yere kullanılmamalıdır.

13. DELETE

DELETE resource silme/archival semantics'i için kullanılabilir.

Ancak business entity'lerde gerçek physical deletion yerine:

archive
soft delete
deactivate

gibi domain state'leri tercih edilebilir.

14. Business Actions

Bazı operations CRUD değildir.

Örneğin:

POST /appointments/:id/check-in
POST /appointments/:id/cancel
POST /appointments/:id/complete
POST /payments/:id/refund

Bu endpoint'ler explicit business action olarak kabul edilebilir.

15. Action Naming

Business action endpoint:

POST /resource/:id/action

formatında olabilir.

Örnek:

POST /appointments/:id/cancel
POST /appointments/:id/check-in
POST /payments/:id/refund

Action isimleri kısa ve domain anlamlı olmalıdır.

16. Nested Resources

Gerçek parent-child relationship varsa nested resource kullanılabilir.

Örneğin:

GET /customers/:customerId/appointments

Ancak gereksiz derin nesting kullanılmamalıdır.

17. Nesting Depth

Tercih:

/customers/:id/appointments

kaçınılmaz olmadıkça:

/tenants/:tenantId/branches/:branchId/customers/:customerId/appointments

gibi uzun URL'lerden kaçınılmalıdır.

Tenant context URL'nin tek güvenlik mekanizması değildir.

18. Tenant Context

Tenant authorization request context üzerinden belirlenebilir.

Örneğin:

Authenticated User
        ↓
Active Tenant
        ↓
Resource

Client'ın URL'de tenantId göndermesi tek başına authorization kanıtı değildir.

19. Tenant URL

Tenant-specific public API gerekirse:

/api/v1/tenants/:tenantId/...

kullanılabilir.

Ancak authorization yine membership üzerinden yapılmalıdır.

20. Current Tenant

Aktif tenant context authentication/session'dan türetilebilir.

Örneğin:

Authorization
        ↓
User
        ↓
Tenant Membership
        ↓
Active Tenant
21. Response Format

API response'ları tutarlı olmalıdır.

Tek resource:

{
  "id": "customer-123",
  "name": "Jane Doe"
}

Collection:

{
  "data": [
    {
      "id": "customer-123",
      "name": "Jane Doe"
    }
  ]
}

Final envelope implementation sırasında netleştirilecektir.

22. Collection Response

Collection endpoint:

GET /customers

response'u pagination metadata taşıyabilir.

Örneğin:

{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100
  }
}
23. Pagination

Büyük collection endpoint'leri pagination kullanmalıdır.

Pagination uygulanabilecek alanlar:

customers
appointments
payments
audit-events
inventory
employees
24. Offset Pagination

Başlangıçta:

page
pageSize

veya:

offset
limit

kullanılabilir.

Örneğin:

GET /customers?page=2&pageSize=20
25. Cursor Pagination

Büyük veya rapidly changing collection'larda cursor pagination değerlendirilebilir.

Örneğin:

GET /audit-events?cursor=abc123&limit=50
26. Pagination Default

Collection endpoint'lerinde default page size bulunmalıdır.

Örneğin:

pageSize = 20

Final default implementation sırasında belirlenmelidir.

27. Pagination Maximum

Client unlimited records isteyememelidir.

Örneğin:

pageSize <= maxPageSize

kontrolü uygulanmalıdır.

Final maximum değer endpoint/query profile'a göre belirlenebilir.

28. Sorting

Collection endpoint'leri gerektiğinde:

sort

parametresi destekleyebilir.

Örneğin:

GET /appointments?sort=scheduledAt
29. Sort Direction

Convention:

sort=scheduledAt:asc
sort=scheduledAt:desc

gibi olabilir.

Final syntax project-wide olarak tek formatta tutulmalıdır.

30. Sort Whitelist

Client istediği arbitrary database field üzerinde sort yapamamalıdır.

Örneğin yalnızca:

scheduledAt
createdAt
name

gibi whitelist edilmiş fields kullanılmalıdır.

31. Filtering

Collection endpoint'leri domain-specific filters destekleyebilir.

Örneğin:

GET /appointments?status=CONFIRMED

ve:

GET /customers?status=ACTIVE
32. Filter Validation

Unknown filter'lar mümkün olduğunca reject edilmelidir.

Client:

?randomDatabaseColumn=...

göndererek arbitrary query davranışı elde edememelidir.

33. Search

Text search için:

search

parametresi kullanılabilir.

Örneğin:

GET /customers?search=kaan
34. Search Semantics

Search:

case-insensitive
normalized
bounded

olmalıdır.

Search'in hangi fields üzerinde çalıştığı endpoint contract'ında tanımlanmalıdır.

35. Search vs Filter

Search:

free-text lookup

Filter:

structured field matching

anlamına gelir.

Örneğin:

?search=kaan

vs:

?status=ACTIVE
36. Date Filters

Date filters ISO 8601 kullanmalıdır.

Örneğin:

from=2026-08-01T00:00:00Z
to=2026-08-31T23:59:59Z
37. Timezone

API timestamp'leri UTC/ISO 8601 convention'ına göre taşınmalıdır.

Örneğin:

2026-08-24T16:00:00.000Z
38. Request Validation

Her public request validate edilmelidir.

Validation:

DTO/schema
 ↓
Controller boundary
 ↓
Application

girişinde yapılmalıdır.

39. Unknown Fields

Client'ın gönderdiği bilinmeyen fields mümkün olduğunca reject edilmelidir.

Bu typo kaynaklı hataları azaltır.

40. String Normalization

Business requirement varsa:

email
slug
phone

gibi alanlarda normalization uygulanabilir.

Normalization rules domain-specific olmalıdır.

41. IDs

API resource ID'leri opaque identifier olarak düşünülmelidir.

Client:

customerId

formatına business meaning yüklememelidir.

42. UUID

UUID kullanılacaksa response'ta standard string formatı kullanılabilir.

Örneğin:

550e8400-e29b-41d4-a716-446655440000
43. Null vs Missing

PATCH request'lerinde:

field missing

ile:

field: null

aynı anlamda olmak zorunda değildir.

Her endpoint bu semantic'i açıkça belirlemelidir.

44. PATCH Semantics

Örneğin:

{
  "phone": null
}

phone değerini temizlemek anlamına gelebilir.

Ama:

{}

phone alanına dokunmamak anlamına gelmelidir.

45. Create Response

POST create operation başarılı olduğunda:

201 Created

tercih edilir.

Response oluşturulan resource'u içerebilir.

46. Update Response

PATCH başarılı olduğunda:

200 OK

ve güncel resource döndürülebilir.

Alternatif olarak:

204 No Content

kullanılabilir.

Project-wide convention tutarlı olmalıdır.

47. Delete Response

DELETE:

204 No Content

dönebilir.

Soft delete/archive business operation ise ayrı action endpoint kullanılabilir.

48. Business Action Response

Örneğin:

POST /appointments/:id/cancel

işlemi sonrası güncel appointment döndürülebilir.

Bu:

200 OK

ile yapılabilir.

49. Empty Collection

Collection boşsa:

{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 0
  }
}

gibi normal successful response dönmelidir.

404 kullanılmamalıdır.

50. Not Found

Tek resource bulunamazsa:

404 Not Found

kullanılır.

Örneğin:

GET /customers/:id
51. Conflict

Resource mevcut state nedeniyle operation yapılamıyorsa:

409 Conflict

kullanılabilir.

Örneğin:

POST /appointments

aynı slot conflict oluşturuyorsa.

52. Unauthorized

Authentication yoksa:

401 Unauthorized
53. Forbidden

Authentication var ancak permission yoksa:

403 Forbidden
54. Rate Limit

Rate limit aşıldığında:

429 Too Many Requests

kullanılır.

Response uygun olduğunda retry information taşıyabilir.

55. Retry-After

Rate limiting veya temporary availability error'larında:

Retry-After

header'ı kullanılabilir.

56. Service Unavailable

Dependency veya application geçici olarak kullanılamıyorsa:

503 Service Unavailable

kullanılabilir.

57. Error Contract

Standart error response:

{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed.",
  "requestId": "req_123"
}

olabilir.

58. Error Details

Validation/business error gerektiğinde:

{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed.",
  "details": [
    {
      "field": "email",
      "code": "INVALID_EMAIL"
    }
  ],
  "requestId": "req_123"
}

kullanılabilir.

59. Stable Error Codes

Client:

code

alanına göre davranabilir.

Client:

message

string'ini parse etmemelidir.

60. Request ID

Her HTTP request için unique request ID oluşturulmalı veya trusted upstream request ID kontrollü şekilde propagate edilmelidir.

Response'ta:

requestId

bulunabilir.

61. Correlation ID

Asynchronous flows için:

correlationId

request boyunca taşınabilir.

62. Idempotency

Financial veya retry-sensitive mutation endpoint'lerinde idempotency değerlendirilebilir.

Örneğin:

POST /payments
Idempotency-Key: abc123
63. Idempotency Key

Idempotency key:

unique per logical operation

olmalıdır.

Aynı key farklı operation için tekrar kullanılmamalıdır.

64. Idempotent Response

Aynı valid idempotency key tekrar gönderilirse sistem mümkün olduğunca ilk operation'ın aynı logical result'unu döndürmelidir.

65. API Security

API:

Authentication
Authorization
Tenant Isolation
Validation
Rate Limiting

katmanlarını uygulamalıdır.

66. Client-Supplied Tenant ID

Client:

tenantId = tenant-B

göndererek tenant boundary'yi değiştirememelidir.

Tenant context server-side authorization ile doğrulanmalıdır.

67. Resource IDs

Resource ID tahmin edilebilir olsa bile authorization kontrolü atlanmamalıdır.

Örneğin:

GET /customers/123

gibi bir ID:

tenantId
+
permission
+
scope

kontrollerinden geçmelidir.

68. Pagination Security

Pagination/filter/sort query'leri:

bounded
validated
whitelisted

olmalıdır.

69. Query Complexity

Client tek request ile aşırı pahalı query çalıştıramamalıdır.

Örneğin:

huge pageSize
unbounded search
deep nesting
complex filters

kontrol edilmelidir.

70. Bulk Operations

Bulk endpoint gerekiyorsa:

POST /customers/bulk

gibi explicit endpoint kullanılabilir.

Bulk operation'lar:

validated
bounded
authorized
audited

olmalıdır.

71. Bulk Limits

Bulk request:

items <= maxBulkSize

ile sınırlandırılmalıdır.

Final limit operation'a göre belirlenir.

72. Partial Bulk Failure

Bulk operation'da:

all-or-nothing

veya:

partial success

semantiği açıkça belirlenmelidir.

Implicit davranış kullanılmamalıdır.

73. API Transactions

Bir API mutation birden fazla database write içeriyorsa transaction boundary application service tarafından yönetilebilir.

74. HTTP vs Domain

HTTP status code business domain'in kendisi değildir.

Örneğin:

APPOINTMENT_CONFLICT

domain/application error iken:

409

HTTP mapping'dir.

75. Controller Responsibility

Controller:

Parse
Validate
Authorize boundary
Call application service
Map response

işlerini yapmalıdır.

Business logic controller'a doldurulmamalıdır.

76. Application Service Responsibility

Application service:

Business orchestration
Transactions
Domain operations
Resource authorization

gibi işleri yönetebilir.

77. Repository Responsibility

Repository:

Persistence
Query
Tenant-scoped lookup

işlerini yapmalıdır.

HTTP semantics repository'ye taşınmamalıdır.

78. DTO Responsibility

DTO:

API input/output contract

içindir.

Database model DTO olarak doğrudan expose edilmemelidir.

79. Prisma Model Exposure

Prisma entity:

passwordHash
internalFlags
systemMetadata

gibi alanlar içerebilir.

Bunlar API response'a doğrudan serialize edilmemelidir.

80. Response DTO

Response DTO:

Explicit
Stable
Safe

olmalıdır.

Örneğin:

CustomerResponseDto
AppointmentResponseDto
PaymentResponseDto
81. Internal Fields

Internal field'lar API contract'a dahil edilmemelidir.

Örneğin:

internalVersion
debugMetadata
secret
providerToken
82. API Naming

JSON field isimleri:

camelCase

olmalıdır.

Örneğin:

{
  "firstName": "Jane",
  "createdAt": "2026-08-24T16:00:00.000Z"
}
83. Enum Values

Enum values API contract'ta stable ve açık olmalıdır.

Örneğin:

ACTIVE
SUSPENDED
CANCELLED
COMPLETED
84. Enum Evolution

Yeni enum value eklemek çoğu durumda backward-compatible olabilir.

Enum removal breaking change olarak değerlendirilmelidir.

85. Dates

Date-only ve timestamp ayrıştırılmalıdır.

Date-only:

2026-08-24

Timestamp:

2026-08-24T16:00:00.000Z
86. Money

Money değerleri floating point olarak API contract'a bırakılmamalıdır.

Önerilen yaklaşımlar:

integer minor units

veya:

decimal string

domain gereksinimine göre seçilebilir.

Örneğin:

{
  "amount": "1250.50",
  "currency": "TRY"
}
87. Currency

Money response'larında currency explicit olmalıdır.

Örneğin:

{
  "amount": "1250.50",
  "currency": "TRY"
}
88. Phone Numbers

Phone number formatı domain-level canonicalization ile belirlenmelidir.

Client'ın arbitrary formatları persistence'a doğrudan yazılmamalıdır.

89. Email

Email:

validated
normalized where appropriate

olmalıdır.

Ancak normalization business identity rules ile uyumlu olmalıdır.

90. Slugs

Slug public URL/resource identifier olarak kullanılıyorsa:

lowercase
stable
unique

olmalıdır.

Slug değişimi gerekiyorsa redirect/history semantics ayrıca düşünülmelidir.

91. API Documentation

Public endpoint'ler OpenAPI/Swagger ile dokümante edilebilir.

Dokümantasyon:

Request
Response
Errors
Authentication
Authorization

bilgilerini içermelidir.

92. OpenAPI

NestJS API için OpenAPI integration kullanılabilir.

Ancak generated documentation ile gerçek API behavior arasında drift oluşmamalıdır.

93. API Examples

Her önemli endpoint için en az:

Success
Validation failure
Authorization failure
Not found
Conflict

örnekleri dokümante edilebilir.

94. Deprecation

Bir endpoint kaldırılacaksa doğrudan silmek yerine:

Active
 ↓
Deprecated
 ↓
Migration period
 ↓
Removed

süreci izlenmelidir.

95. Deprecation Header

Gerektiğinde:

Deprecation
Sunset

gibi HTTP headers kullanılabilir.

96. Backward Compatibility

Backward-compatible değişiklikler:

Add optional field
Add new endpoint
Add new filter
Add new enum carefully

gibi olabilir.

97. Breaking Changes

Breaking change örnekleri:

Remove field
Rename field
Change field type
Remove enum
Change endpoint semantics
Change required request field

major API version gerektirebilir.

98. API Contract Tests

API contract testleri:

Request schema
Response schema
Status codes
Error codes

gibi contract'ları doğrulayabilir.

99. Performance

API endpoint'leri:

bounded
indexed
paginated

query pattern'leri kullanmalıdır.

100. N+1

Collection endpoint'lerinde N+1 query pattern'lerinden kaçınılmalıdır.

Örneğin:

GET /appointments

her appointment için ayrı:

customer query
employee query
branch query

çalıştırmamalıdır.

101. Query Projection

Response yalnızca ihtiyaç duyduğu fields'ları query edebilirse performans ve data exposure açısından avantaj sağlar.

102. Caching

Cache kullanılacaksa:

tenant-aware
authorization-aware
invalidatable

olmalıdır.

103. Cache Key

Tenant-owned resource cache key'leri tenant context içermelidir.

Örneğin:

tenant:{tenantId}:customer:{customerId}
104. Cache Leakage

Tenant A'nın cache entry'si:

tenant-A:customer:123

Tenant B tarafından yanlışlıkla okunamamalıdır.

105. API Rate Limiting

Rate limit:

IP
User
Tenant
Endpoint

gibi context'lere göre uygulanabilir.

Final strategy endpoint riskine göre belirlenecektir.

106. Sensitive Endpoints

Özellikle:

login
password reset
payment
refund
bulk export
audit

endpoint'lerinde daha sıkı rate limiting gerekebilir.

107. Current State

Mevcut foundation:

NestJS
Prisma
PostgreSQL
Redis
Config
Health

durumundadır.

API convention'ların tamamı henüz implementation edilmemiştir.

Bu doküman hedef standardı tanımlar.

108. Implementation Order

Önerilen sıra:

Global /api/v1 prefix
 ↓
Global validation
 ↓
Global exception filter
 ↓
Request ID
 ↓
Response conventions
 ↓
Pagination helpers
 ↓
API error contract
 ↓
Authentication
 ↓
Authorization
 ↓
OpenAPI
 ↓
Rate limiting
109. First API Standards

İlk gerçek domain endpoint'leri oluşturulurken:

[ ] Consistent resource naming
[ ] DTO validation
[ ] Tenant context
[ ] Permission check
[ ] Stable response
[ ] Stable error code
[ ] Request ID
[ ] Pagination where needed
[ ] Audit for sensitive mutations

kontrol edilmelidir.

110. Final Principle

Beauty ERP API:

HTTP katmanını business domain'den ayırır; resource-oriented endpoint'ler, stable error codes, tenant-aware authorization, explicit validation ve versioned contracts kullanarak öngörülebilir bir API sağlar.