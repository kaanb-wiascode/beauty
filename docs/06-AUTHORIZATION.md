# Beauty ERP — Authentication & Authorization

> Bu doküman Beauty ERP'de kimlik doğrulama, yetkilendirme, tenant izolasyonu ve organizasyonel erişim kapsamını tanımlar.
>
> Authentication kullanıcının kim olduğunu belirler.
>
> Authorization kullanıcının ne yapabileceğini ve hangi verilere erişebileceğini belirler.

---

# 1. Core Principle

Sistem iki ayrı problemi ele alır:

```text
Authentication
    ↓
"Bu kullanıcı kim?"

Authorization
    ↓
"Bu kullanıcı ne yapabilir?"
"Bu kullanıcı hangi veriye erişebilir?"

Authentication başarılı olması tek başına resource erişimi anlamına gelmez.

2. Identity Model

Ana identity:

User

User aşağıdaki domain entity'lerinden biriyle ilişkilendirilebilir:

User
├── Employee
└── Customer

Employee ve User aynı kavram değildir.

Örneğin bir çalışan:

Employee

olarak sisteme kaydedilebilir fakat henüz:

User

hesabına sahip olmayabilir.

3. Authentication Flow

Temel authentication akışı:

Client
  ↓
Login
  ↓
Identity Verification
  ↓
Authentication
  ↓
Access Token / Session
  ↓
Authenticated Request

Backend her protected request'te identity'yi doğrulamalıdır.

4. Authentication Methods

İlk aşamada desteklenebilecek yöntemler:

Email + Password
Phone + OTP
Refresh Token

Gelecekte:

Google
Apple
Microsoft
SSO

gibi provider'lar eklenebilir.

Authentication provider implementation detayları domain logic'e sızdırılmamalıdır.

5. Password Security

Password:

Plain text olarak saklanmamalıdır.
Geri döndürülebilir encryption kullanılmamalıdır.
Güçlü password hashing algoritması kullanılmalıdır.
Login denemeleri rate limit edilmelidir.

Database yalnızca gerekli password hash metadata'sını saklamalıdır.

6. Access Token

Protected API request:

Authorization: Bearer <access-token>

şeklinde olabilir.

Access token mümkün olduğunca kısa ömürlü tutulmalıdır.

Token içinde:

userId

gibi identity bilgileri bulunabilir.

Ancak kritik authorization kararları yalnızca token claim'lerine güvenerek verilmemelidir.

7. Refresh Token

Uzun süreli session için refresh token kullanılabilir.

Temel akış:

Access Token
     ↓
Expired
     ↓
Refresh Token
     ↓
New Access Token

Refresh token rotation ve revoke mekanizmaları desteklenmelidir.

8. Session Management

User session'ları izlenebilir olmalıdır.

Örnek:

Session
├── userId
├── createdAt
├── expiresAt
├── revokedAt
├── ip
└── userAgent

Kullanıcı tüm session'larını veya belirli session'ları sonlandırabilmelidir.

9. Tenant Context

Her authenticated request mümkün olduğunca bir:

tenantId

ile ilişkilendirilmelidir.

Örnek:

User
 ↓
Membership
 ↓
Tenant

Bir kullanıcı birden fazla tenant'a erişebilir.

Örneğin:

User A
├── Tenant A
└── Tenant B
10. Tenant Selection

Birden fazla tenant erişimi olan kullanıcı için aktif tenant context belirlenmelidir.

Örnek:

POST /auth/select-tenant

veya token/session context üzerinden tenant seçilebilir.

Client'ın gönderdiği tenant ID backend tarafından authorization ile doğrulanmalıdır.

11. Tenant Isolation

En önemli güvenlik prensiplerinden biri:

Bir tenant'ın kullanıcısı başka bir tenant'ın business verisini okuyamaz veya değiştiremez.

Örneğin:

Tenant A
Customer A1

Tenant B
Customer B1

Tenant A kullanıcısı:

Customer B1

kaynağına erişememelidir.

12. Tenant Isolation Layers

Tenant isolation mümkün olduğunca birden fazla katmanda korunmalıdır:

HTTP
 ↓
Authentication
 ↓
Authorization
 ↓
Application
 ↓
Repository
 ↓
Database

Tek bir controller check'ine güvenilmemelidir.

13. Membership

User ile Tenant arasındaki ilişki için membership modeli kullanılabilir.

User
 ↓
TenantMembership
 ↓
Tenant

Membership:

userId
tenantId
status
createdAt

gibi alanlara sahip olabilir.

14. Membership Status

Örnek status'ler:

INVITED
ACTIVE
SUSPENDED
REVOKED

Sadece ACTIVE membership authorization için kullanılabilir.

15. Role-Based Access Control

Ana authorization modeli:

User
 ↓
Role
 ↓
Permission

olacaktır.

Örneğin:

Role: Branch Manager

Permissions:
- customer.read
- customer.write
- appointment.read
- appointment.write
- sales.read
- sales.create
16. Permission Naming

Permission isimleri:

<resource>.<action>

formatında olabilir.

Örnek:

customer.read
customer.create
customer.update
appointment.read
appointment.create
appointment.cancel
payment.read
payment.create
payment.refund
inventory.read
inventory.adjust
17. Business Actions

Bazı işlemler CRUD permission'dan daha spesifiktir.

Örneğin:

payment.refund
appointment.cancel
appointment.complete
package.consume
inventory.adjust
inventory.transfer
payroll.approve
quality.resolve

Bu nedenle permission sistemi yalnızca:

read
write
delete

ile sınırlanmamalıdır.

18. Role

Role bir permission grubudur.

Örnek:

Owner
Admin
Regional Manager
Branch Manager
Receptionist
Employee
Accountant
HR Manager
Quality Manager
Marketing Manager

Role'ler tenant-specific olabilir.

19. System Roles

Bazı sistem seviyesinde roller bulunabilir.

Örneğin:

PlatformAdmin

Bu rol tenant seviyesinden farklıdır.

Platform yönetimi ile tenant operasyonları birbirinden ayrılmalıdır.

20. Role Assignment

Role assignment:

User
 ↓
UserRole
 ↓
Role

şeklinde olabilir.

Gerektiğinde role assignment scope içerebilir.

Örneğin:

User
 ↓
RoleAssignment
 ├── Role = BranchManager
 └── Branch = Kadıköy
21. Organizational Scope

Role tek başına yeterli değildir.

Örneğin:

BranchManager

rolüne sahip bir kullanıcı yalnızca:

Branch A

üzerinde yetkili olabilir.

Bu nedenle:

Permission
+
Scope

birlikte değerlendirilmelidir.

22. Scope Hierarchy

Organizasyonel scope:

Tenant
   ↓
LegalEntity
   ↓
Region
   ↓
Branch
   ↓
Department

şeklinde düşünülebilir.

Kullanıcının erişimi bu hiyerarşinin herhangi bir seviyesinde tanımlanabilir.

23. Scope Examples

Örnek 1:

Role: TenantAdmin
Scope: Tenant

Tenant'ın tüm operasyonlarına erişebilir.

Örnek 2:

Role: RegionalManager
Scope: Region A

Region A altındaki branch'lere erişebilir.

Örnek 3:

Role: BranchManager
Scope: Branch B

yalnızca Branch B verilerine erişebilir.

24. Scope Inheritance

Üst scope alt scope'ları kapsayabilir.

Örneğin:

Region A
├── Branch 1
├── Branch 2
└── Branch 3

Region A erişimi olan kullanıcı:

Branch 1
Branch 2
Branch 3

üzerinde erişim sahibi olabilir.

Ancak inheritance explicit authorization kuralı olarak tanımlanmalıdır.

25. Cross-Branch Employee

Bir çalışan:

Employee A
├── Branch 1
└── Branch 2

şeklinde birden fazla branch'te çalışabilir.

Ancak bu:

Employee

ilişkisinin otomatik olarak:

User Access

anlamına geldiği anlamına gelmez.

Employee assignment ile authorization scope birbirinden ayrılmalıdır.

26. Customer Access

Customer user hesabı:

Customer User

yalnızca kendi müşteri verisine erişebilmelidir.

Örneğin:

/customer/me

kendi:

appointment
package
payment
feedback

verilerine erişebilir.

Başka müşterinin ID'sini URL'ye yazması erişim sağlamamalıdır.

27. Self-Service Authorization

Customer için:

customer.self.read
customer.self.update
appointment.self.read
appointment.self.create
payment.self.read
feedback.self.create

gibi self-service permission konsepti kullanılabilir.

28. Employee Self Access

Employee kullanıcı kendi:

Profile
Schedule
Appointments
Performance
Leave
Payroll

gibi verilerine erişebilir.

Ancak self-access ile management access birbirinden ayrılmalıdır.

29. Branch Access

Bir endpoint branch-specific resource döndürüyorsa:

User
 ↓
Authorization
 ↓
Branch Scope
 ↓
Resource.branchId

kontrol edilmelidir.

Sadece resource ID'nin var olması erişim için yeterli değildir.

30. Region Access

Region scope:

User
 ↓
Region Scope
 ↓
Region
 ↓
Branches

şeklinde alt branch'lere uygulanabilir.

Örneğin Regional Manager:

GET /appointments

çağırdığında yalnızca kendi region'ındaki appointment'ları görebilmelidir.

31. Legal Entity Access

Finance kullanıcıları için legal entity scope gerekebilir.

Örneğin:

Accountant
Scope:
LegalEntity A

Bu kullanıcı:

LegalEntity B

finansal kayıtlarını görememelidir.

32. Department Access

Bazı kullanıcılar department scope'una sahip olabilir.

Örneğin:

HR Manager
Scope:
HR Department

Employee verilerinin tamamına erişmek yerine yetkili HR işlemlerine erişebilir.

33. Field-Level Authorization

Bazı veriler resource seviyesinde erişilebilir olsa bile bazı field'lar gizlenebilir.

Örneğin Employee:

Employee
├── name
├── branch
├── salary
└── bankAccount

Branch Manager:

name
branch

görebilirken:

salary
bankAccount

göremeyebilir.

Field-level authorization gerektiğinde explicit policy ile uygulanmalıdır.

34. Sensitive Financial Data

Aşağıdaki bilgiler yüksek hassasiyetli kabul edilmelidir:

Bank account
Salary
Payroll
Tax information
Payment provider metadata
Financial account data

Bunlara erişim minimum privilege prensibiyle sınırlandırılmalıdır.

35. Permission Evaluation

Authorization genel olarak:

Authenticate
    ↓
Resolve Tenant
    ↓
Load Membership
    ↓
Resolve Roles
    ↓
Resolve Permissions
    ↓
Resolve Scope
    ↓
Check Resource
    ↓
Allow / Deny

şeklinde çalışabilir.

36. Deny by Default

Authorization prensibi:

Açıkça izin verilmemiş işlem reddedilir.

Yani:

No Permission
    ↓
DENY

olmalıdır.

37. Explicit Resource Checks

Örneğin:

GET /customers/:id

için:

1. User authenticated?
2. User has customer.read?
3. Customer belongs to accessible tenant?
4. Customer belongs to accessible branch/scope?

kontrolleri yapılmalıdır.

38. Authorization Failure

Authentication yoksa:

401 Unauthorized

Authorization yoksa:

403 Forbidden

kullanılmalıdır.

Resource gerçekten mevcut değilse veya erişim modelinin gerektirdiği şekilde gizlenmesi gerekiyorsa:

404 Not Found

tercih edilebilir.

Bu davranış endpoint bazında standartlaştırılmalıdır.

39. Anti-Enumeration

Kullanıcıların başka tenant veya müşteri kayıtlarının varlığını tahmin etmesi engellenmelidir.

Örneğin:

GET /customers/:id

isteğinde erişilemeyen bir resource için gereksiz ayrıntı dönülmemelidir.

40. Authorization Guard

NestJS içerisinde authorization guard/interceptor/policy yaklaşımı kullanılabilir.

Ancak:

Guard

tek başına domain authorization'ın tamamı değildir.

Resource-level policy kontrolleri application/domain seviyesinde de yapılabilir.

41. Policy-Based Authorization

Complex business rules için policy kullanılabilir.

Örneğin:

CanRefundPayment
CanCancelAppointment
CanViewEmployeeSalary
CanAdjustStock
CanApprovePayroll

gibi policy'ler oluşturulabilir.

42. Example — Payment Refund

Refund isteği:

POST /payments/:id/refund

Backend:

Authenticated?
       ↓
payment.refund permission?
       ↓
Payment tenant accessible?
       ↓
Payment refundable?
       ↓
Refund amount valid?
       ↓
Policy allows?
       ↓
Transaction

kontrollerini yapmalıdır.

43. Example — Appointment Cancellation
POST /appointments/:id/cancel

Kontroller:

Authentication
 ↓
appointment.cancel
 ↓
Tenant scope
 ↓
Branch scope
 ↓
Appointment state
 ↓
Cancellation policy
 ↓
Cancel
44. Example — Package Consumption
POST /package-sessions/:id/consume

Kontroller:

package.consume
 ↓
Tenant access
 ↓
Customer access
 ↓
Appointment relation
 ↓
Session available
 ↓
Concurrency check
 ↓
Consume
45. Service-to-Service Authorization

Gelecekte microservice ayrıştırması yapılırsa service-to-service authentication ayrıca uygulanmalıdır.

Örneğin:

API
 ↓
Worker

veya:

API
 ↓
Notification Service

arasındaki çağrılar kullanıcı token'ından bağımsız service identity taşımalıdır.

46. Background Jobs

Background worker işlemlerinde user context gerekiyorsa job payload'ına güvenli şekilde:

tenantId
actorId
requestId

gibi audit context eklenebilir.

Worker bu bilgileri yeniden doğrulamalıdır.

47. Audit

Authorization-sensitive işlemler audit edilebilir.

Örneğin:

Role changed
Permission granted
Permission revoked
Employee scope changed
Payment refunded
Payroll approved
Stock adjusted

gibi işlemler:

AuditLog

oluşturmalıdır.

48. Permission Changes

Permission veya role değişiklikleri mümkün olduğunca anında etkili olmalıdır.

Cache kullanılıyorsa:

Role Change
   ↓
Authorization Cache Invalidation

uygulanmalıdır.

Eski authorization state uzun süre kullanılmamalıdır.

49. Cache

Authorization cache kullanılabilir.

Ancak:

Redis

source of truth değildir.

Authorization state database/configuration üzerinden yeniden üretilebilmelidir.

50. Tenant Switching

Bir user birden fazla tenant'a sahipse:

Tenant A
Tenant B

arasında geçiş yapılabilir.

Tenant switch sırasında:

User membership
Role
Permission
Scope

yeniden değerlendirilmelidir.

Bir tenant'taki role diğer tenant'a taşınmamalıdır.

51. Role Assignment Scope

Örnek:

User A
Role:
RegionalManager

Scope:
Region Istanbul

ve:

User A
Role:
BranchManager

Scope:
Branch Kadikoy

aynı anda bulunabilir.

Effective permissions bu assignment'ların birleşiminden hesaplanabilir.

52. Conflict Rules

Bir kullanıcıda hem allow hem deny benzeri kurallar olacaksa davranış açıkça tanımlanmalıdır.

İlk MVP'de mümkün olduğunca:

Allow permissions
+
Explicit scope

modeli tercih edilebilir.

Complex deny rules ihtiyaç ortaya çıktığında ayrıca tasarlanmalıdır.

53. Super Admin

Platform Super Admin:

Platform
    ↓
Tenant management

işlemlerine sahip olabilir.

Ancak platform admin erişimi tenant employee rollerinden tamamen ayrı tutulmalıdır.

Platform admin'in tenant business data erişimi ayrıca audit edilmelidir.

54. Break-Glass Access

İleride kritik destek senaryoları için:

Break-glass access

mekanizması değerlendirilebilir.

Bu erişim:

explicit approval
limited duration
reason
audit

gerektirmelidir.

55. Security Principle

Temel güvenlik prensibi:

Kullanıcı kimliği ile kullanıcının erişim kapsamı birbirinden ayrı kavramlardır.

Örneğin:

User = Ali
Role = Branch Manager
Scope = Kadıköy Branch

şeklinde üç farklı bilgi değerlendirilir.

56. Authorization Testing

Authorization testleri özellikle:

Same tenant
Different tenant
Same branch
Different branch
Region scope
Legal entity scope
Customer self access
Employee self access
Admin access
Revoked membership

senaryolarını kapsamalıdır.

57. Cross-Tenant Test

En kritik testlerden biri:

Tenant A User
       ↓
Tenant B Resource
       ↓
DENIED

olmalıdır.

Bu test tüm önemli resource türlerinde uygulanmalıdır.

58. Cross-Branch Test

Örneğin:

Branch Manager A
       ↓
Branch B Customer
       ↓
DENIED

olmalıdır.

Regional Manager için ise aynı resource:

Region A
 ├── Branch A
 └── Branch B

Regional Manager
       ↓
Branch A
       ↓
ALLOW

olabilir.

59. Authorization Contract

Her protected endpoint için aşağıdakiler dokümante edilmelidir:

Authentication
Required permission
Tenant scope
Organizational scope
Resource policy
Sensitive fields
Audit requirement
60. Current State

Şu anda:

Authentication
Authorization

sisteminin tam implementation'ı henüz tamamlanmış değildir.

Mevcut backend foundation:

NestJS
ConfigModule
DatabaseModule
RedisModule
HealthModule

durumundadır.

Authorization bu foundation üzerine inşa edilecektir.

61. Implementation Order

Authorization implementation sırası:

User
   ↓
Membership
   ↓
Role
   ↓
Permission
   ↓
Role Assignment
   ↓
Scope
   ↓
Authentication
   ↓
Authorization Guard
   ↓
Resource Policies
   ↓
Audit
62. First Authorization Milestone

İlk milestone:

User
TenantMembership
Role
Permission
RoleAssignment

modellerini oluşturmak.

Ardından:

Branch Scope
Region Scope

eklenecektir.

63. Authorization Principle

Beauty ERP authorization prensibi:

Kullanıcı yalnızca sahip olduğu permission'ın izin verdiği işlemi ve sahip olduğu organizational scope içindeki resource'ları erişebilir.