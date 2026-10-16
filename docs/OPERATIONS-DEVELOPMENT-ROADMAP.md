# Operations Development Roadmap

## 1. Purpose

This document is the living implementation roadmap for the Beauty ERP Operations domain.

The Operations domain must not be treated as a sidebar grouping of Appointments, Services, Staff and Payments. Its target is to become the real-time operational execution layer of a beauty, aesthetics, medical aesthetics, spa or multi-branch service business.

Core target:

> Appointment → Visit → Resource Allocation → Service Execution → Package / Consumption → Sale / Payment → Checkout / Rebook

The platform should answer not only “Who has an appointment today?” but also:

> What is happening in the branch right now, what happens next, who is waiting, which staff/room/device is available, where are delays or conflicts, which services are in progress, and which operational actions remain incomplete?

Repository: `kaanb-wiascode/beauty`

Development branch: `feature/core-commerce-foundation`

Do not merge or push to `main` unless explicitly instructed.

---

## 2. Current-State Assessment

### 2.1 Current navigation

The current sidebar groups the following under Operations:

- Appointments
- Services
- Staff
- Payments

There is no dedicated `/operations` product area at the time of this assessment.

This is a taxonomy/UI grouping rather than a complete Operations bounded context.

### 2.2 Existing appointment foundation

The appointment frontend already provides a useful base:

- daily calendar
- staff columns
- time slots
- customer/staff/service/status filtering
- appointment create/update/cancel
- appointment status handling
- payment action from appointment context
- active branch awareness
- frontend permission checks

The backend has a dedicated appointments module with:

- create
- list
- detail
- update
- cancel/remove
- eligible package/session lookup
- tenant/branch context
- permission guards

### 2.3 Existing service foundation

Services already exist as a dedicated product/domain area and should be extended rather than recreated.

### 2.4 Important documentation/implementation gap

Project documentation describes a customer flow containing:

`Appointment → Check-in → Service → ...`

API conventions also describe business actions such as:

`POST /appointments/:id/check-in`

However, the currently inspected appointment controller does not expose a dedicated check-in action. This is a concrete docs-to-implementation gap that must be resolved deliberately rather than by simply overloading appointment status.

### 2.5 Overall maturity estimate

| Area | Current maturity |
|---|---:|
| Basic appointment management | 7/10 |
| Calendar UX | 7/10 |
| Permissions / branch awareness | 7/10 |
| Service catalog | 6/10 |
| Package-session integration foundation | 6/10 |
| Check-in / check-out | 2/10 |
| Visit management | 1/10 |
| Walk-in | 1/10 |
| Waiting list | 0/10 |
| Room/resource management | 1/10 |
| Device scheduling | 1/10 |
| Capacity engine | 2/10 |
| Service execution | 2/10 |
| Consumable execution | 2/10 |
| SOP/checklists | 1/10 |
| Rebooking | 2/10 |
| Operational tasks | 1/10 |
| Live operations cockpit | 1/10 |
| Incident management | 1/10 |
| Overall Operations Platform | 3.5–4/10 |

The main weakness is not the lack of a better calendar. It is the absence of a complete operational execution model around the calendar.

---

## 3. Domain Boundary

Operations owns execution and orchestration of the physical service journey.

It must not duplicate source-of-truth domains.

### Operations owns

- visit lifecycle
- check-in / waiting / service / checkout operational states
- resource allocation
- room/device/resource availability in service execution context
- service execution
- operational capacity
- waitlist
- walk-in handling
- operational tasks/checklists
- operational incidents
- operational alerts/exceptions
- operational timeline

### Other domains remain source of truth

- Customer master: CRM / Customers
- Staff master and employment: HR
- Service catalog/commercial definitions: Services / Commerce
- Sales: Sales / Commerce
- Payments/collections: Payments / Finance / Commerce
- Inventory master and stock: Inventory
- Training/competency/certification: Training + HR
- Accounting: Finance / Accounting
- Marketing communications/reminders: CRM / Communications
- Quality policies/findings: Quality

Operations may consume and orchestrate these domains, but must not recreate them.

---

## 4. Target Operational Journey

```text
Appointment
   ↓
Reminder / Confirmation
   ↓
Customer Arrival
   ↓
Check-in
   ↓
Waiting
   ↓
Room / Staff / Device Allocation
   ↓
Service Start
   ↓
Service Execution
   ↓
Consumables / Package Session / Notes
   ↓
Service Completion
   ↓
Additional Sale / Package / Product
   ↓
Collection
   ↓
Next Appointment
   ↓
Check-out
   ↓
Feedback / Follow-up
```

This journey should be modeled as explicit business actions and auditable state transitions, not as arbitrary status edits.

---

## 5. Visit as a First-Class Domain Concept

Appointment and visit are not the same thing.

A customer can:

- arrive with an appointment
- arrive as walk-in
- receive multiple services in one visit
- receive services from multiple staff members
- use one or more rooms/devices
- consume package sessions
- buy additional services/products
- pay or leave a balance
- create a next appointment

Target relationship:

```text
Customer
   ↓
Visit
 ├─ Appointment(s)
 ├─ Service Execution(s)
 ├─ Staff Assignments
 ├─ Resource Allocations
 ├─ Package Sessions
 ├─ Consumptions
 ├─ Sales
 ├─ Payments
 └─ Follow-up / Rebook
```

Before adding a new Visit model, inspect Prisma schema, migrations and existing modules for equivalent concepts.

---

## 6. Appointment Status vs Visit Status

Do not overload appointment status to represent the physical customer journey.

Example appointment lifecycle:

```text
SCHEDULED
CONFIRMED
CANCELLED
NO_SHOW
COMPLETED
```

Example visit lifecycle:

```text
EXPECTED
ARRIVED
CHECKED_IN
WAITING
IN_SERVICE
SERVICE_COMPLETED
CHECKOUT_PENDING
CHECKED_OUT
CANCELLED
```

Exact enums must be decided after inspecting existing schema and compatibility requirements.

Transitions should be explicit, validated and audited.

---

## 7. Operations Control Center

Create a dedicated `/operations` area only after confirming there is no equivalent current route/product surface.

Target Operations Control Center metrics:

- today appointments
- expected customers
- arrived
- waiting
- in service
- delayed
- completed
- no-show
- checkout pending
- payment/collection pending where relevant
- resource conflicts
- unavailable devices/rooms

Example live board:

| Customer | Status | Service | Staff | Room | Operational age |
|---|---|---|---|---|---|
| Ayşe K. | Waiting | Laser | Elif | — | 8 min |
| Selin Y. | In service | Skin care | Zeynep | Room 3 | 34 min |
| Deniz A. | Delayed | Hydrafacial | Ece | — | +12 min |

The cockpit must be exception-driven: show a problem and provide the next valid action.

---

## 8. Check-in / Check-out

### Check-in

Implement a real check-in business action after validating existing schema and docs.

Check-in should be able to capture:

- visit/appointment
- actual arrival timestamp
- actor
- branch
- arrival source if needed
- optional operational note
- resulting queue/wait state

Do not implement check-in as an unrestricted PATCH of appointment status.

### Check-out

Service completion is not customer checkout.

Target flow:

```text
Service Completed
      ↓
Package Session / Consumption
      ↓
Additional Sale?
      ↓
Payment / Balance
      ↓
Next Appointment
      ↓
Aftercare / Feedback Trigger
      ↓
Checkout
```

Operations should surface checkout blockers without becoming the owner of Payment, Sales or Finance records.

---

## 9. Walk-in Management

Support customers who arrive without a pre-existing appointment.

Target flow:

```text
Walk-in arrives
→ search existing customer
→ or quick customer creation
→ select requested service
→ find available staff/resources
→ start visit or add to queue
```

Walk-in must preserve customer deduplication and CRM/customer source-of-truth rules.

---

## 10. Waiting List

Introduce a waitlist only after confirming no equivalent model/service exists.

Potential fields:

- tenant/company/branch
- customer
- service
- preferred staff
- preferred date/date range
- preferred time window
- priority
- contact channel
- status
- createdAt/expiresAt

Potential statuses:

```text
WAITING
MATCH_FOUND
CONTACTED
BOOKED
EXPIRED
CANCELLED
```

### Cancellation Slot Recovery

A later automation can react to a newly opened slot:

```text
Slot opens
   ↓
Find compatible waitlist entries
   ↓
Rank candidates
   ↓
Offer slot
   ↓
Booking accepted
```

This must be idempotent and safe against multiple customers accepting the same capacity.

---

## 11. Appointment Resource Engine

This is a P0 Operations capability.

Real beauty services require more than staff + time.

Example laser appointment:

```text
Customer
+
Qualified Specialist
+
Laser Device
+
Treatment Room
+
Time Window
```

Target resource types may include:

- STAFF
- ROOM
- DEVICE
- BED
- CHAIR
- EQUIPMENT
- OTHER

Do not introduce these blindly. First inspect Inventory, Services, HR, Training and any device/equipment models.

The resource engine should support:

- service resource requirements
- resource availability
- reservations
- conflict detection
- maintenance/unavailability blocks
- preparation/cleanup buffers
- capacity calculation
- auditable allocation changes

---

## 12. Rooms / Cabins

Branches should be able to model operational spaces such as:

- Laser Room 1
- Skin Care Room 2
- VIP Room
- Massage Room

Potential operational states:

```text
AVAILABLE
RESERVED
IN_USE
CLEANING
OUT_OF_SERVICE
```

Room master data should be branch-scoped and should not be duplicated if an equivalent facilities/resource model already exists.

---

## 13. Devices / Equipment

Examples:

- Candela GentleMax Pro #01
- Hydrafacial #02
- Alexandrite #03

Potential operational states:

```text
AVAILABLE
RESERVED
IN_USE
CLEANING
MAINTENANCE
OUT_OF_SERVICE
```

Operations must integrate with the existing Training/Competency architecture.

Target concept:

```text
Staff
  ↓
Competency
  ↓
Certificate
  ↓
Device Authorization
```

A tenant policy may WARN or BLOCK assignment when competency/certification requirements are not met.

Do not duplicate device/equipment ownership if Inventory/Assets or another domain already owns it.

---

## 14. Service Operational Requirements

A service should be able to define an operational recipe.

Example:

```text
Hydrafacial

Duration: 60 min
Required competency: Skin Care L3
Room type: Treatment Room
Device: Hydrafacial
Expected consumables:
- Tip × 1
- Serum A × 15 ml
- Serum B × 10 ml
Preparation: 10 min
Cleanup: 15 min
```

This metadata should integrate with the existing Service model rather than creating a parallel service catalog.

---

## 15. Preparation / Cleanup Buffers

A 60-minute service may consume 85 minutes of resource capacity.

```text
10 min preparation
60 min service
15 min cleanup
```

Target service/resource scheduling concepts may include:

- prepDuration
- serviceDuration
- cleanupDuration

Conflict and capacity engines must account for the full blocked interval.

---

## 16. Conflict Detection

Booking validation should eventually consider:

- staff availability
- staff shift
- staff leave
- room availability
- device availability
- maintenance blocks
- resource blocks
- branch working hours
- preparation/cleanup buffers
- competency/certification policy

Conflicts should be explainable, e.g.:

- staff unavailable
- room occupied
- device under maintenance
- competency requirement missing

Do not hide conflicts behind a generic 409 message if actionable reasons can be returned safely.

---

## 17. Capacity Engine

Operations should compute real capacity rather than only appointment count.

Examples:

- branch laser capacity: 92% utilized today
- skin care capacity: 58%
- three valid slots remain between 17:00–20:00
- device bottleneck
- staff bottleneck
- room bottleneck

Capacity calculations should use real resource requirements, shifts, blocks, service duration and buffers.

---

## 18. Service Execution

Do not equate `Appointment COMPLETED` with a complete service execution record.

Target concept:

```text
ServiceExecution
- visit
- service
- startedAt
- completedAt
- staff
- room/resource allocations
- device
- notes
- consumptions
- package session
- result/status
```

The exact model should be determined after inspecting existing Sale/Appointment/Package/Inventory models.

Business actions should include explicit start and complete transitions.

---

## 19. Multiple Staff / Handoffs

Some services may involve multiple staff roles:

```text
Assistant → preparation
Specialist → application
Doctor / Supervisor → control
```

A future execution assignment structure may need:

- staff
- role
- startedAt
- endedAt
- responsibility

Do not over-engineer this before single-owner service execution is stable.

---

## 20. Package Session Consumption

The existing eligible-session foundation should be reused.

Target operational flow:

```text
Service completed
      ↓
Eligible package/session?
      ↓
Consume session
```

Appointment completion and package-session consumption are related but distinct business actions.

Consumption must be:

- idempotent
- auditable
- concurrency-safe
- reversible through controlled business semantics where allowed

---

## 21. Consumable Execution

Integrate Service Execution with Inventory.

Example:

```text
Hydrafacial completed

Tip      -1
Serum A  -15 ml
Serum B  -10 ml
Gloves   -2
```

Track both:

- expected consumption
- actual consumption

This enables variance analysis:

```text
Expected: 15 ml
Actual:   22 ml
Variance: +7 ml
```

Inventory remains source of truth for stock movements.

Operations supplies the service execution context/source reference.

---

## 22. Service Checklist / SOP

Support service-specific operational checklists.

Example laser checklist:

- customer verified
- treatment area checked
- contraindication control
- protective eyewear
- device parameters checked
- aftercare information delivered

Checklist definitions should integrate with Quality and Training where appropriate.

Completed checklist evidence should be immutable/auditable enough for the business risk level.

---

## 23. Operational Notes and Handoffs

Support operational notes between staff while maintaining privacy boundaries.

Do not mix ordinary operational notes with clinical/health-sensitive data unless the domain, permissions, retention and security model explicitly support it.

Potential capabilities:

- internal operational note
- handoff note
- priority flag
- actor/timestamp
- visibility scope

---

## 24. Rebooking

Checkout should support next-appointment creation.

Services may define a recommended rebooking interval, e.g. four weeks.

Metrics:

- rebooking rate
- rebooking by service
- rebooking by staff
- recommended vs actual return interval

CRM/Appointments remain the owners of customer follow-up and appointment records.

---

## 25. No-show Management

No-show must be more than a status.

Potential flow:

```text
No-show
→ reason/context
→ fee/policy if applicable
→ customer reliability signal
→ follow-up
→ reschedule
```

Potential customer operational indicators:

- no-show count
- late cancellation count
- confirmation reliability

Do not create punitive automated behavior without tenant-configurable policy and appropriate permissions.

---

## 26. Cancellation Reasons

Use configurable cancellation reason taxonomy, e.g.:

- customer request
- staff unavailable
- device failure
- branch issue
- health reason
- price
- other

This enables cancellation root-cause analytics.

Preserve historical reason values even if taxonomy changes later.

---

## 27. Reminder / Confirmation Integration

Appointment reminders should reuse CRM/Communications infrastructure rather than introducing another messaging subsystem.

Example:

```text
24h before
→ WhatsApp/SMS
→ Confirm / Reschedule / Cancel
```

Confirmation state may need to be distinct from physical visit state.

Provider actions must preserve idempotency, consent and audit rules.

---

## 28. Operational Timeline

Each visit/appointment should expose a business timeline such as:

```text
12 Sep 10:32 Created
13 Sep 15:12 Customer confirmed
15 Sep 13:55 Checked in
15 Sep 14:04 Service started
15 Sep 15:01 Service completed
15 Sep 15:08 Payment completed
15 Sep 15:12 Checked out
```

Timeline events should be derived from real domain events/audit records where possible rather than duplicated manually.

---

## 29. Staff Live Availability

HR owns staff status/employment.

Operations should derive operational availability such as:

```text
AVAILABLE
WITH_CUSTOMER
BREAK
LUNCH
TRAINING
OFF_SHIFT
ON_LEAVE
```

Prefer deriving this from:

- HR shift/attendance
- leave
- training schedule
- appointment/visit/service execution
- explicit operational blocks

Avoid creating a conflicting second employee status system.

---

## 30. Operational Tasks

Branches also perform non-customer operational work:

- opening checklist
- closing checklist
- sterilization
- room preparation
- device cleaning
- stock check
- cash closing handoff

A lightweight Operational Tasks capability can provide value.

Do not build a generic Jira/Asana replacement inside Operations.

---

## 31. Opening / Closing Checklists

Example opening checklist:

```text
□ Cash/register ready
□ Rooms ready
□ Devices checked
□ Consumables sufficient
□ Waiting area ready
```

Example closing checklist:

```text
□ Devices shut down
□ Rooms cleaned
□ Stock checks completed
□ Cash closing completed
□ Day-end exceptions reviewed
```

This is particularly valuable for multi-branch/franchise standardization.

Checklist templates should be centrally configurable and branch-executable.

---

## 32. Operational Incidents

Operational issues should become structured records when material.

Examples:

- device failure
- room unavailable
- power/network interruption
- staffing emergency
- safety/quality issue

Potential concept:

```text
OperationalIncident
- type
- severity
- branch
- resource
- reportedBy
- assignedTo
- openedAt
- resolvedAt
- impact
- notes
```

An incident may change resource availability and identify affected future appointments.

Quality/safety incidents must integrate with Quality rather than duplicate it.

---

## 33. Live Alerts / Exception Management

The Operations Cockpit should surface actionable exceptions such as:

- customers waiting more than threshold
- delayed service
- room awaiting cleaning
- device unavailable
- appointment/resource conflict
- checkout blocked
- package/session problem
- stock shortage affecting upcoming services

Design principle:

> Show the problem → explain the cause → expose the valid next action.

---

## 34. Target Navigation

```text
OPERATIONS

Overview
Live Operations

APPOINTMENT & VISIT
Appointments
Visits
Check-in / Check-out
Waiting List

RESOURCES
Staff Availability
Rooms & Cabins
Devices
Resource Calendar
Capacity

SERVICE OPERATIONS
Service Executions
Packages & Sessions
Consumptions
Checklist / SOP

BRANCH OPERATIONS
Operational Tasks
Opening / Closing
Incidents & Failures

FOLLOW-UP / EXCEPTIONS
Delays
No-show
Cancellations
Operational Alerts
```

Navigation must respect permissions and product entitlements.

Staff master data stays in HR.

Payments should not remain conceptually owned by Operations. Operations may invoke payment/collection workflows during checkout, while Finance/Commerce remains source of truth.

---

## 35. Permissions

Current permissions should be preserved for compatibility while gradually introducing more precise operational permissions if justified.

Potential future permissions:

- operations.read
- operations.manage
- visits.read
- visits.checkin
- visits.checkout
- visits.manage
- resources.read
- resources.manage
- service-execution.read
- service-execution.start
- service-execution.complete
- waitlist.read
- waitlist.manage
- operations.tasks.manage
- operations.incidents.manage

Do not introduce all permissions in one migration unless the implementation actually requires them.

---

## 36. Multi-Tenant / Company / Branch Isolation

Every Operations record must respect the established tenancy model.

Critical rules:

- tenant isolation is mandatory
- company boundaries must be respected where the owning entity is company-scoped
- physical operations are normally branch-scoped
- central users may have multi-branch visibility according to role scope
- cross-branch resource assignment must be explicitly supported, never accidental
- referenced staff/customer/service/resource must belong to the valid tenant/company/branch context

Add isolation tests for every new write path.

---

## 37. Auditability and Concurrency

Operations is highly concurrent: reception, specialists and managers can act on the same visit/resource simultaneously.

Critical requirements:

- explicit state transitions
- optimistic concurrency/versioning where records are edited concurrently
- row/advisory locks where resource allocation requires serialization
- idempotency for retryable business actions
- immutable/auditable event history
- controlled reversal/cancellation semantics
- no silent destructive overwrites

High-risk actions include:

- check-in
- start service
- complete service
- resource allocation
- package consumption
- checkout
- waitlist slot acceptance
- incident-driven rescheduling

---

## 38. Integration Map

### Operations ↔ CRM / Customers

- customer identity
- reminders/follow-up
- no-show/rebooking signals

### Operations ↔ HR

- staff master
- shift/leave/attendance
- availability

### Operations ↔ Training

- competency
- certificate
- device/service authorization

### Operations ↔ Services / Commerce

- service catalog
- duration
- pricing/commercial context
- package/session eligibility

### Operations ↔ Inventory

- expected consumables
- actual consumables
- stock movement source
- shortages

### Operations ↔ Sales / Payments / Finance

- checkout blockers
- sale/payment invocation
- collection state
- no duplicate financial records

### Operations ↔ Quality

- SOP/checklists
- quality findings
- corrective actions
- service execution evidence

### Operations ↔ Communications

- appointment confirmation/reminders
- aftercare/feedback messages

---

## 39. Analytics

Target operational analytics:

### Appointment

- appointment utilization
- confirmation rate
- cancellation rate
- no-show rate
- reschedule rate

### Visit

- average waiting time
- check-in-to-service time
- service duration variance
- checkout duration
- total visit duration

### Capacity

- staff utilization
- room utilization
- device utilization
- service capacity
- branch capacity
- bottleneck analysis

### Service execution

- expected vs actual duration
- expected vs actual consumables
- handoff count
- checklist compliance

### Commercial operations

- rebooking rate
- same-visit upsell/cross-sell
- package session utilization
- checkout conversion

### Branch operations

- opening/closing compliance
- incident count
- incident resolution time
- delayed customer count
- SLA breaches

---

## 40. Recommended Development Phases

### Phase 1 — Visit & Operational Lifecycle Foundation

Priority: P0.

- inspect current Appointment/Service/Package/Customer schema and migrations
- define Appointment vs Visit boundary
- introduce Visit only if no equivalent exists
- implement explicit arrival/check-in/waiting/service/checkout lifecycle
- operational timeline/events
- walk-in foundation
- checkout blockers/status
- branch and permission isolation
- concurrency/versioning
- frontend Operations overview/live queue foundation

Goal:

> A branch can track the real customer journey from arrival through checkout rather than only appointment status.

### Phase 2 — Resource Engine

Priority: P0.

- inspect existing device/equipment/facility models
- resource abstraction or compatible extension
- room/cabin support
- device/equipment support
- service resource requirements
- resource allocation/reservation
- prep/cleanup buffers
- conflict engine
- maintenance/unavailability blocks
- resource calendar
- explainable conflicts

Goal:

> The system can determine whether a service can actually be delivered at a given time.

### Phase 3 — Service Execution

- start/complete service actions
- Service Execution records
- staff/resource assignments
- operational notes/handoffs
- package-session consumption integration
- expected/actual consumable integration
- SOP/checklist execution
- idempotency and audit

Goal:

> Completing a service produces an auditable operational record, not only an appointment status change.

### Phase 4 — Capacity, Waitlist & Recovery

- capacity engine
- utilization metrics
- waiting list
- compatible slot matching
- cancellation slot recovery
- resource bottleneck analysis
- staff availability board

Goal:

> Empty capacity is discoverable and recoverable, while overbooking is prevented.

### Phase 5 — Branch Operations

- operational tasks
- opening/closing templates
- branch execution
- incidents
- resource outage impact
- affected appointment detection
- live exception alerts

Goal:

> The branch can manage daily operational discipline in the same platform.

### Phase 6 — Rebooking & Customer Journey Optimization

- configurable cancellation reasons
- no-show workflow
- recommended next appointment
- rebooking workflow
- reminder/confirmation integration
- checkout follow-up
- rebooking/no-show analytics

Goal:

> Operations actively protects retention and future revenue.

### Phase 7 — Advanced Operations Intelligence

Only after reliable operational data exists:

- predicted delays
- predicted no-show risk
- capacity recommendations
- staff/resource optimization
- demand-aware slot recommendations
- anomaly detection
- manager insights

AI must not bypass deterministic scheduling, competency, safety, consent or approval rules.

---

## 41. Phase 1 Acceptance Criteria

At minimum:

1. Existing appointment behavior remains backward compatible unless intentionally migrated.
2. A customer with an appointment can be marked arrived/check-in through an explicit business action.
3. A walk-in can enter the operational journey without requiring an artificial pre-existing appointment if the domain design supports it.
4. Appointment status and physical visit status are not conflated.
5. Waiting and in-service states are visible to branch users.
6. Service start/completion transition semantics are explicit or prepared for Phase 3 without destructive shortcuts.
7. Checkout pending and checked-out states can be represented.
8. Operational timeline records actor and timestamp for key transitions.
9. Cross-tenant and invalid cross-branch references are rejected.
10. Concurrent conflicting transitions fail safely.
11. Permissions are enforced backend-side.
12. Frontend provides loading, empty and error states.
13. Relevant tests, typecheck and lint pass.
14. Roadmap progress is updated and committed on `feature/core-commerce-foundation`.

---

## 42. Testing Strategy

### Backend tests

- tenant isolation
- company/branch isolation
- permissions
- valid visit transitions
- invalid transitions
- repeated/idempotent actions
- concurrent check-in/start/complete/checkout
- invalid customer/staff/service/resource references
- appointment/visit relationship integrity
- walk-in rules
- cancellation/no-show rules

### Resource tests

- staff conflict
- room conflict
- device conflict
- buffer conflict
- maintenance conflict
- branch hours
- leave/shift integration
- competency policy warn/block

### Integration tests

```text
Appointment → Check-in → Service → Checkout
```

```text
Walk-in → Visit → Service → Checkout
```

```text
Appointment → Service → Package Session Consumption
```

```text
Service Execution → Inventory Consumption
```

```text
Resource Failure → Availability Change → Affected Appointments
```

```text
Cancellation → Waitlist Match → Booking
```

---

## 43. Definition of Done

A roadmap item is not complete merely because an endpoint or model exists.

For each logical increment verify, as applicable:

- schema/domain model
- migration
- service/business rules
- tenant/company/branch isolation
- permissions
- audit
- concurrency
- idempotency
- API
- frontend user flow
- loading/empty/error states
- tests
- typecheck
- lint
- roadmap update
- commit on `feature/core-commerce-foundation`

Do not merge to `main` unless explicitly instructed.

---

## 44. Immediate Implementation Order

When development begins:

1. Read this roadmap.
2. Inspect latest commits.
3. Inspect current Prisma Appointment/Service/Package/Staff/Customer models and migrations.
4. Inspect the appointments service in full, especially conflict and session logic.
5. Inspect existing device/equipment/asset/resource models across Inventory/HR/Training/Services.
6. Inspect current appointment frontend actions/status handling.
7. Confirm whether any Visit/Check-in/ServiceExecution equivalents already exist.
8. Design the smallest backward-compatible Visit/lifecycle foundation.
9. Implement backend business actions and tests first.
10. Add Operations Control Center/live queue UI.
11. Then proceed to Resource Engine.

Do not begin by building a large dashboard over incomplete operational semantics.

---

## 45. Architectural Principles

### Principle 1 — Operations is execution, not navigation

The Operations domain is the live execution layer of the business.

### Principle 2 — Appointment is not Visit

Appointment describes scheduled intent. Visit describes physical execution.

### Principle 3 — Service completion is not checkout

A customer may still have payment, rebooking, documentation or other blockers.

### Principle 4 — Resource capacity is multi-dimensional

Staff availability alone is insufficient. Rooms, devices, equipment, shifts, maintenance, buffers and competencies may constrain capacity.

### Principle 5 — Reuse source-of-truth domains

Do not duplicate Staff, Customer, Service, Payment, Inventory, Competency or Finance systems inside Operations.

### Principle 6 — Business actions over arbitrary status mutation

Prefer explicit commands such as check-in, start-service, complete-service and checkout with validated transitions.

### Principle 7 — Explain operational failures

Conflict responses should identify actionable causes.

### Principle 8 — Audit the physical journey

Operational events affect customer experience, revenue, inventory, quality and staff performance; key transitions must be traceable.

### Principle 9 — Exception-driven cockpit

The best Operations dashboard does not merely display numbers. It highlights problems and exposes the next valid action.

---

## 46. Out of Scope for Initial Operations Work

Unless explicitly requested:

- generic project/task management platform
- full facility management suite
- generic CMMS replacement
- rebuilding HR scheduling from scratch
- rebuilding Inventory
- rebuilding CRM messaging
- rebuilding Payments/Finance
- rebuilding Training/Competency
- Marketplace / Supplier Marketplace expansion
- AI scheduling before deterministic resource/capacity rules are stable

---

## 47. Continuation Protocol for a New Chat

Use this when continuing Operations development in a new conversation:

```text
Open repository kaanb-wiascode/beauty and continue on branch feature/core-commerce-foundation.

First read /docs/OPERATIONS-DEVELOPMENT-ROADMAP.md.
Then inspect the current repository, Prisma schema/migrations, Operations-related frontend/backend modules and the latest commits.
Compare the current implementation with the roadmap and identify the first incomplete Operations item.
Do not recreate files, services, migrations, endpoints, models or UI that already exist.
Preserve strict tenant/company/branch isolation, permissions, auditability, idempotency and concurrency safety.
Appointment, Customer/CRM, HR, Training, Inventory, Sales, Payments and Finance remain the source of truth for their own domains; do not create duplicate subsystems inside Operations.
Pay special attention to the distinction between Appointment and Visit, and to the existing package/session, inventory, device/equipment and competency infrastructure before adding new models.
Do not merge or push to main.
Marketplace and Supplier Marketplace are out of scope for now.
Implement the next incomplete roadmap item directly in the repository, add/update tests, run relevant CI-quality checks, commit the changes and update this roadmap with progress.
```

Short form:

```text
kaanb-wiascode/beauty reposunda feature/core-commerce-foundation branch'ine eriş. Önce /docs/OPERATIONS-DEVELOPMENT-ROADMAP.md dosyasını oku. Mevcut operasyon/randevu/hizmet kodlarını, Prisma modellerini ve son commitleri roadmap ile karşılaştır; ilk tamamlanmamış maddeden geliştirmeye devam et. Appointment ile Visit ayrımını koru; HR, Training, Inventory, CRM, Sales, Payments ve Finance domainlerini yeniden oluşturma; tenant/company/branch izolasyonu, permission, audit, idempotency ve concurrency kurallarını koru; Marketplace kapsam dışı; main'e merge/push yapma.
```
