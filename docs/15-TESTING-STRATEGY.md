# Beauty ERP — Testing Strategy

> Bu doküman Beauty ERP'nin unit, integration, end-to-end, authorization, tenant isolation ve infrastructure test yaklaşımını tanımlar.

---

# 1. Core Principle

Testlerin amacı yalnızca code coverage artırmak değildir.

Asıl amaç:

```text
Correctness
Security
Tenant Isolation
Business Rules
Regression Protection
Operational Reliability

sağlamaktır.

2. Testing Pyramid

Temel test piramidi:

        E2E
       /   \
 Integration
    /       \
    Unit Tests

Çoğu business logic unit test seviyesinde hızlı şekilde test edilmelidir.

Integration testler gerçek infrastructure davranışını doğrulamalıdır.

E2E testler kritik user/business flow'ları doğrulamalıdır.

3. Test Layers

Beauty ERP'de:

Unit
Integration
E2E
Contract
Security
Infrastructure

testleri farklı amaçlara hizmet eder.

4. Unit Test

Unit test tek bir unit'in davranışını izole test eder.

Örneğin:

AppointmentService
PaymentService
AuthorizationService
CustomerService
5. Unit Test Principle

Unit test:

Fast
Deterministic
Isolated

olmalıdır.

Gerçek PostgreSQL veya Redis'e ihtiyaç duymamalıdır.

6. Unit Test Dependencies

Dependency'ler mock/fake olabilir:

PrismaService
RedisService
ExternalProvider
Repository
Queue
7. Unit Test Example

Örneğin appointment cancellation:

Appointment status = SCHEDULED
Permission = appointments.cancel
        ↓
cancel()
        ↓
status = CANCELLED

test edilmelidir.

8. Business Rule Tests

Business rule'lar unit test seviyesinde yoğun şekilde test edilmelidir.

Örneğin:

COMPLETED appointment
        ↓
cancel()
        ↓
reject
9. State Transition Tests

Her önemli state machine için geçerli ve geçersiz transition'lar test edilmelidir.

Örneğin:

SCHEDULED → CONFIRMED
CONFIRMED → CHECKED_IN
CHECKED_IN → COMPLETED

ve invalid transition'lar:

COMPLETED → SCHEDULED
CANCELLED → COMPLETED
10. Integration Test

Integration test birden fazla gerçek component'in birlikte çalışmasını doğrular.

Örneğin:

NestJS
+
Prisma
+
PostgreSQL
11. Real Database

Database integration testleri mümkün olduğunca gerçek PostgreSQL instance'ı üzerinde çalışmalıdır.

Mock database gerçek database davranışını tam olarak temsil etmez.

12. Test Database

Development database ile test database ayrılmalıdır.

Örneğin:

Development
beauty_erp

Test
beauty_erp_test
13. Test Isolation

Bir testin database state'i diğer testi etkilememelidir.

Yaklaşımlar:

Transaction rollback
Database reset
Test schema
Disposable database

arasından uygun yöntem seçilebilir.

14. Prisma Integration Tests

Prisma integration testlerinde gerçek:

Prisma Client
PostgreSQL

kullanılmalıdır.

Repository/query davranışı gerçek SQL database üzerinde doğrulanmalıdır.

15. Migration Testing

Migration'lar test edilmelidir.

En azından:

Fresh database
 ↓
migrate deploy
 ↓
Application

akışı doğrulanmalıdır.

16. Migration Regression

Yeni migration mevcut database migration history ile uyumlu olmalıdır.

Migration dosyaları production'da değiştirildikten sonra yeniden yazılmamalıdır.

17. Seed Data

Integration/E2E testler için deterministic seed data kullanılabilir.

Örneğin:

Tenant A
Tenant B

Branch A1
Branch A2
Branch B1

User A
User B
18. Deterministic Tests

Test sonucu:

Current time
Random data
External API
Network

gibi kontrolsüz faktörlere gereksiz şekilde bağlı olmamalıdır.

19. Time

Time-dependent business logic için clock abstraction kullanılabilir.

Örneğin:

Clock.now()

yerine doğrudan:

new Date()

kullanmak testleri zorlaştırabilir.

20. IDs

Test data ID'leri gerektiğinde deterministic olabilir.

Random UUID kullanılıyorsa test assertion'ları ID'nin kendisine gereksiz şekilde bağımlı olmamalıdır.

21. Redis Integration

Redis kullanan infrastructure için gerçek Redis integration testleri yapılmalıdır.

Örneğin:

RedisService
RedisModule
Cache
Lock
Session
22. Redis Test Isolation

Test Redis database/keyspace'i production/development Redis'ten ayrılmalıdır.

Test sonunda key'ler temizlenmelidir.

23. Health Integration Test

Health endpoint:

GET /health

şunları doğrulamalıdır:

Database = up
Redis = up
24. Health Failure Tests

Database unavailable olduğunda:

database = down

Redis unavailable olduğunda:

redis = down

beklenen davranış doğrulanmalıdır.

25. E2E Test

E2E test gerçek HTTP sınırından başlar.

Örneğin:

HTTP Request
 ↓
Controller
 ↓
Application
 ↓
Database
 ↓
HTTP Response
26. E2E Purpose

E2E test:

Routing
Validation
Authentication
Authorization
Business Logic
Persistence
Response Contract

gibi katmanların birlikte çalışmasını doğrular.

27. E2E Critical Flows

İlk kritik flow'lar:

Authentication
Tenant creation
Tenant membership
Customer creation
Appointment creation
Appointment completion
Payment
Authorization

olabilir.

Final list domain geliştikçe genişletilecektir.

28. Tenant Isolation Testing

Multi-tenant sistemde en kritik testlerden biridir.

Test:

Tenant A User
        ↓
Tenant B Resource
        ↓
DENY

olmalıdır.

29. Cross-Tenant Read

Örneğin:

GET /customers/customer-from-tenant-B

Tenant A user tarafından çağrılırsa resource başka tenant'a ait olduğu açığa çıkarılmamalıdır.

Beklenen sonuç:

404

veya project-wide belirlenen güvenli authorization response'udur.

30. Cross-Tenant Update

Tenant A user:

PATCH customer-from-tenant-B

yapamamalıdır.

Database state değişmemelidir.

31. Cross-Tenant Delete

Tenant A user:

DELETE customer-from-tenant-B

yapamamalıdır.

Resource Tenant B'de aynı kalmalıdır.

32. Cross-Tenant Mutation Test

Her kritik mutation için:

Create
Read
Update
Delete

tenant boundary testleri yapılmalıdır.

33. Branch Isolation

Tenant içinde branch scope da test edilmelidir.

Örneğin:

User
 └── Branch Istanbul

Resource
 └── Branch Ankara

operation:

DENY

olmalıdır.

34. All Branches Scope

ALL_BRANCHES scope'una sahip user:

Branch A
Branch B
Branch C

resource'larına erişebilmelidir.

35. Specific Branch Scope

User yalnızca:

Branch A
Branch B

scope'una sahipse:

Branch C

resource'larına erişememelidir.

36. Role Tests

Her önemli role için permission matrix testleri oluşturulmalıdır.

Örneğin:

OWNER
ADMIN
MANAGER
STAFF
ACCOUNTANT
RECEPTION
37. Permission Tests

Örnek:

payments.refund

için:

Allowed role
        ↓
SUCCESS

Unauthorized role
        ↓
403

test edilmelidir.

38. Missing Permission

User authenticated ancak permission yoksa:

401

değil:

403

beklenmelidir.

39. Suspended Membership

User authenticated olabilir fakat membership:

SUSPENDED

ise tenant business operations reddedilmelidir.

40. Removed Membership

Removed membership sonrası:

tenant access

olmamalıdır.

Aktif session varsa authorization context'in nasıl invalidated/revalidated edildiği test edilmelidir.

41. Tenant Switching

Multi-tenant user:

Tenant A
Tenant B

arasında switch yapabilmelidir.

Ancak:

Tenant C

member değilse switch edememelidir.

42. Authentication Tests

Testler:

Valid credentials
Invalid credentials
Expired token
Missing token
Revoked session

durumlarını kapsamalıdır.

43. Authorization Tests

Testler:

Valid permission
Missing permission
Wrong tenant
Wrong branch
Wrong role
Suspended membership

durumlarını kapsamalıdır.

44. Validation Tests

Her public DTO için:

Valid input
Missing required field
Wrong type
Invalid format
Boundary values
Unexpected fields

test edilmelidir.

45. Boundary Tests

Özellikle:

limit = 0
limit = 1
limit = max
limit > max
empty string
very long string

gibi boundary değerleri test edilmelidir.

46. Business Conflict Tests

Örneğin appointment scheduling:

Available slot
        ↓
SUCCESS

Already occupied
        ↓
APPOINTMENT_CONFLICT

test edilmelidir.

47. Idempotency Tests

Idempotent endpointlerde aynı request tekrar gönderildiğinde:

First request
 ↓
SUCCESS

Same idempotency key
 ↓
Same logical result

beklenmelidir.

48. Idempotency Conflict

Aynı idempotency key farklı payload ile gönderilirse:

IDEMPOTENCY_KEY_REUSED

gibi conflict oluşmalıdır.

49. Concurrency Tests

Critical operations için concurrent request testleri değerlendirilebilir.

Örneğin:

Two users
 ↓
Same appointment slot
 ↓
Only one succeeds
50. Inventory Concurrency

Stock:

quantity = 1

iki concurrent sale request'i:

Request A → SUCCESS
Request B → INSUFFICIENT_STOCK

olmalıdır.

51. Payment Concurrency

Refund operation aynı payment için iki kez concurrently çalıştırılırsa yalnızca geçerli bir operation başarıyla tamamlanmalıdır.

52. Database Constraint Tests

Database constraints integration testlerle doğrulanmalıdır.

Örneğin:

Unique slug
Unique email
Foreign key
Not null
53. Application vs Database Validation

Application validation:

Fast user feedback

sağlar.

Database constraint:

Final integrity boundary

sağlar.

İkisi birbirinin alternatifi değildir.

54. Transaction Tests

Transaction içindeki bir operation başarısız olduğunda:

All writes rollback

olduğu test edilmelidir.

55. Partial Transaction Failure

Örneğin:

Create payment
Create audit
Update appointment

işlemlerinden biri failure olduğunda transaction consistency test edilmelidir.

56. Outbox Tests

Outbox kullanılmaya başlandığında:

Business data
+
Outbox event

aynı transaction içinde oluştuğu test edilmelidir.

57. Worker Tests

Worker testleri:

Success
Retryable failure
Non-retryable failure
Maximum retries
Dead letter

durumlarını kapsamalıdır.

58. External Provider Tests

External provider integration testlerinde gerçek provider'a sürekli bağımlılık yaratılmamalıdır.

Contract/mock/sandbox kullanılabilir.

59. Provider Contract Tests

Provider response formatı değişirse uygulamanın bunu yakalayabilmesi için contract testleri kullanılabilir.

Örneğin:

HTTP status
Response schema
Required fields
Error format
60. External Timeout Test

Provider timeout simüle edilerek:

Timeout
 ↓
Expected application error
 ↓
Correct retry behavior

test edilmelidir.

61. External 5xx Test

Provider 500/503 döndürdüğünde:

Retryable

davranış doğru şekilde test edilmelidir.

62. External 4xx Test

Provider 400/401/403 gibi response'lar:

Non-retryable

ve uygun application error mapping ile test edilmelidir.

63. Error Contract Tests

Public API error response'ları stable olmalıdır.

Test:

statusCode
code
message
requestId

alanlarını doğrulayabilir.

64. Error Leakage Tests

Response içinde aşağıdakilerin bulunmadığı test edilmelidir:

Stack trace
SQL
DATABASE_URL
Redis URL
Secrets
Tokens
Internal file paths
65. Audit Tests

Critical business actions audit üretmelidir.

Örneğin:

payment.refunded
role.changed
membership.suspended
66. Audit Context Tests

Audit event:

actorId
tenantId
branchId
resourceType
resourceId
action
result

gibi doğru context taşımalıdır.

67. Audit Immutability Tests

Normal application API üzerinden audit record:

UPDATE
DELETE

edilememelidir.

68. Logging Tests

Structured logs gerektiğinde:

requestId
tenantId
userId

context'inin mevcut olduğunu doğrulamak için test edilebilir.

Ancak implementation detail nedeniyle aşırı log assertion yapılmamalıdır.

69. Health Tests

Health endpoint testleri:

Database up
Redis up
Database down
Redis down

durumlarını kapsamalıdır.

70. Infrastructure Tests

Infrastructure module'ları:

DatabaseModule
RedisModule
ConfigModule

başarıyla initialize edilebilmelidir.

71. Config Tests

Environment validation:

DATABASE_URL missing
REDIS_URL missing
PORT invalid

gibi durumları test etmelidir.

72. Environment Separation

Test environment:

NODE_ENV=test

ile development/production config'lerinden ayrılmalıdır.

73. Test Secrets

Gerçek production secret'ları test ortamında kullanılmamalıdır.

Test secret'ları disposable olmalıdır.

74. Test Data Cleanup

Test sonunda:

Database
Redis
Temporary files
Queues

gibi state'ler temizlenmelidir.

75. E2E Database Strategy

E2E testlerde disposable database/container kullanılabilir.

Örneğin:

Test start
 ↓
PostgreSQL
 ↓
Migrations
 ↓
Seed
 ↓
Tests
 ↓
Destroy
76. Docker Test Infrastructure

Development PostgreSQL/Redis ile test infrastructure aynı olmak zorunda değildir.

Testler gerektiğinde ayrı container lifecycle kullanabilir.

77. Test Naming

Test isimleri davranışı anlatmalıdır.

İyi:

should reject appointment cancellation when already completed

Kötü:

test1
78. Arrange / Act / Assert

Unit testlerde:

Arrange
 ↓
Act
 ↓
Assert

pattern'i tercih edilmelidir.

79. Test Independence

Testler execution order'a bağlı olmamalıdır.

Şu iki durumda da aynı sonucu vermelidir:

test A → test B

ve:

test B → test A
80. Flaky Tests

Flaky test:

Sometimes pass
Sometimes fail

durumudur.

Flaky testler ignore edilmemeli, root cause çözülmelidir.

81. No Sleep-Based Synchronization

Testlerde:

sleep(5000)

gibi rastgele beklemeler mümkün olduğunca kullanılmamalıdır.

Deterministic synchronization tercih edilmelidir.

82. Test Coverage

Coverage bir quality signal'dir.

Ancak:

100% coverage
≠
100% correctness

özellikle authorization ve business rule'larda davranış coverage daha önemlidir.

83. Critical Path Coverage

Öncelik:

Authentication
Authorization
Tenant Isolation
Payments
Appointments
Inventory
Financial mutations

üzerinde olmalıdır.

84. Security Regression Tests

Security bug düzeltildiğinde regression test eklenmelidir.

Örneğin:

Cross-tenant access bug
        ↓
Fix
        ↓
Permanent regression test
85. Tenant Isolation Regression

Her yeni tenant-owned resource için en az:

Read
Create
Update
Delete

authorization boundary'si değerlendirilmelidir.

86. Permission Regression

Yeni permission veya role değişikliğinde permission matrix testleri güncellenmelidir.

87. Database Migration Regression

Yeni migration:

Fresh database

ve mevcut migration history üzerinden test edilmelidir.

88. CI Test Pipeline

CI pipeline kavramsal olarak:

Install
 ↓
Lint
 ↓
Typecheck
 ↓
Unit
 ↓
Integration
 ↓
E2E
 ↓
Build

olabilir.

89. Fast Feedback

Developer local flow'da:

Typecheck
Unit

hızlı çalışmalıdır.

Full E2E suite daha uzun olabilir.

90. Pre-Commit

Pre-commit'te ağır E2E suite çalıştırmak zorunlu değildir.

Örneğin:

Format
Lint
Typecheck
Fast Unit

yeterli olabilir.

91. Pull Request

PR validation:

Lint
Typecheck
Unit
Integration
E2E
Build

ile daha kapsamlı yapılmalıdır.

92. Main Branch

Main branch'e merge edilmeden önce kritik test suite'lerinin başarılı olması hedeflenmelidir.

93. Test Failure Policy

Test fail olduğunda:

Do not ignore
Do not skip permanently
Do not weaken assertion

yaklaşımı kullanılmalıdır.

Root cause araştırılmalıdır.

94. Skipped Tests

skip yalnızca açık bir gerekçeyle kullanılmalıdır.

Örneğin:

TODO:
Requires external provider sandbox.

gibi açıklama bulunmalıdır.

95. Snapshot Tests

Snapshot testler yalnızca gerçekten stable output için kullanılmalıdır.

Her şeyi snapshot yapmak tercih edilmez.

96. API Contract

API response contract değişirse ilgili testler bilinçli olarak güncellenmelidir.

Testi sırf geçsin diye zayıflatmak kabul edilmez.

97. Test Fixtures

Tekrarlanan test data için fixture/factory abstraction kullanılabilir.

Örneğin:

createTenant()
createUser()
createCustomer()
createAppointment()
98. Factory Principle

Factory default olarak geçerli ve minimal data üretmelidir.

Test her zaman yalnızca ihtiyaç duyduğu alanları override etmelidir.

99. Test Builders

Complex domain objects için builder pattern değerlendirilebilir.

Örneğin:

appointmentBuilder()
  .forCustomer(...)
  .atBranch(...)
  .scheduledAt(...)
  .build()
100. Test Readability

Testler production code kadar okunabilir olmalıdır.

Bir testin neden fail olduğunu anlamak kolay olmalıdır.

101. Current State

Mevcut foundation:

NestJS
Prisma
PostgreSQL
Redis
Config
Health

durumundadır.

Testing infrastructure henüz tamamen kurulmuş değildir.

Bu doküman hedef testing strategy'yi tanımlar.

102. Implementation Order

Önerilen sıra:

Jest baseline
 ↓
Unit test conventions
 ↓
Database integration setup
 ↓
Redis integration setup
 ↓
Test factories
 ↓
Auth tests
 ↓
Tenant isolation tests
 ↓
Authorization tests
 ↓
Critical business flow E2E
 ↓
CI pipeline
103. First Tests

İlk implementation aşamasında:

[ ] HealthService unit test
[ ] HealthController e2e test
[ ] Prisma integration test
[ ] Redis integration test
[ ] Config validation test

oluşturulabilir.

104. Security First

Authorization implementation başladığında ilk güvenlik testleri:

[ ] Missing authentication
[ ] Missing permission
[ ] Wrong tenant
[ ] Wrong branch
[ ] Suspended membership
[ ] Cross-tenant read
[ ] Cross-tenant update
[ ] Cross-tenant delete

olmalıdır.

105. Final Principle

Beauty ERP test strategy:

Unit testlerle business logic'i hızlı ve izole doğrular, integration testlerle gerçek infrastructure davranışını kanıtlar, E2E testlerle kritik kullanıcı akışlarını doğrular ve security testleriyle tenant isolation ile authorization sınırlarını sürekli korur.

En kritik test priority:

Tenant Isolation
Authorization
Financial Integrity
Business State
Data Integrity

olmalıdır.