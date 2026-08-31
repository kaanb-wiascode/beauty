# Beauty ERP — Security

> Bu doküman Beauty ERP'nin temel güvenlik prensiplerini tanımlar.
>
> Authentication ve authorization kurallarına ek olarak secret yönetimi, tenant isolation, API güvenliği, webhook güvenliği, ödeme güvenliği, audit ve production güvenliği burada ele alınır.

---

# 1. Security Principles

Temel prensipler:

```text
Least Privilege
Deny by Default
Tenant Isolation
Defense in Depth
Secure by Default
Auditability
Fail Safely

Her yeni feature bu prensiplerle değerlendirilmelidir.

2. Threat Model

Beauty ERP için temel tehdit kategorileri:

Authentication Bypass
Authorization Bypass
Cross-Tenant Data Access
Credential Theft
Session Theft
Secret Leakage
SQL Injection
Command Injection
XSS
CSRF
SSRF
Webhook Forgery
Replay Attack
Brute Force
Rate Limit Abuse
Data Leakage
Insider Abuse

Her domain için ilgili tehditler ayrıca değerlendirilmelidir.

3. Tenant Isolation

En kritik güvenlik prensiplerinden biri:

Tenant A kullanıcısı Tenant B verisine erişemez.

Her tenant-owned resource için:

Request
 ↓
Authenticated User
 ↓
Tenant Context
 ↓
Authorization
 ↓
Resource Tenant
 ↓
Allow / Deny

kontrolü yapılmalıdır.

4. Tenant ID Trust

Client tarafından gönderilen:

tenantId

tek başına güvenilir kabul edilmemelidir.

Örneğin:

GET /customers?tenantId=TENANT_B

isteği Tenant A kullanıcısının Tenant B verisine erişmesini sağlamamalıdır.

Tenant context authentication ve membership üzerinden doğrulanmalıdır.

5. IDOR Protection

Resource ID bilmek resource'a erişim hakkı vermez.

Örneğin:

GET /customers/123

isteğinde:

customerId = 123

bilgisinin bilinmesi yeterli değildir.

Backend ayrıca:

User
 ↓
Tenant
 ↓
Scope
 ↓
Customer

ilişkisini doğrulamalıdır.

6. Authentication Security

Authentication endpoint'leri:

/login
/register
/refresh
/logout

gibi işlemleri içerir.

Bu endpoint'ler:

Rate limit
Brute-force protection
Input validation
Secure error handling
Audit

gerektirir.

7. Password Policy

Password:

Plain text

olarak saklanmaz.

Password hash:

Database
 ↓
Password Hash

şeklinde saklanmalıdır.

Login response'larında password veya password hash döndürülmemelidir.

8. Password Reset

Password reset akışı:

Request Reset
   ↓
Generate Token
   ↓
Send Secure Link / OTP
   ↓
Verify
   ↓
Set New Password
   ↓
Invalidate Existing Sessions

olabilir.

Reset token:

Tek kullanımlık
Süre sınırlı
Tahmin edilemez

olmalıdır.

9. Session Security

Session/token güvenliğinde:

Short-lived Access Token
+
Rotating Refresh Token

yaklaşımı kullanılabilir.

Logout sonrasında mümkün olduğunca ilgili refresh session revoke edilmelidir.

10. Token Storage

Web client tarafında token storage seçimi XSS riskleri dikkate alınarak yapılmalıdır.

Uzun ömürlü hassas token'ların:

localStorage

içinde tutulması varsayılan çözüm olarak kabul edilmemelidir.

HttpOnly/Secure cookie yaklaşımı gerektiğinde tercih edilebilir.

11. Secure Cookies

Cookie kullanıldığında:

HttpOnly
Secure
SameSite

ayarları deployment modeline göre uygun şekilde yapılandırılmalıdır.

Production cookie'leri HTTPS üzerinden çalışmalıdır.

12. CORS

CORS:

Allow *

şeklinde production'da açık bırakılmamalıdır.

Allowed origins explicit configuration üzerinden yönetilmelidir.

Örneğin:

WEB_APP_URL
ADMIN_APP_URL

gibi environment configuration kullanılabilir.

13. CSRF

Cookie-based authentication kullanılıyorsa CSRF riski ayrıca değerlendirilmelidir.

Gerekli endpoint'lerde:

CSRF Token
SameSite Cookie
Origin Validation

gibi kontroller kullanılabilir.

14. Input Validation

Tüm external input validate edilmelidir.

Örnek:

HTTP Request
 ↓
DTO / Schema
 ↓
Validation
 ↓
Business Logic

Validation yapılmadan database veya external service çağrısı yapılmamalıdır.

15. Zod / DTO Boundary

API boundary'de schema validation kullanılabilir.

Örneğin:

Request
 ↓
Zod / DTO
 ↓
Validated Input
 ↓
Application Service

TypeScript type safety runtime validation'ın yerine geçmez.

16. SQL Injection

Database sorguları parameterized query veya Prisma API üzerinden gerçekleştirilmelidir.

User input doğrudan SQL string'ine eklenmemelidir.

Riskli yaklaşım:

"SELECT * FROM customers WHERE name = '" + input + "'"

kullanılmamalıdır.

17. Dynamic SQL

Raw SQL gerektiğinde:

Prisma $queryRaw

gibi mekanizmalar dikkatli kullanılmalıdır.

User-controlled string interpolation yapılmamalıdır.

18. XSS

User-generated content:

Customer Notes
Feedback
Internal Notes
Campaign Content

gibi alanlarda XSS riski dikkate alınmalıdır.

HTML render ediliyorsa sanitization uygulanmalıdır.

19. HTML Email

Email template'lerinde user content doğrudan HTML olarak render edilmemelidir.

Özellikle:

Customer Name
Feedback
Appointment Notes

gibi alanlar escape edilmelidir.

20. SSRF

Backend'in user-controlled URL fetch ettiği özellikler SSRF açısından değerlendirilmelidir.

Örneğin:

Import URL
Webhook URL
Image URL
External Integration

gibi özelliklerde allowlist veya güvenli URL validation kullanılmalıdır.

21. File Upload

Dosya upload'larında:

File Size
MIME Type
Extension
Content Type
Filename
Storage Path

kontrol edilmelidir.

User-provided filename doğrudan filesystem path olarak kullanılmamalıdır.

22. File Storage

Upload edilen dosyalar mümkün olduğunca:

Object Storage

üzerinde tutulmalıdır.

Database'e yalnızca metadata/reference kaydedilebilir.

Örneğin:

File
├── id
├── storageKey
├── mimeType
├── size
└── uploadedBy
23. Malware Scanning

Kullanıcıların yüklediği dosyalar gerektiğinde malware scanning sürecinden geçirilmelidir.

Özellikle:

Documents
Images
Exports
Attachments

için production policy ayrıca belirlenmelidir.

24. Secrets

Secret'lar repository'ye commit edilmemelidir.

Örneğin:

DATABASE_URL
REDIS_URL
JWT_SECRET
ENCRYPTION_KEY
PAYMENT_SECRET
SMTP_PASSWORD
API_KEYS

.env veya production secret manager üzerinden sağlanmalıdır.

25. Environment Files

Repository'de:

.env.example

bulunabilir.

Ancak:

.env
.env.local
.env.production

gibi gerçek secret içeren dosyalar git'e commit edilmemelidir.

26. Secret Rotation

Secret'lar gerektiğinde rotate edilebilir.

Örneğin:

Old Secret
    ↓
Deploy New Secret
    ↓
Validate
    ↓
Revoke Old Secret

özellikle:

JWT
Payment Provider
Webhook
Database

secret'ları için rotation planı bulunmalıdır.

27. Environment Separation

En azından:

development
staging
production

environment'ları birbirinden ayrılmalıdır.

Production credential'ları development ortamında kullanılmamalıdır.

28. Database Security

PostgreSQL:

Public Internet

üzerinden doğrudan erişilebilir olmamalıdır.

Production'da database yalnızca gerekli network kaynaklarına açık olmalıdır.

29. Database Credentials

Database kullanıcıları minimum privilege prensibine göre oluşturulmalıdır.

Application user:

Application DB Access

için kullanılmalı; gereksiz:

Superuser

yetkilerine sahip olmamalıdır.

30. Database Backups

Production database için:

Automated Backup
Retention
Point-in-Time Recovery
Restore Test

planı bulunmalıdır.

Backup var olması tek başına yeterli değildir.

Restore işlemi düzenli olarak test edilmelidir.

31. Redis Security

Redis production'da:

Public Internet

üzerinden açık bırakılmamalıdır.

Gerekirse:

Authentication
TLS
Private Network

kullanılmalıdır.

32. Redis Is Not Source of Truth

Redis:

Cache
Session
Queue
Rate Limit
Temporary State

gibi amaçlarla kullanılabilir.

Ancak kritik business data'nın tek source of truth'u olmamalıdır.

33. Rate Limiting

Rate limit uygulanması gereken endpoint örnekleri:

Login
Register
Password Reset
OTP
Payment
Webhook
Public Forms
File Upload
Search

Rate limit tenant/user/IP bazında değerlendirilebilir.

34. Brute Force Protection

Özellikle authentication endpoint'lerinde:

Repeated Failed Login
        ↓
Rate Limit
        ↓
Temporary Lock / Delay

gibi korumalar uygulanabilir.

Kullanıcı var/yok bilgisini açığa çıkaran error mesajlarından kaçınılmalıdır.

35. API Security Headers

Production API'de uygun HTTP security header'ları kullanılmalıdır.

Örneğin:

X-Content-Type-Options
Content-Security-Policy
Referrer-Policy
Strict-Transport-Security

uygulama ve frontend architecture'a göre değerlendirilebilir.

36. HTTPS

Production ortamında authentication ve business API:

HTTPS

üzerinden çalışmalıdır.

Plain HTTP hassas traffic için kullanılmamalıdır.

37. Error Handling

Production response'larında:

Stack Trace
Database Error
Internal File Path
Secret
SQL Query
Provider Credential

gibi bilgiler kullanıcıya gönderilmemelidir.

Örneğin:

{
  "message": "Internal server error"
}

gibi kontrollü response tercih edilmelidir.

38. Logging

Loglarda:

Password
Access Token
Refresh Token
API Key
Credit Card Number
Bank Account
Secret

bulunmamalıdır.

Sensitive values redacted edilmelidir.

39. Request Correlation

Her request için mümkünse:

requestId

oluşturulmalıdır.

Örnek:

HTTP Request
 ↓
requestId
 ↓
Application Log
 ↓
Audit Log
 ↓
Background Job

Bu sayede production debugging kolaylaşır.

40. Audit Logging

Aşağıdaki işlemler audit edilmelidir:

Login
Logout
Role Change
Permission Change
Tenant Change
Employee Scope Change
Payment
Refund
Stock Adjustment
Payroll Approval
Sensitive Data Access
41. Audit Integrity

Audit log'ları normal business table'ları gibi kolayca değiştirilebilir olmamalıdır.

En azından:

createdAt
actorId
tenantId
action
resourceType
resourceId
metadata
requestId

gibi bilgiler tutulmalıdır.

42. Payment Security

Kart bilgileri mümkün olduğunca Beauty ERP backend'inde tutulmamalıdır.

Payment provider'ın tokenization/hosted checkout mekanizmaları tercih edilmelidir.

PCI kapsamını gereksiz şekilde büyütmekten kaçınılmalıdır.

43. Payment Webhook Security

Webhook:

Provider
 ↓
HTTPS Endpoint
 ↓
Signature Verification
 ↓
Timestamp / Replay Protection
 ↓
Idempotency
 ↓
Process

şeklinde doğrulanmalıdır.

Signature doğrulanmadan payment state değiştirilmemelidir.

44. Webhook Replay

Aynı webhook tekrar gönderilebilir.

Bu nedenle:

providerEventId

gibi unique bir identifier tutulabilir.

Örnek:

providerEventId = evt_123

ikinci kez geldiğinde işlem tekrar uygulanmamalıdır.

45. Webhook Timestamp

Provider destekliyorsa webhook timestamp kontrolü yapılmalıdır.

Aşırı eski event:

Expired

olarak reddedilebilir veya manuel reconciliation sürecine gönderilebilir.

46. External Integrations

Harici integration'lar:

Google
WhatsApp
SMS Provider
Email Provider
Payment Provider
Accounting Provider

gibi sistemlerle iletişim kurabilir.

Her integration:

Credential
Timeout
Retry
Rate Limit
Circuit Breaker
Logging

politikalarına sahip olmalıdır.

47. External API Timeouts

External service çağrıları sonsuza kadar beklememelidir.

Örneğin:

HTTP Request
 ↓
Timeout
 ↓
Retry / Fail

kullanılabilir.

48. Retry Safety

Retry yapılacak işlemler idempotent olmalıdır.

Özellikle:

Payment
Refund
Email
SMS
Stock
Accounting

işlemlerinde duplicate effect oluşmamalıdır.

49. Queue Security

Background job payload'larında:

Password
Access Token
Secret
Full Payment Data

gibi hassas veriler taşınmamalıdır.

Mümkün olduğunca:

entityId
tenantId
actorId

gibi referanslar kullanılmalıdır.

50. Worker Authorization

Worker job çalıştırırken:

tenantId
actorId

gibi context bilgileri kullanılabilir.

Worker:

"Bu job gerçekten bu tenant'a ait mi?"

kontrolünü yapmalıdır.

51. Data Minimization

Sistem yalnızca gerekli kişisel veriyi saklamalıdır.

Örneğin:

PII
Financial Data
Employee Data
Customer Data

için hangi verinin gerçekten gerekli olduğu domain bazında belirlenmelidir.

52. Personal Data

Customer ve employee verileri hassas kabul edilmelidir.

Örneğin:

Phone
Email
Address
Identity Information
Health-related Service Notes
Financial Data

gibi alanlar erişim kontrollü olmalıdır.

53. Data Retention

Her data kategorisi için retention policy ileride belirlenmelidir.

Örneğin:

Audit Logs
Customer Records
Financial Records
Notifications
Temporary Files
Sessions

aynı retention süresine sahip olmak zorunda değildir.

54. Deletion

Business kayıtları doğrudan fiziksel olarak silinmeden önce:

Legal Requirement
Accounting Requirement
Audit Requirement
Relationship Integrity

değerlendirilmelidir.

Bazı entity'lerde:

Soft Delete

veya anonymization tercih edilebilir.

55. Anonymization

Müşteri hesabı silinmesi gerektiğinde financial/audit kayıtlarının bütünlüğü korunurken kişisel bilgiler anonymize edilebilir.

Örneğin:

Customer
 ↓
Anonymized Customer
 ↓
Historical Sale preserved
56. Authorization + Sensitive Fields

Resource erişimi başarılı olsa bile:

salary
bankAccount
identityNumber
paymentDetails

gibi alanlar ayrıca korunmalıdır.

Least privilege uygulanmalıdır.

57. Production Debugging

Production debugging sırasında:

Logs
Metrics
Traces
Request ID
Audit

kullanılmalıdır.

Production database üzerinde doğrudan manuel değişiklik minimum seviyede tutulmalıdır.

58. Migration Security

Database migration:

Development
 ↓
Review
 ↓
Staging
 ↓
Backup
 ↓
Production

sürecinden geçmelidir.

Destructive migration'lar özellikle review gerektirir.

59. Dependency Security

Dependencies düzenli olarak kontrol edilmelidir.

Özellikle:

Critical Vulnerability
High Vulnerability
Supply Chain Risk
Deprecated Package

durumları değerlendirilmelidir.

Dependency güncellemesi körlemesine production'a uygulanmamalıdır.

60. Supply Chain

Package install sırasında:

Lockfile
Integrity
Trusted Registry
Build Scripts

kontrol edilmelidir.

Unknown veya şüpheli package'lar kullanılmamalıdır.

61. CI Security

CI/CD pipeline:

Secrets
Build
Test
Lint
Migration
Deploy

aşamalarında secret'ları loglamamalıdır.

Pull request üzerinden untrusted code çalıştırılıyorsa secret erişimi sınırlandırılmalıdır.

62. Git Security

Repository'de:

.env
Private Keys
Certificates
Passwords
API Tokens
Production Dumps

bulunmamalıdır.

.gitignore güvenlik kontrolünün bir parçasıdır ancak tek başına yeterli değildir.

63. Secret Leak Response

Secret leak tespit edilirse:

1. Secret'ı revoke et
2. Yeni secret oluştur
3. Production configuration güncelle
4. Etkilenen servisleri restart/deploy et
5. Audit/log incele
6. Gerekirse incident oluştur
64. Security Incident

Incident lifecycle:

Detect
 ↓
Contain
 ↓
Investigate
 ↓
Remediate
 ↓
Recover
 ↓
Review

olmalıdır.

65. Security Monitoring

Production'da aşağıdaki sinyaller izlenebilir:

Failed Logins
Rate Limit Violations
Unauthorized Requests
Cross-Tenant Attempts
Webhook Failures
Payment Failures
Unusual Admin Actions
Secret Errors
Database Errors
66. Admin Security

Admin hesapları yüksek risklidir.

İleride:

MFA
Strong Session Policy
Shorter Session Lifetime
Audit
IP / Device Controls

gibi kontroller değerlendirilebilir.

67. MFA

MFA özellikle:

Platform Admin
Tenant Owner
Finance Admin
Payroll Admin

gibi yüksek privilege roller için önerilir.

68. Privileged Actions

Yüksek riskli işlemler için step-up authentication gerekebilir.

Örneğin:

Refund
Payroll Approval
Role Change
Bank Account Change
Tenant Deletion

işlemlerinde tekrar authentication veya MFA istenebilir.

69. Security Testing

Security test kapsamı:

Authentication
Authorization
Tenant Isolation
IDOR
Rate Limit
Input Validation
Webhook Signature
Replay Protection
File Upload
Secret Exposure
Sensitive Logging

olmalıdır.

70. Cross-Tenant Security Test

Minimum test:

Tenant A User
       ↓
Tenant B Customer
       ↓
403 / 404

ve:

Tenant A User
       ↓
Tenant B Appointment
       ↓
403 / 404

gibi testler bulunmalıdır.

71. Security Checklist for New Features

Her yeni feature:

[ ] Authentication
[ ] Authorization
[ ] Tenant isolation
[ ] Scope validation
[ ] Input validation
[ ] Rate limit
[ ] Audit
[ ] Sensitive data review
[ ] Error handling
[ ] Logging review
[ ] Idempotency
[ ] External integration security

kontrolünden geçmelidir.

72. Current Security State

Şu anda backend foundation:

NestJS
PostgreSQL
Prisma
Redis
Config Validation
Health Check

durumundadır.

Authentication ve authorization architecture tanımlanmıştır.

Tam security implementation henüz tamamlanmış değildir.

73. Security Implementation Order

İlk aşama:

Environment Validation
 ↓
Authentication
 ↓
Session
 ↓
Tenant Membership
 ↓
RBAC
 ↓
Scope Authorization
 ↓
Rate Limiting
 ↓
Audit

Ardından:

Webhooks
Payments
File Security
MFA
Advanced Monitoring

eklenecektir.

74. Security Principle

Beauty ERP'nin güvenlik prensibi:

Kullanıcı yalnızca kimliğinin doğrulandığı, yetkisinin bulunduğu ve organizational scope içinde kaldığı verilere erişebilir.