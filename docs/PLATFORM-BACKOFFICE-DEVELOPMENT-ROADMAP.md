# Platform Backoffice & Command Center Development Roadmap

## 1. Purpose

This document defines the target architecture and implementation roadmap for the Beauty ERP platform-owner backoffice.

This is **not** another tenant Settings page and is **not** the customer-facing ERP Administration module.

It is the internal control plane used by the SaaS owner and authorized internal departments to operate the Beauty ERP business and platform itself.

Target users include:

- Founder / Platform Owner
- Platform Administrators
- Sales
- Sales Management
- Marketing
- Customer Success
- Support L1/L2
- Technical Support
- Engineering
- SRE / Platform Operations
- Product
- Platform Finance / Billing
- Security / Compliance

Core target:

> Provide complete platform management capability with strict privileged-access controls, full auditability, safe operational workflows and clear separation from customer tenant administration.

Repository: `kaanb-wiascode/beauty`

Development branch: `feature/core-commerce-foundation`

Do not merge or push to `main` unless explicitly instructed.

---

## 2. Fundamental Architectural Separation

The product must distinguish two control planes:

```text
BEAUTY ERP PLATFORM
│
├── CUSTOMER APPLICATION
│   └── Tenant businesses operate their own companies/branches
│
└── PLATFORM BACKOFFICE
    └── Beauty ERP internal teams operate the SaaS platform
```

A tenant Owner is not a Platform Operator.

A platform employee must not receive platform authority merely by being assigned a powerful tenant role.

Platform authorization and tenant authorization must be separated conceptually and technically.

---

## 3. Target Application Boundary

Preferred architecture is a separately protected internal frontend surface, for example:

```text
apps/
├── web
│   └── Customer ERP
├── api
└── platform-admin
    └── Internal Platform Backoffice
```

The exact monorepo structure must be decided after inspecting the current workspace and deployment architecture.

A separate frontend does not necessarily require an entirely separate backend, but platform APIs must have explicit platform-level authentication/authorization boundaries and must never be exposed merely through tenant permissions.

Customer tenant users must not be able to access the platform backoffice through route guessing, role manipulation or tenant-admin privileges.

---

## 4. Platform Command Center

The Platform Owner should enter a Command Center showing the commercial, customer and technical state of the entire SaaS business.

Potential headline metrics:

- MRR
- ARR
- active customers/tenants
- trials
- onboarding customers
- active users
- new MRR
- expansion MRR
- contraction MRR
- churned MRR
- logo churn
- revenue churn
- NRR
- failed payments
- customer health distribution
- open P1/P2 support cases
- active platform incidents
- failed jobs/webhooks
- degraded integrations

Example conceptual layout:

```text
┌─────────────────────────────────────────────────────────────┐
│ PLATFORM COMMAND CENTER                         ● HEALTHY    │
├─────────────────────────────────────────────────────────────┤
│ MRR        ARR       Customers   Active Users   Churn       │
├─────────────────────────────┬───────────────────────────────┤
│ CUSTOMER GROWTH             │ PLATFORM HEALTH               │
│ New / Trial / Churn         │ API / DB / Jobs / Providers  │
├─────────────────────────────┼───────────────────────────────┤
│ SALES PIPELINE              │ CUSTOMER HEALTH               │
│ Leads / Opps / Won          │ Healthy / Risk / Critical    │
├─────────────────────────────┴───────────────────────────────┤
│ Critical Incidents / Billing / Failed Jobs / Integrations  │
└─────────────────────────────────────────────────────────────┘
```

The Command Center should be exception-driven, not merely KPI-driven.

It should answer:

> What requires attention now?

---

## 5. Platform Alert / Exception Center

Aggregate actionable exceptions from internal platform domains:

- critical incidents
- tenant outages/degradation
- failed provisioning
- failed billing
- failed renewals
- failed jobs
- dead-letter webhooks
- integration degradation
- onboarding blocked
- SLA breaches
- high churn-risk accounts
- unusual entitlement overrides
- expiring contracts
- temporary privileged access
- security events

Every alert should link to its source entity and valid next actions.

---

## 6. Customer / Tenant 360

This is one of the central platform screens.

Each customer/tenant should expose a complete internal operational view.

Potential header information:

- Customer/Tenant ID
- Display name
- Legal/customer account name
- Lifecycle status
- Plan
- MRR/ARR
- Companies
- Branches
- Users
- Created date
- Go-live date
- Last activity
- Account owner
- Customer Success owner
- Health score
- Billing status
- Contract renewal date

Target tabs:

```text
Overview
Companies
Branches
Users
Subscription
Billing
Usage
Features
Integrations
Health
Onboarding
Support
Activity
Audit
Security
Data
Contracts
Internal Notes
```

This page should be the primary cross-department account context.

---

## 7. Tenant Lifecycle

A tenant needs a SaaS/customer lifecycle distinct from internal ERP operational statuses.

Potential lifecycle:

```text
LEAD
TRIAL
ONBOARDING
ACTIVE
PAST_DUE
RESTRICTED
SUSPENDED
CHURNING
CHURNED
ARCHIVED
```

Do not finalize statuses before inspecting existing Tenant/Subscription models.

Target commercial journey:

```text
Lead
 ↓
Demo
 ↓
Trial
 ↓
Contract
 ↓
Tenant Provisioning
 ↓
Onboarding
 ↓
Go Live
 ↓
Active
 ↓
Renewal / Expansion
```

Lifecycle transitions should be explicit and audited.

---

## 8. Tenant Provisioning

Sales-to-customer activation should not depend on manual database operations.

Target provisioning orchestration:

```text
Customer Won
 ↓
Tenant
 ↓
Subscription / Plan
 ↓
Entitlements
 ↓
Initial Company
 ↓
Initial Owner Invitation
 ↓
Default Roles / Policies
 ↓
Default Configuration
 ↓
Onboarding
```

Provisioning requirements:

- idempotent
- resumable
- auditable
- failure-aware
- safe against duplicate tenant/company/user creation
- no plaintext credential generation
- clear provisioning status

Potential states:

```text
QUEUED
PROVISIONING
PARTIALLY_READY
READY
FAILED
```

Failed provisioning should support controlled retry from the failed step.

---

## 9. Plan Catalog

Provide centrally managed commercial plans.

Example capabilities:

| Capability | Starter | Pro | Enterprise |
|---|---:|---:|---:|
| Branches | 1 | 5 | Contract |
| Users | 10 | 50 | Contract |
| CRM | Yes | Yes | Yes |
| Finance | Basic | Yes | Yes |
| HR | No | Yes | Yes |
| Marketing | No | Yes | Yes |
| Advanced Reporting | No | Yes | Yes |
| API | No | Optional | Yes |
| AI | Limited | Yes | Contract |

The actual commercial catalog must be configurable rather than scattered through frontend/backend conditionals.

---

## 10. Subscription vs Plan Catalog

Plan Catalog and Customer Subscription are different concepts.

Changing a catalog price must not silently rewrite existing contractual customer pricing.

Conceptual model:

```text
Plan Catalog
   ↓
Plan Version / Price
   ↓
Customer Subscription
   ↓
Contracted Price / Discount / Terms
```

Historical pricing must remain explainable.

---

## 11. Entitlement Engine

Entitlement answers:

> Does this tenant have access to this purchased capability?

Example:

```text
crm.enabled = true
finance.enabled = true
hr.enabled = true
marketing.enabled = false
branches.limit = 5
users.limit = 50
ai.monthlyCredits = 10000
storage.limit = 100GB
```

Entitlements must be separate from tenant user permissions.

```text
Entitlement = tenant purchased/received the feature.
Permission  = a tenant user is authorized to use the feature.
```

Support:

- plan-derived entitlements
- contract-specific limits
- temporary overrides
- expiration
- audit
- reason
- actor

---

## 12. Entitlement Overrides

Authorized platform users may need to temporarily grant a capability.

Example:

> Enable Advanced Reporting for Tenant X for 30 days.

Override should contain:

- entitlement
- old/effective value
- new value
- start/end
- reason
- actor
- approval if required
- audit

Do not create permanent hidden exceptions without traceability.

---

## 13. Feature Flags

Feature flags are not entitlements.

Feature flag answers:

> Is this technical/product behavior enabled for this environment/cohort/tenant?

Example rollout:

```text
NEW_APPOINTMENT_ENGINE

Internal          ON
Alpha tenants     ON
Selected tenants  ON
10% rollout       ON
Production 100%   OFF
```

Target rollout progression:

```text
Internal
 ↓
Alpha
 ↓
Selected Tenants
 ↓
10%
 ↓
25%
 ↓
50%
 ↓
100%
```

High-risk rollout changes should require re-authentication and/or approval according to policy.

---

## 14. Platform Sales CRM

The platform requires an internal SaaS Sales CRM separate from the CRM sold to tenant customers.

Target pipeline:

```text
Lead
 ↓
Qualified
 ↓
Demo Scheduled
 ↓
Demo Completed
 ↓
Proposal
 ↓
Negotiation
 ↓
Contract
 ↓
Won
 ↓
Onboarding
```

Potential data:

- organization
- decision makers
- phone/email
- market segment
- branch count
- employee count
- estimated MRR
- source
- sales owner
- activities
- meetings
- demos
- proposal
- discount
- contract
- probability
- expected close
- loss reason

Do not automatically reuse tenant CRM tables if this would create unsafe coupling between platform commercial data and customer CRM data.

---

## 15. Lead → Customer Conversion

A won opportunity should support an explicit conversion workflow:

```text
Opportunity WON
      ↓
Contract / Commercial Terms
      ↓
Subscription
      ↓
Tenant Provisioning
      ↓
Owner Invitation
      ↓
Customer Success Handoff
      ↓
Onboarding
```

The operation must be idempotent and must not create duplicate tenants/subscriptions.

---

## 16. Platform Marketing

Internal Marketing should manage Beauty ERP acquisition, not tenant marketing campaigns.

Potential areas:

- campaigns
- acquisition sources
- UTM tracking
- landing pages/forms references
- events/webinars
- content
- paid media normalization
- lead generation
- attribution
- CAC
- LTV
- ROAS
- pipeline revenue

Target attribution chain:

```text
Campaign / Source
      ↓
Lead
      ↓
Demo
      ↓
Opportunity
      ↓
Customer
      ↓
MRR / ARR
```

---

## 17. Marketing Attribution

Potential source taxonomy:

- Google Ads
- Meta Ads
- Organic
- Referral
- Partner
- Event
- Outbound
- Direct
- Influencer
- Other

Metrics:

- CPL
- MQL/SQL rate where used
- demo rate
- win rate
- CAC
- new MRR
- ARR
- LTV
- LTV:CAC
- CAC payback period
- ROAS
- pipeline revenue

Attribution rules must be explicit and versioned if changed.

---

## 18. Customer Success

Create an internal Customer Success bounded context.

Primary responsibilities:

- onboarding
- adoption
- health score
- customer portfolio
- renewals
- expansion opportunities
- churn risk
- success plans
- customer touchpoints

Customer Success should consume product usage, billing, support and commercial signals without becoming their source of truth.

---

## 19. Customer Health Score

Start deterministic before introducing AI.

Example components:

```text
Usage
Engagement
Billing
Support
Adoption
Renewal proximity
```

Example:

```text
Health Score: 82/100

Usage       90
Engagement  88
Billing     100
Support      72
Adoption     61
```

Weights and thresholds should be configurable/versioned.

Health score must be explainable.

---

## 20. Product Adoption

Track tenant usage of major modules and workflows.

Example:

```text
Appointments       96%
CRM                81%
Finance             74%
HR                  22%
Training             4%
Marketing            0%
```

Possible adoption dimensions:

- enabled vs actually used
- active users by module
- workflow completion
- frequency
- recency
- depth

Use this to drive Customer Success actions and expansion opportunities.

---

## 21. Churn Risk

Initial churn risk should use explainable deterministic signals such as:

- login activity decreasing
- appointment/business activity decreasing
- usage decreasing
- unresolved support issues increasing
- payment delays
- module adoption falling
- low NPS/CSAT
- renewal approaching without engagement

Result example:

```text
Risk: HIGH
Reasons:
- Usage -38% in 30 days
- 2 unresolved P2 tickets
- Invoice overdue 12 days
```

Later AI may assist, but must not hide the underlying signals.

---

## 22. Onboarding Center

Target customer onboarding journey:

```text
Contract Signed
      ↓
Tenant Created
      ↓
Company Configured
      ↓
Branches Imported
      ↓
Users Invited
      ↓
Customers Imported
      ↓
Services Configured
      ↓
Finance Configured
      ↓
Training
      ↓
Go Live
```

Each customer should have an onboarding progress view.

Example:

```text
Onboarding: 74%

✓ Tenant
✓ Company
✓ Branches
✓ Users
✓ Customers
✓ Services
○ Finance
○ Training
○ Go Live
```

Support dependencies, blockers, owner, target date and completion evidence where needed.

---

## 23. Support Center

Create a central internal support desk tied to Tenant 360.

Potential ticket states:

```text
NEW
OPEN
WAITING_CUSTOMER
WAITING_ENGINEERING
RESOLVED
CLOSED
```

Priority:

```text
P1 CRITICAL
P2 HIGH
P3 NORMAL
P4 LOW
```

Potential fields:

- tenant
- requester
- category
- module
- priority
- SLA
- assigned team/user
- status
- messages/activity
- engineering escalation
- related incident
- support session
- resolution

---

## 24. Support SLA

Support should support SLA timers such as:

- first response
- next response
- resolution target
- customer waiting vs internal waiting
- breached/at-risk

SLA policy may depend on customer plan/contract.

---

## 25. Privileged Support Access

Do not implement unrestricted invisible impersonation.

Use a controlled Support Session.

Example:

```text
Tenant
Target User / Context
Reason
Ticket
Requested Scope
Duration
Actor
Approval if required
```

During a support session the UI should visibly show:

```text
SUPPORT MODE
Tenant: Barones
Reason: Ticket #1842
Expires: 17:30
```

Audit must preserve:

```text
PlatformOperator
ActingInTenant
SupportSession
Reason
OriginalActor
Action
```

Sensitive areas such as payroll, finance, banking, identity or health/clinical data may require additional elevation or remain inaccessible depending on policy.

---

## 26. View as Customer

Provide a safer read-only troubleshooting capability before broad write impersonation.

`View as Tenant` should allow authorized support/product users to see the tenant-facing experience while preventing mutations unless a separate support elevation is granted.

Every use must be audited.

---

## 27. Platform IAM

Platform staff authorization must be separate from tenant RBAC.

Potential internal roles:

- Founder / Platform Owner
- Platform Admin
- Sales
- Sales Manager
- Marketing
- Customer Success
- Support L1
- Support L2
- Engineering
- SRE
- Platform Finance
- Security
- Product
- Auditor

Target model:

```text
PlatformUser
 → PlatformRole
 → PlatformPermission
 → PlatformScope / Environment / Department
```

Never derive platform access from Tenant Membership.

---

## 28. Privileged Access Management

Even the strongest platform account should not use an unrestricted permanent god mode for every action.

High-risk operations should support combinations of:

- MFA
- recent re-authentication
- explicit reason
- time-bound elevation
- approval
- audit
- notification

Examples:

- tenant data export
- tenant support write access
- billing correction
- subscription override
- mass tenant action
- tenant purge
- feature rollout to 100%
- credential rotation
- privileged security configuration

This provides complete management capability without sacrificing accountability or safety.

---

## 29. Platform Finance / SaaS Billing

This domain manages Beauty ERP's commercial relationship with SaaS customers, not the customers' own accounting.

Target areas:

- subscriptions
- invoices
- payments
- failed payments
- refunds
- credits
- discounts
- usage charges
- outstanding receivables
- MRR
- ARR
- new MRR
- expansion MRR
- contraction MRR
- churned MRR
- NRR

Do not mix platform SaaS invoices with tenant accounting invoices.

---

## 30. Contract Management

Enterprise customer contracts may require:

- contract identifier
- plan
- contracted price
- discount
- start date
- renewal date
- billing cycle
- user limits
- branch limits
- custom entitlements
- SLA
- commercial notes
- document references
- status

Contract amendments should preserve history.

---

## 31. Usage & Metering

Prepare for measurable consumption such as:

- users
- branches
- storage
- API calls
- AI credits
- messages
- exports
- automation runs
- integration usage

Metering requirements:

- tenant-scoped
- idempotent aggregation
- auditable source where billing-relevant
- period-based
- quota/limit support
- anomaly detection later

---

## 32. Product Analytics

Platform Owner/Product teams should see how customers actually use Beauty ERP.

Metrics may include:

- DAU
- WAU
- MAU
- tenant activity
- feature adoption
- feature retention
- workflow completion
- workflow drop-off
- module adoption
- cohort retention
- activation time
- onboarding-to-value time

Analytics should respect privacy and avoid unnecessary exposure of customer content.

---

## 33. Feedback & Product Requests

Create structured internal product feedback linked to tenants.

Potential types:

- Feature Request
- Product Feedback
- NPS
- CSAT
- Bug Report
- Idea

Useful prioritization context:

- requesting tenant count
- requesting ARR/MRR
- plan segment
- churn/renewal impact
- strategic segment
- module

Example insight:

> Customers requesting Feature X represent ₺8.4M ARR.

Do not automatically prioritize solely by ARR; this is decision support.

---

## 34. Technical Operations Center

Provide an internal SRE/technical cockpit.

Potential monitored capabilities:

- API
- database
- Redis/cache
- queues
- workers
- scheduled jobs
- webhooks
- email
- SMS
- WhatsApp
- payment providers
- banking integrations
- storage
- exports/imports
- external dependencies

Example state:

```text
API             HEALTHY
Database        HEALTHY
Redis           HEALTHY
Queue           DEGRADED
WhatsApp        HEALTHY
SMS             DEGRADED
Email           HEALTHY
```

Prefer integration with real observability systems rather than manually maintained fake health indicators.

---

## 35. Tenant Technical Health

Tenant 360 should include a tenant-scoped technical view:

- API/error rate relevant to tenant
- failed jobs
- failed webhooks
- integration errors
- last successful synchronization
- storage usage
- recent technical incidents
- export/import failures

This allows support to isolate tenant-specific issues quickly.

---

## 36. Background Job Center

Target job visibility:

```text
Job
Tenant
Type
Status
Attempts
Duration
Created
Started
Finished
Error Category
Correlation ID
```

Potential actions:

- inspect
- retry when safe
- cancel where supported
- dead-letter / quarantine

Never expose secret payload values.

Retry must be idempotent or explicitly protected from duplicate side effects.

---

## 37. Webhook Center

Central webhook observability for platform integrations.

Potential fields:

- provider
- tenant
- event
- external event ID
- receivedAt
- processedAt
- status
- attempts
- correlation ID
- error

Actions:

- inspect redacted payload
- retry
- dead-letter

Sensitive payload fields must be redacted based on provider/domain policy.

---

## 38. Incident Management

Create structured platform incident management.

Example:

```text
INC-2026-0014
Payment processing delays
Severity: SEV-1
Affected tenants: 428
Status: INVESTIGATING
```

Lifecycle:

```text
DETECTED
INVESTIGATING
MITIGATING
MONITORING
RESOLVED
POSTMORTEM
```

Incident record should support:

- severity
- owner/commander
- affected services
- affected tenants/cohorts
- timeline
- internal notes
- customer communication references
- resolution
- postmortem/actions

---

## 39. Release / Deployment Visibility

Platform backoffice should show deployment/release state, but deployment facts should come from CI/CD/source control integrations.

Potential view:

```text
Production: v2.18.4
Staging:    v2.19.0-beta
Last deployment: 14 Sep 22:34
```

Potential capabilities:

- release notes
- environment
- commit/build reference
- deployment status
- feature flags associated with release
- incident correlation

Do not create an unsafe arbitrary production deployment button before deployment governance is designed.

---

## 40. Platform Audit Log

Platform audit is separate from tenant audit.

Examples:

```text
Platform user changed tenant plan
Pro → Enterprise
Tenant: X
Reason: Contract amendment
```

```text
Support user opened privileged tenant session
Tenant: X
Ticket: #1842
Duration: 30 min
```

Audit must cover:

- platform login/security events
- role/permission changes
- tenant lifecycle changes
- subscription/entitlement changes
- feature flag changes
- support access
- data exports
- billing corrections
- incident changes
- security changes
- destructive lifecycle actions

Audit should be immutable to ordinary platform users.

---

## 41. Global Search

Provide fast global search / command palette, potentially `⌘ K`.

Searchable entities may include:

- tenant/customer
- tenant ID
- company
- branch
- tenant user
- support ticket
- invoice
- contract
- incident
- sales opportunity
- onboarding account

Search results must respect platform permissions and sensitive-data policies.

---

## 42. Global Actions

Potential command palette actions:

- Create Tenant / Start Provisioning
- Invite Platform User
- Open Support Session
- Create Incident
- Create Announcement
- Grant Entitlement Override
- Suspend/Restrict Tenant
- Find Tenant User
- Find Invoice

Actions shown must be permission-filtered.

High-risk actions must not bypass normal confirmation/elevation flows simply because they were launched from a command palette.

---

## 43. Platform Announcements

Support targeted platform communication such as:

- maintenance
- release
- incident
- feature announcement
- policy notice

Potential targeting:

- all tenants
- plan
- selected tenants
- country/region
- feature users
- affected incident cohort

Communication should integrate with existing messaging/notification infrastructure where possible.

---

## 44. Maintenance Controls

Support carefully governed maintenance modes:

- global platform maintenance
- module/service maintenance
- selected tenant maintenance

Prefer graceful degradation over shutting down the entire ERP.

Maintenance changes require audit and, for high-impact changes, re-authentication/approval.

---

## 45. Data Operations

Technical teams may require controlled operations such as:

- imports
- exports
- migrations
- backfills
- reprocessing
- data repair jobs

Do not provide a generic unrestricted production SQL textbox as the normal backoffice mechanism.

Prefer typed, reviewed, audited operations with:

- operation type
- tenant scope
- dry run/preview where possible
- reason
- actor
- approval
- progress
- result
- rollback/recovery semantics where feasible

---

## 46. Tenant Data Export

Potential controlled lifecycle:

```text
Request Export
 ↓
Authorization / Approval
 ↓
Background Job
 ↓
Encrypted Artifact
 ↓
Expiring Access
 ↓
Audit
```

Data export must honor applicable tenant contracts, privacy/security requirements and field restrictions.

---

## 47. Tenant Suspension / Restriction

Do not model every billing/security issue as immediate full suspension.

Potential states:

```text
ACTIVE
PAST_DUE
RESTRICTED
SUSPENDED
```

Policy examples:

- PAST_DUE: warn, preserve service initially
- RESTRICTED: restrict selected write/commercial capabilities
- SUSPENDED: block normal tenant use according to policy

Exact behavior must be configurable and legally/commercially reviewed.

Avoid accidental operational shutdown of customer businesses.

---

## 48. Tenant Termination / Retention / Purge

Avoid a simple destructive `DELETE TENANT` action.

Target lifecycle:

```text
Suspend
 ↓
Terminate
 ↓
Retention Period
 ↓
Archive
 ↓
Eligible for Purge
 ↓
Approved Purge
```

Financial, employment, legal, audit or other regulated data may have separate retention requirements.

Verify current legal obligations before implementing purge policies.

---

## 49. Platform Security Center

Target internal security view:

- platform admins
- MFA coverage
- privileged accounts
- active support sessions
- active elevated sessions
- failed logins
- suspicious sessions
- role/permission changes
- API/integration credentials metadata
- security events
- expiring temporary access

Security Center should emphasize exceptions and remediation.

---

## 50. Secrets and Credentials

Backoffice may manage credential lifecycle metadata, but must never display or store secrets casually.

Safe UI example:

```text
Credential: ••••••••••
Created: 12 Sep
Last used: 2 min ago
Actions: Rotate / Revoke
```

Requirements:

- no plaintext secrets in ordinary database columns
- no secrets in logs
- no secrets in audit before/after payloads
- masked identifiers
- secure secret storage
- least-privilege access
- rotation/revocation

---

## 51. Internal Work Queue / Handoffs

Provide a lightweight cross-department work queue for SaaS operations.

Examples:

```text
Sales Won
  ↓
Finance / Contract Check
  ↓
Provisioning
  ↓
Customer Success Onboarding
  ↓
Technical Data Import
  ↓
Go Live
```

Do not build a generic project-management replacement unless separately required.

Work items should link to source entities and owners.

---

## 52. Department Cockpits

The same platform should expose role-specific home views.

### Founder / Platform Owner

- revenue
- growth
- churn
- customer health
- sales
- product adoption
- platform health
- incidents
- security exceptions

### Sales

- leads
- pipeline
- demos
- deals
- new MRR
- targets
- activity

### Marketing

- campaigns
- spend
- leads
- CAC
- attribution
- pipeline revenue
- acquisition trends

### Customer Success

- onboarding
- portfolio
- health scores
- adoption
- renewals
- expansion
- churn risk

### Support

- ticket queue
- SLA
- customer context
- support sessions
- incidents
- escalations

### Technical / SRE

- platform health
- errors
- jobs
- queues
- webhooks
- integrations
- deployments
- incidents

### Platform Finance

- subscriptions
- invoices
- failed payments
- receivables
- MRR/ARR
- revenue movement

---

## 53. Target Navigation

```text
PLATFORM

COMMAND
├─ Command Center
├─ Alerts
├─ Global Search
└─ Activity

CUSTOMERS
├─ Customers / Tenants
├─ Companies
├─ Branches
├─ Users
├─ Onboarding
├─ Customer Health
└─ Churn

SALES
├─ Leads
├─ Pipeline
├─ Demos
├─ Opportunities
├─ Proposals
├─ Contracts
└─ Sales Analytics

MARKETING
├─ Campaigns
├─ Acquisition
├─ Attribution
├─ Content
├─ Events
└─ Marketing Analytics

CUSTOMER SUCCESS
├─ Portfolio
├─ Onboarding
├─ Adoption
├─ Health Scores
├─ Renewals
└─ Churn Risk

SUPPORT
├─ Tickets
├─ SLA
├─ Support Sessions
├─ Customer Activity
└─ Knowledge Base

BILLING
├─ Plans
├─ Subscriptions
├─ Invoices
├─ Payments
├─ Credits
├─ Usage
└─ Revenue Analytics

PRODUCT
├─ Features
├─ Entitlements
├─ Feature Flags
├─ Rollouts
├─ Product Analytics
├─ Feedback
└─ Releases

TECHNICAL
├─ Platform Health
├─ Services
├─ Jobs
├─ Queues
├─ Webhooks
├─ Integrations
├─ Data Operations
└─ Incidents

COMMUNICATION
├─ Announcements
├─ Maintenance
├─ Notifications
└─ Status Communications

SECURITY
├─ Platform Users
├─ Roles
├─ Privileged Access
├─ Support Access
├─ Sessions
├─ Audit Logs
└─ Security Events

SYSTEM
├─ Global Configuration
├─ Countries
├─ Currencies
├─ Localization
├─ Templates
├─ Limits
└─ System Policies
```

This is a target information architecture, not a requirement to create every page immediately.

---

## 54. Platform Owner Control Model

“100% control” should mean complete management capability, not an unaudited god mode.

Target:

```text
                    PLATFORM OWNER
                           │
             ┌─────────────┼─────────────┐
             ↓             ↓             ↓
         BUSINESS       PRODUCT       TECHNICAL
         CONTROL        CONTROL        CONTROL
             │             │             │
      Sales/Billing    Features      Health/Jobs
      Customers        Rollouts      Incidents
      Contracts        Entitlement   Integrations
             │             │             │
             └─────────────┼─────────────┘
                           ↓
                    SECURITY CONTROL
                           ↓
                 AUDIT / APPROVAL / MFA
                           ↓
                     TENANT PLATFORM
```

The owner can ultimately authorize every legitimate platform operation, while sensitive actions remain authenticated, attributable and recoverable.

---

## 55. Separation of Duties

Some platform operations should support SoD.

Examples:

- salesperson cannot unilaterally grant arbitrary permanent entitlements beyond commercial policy
- support cannot change billing contracts
- marketing cannot access sensitive tenant operational data by default
- platform finance cannot silently modify tenant production records
- engineering support access should be time-bound/audited
- tenant purge may require multiple approvals

SoD policies should evolve with organizational scale.

---

## 56. Environment Separation

Platform backoffice must understand environments such as:

- local/development
- staging
- production

Production privileged actions should have stronger controls than non-production.

Do not allow staging/test identities or credentials to silently gain production access.

---

## 57. Cross-Domain Event Model

Potential platform events:

```text
PLATFORM_LEAD_CREATED
PLATFORM_OPPORTUNITY_WON
TENANT_PROVISIONING_STARTED
TENANT_PROVISIONING_COMPLETED
TENANT_PROVISIONING_FAILED
SUBSCRIPTION_CREATED
SUBSCRIPTION_CHANGED
ENTITLEMENT_OVERRIDDEN
FEATURE_FLAG_CHANGED
TENANT_RESTRICTED
TENANT_SUSPENDED
TENANT_TERMINATED
CUSTOMER_HEALTH_CHANGED
CHURN_RISK_CHANGED
SUPPORT_TICKET_CREATED
SUPPORT_SESSION_STARTED
SUPPORT_SESSION_ENDED
PLATFORM_INCIDENT_CREATED
PLATFORM_INCIDENT_RESOLVED
PLATFORM_USER_ROLE_CHANGED
TENANT_DATA_EXPORT_REQUESTED
TENANT_DATA_EXPORT_READY
```

Events must carry safe identifiers/correlation context and avoid secrets.

---

## 58. Security Requirements

Minimum requirements:

- platform IAM separate from tenant IAM
- MFA for privileged platform users
- backend-enforced platform permissions
- environment-aware access
- tenant scope checks on every tenant-targeted platform action
- explicit privileged support sessions
- re-authentication for selected high-risk operations
- immutable platform audit
- no plaintext secrets
- no arbitrary hidden impersonation
- least privilege
- rate limits/abuse protection where applicable
- CSRF/session protections according to auth architecture
- secure session termination
- last-owner/platform-recovery protections

---

## 59. Privacy Requirements

Platform operators should not automatically see all tenant customer/employee content merely because they work for the SaaS provider.

Use least privilege and purpose limitation.

Sensitive categories may require stronger controls:

- payroll/compensation
- banking/payment data
- identity data
- health/clinical data
- employee disciplinary/case data
- private communications

Support troubleshooting should prefer metadata and technical diagnostics before content access.

Legal requirements must be verified from current official sources during implementation.

---

## 60. Audit Requirements

Every high-impact platform mutation should answer:

- who
- when
- what
- target tenant/entity
- old/new state where safe
- why/reason
- support ticket/change request if applicable
- approval/elevation context
- correlation ID

Audit records must redact secrets and unnecessary sensitive content.

---

## 61. Observability Requirements

The backoffice should consume real observability data where available.

Important dimensions:

- environment
- service
- tenant
- provider
- correlation/request ID
- deployment/release
- error category
- latency
- job/webhook status

Do not make the backoffice the only observability system. Integrate with dedicated telemetry/logging/metrics infrastructure.

---

## 62. Performance and Scale

The platform backoffice will aggregate across all tenants, so queries must not perform naïve full-tenant scans.

Design for:

- dedicated platform read models
- aggregate tables/materialized views where justified
- asynchronous analytics
- paginated tenant/user/ticket lists
- indexed lifecycle/status fields
- tenant-scoped technical aggregates
- background exports
- bounded global search

Never compromise tenant isolation for aggregate convenience.

---

## 63. Recommended Development Phases

### Phase 1 — Platform IAM & Backoffice Foundation (P0)

Goal: create a secure internal application boundary.

Deliverables:

- inspect existing monorepo/auth/tenant architecture
- platform user identity model or compatible internal identity layer
- platform roles/permissions
- MFA/re-auth requirements design
- separate protected platform-admin frontend surface
- platform audit foundation
- basic Command Center shell
- Customers/Tenants list
- Tenant 360 foundation

Do not begin with broad impersonation.

### Phase 2 — Subscription, Entitlements & Tenant Lifecycle (P0)

Deliverables:

- inspect existing subscription/billing/entitlement code
- tenant lifecycle
- plan catalog
- subscription model
- entitlement engine
- entitlement overrides
- tenant restriction/suspension policy
- customer commercial summary
- audit

This is one of the highest-priority SaaS foundation phases.

### Phase 3 — Provisioning & Onboarding (P0/P1)

Deliverables:

- idempotent tenant provisioning
- owner invitation
- default company/configuration
- provisioning state/retry
- onboarding projects/checklists
- go-live readiness
- Sales → Customer Success handoff

### Phase 4 — Platform Sales & Marketing (P1)

Deliverables:

- internal Sales CRM
- leads
- demos
- opportunities
- proposals/contracts foundation
- won → customer conversion
- acquisition sources
- campaign attribution
- CAC/pipeline revenue analytics

### Phase 5 — Customer Success & Support (P1)

Deliverables:

- health score
- adoption
- churn risk
- renewals
- support tickets
- SLA
- Tenant 360 support context
- read-only View as Tenant
- controlled Support Sessions

### Phase 6 — Billing & Usage (P1)

Deliverables:

- SaaS invoices/payments integration
- failed payment workflows
- credits/discounts
- metering
- usage limits
- MRR/ARR movement
- NRR
- receivables

### Phase 7 — Product Control (P1/P2)

Deliverables:

- feature catalog
- feature flags
- staged rollouts
- product analytics
- feedback/feature requests
- release visibility
- tenant cohorts

### Phase 8 — Technical Operations (P1/P2)

Deliverables:

- platform health
- tenant technical health
- job center
- webhook center
- provider/integration health
- incident management
- data operations
- deployment/release correlation

### Phase 9 — Advanced Security & Governance (P2)

Deliverables:

- privileged access workflows
- access elevation
- advanced SoD
- security center
- access reviews
- tenant data export governance
- termination/retention/purge workflows
- administrative risk analytics

### Phase 10 — Platform Intelligence (P3)

Only after reliable data exists:

- predictive churn
- expansion recommendations
- incident anomaly detection
- support routing suggestions
- sales forecasting
- marketing optimization
- tenant health explanations
- operational assistant for Platform Owner

AI must not bypass deterministic authorization, billing, security, support-access or lifecycle policies.

---

## 64. Recommended Immediate Implementation Order

1. Inspect current Tenant, Membership, Subscription/Billing and auth architecture.
2. Verify whether any internal/super-admin concepts already exist.
3. Define hard boundary between tenant IAM and platform IAM.
4. Establish platform audit model/events.
5. Create protected `platform-admin` application shell only after architecture review.
6. Build Customers/Tenants list and Tenant 360 read model.
7. Implement tenant lifecycle and entitlement foundation.
8. Implement safe tenant provisioning.
9. Add onboarding and Customer Success handoff.
10. Add Platform Sales CRM.
11. Add Support and read-only tenant troubleshooting.
12. Add controlled privileged Support Sessions.
13. Add feature flags/product controls.
14. Add technical operations/incident surfaces.
15. Expand advanced governance last.

Do not build a cosmetic “super admin dashboard” that directly mutates production tables without domain services, authorization and audit.

---

## 65. Testing Strategy

### Platform IAM

- tenant user cannot authenticate/access platform-admin
- platform role permission tests
- revoked platform access takes effect
- MFA/elevation policy
- environment separation

### Tenant targeting

- correct tenant resolution
- no accidental cross-tenant mutation
- support session constrained to approved tenant/scope
- read-only view cannot mutate

### Provisioning

- duplicate retry does not duplicate tenant
- partial failure resumes safely
- owner invitation idempotency
- entitlement provisioning consistency

### Billing / Entitlements

- plan changes
- contract pricing history
- entitlement overrides/expiry
- limit enforcement
- suspension/restriction behavior

### Feature flags

- tenant/cohort rollout
- percentage rollout stability
- emergency disable
- audit

### Support

- ticket SLA
- support session start/end/expiry
- privileged action audit
- sensitive-area restrictions

### Technical operations

- job retry idempotency
- webhook retry idempotency
- redaction
- incident lifecycle

### Security

- privilege escalation attempts
- route/API probing by tenant users
- expired elevation
- audit completeness
- secrets absent from logs/audit

---

## 66. Definition of Done

A platform backoffice capability is not complete unless, as applicable:

- platform IAM authorization is backend-enforced
- tenant targeting is explicit and safe
- tenant IAM cannot reach platform capability
- high-risk operations require appropriate elevation
- audit records are emitted
- secrets/sensitive values are redacted
- idempotency exists for retryable workflows
- concurrency is handled for mutable commercial/security state
- frontend provides loading/empty/error/permission states
- cross-tenant and privilege tests exist
- relevant tests/typecheck/lint pass
- roadmap is updated
- changes are committed to `feature/core-commerce-foundation`

Do not merge to `main` unless explicitly instructed.

---

## 67. Development Rules

When implementing this roadmap:

- inspect current code before creating any model/service/endpoint/app
- do not recreate existing subscription, tenant, audit, CRM, billing or support infrastructure without verification
- preserve strict tenant isolation
- platform access must be stronger than tenant Owner access, not merely another tenant role
- use domain services/business actions rather than direct arbitrary production mutations
- avoid unrestricted SQL/data consoles
- privileged support access must be explicit and audited
- never expose secrets/API credentials/plaintext passwords
- do not collect internet-banking credentials
- use idempotency for provisioning, billing, retries and conversions
- preserve accounting integrity for SaaS billing
- preserve historical commercial terms
- prefer incremental migrations
- Marketplace / Supplier Marketplace remains out of scope unless explicitly requested
- update this document when major architectural decisions or phases change

---

## 68. Continuation Protocol

Use the following prompt when continuing this work in a new conversation:

```text
Repository: kaanb-wiascode/beauty
Branch: feature/core-commerce-foundation

Read /docs/PLATFORM-BACKOFFICE-DEVELOPMENT-ROADMAP.md first.
Then inspect the current monorepo, Tenant/Membership/auth architecture, subscription/billing/entitlement code, audit infrastructure, Prisma schema/migrations, frontend apps and recent commits.
Do not assume roadmap items are incomplete; verify them against the repository.
The Platform Backoffice is an internal SaaS control plane and must remain architecturally separate from customer tenant Administration/RBAC.
A tenant Owner must never gain platform privileges merely through tenant permissions.
Continue from the first incomplete item in the current roadmap phase.
Preserve tenant isolation, platform authorization, privileged-access controls, auditability, idempotency, concurrency and commercial/accounting integrity.
Do not create duplicate models, migrations, services, endpoints or UI if equivalents already exist.
Do not implement unrestricted invisible impersonation; use audited read-only tenant view and controlled support sessions/elevation.
Do not expose plaintext secrets or credentials.
Marketplace and Supplier Marketplace remain out of scope unless explicitly requested.
After each logical increment run relevant tests/typecheck/lint, commit to feature/core-commerce-foundation, and update this roadmap when material progress or architecture changes.
Do not merge/push to main unless explicitly instructed.
```

Short form:

```text
kaanb-wiascode/beauty reposunda feature/core-commerce-foundation branch'ine eriş. Önce /docs/PLATFORM-BACKOFFICE-DEVELOPMENT-ROADMAP.md dosyasını oku. Mevcut Tenant, auth/RBAC, subscription/billing, entitlement, audit ve monorepo mimarisini kontrol et; Platform Backoffice'i müşteri tenant yönetiminden kesin olarak ayrı tut; ilk tamamlanmamış roadmap maddesinden geliştirmeye devam et. Tenant Owner platform yetkisi kazanamaz. Privileged support access açık, süreli ve auditli olmalı; unrestricted impersonation/SQL console yapma; tenant izolasyonu, idempotency, concurrency, audit ve finansal bütünlüğü koru; Marketplace kapsam dışı; main'e merge/push yapma.
```

---

## 69. Strategic End State

Target architecture:

```text
                       BEAUTY ERP PLATFORM
                               │
                 ┌─────────────┴─────────────┐
                 │                           │
          PLATFORM CONTROL              TENANT ERP
                 │                           │
   ┌─────────────┼─────────────┐             │
   │             │             │             │
Business       Product      Technical    Tenant Admin
Control        Control       Control      & Operations
   │             │             │             │
Sales         Features      Health       CRM
Marketing     Entitlements  Jobs         Finance
CS            Flags         Webhooks     HR
Billing       Rollouts      Incidents    Operations
Contracts     Analytics     Integrations Reporting
   │             │             │             │
   └─────────────┼─────────────┘             │
                 ↓                           │
        SECURITY / PRIVILEGED ACCESS         │
                 ↓                           │
          PLATFORM AUDIT / IAM               │
                 └─────────────┬─────────────┘
                               ↓
                     SHARED DOMAIN PLATFORM
```

The Platform Backoffice should ultimately allow the Beauty ERP organization to answer, from one governed system:

> Which customers do we have, what did they buy, what do they use, are they healthy, what do they owe, what needs support, which features are enabled, what is failing technically, who changed what, and what requires action right now?

That is the intended meaning of a platform-level Maestro / Command Center.
