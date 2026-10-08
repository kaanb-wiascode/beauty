# Administration & Settings Development Roadmap

## 1. Purpose

This document defines the target architecture and development roadmap for the Beauty ERP administration/control-plane layer.

The Administration module must not remain a small settings page. It must become the central control plane that defines who can use which capability, on which company/branch/data scope, under which business and security policies.

Target principle:

> WHO can do WHAT on WHICH DATA, WHERE, and under WHICH CONDITIONS?

This roadmap must be implemented incrementally. Existing RBAC, tenant context, membership, permission guards and domain capabilities must be preserved and extended rather than replaced without verification.

---

## 2. Current State

Current frontend Administration/Settings is minimal.

`/settings` currently primarily exposes:
- Roles & Permissions

Current sidebar Administration area also contains entries such as Roles & Permissions, Cash and Settings. Cash should ultimately belong to Finance/Treasury rather than Administration.

### Existing Roles & Permissions capabilities

Current implementation already supports useful RBAC foundations:
- Tenant-scoped roles
- Role creation
- Role name/description
- Permission assignment to roles
- Resource/action permission model
- User creation
- Membership listing
- Membership role change
- Membership ACTIVE/SUSPENDED state
- Removing a membership from the business
- Owner role protections
- Protection against deleting roles assigned to users
- Tenant isolation in role queries

Observed permission resources include domains such as:
- customers
- appointments
- payments
- reports
- staff
- services
- roles
- inventory
- crm
- training
- quality
- finance
- accounting
- hr

Observed permission actions include:
- read
- create
- update
- delete
- cancel
- refund
- write/manage
- approve
- reconcile
- export

### Current architectural strengths

The existing foundation should be preserved:
- JWT authentication
- TenantAuthGuard / TenantContext
- PermissionsGuard
- Role
- Permission
- RolePermission
- Membership
- Resource/action permissions
- Owner lockout protections

### Current maturity assessment

| Area | Approx. maturity |
|---|---:|
| Basic RBAC | 7/10 |
| Tenant role isolation | 8/10 |
| Resource/action permissions | 7/10 |
| Owner protections | 7/10 |
| User management | 4/10 |
| Branch/data scope authorization | 4/10 |
| Field-level security | 1/10 |
| Company administration | 2/10 |
| Branch administration | 2/10 |
| Approval administration | 2/10 |
| Audit management UI | 1/10 |
| Security center | 1/10 |
| Session/MFA administration | 1/10 |
| Notification policies | 1/10 |
| Data/privacy administration | 1/10 |
| Integration administration | 3/10 |
| Overall Administration Center | 3–4/10 |

Conclusion: the RBAC core is useful, but the product does not yet have a complete enterprise Administration Center.

---

## 3. Target Information Architecture

Target Administration navigation:

```text
YÖNETİM

GENEL
├─ Yönetim Merkezi
├─ İşletme Profili
├─ Şirketler
├─ Şubeler
└─ Organizasyon

ERİŞİM
├─ Kullanıcılar
├─ Roller & Yetkiler
├─ Erişim Kapsamları
└─ Geçici Erişimler

İŞ AKIŞLARI
├─ Onay Akışları
├─ Delegasyonlar
├─ İş Kuralları
└─ Numaralandırma

SİSTEM
├─ Bildirimler
├─ Entegrasyonlar
├─ Özellikler / Entitlements
└─ Veri Yönetimi

GÜVENLİK
├─ Güvenlik Politikaları
├─ Oturumlar
├─ Denetim Kayıtları
└─ Veri & Gizlilik
```

The `/settings` page should evolve into an Administration Center/dashboard rather than a single-card navigation page.

---

## 4. Tenant, Company, Branch and Organization Boundaries

Do not treat Tenant, Company and Branch as equivalent concepts.

Target hierarchy:

```text
Tenant
  └─ Legal Entity / Company
       └─ Region
            └─ Branch
                 └─ Department / Team / Cost Center
```

A customer may operate multiple legal entities and many branches within one tenant/workspace.

Authorization, reporting, finance, HR and operational workflows must preserve these boundaries.

---

## 5. Business / Legal Entity Settings

Each legal entity should support configurable master data such as:
- Business/display name
- Legal/trade name
- Tax office
- Tax number
- MERSIS/official identifiers where applicable
- Registered address
- Phone
- Email
- Website
- Logo/branding references
- Default currency
- Timezone
- Language
- Date/number formats
- Fiscal year settings
- Accounting/tax configuration references
- Status

Do not hard-code jurisdiction-specific legal behavior. Legal/tax requirements must be verified against current official sources when implemented.

---

## 6. Branch Administration

Branch must be a managed business object, not only a selector.

Suggested branch configuration:
- Name
- Code
- Company
- Region
- Address
- Phone/email
- Branch manager
- Cost center
- Working hours
- Holidays/closures
- Cash registers
- Bank/treasury mappings
- Warehouses
- Rooms/resources
- Devices/equipment
- Appointment policies
- Sales policies
- Operational settings

Suggested lifecycle:
- PLANNED
- ACTIVE
- TEMPORARILY_CLOSED
- CLOSED
- ARCHIVED

Closing/archiving a branch must not destroy historical records.

---

## 7. Region and Organization Administration

Support organizational hierarchies such as:

```text
Türkiye
├─ İstanbul Anadolu
│  ├─ Kadıköy
│  ├─ Ataşehir
│  └─ Maltepe
└─ İstanbul Avrupa
   ├─ Beşiktaş
   └─ Bakırköy
```

The organization model should support:
- Company
- Region
- Branch
- Department
- Team
- Position
- Manager hierarchy
- Cost center references

This hierarchy becomes an input to authorization scope, approvals, HR, reporting and operational analytics.

---

## 8. Authorization Target: RBAC + Scope

Current resource/action permissions should be extended with scope-aware authorization.

A permission such as:

```text
customers.read
```

is incomplete without answering which customers the user may read.

Target conceptual model:

```text
User
→ Membership
→ Role
→ Permission
→ Scope
→ Organization/Branch Assignment
```

Suggested scope types:
- OWN
- TEAM
- OWN_BRANCH
- SELECTED_BRANCHES
- REGION
- COMPANY
- TENANT

Examples:
- Reception: appointments.read + OWN_BRANCH
- Branch Manager: finance.read + OWN_BRANCH
- Regional Manager: reports.read + REGION
- CFO: finance.read + COMPANY or TENANT depending on policy

Scope enforcement must occur server-side. UI hiding is never sufficient authorization.

---

## 9. Branch Access Assignments

Users may require explicit access to selected branches independent of broad role names.

Example:

```text
Regional Manager
Ataşehir ✓
Kadıköy ✓
Maltepe ✓
Kartal ✓
Beşiktaş ✗
Bakırköy ✗
```

Model should support effective access calculation and avoid accidental cross-branch data leakage.

---

## 10. Field-Level Security

Sensitive domains require more than resource-level permissions.

Example HR policy:

```text
Name                 ✓
Position             ✓
Phone                ✓
Salary               ✗
IBAN                 ✗
National ID          ✗
Disciplinary records ✗
```

Example customer policy may distinguish:
- Identity/contact
- Financial balances
- Consent information
- Sensitive/clinical information where applicable

Target authorization dimensions:

```text
Resource
Action
Scope
Field Policy
```

Field-level policies should initially be applied to high-risk domains rather than trying to configure every database column.

Priority domains:
1. HR compensation/payroll
2. Employee identity/banking
3. Finance/treasury
4. Sensitive customer/clinical data
5. Audit/security data

---

## 11. Permission Matrix UX

Upgrade the Roles page from a flat checkbox experience to a comprehensible permission matrix.

Example:

| Module | Read | Create | Update | Delete | Approve | Export |
|---|---:|---:|---:|---:|---:|---:|
| Customers | ✓ | ✓ | ✓ | ✗ | — | ✗ |
| Appointments | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Finance | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ |
| HR | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ |

Each module should support an advanced/detail view for granular permissions and scopes.

UI requirements:
- Search permissions
- Filter by module
- Select all within module
- Read-only visualization of inherited/effective permissions
- Unsaved changes warning
- Dangerous permission warning
- Change summary before save for high-risk roles

---

## 12. Permission Granularity

Avoid relying indefinitely on broad permissions such as `finance.manage`.

Target examples:

```text
finance.expense.read
finance.expense.create
finance.expense.approve
finance.payment.read
finance.payment.create
finance.payment.approve
finance.bank.read
finance.bank.reconcile
finance.export
```

HR examples:

```text
hr.employee.read
hr.employee.manage
hr.compensation.read
hr.compensation.manage
hr.payroll.read
hr.payroll.approve
hr.payroll.post
hr.case.read
```

CRM examples:

```text
crm.lead.read
crm.lead.manage
crm.opportunity.manage
crm.export
```

Do not explode the permission catalog prematurely. Add granular permissions when actual business operations require distinct authorization.

---

## 13. Permission Dependencies

Some permissions imply prerequisite access.

Examples:
- payments.refund requires payments.read
- payroll.post requires payroll.read
- finance.expense.approve requires finance.expense.read

Introduce dependency validation where needed.

UI should explain:
> This permission also requires the following permissions.

Prevent inconsistent permission sets where practical.

---

## 14. Separation of Duties (SoD)

Critical financial and administrative workflows should optionally enforce separation of duties.

Examples:

```text
Creator != Approver
Approver != Payer
```

Applicable domains:
- Expenses
- Supplier bills
- Procurement
- Treasury payments
- Payroll
- Refunds
- High-value discounts
- Sensitive role/permission changes

SoD should be policy-driven and tenant-configurable where appropriate.

---

## 15. User Management as a Separate Domain

User management should not remain embedded inside the Roles page.

Target route:

```text
/settings/users
```

Suggested user administration view:
- Name
- Email
- Phone
- Optional Employee link
- Role(s)/membership
- Company scope
- Region scope
- Branch access
- Status
- Last login
- Last activity
- MFA status
- Active sessions/devices summary
- Invitation state
- Effective permissions

Support filters for status, role, company, branch and access risk.

---

## 16. User and Employee Separation

User and Employee are different concepts.

```text
Employee ← optional association → User
```

Employee = HR/workforce identity.
User = authentication/application identity.

A worker may not have application access. An external accountant, auditor or consultant may have application access without being an employee.

Do not force a 1:1 mandatory identity relationship.

---

## 17. Invitation-Based User Onboarding

Direct administrator-created passwords should not be the primary long-term onboarding flow.

Target:

```text
Administrator
→ Invite User
→ Email Invitation
→ Secure Token
→ User Sets Credentials
→ MFA if policy requires
→ Membership Activated
```

Suggested invitation states:
- PENDING
- ACCEPTED
- EXPIRED
- REVOKED

Invitation tokens must be time-limited, securely generated and never logged in plaintext.

---

## 18. Role Templates and Cloning

Provide starter templates such as:
- Owner
- General Manager
- Regional Manager
- Branch Manager
- Reception
- Sales Consultant
- Beautician/Specialist
- Finance
- Accountant
- HR
- Marketing
- Warehouse
- Auditor

Templates should be copied into tenant-owned roles rather than making tenant customization mutate global templates.

Support Role Clone for quickly deriving roles such as Assistant Branch Manager from Branch Manager.

---

## 19. Effective Permissions

User detail should provide an effective permission view showing:
- Permission
- Scope
- Source role
- Direct/temporary assignment if supported
- Company/branch restrictions
- Expiration

Example:

```text
Finance / Expense Approve ✓
Scope: OWN_BRANCH
Granted by: Branch Manager
```

This is essential for support, audit and troubleshooting.

---

## 20. Permission Simulation

Provide a safe administrative preview:

> What can this user access?

Show:
- Companies
- Branches
- Modules
- High-risk permissions
- Data scopes
- Temporary access

Initially implement this as permission simulation, not unrestricted user impersonation.

---

## 21. Temporary Access

Support time-bound access for auditors, accountants, consultants or temporary assignments.

Example:

```text
Finance Read
Reports Export
Valid: 15 Sep → 30 Sep
```

Temporary grants must:
- Have start/end timestamps
- Expire automatically
- Be auditable
- Be included in effective permission calculation
- Respect tenant/company/branch scope

---

## 22. Emergency / Break-Glass Access

Later-stage enterprise feature.

Emergency access should require:
- Explicit reason
- Limited duration
- Strong authentication/re-authentication
- Full audit trail
- Notification to appropriate administrators

Do not make this a Phase 1 requirement.

---

## 23. Central Approval Workflow Engine

Finance, HR, Procurement, Marketing and other domains should not each create incompatible approval systems.

Administration should provide a reusable approval workflow engine.

Examples:

```text
Expense > 5,000
→ Branch Manager

Expense > 25,000
→ Regional Manager
→ Finance

Expense > 100,000
→ CFO
→ General Manager
```

HR example:

```text
Leave Request
→ Manager
→ HR
```

Workflow concepts:
- Workflow definition
- Trigger/domain
- Conditions
- Steps
- Approver resolution
- Sequential/parallel steps where required
- Thresholds
- Escalation
- Delegation
- Approve/reject/send-back
- Audit
- Versioning

Published workflow definitions should be versioned so historical approvals remain explainable.

---

## 24. Approval Delegation

Support temporary delegation when an approver is unavailable.

Example:

```text
15–25 September
Ayşe approvals → Mehmet
```

Delegation requires:
- Delegator
- Delegate
- Start/end
- Scope/domain
- Reason
- Audit
- Conflict checks

---

## 25. Business Rules / Policies

Permissions answer whether a user may perform an action. Business policies answer under which business conditions it is permitted.

Example discount policy:

```text
Reception       0%
Sales           10%
Branch Manager  20%
Regional        30%
```

Other examples:
- Refund approval threshold
- Expense approval threshold
- Stock adjustment threshold
- Complimentary service limit
- Manual price override limit
- Customer credit limit

Keep authorization and business policy concepts separate.

---

## 26. Numbering / Document Sequences

Centralize configurable numbering where appropriate.

Examples:

```text
SALE-2026-000001
INV-2026-000001
EXP-2026-000001
PO-2026-000001
PAY-2026-000001
```

Sequence policies may depend on:
- Company
- Branch
- Year/fiscal period
- Document type

Before creating a new sequence engine, inspect existing accounting/finance numbering and reuse/generalize compatible infrastructure.

Concurrency safety is mandatory for document numbering.

---

## 27. Notification Policy Administration

Allow tenant administrators to configure which business events notify which audiences.

Examples:
- Expense approval → Finance Manager
- Low stock → Warehouse Manager
- Certificate expiring → HR + Employee
- CRM SLA breach → Sales Manager
- Payroll exception → HR/Payroll

Possible channels where supported:
- In-app
- Email
- SMS
- WhatsApp

Notification policy must respect consent, channel availability and domain-specific privacy restrictions.

---

## 28. Integration Administration

Provide a centralized integration catalog/health view while retaining detailed domain settings in relevant modules.

Categories may include:
- Banking
- Payments
- Accounting/e-document
- Email
- SMS
- WhatsApp
- Meta
- Google
- TikTok
- Storage
- Calendar

Suggested states:
- CONNECTED
- DEGRADED
- ERROR
- DISCONNECTED

Never expose secrets or credentials in responses, logs or ordinary UI. Use masked identifiers and secure secret storage.

---

## 29. Subscription, Entitlements and Feature Access

Keep subscription entitlements separate from user permissions.

```text
Entitlement:
Does the tenant/company plan include the capability?

Permission:
May this user use the capability?
```

Potential entitlement domains:
- CRM
- Finance
- HR
- Academy/Training
- Marketing
- Advanced Reporting
- AI
- Multi-company/multi-branch capabilities

Authorization should consider both entitlement and permission where relevant.

---

## 30. Data Management

Administration should provide controlled data operations:
- Imports
- Exports
- Import history
- Export history
- Archive operations
- Data retention configuration where supported

Typical imports:
- Customers
- Staff
- Products
- Services
- Opening stock

Recommended import lifecycle:

```text
Upload
→ Preview
→ Validate
→ Error Resolution
→ Commit
→ Audit
```

Large operations should use asynchronous jobs rather than blocking HTTP requests.

---

## 31. Privacy / Data Governance

Provide a Data & Privacy administration area.

Potential capabilities:
- Consent policy configuration
- Marketing consent configuration
- Retention policies
- Data export request workflows
- Deletion/anonymization workflows where legally appropriate
- Media/photo consent
- Access review

Do not implement legal assumptions from memory. Turkish KVKK, health-data rules, employment retention and e-document obligations must be verified against current official requirements at implementation time.

---

## 32. Security Center

Create a dedicated security administration area.

Capabilities should evolve toward:
- MFA policy
- Authentication policy
- Session policy
- Active sessions
- Device/session revocation
- Failed login/lockout policy
- Sensitive-operation re-authentication
- Security event visibility

Potential MFA policy options:
- Optional
- Required for administrators
- Required for Finance/Payroll roles
- Required for all users

Avoid outdated security practices such as arbitrary periodic password rotation unless a verified policy requires it.

---

## 33. Session Management

Users should be able to view and terminate their own active sessions.

Authorized administrators may need the ability to revoke a user's sessions after:
- Suspension
- Termination
- Role/security incident
- Credential compromise

Session metadata shown to users should be privacy-conscious and useful, such as device/browser and approximate activity information.

---

## 34. Audit Log Center

A central Audit Log Center is mandatory for an enterprise ERP.

Audit events should cover at least:
- Role created/updated/deleted
- Permission granted/revoked
- User invited/activated/suspended
- User role changed
- Branch access granted/revoked
- Company/branch settings changed
- Approval workflow changed
- Security policy changed
- Integration changed
- Sensitive finance/HR administrative actions

Suggested filters:
- Date/time
- Actor/user
- Module
- Action
- Company
- Branch
- Entity/entity ID
- Risk category

Audit logs should be immutable from ordinary tenant administration and retain before/after metadata where safe and appropriate.

Never log secrets, plaintext credentials or unnecessarily sensitive values.

---

## 35. Permission Change Audit

At minimum track events such as:

```text
ROLE_CREATED
ROLE_UPDATED
ROLE_DELETED
PERMISSION_GRANTED
PERMISSION_REVOKED
USER_ROLE_CHANGED
USER_SUSPENDED
BRANCH_ACCESS_GRANTED
BRANCH_ACCESS_REVOKED
TEMPORARY_ACCESS_GRANTED
TEMPORARY_ACCESS_EXPIRED
```

The system must be able to answer:
> Who gave this user access to Finance, when, and for which scope?

---

## 36. System Health / Administration Operations

Owner/admin users may need an understandable operational health view:
- Integration health
- Background job failures
- Webhook failures
- Email/SMS delivery failures
- Bank synchronization state
- Export/report job state
- Scheduled automation failures

Do not expose raw infrastructure logs unnecessarily. Provide business-friendly status and correlation identifiers for support.

---

## 37. Danger Zone

High-impact operations should be separated visually and technically.

Examples:
- Archive company
- Close/archive branch
- Bulk suspend users
- Disconnect integration
- Revoke all sessions
- Rotate/revoke integration credentials where supported

Controls may include:
- Explicit confirmation
- Re-authentication for sensitive actions
- Required reason
- Approval for very high-risk operations
- Audit event

Historical records must not be destroyed by ordinary administrative deactivation.

---

## 38. Administration Dashboard

The Administration Center should surface actionable configuration health rather than only navigation cards.

Suggested widgets:
- Active users
- Suspended users
- Pending invitations
- Roles
- High-risk role changes
- Branches/companies
- Users without branch scope
- Users with broad tenant scope
- MFA coverage
- Failed integrations
- Pending configuration issues
- Recent administrative changes
- Temporary access expiring soon

---

## 39. Cross-Module Responsibilities

Administration owns:
- Identity/application access administration
- Authorization policies
- Organizational access scope
- Company/branch configuration
- Approval definitions
- Business policy configuration framework
- Security policies
- Audit visibility
- Integration catalog/health
- Entitlement visibility

Domain modules own their business facts.

Examples:
- HR owns employee/employment facts.
- Finance owns financial transactions/accounting facts.
- CRM owns lead/opportunity facts.
- Academy owns course/training facts.
- Administration determines access/policies around those facts.

Do not move domain logic into Settings simply because it is configurable.

---

## 40. Authorization Evaluation Model

Target conceptual evaluation:

```text
Authenticated User
  ↓
Tenant Membership ACTIVE?
  ↓
Entitlement enabled?
  ↓
Role/Permission grants action?
  ↓
Scope allows company/branch/entity?
  ↓
Field policy allows requested fields?
  ↓
Business policy/approval constraints satisfied?
  ↓
ALLOW / DENY
```

Default behavior for sensitive operations should be deny unless explicitly allowed.

---

## 41. Security and Integrity Requirements

Administration changes are security-sensitive.

Requirements:
- Strict tenant isolation
- Company/branch scope enforcement
- Server-side authorization
- Transactional permission changes
- Optimistic concurrency/versioning for complex policy edits where appropriate
- Idempotency for invitation/action workflows where duplicate requests can occur
- Immutable audit trail
- Re-authentication for selected high-risk actions
- No plaintext secrets
- No credentials in logs
- Safe failure modes
- Prevent owner/admin lockout where appropriate
- Prevent last-owner removal or equivalent unrecoverable tenant state

---

## 42. Performance and Caching

Effective permission calculations may become expensive as scope and field policies grow.

Design for:
- Cached effective permissions where safe
- Explicit invalidation on role/permission/scope changes
- Versioned authorization state
- Avoid N+1 permission queries
- Efficient branch scope predicates

Security correctness takes priority over cache hit rate. Stale permission caches must not continue granting revoked access.

---

## 43. Administration Event Layer

Candidate domain/security events:
- USER_INVITED
- USER_ACTIVATED
- USER_SUSPENDED
- USER_REMOVED_FROM_TENANT
- USER_ROLE_CHANGED
- ROLE_CREATED
- ROLE_UPDATED
- ROLE_DELETED
- ROLE_PERMISSIONS_UPDATED
- ACCESS_SCOPE_CHANGED
- TEMPORARY_ACCESS_GRANTED
- TEMPORARY_ACCESS_EXPIRED
- COMPANY_UPDATED
- BRANCH_CREATED
- BRANCH_UPDATED
- BRANCH_CLOSED
- APPROVAL_WORKFLOW_PUBLISHED
- SECURITY_POLICY_UPDATED
- INTEGRATION_CONNECTED
- INTEGRATION_DISCONNECTED

Events that cause side effects must preserve tenant/company/branch context and be idempotent where necessary.

---

## 44. Testing Strategy

### Authorization tests
- Tenant isolation
- Company isolation
- Branch scope isolation
- Cross-tenant ID probing
- Cross-branch ID probing
- Role permission grants/revocations
- Effective permission calculation
- Temporary access expiration
- Owner/last-admin protections
- Suspended membership behavior

### Field security tests
- Salary/IBAN masking/access
- Finance restricted fields
- Sensitive customer fields
- Export honors field restrictions

### Workflow tests
- Approval threshold routing
- Delegation
- SoD conflicts
- Workflow version preservation

### Concurrency tests
- Simultaneous permission edits
- Role deletion vs membership assignment
- Document sequence concurrency
- Invitation acceptance races

### Audit tests
- Every critical mutation emits audit
- Actor and tenant context preserved
- No secret leakage

### Frontend tests
- Permission matrix
- Effective permission viewer
- Scope selectors
- User filters
- Dangerous action confirmation
- Access denied states

---

## 45. Development Phases

### Phase 1 — Administration Foundation (P0)

Goal: turn Settings into a real Administration Center without destabilizing existing RBAC.

Deliverables:
- Administration information architecture
- Separate User Management page
- Improve Roles & Permissions UX
- Effective permissions read model
- Company/branch administration inventory and gap analysis
- Admin audit foundation for role/user changes
- Remove/move misplaced Finance entries from Administration navigation where appropriate

### Phase 2 — Scope-Aware Authorization (P0)

Deliverables:
- Scope model
- Company/branch assignments
- OWN_BRANCH / SELECTED_BRANCHES / REGION / COMPANY / TENANT enforcement
- Server-side reusable scope policies
- Effective scope viewer
- Cross-branch isolation tests

This phase is critical before adding broad enterprise administration.

### Phase 3 — Company, Branch & Organization Administration (P0/P1)

Deliverables:
- Legal entity/company settings
- Branch management
- Region hierarchy
- Branch lifecycle
- Manager assignments
- Organization references
- Working hours/operational settings foundation

Reuse HR organization concepts rather than creating incompatible duplicate hierarchies.

### Phase 4 — Security & Identity Administration (P1)

Deliverables:
- Invitation-based onboarding
- User status lifecycle
- Session management
- MFA policy foundation
- Security Center
- Temporary access
- Strong owner/last-admin protections

### Phase 5 — Approval & Policy Platform (P1)

Deliverables:
- Reusable approval workflow definitions
- Threshold/condition routing
- Delegation
- Versioning
- SoD policy foundation
- Business rule framework

Integrate Finance/HR/Procurement incrementally rather than rewriting their workflows all at once.

### Phase 6 — Audit, Privacy & Data Administration (P1/P2)

Deliverables:
- Audit Log Center
- Permission change audit
- Data import/export management
- Privacy/data governance settings
- Retention workflow foundation
- Sensitive data access reporting

### Phase 7 — Integration, Notification & Entitlement Administration (P2)

Deliverables:
- Integration catalog/health
- Notification policies
- Entitlement/feature visibility
- Numbering/sequences consolidation
- System health dashboard

### Phase 8 — Enterprise Governance (P2/P3)

Deliverables:
- Advanced field-level policies
- Access review/certification
- Break-glass access
- Advanced SoD
- Advanced security analytics
- Policy simulation
- Administrative risk insights

---

## 46. Recommended Implementation Order

Highest priority sequence:

1. Preserve and test current RBAC.
2. Split Users from Roles UI.
3. Introduce effective-permission read model.
4. Add scope-aware authorization model.
5. Add company/branch/region assignments.
6. Build Administration Center information architecture.
7. Add administrative audit events.
8. Add Company/Branch Administration.
9. Add invitation-based onboarding and security controls.
10. Build reusable Approval/Policy platform.
11. Add data/privacy/integration administration.
12. Add advanced field-level and governance capabilities.

Do not start with cosmetic Settings cards while authorization scope is still structurally incomplete.

---

## 47. Definition of Done

A major Administration feature is not complete unless:
- Tenant isolation is enforced server-side.
- Company/branch scope is enforced where applicable.
- Required permissions are checked server-side.
- Sensitive fields are protected where applicable.
- Critical mutations are audited.
- Concurrent changes cannot silently corrupt security state.
- Deactivation preserves historical records.
- Existing owner/admin cannot accidentally make the tenant unrecoverable.
- UI exposes understandable access state.
- Tests cover unauthorized and cross-scope access.
- Relevant docs/roadmap are updated.

---

## 48. Development Rules

When implementing this roadmap:
- Work on `feature/core-commerce-foundation` unless explicitly instructed otherwise.
- Never merge/push to `main` without explicit instruction.
- Inspect existing code, schema, migrations and tests before creating new models/services/endpoints.
- Do not recreate authorization, audit, company, branch, notification or workflow infrastructure if equivalent components already exist.
- Preserve tenant/company/branch isolation.
- Prefer incremental migrations over destructive rewrites.
- Security decisions must be enforced by backend policies/guards/services, not frontend visibility alone.
- Never expose or persist plaintext secrets unnecessarily.
- Update this roadmap when material architectural decisions or phases change.

---

## 49. Continuation Protocol

Use the following prompt when continuing Administration development in a new conversation:

```text
Repository: kaanb-wiascode/beauty
Development branch: feature/core-commerce-foundation

Read /docs/ADMINISTRATION-DEVELOPMENT-ROADMAP.md first.
Then inspect the current Settings/Administration frontend, roles, memberships, authentication/authorization guards, TenantContext, Prisma schema/migrations, audit infrastructure, company/branch models, tests and recent commits.
Do not assume roadmap tasks are incomplete; verify each item against the current repository.
Continue from the first incomplete item in the current Administration phase.
Preserve existing RBAC and extend it incrementally rather than replacing it without a verified reason.
Preserve tenant/company/branch isolation, permissions, idempotency where required, auditability and concurrency safety.
Do not create duplicate services, migrations, endpoints, workflows or UI when equivalents already exist.
Marketplace and Supplier Marketplace expansion remain out of scope unless explicitly requested.
After each logical increment, run relevant tests/typecheck/lint and commit to feature/core-commerce-foundation.
Do not merge to main unless explicitly instructed.
Update ADMINISTRATION-DEVELOPMENT-ROADMAP.md when a phase, architectural decision or major task materially changes.
```

---

## 50. Strategic Target

Administration must become the platform control plane for the entire ERP.

Target state:

```text
Tenant / Company / Branch / Organization
              ↓
Users / Memberships
              ↓
Roles / Permissions
              ↓
Scopes / Field Policies
              ↓
Business Policies / Approval Workflows
              ↓
Security / Audit / Privacy
              ↓
CRM + Appointments + Finance + HR + Academy + Reporting + Quality + Operations
```

The Administration module should answer, reliably and audibly:

> Who has access to what, in which company/branch, at what level, why, until when, and who changed that access?
