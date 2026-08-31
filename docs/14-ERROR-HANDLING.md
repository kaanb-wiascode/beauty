# Beauty ERP — Error Handling

> Bu doküman API, application, domain, database, Redis ve external integration hatalarının nasıl modellenip yönetileceğini tanımlar.

---

# 1. Core Principle

Error handling'in amacı:

```text
Predictable
Secure
Observable
Machine-readable
Recoverable

bir sistem oluşturmaktır.

Bir hata:

Exception
≠
HTTP Response
≠
User Message

Bu katmanlar birbirinden ayrılmalıdır.

2. Error Layers

Hata akışı:

Infrastructure Error
        ↓
Application / Domain Error
        ↓
HTTP Error Mapping
        ↓
API Error Response

Örneğin:

PostgreSQL unique violation
        ↓
DuplicateResourceError
        ↓
409 Conflict
        ↓
DUPLICATE_RESOURCE
3. Error Categories

Temel error kategorileri:

Validation
Authentication
Authorization
Not Found
Conflict
Business Rule
Infrastructure
External Dependency
Unexpected
4. Validation Error

Client request geçersizse validation error oluşur.

Örneğin:

email invalid
name empty
scheduledAt invalid
limit negative

Validation error:

HTTP 400

veya project-wide belirlenen validation convention'a göre 422 olabilir.

Tek bir convention kullanılmalıdır.

5. Authentication Error

Authentication başarısızsa:

401 Unauthorized

kullanılır.

Örneğin:

Missing token
Invalid token
Expired token
Revoked session
6. Authorization Error

User authenticated ancak operation için yetkili değilse:

403 Forbidden

kullanılır.

Örneğin:

Missing permission
Wrong branch scope
Insufficient role
7. Tenant Isolation Error

Resource başka tenant'a aitse information leakage önlemek için çoğu durumda:

404 Not Found

döndürmek tercih edilebilir.

Client'a:

"This resource belongs to another tenant."

gibi bilgi verilmemelidir.

8. Not Found

Resource gerçekten mevcut değilse:

404 Not Found

kullanılır.

Örneğin:

CUSTOMER_NOT_FOUND
APPOINTMENT_NOT_FOUND
BRANCH_NOT_FOUND
EMPLOYEE_NOT_FOUND
9. Conflict

Operation mevcut state ile çakışıyorsa:

409 Conflict

kullanılır.

Örnek:

DUPLICATE_RESOURCE
APPOINTMENT_CONFLICT
RESOURCE_VERSION_CONFLICT
IDEMPOTENCY_KEY_REUSED
10. Business Rule Error

Operation teknik olarak valid olsa bile business rule'a aykırı olabilir.

Örneğin:

Completed appointment cannot be cancelled.

Bu durumda domain/application error oluşturulmalıdır.

HTTP mapping:

409 Conflict

olabilir.

11. State Transition Error

Geçersiz state transition:

SCHEDULED
    ↓
COMPLETED

gibi doğrudan geçişe izin verilmiyorsa business error oluşur.

Örneğin:

INVALID_APPOINTMENT_TRANSITION
12. Error Code

Her client-visible business error machine-readable code taşımalıdır.

Örneğin:

{
  "code": "APPOINTMENT_CONFLICT",
  "message": "The selected time is no longer available."
}

Client business logic'i message string'ine göre yazmamalıdır.

13. Error Code Naming

Önerilen convention:

UPPER_SNAKE_CASE

Örnek:

CUSTOMER_NOT_FOUND
INVALID_APPOINTMENT_STATE
PAYMENT_ALREADY_REFUNDED
DUPLICATE_CUSTOMER
BRANCH_ACCESS_DENIED
14. Error Message

message:

Human-readable
Safe
Actionable

olmalıdır.

Internal exception message client'a doğrudan aktarılmamalıdır.

15. Error Response

Standart API error:

{
  "statusCode": 409,
  "code": "APPOINTMENT_CONFLICT",
  "message": "The selected time is no longer available.",
  "requestId": "req_123"
}

olabilir.

Final response envelope implementation sırasında project-wide olarak sabitlenmelidir.

16. Request ID

Error response mümkün olduğunca:

requestId

içermelidir.

Bu değer log ve tracing ile ilişkilendirilebilir.

17. Correlation ID

Asenkron operation'larda:

correlationId

kullanılabilir.

Örneğin:

HTTP request
 ↓
Job
 ↓
Worker
 ↓
External provider

aynı operation context'ine bağlanabilir.

18. Internal Exception

Internal exception:

DatabaseError
RedisError
ProviderError
UnexpectedError

gibi olabilir.

Bunlar doğrudan HTTP response'a çevrilmemelidir.

19. Exception Mapping

Application exception:

DuplicateCustomerError

HTTP:

409

API code:

DUPLICATE_CUSTOMER

şeklinde map edilebilir.

20. Domain Errors

Domain layer business invariant ihlalinde domain-specific error üretebilir.

Örneğin:

AppointmentAlreadyCompletedError
PaymentAlreadyRefundedError
InsufficientStockError
21. Application Errors

Application service orchestration seviyesinde:

ResourceNotFoundError
DuplicateResourceError
AuthorizationError
ConflictError

gibi application-level errors olabilir.

22. Infrastructure Errors

Infrastructure errors:

PostgreSQL unavailable
Redis unavailable
Queue unavailable
Object storage unavailable

gibi durumları ifade eder.

Bunlar client'a infrastructure internals olarak expose edilmemelidir.

23. Database Error Mapping

Örneğin Prisma unique constraint violation:

Prisma P2002

application seviyesinde:

DuplicateResourceError

olarak map edilebilir.

Client:

409 DUPLICATE_RESOURCE

görebilir.

24. Database Error Leakage

Client'a:

Prisma P2002
constraint name
SQL statement
database host

gibi internal database detayları verilmemelidir.

25. Database Unavailable

Database erişilemiyorsa uygun durumda:

503 Service Unavailable

döndürülebilir.

Ancak internal log'da gerçek database error korunmalıdır.

26. Redis Failure

Redis:

Cache
Session
Rate limit
Queue

amaçlarından hangisinde kullanıldığına göre failure behavior değişebilir.

Redis failure her zaman bütün API'nin failure olması anlamına gelmez.

27. Cache Failure

Redis yalnızca cache olarak kullanılıyorsa:

Redis down
 ↓
Cache miss
 ↓
PostgreSQL

fallback mümkün olabilir.

28. Critical Redis Failure

Redis:

Session
Distributed Lock
Critical Queue

gibi kritik bir role sahipse failure:

503

veya operation-specific error'a dönüşebilir.

29. External Provider Error

External provider hataları:

Timeout
Rate limit
5xx
Invalid response
Authentication failure

olarak ayrıştırılmalıdır.

30. External Timeout

Provider timeout:

504 Gateway Timeout

uygun durumda kullanılabilir.

Client'a provider'ın internal error body'si verilmemelidir.

31. External 5xx

Provider temporary failure:

503 Service Unavailable

gibi response'a çevrilebilir.

Retry policy ayrıca değerlendirilmelidir.

32. External 4xx

Provider'ın client/application request'inden kaynaklanan hatası business context'e göre map edilmelidir.

Her provider 4xx'i doğrudan API 4xx olarak geçirmek doğru değildir.

33. Retryable Errors

Retry edilebilir hatalar:

Network timeout
Connection reset
Temporary provider 5xx
Temporary database connectivity

gibi durumlar olabilir.

34. Non-Retryable Errors

Retry edilmemesi gerekenler:

Validation failure
Authentication failure
Invalid request
Business rule violation
Insufficient permission
Invalid resource
35. Retry + Idempotency

Mutation retry ediliyorsa:

Retry
+
Idempotency

birlikte değerlendirilmelidir.

Özellikle:

Payment
Sale
Refund
Webhook
External Integration

işlemlerinde önemlidir.

36. Exponential Backoff

Retry gereken operations için exponential backoff kullanılabilir.

Örneğin kavramsal:

Attempt 1
 ↓
short delay

Attempt 2
 ↓
longer delay

Attempt 3
 ↓
longer delay

Final delay değerleri dependency'ye göre belirlenmelidir.

37. Retry Limit

Retry sonsuz olmamalıdır.

Örneğin:

maxAttempts = 3

gibi limit kullanılabilir.

Final değer operation criticality ve provider behavior'a göre belirlenir.

38. Circuit Breaker

Sürekli başarısız external dependency için:

Closed
 ↓
Failure threshold
 ↓
Open
 ↓
Fast fail
 ↓
Half-open
 ↓
Recover

gibi circuit breaker yaklaşımı değerlendirilebilir.

İlk sürümde yalnızca ihtiyaç duyulan critical integrations için uygulanmalıdır.

39. Unexpected Error

Beklenmeyen exception:

500 Internal Server Error

olarak response edilir.

Client:

INTERNAL_SERVER_ERROR

gibi stable code görebilir.

40. Unexpected Error Response

Client'a:

{
  "statusCode": 500,
  "code": "INTERNAL_SERVER_ERROR",
  "message": "An unexpected error occurred.",
  "requestId": "req_123"
}

gibi generic response verilmelidir.

41. Stack Trace

Stack trace:

Internal logs

içinde tutulmalıdır.

HTTP response:

stack
file path
database credentials
environment variables

içermemelidir.

42. Production vs Development

Development ortamında debugging için daha fazla context görülebilir.

Production'da client response:

minimal
safe
stable

olmalıdır.

43. Error Logging

Her error loglanmak zorunda değildir.

Örneğin:

400 validation

her request için ERROR seviyesinde loglanmamalıdır.

44. Error Log Levels

Örnek:

400 validation
→ DEBUG / INFO

401 authentication failure
→ INFO / WARN

403 authorization denial
→ INFO / WARN

409 business conflict
→ INFO / WARN

500 unexpected error
→ ERROR

503 dependency unavailable
→ ERROR / WARN

Final severity operation context'e göre belirlenebilir.

45. Security Errors

Repeated:

401
403
404

pattern'leri security monitoring tarafından ayrıca değerlendirilebilir.

Tek bir request'in failure olması saldırı anlamına gelmez.

46. Sensitive Error Information

Error response içinde:

Password
Token
Secret
Database URL
Internal host
Stack trace
SQL

gibi bilgiler bulunmamalıdır.

47. Validation Details

Validation error kullanıcıya hangi input'un hatalı olduğunu anlatabilir.

Örneğin:

{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed.",
  "details": [
    {
      "field": "email",
      "code": "INVALID_EMAIL"
    }
  ]
}
48. Validation Detail Safety

Validation detail:

Useful

olmalı ancak internal schema implementation'ını gereksiz şekilde expose etmemelidir.

49. Error Details

Business error gerektiğinde structured details taşıyabilir.

Örneğin:

{
  "code": "APPOINTMENT_CONFLICT",
  "details": {
    "requestedAt": "2026-08-24T17:00:00.000Z"
  }
}

Sensitive resource data burada da expose edilmemelidir.

50. Error Localization

API error message değeri ileride localization gerektirebilir.

Bu nedenle client business logic'i message'a bağlanmamalıdır.

Örneğin:

code = APPOINTMENT_CONFLICT

stable kalırken:

message

kullanıcının diline göre değişebilir.

51. Translation

Localization gerektiğinde:

Error Code
 ↓
Translation Key
 ↓
Localized Message

yaklaşımı kullanılabilir.

52. Error Codes as Contract

Public API'deki error codes API contract'ın bir parçası kabul edilmelidir.

Gereksiz yere değiştirilmemelidir.

53. Error Code Lifecycle

Bir error code kaldırılacaksa:

Active
 ↓
Deprecated
 ↓
Migration
 ↓
Removed

süreci uygulanabilir.

54. Error Documentation

Her önemli business error:

Code
HTTP status
Meaning
Trigger
Client action

bilgileriyle dokümante edilmelidir.

55. Example Error Catalog

Başlangıç error catalog:

VALIDATION_ERROR
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
INTERNAL_SERVER_ERROR

CUSTOMER_NOT_FOUND
DUPLICATE_CUSTOMER

APPOINTMENT_NOT_FOUND
APPOINTMENT_CONFLICT
INVALID_APPOINTMENT_TRANSITION

PAYMENT_NOT_FOUND
PAYMENT_ALREADY_REFUNDED
PAYMENT_REFUND_NOT_ALLOWED

INSUFFICIENT_STOCK
BRANCH_ACCESS_DENIED

IDEMPOTENCY_KEY_REUSED
RESOURCE_VERSION_CONFLICT

Catalog domain geliştikçe genişletilecektir.

56. Error Namespace

İlk sürümde flat error code kullanılabilir.

İleride büyük error catalog oluşursa:

CUSTOMER_NOT_FOUND
APPOINTMENT_CONFLICT
PAYMENT_REFUND_NOT_ALLOWED

gibi resource-specific naming korunmalıdır.

57. Concurrency Conflict

İki user aynı resource'u aynı anda değiştirdiğinde:

RESOURCE_VERSION_CONFLICT

gibi conflict error kullanılabilir.

58. Optimistic Concurrency

Critical resource'larda version field değerlendirilebilir.

Örneğin:

version = 7

Client:

expectedVersion = 7

gönderir.

Database state artık:

version = 8

ise update reddedilir.

59. Lost Update

Concurrency protection olmadan:

User A reads
User B reads
User A updates
User B updates

olursa User A'nın değişikliği kaybolabilir.

Critical business data için bu risk değerlendirilmelidir.

60. Transaction Failure

Transaction rollback olduğunda:

Business operation
 ↓
ROLLBACK

olur.

Client yalnızca operation'ın başarısız olduğunu görmelidir.

Internal log gerçek transaction error'u taşımalıdır.

61. Partial Failure

Bir operation birden fazla external action içeriyorsa:

Database success
Email failure

gibi partial failure oluşabilir.

Bu durumda transaction'ın yalnızca database state'ini koruması yeterlidir.

External side effect için retry/outbox yaklaşımı gerekebilir.

62. Outbox Pattern

Reliable external side effect için:

Database Transaction
 ├── Business Data
 └── Outbox Event
        ↓
Worker
        ↓
External Provider

kullanılabilir.

63. Outbox Failure

Worker başarısız olursa:

Retry
 ↓
Backoff
 ↓
Dead Letter / Failed

gibi lifecycle uygulanabilir.

64. Dead Letter

Tekrarlı olarak başarısız event'ler:

Dead Letter Queue

veya equivalent failure store'a taşınabilir.

İlk sürümde ihtiyaç ortaya çıkmadan karmaşık DLQ sistemi kurulması zorunlu değildir.

65. User-Facing Error

User-facing error:

Clear
Safe
Actionable

olmalıdır.

Örneğin:

"The selected appointment time is no longer available."
66. Developer-Facing Context

Developer/operator:

requestId
correlationId
stack trace
provider status
database error

gibi daha ayrıntılı internal context'e erişebilmelidir.

67. Error Observability

Her unexpected error:

requestId
tenantId
userId
endpoint
method
statusCode

gibi context ile ilişkilendirilebilmelidir.

68. Error Metrics

İzlenebilecek metrikler:

4xx rate
5xx rate
409 rate
401 rate
403 rate
503 rate
Database failures
Redis failures
External provider failures
69. Error Alerts

Alert threshold'ları özellikle:

5xx spike
Database unavailable
Redis unavailable
External provider failure
Queue failure

için belirlenebilir.

70. Health vs Error

Health endpoint:

GET /health

sistem availability bilgisini sağlar.

Normal business error:

POST /payments

başarısız olduğunda health endpoint'in başarısız olması gerekmez.

Bu iki kavram ayrıdır.

71. Error Handling Checklist

Yeni endpoint eklenirken:

[ ] Validation errors
[ ] Authentication
[ ] Authorization
[ ] Tenant isolation
[ ] Not found
[ ] Business conflict
[ ] State transition
[ ] Database errors
[ ] External errors
[ ] Retry behavior
[ ] Idempotency
[ ] Request ID
[ ] Logging
[ ] Stable error code
[ ] Safe message
[ ] Tests

kontrol edilmelidir.

72. Current State

Mevcut foundation:

NestJS
Prisma
PostgreSQL
Redis
Config
Health

durumundadır.

Error handling architecture henüz tamamen implementation edilmemiştir.

Bu doküman hedef standardı tanımlar.

73. Implementation Order

Önerilen sıra:

Global Exception Filter
 ↓
Application Error Classes
 ↓
Domain Error Classes
 ↓
HTTP Error Mapping
 ↓
Stable Error Codes
 ↓
Request ID
 ↓
Structured Error Logging
 ↓
Validation Error Contract
 ↓
External Error Mapping
 ↓
Tests
74. Final Principle

Beauty ERP error handling:

Internal sistem hatalarını güvenli ve anlamlı application errors'a, application errors'ı ise stable ve machine-readable API contracts'a dönüştürmelidir.

Client:

Safe Error
+
Stable Code
+
Request ID

almalıdır.

Developer/operator:

Full Diagnostic Context

alabilmelidir.