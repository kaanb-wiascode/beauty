# Beauty ERP — API Contracts

> Bu doküman Beauty ERP API'sinin dışarıya sunduğu HTTP sözleşmelerinin temel kurallarını tanımlar.
>
> Endpoint'lerin nihai request/response şemaları ilgili domain geliştirilirken genişletilecektir.

---

# 1. API Architecture

Backend:

```text
NestJS

API:

REST / JSON

Temel akış:

Client
  ↓
HTTP
  ↓
Controller
  ↓
Application Service
  ↓
Domain
  ↓
Repository
  ↓
Database
2. API Base Path

API endpoint'leri versioned olmalıdır.

Önerilen yapı:

/api/v1

Örnek:

GET /api/v1/health
GET /api/v1/customers
POST /api/v1/appointments

Health endpoint'i infrastructure seviyesinde version dışında tutulabilir:

GET /health
3. Content Type

Request:

Content-Type: application/json

Response:

Content-Type: application/json

Dosya upload gibi özel durumlarda uygun multipart format kullanılabilir.

4. JSON Naming

API JSON alanlarında:

camelCase

kullanılacaktır.

Örnek:

{
  "firstName": "Ali",
  "lastName": "Yılmaz",
  "createdAt": "2026-08-24T16:00:00Z"
}

Database naming convention bundan bağımsız olabilir.

5. HTTP Methods

Standart HTTP methodları kullanılacaktır.

GET
POST
PATCH
DELETE

Genel kullanım:

GET     → Resource reading
POST    → Resource creation / action
PATCH   → Partial update
DELETE  → Resource removal / deactivation

Finansal işlemlerde DELETE fiziksel silme anlamına gelmeyebilir.

6. Resource Naming

Endpoint isimleri çoğunlukla çoğul resource adı kullanmalıdır.

Örnek:

/customers
/appointments
/services
/employees
/branches
/sales
/payments
7. Resource IDs

API resource ID'leri UUID formatında olabilir.

Örnek:

GET /api/v1/customers/550e8400-e29b-41d4-a716-446655440000

Client'lar database internal implementation detaylarına bağımlı olmamalıdır.

8. Authentication

Protected endpoint'lerde authentication gerekir.

Önerilen header:

Authorization: Bearer <token>

Authentication detayları 06-AUTHORIZATION.md dokümanında tanımlanacaktır.

9. Tenant Context

Tenant context client tarafından güvenilir biçimde belirlenmemelidir.

Örneğin:

X-Tenant-Id

gibi bir header gönderilse bile authorization tarafından doğrulanmalıdır.

Temel prensip:

Kullanıcının erişebildiği tenant backend tarafından belirlenir ve doğrulanır.

10. Authorization Context

Request işlendiğinde backend mümkün olduğunca şu context'i oluşturmalıdır:

RequestContext
├── requestId
├── userId
├── tenantId
├── legalEntityId
├── regionId
├── branchId
└── roles / permissions

Her domain ihtiyacı olan scope'u bu context üzerinden kullanmalıdır.

11. Request ID

Her HTTP request için bir request ID bulunmalıdır.

Önerilen header:

X-Request-Id

Client request ID gönderebilir.

Ancak güvenlik ve tracing kuralları doğrultusunda server tarafından yeniden üretilebilir veya doğrulanabilir.

Response'ta request ID bulunmalıdır:

X-Request-Id: abc-123

Amaç:

HTTP Request
    ↓
Application Log
    ↓
Database Audit
    ↓
External Provider

zincirinin izlenebilmesidir.

12. Response Structure

Başarılı response'larda mümkün olduğunca tutarlı yapı kullanılmalıdır.

Tek resource:

{
  "data": {
    "id": "..."
  }
}

Liste:

{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100
  }
}

Endpoint'in doğasına göre doğrudan primitive response kullanılabilir.

13. Error Response

Hata response'ları standartlaştırılmalıdır.

Örnek:

{
  "error": {
    "code": "CUSTOMER_NOT_FOUND",
    "message": "Customer was not found.",
    "requestId": "abc-123"
  }
}

Validation:

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [
      {
        "field": "email",
        "code": "INVALID_EMAIL"
      }
    ],
    "requestId": "abc-123"
  }
}
14. Error Codes

HTTP status code tek başına business error bilgisini taşımamalıdır.

Örnek:

CUSTOMER_NOT_FOUND
APPOINTMENT_NOT_FOUND
APPOINTMENT_CONFLICT
PACKAGE_SESSION_EXHAUSTED
PAYMENT_FAILED
PAYMENT_ALREADY_PROCESSED
INSUFFICIENT_STOCK
FORBIDDEN_BRANCH_ACCESS

Error code'lar stable contract olarak ele alınmalıdır.

15. HTTP Status Codes

Genel kullanım:

200 OK
201 Created
204 No Content
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests
500 Internal Server Error
503 Service Unavailable

Her endpoint için uygun status code seçilmelidir.

16. Validation

Tüm dış request input'ları doğrulanmalıdır.

Validation katmanı:

HTTP Input
   ↓
Schema Validation
   ↓
Application

şeklinde çalışmalıdır.

Client input'una güvenilmemelidir.

17. Validation Error

Validation hatası:

422 Unprocessable Entity

olarak değerlendirilebilir.

Örnek:

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [
      {
        "field": "phone",
        "code": "INVALID_PHONE"
      }
    ]
  }
}
18. Pagination

Liste endpoint'leri pagination desteklemelidir.

İlk aşamada:

page
pageSize

kullanılabilir.

Örnek:

GET /customers?page=2&pageSize=25

Milyonlarca kayıt ölçeğinde cursor pagination ayrıca değerlendirilecektir.

19. Filtering

Filtreler query parameter üzerinden verilebilir.

Örnek:

GET /customers?status=active

veya:

GET /appointments?branchId=...&status=confirmed

Filtre alanları domain bazında açıkça tanımlanmalıdır.

Arbitrary database filtering API'ye açılmamalıdır.

20. Sorting

Liste endpoint'lerinde kontrollü sorting desteklenebilir.

Örnek:

?sort=createdAt
?sort=-createdAt

Sadece izin verilen field'lar sortable olmalıdır.

21. Search

Search endpoint'leri domain'e özel tasarlanmalıdır.

Örneğin:

GET /customers?search=0532

gibi bir arama olabilir.

Database implementation detayları API sözleşmesine sızdırılmamalıdır.

22. Date Filters

Tarih filtrelerinde ISO 8601 kullanılmalıdır.

Örnek:

?from=2026-08-01T00:00:00Z
&to=2026-08-31T23:59:59Z

Timezone yorumları açıkça tanımlanmalıdır.

23. Create Operations

Create endpoint:

POST /api/v1/customers

Örnek:

{
  "firstName": "Ali",
  "lastName": "Yılmaz",
  "phone": "+905321234567"
}

Başarılı response:

201 Created
24. Update Operations

Partial update için:

PATCH

kullanılacaktır.

Örnek:

PATCH /api/v1/customers/:id

Sadece gönderilen alanlar güncellenmelidir.

25. Delete Operations

DELETE davranışı domain'e göre belirlenmelidir.

Özellikle:

Payment
Accounting
Audit
Completed appointment
Historical sale

gibi kayıtlar fiziksel olarak silinmemelidir.

Bu durumda lifecycle/status/deactivation kullanılabilir.

26. Idempotency

Aşağıdaki operasyonlarda idempotency kritik olabilir:

Payment
Refund
Webhook processing
Inventory consumption
Package session consumption
Migration

Client tarafından gönderilen:

Idempotency-Key: <unique-key>

desteklenebilir.

Aynı key ile gelen işlem duplicate business effect oluşturmamalıdır.

27. Payment API

Ödeme başlatma örneği:

POST /api/v1/payments

Örnek:

{
  "saleId": "...",
  "amount": "1000.00",
  "currency": "TRY",
  "method": "CARD"
}

Response:

{
  "data": {
    "id": "...",
    "status": "PENDING"
  }
}

Ödeme provider callback'i ayrı endpoint üzerinden işlenebilir.

28. Payment Webhook

Webhook:

POST /api/v1/webhooks/payments/:provider

Webhook:

signature verification
idempotency
provider transaction validation
event deduplication

uygulamalıdır.

Browser redirect ödeme doğrulaması olarak kabul edilmemelidir.

29. Appointment API

Örnek:

POST /api/v1/appointments

Request:

{
  "customerId": "...",
  "branchId": "...",
  "serviceId": "...",
  "employeeId": "...",
  "startAt": "2026-08-25T10:00:00Z"
}

Backend:

Tenant authorization
        ↓
Branch access
        ↓
Employee availability
        ↓
Service availability
        ↓
Conflict check
        ↓
Create appointment

işlemlerini doğrulamalıdır.

30. Appointment Status

Önerilen durumlar:

SCHEDULED
CONFIRMED
CHECKED_IN
IN_SERVICE
COMPLETED
CANCELLED
NO_SHOW

Status transition'ları domain kurallarına göre kontrol edilmelidir.

Client istediği status'u doğrudan set edememelidir.

31. Customer API

Temel endpoint'ler:

GET    /customers
POST   /customers
GET    /customers/:id
PATCH  /customers/:id

İlişkili resource'lar:

/customers/:id/appointments
/customers/:id/packages
/customers/:id/sales
/customers/:id/payments
/customers/:id/feedback

gibi endpoint'ler olabilir.

32. Branch API

Temel endpoint'ler:

GET    /branches
POST   /branches
GET    /branches/:id
PATCH  /branches/:id

Branch access authorization ile sınırlandırılmalıdır.

33. Employee API

Temel endpoint'ler:

GET    /employees
POST   /employees
GET    /employees/:id
PATCH  /employees/:id

İlişkili:

/employees/:id/branches
/employees/:id/assignments
34. Service API

Temel endpoint'ler:

GET    /services
POST   /services
GET    /services/:id
PATCH  /services/:id

Branch-specific availability ayrıca yönetilebilir.

35. Package API

Temel endpoint'ler:

GET    /packages
POST   /packages
GET    /packages/:id

Müşteriye ait kullanım:

GET /customers/:id/packages

Session consumption ayrı business action olarak modellenebilir.

36. Sales API

Satış oluşturma:

POST /api/v1/sales

Satış tamamlandıktan sonra:

Sale
 ↓
SaleItems
 ↓
Payment
 ↓
Package / Inventory / Accounting

gibi downstream işlemler tetiklenebilir.

37. Inventory API

Örnek:

GET /inventory/products
GET /inventory/stocks
GET /inventory/movements
POST /inventory/transfers
POST /inventory/adjustments

Stok miktarı doğrudan arbitrary PATCH ile değiştirilememelidir.

Stock-changing operations business action olarak tanımlanmalıdır.

38. Feedback API

Feedback:

POST /feedback
GET  /feedback/:id

şeklinde alınabilir.

Feedback'in hangi appointment/service/customer ile ilişkili olduğu backend tarafından doğrulanmalıdır.

39. Quality API

Örnek:

GET   /quality/cases
POST  /quality/cases
GET   /quality/cases/:id
PATCH /quality/cases/:id

Customer feedback üzerinden quality case oluşturulabilir.

40. Reporting API

Raporlar:

GET /reports/sales
GET /reports/payments
GET /reports/appointments
GET /reports/inventory
GET /reports/customer
GET /reports/quality

gibi domain-specific endpoint'ler olabilir.

Büyük raporlar synchronous HTTP request içerisinde uzun süre çalıştırılmamalıdır.

41. Async Jobs

Uzun süren işler:

Import
Report generation
Bulk notifications
Large exports
Data processing

queue/job sistemi üzerinden yürütülebilir.

Örnek:

POST /reports/export
        ↓
202 Accepted
        ↓
Job ID
42. Bulk Operations

Bulk işlemler kontrollü şekilde açılmalıdır.

Örnek:

POST /customers/import
POST /notifications/bulk

Her bulk operation:

authorization
validation
rate limit
audit
error reporting

uygulamalıdır.

43. File Upload

Dosya upload'ları:

multipart/form-data

veya pre-signed object storage URL'leri üzerinden yapılabilir.

Dosyalar database blob olarak saklanmamalıdır; ihtiyaç halinde object storage kullanılmalıdır.

44. API Security

API minimum olarak:

Authentication
Authorization
Validation
Rate limiting
CORS policy
Secure headers
Request size limits
Audit logging

gereksinimlerini karşılamalıdır.

45. Sensitive Data

API response'larında gereksiz sensitive data dönülmemelidir.

Örneğin:

Password hash
Internal secrets
Provider credentials
Private tokens
Sensitive financial metadata

client'a gönderilmemelidir.

46. Error Leakage

Production response'larında:

stack trace
SQL error
internal filesystem path
secret
internal provider credentials

açıklanmamalıdır.

Detaylar server-side loglarda tutulmalıdır.

47. API Versioning

Breaking API değişikliklerinde version artırılmalıdır.

Örneğin:

/api/v1
/api/v2

Versioning stratejisi baştan belirlenmeli ve client'ların migration yapabilmesine izin verilmelidir.

48. Backward Compatibility

Non-breaking değişiklikler tercih edilmelidir.

Örneğin response'a yeni optional field eklemek çoğunlukla breaking değildir.

Ancak:

Field removal
Type change
Required field addition
Semantic change

breaking change olarak değerlendirilmelidir.

49. OpenAPI

API contract'ları OpenAPI/Swagger ile yayınlanmalıdır.

OpenAPI:

endpoint
request
response
error
authentication
parameters

bilgilerini içermelidir.

Swagger UI development ortamında aktif olabilir.

Production exposure ayrıca değerlendirilmelidir.

50. API Documentation

Her public endpoint için mümkün olduğunca:

Description
Request
Response
Errors
Authentication
Authorization
Examples

tanımlanmalıdır.

51. API Testing

API testleri:

Unit
Integration
E2E
Contract

katmanlarında uygulanabilir.

Özellikle kritik flow'lar:

Appointment
Sale
Payment
Package Session
Inventory
Accounting

E2E testlerle doğrulanmalıdır.

52. Transaction Boundary

Bir HTTP request'in database transaction sınırı business operation'a göre belirlenmelidir.

Örneğin paket seansı tüketimi:

Begin transaction
    ↓
Check session
    ↓
Consume session
    ↓
Create usage record
    ↓
Commit

şeklinde atomik olmalıdır.

53. External Provider Boundary

Harici provider çağrıları database transaction'ın içinde uzun süre açık tutulmamalıdır.

Önerilen:

Application
    ↓
Create local pending state
    ↓
External provider
    ↓
Webhook
    ↓
Finalize local state
54. Request Context

Her request'te mümkün olduğunca:

requestId
userId
tenantId
locale
timezone

gibi context bilgileri bulunmalıdır.

55. Locale

Client locale bilgisi request context'te taşınabilir.

Örneğin:

Accept-Language: tr-TR

Ancak authorization veya business logic sadece client tarafından gönderilen locale'e güvenmemelidir.

56. Timezone

Client timestamp'leri mümkün olduğunca ISO 8601 formatında göndermelidir.

Backend:

UTC

temelinde işlem yapmalı ve UI gösteriminde kullanıcı/branch timezone'u kullanılmalıdır.

57. API Observability

Her request için:

requestId
method
path
status
duration
userId
tenantId

gibi temel observability bilgileri loglanabilir.

Sensitive request body'leri otomatik olarak loglanmamalıdır.

58. Rate Limiting

Özellikle:

Authentication
Password reset
OTP
Payment
Webhook
Public feedback

endpoint'leri rate limit edilmelidir.

Limitler endpoint ve kullanıcı/provider bazında değişebilir.

59. Public Endpoints

Authentication öncesi public endpoint'ler minimum tutulmalıdır.

Örneğin:

/health
/auth/login
/auth/refresh
/public/...

Public endpoint'lerin tenant enumeration yapmasına izin verilmemelidir.

60. API Design Principle

API'nin temel prensibi:

HTTP endpoint'leri database tablolarının birebir CRUD yansıması değildir.

Örneğin:

POST /package-sessions/:id/consume

gibi bir business action:

Package Session
 ↓
Appointment
 ↓
Usage
 ↓
Inventory
 ↓
Accounting

gibi birden fazla domain etkisi oluşturabilir.

61. Current API State

Şu anda API'nin çalışan temel endpoint'i:

GET /health

örneğidir.

Health response'u database ve Redis durumunu raporlamaktadır.

Örnek:

{
  "status": "ok",
  "timestamp": "2026-08-24T16:08:32.760Z",
  "services": {
    "database": "up",
    "redis": "up"
  }
}
62. API Evolution Strategy

API geliştirme sırası:

Infrastructure
    ↓
Request Context
    ↓
Validation
    ↓
Authentication
    ↓
Authorization
    ↓
Organization
    ↓
Customer
    ↓
Services
    ↓
Appointments
    ↓
Sales
    ↓
Payments
    ↓
Inventory
    ↓
Accounting
    ↓
HR
    ↓
Quality
    ↓
Reporting
63. Contract Rule

Bir endpoint implementation'a başlanmadan önce:

Request contract
Response contract
Error contract
Authorization requirement
Tenant scope
Validation rules
Idempotency requirement
Transaction boundary
Audit requirement

belirlenmelidir.

64. API Contract Principle

Temel prensip:

API client'ın ihtiyacını temsil eder; database'in yapısını değil.