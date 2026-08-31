# Beauty ERP — Security

> Bu doküman Beauty ERP'nin güvenlik modelini, tenant isolation kurallarını, authentication/authorization sınırlarını, secret yönetimini, input güvenliğini ve audit yaklaşımını tanımlar.

---

# 1. Core Principle

Beauty ERP security modelinin temel amacı:

```text
Tenant Isolation
Least Privilege
Defense in Depth
Secure Defaults
Auditability
Data Protection

sağlamaktır.

Security yalnızca authentication katmanından oluşmaz.

2. Security Layers

Temel güvenlik katmanları:

Transport
    ↓
Authentication
    ↓
Tenant Context
    ↓
Membership
    ↓
Role / Permission
    ↓
Branch Scope
    ↓
Resource Authorization
    ↓
Database Integrity
    ↓
Audit
3. Authentication

Authentication:

"Bu kullanıcı kim?"

sorusunu cevaplar.

Authorization ise:

"Bu kullanıcı bunu yapabilir mi?"

sorusunu cevaplar.

İki kavram birbirine karıştırılmamalıdır.

4. Authentication Boundary

Authentication mümkün olduğunca request'in erken aşamasında yapılmalıdır.

Unauthenticated request protected endpoint'e ulaşmamalıdır.

5. Authentication Failure

Geçerli authentication yoksa:

401 Unauthorized

kullanılır.

Örnek:

Missing credentials
Invalid token
Expired token
Revoked session
6. Authorization

Authorization:

User
+
Tenant Membership
+
Role
+
Permission
+
Branch Scope
+
Resource Ownership

birlikte değerlendirilerek yapılabilir.

7. Least Privilege

Her kullanıcı yalnızca ihtiyaç duyduğu yetkilere sahip olmalıdır.

Default:

DENY

olmalıdır.

Açıkça izin verilmemiş operation otomatik olarak allowed kabul edilmemelidir.

8. Role vs Permission

Role:

yüksek seviyeli access grouping

Permission:

gerçek operation yetkisi

olarak değerlendirilir.

Örneğin:

Role:
MANAGER

Permissions:
customers.read
customers.update
appointments.read
appointments.update
9. Permission Naming

Permission formatı:

resource.action

olabilir.

Örnek:

customers.read
customers.create
customers.update
customers.delete

appointments.read
appointments.create
appointments.update
appointments.cancel

payments.read
payments.create
payments.refund
10. Permission Stability

Permission code'ları API error code'ları gibi stable contract olarak ele alınmalıdır.

Gereksiz rename yapılmamalıdır.

11. Tenant Membership

Bir user'ın tenant'a erişimi membership üzerinden belirlenmelidir.

Örneğin:

User
 ├── Tenant A → ACTIVE
 └── Tenant B → ACTIVE

User yalnızca aktif membership bulunan tenant'lara erişebilir.

12. Membership Status

Önemli membership states:

ACTIVE
SUSPENDED
REMOVED

olabilir.

13. Suspended Membership

Membership:

SUSPENDED

ise tenant business operations reddedilmelidir.

14. Removed Membership

Membership:

REMOVED

ise user tenant resource'larına erişememelidir.

15. Tenant Context

Request sırasında active tenant context oluşturulmalıdır.

Kavramsal akış:

Request
 ↓
Authenticated User
 ↓
Active Tenant
 ↓
Membership
 ↓
Authorization Context
16. Client Tenant ID

Client'ın gönderdiği:

tenantId

tek başına authorization değildir.

Server membership'i doğrulamalıdır.

17. Tenant Isolation

En kritik security invariant:

Tenant A
    X
Tenant B

Tenant A user'ı Tenant B resource'una erişememelidir.

18. Cross-Tenant Read

Örneğin:

Tenant A user
        ↓
GET customer belonging to Tenant B

sonucu:

DENY

olmalıdır.

Resource existence leakage mümkün olduğunca önlenmelidir.

19. Cross-Tenant Update

Tenant A user:

PATCH Tenant B resource

yapamamalıdır.

20. Cross-Tenant Delete

Tenant A user:

DELETE Tenant B resource

yapamamalıdır.

21. Cross-Tenant Create

Create operation sırasında:

tenantId

server-side authorization context'ten belirlenmelidir.

Client'ın arbitrary tenantId ile resource oluşturmasına izin verilmemelidir.

22. Query-Level Tenant Scoping

Tenant-owned database query'leri tenant scope içermelidir.

Kavramsal olarak:

find customer
WHERE
    id = ?
AND
    tenantId = currentTenant
23. Repository Safety

Tenant-owned repository method'ları mümkün olduğunca tenant context'i zorunlu kılmalıdır.

Riskli pattern:

findById(id)

Daha güvenli pattern:

findById(tenantId, id)

veya eşdeğer tenant-scoped abstraction'tır.

24. Database Defense in Depth

Application-level tenant checks kritik olmakla birlikte database integrity de ayrıca korunmalıdır.

İleride PostgreSQL Row Level Security gibi mekanizmalar ihtiyaç halinde değerlendirilebilir.

25. Branch Isolation

Tenant içindeki branch scope ayrıca authorization boundary oluşturabilir.

Örneğin:

Tenant A
 ├── Istanbul
 └── Ankara

Istanbul scoped user Ankara resource'una erişememelidir.

26. Branch Scope

Örnek scope:

ALL_BRANCHES
SPECIFIC_BRANCHES

olabilir.

27. Branch Authorization

Her branch-owned operation için:

User
+
Tenant
+
Branch Scope

kontrol edilmelidir.

28. Role Alone Is Not Enough

Role:

MANAGER

olması tek başına her tenant veya branch resource'una erişim anlamına gelmez.

Scope ayrıca kontrol edilmelidir.

29. Resource Authorization

Permission olsa bile resource scope uygun değilse operation reddedilmelidir.

Örneğin:

Permission:
appointments.update

Scope:
Branch Istanbul

Resource:
Branch Ankara

sonuç:

DENY
30. Sensitive Resources

Özellikle:

Payments
Financial records
Employee records
Customer personal data
Audit logs
Authentication data

daha sıkı authorization gerektirir.

31. Passwords

Password'lar:

plaintext

olarak saklanmamalıdır.

Password storage için uygun password hashing algorithm kullanılmalıdır.

32. Password Hashing

Hashing:

one-way
salted
slow enough to resist brute force

olmalıdır.

Encryption ile password hashing birbirine karıştırılmamalıdır.

33. Password Logging

Password:

logs
errors
audit events
analytics

içinde bulunmamalıdır.

34. Tokens

Authentication token'ları:

logs
error messages
analytics
audit records

içine yazılmamalıdır.

35. Secrets

Secret değerleri:

DATABASE_URL
REDIS_URL
JWT_SECRET
API keys
Provider credentials
Encryption keys

source code içine hard-code edilmemelidir.

36. Environment Variables

Development:

.env

kullanılabilir.

Ancak secret-containing .env dosyaları Git'e commit edilmemelidir.

37. Environment Example

Repository'de:

.env.example

bulunabilir.

Örneğin:

DATABASE_URL=
REDIS_URL=
PORT=

gibi placeholder değerler içerebilir.

38. Production Secrets

Production secret'ları:

Secret Manager
Deployment Platform Secrets
Environment Secrets

gibi güvenli mekanizmalarda tutulmalıdır.

39. Secret Rotation

Secret'lar gerektiğinde rotate edilebilir olmalıdır.

Özellikle:

API keys
JWT secrets
Provider credentials
Database credentials

için rotation procedure bulunmalıdır.

40. Database Credentials

Database credentials application logs veya API responses içinde expose edilmemelidir.

41. Redis Credentials

Redis credentials varsa aynı şekilde:

logs
responses
exceptions

içinde expose edilmemelidir.

42. Input Validation

Her public input validate edilmelidir.

Validation:

type
format
length
range
enum
required fields

kontrollerini kapsayabilir.

43. Unknown Input

Unknown fields mümkün olduğunca reject edilmelidir.

Bu:

typo
unexpected data
mass assignment

risklerini azaltır.

44. Mass Assignment

Client'ın arbitrary field göndererek internal property değiştirmesine izin verilmemelidir.

Örneğin:

{
  "name": "John",
  "role": "OWNER",
  "tenantId": "other-tenant"
}

gibi request'ler yalnızca explicit DTO fields üzerinden kontrol edilmelidir.

45. DTO Boundary

API DTO:

Public Input

ile:

Database Model

arasında güvenlik boundary'sidir.

Database entity doğrudan request body olarak kullanılmamalıdır.

46. Output Filtering

Response DTO sensitive/internal fields'i filtrelemelidir.

Örneğin:

passwordHash
internalNotes
providerToken
systemMetadata

API response'a dahil edilmemelidir.

47. SQL Injection

Database access için parameterized ORM/query mechanisms kullanılmalıdır.

Raw SQL kullanılması gerekiyorsa parameterization zorunludur.

48. Redis Injection

Redis command/query oluştururken user input doğrudan command structure'a eklenmemelidir.

Key/value construction kontrollü olmalıdır.

49. XSS

API HTML üretmiyorsa risk azalır ancak user-generated text:

customer notes
comments
messages

gibi alanlarda frontend rendering security ayrıca uygulanmalıdır.

API gerektiğinde content sanitization policy uygulamalıdır.

50. SSRF

External URL kabul eden feature'larda SSRF riski değerlendirilmelidir.

Örneğin:

POST /imports
{
  "url": "..."
}

gibi endpoint'ler arbitrary internal URL'lere erişememelidir.

51. File Uploads

File upload özelliği geldiğinde:

size
mime type
extension
content
storage path
virus scanning

gibi güvenlik kontrolleri değerlendirilmelidir.

52. File Names

User-supplied filename doğrudan filesystem path olarak kullanılmamalıdır.

53. Path Traversal

File operations:

../
absolute paths
encoded traversal

gibi saldırılara karşı korunmalıdır.

54. Rate Limiting

Özellikle:

Authentication
Password reset
Verification
Payment
Public API
Bulk operations

endpoint'lerinde rate limiting uygulanmalıdır.

55. Brute Force

Authentication endpoint'leri brute-force saldırılarına karşı korunmalıdır.

Mekanizmalar:

Rate limiting
Temporary lockout
Progressive delay
Monitoring

ihtiyaca göre kullanılabilir.

56. Enumeration

Login veya password reset gibi endpoint'lerde:

user exists
user does not exist

farkının gereksiz şekilde dışarı sızması önlenmelidir.

57. CORS

CORS explicit allowlist ile yapılandırılmalıdır.

Production'da:

*

gibi unrestricted origin kullanımı tercih edilmemelidir.

58. Security Headers

HTTP security headers uygun şekilde yapılandırılmalıdır.

Örnek:

X-Content-Type-Options
Content-Security-Policy
Referrer-Policy

ve deployment architecture'a uygun diğer headers.

59. HTTPS

Production API HTTPS üzerinden çalışmalıdır.

Sensitive credentials plain HTTP üzerinden taşınmamalıdır.

60. TLS Termination

TLS reverse proxy/load balancer seviyesinde terminate ediliyorsa application'ın forwarded headers güvenli şekilde configure edilmesi gerekir.

61. Cookies

Cookie-based authentication kullanılırsa:

HttpOnly
Secure
SameSite

özellikleri uygun şekilde ayarlanmalıdır.

62. CSRF

Cookie-based authentication kullanılıyorsa CSRF protection değerlendirilmelidir.

Bearer-token-only API'de risk modeli farklıdır.

63. Authentication Session

Session kullanılıyorsa:

expiration
revocation
rotation
concurrency

politikaları belirlenmelidir.

64. Token Expiration

Token'ların indefinite lifetime'a sahip olması tercih edilmemelidir.

Access token ve refresh token lifecycle ayrı değerlendirilebilir.

65. Logout

Logout:

client token deletion

ile sınırlı kalmamalı; kullanılan authentication architecture'a göre server-side revocation da değerlendirilmelidir.

66. Audit

Security-sensitive operations audit edilmelidir.

Örneğin:

login
logout
role changed
permission changed
membership suspended
membership removed
payment refunded
67. Audit Actor

Audit event mümkün olduğunca:

actorId
tenantId
action
resource
timestamp
result

context'i taşımalıdır.

68. Audit Immutability

Audit records normal business API üzerinden değiştirilememelidir.

69. Audit Tenant Isolation

Tenant A user'ı Tenant B audit records'a erişememelidir.

70. Sensitive Audit Data

Audit log:

password
token
secret
full payment credentials

gibi sensitive data içermemelidir.

71. Security Logging

Security events loglanabilir:

Repeated failed login
Permission denial spike
Suspicious tenant access
Provider authentication failure
72. Logging Redaction

Logs sensitive values redact etmelidir.

Örneğin:

Authorization: Bearer ***
DATABASE_URL=***
password=***
73. Error Leakage

Production API:

stack trace
SQL query
database credentials
filesystem path
internal service URL

gibi detayları expose etmemelidir.

74. Tenant Enumeration

Bir resource başka tenant'a ait olduğunda response mümkün olduğunca resource existence bilgisini açığa çıkarmamalıdır.

Bu nedenle uygun durumlarda:

404 Not Found

tercih edilebilir.

75. Authorization Before Sensitive Work

Authorization mümkün olduğunca sensitive operation başlamadan önce yapılmalıdır.

Örneğin:

authorize
 ↓
load sensitive data

tercih edilir.

76. Authorization After Lookup

Bazı durumlarda resource ID üzerinden scoped lookup yapılarak authorization ve existence leakage birlikte çözülebilir:

find resource
WHERE id = ?
AND tenantId = currentTenant
77. Transaction Security

Sensitive mutation'larda:

authorization
+
validation
+
transaction

sırası ve boundary'si dikkatli belirlenmelidir.

78. Race Conditions

Authorization kontrolünden sonra resource state değişebiliyorsa concurrency riski değerlendirilmelidir.

Örneğin:

check
 ↓
resource changes
 ↓
operation

TOCTOU problemi oluşturabilir.

79. Financial Security

Financial mutation'larda özellikle:

Authorization
Idempotency
Transaction
Audit
Concurrency

birlikte değerlendirilmelidir.

80. Payment Secrets

Payment provider secret/token/card data gibi bilgiler application domain modelinde gereksiz şekilde tutulmamalıdır.

PCI/compliance gereksinimleri ayrıca değerlendirilmelidir.

81. PII

Customer data içinde:

name
phone
email
address
notes

gibi personal data bulunabilir.

Access control ve retention policy uygulanmalıdır.

82. Data Minimization

Application yalnızca business operation için gereken personal data'yı saklamalıdır.

Gereksiz sensitive data toplanmamalıdır.

83. Data Retention

PII ve audit data için ileride retention policies belirlenmelidir.

Örneğin:

Operational data
Audit data
Financial records
Temporary data

farklı retention sürelerine sahip olabilir.

84. Data Deletion

Customer deletion:

hard delete
soft delete
anonymization

arasından domain/legal requirement'a göre seçilmelidir.

85. Backups

Production database backup'ları:

encrypted
access-controlled
tested

olmalıdır.

Backup var olması restore test edildiği anlamına gelmez.

86. Restore Testing

Periyodik restore testleri:

Backup
 ↓
Restore
 ↓
Integrity validation

şeklinde yapılmalıdır.

87. Dependency Security

Dependencies düzenli olarak:

updated
audited

edilmelidir.

Critical security vulnerability bulunduğunda dependency upgrade planı oluşturulmalıdır.

88. Supply Chain

Package manager lockfile:

pnpm-lock.yaml

version control altında tutulmalıdır.

Dependency değişiklikleri review edilmelidir.

89. Dependency Principle

Gereksiz dependency eklenmemelidir.

Yeni package:

Need
Security
Maintenance
License
Bundle/runtime impact

açısından değerlendirilmelidir.

90. Secrets in Git

Git history'ye secret commit edilmemelidir.

Yanlışlıkla commit edilirse yalnızca dosyayı silmek yeterli değildir.

Secret revoke/rotate edilmelidir.

91. Git Hooks

İleride secret scanning:

pre-commit
CI

seviyelerinde değerlendirilebilir.

92. Production Debugging

Production debugging için:

logs
metrics
traces
requestId

kullanılmalıdır.

Production source code'a debug endpoint eklemek tercih edilmez.

93. Debug Endpoints

Şu tip endpoint'ler production'a expose edilmemelidir:

/debug
/config
/env
/database
/admin/debug
94. Health Endpoint

Health endpoint yalnızca gerekli operational information'ı expose etmelidir.

Örneğin:

{
  "status": "ok",
  "services": {
    "database": "up",
    "redis": "up"
  }
}

gibi.

Credential veya internal topology expose edilmemelidir.

95. Security Testing

Security testleri en azından:

Authentication
Authorization
Tenant Isolation
Branch Isolation
Input Validation
Error Leakage
Rate Limiting
Secret Leakage

alanlarını kapsamalıdır.

96. Regression Security

Her security bug düzeltildiğinde regression test eklenmelidir.

Örneğin:

Cross-tenant access bug
        ↓
Fix
        ↓
Permanent test
97. Security Review

Yeni sensitive feature öncesi:

Data
Auth
Tenant
Permission
Audit
Secrets
External dependencies

review edilmelidir.

98. Security Checklist

Yeni protected endpoint:

[ ] Authentication
[ ] Tenant context
[ ] Membership status
[ ] Permission
[ ] Branch scope
[ ] Resource authorization
[ ] Input validation
[ ] Output filtering
[ ] Error safety
[ ] Audit
[ ] Rate limiting where needed
[ ] Tests
99. Current State

Mevcut foundation:

NestJS
Prisma
PostgreSQL
Redis
Config
Health

durumundadır.

Authentication ve authorization implementation'ı henüz tamamlanmış değildir.

Bu doküman hedef security architecture'ı tanımlar.

100. Implementation Order

Önerilen sıra:

Authentication
 ↓
Tenant Context
 ↓
Membership
 ↓
Permission Model
 ↓
Authorization Guard
 ↓
Branch Scope
 ↓
Resource Authorization
 ↓
Audit
 ↓
Rate Limiting
 ↓
Security Tests
101. Final Principle

Beauty ERP security:

Authentication ile kullanıcının kimliğini doğrular, tenant membership ve permission sistemiyle erişimi sınırlar, her tenant-owned resource'u server-side scope ile korur ve sensitive operations'ı audit edilebilir hale getirir.

En kritik invariant:

A user must never be able to access or mutate data outside their authorized tenant and scope.