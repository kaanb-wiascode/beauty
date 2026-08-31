# Beauty ERP — Authorization Model

> Bu doküman Beauty ERP'de kullanıcı, tenant, rol, permission, branch scope ve resource authorization modelini tanımlar.

---

# 1. Core Principle

Authorization'ın temel prensibi:

> Kullanıcının authenticated olması, herhangi bir tenant veya resource'a erişebileceği anlamına gelmez.

Authorization şu zincir üzerinden değerlendirilir:

```text
User
 ↓
Tenant Membership
 ↓
Role
 ↓
Permission
 ↓
Scope
 ↓
Resource
2. Authentication vs Authorization

Authentication:

Who is the user?

Authorization:

What can the user do?

Tenant isolation:

Which tenant's data can the user access?

Resource scope:

Which branch/resource subset can the user access?

Bu dört kavram birbirinden ayrılmalıdır.

3. User

User sistemde authenticated identity'yi temsil eder.

Örnek:

User
 ├── id
 ├── email
 ├── status
 └── memberships

User doğrudan business tenant data ownership anlamına gelmez.

4. Tenant

Tenant:

Business Organization

veya ERP'nin izole business boundary'sidir.

Örneğin:

Tenant A
 ├── Branch 1
 ├── Branch 2
 └── Branch 3

Tenant B
 ├── Branch 4
 └── Branch 5

Tenant A kullanıcısı Tenant B verisine erişemez.

5. Tenant Membership

User ile Tenant arasındaki ilişki:

User
 ↓
Membership
 ↓
Tenant

şeklinde modellenmelidir.

Membership kullanıcının tenant içindeki yetkisini ve scope'unu belirleyebilir.

6. Membership

Örnek kavramsal model:

Membership
 ├── id
 ├── userId
 ├── tenantId
 ├── roleId
 ├── status
 └── scope

Bir user birden fazla tenant'a üye olabilir.

7. Multi-Tenant User

Örneğin:

User Kaan
 ├── Tenant A → ADMIN
 └── Tenant B → STAFF

aynı user identity'sinin farklı tenant'larda farklı authorization context'lere sahip olabileceğini gösterir.

8. Active Tenant

Authenticated user bir request sırasında bir tenant context ile çalışır.

Örnek:

User
 ↓
Active Tenant = Tenant A

API request'lerinin business operations'ı bu tenant context'e göre yürütülür.

9. Tenant Context

Tenant context güvenilir authentication/membership kaynağından oluşturulmalıdır.

Client'ın:

tenantId

göndermesi authorization proof değildir.

10. Tenant Isolation

Her tenant-owned resource için:

resource.tenantId
==
currentTenant.id

kontrolü yapılmalıdır.

Bu kontrol:

Controller
Application Service
Repository
Database

katmanlarında uygun abstraction'larla güvence altına alınabilir.

11. Tenant Isolation Is Mandatory

Tenant-owned endpoint:

GET /customers/:id

için yalnızca:

customer.id = requestedId

kontrolü yeterli değildir.

Aynı zamanda:

customer.tenantId = currentTenantId

kontrol edilmelidir.

12. Roles

Role bir authorization grouping mekanizmasıdır.

Başlangıçta değerlendirilebilecek roller:

OWNER
ADMIN
MANAGER
STAFF
ACCOUNTANT
RECEPTION

Final role listesi domain ihtiyaçları netleştikçe değişebilir.

13. Owner

OWNER tenant'ın en yüksek business-level yetki rolü olabilir.

Örnek yetkiler:

Tenant configuration
User management
Role management
Branch management
Financial visibility
Reports
Business configuration

Ancak system-level platform administration ayrı bir kavramdır.

14. Admin

ADMIN operasyonel tenant yönetimi yapabilir.

Örneğin:

Users
Branches
Customers
Services
Appointments
Reports

üzerinde geniş yetkiye sahip olabilir.

Financial destructive operations ayrıca sınırlandırılabilir.

15. Manager

MANAGER operasyonel yönetim yetkilerine sahip olabilir.

Örneğin:

Appointments
Customers
Employees
Services
Inventory
Reports

Ancak tenant-level security veya platform configuration yetkileri olmayabilir.

16. Staff

STAFF günlük operasyonları yürütür.

Örneğin:

Customer lookup
Appointment operations
Service operations
Basic customer updates

Ancak:

User management
Financial configuration
Role management
Tenant configuration

gibi alanlara erişimi olmayabilir.

17. Accountant

ACCOUNTANT finansal işlemlere ve raporlara erişebilir.

Örneğin:

Sales
Payments
Refunds
Accounting
Financial Reports

Ancak:

User permissions
Security settings
Operational configuration

yetkileri olmayabilir.

18. Reception

RECEPTION front-desk operasyonlarına odaklanabilir.

Örneğin:

Customer
Appointment
Check-in
Payment collection

gibi işlemler yapılabilir.

Financial reporting ve authorization management sınırlı olabilir.

19. Role Is Not Enough

Role tek başına resource authorization değildir.

Örneğin:

MANAGER

olan kullanıcı:

Branch A

için yetkili olabilirken:

Branch B

için yetkili olmayabilir.

20. Permission

Permission belirli bir action'ı ifade eder.

Örnek:

customers.read
customers.write

appointments.read
appointments.write

payments.read
payments.write

inventory.read
inventory.write

reports.read
21. Permission Naming

Önerilen format:

resource.action

Örneğin:

customers.read
customers.write
customers.delete

appointments.read
appointments.write
appointments.cancel
appointments.checkin

payments.read
payments.create
payments.refund
22. Read vs Write

Basit resource'larda:

resource.read
resource.write

yeterli olabilir.

Ancak critical business actions için daha spesifik permission tercih edilebilir.

Örneğin:

payments.refund
appointments.cancel
appointments.complete
23. Sensitive Permissions

Aşağıdaki permission'lar ayrıca korunmalıdır:

users.manage
roles.manage
permissions.manage
payments.refund
accounting.adjust
inventory.adjust
tenant.manage
24. Role → Permission

Role permission set'i oluşturabilir.

Örneğin:

RECEPTION
 ├── customers.read
 ├── customers.write
 ├── appointments.read
 ├── appointments.write
 └── payments.create

Role assignment database'de veya authorization configuration'da tutulabilir.

25. Permission Check

Request:

POST /payments

geldiğinde:

Authenticated?
 ↓
Tenant member?
 ↓
Has payments.create?
 ↓
Has resource scope?
 ↓
Execute

kontrolü yapılabilir.

26. Scope

Scope permission'ın hangi resource seti üzerinde geçerli olduğunu belirtir.

Örneğin:

ALL_BRANCHES
BRANCH_ONLY
OWN_RECORDS

gibi scope modelleri değerlendirilebilir.

27. Branch

Branch tenant içindeki operational location'dır.

Örneğin:

Tenant A
 ├── Istanbul
 ├── Ankara
 └── Izmir

Branch tenant boundary'sinin altındadır.

28. Branch Scope

Bir user yalnızca belirli branch'lerde çalışabilir.

Örneğin:

User
 └── Tenant A
      └── Branches:
          ├── Istanbul
          └── Ankara

Bu user Izmir branch resource'larına erişemez.

29. All Branches

Scope:

ALL_BRANCHES

kullanıcının tenant içindeki tüm branch'lerde ilgili permission'a sahip olduğu anlamına gelebilir.

Bu scope yalnızca uygun role/permission ile verilmelidir.

30. Specific Branches

Scope:

BRANCH_ONLY

ise membership:

Branch A
Branch C

gibi explicit branch listesi taşıyabilir.

31. Own Records

Bazı operasyonlar:

OWN_RECORDS

scope'una sahip olabilir.

Örneğin employee yalnızca:

own appointments
own schedule

verilerini değiştirebilir.

32. Scope Hierarchy

Authorization context:

Tenant
 ↓
Branch
 ↓
Resource

şeklinde daralabilir.

Örneğin:

Tenant A
 └── Branch Istanbul
      └── Appointment 123
33. Resource Scope

Resource branch-owned ise:

resource.branchId

ile user's allowed branch scope karşılaştırılabilir.

Örneğin:

user.allowedBranchIds
    contains
resource.branchId
34. Tenant-Owned Resource Without Branch

Bazı entity'ler branch-specific olmayabilir.

Örneğin:

Tenant Settings
Tenant Users
Tenant-wide Configuration

Bu resource'larda branch scope uygulanmayabilir.

Tenant scope yeterlidir.

35. Branch-Owned Resource

Örneğin:

Appointment
Employee Schedule
Inventory Location

branch relationship'ına sahip olabilir.

Bu durumda:

tenantId
+
branchId

authorization açısından önemlidir.

36. Resource Ownership

Bazı resource'lar doğrudan user ownership taşıyabilir.

Örneğin:

User Notification
User Preference
Personal Dashboard

Bu durumda:

resource.userId === currentUser.id

kontrolü uygulanabilir.

37. Authorization Decision

Authorization decision kavramsal olarak:

ALLOW
DENY

şeklindedir.

Daha ayrıntılı policy engine gerektiğinde:

ALLOW
DENY
REQUIRE_SCOPE

gibi internal kararlar olabilir.

38. Authorization Order

Önerilen kontrol sırası:

1. Authentication
2. Active Tenant
3. Tenant Membership
4. Permission
5. Branch Scope
6. Resource Ownership
7. Business Rule
39. Authentication Failure

User authenticated değilse:

401 Unauthorized

döndürülür.

40. Permission Failure

User authenticated ancak permission yoksa:

403 Forbidden

döndürülebilir.

41. Resource Isolation Failure

Resource başka tenant'a aitse information leakage önlemek için:

404 Not Found

tercih edilebilir.

Bu durumda user'a resource'un başka tenant'a ait olduğu açıklanmamalıdır.

42. Authorization Does Not Replace Validation

Örneğin:

POST /appointments

için user permission sahibi olsa bile:

employeeId
branchId
customerId
scheduledAt

validasyonundan geçmelidir.

Authorization ve validation farklı aşamalardır.

43. Authorization Does Not Replace Business Rules

User:

appointments.cancel

permission'ına sahip olabilir.

Ancak appointment:

COMPLETED

ise cancel operation business rule nedeniyle reddedilebilir.

Bu:

Authorization

değil:

Business Rule

hatasıdır.

44. State + Permission

Bir operation için:

Permission
+
Valid State

ikisi de gereklidir.

Örneğin:

appointments.complete

permission sahibi olmak appointment'ın zaten completed olmasını geçerli kılmaz.

45. Role Inheritance

Role inheritance ilk aşamada zorunlu değildir.

Örneğin:

ADMIN > MANAGER > STAFF

gibi implicit hierarchy yerine explicit permission setleri tercih edilebilir.

Bu daha predictable authorization sağlar.

46. Custom Roles

İleride tenant-specific custom role desteği eklenebilir.

Örneğin:

Tenant A
 └── "Front Desk Lead"
      ├── appointments.read
      ├── appointments.write
      └── payments.create

Custom roles global system role'lerden ayrı modellenebilir.

47. System Roles

Platform-level role'lar tenant role'larından ayrılmalıdır.

Örneğin:

PLATFORM_ADMIN

Beauty ERP müşterisinin:

OWNER

rolüyle aynı authorization domain'inde düşünülmemelidir.

48. Platform Admin

Platform admin yalnızca gerektiğinde:

Tenant provisioning
System diagnostics
Platform support
System configuration

gibi platform-level operations yapabilir.

Platform admin'in tenant business data'sına erişimi ayrıca audit edilmelidir.

49. Support Access

Support staff tenant verisine erişebiliyorsa bu erişim:

Explicit
Time-limited
Audited
Least-privilege

olmalıdır.

50. Least Privilege

Default authorization principle:

Kullanıcı yalnızca ihtiyacı olan minimum yetkiye sahip olmalıdır.

Örneğin receptionist'e:

accounting.adjust
roles.manage
tenant.manage

verilmemelidir.

51. Deny by Default

Authorization:

No explicit permission
        ↓
DENY

mantığıyla çalışmalıdır.

Yeni endpoint eklemek mevcut tüm role'lere otomatik yetki vermemelidir.

52. New Permission

Yeni sensitive operation eklenirse:

New Endpoint
 ↓
New Permission
 ↓
Explicit Role Assignment

yapılmalıdır.

53. Permission Checks

Permission check mümkün olduğunca merkezi abstraction üzerinden yapılmalıdır.

Örneğin kavramsal:

AuthorizationService.can(
  user,
  permission,
  resource
)

gibi bir yapı kullanılabilir.

54. Guard

NestJS Guard authorization için kullanılabilir.

Örneğin:

AuthenticationGuard
AuthorizationGuard

gibi ayrıştırılmış guard'lar kullanılabilir.

55. Guard vs Service

Guard:

Authentication
Basic Permission

gibi request boundary kontrollerini yapabilir.

Application Service:

Resource-specific authorization
Business rules

gerektiren kontrolleri yapabilir.

56. Resource Authorization

Örneğin:

PATCH /appointments/:id

için:

Permission
+
Tenant
+
Branch
+
Appointment State

birlikte değerlendirilmelidir.

57. Repository Scope

Repository abstraction mümkünse tenant scope'u zorunlu hale getirebilir.

Örneğin kavramsal:

customerRepository.findById(
  tenantId,
  customerId
)

Bu:

customerId

tek başına query edilmesinden daha güvenlidir.

58. Query Pattern

Güvenli:

WHERE
  id = :customerId
  AND tenantId = :tenantId

Riskli:

WHERE
  id = :customerId
59. Branch Query

Branch-scoped query:

WHERE
  tenantId = :tenantId
  AND branchId IN (:allowedBranchIds)

şeklinde scope uygulanabilir.

60. Authorization and Caching

Authorization sonucu cache'lenecekse:

userId
tenantId
role
permission
scope

gibi context değişkenleri cache key'e dahil edilmelidir.

Eski authorization decision yanlışlıkla kullanılmamalıdır.

61. Permission Cache Invalidation

Role/permission değiştiğinde ilgili cache invalidation yapılmalıdır.

Örneğin:

Role changed
 ↓
Permission cache invalidated
 ↓
Next request
 ↓
Fresh authorization context
62. Session Revocation

User membership veya role değiştiğinde aktif session'ların authorization state'i gerektiğinde invalidated/revalidated edilmelidir.

Özellikle:

Owner removes admin access

gibi durumlarda eski token'ın uzun süreli yetki taşıması engellenmelidir.

63. Tenant Switching

User birden fazla tenant'a üyeyse tenant switch explicit bir operation olabilir.

Örneğin:

POST /auth/switch-tenant

response yeni authorization context sağlayabilir.

Tenant switch sonrası:

role
permissions
branch scope

yeniden hesaplanmalıdır.

64. Tenant Switching Security

Tenant switch sırasında yalnızca kullanıcının gerçekten member olduğu tenant seçilebilir.

Client:

tenantId = arbitraryTenant

göndererek tenant değiştirememelidir.

65. Invitation

Yeni tenant member onboarding'i:

Invitation
 ↓
Accept
 ↓
Membership
 ↓
Role
 ↓
Scope

akışıyla yapılabilir.

Invitation acceptance authentication ve tenant membership rules'a tabi olmalıdır.

66. Membership Status

Membership lifecycle:

INVITED
ACTIVE
SUSPENDED
REMOVED

gibi state'lere sahip olabilir.

Sadece:

ACTIVE

membership authenticated business access sağlayabilir.

67. Suspended Membership

Membership:

SUSPENDED

ise user authenticated olsa bile tenant business operations'a erişememelidir.

68. Removed Membership

Removed membership tenant access'i tamamen sonlandırmalıdır.

Historical audit records korunabilir.

69. Branch Membership

Gerekirse membership ile branch arasında ayrı relation tutulabilir:

Membership
 └── BranchMembership
      ├── branchId
      └── scope

Bu yaklaşım branch scope'unu explicit hale getirir.

70. Multiple Branches

User:

Tenant A
 ├── Branch Istanbul
 ├── Branch Ankara
 └── Branch Izmir

içinden:

Istanbul
Ankara

scope'una sahip olabilir.

71. Branch Manager

Branch manager örneği:

Role:
MANAGER

Scope:
Branch Istanbul

Bu user:

Istanbul appointments
Istanbul employees
Istanbul inventory

üzerinde yetkili olabilir.

72. Cross-Branch Reporting

Bazı roller:

REPORTS

için cross-branch erişime sahip olabilir.

Bu durumda:

Permission
+
ALL_BRANCHES scope

gereklidir.

73. Financial Scope

Financial permissions ayrıca branch scope'una tabi olabilir.

Örneğin accountant:

payments.read

permission'ına sahip olup yalnızca:

Branch A
Branch B

finansal kayıtlarını görebilir.

74. Sensitive Financial Actions

Refund veya accounting adjustment gibi operations için:

Permission
+
Tenant
+
Branch
+
Business State
+
Possibly Approval

kontrolleri gerekebilir.

75. Approval Model

Bazı yüksek riskli operations ileride approval workflow gerektirebilir.

Örneğin:

Large Refund
Accounting Adjustment
Inventory Adjustment

akışı:

Request
 ↓
Approval
 ↓
Execution

şeklinde modellenebilir.

76. Authorization Audit

Aşağıdaki olaylar audit edilebilir:

Role assigned
Role removed
Permission changed
Membership suspended
Membership removed
Tenant switched
Sensitive access granted
Sensitive operation denied
77. Denied Access Logging

Her 403 request'in ayrıntılı business data'sını loglamak gerekmez.

Ancak security monitoring için:

userId
tenantId
permission
resource
requestId
timestamp

gibi minimum context tutulabilir.

Sensitive payload loglanmamalıdır.

78. Authorization Abuse

Aşağıdaki pattern'ler monitoring gerektirebilir:

Many 403 responses
Many cross-resource 404s
Repeated tenant switching
Repeated failed authentication
Repeated sensitive endpoint access

Bunlar potansiyel abuse göstergeleri olabilir.

79. API + Mobile

Mobile client authorization kararlarını server'dan bağımsız vermemelidir.

Mobile UI:

Hide Button

yapabilir.

Ancak server:

Permission Check

yapmak zorundadır.

80. API + Web

Web client için de aynı prensip geçerlidir.

Frontend:

Permission-aware UI

sağlayabilir.

Ancak security boundary:

Backend

tarafındadır.

81. Authorization Testing

Her sensitive permission için:

Allowed
Denied
Wrong Tenant
Wrong Branch
Wrong Role
Suspended Membership
Missing Permission

test edilmelidir.

82. Cross-Tenant Test

Özellikle test edilmelidir:

Tenant A User
        ↓
Tenant B Resource
        ↓
DENY

Bu test multi-tenant sistemin en kritik güvenlik testlerinden biridir.

83. Cross-Branch Test

Ayrıca:

Branch A User
        ↓
Branch B Resource
        ↓
DENY

test edilmelidir.

84. Permission Matrix

İleride:

Role × Permission × Scope

matrix'i oluşturulmalıdır.

Örnek:

                     OWNER ADMIN MANAGER STAFF RECEPTION
customers.read        ✓     ✓      ✓       ✓      ✓
customers.write       ✓     ✓      ✓       ✓      ✓
payments.refund       ✓     ✓      ?       ✗      ✗
roles.manage          ✓     ✓      ✗       ✗      ✗
tenant.manage         ✓     ✓      ✗       ✗      ✗

Final matrix domain ve business requirements ile belirlenecektir.

85. Authorization Model Evolution

İlk sürümde:

RBAC
+
Tenant Scope
+
Branch Scope

yeterli olabilir.

İleride ihtiyaç olursa:

ABAC
Policy Engine
Custom Roles
Approval Rules

eklenebilir.

86. RBAC

RBAC:

User
 ↓
Role
 ↓
Permission

modelidir.

Beauty ERP'nin başlangıç authorization modeli RBAC merkezli olacaktır.

87. Scope-Aware RBAC

Saf RBAC yerine:

User
 ↓
Role
 ↓
Permission
 ↓
Scope

modeli kullanılacaktır.

Bu branch-level ERP operasyonları için daha uygundur.

88. ABAC

ABAC:

User attributes
Resource attributes
Action
Context

üzerinden policy kararı verir.

İlk aşamada zorunlu değildir.

Ancak ileride örneğin:

"Only managers can refund payments above X amount"

gibi context-aware rules için değerlendirilebilir.

89. Authorization Boundary

Authorization business domain'in tamamına dağılmamalıdır.

Temel abstraction:

AuthorizationService
Policy
Guard
Scope Resolver

gibi merkezi bileşenler üzerinden kurulabilir.

90. Security Principle

Authorization:

Explicit
Centralized
Auditable
Tenant-aware
Scope-aware
Fail-closed

olmalıdır.

91. Current State

Şu anda sistem foundation seviyesindedir.

Mevcut:

NestJS
Config
Prisma
PostgreSQL
Redis
Health

vardır.

Authentication/authorization implementation henüz tamamlanmış değildir.

Bu doküman hedef authorization modelini tanımlar.

92. Implementation Order

Önerilen implementation sırası:

User
 ↓
Tenant Membership
 ↓
Authentication
 ↓
Active Tenant Context
 ↓
Roles
 ↓
Permissions
 ↓
Branch Scope
 ↓
Authorization Guard
 ↓
Resource Authorization
 ↓
Audit
 ↓
Permission Matrix
93. Final Principle

Beauty ERP authorization sistemi:

Kullanıcının yalnızca kim olduğunu değil, hangi tenant adına, hangi role ve permission ile, hangi branch/resource scope'unda hangi operation'ı yapabileceğini belirlemelidir.