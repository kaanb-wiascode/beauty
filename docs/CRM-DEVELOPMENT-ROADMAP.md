# Beauty ERP — CRM Development Roadmap

> **Purpose:** This document is the canonical roadmap for strengthening the CRM domain before Marketplace and Supplier development continues.
>
> **Target branch:** `feature/core-commerce-foundation`
>
> **Scope:** CRM, sales execution, omnichannel communication, attribution, automation, analytics and CRM-to-ERP handoffs.
>
> **Out of scope for this roadmap:** Marketplace, Supplier Portal, supplier marketplace integrations and supplier-facing commerce.
>
> **Last baseline review:** 15 September 2026

---

# 1. Strategic Objective

Beauty ERP CRM must not remain a generic contact-management module. It must become the **sales operating system for beauty, aesthetics, medical aesthetics and clinic businesses**.

The target business flow is:

```text
Lead Capture
   ↓
Identity Resolution / Deduplication
   ↓
Lead Routing
   ↓
First Response SLA
   ↓
Conversation
   ↓
Qualification + Scoring
   ↓
Opportunity
   ↓
Appointment / Consultation
   ↓
Sale
   ↓
Payment / Collection
   ↓
Revenue Attribution
   ↓
Retention / Reactivation
```

Every major CRM feature should support this flow rather than creating disconnected screens.

---

# 2. Current CRM Baseline

The current implementation already contains a meaningful CRM foundation and must be extended incrementally rather than rewritten.

## 2.1 Existing strengths

The current codebase includes, at minimum:

- Lead creation and lead list
- Lead statuses: `NEW`, `CONTACTED`, `QUALIFIED`, `CONVERTED`, `LOST`
- Lead owner assignment
- Lead → Opportunity qualification
- Opportunity pipeline
- Opportunity stages:
  - `QUALIFIED`
  - `NEEDS_ANALYSIS`
  - `PROPOSAL`
  - `NEGOTIATION`
  - `WON`
  - `LOST`
- Opportunity probability
- Estimated value
- Expected close date
- Lost reason requirement
- Stale opportunity detection
- Weighted pipeline calculation
- CRM overview metrics
- Forecast metrics
- Opportunity aging
- Owner workload visibility
- Follow-up/task model
- CRM automation engine
- Scheduler/manual automation execution
- Automation execution history
- Automation observability
- WhatsApp provider integration
- SMS provider integration
- Email provider integration
- Unified conversation/inbox model
- Conversation ownership/assignment
- Conversation states: open, pending, resolved, snoozed, closed
- Conversation priority
- Unread / awaiting-response tracking
- Unresolved inbound queue
- Inbound message → Customer resolution
- Inbound message → Existing Lead resolution
- Inbound message → New Lead creation
- Customer 360 backend services
- Opportunity → Sale handoff
- Idempotent sale conversion
- Tenant/company/branch isolation patterns
- Permission-based CRM access
- Audit/event-oriented infrastructure in multiple CRM operations

These capabilities are the foundation. The next phases must strengthen them rather than duplicate them.

---

# 3. Core Product Principles

All CRM development must follow these rules.

## 3.1 No disconnected CRM

A CRM action should connect to the rest of Beauty ERP whenever the business flow requires it.

Example:

```text
Lead
→ Opportunity
→ Appointment
→ Sale
→ Payment
→ Finance
```

The CRM must not stop at `WON` if a real sale exists in the commerce domain.

## 3.2 Tenant and branch isolation is mandatory

Every CRM query and mutation must preserve:

- tenant isolation
- company/legal entity context where relevant
- branch scope
- user permission scope
- assignment visibility rules

Never weaken isolation to simplify UI implementation.

## 3.3 Idempotency for side effects

The following operations must be idempotent where retries are possible:

- inbound webhook ingestion
- message sending
- automation execution
- lead import
- lead conversion
- appointment creation from CRM
- sale creation from opportunity
- external ad-platform lead ingestion

## 3.4 Auditability

Important commercial actions must be auditable:

- lead reassignment
- stage transition
- opportunity value change
- lost reason change
- conversation assignment
- automation rule change
- merge operation
- score override
- SLA escalation
- sale/appointment conversion

## 3.5 Configuration over hard-coding

Default Beauty ERP workflows may be opinionated, but SaaS tenants must be able to configure key behavior without code changes.

---

# 4. Target CRM Architecture

```text
                    BEAUTY ERP CRM
                          │
        ┌─────────────────┴─────────────────┐
        │                                   │
   Acquisition                         Conversations
        │                                   │
Meta / Google / Web / IG / Referral   WhatsApp / SMS / Email / IG
        │                                   │
        └─────────────────┬─────────────────┘
                          │
                        LEAD
                          │
       Identity + Dedup + Routing + SLA
                          │
                 Scoring / Qualification
                          │
                    Sales Sequence
                          │
                     OPPORTUNITY
                          │
                   Custom Pipeline
                          │
                Appointment / Consult
                          │
                         SALE
                          │
                       PAYMENT
                          │
                Revenue Attribution
                          │
             Retention / Reactivation
```

---

# 5. Development Phases

The phases below are ordered by dependency and commercial value. Unless a critical bug requires otherwise, development should proceed in this order.

---

# Phase 1 — CRM Data Foundation

## Goal

Create a durable CRM data model before adding more automation or AI.

## 5.1 Expand the Lead model

The current lead model is too minimal for enterprise-grade sales operations.

Add structured fields or normalized related entities for:

### Personal/contact context

- preferred contact channel
- language
- timezone when relevant
- alternative phone
- normalized phone
- normalized email

### Acquisition context

- source
- source detail
- campaign id/name
- ad set id/name
- ad id/name
- landing page
- referrer
- UTM source
- UTM medium
- UTM campaign
- UTM content
- UTM term
- click identifiers where legally and technically appropriate

### Commercial context

- interested service(s)
- interested package(s)
- preferred branch
- estimated budget
- purchase urgency
- consultation need
- customer intent

### Sales context

- owner
- team
- lead score
- lead temperature
- first assigned at
- first contacted at
- first response at
- qualification timestamp
- disqualification/lost reason

## 5.2 Normalize acquisition source

Do not rely only on a single enum such as `META` or `MANUAL`.

Recommended hierarchy:

```text
Channel
  └── Source
       └── Campaign
            └── Ad Set
                 └── Ad / Creative
```

A lead should preserve the original acquisition data even if campaign names later change.

## 5.3 Duplicate detection

Implement duplicate detection using normalized identifiers.

Minimum matching signals:

- normalized phone
- normalized email
- provider contact id when available
- WhatsApp identity when available

Do not automatically merge uncertain matches.

Return a confidence-based duplicate candidate list.

## 5.4 Lead merge

Create a controlled merge flow.

Requirements:

- select surviving lead
- move/merge activities
- move/merge conversations
- move/merge follow-ups
- preserve acquisition history
- preserve source attribution
- preserve audit trail
- prevent cross-tenant merge
- prevent cross-branch merge unless policy allows it
- detect conflicting open opportunities

Never hard-delete the losing record without an audit reference.

## 5.5 Lost reason taxonomy

Replace free-text-only lost reasons with a configurable taxonomy plus optional notes.

Suggested default reasons:

- price
- competitor
- no response
- timing
- location
- financing/payment
- service unavailable
- medically/operationally unsuitable
- appointment no-show
- duplicate
- invalid lead
- other

Tenants should be able to add/deactivate reasons.

## 5.6 Definition of Done — Phase 1

Phase 1 is complete when:

- lead acquisition metadata can be stored end-to-end
- duplicate candidates are detected
- leads can be safely merged
- lost reasons are structured
- service/package interest is stored before sale creation
- all new fields preserve tenant/branch isolation
- migrations include rollback/forward safety checks
- API tests cover create/read/update/filter behavior
- frontend supports the new structured fields

---

# Phase 2 — Lead Intelligence, Routing and SLA

## Goal

Make the CRM decide which lead matters, who should own it and how quickly it must be handled.

## 6.1 Lead scoring engine

Create a configurable scoring service.

Initial deterministic scoring is preferred over AI scoring.

Example events:

```text
Phone verified                  +5
WhatsApp response              +10
Pricing requested              +10
Appointment intent             +20
Appointment created            +30
No response for 2 days         -10
Three failed contact attempts  -20
Invalid contact                -50
```

Store:

- current score
- score version
- score explanation
- score event history
- manual override where permitted

## 6.2 Lead temperature

Recommended default bands:

- HOT: 80–100
- WARM: 50–79
- COLD: 0–49

Tenant configuration should allow threshold changes.

Temperature should normally be derived from score, not manually entered.

## 6.3 Routing engine

Create a rule-driven assignment service.

Routing inputs may include:

- branch
- source
- campaign
- service interest
- working hours
- staff skill
- sales team
- active workload
- user availability
- round-robin position

Initial routing strategies:

1. direct owner
2. round robin
3. least open leads
4. least active conversations
5. branch/team fallback queue

## 6.4 Assignment SLA

Track:

- lead created at
- assigned at
- first viewed at if useful
- first outbound attempt
- first customer response
- first meaningful contact

Recommended configurable SLA example:

```text
0–5 min     healthy
5–15 min    warning
15+ min     breached
```

## 6.5 SLA escalation

Examples:

```text
Lead assigned
↓
No action in 10 min
↓
Notify owner
↓
No action in 20 min
↓
Notify manager
↓
No action in 30 min
↓
Reassign / return to queue
```

All escalation must be idempotent.

## 6.6 Management metrics

Add:

- average first response time
- median first response time
- SLA compliance rate
- breached leads
- unassigned leads
- assignment backlog
- owner workload
- conversion by owner

## 6.7 Definition of Done — Phase 2

- deterministic score engine is running
- HOT/WARM/COLD is visible in UI
- routing rules can assign new leads
- round-robin works safely under concurrency
- SLA clocks are persisted
- escalation events are auditable
- manager dashboard shows SLA and routing health

---

# Phase 3 — Sales Execution and Pipeline 2.0

## Goal

Turn the CRM into the daily operational workspace of the sales team.

## 7.1 Custom pipeline configuration

Current default pipeline should remain available, but stages should become tenant-configurable.

Each stage should support:

- name
- code
- order
- probability default
- color/token for UI
- terminal flag
- won flag
- lost flag
- required fields
- entry automation
- exit automation
- minimum/maximum age policy if configured

Do not allow invalid tenant configuration such as multiple incompatible terminal states without validation.

## 7.2 Pipeline drag-and-drop

Add Kanban drag-and-drop with server-side validation.

Drag action must call the same domain transition logic used by non-drag mutations.

Never let frontend drag bypass:

- stage rules
- required lost reason
- optimistic concurrency/version
- permission checks
- audit events
- automation triggers

## 7.3 Opportunity product/service interest

Before sale conversion, opportunity should contain intended commercial items.

Support:

- service interest
- package interest
- expected quantity
- expected unit price
- estimated discount
- expected value

Final sale must still use commerce-domain pricing and validation.

## 7.4 Appointment conversion

CRM must have first-class opportunity → appointment flow.

Actions:

- create appointment from lead
- create appointment from opportunity
- link existing appointment

CRM timeline must receive appointment lifecycle events:

- booked
- confirmed
- rescheduled
- arrived/check-in
- completed
- cancelled
- no-show

## 7.5 Sales sequences / cadences

Create a reusable sequence model.

Example:

```text
T+0       WhatsApp
T+30m     Call task
T+1d      WhatsApp
T+3d      Call task
T+7d      Campaign message
T+14d     Mark cold / handoff
```

Sequence must pause or stop on configured conditions such as:

- customer replied
- appointment created
- opportunity won
- lead lost
- consent revoked

## 7.6 Unified action center

Build a high-value daily sales workspace:

- overdue calls
- today’s tasks
- SLA breaches
- hot leads
- stale opportunities
- appointments requiring confirmation
- no-show recovery
- unanswered inbound conversations

This should become the page sales users open first.

## 7.7 Definition of Done — Phase 3

- pipelines are configurable
- Kanban transitions are domain-safe
- appointment conversion is first-class
- sales sequences are executable and stoppable
- daily action center is operational
- opportunity → sale integration remains idempotent

---

# Phase 4 — Omnichannel CRM

## Goal

Make all commercially relevant conversations visible in one CRM context.

## 8.1 Existing channels to preserve

- WhatsApp
- SMS
- Email

## 8.2 Target additional channels

Prioritize based on API availability and business value:

1. Instagram Direct
2. Facebook Messenger
3. Web chat

Do not fake unsupported provider capability in UI.

## 8.3 Message templates and macros

Add reusable templates with variables.

Example variables:

- `{{first_name}}`
- `{{branch_name}}`
- `{{appointment_date}}`
- `{{advisor_name}}`
- `{{service_name}}`

Support:

- tenant-wide templates
- branch templates
- role permissions
- channel restrictions
- template audit/history

## 8.4 Conversation search

Add search by:

- customer/lead name
- phone
- email
- message body where permitted
- owner
- status
- priority
- channel
- date range

## 8.5 Conversation SLA

Persist and report:

- first response time
- last customer message age
- average response time
- open duration
- resolution time

## 8.6 Inbox operations

Strengthen:

- bulk assign
- bulk close/resolve where safe
- re-open
- snooze presets
- priority escalation
- manager queue
- unassigned queue
- personal queue

## 8.7 Compliance

All outbound communication must respect:

- channel consent
- opt-out status
- provider policy
- tenant policy
- communication quiet hours where configured

## 8.8 Definition of Done — Phase 4

- omnichannel conversation context is reliable
- templates/macros work
- conversation search works
- SLA metrics exist
- unsupported channels are clearly unavailable
- opt-out/consent enforcement is centralized

---

# Phase 5 — CRM Automation Platform

## Goal

Evolve current fixed automation rules into a configurable workflow platform.

## 9.1 Preserve current event-driven foundation

The existing automation scheduler, execution history, distributed lease, advisory lock and idempotency mechanisms should remain.

Do not replace reliable infrastructure merely to add a visual builder.

## 9.2 Workflow model

Minimum node types:

### Trigger

- lead created
- lead updated
- score changed
- opportunity stage changed
- appointment created
- appointment no-show
- payment completed
- conversation received
- no activity for X time

### Condition

- source
- branch
- service interest
- score
- temperature
- owner/team
- opportunity stage
- amount
- response status
- consent state

### Action

- assign owner
- assign team
- create follow-up
- send message
- add/remove tag
- change score
- update status
- create opportunity
- create appointment suggestion/task
- notify manager

### Control flow

- wait
- branch/if-else
- stop

## 9.3 Workflow safety

Mandatory protections:

- max execution depth
- cycle detection
- rate limiting
- idempotency keys
- execution timeout
- dead-letter/failure visibility
- per-tenant execution limits
- audit history

## 9.4 Visual builder

Frontend visual builder is only Phase 5 after backend workflow semantics are stable.

Do not start with drag-and-drop UI before the workflow schema and execution engine are defined and tested.

## 9.5 Definition of Done — Phase 5

- workflow definitions are persisted
- triggers/conditions/actions execute server-side
- failures are observable
- duplicate execution is controlled
- workflows can be enabled/disabled/versioned
- visual builder manipulates the same validated schema

---

# Phase 6 — CRM Analytics and Revenue Attribution

## Goal

Prove which leads, campaigns, teams and channels create real sales and collections.

## 10.1 Funnel analytics

Default funnel:

```text
Lead
→ Contacted
→ Qualified
→ Appointment
→ Arrived
→ Opportunity Won
→ Sale
→ Payment
```

Show:

- count at each step
- conversion rate
- median time to next step
- drop-off rate

## 10.2 Sales rep performance

Metrics:

- assigned leads
- contacted leads
- first response time
- SLA compliance
- qualification rate
- appointment rate
- show rate
- win rate
- sales revenue
- collected revenue
- average ticket
- stale opportunity rate

## 10.3 Source/campaign attribution

At minimum support:

- first-touch attribution
- last-touch attribution
- lead source attribution

Later multi-touch models may be added.

## 10.4 Revenue and collection attribution

The CRM must distinguish:

- expected pipeline value
- booked sale value
- invoiced value where relevant
- collected payment value
- refunded value

Do not report sale revenue as collected cash.

## 10.5 Marketing metrics

When campaign cost data exists:

- CPL
- CPA
- CAC
- ROAS
- revenue per lead
- collected revenue per lead

## 10.6 Lost analysis

Reports:

- lost by reason
- lost by owner
- lost by source
- lost by branch
- lost by service
- lost to competitor

## 10.7 Definition of Done — Phase 6

- funnel is measurable end-to-end
- owner performance is measurable
- source-to-sale attribution works
- source-to-payment attribution works
- dashboards distinguish pipeline, revenue and collection

---

# Phase 7 — CRM AI Layer

## Goal

Use AI only where it produces operational value. AI must not replace deterministic commercial rules that require auditability.

## 11.1 Conversation summary

Generate a concise summary of long threads.

Example output:

```text
Interested in 6-session laser package.
Asked about price and weekend availability.
Price-sensitive.
Prefers Saturday after 16:00.
```

## 11.2 Suggested reply

Generate channel-aware reply drafts.

Never auto-send by default during initial rollout.

## 11.3 Next best action

Examples:

- call now
- propose consultation
- offer alternate branch
- send financing information
- schedule follow-up

## 11.4 Manager insight

Examples:

- why conversion declined
- which branch has SLA problems
- which campaign creates low-quality leads
- which sales rep has stale pipeline risk

## 11.5 Predictive scoring — later

Only after sufficient clean historical data exists should predictive lead scoring be considered.

Rule-based scoring remains the required baseline.

## 11.6 AI governance

- tenant data isolation
- no secret leakage
- prompt injection protection where external text is used
- traceability of generated recommendations
- human approval for high-impact actions
- provider/model configuration abstraction

---

# 12. Customer 360 Target

Customer 360 should become one of the signature surfaces of Beauty ERP.

Target sections:

```text
CUSTOMER 360

Identity
├── Profile
├── Branch relationship
└── Consent

Commercial
├── Lead history
├── Opportunities
├── Sales
├── Packages
└── Payments

Operations
├── Appointments
├── Services
├── Sessions
└── No-show history

Communication
├── WhatsApp
├── SMS
├── Email
└── Calls / notes

Experience
├── Feedback
├── Complaints
└── Satisfaction

Marketing
├── Source
├── Campaign
├── Attribution
└── Reactivation eligibility
```

Do not duplicate source data into Customer 360. It should aggregate authoritative domain data.

---

# 13. Required Cross-Domain Integrations

CRM must integrate with these domains before being considered complete.

## Appointments

- lead/opportunity → appointment
- appointment status → CRM timeline
- no-show → CRM automation

## Commerce

- opportunity → sale
- sale status → CRM timeline
- sale items visible in Customer 360

## Payments

- payment status → CRM/customer timeline
- collection attribution
- overdue collection signal where appropriate

## Packages/Sessions

- purchased package visible in Customer 360
- remaining sessions useful for retention automation

## Marketing / Corporate Communications

- campaign/source metadata
- spend data for attribution
- lead routing/handoff

---

# 14. Technical Architecture Rules

## 14.1 Services

Keep domain responsibilities separated.

Suggested logical services:

- LeadService
- LeadIdentityService
- LeadMergeService
- LeadScoringService
- LeadRoutingService
- CrmSlaService
- OpportunityService
- PipelineConfigurationService
- CrmSequenceService
- ConversationService
- MessageService
- AutomationService
- AttributionService
- CrmAnalyticsService

Names may differ from implementation, but responsibilities should not collapse into a single giant service.

## 14.2 Optimistic concurrency

Continue using version fields for mutable high-contention CRM records.

Use especially for:

- lead ownership
- opportunity stage
- conversation assignment
- conversation state
- workflow configuration

## 14.3 Events

Recommended CRM events include:

```text
LEAD_CREATED
LEAD_UPDATED
LEAD_ASSIGNED
LEAD_MERGED
LEAD_SCORE_CHANGED
LEAD_QUALIFIED
LEAD_LOST
FIRST_RESPONSE_RECORDED
SLA_BREACHED
OPPORTUNITY_CREATED
OPPORTUNITY_STAGE_CHANGED
OPPORTUNITY_WON
OPPORTUNITY_LOST
APPOINTMENT_LINKED
SALE_CREATED_FROM_OPPORTUNITY
MESSAGE_RECEIVED
MESSAGE_SENT
CONVERSATION_ASSIGNED
CONVERSATION_RESOLVED
SEQUENCE_STARTED
SEQUENCE_STOPPED
AUTOMATION_EXECUTED
```

Events should contain identifiers and minimal useful metadata, not uncontrolled snapshots of sensitive records.

## 14.4 Pagination

Do not keep permanent frontend assumptions such as `limit=200` for growing datasets.

All list APIs should support production pagination/cursor patterns.

Priority pages:

- leads
- opportunities
- conversations
- follow-ups
- automation history

## 14.5 Search

Search must eventually support scalable indexed queries for high-volume tenants.

Avoid client-side filtering for large production datasets.

---

# 15. UX Principles

## Sales user home

The primary daily workspace should show what requires action now.

Recommended priority order:

1. SLA breached leads
2. unanswered inbound conversations
3. hot leads
4. overdue follow-ups
5. today’s follow-ups
6. stale opportunities
7. appointment confirmations
8. no-show recovery

## Manager home

Manager view should emphasize:

- team response SLA
- funnel conversion
- pipeline value
- forecast
- stale pipeline
- owner workload
- campaign/source quality
- revenue/collection attribution

## Reduce navigation cost

CRM should feel like one workspace, not many unrelated pages.

Where useful, use:

- side panels
- contextual actions
- inline timeline
- keyboard shortcuts
- quick templates

---

# 16. Testing Requirements

Every phase must include tests before moving forward.

## Unit tests

Required for:

- scoring rules
- routing rules
- SLA calculations
- pipeline transition policies
- sequence conditions
- automation conditions/actions
- attribution calculations

## Integration tests

Required for:

- tenant isolation
- branch isolation
- lead merge
- concurrent round-robin assignment
- webhook idempotency
- sequence execution
- automation execution
- appointment conversion
- sale conversion

## E2E tests

Critical user journeys:

### Journey A

```text
Create lead
→ assign
→ contact
→ qualify
→ opportunity
→ appointment
→ sale
```

### Journey B

```text
Inbound WhatsApp
→ identity resolution
→ lead/customer match
→ conversation
→ reply
```

### Journey C

```text
Lead created
→ routing
→ SLA timer
→ breach
→ escalation
```

### Journey D

```text
Campaign lead
→ sale
→ payment
→ attribution dashboard
```

---

# 17. Security and Compliance Checklist

Before each CRM release verify:

- tenant filters cannot be bypassed
- branch scope is enforced server-side
- permissions are server-side, not only UI
- provider credentials are never returned to frontend
- outbound consent is checked centrally
- sensitive logs are redacted
- merge actions are audited
- bulk operations have authorization checks
- webhook signatures are validated
- public/webhook endpoints are rate-limited
- message replay is idempotent

---

# 18. Performance and Scale Checklist

CRM must be designed for tenants with large histories.

Targets should eventually cover:

- hundreds of thousands of leads
- millions of messages
- large multi-branch teams
- long-running automation histories

Required engineering work:

- pagination/cursors
- compound indexes
- query-plan review
- async jobs for heavy tasks
- bounded batch sizes
- archival/retention policy where appropriate
- metrics for slow queries

---

# 19. Observability

Track CRM-specific metrics:

- inbound webhook success/failure
- outbound message success/failure
- provider latency
- automation run success/failure
- routing latency
- unassigned lead count
- SLA breach count
- queue depth
- sequence execution lag
- attribution processing failures

Operational dashboards must be tenant-safe.

---

# 20. Release Strategy

Do not enable major CRM changes for every tenant immediately.

Recommended rollout:

```text
Internal
→ Test Tenant
→ Selected Beta Tenants
→ 10%
→ 50%
→ 100%
```

Use feature flags for risky or major behavior changes.

Migration-heavy phases must include backward compatibility planning.

---

# 21. Priority Backlog

## P0 — Must do first

1. Lead model expansion
2. Acquisition/UTM/campaign model
3. Duplicate detection
4. Lead merge
5. Structured lost reasons
6. Service/package interest
7. Lead scoring
8. Lead temperature
9. Routing engine
10. SLA engine

## P1 — Sales execution

11. Configurable pipelines
12. Safe Kanban drag/drop
13. Opportunity → Appointment
14. Appointment events in CRM
15. Sequences/cadences
16. Daily action center
17. Message templates/macros
18. Conversation search

## P2 — Automation and analytics

19. Workflow backend schema
20. Trigger/condition/action engine
21. Workflow versioning
22. Funnel analytics
23. Sales rep performance
24. Source/campaign attribution
25. Revenue/collection attribution
26. Lost reason analytics

## P3 — Advanced

27. Instagram Direct
28. Facebook Messenger
29. Web chat
30. Visual workflow builder
31. AI conversation summary
32. AI suggested reply
33. AI next-best-action
34. Manager AI insights
35. Predictive scoring after sufficient clean data

---

# 22. Explicitly Deferred Work

Until the CRM roadmap reaches at least Phase 3 stability, avoid spending core development capacity on:

- Marketplace expansion
- Supplier Portal expansion
- Supplier marketplace workflows
- supplier-facing analytics

Critical bug fixes in those modules are acceptable, but new feature expansion is deferred.

---

# 23. Definition of CRM 2.0 Completion

CRM 2.0 is considered commercially strong when the following end-to-end scenario works reliably:

```text
A lead arrives from an identifiable source/campaign.
The system detects duplicates.
The lead is routed automatically.
SLA starts.
The correct sales user contacts the lead.
Conversation is visible in unified inbox.
The lead is scored and qualified.
An opportunity is created.
A follow-up sequence runs automatically.
An appointment is created.
Appointment outcome returns to CRM.
A sale is created from the opportunity.
Payment/collection is linked.
Source/campaign receives revenue attribution.
Manager dashboards show funnel, SLA, rep performance and ROI.
```

When this works consistently, Beauty ERP CRM is no longer merely a CRM module; it becomes a measurable revenue engine.

---

# 24. Continuation Protocol for Future Chat Sessions

When development continues in a new ChatGPT/Work/Codex conversation, start with the following instruction:

```text
Repository: kaanb-wiascode/beauty
Development branch: feature/core-commerce-foundation

Read /docs/CRM-DEVELOPMENT-ROADMAP.md first.
Then inspect the current code and recent commits before making changes.
Do not assume roadmap tasks are still incomplete; verify each item in code.
Continue from the first incomplete item in the current phase.
Do not work on Marketplace or Supplier expansion unless explicitly requested.
Preserve multi-tenant/company/branch isolation, permissions, idempotency, auditability and concurrency safety.
Do not create duplicate services, migrations, endpoints or UI if equivalents already exist.
After each logical increment, run relevant tests/typecheck/lint and commit to feature/core-commerce-foundation.
Do not merge to main unless explicitly instructed.
Update CRM-DEVELOPMENT-ROADMAP.md when a phase, architectural decision or major task materially changes.
```

This protocol is intentionally stored in the repository so the CRM development process can continue across separate conversations without relying on chat memory.

---

# 25. Roadmap Maintenance Rules

This file is a living roadmap.

When implementation progresses:

- mark materially completed items clearly
- record major architectural decisions
- do not delete historical decisions without explanation
- add references to migrations/endpoints/modules when useful
- update the current phase
- keep deferred scope explicit
- do not treat roadmap text as proof that code exists; always verify repository state

The repository is the source of truth for implementation; this document is the source of truth for CRM development direction.