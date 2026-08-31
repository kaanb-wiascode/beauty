# Beauty ERP — Domain Model

> Bu doküman Beauty ERP'nin temel iş alanlarını, entity'lerini ve aralarındaki ilişkileri tanımlar.
>
> Nihai Prisma modelleri bu dokümandaki domain kararları gözden geçirildikten sonra oluşturulacaktır.

---

# 1. Domain Architecture

Beauty ERP'nin temel organizasyon yapısı:

```text
Tenant
│
├── Legal Entities
│
├── Headquarters
│
├── Regions
│   └── Branches
│
├── Departments
│
├── Employees
│
├── Users
│
├── Roles
│
└── Permissions

Bunların üzerinde:

CRM
Operations
Finance
Accounting
HR
Payroll
Inventory
Purchasing
Quality
Customer Portal
Reporting
Integrations

gibi domainler çalışacaktır.

2. Tenant

Tenant, Beauty ERP içerisinde hizmet verilen işletmenin en üst organizasyon sınırıdır.

Örnek:

Tenant
└── ABC Beauty Group

Tenant:

Kendi kullanıcılarına
Kendi müşterilerine
Kendi çalışanlarına
Kendi şubelerine
Kendi tüzel kişiliklerine
Kendi finansal kayıtlarına
Kendi operasyonlarına

sahiptir.

Tenant Isolation

Her tenant'ın verileri kesin olarak ayrılmalıdır.

Bir tenant'ın:

Customer
Employee
Appointment
Sale
Payment
Invoice
Inventory
Accounting

verileri başka tenant tarafından erişilebilir olmamalıdır.

3. Legal Entity

Bir Tenant birden fazla tüzel kişilik içerebilir.

Tenant
│
├── Legal Entity A
├── Legal Entity B
└── Legal Entity C

Legal Entity aşağıdaki alanlarla ilişkili olabilir:

Vergi bilgileri
Faturalama
Muhasebe
Banka hesapları
Kasa
Vergiler
Finansal raporlar

Bir şube bir tüzel kişiliğe bağlı olmalıdır.

4. Headquarters

Tenant'ın merkez organizasyonudur.

Genel merkezde:

Genel Müdürlük
İnsan Kaynakları
Muhasebe
Finans
Eğitim
Kalite
Hijyen
Kurumsal İletişim
PR
Bilgi İşlem
Satın Alma
Diğer merkezi departmanlar

bulunabilir.

Merkez departmanları doğrudan şube operasyonlarından ayrılabilir.

5. Region

Region, birden fazla şubenin üst organizasyonudur.

Tenant
│
├── Region A
│   ├── Branch 1
│   ├── Branch 2
│   └── Branch 3
│
└── Region B
    ├── Branch 4
    └── Branch 5

Region aşağıdaki kriterlere göre oluşturulabilir:

Lokasyon
Şube sayısı
Şube büyüklüğü
Ciro
Operasyonel yapı

Bir Region Manager belirli bir region'dan sorumlu olabilir.

6. Branch

Branch, işletmenin müşteriye doğrudan hizmet verdiği operasyonel lokasyondur.

Branch:

Legal Entity
Region
Departments
Employees
Customers
Appointments
Services
Sales
Payments
Inventory

ile ilişkilendirilebilir.

7. Branch Classification

Şubeler sınıflandırılabilir.

Örnek:

A
B
C
D

veya:

Small
Medium
Large
Flagship

Sınıflandırma tenant tarafından yapılandırılabilir olmalıdır.

Şube sınıfı ileride:

Yönetici yeterlilikleri
Personel sayısı
Hedefler
Yetkiler
Raporlama
Operasyonel standartlar

gibi alanlarda kullanılabilir.

8. Department

Department, organizasyon içerisindeki iş birimidir.

Örnek:

Headquarters
├── HR
├── Finance
├── Accounting
├── Training
├── Quality
├── IT
└── Corporate Communications

Şube:

Branch
├── Reception
├── Estheticians
├── Doctors
└── Other Staff

Bir çalışan bir veya daha fazla departmanla ilişkilendirilebilir.

9. Employee

Employee gerçek dünyadaki çalışan kaydıdır.

Employee ile User birbirinden ayrıdır.

Employee
│
└── User Account

Employee aşağıdaki bilgilerle ilişkilendirilebilir:

Personal information
Employment information
Department
Position
Primary branch
Secondary branches
Assignments
Permissions
Payroll
Leave
Attendance
Performance
10. Employee Branch Membership

Bir Employee birden fazla branch ile ilişkilendirilebilir.

Örnek:

Employee
│
├── Primary Branch
│
├── Secondary Branch
│
└── Secondary Branch

Bu ilişki çalışanın kalıcı organizasyon bağlantısını temsil eder.

11. Employee Assignment

Employee Branch Membership ile Temporary Assignment birbirinden farklıdır.

Membership

Çalışanın kalıcı veya normal organizasyon ilişkisini belirtir.

Assignment

Belirli bir zaman aralığındaki görevlendirmeyi belirtir.

Örnek:

Dr. Ahmet
Primary Branch:
Kadıköy

Temporary Assignment:
Beşiktaş
10:00 - 16:00
2026-09-01

Assignment aşağıdaki bilgileri içerebilir:

Employee
Branch
Start Date
End Date
Start Time
End Time
Assignment Type
Reason
Created By
Approved By
12. Assignment Types

Başlangıçta aşağıdaki assignment türleri düşünülebilir:

REGULAR
TEMPORARY
DAILY
HOURLY
SUPPORT
AUDIT
MANAGEMENT
TRAINING
COVER

Liste daha sonra genişletilebilir.

13. User

User sistemde kimlik doğrulama yapılan hesabı temsil eder.

User:

Employee
Customer
System administrator
Other external identity

ile ilişkili olabilir.

Önemli ayrım:

Employee ≠ User
Customer ≠ User

User bir kimlik ve erişim kavramıdır.

14. Customer

Customer, işletmenin hizmet verdiği müşteridir.

Customer tenant'a aittir.

Customer aşağıdaki bilgilerle ilişkilendirilebilir:

Contact information
Appointments
Services
Packages
Sessions
Sales
Payments
Outstanding balances
Campaigns
Opportunities
Feedback
Complaints
Assigned staff
Documents
Notifications
15. Customer User Account

Customer için User hesabı oluşturulabilir.

Customer
   │
   └── User Account

Hesap oluşturma işlemi başlangıçta hizmet satışı yapan branch user tarafından yapılabilir.

Müşteri daha sonra kendi hesabından:

İşlem geçmişi
Hizmet geçmişi
Personel geçmişi
Ödeme geçmişi
Paketler
Seanslar
Borçlar
Kampanyalar
Fırsatlar
Randevular
Online ödemeler

gibi verilere erişebilir.

16. Role

Role, kullanıcıya verilen fonksiyonel yetki grubudur.

Örnek:

GENERAL_MANAGER
REGION_MANAGER
BRANCH_MANAGER
HR_MANAGER
ACCOUNTING_MANAGER
RECEPTIONIST
ESTHETICIAN
DOCTOR
CUSTOMER

Role doğrudan veri erişim sınırı olarak kabul edilmemelidir.

17. Permission

Permission belirli bir işlemi yapabilme yetkisidir.

Örnek:

customer.read
customer.create
customer.update

appointment.read
appointment.create
appointment.reschedule

payment.read
payment.create
payment.refund

employee.read
employee.update

report.read
report.export

Permission mümkün olduğunca küçük ve anlamlı operasyonlara ayrılmalıdır.

18. Authorization Scope

Permission'ın yanında scope bulunabilir.

Örnek:

Permission:
customer.read

Scope:
BRANCH

veya:

Permission:
customer.read

Scope:
REGION

veya:

Permission:
customer.read

Scope:
TENANT

Böylece aynı permission farklı organizasyon sınırlarında uygulanabilir.

19. User Authorization Model

Temel authorization modeli:

User
│
├── Roles
│
├── Permissions
│
├── Tenant Scope
│
├── Legal Entity Scope
│
├── Region Scope
│
├── Branch Scope
│
├── Department Scope
│
└── Temporary Assignments

Yetki kararı bu bağlamların birleşimiyle hesaplanır.

20. Service

Service işletmenin müşteriye sunduğu hizmettir.

Örnek:

Laser Hair Removal
Facial Care
Skin Treatment
Medical Aesthetic Procedure

Service aşağıdaki bilgilerle ilişkili olabilir:

Category
Duration
Price
Required staff type
Required equipment
Required inventory
Commission
Branch availability
21. Service Category

Hizmetler kategorilere ayrılabilir.

Örnek:

Hair Removal
Skin Care
Medical Aesthetic
Body Care
Other
22. Appointment

Appointment müşteri ile planlanan hizmet zamanıdır.

İlişkiler:

Customer
   ↓
Appointment
   ↓
Branch
   ↓
Service
   ↓
Employee

Appointment:

Customer
Branch
Service
Employee
Date
Start time
End time
Status
Notes

ile ilişkilidir.

23. Appointment Status

Başlangıçta:

SCHEDULED
CONFIRMED
CHECKED_IN
IN_SERVICE
COMPLETED
CANCELLED
NO_SHOW
RESCHEDULED

gibi durumlar desteklenebilir.

24. Service Session

Paket hizmetlerinde gerçek kullanım seans üzerinden takip edilir.

Örneğin:

Package:
10 Laser Sessions

Used:
4

Remaining:
6

Service Session bir hizmetin fiilen kullanılmış hakkını temsil eder.

25. Package

Package birden fazla hizmet veya seansın satış paketidir.

Örnek:

Laser Package
10 Sessions

Package:

Customer
Sale
Services
Sessions
Price
Discount
Expiration

ile ilişkili olabilir.

26. Sale

Sale bir ürün, hizmet veya paketin müşteriye satışını temsil eder.

Customer
   ↓
Sale
   ├── Services
   ├── Packages
   └── Products

Sale ödeme ile aynı kavram değildir.

Satış gerçekleşebilir ve ödeme daha sonra yapılabilir.

27. Payment

Payment finansal tahsilat işlemidir.

Bir Sale'ın:

Tamamı
Bir kısmı
Taksitleri
Kalan bakiyesi

farklı Payment kayıtlarıyla tutulabilir.

Örnek:

Sale: 10,000 TL

Payment 1: 3,000 TL
Payment 2: 2,000 TL

Remaining:
5,000 TL
28. Payment Methods

Desteklenmesi planlanan yöntemler:

CASH
BANK_TRANSFER
CARD
VIRTUAL_POS
PAYMENT_LINK
OTHER

Online ödeme sağlayıcıları abstraction üzerinden bağlanmalıdır.

29. Payment Provider

Payment Provider üçüncü taraf ödeme sağlayıcısını temsil eder.

Örnek:

Payment Provider
       ↓
Virtual POS
       ↓
Payment

Sağlayıcıya özel kod business logic'e gömülmemelidir.

30. Inventory

Inventory ürün ve malzeme hareketlerini temsil eder.

Örnek:

Product
   ↓
Stock
   ↓
Stock Movement

Stok hareketleri:

PURCHASE
SALE
SERVICE_USAGE
TRANSFER
ADJUSTMENT
RETURN
WASTE

gibi türlere ayrılabilir.

31. Service → Inventory Relationship

Bazı hizmetler stok tüketir.

Örneğin:

Laser Treatment
       ↓
Consumable A
       ↓
-1 stock

Hizmet tamamlandığında ilgili stok hareketi oluşturulabilir.

32. Accounting Entry

Finansal işlemler muhasebe kayıtlarına dönüşebilir.

Örneğin:

Sale
 ↓
Payment
 ↓
Accounting Entry

ve:

Service Completion
 ↓
Inventory Movement

gibi işlemler ilgili muhasebe süreçlerine bağlanabilir.

Muhasebe domaini ayrı bir domain olarak tasarlanacaktır.

33. Feedback

Feedback müşterinin hizmet sonrası verdiği geri bildirimdir.

Feedback:

Customer
Appointment
Service
Employee
Branch

ile ilişkilendirilebilir.

Örnek değerlendirmeler:

Overall Satisfaction
Service Quality
Employee Experience
Waiting Time
Hygiene
Branch Experience
34. Quality Case

Belirli geri bildirimler kalite vakasına dönüşebilir.

Örneğin:

Feedback
   ↓
Negative / Critical
   ↓
Quality Case
   ↓
Quality Team
   ↓
Investigation
   ↓
Resolution

Quality Case:

Customer
Feedback
Branch
Employee
Severity
Status
Assigned User
Resolution
Dates

ile ilişkilendirilebilir.

35. Google Review Workflow

Müşteri geri bildirimi uygun kurallar doğrultusunda Google yorum sürecine yönlendirilebilir.

Akış:

Service Completed
       ↓
Feedback Requested
       ↓
Customer Feedback
       ↓
Review Decision
       ↓
Google Review Workflow

Google entegrasyonu ayrı bir integration domain üzerinden yönetilmelidir.

36. Campaign

Campaign müşterilere sunulan pazarlama teklifidir.

Campaign:

Service
Product
Package
Customer segment
Branch
Region
Date range

ile ilişkilendirilebilir.

37. Opportunity

Opportunity müşteriye yönelik potansiyel satış veya teklif fırsatıdır.

Örnek:

Customer
   ↓
Opportunity
   ↓
Potential Service
   ↓
Potential Sale

Opportunity CRM domaininde tutulacaktır.

38. Notification

Notification müşteriye veya kullanıcıya gönderilen sistem bildirimidir.

Kanallar:

IN_APP
EMAIL
SMS
WHATSAPP
PUSH

İlk aşamada gerekli kanallar seçilebilir.

Notification olay bazlı oluşturulmalıdır.

Örneğin:

Appointment Created
        ↓
Notification

ve:

Payment Completed
        ↓
Notification
39. Audit Log

Kritik sistem işlemleri audit log ile izlenmelidir.

Örnek:

User A
changed
Customer X
payment status
from PENDING
to PAID

Audit log:

Actor
Action
Entity
Entity ID
Previous value
New value
Timestamp
IP / request context

gibi bilgileri içerebilir.

40. Data Migration

Migration domaini eski sistemlerden Beauty ERP'ye veri aktarımını yönetir.

Temel kavramlar:

Migration Job
Import File
Source System
Mapping
Validation Result
Import Batch
Import Error
Import Audit

Akış:

Source
 ↓
Import
 ↓
Validation
 ↓
Mapping
 ↓
Transformation
 ↓
Preview
 ↓
Approval
 ↓
Import
 ↓
Audit
41. Core Business Event

Sistemde domain event yaklaşımı kullanılabilir.

Önemli örnek:

ServiceCompleted

Bu event sonrasında:

ServiceCompleted
    ├── Package Session Deduction
    ├── Inventory Consumption
    ├── Payment / Balance Update
    ├── Accounting Process
    ├── Notification
    ├── Feedback Request
    └── Reporting

gibi işlemler tetiklenebilir.

42. Core Customer Journey

Temel müşteri yolculuğu:

Lead
 ↓
Customer
 ↓
Appointment
 ↓
Check-in
 ↓
Service
 ↓
Package Session / Sale
 ↓
Payment
 ↓
Accounting
 ↓
Inventory
 ↓
Notification
 ↓
Feedback
 ↓
Quality / Review
 ↓
Future Appointment
 ↓
Campaign / Opportunity
43. Domain Boundaries

İlk büyük domain sınırları:

Identity
Organization
CRM
Customer
Appointment
Service
Sales
Payments
Inventory
Accounting
Finance
HR
Payroll
Quality
Marketing
Notifications
Reporting
Integrations
Migration

Domainler doğrudan birbirlerinin iç yapılarına erişmek yerine tanımlanmış servisler, application interfaces veya domain events üzerinden iletişim kurmalıdır.

44. Current Domain Implementation Status

Şu anda yalnızca temel domain altyapısı uygulanmıştır.

Tenant                  🟡 Initial model exists

Legal Entity            ⏳
Headquarters            ⏳
Region                  ⏳
Branch                  ⏳
Department              ⏳
Employee                ⏳
User                    ⏳
Role                    ⏳
Permission              ⏳
Customer                ⏳
Service                 ⏳
Appointment             ⏳
Package                 ⏳
Sale                    ⏳
Payment                 ⏳
Inventory               ⏳
Accounting              ⏳
Feedback                ⏳
Quality Case            ⏳
Campaign                ⏳
Opportunity             ⏳
Notification            ⏳
Audit Log               ⏳
Migration               ⏳
45. Important Modeling Rule

Bu dokümanda tanımlanan her entity'nin gerçek database modeline dönüştürülmesi zorunlu değildir.

Database tasarımı sırasında:

Aggregate boundaries
Ownership
Cardinality
Lifecycle
Audit requirements
Tenant isolation
Performance
Historical data requirements

ayrıca değerlendirilecektir.

46. Domain Modeling Rule

Bir domain implement edilmeye başlanmadan önce:

Domain amacı tanımlanır.
Entity'ler belirlenir.
Relationships belirlenir.
Lifecycle belirlenir.
Authorization scope belirlenir.
Audit gereksinimleri belirlenir.
Domain events belirlenir.
Database modeli oluşturulur.
Migration oluşturulur.
Testler yazılır.
Git checkpoint oluşturulur.