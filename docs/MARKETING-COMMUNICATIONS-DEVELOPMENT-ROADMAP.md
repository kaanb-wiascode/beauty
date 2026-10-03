# Marketing & Communications Development Roadmap

> Canonical development and continuation guide for the Beauty ERP Marketing & Communications domain.
>
> Repository: `kaanb-wiascode/beauty`
> Development branch: `feature/core-commerce-foundation`
> Marketplace and Supplier Marketplace are out of scope unless explicitly requested.

## 1. Purpose

This document defines the target architecture, product boundaries, implementation priorities, integrity rules and phased development plan for the current Corporate Communications area.

The current implementation must not be discarded or recreated from scratch. Existing services, models, migrations, endpoints, permissions and UI must be inspected before every implementation step. The repository is the source of truth for implementation; this roadmap is the source of truth for product direction.

The target is not a simple social-media scheduler. The target is an integrated **Marketing & Communications operating system** connecting brand, content, campaigns, acquisition, CRM, appointments, sales, collections, finance, creators, agencies, PR and internal communications.

Target business chain:

```text
Marketing Spend / Campaign
        ↓
Content / Ads / Creator / PR
        ↓
Lead
        ↓
CRM
        ↓
Appointment
        ↓
Show-up
        ↓
Sale
        ↓
Collection
        ↓
Revenue Attribution / ROI / ROAS
```

---

## 2. Current Repository Baseline

### Backend

Representative implementation under:

`apps/api/src/modules/corporate-communications`

Current services include:

- corporate communications core
- campaign management
- marketing lead acquisition
- routing rules
- content operations
- content approvals
- brand governance
- digital assets
- creators / influencer collaborations
- marketing vendors / agencies
- PR and media activities
- provider connections
- marketing expense sync
- marketing-finance handoff
- marketing lead → CRM bridge
- marketing lead → customer bridge
- marketing lead → appointment bridge

### Frontend

Current routes under:

`apps/web/app/(app)/communications`

include:

- overview
- campaigns
- leads
- routing
- content
- approvals
- brand
- assets
- creators
- vendors
- PR / media
- integrations

### Existing strengths

The existing implementation already provides meaningful foundations:

- campaign objectives and lifecycle
- planned budget / spend
- service and branch association
- marketing provider attribution fields
- UTM / external campaign / ad identifiers
- marketing lead routing
- CRM / customer / appointment bridges
- multi-platform content lifecycle
- content review and approval
- schedule and publish states
- brand tone, phrase, hashtag, color, font, logo and content rules
- digital asset domain
- creator profiles and collaborations
- coupon-based creator attribution foundation
- marketing vendor contracts, payment models and KPI commitments
- PR activities including crisis communication
- marketing → finance integration foundation
- tenant permission guards and dedicated communications permissions

### Current maturity assessment

Approximate product maturity at roadmap creation:

| Area | Maturity |
|---|---:|
| Campaign foundation | 7/10 |
| Lead acquisition / routing | 8/10 |
| CRM bridge | 8/10 |
| Content lifecycle | 8/10 |
| Content authoring UX | 5/10 |
| Approval | 7/10 |
| Brand governance | 8/10 |
| Digital asset management | 6/10 |
| Social publishing | 4/10 |
| Paid media | 5/10 |
| Attribution | 6/10 |
| Creator / Influencer | 7/10 |
| Marketing vendors | 7/10 |
| PR | 6/10 |
| Media CRM | 2/10 |
| Crisis management | 3/10 |
| Internal communications | 1/10 |
| Events | 3/10 |
| Marketing requests | 1/10 |
| Content collaboration | 3/10 |
| Analytics | 5/10 |

The strongest problem is not lack of code; it is incomplete productization and blurred domain boundaries.

---

## 3. Target Domain Boundary

The current `Corporate Communications` area contains marketing, acquisition, content, brand, PR and partnerships. Product navigation and domain language should evolve toward:

```text
MARKETING & COMMUNICATIONS
│
├── Marketing
│   ├── Campaigns
│   ├── Paid Media
│   ├── Lead Acquisition
│   ├── Attribution
│   └── Performance
│
├── Content
│   ├── Content Studio
│   ├── Editorial Calendar
│   ├── Social Media
│   ├── Digital Assets
│   └── Approvals
│
├── Brand
│   ├── Brand Book
│   ├── Governance
│   ├── Templates
│   └── Compliance
│
├── PR & Reputation
│   ├── Media Relations
│   ├── Press
│   ├── Events
│   ├── Sponsorships
│   ├── Crisis
│   └── Reputation
│
├── Partnerships
│   ├── Creators
│   ├── Influencers
│   ├── Agencies
│   └── Vendors
│
└── Internal Communications
    ├── Announcements
    ├── Company News
    ├── Policies
    ├── Events
    └── Critical Notices
```

Do not perform a destructive namespace/module rename merely to match this taxonomy. Product naming can evolve incrementally while preserving compatibility.

---

## 4. Core Product Principles

### 4.1 Campaign is a first-class business aggregate

A campaign should eventually connect:

```text
Campaign
├── Objective
├── Audience
├── Offer
├── Services / Packages
├── Companies / Branches
├── Budget
├── Channels
├── Content
├── Ads
├── Creators
├── PR
├── Landing Pages
├── Leads
├── Appointments
├── Show-ups
├── Sales
├── Collections
└── Revenue Attribution
```

### 4.2 Marketing metrics must terminate in business outcomes

Do not stop at impressions, clicks and leads.

Target funnel:

```text
Impression
→ Click
→ Lead
→ Qualified Lead
→ Appointment
→ Show-up
→ Sale
→ Invoice / Revenue
→ Collection
→ Refund-adjusted Revenue
```

### 4.3 Marketing spend is not attributed revenue

Keep separate:

- planned budget
- committed spend
- actual spend
- accrued cost
- paid cost
- attributed revenue
- collected revenue
- refunds

Finance remains the financial source of truth.

### 4.4 Brand governance must become executable governance

Brand rules must not remain passive documentation. They should progressively become deterministic and later AI-assisted validation rules.

### 4.5 Content is a workflow, not a text field

A content item is a production object with brief, variants, assets, collaboration, approvals, schedule, publishing and performance.

---

## 5. Content Studio

Build the existing content lifecycle into a real Content Studio.

### Common content fields

- title
- brief
- objective
- platform
- format
- campaign
- company / branch scope
- owner
- contributors
- target audience
- service / package
- offer
- copy
- CTA
- hashtags
- creative assets
- references
- metadata
- status
- approval policy
- scheduled time
- publication references
- performance

### Platform-specific content structures

#### Instagram / Facebook post

- headline
- caption
- CTA
- hashtags
- image / carousel

#### Reel / TikTok / short video

- hook
- script
- shot list
- caption
- CTA
- hashtags
- cover
- video asset

#### Story

- frames
- copy
- CTA / link
- interactive element metadata

#### Email

- subject
- preheader
- body
- CTA
- audience

#### SMS / WhatsApp

- message
- character / template constraints
- CTA / link
- audience

Do not force all platform semantics into one generic `caption` field.

---

## 6. Editorial / Content Calendar

Create a central calendar for communications operations.

Views:

- month
- week
- day
- agenda / list

Filters:

- company
- branch
- campaign
- platform
- format
- owner
- status
- creator / vendor

The calendar should show production status and scheduled/published content, not merely publication timestamps.

Future enhancements:

- drag-and-drop scheduling
- collision warnings
- campaign overlays
- content frequency rules
- branch calendar inheritance

---

## 7. Content Versioning & Collaboration

### Versioning

Content changes must support an auditable version history:

```text
v1 → creator draft
v2 → communications revision
v3 → legal/compliance revision
v4 → approved/published
```

Store or reconstruct:

- author
- timestamp
- changed fields
- previous value
- new value
- approval relationship

Published content history must not be silently rewritten.

### Collaboration

Support:

- comments
- threaded discussion where useful
- mentions
- resolved/unresolved comments
- change requests
- attachments / references

Typical roles:

- social media manager
- content creator
- designer
- agency
- brand manager
- legal / compliance
- marketing director

---

## 8. Configurable Approval Engine

Preserve current approval implementation but evolve it into policy-driven approvals.

Example workflows:

```text
Routine Social Post
Social Manager → Publish
```

```text
Medical / Promotional Claim
Creator → Social Manager → Brand → Legal/Compliance → Marketing Director → Publish
```

Approval policy can depend on:

- content format
- campaign type
- discount threshold
- medical / efficacy claim
- before-after media
- creator collaboration
- paid advertisement
- PR statement
- crisis communication
- company / branch

Required capabilities:

- ordered steps
- parallel approval where appropriate
- reject
- request changes
- send back
- delegation
- approval SLA
- overdue escalation
- audit trail

---

## 9. Brand Governance & Compliance

Preserve current brand governance fields and build executable compliance on top.

### Deterministic validation

Validate content for:

- forbidden phrases
- required phrases/disclosures
- forbidden claims
- required hashtags
- forbidden hashtags
- hashtag count
- CTA rules
- logo / asset restrictions where machine-readable

Result example:

```text
Brand Compliance
PASS / WARNING / BLOCKED

- Required disclosure missing
- Forbidden claim detected
- Hashtag limit exceeded
```

### AI-assisted phase

After deterministic rules are stable, AI may assist with:

- tone-of-voice consistency
- brand consistency score
- risky claim detection
- suggested compliant rewrite
- duplicate/repetitive content detection

AI output must not silently publish or bypass required human approval.

---

## 10. Digital Asset Management (DAM)

Evolve the existing digital asset domain into a structured library.

Asset categories:

- logos
- brand templates
- photos
- videos
- campaign creatives
- service imagery
- product imagery
- before/after media
- creator assets
- PR assets
- print assets

Asset metadata:

- tenant/company/branch scope
- owner
- version
- file metadata
- tags
- campaign
- service/package
- creator
- usage rights
- consent reference
- valid-from / valid-until
- restricted channels
- archival state

Avoid storing large binaries directly in relational rows; preserve existing storage abstractions.

---

## 11. Media Rights & Customer Consent

Before/after and customer-identifiable media require first-class usage rights.

Target chain:

```text
Customer
→ Media Consent
→ Asset
→ Allowed Usage
→ Content
→ Publication
```

Consent should be able to express:

- allowed channels
- paid advertising allowed / denied
- organic social allowed / denied
- website allowed / denied
- print allowed / denied
- date range
- consent document
- withdrawal timestamp

If consent is withdrawn, affected assets/content should become discoverable as compliance exceptions.

Never assume marketing communication consent and media/image consent are the same consent.

---

## 12. Campaign 360

Campaign detail should become a cross-domain operational cockpit.

Target sections:

- campaign definition
- objective
- offer
- branches
- services/packages
- timeline
- budget/spend
- content
- paid media
- creators
- vendors
- PR
- leads
- appointments
- show-ups
- sales
- revenue
- collections
- refunds
- attribution

Example executive metrics:

```text
Budget             150,000 TRY
Spend              121,000 TRY
Leads                    870
Appointments             315
Show-ups                 261
Sales                    147
Attributed Revenue   740,000 TRY
Collected Revenue    610,000 TRY
CPL                       ...
CPA                       ...
ROAS                      ...
```

Metric definitions must be explicit and consistent.

---

## 13. Attribution

Preserve existing provider and UTM attribution fields.

Target attribution envelope should support:

- provider
- external account
- external campaign
- external ad group / ad set
- external ad
- UTM source
- UTM medium
- UTM campaign
- UTM content
- click ID
- landing page
- coupon / promo code
- creator
- campaign

Initial attribution model:

- first touch
- last touch

Later:

- assisted / multi-touch attribution

Never overwrite original acquisition data without audit history.

Attribution must distinguish:

- lead attribution
- appointment attribution
- sale attribution
- revenue attribution
- collection attribution

---

## 14. Paid Media Operations

Do not attempt to rebuild Meta Ads, Google Ads or TikTok Ads.

The ERP's job is to ingest and normalize advertising data and connect it to operational and financial outcomes.

Normalized concepts:

- provider
- ad account
- campaign
- ad set / ad group
- ad
- creative
- spend
- impressions
- reach
- clicks
- CTR
- CPC
- CPM
- provider conversions
- internal leads
- appointments
- sales
- attributed revenue

Provider credentials must use secure credential storage and never be returned in plaintext.

---

## 15. Creator & Influencer Operations

Preserve the current creator and collaboration foundation.

Extend creator profiles with structured:

- audience demographics
- audience geography
- category / niche
- historical performance
- brand fit
- rate history
- contracts
- content / deliverables
- approval history
- tracking links
- coupon codes
- leads
- appointments
- sales
- attributed revenue
- ROI

Target question:

> Which creator generates profitable appointments, sales and collected revenue for this business?

Do not rank creators by follower count alone.

---

## 16. Marketing Vendors / Agencies

Preserve vendor contract, payment model, fee and KPI foundations.

Target chain:

```text
Marketing Vendor
→ Contract / Scope
→ Campaign / Deliverable
→ Expense / Obligation
→ Invoice
→ Payment
→ Campaign Cost
→ Vendor Performance
```

Integrate with Finance rather than implementing duplicate payment/accounting systems inside Communications.

Track:

- service scope
- SLA
- deliverables
- KPI commitments
- contract dates
- retainer/project/performance fees
- campaign assignments
- content assignments
- quality/performance review

---

## 17. PR & Media CRM

Current PR activity fields should evolve into reusable media entities.

### Media Outlet

- name
- type
- website
- geography
- audience
- notes

### Media Contact

- outlet
- name
- role
- email
- phone
- relationship owner
- topics/beats
- interaction history

### PR interaction history

```text
Media Contact
├── Press release
├── Interview
├── Event invitation
├── Follow-up
└── Coverage
```

Do not repeatedly duplicate outlet/contact data inside every PR activity once reusable entities exist.

---

## 18. Press Release & Coverage

Press releases should support:

```text
Draft
→ Review
→ Legal/Compliance
→ Approved
→ Distributed
→ Coverage
```

Track:

- release content
- distribution list
- recipients
- send/distribution status
- coverage links/references
- estimated reach
- actual reach
- estimated media value

---

## 19. Crisis Communication

Build on existing `CRISIS_COMMUNICATION` PR activity type.

Target Crisis Room:

```text
Incident
→ Severity
→ Crisis Team
→ Facts / Timeline
→ Holding Statement
→ Approved Messages
→ Channels
→ Media Responses
→ Actions
→ Resolution
→ Postmortem
```

Capabilities:

- severity
- owner
- crisis team
- approved spokespersons
- single source of truth
- message approval
- branch communication restrictions
- timeline
- tasks
- audit history

---

## 20. Internal Communications

This is a major missing part of the current Corporate Communications product.

Content types:

- company announcement
- leadership / CEO message
- operational notice
- policy announcement
- company news
- event
- emergency notice

Audience targeting:

- all tenant
- company
- region
- branch
- department
- role
- selected employees

Tracking:

- delivered
- viewed/read
- acknowledged
- unread

Critical notices may require explicit `Read & Acknowledge`.

Integrate with HR organization/employee data rather than duplicating employee structures.

---

## 21. Events Management

Support communications-owned events such as:

- branch opening
- launch
- influencer event
- press event
- workshop
- corporate event
- sponsorship event

Target event aggregate:

- title
- type
- objective
- venue
- date/time
- owner
- guests
- invitations
- RSVP
- agenda
- vendors
- creators/media
- budget
- expenses
- assets
- campaign
- outcomes

Use Finance for financial transactions.

---

## 22. Marketing Request Portal

Multi-branch operations need a structured request workflow.

Example:

```text
Branch Manager
→ Marketing Request
→ Triage
→ Brief
→ Production
→ Approval
→ Delivery
→ Closed
```

Request types:

- social post
- campaign
- print
- poster
- brochure
- video
- photography
- event
- PR
- digital advertisement
- template/localization
- other

Track priority, requester, branch, due date, SLA, owner and status.

---

## 23. Template Center & Local Marketing Governance

Central communications teams should publish approved reusable templates.

Examples:

- Instagram post
- story
- poster
- price list
- campaign banner
- WhatsApp creative
- email
- SMS

Templates may expose editable tokens such as:

- branch name
- phone
- address
- price
- campaign date

while locking brand-controlled elements.

Local marketing policies can include rules such as:

- discount above threshold requires central approval
- medical claims always require compliance approval
- branch cannot modify logo/color system
- only approved templates may be used for selected channels

---

## 24. Commercial Communication Consent

Marketing sends must respect customer communication consent and suppression rules.

Required concepts:

- channel consent
- opt-in source
- opt-out
- suppression
- legal basis where applicable
- consent timestamp/history

CRM/customer consent should be reused as the source of truth when appropriate.

For Türkiye-specific IYS/KVKK/ticari elektronik ileti requirements, verify current official requirements at implementation time. Do not encode stale legal assumptions into the architecture.

---

## 25. Communications Analytics Cockpit

Target management views:

### Marketing

- spend
- leads
- CPL
- appointments
- appointment rate
- show-up rate
- sales
- CPA
- attributed revenue
- collected revenue
- ROAS

### Content

- production throughput
- approval time
- overdue approvals
- publication consistency
- platform performance
- top content

### Brand

- compliance score
- blocked/warned content
- branch violations
- expired/restricted assets

### Creators

- spend
- deliverables
- leads
- appointments
- sales
- revenue
- ROI

### PR

- activities
- coverage
- reach
- estimated media value
- outlet/contact activity

### Vendors

- cost
- SLA
- KPI performance
- deliverable quality

### Internal Communications

- delivery rate
- read rate
- acknowledgement rate
- overdue acknowledgements

Metric definitions must be documented and tested.

---

## 26. Cross-Domain Integration Rules

### CRM

Communications owns acquisition/campaign context; CRM owns sales follow-up and opportunity lifecycle.

Do not create a second CRM inside Communications.

### Appointments

Communications can attribute and initiate appointment conversion but appointment scheduling remains in the Appointment domain.

### Sales

Sales remains the source of truth for commercial transactions.

### Finance

Finance remains source of truth for:

- expenses
- obligations
- invoices
- payments
- accounting
- collections

Communications may reference and aggregate financial data but must not create parallel accounting ledgers.

### HR

Internal communications audience targeting should reference HR organization/employee structures.

### Documents / Assets

Reuse platform file/storage abstractions.

---

## 27. Multi-Tenant, Company & Branch Isolation

Every applicable record must preserve correct isolation.

Validate references across:

- tenant
- company
- branch
- user
- customer
- employee
- campaign
- service/package

Never trust IDs supplied by the client without scoped validation.

Branch-scoped users must not gain visibility into unrelated branch campaigns, leads, content, assets, creators, vendors or analytics unless explicit permission/policy grants broader scope.

---

## 28. Permissions

Preserve existing communications permissions and progressively separate high-risk actions.

Candidate permissions:

- `communications.read`
- `communications.manage`
- `communications.approve`
- `communications.publish`
- `communications.brand.manage`
- `communications.campaign.manage`
- `communications.analytics.read`
- `communications.internal.publish`
- `communications.crisis.manage`
- `communications.integrations.manage`

Do not introduce granular permissions without checking the existing permission model and migration strategy.

---

## 29. Auditability & Integrity

Audit at minimum:

- campaign created/updated/status changed
- budget/spend changed
- content created/updated/versioned
- review submitted
- approval/rejection/change request
- content scheduled/published/unpublished where supported
- brand governance changed
- asset rights/consent changed
- creator/vendor contract changed
- PR/crisis state changed
- routing rule changed
- provider connection changed
- internal communication published

For important transitions preserve:

- actor
- timestamp
- tenant/company/branch
- old state
- new state
- correlation/reference IDs

Use optimistic concurrency or equivalent protections where concurrent editing/approval can cause lost updates.

---

## 30. External Provider Safety

Provider operations must be:

- idempotent where possible
- retry-safe
- observable
- auditable
- rate-limit aware
- webhook replay safe
- signature verified when applicable

Never expose provider access tokens or credentials in API responses/logs.

Publishing and campaign sync should distinguish:

```text
INTERNAL_STATE
PROVIDER_REQUESTED
PROVIDER_CONFIRMED
PROVIDER_FAILED
```

Do not mark content successfully published solely because a provider request was queued.

---

# DEVELOPMENT PHASES

## Phase 1 — Content Operations Foundation Hardening

Goal: turn the existing content lifecycle into a usable production system.

Deliverables:

- inspect and harden current content model/service/UI
- Content Studio structure
- platform/format-specific content payloads without destructive duplication
- content detail/editor UX
- content version history
- comments/collaboration
- approval audit history
- optimistic concurrency/version protection
- editorial calendar
- content filters
- tests

Definition of success:

A communications team can create, collaborate on, review, approve and schedule content without relying on external spreadsheets/chat for core workflow state.

---

## Phase 2 — Brand Compliance, DAM & Media Rights

Deliverables:

- executable deterministic brand compliance
- compliance result/warnings/blocks
- stronger DAM metadata
- asset versioning
- usage rights
- customer media consent linkage
- channel restrictions
- consent withdrawal handling
- template foundation

Definition of success:

The system can prevent or flag unauthorized brand/media usage before publication.

---

## Phase 3 — Campaign 360 & Attribution

Deliverables:

- Campaign 360 detail
- campaign-content links
- creator/vendor/PR rollups
- normalized attribution
- lead → appointment → sale → collection funnel
- first-touch / last-touch reporting
- campaign spend vs attributed/collected revenue
- CPL / CPA / ROAS
- refund-aware revenue metrics

Definition of success:

Management can trace campaign investment to operational and financial outcomes.

---

## Phase 4 — Marketing Requests & Local Marketing Governance

Deliverables:

- marketing request portal
- branch request workflow
- request SLA
- request assignment
- request → content/campaign relationship
- template center
- local marketing policies
- branch approval thresholds

Definition of success:

Branches can request/localize marketing work without uncontrolled WhatsApp/email processes while central brand governance remains intact.

---

## Phase 5 — Creator, Vendor & PR Professionalization

Deliverables:

- creator ROI and attribution
- creator contract/deliverable history
- vendor performance/SLA
- vendor → finance linkage
- Media Outlet
- Media Contact
- interaction history
- press release workflow
- coverage tracking
- improved PR analytics

Definition of success:

Influencer, agency and PR relationships become measurable reusable business relationships rather than isolated records.

---

## Phase 6 — Internal Communications & Events

Deliverables:

- announcements/news/policies/notices
- HR-based audience targeting
- read tracking
- acknowledgement tracking
- critical notices
- event management
- invitations/RSVP
- event campaign/PR/vendor/finance links

Definition of success:

Corporate Communications supports both external and internal communications.

---

## Phase 7 — Paid Media & Provider Operations

Deliverables:

- normalized provider/ad-account model
- Meta/Google/TikTok adapters as appropriate
- spend/impression/reach/click sync
- provider status observability
- webhook/retry/idempotency hardening
- paid media → internal funnel attribution
- provider connection security hardening

Definition of success:

The ERP explains which external advertising investments create appointments, sales and collected revenue without attempting to replace ad platforms.

---

## Phase 8 — Crisis, Reputation & Advanced Intelligence

Deliverables:

- Crisis Room
- incident timeline
- crisis team / spokesperson governance
- approved message center
- media response tracking
- reputation/mention foundation where justified
- AI brand assistance
- AI content suggestions
- AI risk/claim assistance
- executive insights

AI is assistive; it must not bypass approval/compliance controls.

---

## 31. Suggested Immediate Implementation Order

When development begins, verify current code first. If still incomplete, prefer this sequence:

1. inspect Prisma models/migrations for all communications entities
2. inspect content service transition rules and concurrency behavior
3. inspect current content/approvals frontend in detail
4. add the smallest coherent content versioning foundation
5. add collaboration/comments if no equivalent platform primitive exists
6. build content detail/editor experience
7. build editorial calendar
8. strengthen approval audit/concurrency
9. implement deterministic brand compliance
10. then proceed to Campaign 360 / attribution

Do not begin by adding broad new provider integrations.

---

## 32. Testing Requirements

Every meaningful increment should include relevant tests.

### Backend

Test:

- tenant isolation
- company/branch isolation
- permissions
- invalid cross-tenant references
- lifecycle transitions
- invalid lifecycle transitions
- approval permissions
- concurrency/version conflicts
- idempotent external/provider events
- attribution preservation
- consent restrictions
- brand compliance rules

### Frontend

At minimum run relevant:

- TypeScript/typecheck
- lint
- build where practical
- targeted component/unit tests if present

### Integration

Important end-to-end scenarios:

```text
Campaign → Marketing Lead → CRM → Appointment
```

```text
Content → Review → Approval → Schedule → Publish
```

```text
Campaign → Lead → Appointment → Sale → Collection → Attribution
```

```text
Customer Media Consent → Asset → Content → Compliance Check
```

---

## 33. Definition of Done

A roadmap item is not complete merely because a table or endpoint exists.

A logical increment should satisfy applicable items:

- schema/domain implemented
- migration safe
- service rules implemented
- tenant/company/branch isolation verified
- permissions verified
- audit behavior present
- concurrency/idempotency handled where required
- API implemented
- UI implemented when user-facing
- loading/empty/error states handled
- tests added/updated
- typecheck/lint/tests pass
- roadmap progress updated
- committed to `feature/core-commerce-foundation`

Never merge to `main` unless explicitly requested.

---

## 34. Implementation Rules

1. Read this roadmap first.
2. Inspect the current repository and latest commits before changing anything.
3. Do not assume roadmap items remain incomplete.
4. Do not recreate existing models, migrations, services, endpoints or UI.
5. Preserve existing architecture and make incremental changes.
6. Preserve strict tenant/company/branch isolation.
7. Preserve CRM, Appointment, Sales, Finance and HR domain ownership.
8. Use Finance as financial source of truth.
9. Preserve attribution history; do not silently overwrite acquisition data.
10. Protect provider credentials/secrets.
11. Use idempotency and replay safety for provider/webhook operations.
12. Add auditability for approvals, publishing and governance changes.
13. Add concurrency protection where multiple users can edit/approve.
14. Verify Türkiye-specific legal/commercial communication requirements from current official sources at implementation time.
15. Marketplace and Supplier Marketplace remain out of scope.
16. Run relevant quality checks after each logical increment.
17. Commit each coherent increment to `feature/core-commerce-foundation`.
18. Update this roadmap when a phase, architecture decision or major task materially changes.

---

## 35. New-Chat Continuation Protocol

Use the following instruction when development continues in another conversation:

```text
Open repository kaanb-wiascode/beauty and continue on branch feature/core-commerce-foundation.

First read /docs/MARKETING-COMMUNICATIONS-DEVELOPMENT-ROADMAP.md.
Then inspect the current repository, Prisma schema/migrations, communications frontend/backend modules and the latest commits.
Compare the current implementation with the roadmap and identify the first incomplete Marketing & Communications item.
Do not recreate files, services, migrations, endpoints, models or UI that already exist.
Preserve strict tenant/company/branch isolation, permissions, attribution history, auditability, concurrency safety and provider idempotency/security.
CRM, Appointments, Sales, Finance and HR remain the source of truth for their own domains; do not create duplicate subsystems inside Communications.
Do not merge or push to main.
Marketplace and Supplier Marketplace are out of scope for now.
Implement the next incomplete roadmap item directly in the repository, add/update tests, run relevant CI-quality checks, commit the changes and update this roadmap with progress.
```

Short continuation form:

```text
kaanb-wiascode/beauty reposunda feature/core-commerce-foundation branch'ine eriş. Önce /docs/MARKETING-COMMUNICATIONS-DEVELOPMENT-ROADMAP.md dosyasını oku. Mevcut kurumsal iletişim/pazarlama kodlarını ve son commitleri roadmap ile karşılaştır, ilk tamamlanmamış maddeden geliştirmeye devam et. CRM, Finance, HR, Sales ve Appointments domain sınırlarını koru; mevcut yapıları yeniden oluşturma; Marketplace kapsam dışı; main'e merge/push yapma.
```
