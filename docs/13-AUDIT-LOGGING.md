# Beauty ERP — Audit & Logging

> Bu doküman sistemde gerçekleşen operasyonların, güvenlik olaylarının ve teknik logların nasıl ayrıştırılacağını ve izleneceğini tanımlar.

---

# 1. Core Principle

Beauty ERP'de:

```text
Application Log
≠
Audit Log
≠
Security Log

Bu üç log türü farklı amaçlara hizmet eder.

2. Application Log

Application log teknik sistem davranışını anlamak içindir.

Örneğin:

Application started
Request received
Database query failed
Redis unavailable
External provider timeout
Unexpected exception

Amaç:

Debugging
Operations
Performance
Incident investigation
3. Audit Log

Audit log business veya security açısından önemli bir kullanıcı aksiyonunu kaydeder.

Temel sorular:

Who?
What?
When?
Where?
Which tenant?
Which resource?
What changed?
4. Audit Event

Audit event kavramsal olarak:

Actor
 ↓
Action
 ↓
Resource
 ↓
Context
 ↓
Result

şeklinde modellenir.

5. Audit Event Example

Örnek:

{
  "actorId": "user-123",
  "tenantId": "tenant-123",
  "action": "customer.updated",
  "resourceType": "customer",
  "resourceId": "customer-123",
  "result": "success"
}
6. Actor

Actor işlemi yapan identity'dir.

Normal durumda:

User

olabilir.

Ancak ileride:

System
Worker
Integration
Platform Admin

gibi actor tipleri de olabilir.

7. Actor Type

Önerilen actor types:

USER
SYSTEM
WORKER
INTEGRATION
PLATFORM_ADMIN

Final liste implementation sırasında genişletilebilir.

8. Actor ID

User tarafından gerçekleştirilen eventlerde:

actorId = user.id

olmalıdır.

System operation'larında actor:

SYSTEM

olarak temsil edilebilir.

9. Tenant Context

Tenant-aware audit event'lerinde:

tenantId

zorunlu olmalıdır.

Örneğin:

User A
 ↓
Tenant X
 ↓
Customer Updated

audit event Tenant X'e bağlanmalıdır.

10. Branch Context

Operation branch-specific ise:

branchId

de audit event'e eklenmelidir.

Örneğin:

Appointment completed
tenantId = tenant-A
branchId = branch-Istanbul
11. Resource Type

Resource type machine-readable olmalıdır.

Örneğin:

customer
appointment
employee
service
payment
inventory
tenant
user
membership
role
12. Resource ID

Mümkün olduğunda event:

resourceType
+
resourceId

ile belirli bir resource'a bağlanmalıdır.

13. Action Naming

Audit action:

resource.verb

formatında olabilir.

Örnek:

customer.created
customer.updated
customer.deleted

appointment.created
appointment.cancelled
appointment.completed

payment.created
payment.refunded
14. Business Actions

Bazı action'lar generic CRUD yerine business operation olarak tutulmalıdır.

Örneğin:

appointment.checked_in
appointment.cancelled
appointment.completed
payment.refunded
inventory.adjusted

Bu audit trail'i daha anlamlı hale getirir.

15. Result

Audit event operation sonucunu taşıyabilir:

SUCCESS
FAILURE

Sensitive security monitoring için:

DENIED

gibi sonuçlar ayrıca tutulabilir.

16. Successful Audit

Örneğin:

USER
customer.updated
SUCCESS
17. Failed Audit

Business operation başarısız olduysa:

USER
payment.refunded
FAILURE

kaydı oluşturulabilir.

Ancak her validation failure'ın audit event olması zorunlu değildir.

18. Denied Authorization

Sensitive authorization denial'ları ayrıca audit/security event olabilir.

Örneğin:

USER
payments.refund
DENIED
19. Request ID

Audit event mümkün olduğunda:

requestId

ile HTTP request'e bağlanmalıdır.

Böylece:

HTTP Request
 ↓
Application Log
 ↓
Audit Event

ilişkisi kurulabilir.

20. Correlation ID

Asenkron işlemlerde:

correlationId

kullanılabilir.

Örneğin:

HTTP Request
 ↓
Job
 ↓
Worker
 ↓
External API

aynı business operation'a bağlanabilir.

21. Timestamp

Audit event timestamp'i server tarafından oluşturulmalıdır.

Client'ın gönderdiği timestamp güvenilir audit zamanı olarak kabul edilmemelidir.

22. Timezone

Audit timestamp:

UTC
ISO 8601

formatında tutulmalıdır.

Örnek:

2026-08-24T16:00:00.000Z
23. Immutable Audit

Audit records normal application flow içinde update edilmemelidir.

Temel prensip:

Create
 ↓
Immutable
24. Audit Deletion

Audit records business user tarafından silinememelidir.

Retention policy gerekiyorsa deletion:

Scheduled
Controlled
Audited

olmalıdır.

25. Audit Payload

Event metadata gerektiğinde:

metadata

alanında tutulabilir.

Örneğin:

{
  "changedFields": [
    "name",
    "phone"
  ]
}
26. Before / After

Önemli değişikliklerde before/after değerleri tutulabilir.

Örneğin:

{
  "before": {
    "status": "ACTIVE"
  },
  "after": {
    "status": "SUSPENDED"
  }
}

Ancak sensitive data burada da filtrelenmelidir.

27. Changed Fields

Her update için tüm entity snapshot'ını saklamak zorunlu değildir.

Gerektiğinde:

changedFields

tutulabilir.

28. Sensitive Data

Audit event içine aşağıdaki bilgiler mümkün olduğunca yazılmamalıdır:

Password
Access Token
Refresh Token
API Key
Secret
Credit Card Number
CVV
29. Personal Data

PII içeren alanlar dikkatli ele alınmalıdır.

Örneğin:

Phone
Email
Address
Identity information

audit payload'a yalnızca gerçekten gerekli olduğunda dahil edilmelidir.

30. Payment Data

Payment audit:

payment.created
payment.refunded
payment.failed

gibi business event'leri kaydedebilir.

Ancak:

Card Number
CVV
Payment Secret

saklanmamalıdır.

31. Authentication Events

Authentication olayları ayrıca izlenmelidir.

Örneğin:

auth.login.success
auth.login.failed
auth.logout
auth.password.changed
auth.session.revoked
32. Security Events

Security event örnekleri:

auth.login.failed
auth.session.revoked
authorization.denied
membership.suspended
role.changed
permission.changed
33. Tenant Events

Tenant lifecycle:

tenant.created
tenant.updated
tenant.suspended
tenant.deleted

gibi event'lerle takip edilebilir.

34. Membership Events

Membership lifecycle:

membership.invited
membership.accepted
membership.suspended
membership.removed
membership.role_changed

şeklinde audit edilebilir.

35. Role Events

Role değişiklikleri:

role.created
role.updated
role.deleted
role.permissions_changed

gibi event'lerle izlenebilir.

36. Branch Events

Branch lifecycle:

branch.created
branch.updated
branch.archived
branch.reopened

gibi event'lerle takip edilebilir.

37. Customer Events

Önemli customer operations:

customer.created
customer.updated
customer.archived
customer.restored

gibi event'lerle izlenebilir.

38. Appointment Events

Appointment lifecycle audit için özellikle önemlidir.

Örneğin:

appointment.created
appointment.confirmed
appointment.checked_in
appointment.started
appointment.completed
appointment.cancelled
appointment.rescheduled
appointment.no_show
39. Payment Events

Payment eventleri:

payment.created
payment.completed
payment.failed
payment.refunded
payment.voided

gibi business actions içerebilir.

40. Inventory Events

Inventory operations:

inventory.received
inventory.adjusted
inventory.transferred
inventory.counted
inventory.depleted

gibi audit event'leri gerektirebilir.

41. Employee Events

Employee operations:

employee.created
employee.updated
employee.activated
employee.suspended
employee.archived

gibi event'lerle izlenebilir.

42. Audit Actor

Audit actor aşağıdaki bilgileri içerebilir:

actorType
actorId

Opsiyonel:

actorName

Ancak mutable display name'i identity olarak kullanmak doğru değildir.

43. IP Address

Security-sensitive authentication eventlerinde IP address tutulabilir.

Ancak:

Privacy
Retention
Compliance

gereksinimleri dikkate alınmalıdır.

44. User Agent

Authentication/security eventlerinde user agent metadata tutulabilir.

Örneğin:

Browser
Operating System
Mobile App Version
45. Request Metadata

Audit event gerektiğinde:

requestId
correlationId
ipAddress
userAgent

gibi metadata taşıyabilir.

46. Audit Schema

Kavramsal audit model:

AuditEvent
 ├── id
 ├── tenantId
 ├── branchId?
 ├── actorType
 ├── actorId?
 ├── action
 ├── resourceType
 ├── resourceId?
 ├── result
 ├── requestId?
 ├── correlationId?
 ├── metadata?
 └── createdAt

Final Prisma schema implementation aşamasında netleştirilecektir.

47. Audit Storage

Audit records primary PostgreSQL database içinde tutulabilir.

Özellikle business-critical audit trail için durable storage tercih edilmelidir.

48. Audit vs Log Storage

Application logs:

Log platform

üzerinde tutulabilir.

Audit records:

PostgreSQL

gibi queryable durable storage'da tutulabilir.

İki storage aynı olmak zorunda değildir.

49. Audit Retention

Audit retention business ve compliance ihtiyaçlarına göre belirlenmelidir.

Örneğin:

1 year
3 years
7 years

gibi policy'ler değerlendirilebilir.

Final retention süresi henüz belirlenmemiştir.

50. Audit Query

Admin kullanıcıları için:

GET /audit-events

gibi endpoint ileride oluşturulabilir.

Filtering:

actorId
resourceType
resourceId
action
result
from
to
branchId

üzerinden yapılabilir.

51. Audit Access

Audit data sensitive kabul edilmelidir.

Yalnızca uygun permission'a sahip kullanıcılar erişebilmelidir.

Örneğin:

audit.read
52. Audit Export

Audit data export edilecekse:

Authorization
Rate Limiting
Audit
Data Privacy

kontrolleri uygulanmalıdır.

53. Audit of Audit

Audit log görüntüleme veya export etme işlemleri de gerektiğinde audit edilebilir.

Örneğin:

audit.viewed
audit.exported
54. Application Logging Levels

Önerilen seviyeler:

DEBUG
INFO
WARN
ERROR

Production'da DEBUG logları kontrollü kullanılmalıdır.

55. INFO

Normal lifecycle olayları:

Application started
Job started
Job completed
External provider connected

INFO seviyesinde olabilir.

56. WARN

Beklenmeyen ancak sistemi tamamen durdurmayan durumlar:

Cache miss
Retry
Slow dependency
Deprecated API usage

WARN olabilir.

57. ERROR

Operation'ın başarısız olduğu veya intervention gerektiren durumlar:

Unhandled exception
Database unavailable
Critical external dependency failure

ERROR olabilir.

58. Structured Logging

Loglar mümkün olduğunca structured formatta tutulmalıdır.

Örneğin:

{
  "level": "info",
  "message": "appointment.completed",
  "requestId": "req-123",
  "tenantId": "tenant-123",
  "userId": "user-123"
}
59. No String-Only Context

Sadece:

"Appointment completed"

gibi context'siz loglar yerine structured fields tercih edilmelidir.

60. Logging Context

Ortak context:

requestId
correlationId
tenantId
userId

mümkün olduğunca loglara eklenmelidir.

61. Error Logging

Error loglarında:

Error class
Message
Stack
Request ID
Tenant ID
User ID

gibi debugging için gerekli context bulunabilir.

Sensitive payload eklenmemelidir.

62. Stack Trace

Stack trace production client response'una gönderilmemelidir.

Stack trace yalnızca internal logging/observability sisteminde tutulmalıdır.

63. Database Errors

Database exception:

Application Log

olarak kaydedilebilir.

Ancak raw SQL, secret veya sensitive query parameters loglanmamalıdır.

64. Redis Errors

Redis failure:

WARN

veya:

ERROR

olarak operation criticality'ye göre loglanabilir.

Redis cache ise cache failure ile application failure ayrıştırılmalıdır.

65. External Provider Logs

External API loglarında:

Provider
Operation
Latency
Status
Request ID

gibi metadata tutulabilir.

Secret authorization header'ları loglanmamalıdır.

66. Retry Logging

Retry durumunda:

attempt
maxAttempts
provider
operation

gibi metadata faydalıdır.

67. Performance Logging

Slow operation threshold'ları belirlenebilir.

Örneğin:

Database query > threshold
External API > threshold
HTTP request > threshold

WARN olarak loglanabilir.

Final threshold'lar implementation/production tuning aşamasında belirlenecektir.

68. Audit Transaction

Critical business operation ile audit event mümkün olduğunca aynı transaction boundary içinde düşünülmelidir.

Örneğin:

Payment update
+
Audit event

tutarlılık gerektiriyorsa aynı database transaction'a alınabilir.

69. Async Audit

Audit event queue üzerinden async yazılacaksa:

Business Operation
 ↓
Commit
 ↓
Queue
 ↓
Audit Worker

modelinde event kaybı riskleri ayrıca ele alınmalıdır.

Critical audit records için durable delivery mekanizması gerekir.

70. Audit Reliability

Audit system:

Best effort

mi yoksa:

Critical durable record

mu olacak endpoint bazında belirlenmelidir.

Financial/security operations için daha güçlü durability tercih edilir.

71. Audit Failure

Audit write başarısız olduğunda davranış operation criticality'ye göre belirlenmelidir.

Örneğin:

Low-risk operation
→ business operation devam edebilir

ama:

Critical financial/security operation
→ audit failure operation'ı engelleyebilir

Bu karar endpoint/business domain bazında verilmelidir.

72. Audit Event Version

İleride event schema değişirse:

eventVersion

alanı değerlendirilebilir.

Örneğin:

appointment.completed
version = 1
73. Event Naming Stability

Audit action isimleri stable tutulmalıdır.

Örneğin:

appointment.completed

yerine rastgele:

appointment.done
appointment.finished
appointment.complete

gibi değişiklikler yapılmamalıdır.

74. Audit API Contract

Audit API response'u:

Stable
Paginated
Tenant-aware
Permission-protected

olmalıdır.

75. Audit Search

Audit search:

action
actor
resource
tenant
branch
date range

üzerinden filtrelenebilir.

Free-form SQL/filter input kabul edilmemelidir.

76. Audit Indexing

Audit table büyüyeceği için ileride index'ler:

tenantId
createdAt
actorId
resourceType
resourceId
action

alanlarında değerlendirilebilir.

Final indexing gerçek query pattern'lerine göre yapılmalıdır.

77. Large Audit Table

Audit table zaman içinde büyüyebilir.

Gerektiğinde:

Partitioning
Archival
Retention Jobs

değerlendirilebilir.

İlk sürümde premature partitioning yapılmamalıdır.

78. Compliance

Beauty ERP'nin faaliyet gösterdiği pazarlara göre:

Data privacy
Accounting retention
Customer data
Employee data

gereksinimleri ileride ayrıca değerlendirilmelidir.

Bu doküman tek başına hukuki/compliance gereklilik tanımlamaz.

79. Audit Privacy

Audit trail'in amacı:

Traceability

sağlamaktır.

Bu nedenle:

"More data is always better"

yaklaşımı kullanılmamalıdır.

Yalnızca gerekli data tutulmalıdır.

80. Least Data Principle

Audit:

Necessary
Useful
Searchable
Safe

metadata içermelidir.

Gereksiz PII veya secret saklanmamalıdır.

81. Security Monitoring

Security logları ileride SIEM/monitoring sistemine aktarılabilir.

Örneğin:

Failed login spike
Repeated 403
Suspicious tenant switching
Mass export

gibi olaylar alarm üretebilir.

82. Audit vs Event Bus

Audit event ile domain event aynı şey değildir.

Domain event:

Business state changed

amaçlıdır.

Audit event:

Traceability
Who did what

amaçlıdır.

Bir domain event audit event üretmeye sebep olabilir ancak ikisi aynı abstraction olmak zorunda değildir.

83. Domain Event Example

Örneğin:

AppointmentCompleted

domain event olabilir.

Audit:

appointment.completed
actorId = user-123

olabilir.

84. System-Generated Events

System operation'ları:

WORKER
SYSTEM

actor type ile audit edilebilir.

Örneğin:

appointment.auto_cancelled
actorType = SYSTEM
85. Scheduled Jobs

Scheduled job'lar kritik business state değiştiriyorsa audit event oluşturabilir.

Örneğin:

SYSTEM
appointment.auto_cancelled
86. Integration Actor

External provider'dan gelen business operation:

INTEGRATION

actor type ile temsil edilebilir.

Örneğin:

INTEGRATION
payment.confirmed
87. Audit Testing

Audit implementation testleri:

[ ] Event created
[ ] Correct actor
[ ] Correct tenant
[ ] Correct branch
[ ] Correct resource
[ ] Correct action
[ ] Correct result
[ ] No secrets
[ ] Immutable
[ ] Transaction behavior

kontrollerini içermelidir.

88. Authorization Audit Tests

Özellikle:

Allowed operation
Denied operation
Wrong tenant
Wrong branch

sonuçlarının doğru şekilde audit edildiği test edilmelidir.

89. Financial Audit Tests

Payment/refund gibi kritik operations:

Business mutation
+
Audit record

tutarlılığı açısından test edilmelidir.

90. Current State

Şu anda:

NestJS
Prisma
PostgreSQL
Redis
Health

foundation hazırdır.

Audit implementation henüz yapılmamıştır.

Bu doküman hedef audit/logging mimarisini tanımlar.

91. Implementation Order

Önerilen sıra:

Request ID
 ↓
Structured Logger
 ↓
AuditEvent model
 ↓
Audit service
 ↓
Audit persistence
 ↓
Authentication events
 ↓
Authorization events
 ↓
Business events
 ↓
Audit API
 ↓
Retention
 ↓
Monitoring
92. Final Principle

Beauty ERP logging sistemi:

Teknik sorunları çözmek için application logs, güvenlik ve erişim olaylarını takip etmek için security logs, business operasyonlarının kim tarafından ve hangi tenant/resource üzerinde gerçekleştirildiğini kanıtlamak için audit logs kullanır.

Bu üç katman birbirine karıştırılmamalıdır.