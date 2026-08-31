# Beauty ERP — Error Handling

> Bu doküman API, domain, database, external integration ve background job hatalarının nasıl ele alınacağını tanımlar.

---

# 1. Core Principle

Hata yönetiminin temel prensibi:

> Hata kullanıcıya anlaşılır, geliştiriciye teşhis edilebilir, sisteme ise güvenli şekilde döndürülmelidir.

Bir hata:

```text
User Experience
+
Security
+
Observability
+
Consistency

açısından değerlendirilmelidir.

2. Error Categories

Temel hata kategorileri:

Validation Error
Authentication Error
Authorization Error
Business Rule Error
Resource Not Found
Conflict
Rate Limit
External Service Error
Database Error
Infrastructure Error
Unexpected Error
3. HTTP Status Mapping

Genel mapping:

400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests
500 Internal Server Error
502 Bad Gateway
503 Service Unavailable
504 Gateway Timeout

Her endpoint kendi business durumuna göre uygun status seçmelidir.

4. 400 Bad Request

Request yapısal olarak geçersiz olduğunda:

400

kullanılabilir.

Örneğin:

Malformed JSON
Invalid query parameter
Invalid request structure
5. 401 Unauthorized

Authentication bulunmuyorsa veya geçersizse:

401 Unauthorized

döndürülmelidir.

Örneğin:

Missing token
Expired token
Invalid token
Revoked session
6. 403 Forbidden

User authenticated ancak action için yetkisi yoksa:

403 Forbidden

kullanılır.

Örneğin:

User
 ↓
Authenticated
 ↓
Missing permission
 ↓
403
7. 404 Not Found

Resource bulunmuyorsa:

404 Not Found

kullanılabilir.

Ancak tenant isolation ve anti-enumeration gerektiren durumlarda erişilemeyen resource için de 404 tercih edilebilir.

8. 409 Conflict

Resource state mevcut request ile çakışıyorsa:

409 Conflict

kullanılabilir.

Örnek:

Duplicate customer
Appointment conflict
Already consumed package session
Duplicate payment
Already processed webhook
9. 422 Unprocessable Entity

Request syntactically geçerli ancak business validation'dan geçemiyorsa:

422

kullanılabilir.

Örnek:

Invalid appointment transition
Insufficient stock
Expired package
Invalid refund
10. 429 Rate Limit

Rate limit aşıldığında:

429 Too Many Requests

döndürülmelidir.

Gerekirse:

Retry-After

header'ı kullanılabilir.

11. 500 Internal Server Error

Beklenmeyen server hataları:

500 Internal Server Error

olarak dönmelidir.

Production response'unda:

Stack trace
Database error
Internal path
SQL
Secret

gösterilmemelidir.

12. 502 Bad Gateway

Backend bir external service'den geçersiz/başarısız response aldığında uygun senaryolarda:

502 Bad Gateway

kullanılabilir.

Örneğin:

Payment Provider
SMS Provider
External Accounting API
13. 503 Service Unavailable

Geçici olarak kullanılamayan dependency:

503 Service Unavailable

ile ifade edilebilir.

Örneğin:

Database unavailable
Critical external dependency unavailable
Maintenance

Ancak endpoint'in gerçekten dependency'ye bağlı olup olmadığı değerlendirilmelidir.

14. 504 Gateway Timeout

External dependency zamanında cevap vermediğinde:

504 Gateway Timeout

kullanılabilir.

Örneğin:

API
 ↓
Payment Provider
 ↓
Timeout
 ↓
504
15. Error Response Contract

API hata response formatı mümkün olduğunca standardize edilmelidir.

Örnek:

{
  "statusCode": 409,
  "code": "APPOINTMENT_CONFLICT",
  "message": "The selected time is no longer available.",
  "requestId": "req_123"
}
16. Error Code

Client'ın business davranışını HTTP message string'ine göre belirlemesi önerilmez.

Bunun yerine stable:

code

kullanılmalıdır.

Örneğin:

APPOINTMENT_CONFLICT
INSUFFICIENT_STOCK
PACKAGE_SESSION_EXHAUSTED
PAYMENT_FAILED
INVALID_STATE_TRANSITION
17. Error Message

message kullanıcıya veya frontend'e yardımcı olacak şekilde yazılabilir.

Ancak:

Database SQL
Internal exception
Secret
Stack trace

gibi bilgiler message içine konulmamalıdır.

18. Error Details

Validation hatalarında gerekirse:

{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed.",
  "details": {
    "email": "Invalid email format"
  }
}

gibi structured details kullanılabilir.

Sensitive input details response'a eklenmemelidir.

19. Request ID

Her API request mümkünse:

requestId

ile ilişkilendirilmelidir.

Örnek:

HTTP Request
    ↓
requestId = req_123
    ↓
Application Logs
    ↓
Database Logs
    ↓
Audit
20. Error Logging

Her hata loglanmak zorunda değildir.

Örneğin kullanıcı yanlış password girdiğinde:

401

normal operational event olabilir.

Ancak:

Database crash
Unexpected exception
Payment provider failure

gibi durumlar error seviyesinde loglanmalıdır.

21. Log Levels

Temel seviyeler:

DEBUG
INFO
WARN
ERROR
FATAL

Production'da DEBUG logları kontrollü kullanılmalıdır.

22. Expected vs Unexpected Errors

Hatalar iki ana gruba ayrılabilir:

Expected Business Error
Unexpected System Error

Örneğin:

Appointment conflict

expected business error'dur.

Cannot read database connection

system/infrastructure error'dur.

23. Business Exceptions

Domain/application service seviyesinde business exception'lar tanımlanabilir.

Örneğin:

AppointmentConflictError
PackageSessionExhaustedError
InsufficientStockError
InvalidPaymentStateError

Bu exception'lar HTTP detaylarından bağımsız tutulmalıdır.

24. Domain Error vs HTTP Error

Domain layer:

AppointmentConflict

bilir.

Domain layer:

HTTP 409

bilmek zorunda değildir.

Mapping API/application boundary'de yapılmalıdır.

25. Example

Domain:

AppointmentConflictError

↓

HTTP adapter:

409
APPOINTMENT_CONFLICT

Bu separation domain kodunun HTTP framework'e bağımlılığını azaltır.

26. Invalid State Transition

State machine geçişleri kontrol edilmelidir.

Örneğin:

COMPLETED
   ↓
CHECKED_IN

geçersizse:

INVALID_STATE_TRANSITION

döndürülebilir.

27. State Transition Error

Örnek response:

{
  "statusCode": 409,
  "code": "INVALID_STATE_TRANSITION",
  "message": "Appointment cannot be checked in after completion.",
  "requestId": "req_123"
}
28. Validation Error

Validation:

Request
 ↓
Schema
 ↓
Validation

aşamasında gerçekleşmelidir.

Örneğin:

name = ""
email = invalid
phone = invalid

gibi değerler business logic'e ulaşmadan reddedilebilir.

29. Validation Error Stability

Validation error code'ları mümkün olduğunca stable tutulmalıdır.

Örneğin:

VALIDATION_ERROR

ana code olabilir.

Field-level detaylar:

details

içinde tutulabilir.

30. Database Errors

Database exception doğrudan client'a gönderilmemelidir.

Örneğin:

Prisma error
PostgreSQL error
Constraint error

önce application seviyesinde sınıflandırılmalıdır.

31. Unique Constraint

Örneğin:

Customer.slug

unique constraint'e çarparsa:

409 Conflict

ve uygun business code döndürülebilir.

Örneğin:

DUPLICATE_CUSTOMER
32. Foreign Key Error

Geçersiz relation oluşturulmaya çalışılırsa:

INVALID_RELATION

gibi bir business/application error üretilebilir.

Database exception doğrudan dışarı sızmamalıdır.

33. Transaction Failure

Bir transaction başarısız olduğunda:

Transaction
 ├── Change A
 ├── Change B
 └── Change C

atomic transaction kullanılıyorsa:

A = rollback
B = rollback
C = rollback

olmalıdır.

34. Partial Failure

Transaction dışında bir downstream işlem başarısız olursa:

Business Change
      ↓
Committed
      ↓
Notification Failed

durumunda business transaction gereksiz yere rollback edilmemelidir.

Notification gibi eventual-consistency işlemleri retry edilebilir.

35. Retryable Errors

Retry yapılabilecek hatalar:

Timeout
Temporary Network Failure
429
503
Temporary Provider Failure

olabilir.

36. Non-Retryable Errors

Retry edilmemesi gereken örnekler:

Invalid Credentials
Invalid Input
Authorization Failure
Invalid Payment Data
Invalid State
Duplicate Resource

Sonsuz retry yapılmamalıdır.

37. Retry Policy

Retry:

Attempt 1
   ↓
Backoff
   ↓
Attempt 2
   ↓
Backoff
   ↓
Attempt 3

gibi sınırlı olabilir.

Exponential backoff kullanılabilir.

38. Dead Letter

Başarısız job belirli sayıda retry sonrasında:

Dead Letter Queue

veya eşdeğer failed-job storage'a taşınabilir.

Bu işler manuel veya otomatik recovery için incelenebilir.

39. Background Job Errors

Worker hatası:

Job
 ↓
Execute
 ↓
Error
 ↓
Retry?
 ├── Yes → Retry
 └── No  → Failed

şeklinde yönetilebilir.

Worker process'in beklenmeyen exception nedeniyle tamamen kapanması engellenmelidir.

40. External Service Errors

External service çağrısı:

API
 ↓
Provider

şeklinde ise provider error normalize edilmelidir.

Örneğin provider:

HTTP 503

döndürdüğünde domain:

PAYMENT_PROVIDER_UNAVAILABLE

gibi stable bir error code kullanabilir.

41. Provider Error Leakage

Provider'ın internal error message'i client'a doğrudan aktarılmamalıdır.

Örneğin:

Stripe internal message

yerine:

PAYMENT_PROVIDER_ERROR

gibi kontrollü bir response tercih edilmelidir.

42. Payment Errors

Payment hata kategorileri:

PAYMENT_DECLINED
PAYMENT_FAILED
PAYMENT_TIMEOUT
PAYMENT_PROVIDER_UNAVAILABLE
PAYMENT_ALREADY_PROCESSED
INVALID_PAYMENT_STATE

gibi olabilir.

43. Payment Ambiguous State

External payment timeout olduğunda ödeme gerçekten başarısız olmuş olmayabilir.

Örneğin:

Request
 ↓
Provider
 ↓
Timeout

durumunda:

FAILED

demek yanlış olabilir.

Bunun yerine:

PENDING
UNKNOWN
RECONCILIATION_REQUIRED

gibi state'ler domain ihtiyacına göre değerlendirilebilir.

44. Webhook Errors

Webhook signature geçersizse:

401 / 403

veya provider contract'ına uygun response kullanılabilir.

Invalid webhook business state değiştirmemelidir.

45. Idempotency Errors

Aynı operation tekrar gelirse her zaman hata vermek zorunda değildir.

Örneğin:

POST payment
Idempotency-Key: abc

aynı request tekrar geldiğinde:

Same Result

döndürmek tercih edilebilir.

46. Idempotency Conflict

Aynı idempotency key farklı payload ile kullanılırsa:

IDEMPOTENCY_KEY_REUSED

gibi bir conflict döndürülebilir.

47. Concurrency Errors

Optimistic locking veya version check kullanılıyorsa:

RESOURCE_VERSION_CONFLICT

gibi bir hata döndürülebilir.

Örneğin:

User A
 ↓
Version 5

User B
 ↓
Version 5

User A updates → Version 6
User B updates → Conflict
48. Appointment Conflict

Aynı employee/time slot'a iki appointment yazılmasını engellemek gerekir.

Örnek:

Employee A
10:00 - 11:00

doluysa ikinci request:

APPOINTMENT_CONFLICT

ile reddedilebilir.

Bu yalnızca frontend availability kontrolüne bırakılmamalıdır.

49. Stock Conflict

Stock:

Available = 1

iki concurrent request tarafından tüketilmek istenirse yalnızca biri başarılı olmalıdır.

Diğeri:

INSUFFICIENT_STOCK

veya concurrency error ile sonuçlanmalıdır.

50. Package Conflict

Package session:

Remaining = 1

aynı anda iki işlem tarafından tüketilmek istenirse yalnızca biri başarılı olmalıdır.

51. Error Localization

API'nin message alanı ileride localization destekleyebilir.

Ancak business logic:

Türkçe string

üzerinden karar vermemelidir.

Karar için:

code

kullanılmalıdır.

52. Frontend Error Handling

Frontend:

HTTP status
+
error code
+
details

üzerinden davranmalıdır.

Örneğin:

APPOINTMENT_CONFLICT

geldiğinde appointment formu availability refresh yapabilir.

53. Error UX

Kullanıcıya:

Something went wrong

gibi anlamsız mesajlar yerine mümkün olduğunda action-oriented mesaj verilmelidir.

Örneğin:

"The selected time is no longer available. Please choose another time."
54. Retry UX

Kullanıcı tekrar deneyebilecekse:

Try Again

sunulabilir.

Ancak frontend otomatik retry yaparken duplicate mutation oluşturmadığından emin olunmalıdır.

55. Sensitive Errors

Authentication sisteminde:

User exists
Password correct
Email registered

gibi hassas bilgiler gereksiz yere açığa çıkarılmamalıdır.

Özellikle:

Login
Password Reset
OTP

endpoint'lerinde enumeration önlenmelidir.

56. Error Metrics

İzlenebilecek metric'ler:

HTTP 4xx Rate
HTTP 5xx Rate
Validation Error Rate
Auth Failure Rate
Payment Failure Rate
Webhook Failure Rate
Queue Failure Rate
Database Error Rate
57. Error Alerts

Alert gerektirebilecek durumlar:

Sudden 5xx increase
Database unavailable
Redis unavailable
Payment provider outage
Large webhook failure spike
Queue backlog
Cross-tenant authorization failures
58. Health vs Error

Health endpoint:

GET /health

sistem dependency durumunu gösterebilir.

Ancak:

health = ok

her business operation'ın başarılı olacağı anlamına gelmez.

59. Health Failure

Örneğin:

{
  "status": "degraded",
  "services": {
    "database": "up",
    "redis": "down"
  }
}

gibi bir state kullanılabilir.

Health response contract'ı deployment ve monitoring ihtiyaçlarına göre netleştirilecektir.

60. Error Boundary

Uygulama katmanları:

HTTP
 ↓
Application
 ↓
Domain
 ↓
Infrastructure

arasında error translation yapılabilir.

Her katman kendi sorumluluğundaki hatayı tanımlamalıdır.

61. Error Translation

Örneğin:

PostgreSQL Unique Constraint
        ↓
Repository
        ↓
DuplicateCustomerError
        ↓
Application
        ↓
409 DUPLICATE_CUSTOMER

Bu yaklaşım infrastructure detaylarının API'ye sızmasını engeller.

62. Unexpected Error

Beklenmeyen exception:

UnexpectedError

olarak merkezi exception handler'a düşmelidir.

Client:

500
INTERNAL_SERVER_ERROR

görür.

Log:

requestId
stack trace
context

içerebilir.

63. Global Exception Handler

NestJS seviyesinde merkezi exception handling kullanılabilir.

Ama business logic controller'a sıkıştırılmamalıdır.

Controller mümkün olduğunca:

Request
 ↓
Application Service
 ↓
Response

şeklinde sade tutulmalıdır.

64. Error Contract Versioning

Error code'lar public API contract'ın bir parçası kabul edilmelidir.

Bir code değiştirilecekse:

Documentation
Frontend
Mobile
Integrations
Tests

etkileri değerlendirilmelidir.

65. Error Documentation

Her önemli business error için:

Code
HTTP Status
Meaning
Trigger
Client Action
Retryable?
Audit?

bilgileri dokümante edilmelidir.

66. Example Error Catalog

Başlangıç kataloğu:

VALIDATION_ERROR
UNAUTHORIZED
FORBIDDEN
RESOURCE_NOT_FOUND
DUPLICATE_RESOURCE
APPOINTMENT_CONFLICT
INVALID_STATE_TRANSITION
INSUFFICIENT_STOCK
PACKAGE_SESSION_EXHAUSTED
PAYMENT_FAILED
PAYMENT_PROVIDER_UNAVAILABLE
PAYMENT_ALREADY_PROCESSED
IDEMPOTENCY_KEY_REUSED
RATE_LIMITED
INTERNAL_SERVER_ERROR
67. Error Handling Rule

Bir hata response'u:

Stable
Machine-readable
Secure
Actionable
Traceable

olmalıdır.

68. Current Implementation State

Şu anda backend:

NestJS
Config
Prisma
PostgreSQL
Redis
Health

foundation seviyesindedir.

Central error contract henüz tam implementation değildir.

Bu doküman implementation standardını tanımlar.

69. Implementation Order

Önerilen sıra:

Global Exception Handler
        ↓
Error Codes
        ↓
Validation Errors
        ↓
Domain Exceptions
        ↓
Database Error Mapping
        ↓
External Error Mapping
        ↓
Request ID
        ↓
Structured Logging
        ↓
Metrics
70. Final Principle

Beauty ERP'de:

Hata yönetimi yalnızca exception yakalamak değildir; business consistency, security, observability ve kullanıcı deneyiminin birlikte yönetilmesidir.