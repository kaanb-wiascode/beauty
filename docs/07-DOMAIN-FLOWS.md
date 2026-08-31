# Beauty ERP — Domain Flows

> Bu doküman Beauty ERP'deki kritik business süreçlerinin uçtan uca akışlarını tanımlar.
>
> Amaç, bir işlemin yalnızca kendi domaininde kalmayıp sistemin diğer domainlerine nasıl yayıldığını kayıt altına almaktır.

---

# 1. Core Transaction

Beauty ERP'nin temel transaction zinciri:

```text
Customer
   ↓
Appointment
   ↓
Check-in
   ↓
Service
   ↓
Package / Sale
   ↓
Payment
   ↓
Inventory
   ↓
Accounting
   ↓
Notification
   ↓
Feedback
   ↓
Quality
   ↓
Reporting

Her adımın birbirinden bağımsız CRUD işlemi olması beklenmez.

Bir business event birden fazla domain etkisi oluşturabilir.

2. Customer Creation

Temel akış:

Customer Form
   ↓
Validation
   ↓
Tenant Resolution
   ↓
Duplicate Check
   ↓
Customer Creation
   ↓
Audit

Customer oluşturulurken:

Tenant doğrulanmalıdır.
Gerekli alanlar validate edilmelidir.
Aynı müşterinin duplicate kayıtları mümkün olduğunca engellenmelidir.
İşlemi gerçekleştiren kullanıcı audit edilmelidir.
3. Customer Duplicate Detection

Müşteri oluşturma sırasında mevcut müşteri aranabilir.

Örneğin:

Phone
Email
National ID

gibi alanlar tenant policy'sine göre kullanılabilir.

Akış:

Create Customer
      ↓
Duplicate Detection
      ↓
 ┌────┴────┐
 ↓         ↓
Found    Not Found
 ↓         ↓
Review   Create

Duplicate detection hiçbir zaman farklı tenant'ın verisini göstermemelidir.

4. Appointment Creation

Randevu oluşturma:

Customer
   ↓
Select Branch
   ↓
Select Service
   ↓
Select Employee
   ↓
Select Time
   ↓
Availability Check
   ↓
Authorization Check
   ↓
Conflict Check
   ↓
Create Appointment
   ↓
Audit
   ↓
Notification
5. Appointment Availability

Availability kontrolünde:

Branch
+
Service
+
Employee
+
Time

birlikte değerlendirilmelidir.

Kontroller:

Employee available?
Service available at branch?
Branch open?
Existing appointment conflict?
Employee assignment valid?

olabilir.

6. Appointment Status Flow

Önerilen lifecycle:

SCHEDULED
    ↓
CONFIRMED
    ↓
CHECKED_IN
    ↓
IN_SERVICE
    ↓
COMPLETED

Alternatif:

SCHEDULED
    ↓
CANCELLED

ve:

SCHEDULED
    ↓
NO_SHOW

gibi terminal durumlar olabilir.

Client doğrudan arbitrary status transition yapamamalıdır.

7. Check-in

Müşteri şubeye geldiğinde:

Appointment
   ↓
Check-in
   ↓
Validate Appointment
   ↓
Validate Branch
   ↓
Status = CHECKED_IN
   ↓
Audit

Check-in müşteri deneyimi ve operasyon dashboard'larına yansıyabilir.

8. Service Start

Hizmet başladığında:

CHECKED_IN
   ↓
IN_SERVICE

geçişi yapılır.

Bu aşamada:

Employee
Service
Customer
Branch

ilişkileri doğrulanmalıdır.

9. Service Completion

Hizmet tamamlandığında:

IN_SERVICE
   ↓
COMPLETED

işlemi gerçekleşir.

Bu event downstream işlemleri tetikleyebilir:

ServiceCompleted
       ↓
Package Consumption
       ↓
Inventory Consumption
       ↓
Accounting
       ↓
Notification
       ↓
Feedback Request
       ↓
Reporting
10. Package Consumption

Hizmet paket kapsamında veriliyorsa:

Completed Service
      ↓
Find Customer Package
      ↓
Find Available Session
      ↓
Validate Session
      ↓
Consume Session
      ↓
Create Usage Record

Session zaten kullanılmışsa işlem tekrar uygulanmamalıdır.

11. Package Session Concurrency

Örneğin:

Remaining Sessions = 1

iki request aynı anda geldiğinde:

Request A ─┐
           ├── Transaction
Request B ─┘

yalnızca bir request session'ı tüketebilmelidir.

Diğer request:

PACKAGE_SESSION_EXHAUSTED

veya uygun concurrency/business error ile sonuçlanmalıdır.

12. Package Consumption and Appointment

Package session tüketimi mümkün olduğunca ilgili appointment'a bağlanmalıdır.

Örnek:

Appointment A
      ↓
Service Completed
      ↓
Package Session #7
      ↓
Usage Record

Bu sayede geçmişte:

"Hangi randevuda hangi paket seansı kullanıldı?"

sorusu cevaplanabilir.

13. Direct Sale

Müşteri paket kullanmadan hizmet satın alıyorsa:

Appointment
   ↓
Service
   ↓
Sale
   ↓
SaleItem

oluşabilir.

Bu durumda paket session tüketimi yapılmaz.

14. Package Sale

Paket satışı:

Customer
   ↓
Sale
   ↓
Package SaleItem
   ↓
Payment
   ↓
CustomerPackage
   ↓
Package Sessions

şeklinde ilerleyebilir.

CustomerPackage satışın başarılı şekilde tamamlanmasıyla oluşturulmalıdır.

15. Sale Creation

Satış oluşturma:

Create Sale
   ↓
Validate Customer
   ↓
Validate Branch
   ↓
Validate Items
   ↓
Calculate Prices
   ↓
Apply Discounts
   ↓
Calculate Tax
   ↓
Create Sale
   ↓
Create SaleItems
   ↓
Audit
16. Historical Price

Sale oluşturulduğu anda:

Service Current Price

kullanılarak:

SaleItem Unit Price

oluşturulur.

Sonrasında service fiyatı değişse bile geçmiş SaleItem değişmez.

17. Discount

İndirim:

Original Price
      ↓
Discount Rule
      ↓
Discount Amount
      ↓
Net Price

şeklinde hesaplanmalıdır.

İndirim uygulanırken:

Yetki
Kampanya
Müşteri segmenti
Tarih
Şube
Hizmet

gibi koşullar değerlendirilebilir.

18. Payment Flow

Ödeme akışı:

Sale
 ↓
Create Payment
 ↓
PENDING
 ↓
Payment Provider / Cash / Card
 ↓
Payment Confirmation
 ↓
PAID

Başarısız ödeme:

PENDING
 ↓
FAILED

olabilir.

19. Online Payment Flow

Online ödeme:

Customer
   ↓
Checkout
   ↓
Payment Intent
   ↓
Provider
   ↓
Payment
   ↓
Webhook
   ↓
Signature Verification
   ↓
Idempotency Check
   ↓
Update Payment
   ↓
Accounting

Browser redirect sonucu tek başına ödeme doğrulaması değildir.

20. Payment Webhook

Webhook geldiğinde:

Webhook
   ↓
Validate Signature
   ↓
Identify Provider Transaction
   ↓
Check Duplicate Event
   ↓
Find Local Payment
   ↓
Apply State Transition
   ↓
Audit

Aynı webhook tekrar gelirse:

No duplicate payment
No duplicate accounting entry

sağlanmalıdır.

21. Payment Completion

Ödeme başarıyla tamamlandığında:

Payment PAID
   ↓
Accounting Event
   ↓
Notification
   ↓
Reporting

tetiklenebilir.

Sale status ayrıca business kurallarına göre:

UNPAID
PARTIALLY_PAID
PAID

gibi değerlerle yönetilebilir.

22. Partial Payment

Örneğin:

Sale = 10,000 TRY

Ödemeler:

3,000
2,000

ise:

Paid = 5,000
Remaining = 5,000

olmalıdır.

Payment kayıtları silinerek bakiye değiştirilmemelidir.

23. Refund

Refund:

Payment
   ↓
Refund Request
   ↓
Authorization
   ↓
Refundability Check
   ↓
Refund Provider
   ↓
Webhook / Confirmation
   ↓
Refund Record
   ↓
Accounting

şeklinde ilerlemelidir.

Refund işlemi orijinal payment history'sini silmez.

24. Inventory Consumption

Hizmet sırasında ürün tüketiliyorsa:

Service Completed
      ↓
Consumption Definition
      ↓
Stock Availability
      ↓
Stock Movement
      ↓
Stock Decrease

oluşur.

Örneğin:

Laser Session
   ↓
Gel - 20ml
   ↓
Stock Movement
   ↓
-20ml
25. Stock Insufficient

Yeterli stok yoksa davranış domain policy'sine bağlıdır.

Örneğin:

Stock = 0
Required = 1

durumunda:

INSUFFICIENT_STOCK

döndürülebilir.

Alternatif olarak operasyonel override mekanizması ayrıca tanımlanabilir.

26. Stock Transfer

Şubeler arası transfer:

Branch A
   ↓
Transfer Request
   ↓
Approval
   ↓
Stock OUT
   ↓
Transport
   ↓
Stock IN
   ↓
Branch B

şeklinde modellenebilir.

Transfer yalnızca kaynak stoktan düşüp hedefe eklemekten ibaret değildir; transfer lifecycle'ı korunmalıdır.

27. Inventory Adjustment

Stok sayımı sonrası fark:

Expected Stock
      ↓
Physical Count
      ↓
Difference
      ↓
Adjustment
      ↓
Audit

oluşturur.

Adjustment:

Kim yaptı?
Neden yaptı?
Hangi stok?
Önceki miktar?
Yeni miktar?

sorularını cevaplayabilmelidir.

28. Accounting Event

Financial business event'ler muhasebe tarafına aktarılabilir.

Örnek:

Sale
 ↓
Accounting Event
 ↓
Journal Entry
 ↓
Journal Lines

Muhasebe entry'si transactionally tutarlı olmalıdır.

29. Accounting Double Entry

Muhasebe kayıtlarında:

Total Debit = Total Credit

olmalıdır.

Örnek:

Debit  Cash       1,000
Credit Revenue    1,000
30. Accounting Source

Her muhasebe kaydı mümkün olduğunca kaynak işlemle ilişkilendirilmelidir.

Örneğin:

JournalEntry
    ↓
sourceType = PAYMENT
sourceId   = ...

Böylece:

Accounting
   ↓
Payment
   ↓
Sale
   ↓
Customer

zinciri takip edilebilir.

31. Notification Flow

Business event:

AppointmentConfirmed

oluştuğunda:

Event
 ↓
Notification Decision
 ↓
Notification
 ↓
Delivery

oluşturulabilir.

32. Notification Delivery

Bir notification birden fazla kanal kullanabilir:

Notification
├── Push
├── Email
├── SMS
└── WhatsApp

Her delivery'nin kendi:

PENDING
SENT
FAILED

gibi lifecycle'ı olabilir.

33. Notification Retry

Harici provider geçici olarak başarısız olursa:

Delivery FAILED
     ↓
Retry Policy
     ↓
Retry

uygulanabilir.

Sonsuz retry yapılmamalıdır.

34. Feedback Request

Hizmet tamamlandıktan sonra:

ServiceCompleted
      ↓
Feedback Eligibility
      ↓
Create Feedback Request
      ↓
Notification
      ↓
Customer

akışı uygulanabilir.

35. Feedback Submission

Müşteri:

Feedback Request
      ↓
Feedback Form
      ↓
Validation
      ↓
Feedback

oluşturur.

Feedback ilgili:

Customer
Appointment
Service
Employee
Branch

ile ilişkilendirilebilir.

36. Feedback Classification

Feedback alındığında:

Feedback
   ↓
Classification
   ↓
Positive / Neutral / Negative

gibi bir değerlendirme yapılabilir.

İleri aşamada AI-assisted classification eklenebilir.

AI classification business source of truth değildir.

37. Quality Case Creation

Kritik veya olumsuz feedback:

Negative Feedback
      ↓
Quality Rule
      ↓
Quality Case

oluşturabilir.

Quality Case:

OPEN
 ↓
INVESTIGATING
 ↓
ACTION_REQUIRED
 ↓
RESOLVED
 ↓
CLOSED

gibi lifecycle'a sahip olabilir.

38. Quality Assignment

Quality Case belirli bir kullanıcıya atanabilir:

Quality Case
     ↓
Assigned User
     ↓
Investigation

Assignment değişiklikleri audit edilmelidir.

39. Quality Resolution

Resolution:

Investigation
    ↓
Root Cause
    ↓
Corrective Action
    ↓
Customer Follow-up
    ↓
Resolution

şeklinde olabilir.

40. Google Review Workflow

Uygun müşteri deneyimlerinde:

Service Completed
      ↓
Feedback
      ↓
Review Eligibility
      ↓
Google Review Invitation

gibi bir süreç kullanılabilir.

Sistem:

Sahte yorum üretmemeli.
Müşteriyi yanıltmamalı.
Platform kurallarını ihlal etmemeli.
Müşterinin özgür iradesine müdahale etmemelidir.
41. Customer Lifecycle

Müşteri lifecycle:

LEAD
 ↓
CUSTOMER
 ↓
ACTIVE
 ↓
INACTIVE

gibi modellenebilir.

Müşteri lifecycle ile CRM lifecycle birbirinden ayrılabilir.

42. Lead Conversion

Lead:

Lead
 ↓
Qualification
 ↓
Opportunity
 ↓
Conversion
 ↓
Customer

şeklinde ilerleyebilir.

Conversion sırasında duplicate customer kontrolü yapılmalıdır.

43. Campaign Flow

Campaign:

Campaign
 ↓
Audience / Segment
 ↓
Offer
 ↓
Notification
 ↓
Customer Interaction
 ↓
Conversion

şeklinde çalışabilir.

Campaign sonucu satış attribution gerektiğinde ayrıca tutulmalıdır.

44. Customer Retention

Müşteri hizmet geçmişi analiz edilerek:

Last Visit
      ↓
Retention Rule
      ↓
Follow-up
      ↓
Campaign / Notification

akışı oluşturulabilir.

Örneğin:

60 days without visit

gibi business rule'lar ileride tanımlanabilir.

45. Employee Assignment Flow

Çalışan branch değişimi:

Employee
   ↓
Assignment Request
   ↓
Authorization
   ↓
Approval
   ↓
EmployeeAssignment
   ↓
Audit

şeklinde ilerleyebilir.

Assignment'ın geçmişi korunmalıdır.

46. Employee Schedule

Employee availability:

Employee
   ↓
Branch
   ↓
Working Hours
   ↓
Leave
   ↓
Assignment
   ↓
Appointment Availability

birleşiminden hesaplanabilir.

47. Leave Flow

İzin:

Employee
   ↓
Leave Request
   ↓
Manager Approval
   ↓
Approved Leave
   ↓
Availability Update

şeklinde çalışabilir.

Onaylanmış izin randevu availability hesabını etkileyebilir.

48. Payroll Flow

Temel payroll:

Employee
   ↓
Attendance
   ↓
Leave
   ↓
Overtime
   ↓
Commission
   ↓
Payroll Calculation
   ↓
Review
   ↓
Approval
   ↓
Payroll
   ↓
Accounting

şeklinde ilerleyebilir.

49. Import Flow

Harici veri import:

Upload
   ↓
Import Job
   ↓
Mapping
   ↓
Validation
   ↓
Preview
   ↓
Approval
   ↓
Execution
   ↓
Error Report
   ↓
Audit

Import doğrudan production tablolarına kontrolsüz şekilde yazmamalıdır.

50. Reporting Flow

Normal rapor:

Request
 ↓
Authorization
 ↓
Query
 ↓
Response

Büyük rapor:

Request
 ↓
Authorization
 ↓
Create Job
 ↓
202 Accepted
 ↓
Background Worker
 ↓
Generate
 ↓
Storage
 ↓
Download
51. Audit Flow

Kritik business action:

Business Action
      ↓
Database Transaction
      ↓
Business Result
      ↓
Audit Event

Audit işlemin gerçekleştiğine dair iz bırakmalıdır.

Audit başarısız olduğunda kritik işlemler için davranış ayrıca belirlenmelidir.

52. Event Principle

Domain event örnekleri:

CustomerCreated
AppointmentCreated
AppointmentConfirmed
AppointmentCheckedIn
ServiceStarted
ServiceCompleted
PackageSessionConsumed
SaleCreated
PaymentCompleted
PaymentRefunded
StockConsumed
FeedbackSubmitted
QualityCaseCreated

Event isimleri business anlamını temsil etmelidir.

53. Event Idempotency

Event consumer'ları aynı event'in tekrar gelmesine dayanıklı olmalıdır.

Örnek:

PaymentCompleted
       ↓
Notification Consumer

aynı event iki kez işlenirse:

Duplicate Notification

oluşmamalıdır.

54. Event Ordering

Event'lerin sırası önemli olduğunda consumer bunu doğrulamalıdır.

Örneğin:

PaymentCompleted

event'i:

PaymentCreated

öncesinde işlenmemelidir.

Ordering ihtiyacı domain bazında değerlendirilmelidir.

55. Transaction + Event

Database transaction ile event publication arasında consistency problemi oluşabileceği için gerektiğinde:

Outbox Pattern

kullanılabilir.

Örnek:

Transaction
 ├── Business Change
 └── Outbox Event
          ↓
       Commit
          ↓
      Event Worker
          ↓
      External Action
56. Core Transaction Example

Tam müşteri işlemi:

Customer
   ↓
Appointment
   ↓
Check-in
   ↓
Service
   ↓
COMPLETED
   ↓
┌─────────────────────────────┐
│ Package Session Consumption │
│ Inventory Consumption       │
│ Sale / Payment              │
│ Accounting                  │
│ Notification                │
│ Feedback Request             │
└─────────────────────────────┘

Bu işlemlerin hepsinin tek HTTP transaction'ı olması gerekmez.

Business consistency seviyeleri ayrıca tanımlanmalıdır.

57. Critical vs Eventual Consistency

Critical state:

Payment
Package Session
Stock
Accounting

mümkün olduğunca transactional consistency gerektirir.

Eventual consistency uygun olabilecek alanlar:

Notification
Reporting
Analytics
Search Index
58. Failure Handling

Örneğin:

Service Completed
   ↓
Package Consumed
   ↓
Inventory Failed

durumunda sistemin nasıl davranacağı açıkça tanımlanmalıdır.

Critical işlemler için:

Atomic Transaction

veya:

Compensation

yaklaşımı kullanılabilir.

59. Compensation

Bazı işlemler geri alınabilir.

Örneğin:

Stock Consumption
      ↓
Compensation
      ↓
Stock Reversal

Ancak financial records fiziksel olarak silinmemeli; reversal/refund gibi karşı kayıtlar oluşturulmalıdır.

60. Business State vs Integration State

Bir payment:

Business State
PAID

ve:

Provider State
SUCCESS

bilgilerini ayrı tutabilir.

Aynı prensip:

Notification
Inventory Integration
Accounting Export

gibi external state'ler için de geçerlidir.

61. Current MVP Priority

İlk uçtan uca çalışan transaction:

Customer
   ↓
Appointment
   ↓
Service
   ↓
Package / Sale
   ↓
Payment
   ↓
Feedback

olabilir.

Ardından:

Inventory
Accounting
Quality
Notifications

derinleştirilecektir.

62. Domain Flow Rule

Her yeni business feature için şu sorular cevaplanmalıdır:

Bu işlem hangi domain'e ait?
Hangi entity değişiyor?
Hangi event oluşuyor?
Hangi domain'ler etkileniyor?
Transaction boundary nerede?
Idempotency gerekiyor mu?
Audit gerekiyor mu?
Authorization scope nedir?
Failure durumunda ne olur?
Eventual consistency kabul edilebilir mi?
63. Core Product Principle

Beauty ERP'de:

Bir işlem başarılı olarak kabul edilmeden önce onun kritik downstream etkileri doğru şekilde tamamlanmalıdır.

Örneğin:

Payment Completed

sadece payment tablosunun güncellenmesi değildir.

Gerekli durumlarda:

Accounting
Sale
Customer Balance
Reporting
Notification

ile tutarlı hale gelmelidir.

64. Current Implementation State

Şu anda çalışan altyapı:

NestJS
PostgreSQL
Prisma
Redis
Health Check

seviyesindedir.

Domain flow'ların tamamı henüz implementation değildir.

Bu doküman gelecekteki implementation için kaynak görevi görür.

65. Next Implementation Flow

İlk gerçek business flow:

Tenant
   ↓
Branch
   ↓
Employee
   ↓
Customer
   ↓
Service
   ↓
Appointment

olarak başlayacaktır.

Sonrasında:

Appointment
   ↓
Service Completion
   ↓
Package / Sale
   ↓
Payment

eklenecektir.