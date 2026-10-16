# HR Development Roadmap

## 1. Purpose

This document is the canonical development roadmap for the Human Resources domain of Beauty ERP.

It exists so that HR development can continue consistently across future conversations and development sessions without losing architectural intent.

Repository: `kaanb-wiascode/beauty`  
Development branch: `feature/core-commerce-foundation`

The repository is the source of truth for implementation. This document is the source of truth for HR product direction and intended architecture.

Before implementing any item in this roadmap, inspect the current code, migrations, APIs, UI, tests and recent commits. Do not assume a roadmap item is incomplete simply because it appears here.

---

## 2. Strategic Objective

The HR module must evolve from a basic personnel/payroll area into a complete workforce platform for beauty centers, aesthetic/medical aesthetic clinics, spas and multi-branch service businesses.

Target product statement:

> Manage the complete employee lifecycle from recruitment to exit, and connect workforce data with scheduling, competency, payroll, finance, customer operations and branch profitability.

The target is not only a generic HRIS. Beauty ERP should combine:

- Core HR
- Workforce management
- Payroll and compensation
- Talent management
- Employee self-service
- Performance management
- Beauty-sector competency and scheduling
- Finance and profitability integration
- HR analytics

---

## 3. Current HR Baseline

The active branch already contains a meaningful HR foundation.

### Current backend capabilities

Observed existing functionality includes:

- Employee records
- Personnel/profile fields
- Attendance records
- Leave requests
- Payroll periods
- Payroll items
- Salary payments
- SGK records
- Payroll accounting
- Payroll cost-center accounting
- Payroll settlement
- Payroll reversals
- Payroll payment reversals
- Payroll dashboards
- Payroll work inputs
- Payroll policy rules
- HR analytics

### Current payroll maturity

Payroll is one of the stronger HR areas.

Existing flows include:

- Payroll period creation
- Draft payroll items
- Gross and net amounts
- Income tax
- Stamp tax
- Employee social security
- Employer social security
- Employee unemployment contribution
- Employer unemployment contribution
- Other deductions
- Employer total cost
- Work input attachment
- Payroll policy evaluation
- Submit
- Approve
- Post
- Cancel
- Reverse
- Salary payment
- Legal liability settlement
- Payment reversal
- Accounting posting
- Cost-center accounting

This foundation should be preserved and extended instead of replaced.

### Current frontend capabilities

The HR area currently exposes surfaces for:

- HR dashboard
- Staff management
- Employee records
- Personnel files
- Attendance
- Leave
- Payroll dashboard
- Payroll
- Salary payments
- SGK

The HR dashboard also includes limited employee operational performance such as appointments and collected revenue.

---

## 4. Current Architectural Weaknesses

### 4.1 Staff profile JSON usage

A significant amount of employee master data currently lives inside `Staff.profile` JSON.

Examples include:

- personnel number
- identity number
- department
- position
- employment type
- hire date
- IBAN
- bank name
- salary
- salary type
- annual leave days
- used leave days
- pending leave days

This is acceptable as transitional architecture but should not remain the long-term source of truth for critical HR data.

Problems created by heavy JSON usage:

- weak validation
- weak referential integrity
- poor querying and filtering
- difficult historical tracking
- no strong uniqueness constraints
- harder reporting
- harder payroll and legal integration
- weak auditability
- schema drift

Critical employee data should gradually move into normalized domain models.

### 4.2 Personnel files are not yet a true document system

The current personnel-files surface is effectively employee data exposure rather than a full document management lifecycle.

A real personnel file domain is required.

### 4.3 Workforce management is incomplete

Attendance exists, but shift scheduling, workforce planning, overtime approval, shift exchange and resource-capacity planning are still missing or incomplete.

### 4.4 Employee lifecycle is incomplete

Recruitment, onboarding, transfer, promotion, probation, offboarding and alumni states are not yet modeled as a coherent employee lifecycle.

### 4.5 Performance is too narrow

Current employee performance primarily focuses on appointment activity and collections. A broader workforce performance model is required.

---

# 5. Target HR Architecture

```text
                     HR PLATFORM
                          │
       ┌──────────────────┼──────────────────┐
       │                  │                  │
     CORE HR           WORKFORCE           TALENT
       │                  │                  │
 Employee             Attendance          Recruitment
 Org Structure         Shifts              Onboarding
 Personnel Files       Leave               Training
 Compensation          Overtime            Competency
 Documents             Capacity            Performance
 Contracts             Scheduling          Career
 Benefits                                  Succession
       │
       ├──────────── PAYROLL & REWARDS
       │             Payroll
       │             Commissions
       │             Bonuses
       │             Benefits
       │             Advances
       │
       ├──────────── EMPLOYEE EXPERIENCE
       │             Self Service
       │             Manager Self Service
       │             Requests
       │             Surveys
       │             Recognition
       │
       └──────────── ANALYTICS & INTEGRATIONS
                     Finance
                     CRM
                     Appointments
                     Identity / Permissions
                     HR Analytics
```

---

# 6. Core HR Foundation

## 6.1 Employee Master Data

Create a normalized employee master model.

Target conceptual structure:

```text
Employee
├── Identity
├── Contact
├── Employment
├── Organization Assignment
├── Compensation
├── Banking
├── Emergency Contacts
├── Documents
├── Qualifications
├── Certifications
├── Dependants
└── Employment History
```

Recommended employee fields include:

- employee number
- first name
- last name
- national identity / foreign identity identifier
- date of birth
- work email
- personal email
- phone
- address
- emergency contact
- employment status
- employment type
- hire date
- termination date
- company
- branch
- department
- team
- position
- manager
- cost center

Sensitive personal data must be permission-scoped.

## 6.2 Organization Structure

Create first-class organizational entities instead of free-text department and position fields.

Target hierarchy:

```text
Tenant
└── Company
    └── Region
        └── Branch
            └── Department
                └── Team
                    └── Position
                        └── Employee
```

Support:

- department
- team
- job position
- position hierarchy
- manager relationships
- reporting line
- organization chart
- effective dates
- historical assignments

A reporting relationship should be modeled explicitly.

## 6.3 Employment History

Do not overwrite historical employment facts.

Track effective-dated history for:

- branch transfer
- department change
- manager change
- position change
- promotion
- demotion
- employment type change
- salary change
- cost center change

## 6.4 Employee 360

Create a central Employee 360 screen.

Target sections:

```text
Employee 360
├── Profile
├── Employment
├── Organization
├── Compensation
├── Attendance
├── Leave
├── Payroll
├── Payments
├── Commission
├── Performance
├── Appointments
├── Revenue
├── Training
├── Competencies
├── Certifications
├── Documents
├── Expenses
├── Advances
├── Assets
├── Cases / Disciplinary
└── History
```

This should become the primary employee operating surface.

---

# 7. Employee Lifecycle

Target lifecycle:

```text
Candidate
↓
Offer
↓
Preboarding
↓
Employee
↓
Onboarding
↓
Active Employment
↓
Transfer / Promotion
↓
Exit
↓
Offboarding
↓
Archived / Alumni
```

All lifecycle transitions must be auditable.

---

# 8. Recruitment / ATS

Add a recruitment and applicant tracking system.

## Core models

- Position Request
- Job Opening
- Candidate
- Application
- Interview
- Evaluation
- Offer
- Hiring Decision

## Candidate data

- candidate source
- CV / resume
- applied role
- branch
- experience
- salary expectation
- interview notes
- interviewer scores
- documents
- offer data
- rejection reason

## Suggested pipeline

```text
Applied
↓
Screening
↓
Interview
↓
Assessment
↓
Offer
↓
Hired
```

Support configurable pipelines later.

### Beauty-specific role templates

Examples:

- Esthetician
- Senior Esthetician
- Laser Technician
- Beauty Consultant
- Sales Consultant
- Branch Manager
- Doctor
- Nurse / Clinical Staff
- Training Specialist

---

# 9. Onboarding

Build checklist-based onboarding plans.

Example:

```text
New Esthetician Onboarding

- Employment contract
- Identity document
- Bank details
- SGK registration
- KVKK documents
- Uniform assignment
- User account creation
- Branch assignment
- Device training
- Service training
- Occupational safety training
- Mentor assignment
- 30-day evaluation
```

Each onboarding task should support:

- owner
- due date
- status
- required document
- automation
- dependencies
- completion audit

Support onboarding templates by position, branch and employment type.

---

# 10. Probation Management

Add probation management.

Support:

- probation start/end
- 30/60/90 day reviews
- manager evaluation
- HR evaluation
- confirmation decision
- extension where policy permits
- reminders before probation end

Probation status must appear on Employee 360 and HR calendars.

---

# 11. Offboarding

Target workflow:

```text
Exit Request
↓
Approval
↓
Final Payroll
↓
Unused Leave Settlement
↓
Advance / Debt Settlement
↓
Asset Return
↓
Access Revocation
↓
Documents
↓
Exit Interview
↓
Archive
```

Offboarding should automatically integrate with:

- user access
- future shifts
- appointment availability
- payroll
- advances
- expenses
- asset assignments
- document generation

Employee termination must never leave active system access unintentionally.

---

# 12. Personnel Files / HR Document Management

Build a real employee document system.

Supported document types should include configurable categories, with initial templates for:

- identity document
- diploma
- professional certificate
- employment contract
- SGK documents
- health report
- criminal record document
- residence document
- photo
- KVKK acknowledgement
- consent forms
- asset assignment forms
- leave forms
- warning/disciplinary documents
- termination documents

Suggested document metadata:

```text
type
number
issuedAt
expiresAt
status
file
verifiedAt
verifiedBy
notes
```

Support:

- expiry warnings
- missing document detection
- verification status
- versioning
- restricted access

---

# 13. Certification & Credential Management

Especially important for medical aesthetic / clinic scenarios.

Track:

- certification type
- qualification
- issuing organization
- issue date
- expiry date
- status
- evidence file
- service eligibility

Example automation:

```text
Certification expiry in 30 days
↓
Employee warning
↓
Manager warning
↓
HR task
```

Certain services should require valid competencies or certifications.

---

# 14. Competency Management

Create a competency matrix.

Example:

```text
Alexandrite Laser       5/5
Diode Laser             4/5
Skin Care               5/5
Sales                   3/5
Customer Communication  4/5
```

Support:

- competency catalog
- competency groups
- role requirements
- employee competency level
- assessor
- assessment date
- validity / expiry
- evidence

Beauty-specific competencies should be usable by appointment scheduling.

Target integration:

```text
HR Competency
↓
Appointment Resource Engine
```

The system should be able to answer:

> Is this employee authorized and competent to perform this service?

---

# 15. Training Management

Build an LMS-lite layer.

Support:

- training programs
- courses
- sessions
- trainers
- participants
- training materials
- exams / assessments
- scores
- attendance
- certificates
- validity periods
- mandatory training rules

Training completion can automatically update employee competencies and certificates.

---

# 16. Workforce Scheduling

Attendance is not sufficient by itself. Create a workforce scheduling engine.

## Shift concepts

- shift template
- scheduled shift
- employee assignment
- branch
- start/end
- break policy
- role requirement
- service competency requirement

Example shifts:

```text
09:00–18:00
10:00–19:00
12:00–21:00
```

Support:

- weekly schedules
- recurring shifts
- holiday schedules
- leave conflicts
- overtime implications
- open shifts
- manager approval

---

# 17. Time & Attendance Hardening

Current attendance already supports:

- check-in
- check-out
- break
- worked minutes
- overtime minutes
- attendance status

Extend with:

- scheduled shift comparison
- late arrival
- early departure
- missing punch
- absence
- approved overtime
- holiday work
- weekly rest
- exception status
- correction workflow

Every manual attendance correction must be audited with:

- actor
- previous value
- new value
- reason
- timestamp

---

# 18. Overtime Management

Do not treat overtime only as a numeric field.

Target lifecycle:

```text
Overtime Request / Detection
↓
Manager Review
↓
HR Approval
↓
Approved Overtime
↓
Payroll Input
```

Support:

- requested overtime
- detected overtime
- approved overtime
- rejected overtime
- payroll treatment
- time-off-in-lieu where configured

---

# 19. Shift Swap / Shift Bidding

Support employee-driven scheduling operations later.

### Shift Swap

```text
Employee A requests swap
↓
Employee B accepts
↓
Manager approves
↓
Schedule updated
```

### Open Shift / Bidding

Employees can request available shifts subject to:

- working time rules
- branch eligibility
- competency
- overtime limits
- manager approval

---

# 20. Capacity Planning

Beauty ERP should provide workforce-capacity intelligence linked to appointments.

Example:

```text
Bakırköy
Saturday 14:00–18:00

Demand: 23 service-hours
Available qualified staff: 15 service-hours
Shortage: 8 hours
```

Use:

- appointments
- services
- employee skills
- shifts
- leave
- utilization

Target decision support:

> Two additional qualified employees are needed for this window.

This should eventually influence scheduling and workforce planning.

---

# 21. Skill-Based Scheduling

Shift and appointment planning should not only ask whether an employee is available.

It should also check:

- competency
- valid certification
- branch assignment
- role
- scheduled shift
- leave
- maximum workload

This is a strategic Beauty ERP differentiator.

---

# 22. Leave Management

Replace simple leave records with a policy-driven leave engine.

Core concepts:

```text
Leave Type
Leave Policy
Entitlement
Accrual
Carry-over
Leave Request
Approval
Balance
```

Example:

```text
Annual Leave
Entitled: 20
Used: 8
Pending: 2
Remaining: 10
```

Support:

- annual leave
- sick leave
- unpaid leave
- maternity/paternity related policy types where applicable
- compassionate leave
- custom company leave types

Policy rules may depend on:

- seniority
- company
- employment type
- role
- branch

Do not hardcode changing legal entitlements in core business logic. Legal policy values should be configurable and periodically verified against current regulations before production use.

---

# 23. Approval Workflow

HR workflows need reusable approval policies.

Examples:

### Leave

```text
Employee
↓
Manager
↓
HR
```

### Advance

```text
Employee
↓
Manager
↓
Finance
```

### Overtime

```text
Employee / Manager
↓
Branch Manager
↓
HR
```

Create a reusable approval engine rather than implementing custom status logic repeatedly in each module.

Requirements:

- configurable steps
- role-based approvers
- manager-based approvers
- amount-based rules where relevant
- approve
- reject
- return for correction
- comments
- delegation
- escalation
- audit history

---

# 24. Employee Self-Service

Build an employee portal.

Employees should be able to:

- view profile
- view employment information
- view salary/payroll documents subject to permissions
- view leave balance
- request leave
- view shifts
- request shift swaps
- view training
- view certifications
- submit expense claims
- request advances
- view assigned assets
- download eligible documents
- submit profile/bank-change requests

Do not allow unrestricted direct editing of sensitive or payroll-critical fields.

Use request-and-approval where appropriate.

---

# 25. Manager Self-Service

Managers should see only employees within their authorized organizational scope.

Manager capabilities may include:

- team members
- leave approvals
- overtime approvals
- shift planning
- attendance exceptions
- performance reviews
- goals
- onboarding tasks
- training status
- capacity alerts

Central HR can operate across broader scopes according to permissions.

---

# 26. Compensation Management

Salary must not remain only a mutable value in employee profile data.

Create effective-dated compensation structures.

## Compensation package

```text
Base Salary
Variable Pay
Commission
Bonus
Meal Benefit
Transport Benefit
Private Insurance
Allowances
Other Benefits
```

## Compensation history

Example:

```text
2026-01-01   35,000
2026-07-01   42,000
2027-01-01   52,000
```

Historical compensation records must not be overwritten.

Support:

- effective date
- end date
- currency
- salary type
- pay frequency
- reason
- approved by

---

# 27. Benefits Management

Add benefits as a first-class domain.

Examples:

- meal
- transport
- private health insurance
- fuel
- shuttle
- phone
- vehicle
- allowances
- bonuses
- flexible benefits later

Benefits may affect:

- payroll
- employer cost
- employee total reward
- finance obligations

---

# 28. Commission & Incentive Engine

Beauty-sector payroll requires a flexible commission engine.

Possible commission bases:

- service revenue
- package sales
- product sales
- collections
- new customers
- targets
- team targets
- branch targets

Example:

```text
Laser Service       5%
Package Sale        7%
Retail Product     10%
Monthly > 500K     +5,000 TRY
```

Target integration:

```text
Sale / Payment / Performance
↓
Commission Engine
↓
Approved Variable Earnings
↓
Payroll
```

Requirements:

- rule versioning
- effective dates
- branch scope
- employee/role scope
- service/package/product scope
- calculation trace
- approval
- reversal on refund where policy requires
- payroll integration

Commission computation must be auditable.

---

# 29. Bonus & Reward Management

Separate discretionary rewards from automatic commission rules.

Support:

- one-time bonus
- performance bonus
- team bonus
- branch bonus
- recognition award

All financial rewards must create traceable payroll or finance inputs rather than silently changing salary.

---

# 30. Employee Advances

Employee advances should be shared between HR and Finance.

Target lifecycle:

```text
Advance Request
↓
Manager Approval
↓
Finance Approval
↓
Payment
↓
Employee Advance Balance
↓
Payroll Deduction / Settlement
↓
Closed
```

Employee 360 should show:

- advances granted
- repaid amount
- payroll deduction
- outstanding balance

Do not model advances as ordinary expenses.

---

# 31. Employee Expense Claims

Target flow:

```text
Employee Expense Claim
↓
Manager Approval
↓
Finance Approval
↓
Accounting
↓
Reimbursement
```

Support:

- expense category
- receipt/document
- amount
- currency
- cost center
- project
- branch
- travel link
- policy validation

This should integrate with the Finance roadmap rather than duplicate financial logic.

---

# 32. Travel & Expense

Create business trip management.

Suggested data:

```text
Employee
Origin
Destination
Reason
Start Date
End Date
Advance
Daily Allowance
Hotel Budget
Transport Budget
Approver
```

Settlement example:

```text
Advance Given      15,000
Approved Expenses  12,700
Difference          2,300
```

The system should resolve the difference as employee receivable/payable according to policy.

---

# 33. Payroll Evolution

Current payroll architecture should be preserved and strengthened.

Future inputs should automatically feed payroll from:

- attendance
- approved overtime
- unpaid leave
- commissions
- bonuses
- advances
- deductions
- benefits
- expense reimbursements where applicable

Target flow:

```text
Workforce Inputs
+ Compensation
+ Commission
+ Adjustments
↓
Payroll Calculation
↓
Review / Exceptions
↓
Submit
↓
Approve
↓
Post
↓
Accounting
↓
Salary Payment
↓
Legal Liability Settlement
```

---

# 34. Payroll Exception Center

Add a payroll pre-close exception inbox.

Examples:

- missing attendance
- unapproved overtime
- negative leave balance
- missing IBAN
- duplicate payroll input
- invalid compensation
- unusually high overtime
- missing cost center
- incomplete termination settlement
- unresolved advance deduction

Payroll should not post while blocking exceptions remain unresolved unless a privileged override policy exists and is audited.

---

# 35. Contracts

Create employment contract management.

Support:

- permanent contract
- fixed-term contract
- contractor agreement
- addendum
- salary amendment
- working-time amendment
- effective dates
- renewal date
- termination date
- document linkage

Contract renewal reminders should feed the HR inbox and calendar.

---

# 36. Contractor / Freelance Workforce

Beauty businesses may use temporary or non-employee professionals.

Support worker types such as:

- employee
- contractor
- freelancer
- consultant
- temporary worker

Do not force all workers into employee payroll semantics.

Access, scheduling, competency and payment behavior should depend on worker type.

---

# 37. Performance Management

Do not reduce performance to revenue alone.

Possible performance metrics:

```text
Revenue
Collected Revenue
Appointment Count
Completed Services
Utilization
Rebooking Rate
Retail Sales
Package Sales
Conversion Rate
Customer Rating
Complaint Rate
No-show Recovery
Attendance
Training Completion
Manager Evaluation
```

Metrics should be configurable by role.

---

# 38. Goals / KPI Management

Support employee and team goals.

Example:

```text
Revenue          500,000 TRY
Package Sales             25
Rebooking                65%
Customer Rating          4.7
```

Dashboard should show actual vs target.

Goals should support:

- employee
- team
- branch
- role
- monthly/quarterly/annual periods
- weights
- stretch targets

---

# 39. Performance Reviews

Create structured review cycles.

Support:

- employee self-review
- manager review
- competency review
- goal review
- achievements
- development areas
- final score
- development plan

Later support:

- 360 feedback
- calibration

---

# 40. Career Management

Create configurable career paths.

Example:

```text
Esthetician
↓
Senior Esthetician
↓
Expert
↓
Training Specialist / Branch Lead
↓
Branch Manager
```

Support:

- target roles
- required competencies
- required certifications
- minimum experience
- development plan

---

# 41. Succession Planning

For critical roles, track potential successors.

Support:

- critical position
- nominated successor
- readiness level
- succession risk
- development gaps
- target readiness date

This is lower priority than Core HR and Workforce but valuable for multi-branch enterprises.

---

# 42. Employee Surveys & Engagement

Support anonymous or identified surveys according to use case.

Examples:

- pulse survey
- engagement survey
- manager feedback
- onboarding feedback
- exit survey
- eNPS

Analytics should focus on organization-level trends rather than inferring sensitive individual health conditions.

---

# 43. Recognition & Rewards

Create lightweight recognition capabilities.

Possible sources:

- customer satisfaction
- sales achievement
- training success
- teamwork
- service quality
- manager recognition

Recognition can be non-financial or optionally linked to an approved reward/bonus workflow.

---

# 44. Employee Case Management

Create a controlled employee relations / HR case system.

Examples:

- employee complaint
- payroll dispute
- leave dispute
- policy question
- disciplinary case
- grievance

Suggested workflow:

```text
OPEN
↓
IN_REVIEW
↓
ACTION_REQUIRED
↓
RESOLVED
↓
CLOSED
```

Cases require stricter permissions than ordinary HR records.

---

# 45. Disciplinary / Employee Relations

Support configurable records such as:

- incident
- written explanation request
- warning
- disciplinary decision
- corrective action

Do not make disciplinary data visible to ordinary managers unless they are explicitly authorized for the relevant case.

---

# 46. Occupational Health & Safety

Potential later domain:

- occupational safety training
- health examination tracking
- work accident records
- mandatory safety certification
- renewal dates
- incident follow-up

This domain should be designed carefully because it can involve sensitive personal information.

---

# 47. Asset / Assignment Management

Track items issued to employees.

Examples:

- laptop
- phone
- tablet
- keys
- access card
- uniforms
- equipment

Lifecycle:

```text
Asset
↓
Assigned to Employee
↓
Acknowledged
↓
Returned
```

Offboarding must check unresolved asset assignments.

---

# 48. Policy Acknowledgement

Allow the business to publish internal policies and record acceptance.

Examples:

- information security
- workplace rules
- dress code
- device policy
- customer privacy
- KVKK-related internal policies

Record:

- policy version
- employee
- acknowledged timestamp
- evidence

Never overwrite acceptance history when the policy changes.

---

# 49. Electronic Document Workflow

Prepare HR documents for electronic approval/signature providers later.

Potential documents:

- employment contract
- onboarding forms
- asset assignment
- leave forms
- policy acknowledgement
- training attendance

Keep the core document domain provider-independent.

---

# 50. HR Calendar

Create a unified HR calendar containing:

- hire dates
- termination dates
- birthdays where permitted by company policy
- employment anniversaries
- probation deadlines
- certification expiry
- contract renewal
- training dates
- payroll deadlines
- legal liability deadlines
- leave

Calendar events should respect user permissions.

---

# 51. HR Inbox / Action Center

Create one operational inbox for HR tasks and exceptions.

Possible items:

- leave approval
- advance request
- expense approval
- overtime approval
- missing document
- expiring certification
- onboarding task
- probation review
- payroll exception
- contract renewal
- offboarding task
- HR case

This should become the primary daily workflow for HR managers.

---

# 52. HR Event Architecture

Use domain events to connect HR with other modules.

Example events:

```text
EMPLOYEE_HIRED
EMPLOYEE_UPDATED
EMPLOYEE_TRANSFERRED
EMPLOYEE_PROMOTED
EMPLOYEE_TERMINATED
LEAVE_APPROVED
OVERTIME_APPROVED
SHIFT_ASSIGNED
PAYROLL_POSTED
PAYROLL_PAID
CERTIFICATION_EXPIRING
ONBOARDING_COMPLETED
OFFBOARDING_COMPLETED
```

Example automation:

```text
EMPLOYEE_TERMINATED
↓
Disable User
↓
Cancel Future Shifts
↓
Remove Appointment Availability
↓
Launch Offboarding
↓
Final Payroll
```

Events must preserve tenant/company/branch context and be idempotent where downstream financial or operational side effects are possible.

---

# 53. HR + Appointment Integration

Important Beauty ERP differentiator.

Appointment eligibility should eventually use:

- employee status
- branch assignment
- shift
- leave
- competency
- valid certification
- workload

The scheduler should not assign a service to an employee who is unavailable, unauthorized or uncertified for that service.

---

# 54. HR + Finance Integration

Shared areas include:

- salary expense
- employer cost
- commissions
- bonuses
- employee advances
- expense reimbursements
- legal liabilities
- benefits
- travel expense

Avoid duplicate financial truth.

HR generates approved workforce/compensation facts. Finance owns payment, treasury, accounting and reconciliation facts where applicable.

---

# 55. Workforce Cost Analytics

Target analytics:

```text
Branch Revenue
- Payroll
- Employer Contributions
- Commission
- Benefits
= Workforce Contribution
```

Example:

| Branch | Workforce Cost | Revenue | Workforce/Revenue |
|---|---:|---:|---:|
| Bakırköy | 850K | 3.8M | 22% |
| Kadıköy | 920K | 3.1M | 30% |

Support:

- cost per employee
- cost per FTE
- revenue per employee
- revenue per FTE
- cost by department
- cost by branch
- cost by role

---

# 56. Labor Cost Forecasting

Forecast future workforce cost from:

- salaries
- planned hires
- planned terminations
- expected salary increases
- benefits
- commissions
- overtime
- employer contributions

Provide 3/6/12-month scenarios later.

Feed results to Finance/CFO cash-flow planning.

---

# 57. Headcount Planning

Allow target staffing plans by:

- branch
- department
- team
- role

Example:

```text
Kadıköy Target
6 Estheticians
2 Sales Consultants
1 Branch Manager
```

System should show:

- current headcount
- target headcount
- vacancies
- overstaffing
- planned hires

---

# 58. Workforce Scenario Planning

Later support scenarios such as:

- new branch opening
- extended opening hours
- adding Sunday operations
- reducing a shift
- changing staffing model

Output:

- required FTE
- payroll impact
- utilization impact
- branch profitability impact

---

# 59. HR Analytics

Target dashboards should include:

- headcount
- active workers
- new hires
- exits
- turnover
- absenteeism
- overtime
- leave usage
- payroll cost
- employer cost
- cost per employee
- revenue per employee
- revenue per FTE
- utilization
- training completion
- certification compliance
- performance distribution
- vacancies
- time-to-hire
- onboarding completion

All analytics must respect tenant/company/branch/role scope.

---

# 60. Beauty-Specific Employee Economic Performance

Beauty ERP should calculate more than traditional HR performance.

Potential metrics:

- service revenue
- package revenue
- retail revenue
- collections
- commission cost
- worked hours
- booked hours
- utilized hours
- revenue/hour
- contribution/hour
- rebooking rate
- customer rating
- complaint rate

This makes HR, scheduling and finance materially more valuable together.

---

# 61. Geographic / Device Attendance Integrations

Potential future integrations:

- QR attendance
- kiosk check-in
- turnstile systems
- approved attendance devices

Location or biometric processing requires separate privacy, security and legal review before implementation.

Do not add biometric collection casually.

---

# 62. Data Privacy and Retention

HR contains highly sensitive information.

Requirements:

- strict role permissions
- field-level protection where necessary
- audit logs
- document access controls
- no accidental exposure in exports
- retention policies
- archive policies
- anonymization/deletion workflows where legally appropriate
- secure handling of bank information

Do not log sensitive values unnecessarily.

---

# 63. HR Audit Trail

Every high-impact HR modification should be auditable.

Examples:

- compensation change
- IBAN change
- department/manager change
- employment status change
- leave balance adjustment
- payroll change
- approval decision
- attendance correction
- document verification
- termination

Audit data should record:

- actor
- timestamp
- action
- entity
- previous state or meaningful diff
- new state or meaningful diff
- reason where required

---

# 64. Security Principles

- Preserve tenant isolation.
- Preserve company isolation.
- Preserve branch scope.
- Sensitive HR fields require appropriate permissions.
- Employees must not access other employees' private records.
- Managers may only access their authorized organization scope.
- Payroll and compensation should have stricter permissions than general employee directory data.
- Disciplinary and case-management data requires additional access control.
- Do not expose credentials or secrets.
- Do not store external service credentials in plaintext.

---

# 65. Recommended HR Menu Architecture

```text
HUMAN RESOURCES

Overview
Employees
Organization
Personnel Files

WORKFORCE
Shifts
Attendance
Leave
Overtime
Capacity Planning

COMPENSATION & PAYROLL
Compensation
Payroll
Commission & Incentives
Salary Payments
SGK / Legal Liabilities
Advances
Benefits

TALENT
Recruitment
Onboarding
Performance
Goals
Training
Competencies
Certifications
Career & Succession

EMPLOYEE OPERATIONS
Expenses
Travel
Assets
Documents
Cases
Offboarding

ANALYTICS
Headcount
Workforce Cost
Turnover
Performance
Attendance
Capacity
```

Navigation should remain permission-aware.

---

# 66. Development Phases

## Phase 1 — Core HR Foundation

Priority: P0

Objectives:

- Normalize critical employee master data
- Introduce organization structure
- Department / team / position
- Manager relationships
- Employment history
- Compensation history foundation
- Employee 360
- Personnel document foundation
- HR audit foundation

Do this before building large amounts of new UI around the existing JSON profile model.

## Phase 2 — Workforce Management

Priority: P0/P1

Objectives:

- Shift templates
- Shift scheduling
- Attendance vs schedule comparison
- Attendance exceptions
- Overtime workflow
- Leave policy engine
- Leave balances
- Approval workflows
- Capacity planning foundation
- Skill-based availability integration

## Phase 3 — Compensation & Payroll Integration

Priority: P1

Objectives:

- Compensation packages
- Effective-dated salary history
- Benefits
- Commission engine
- Bonus management
- Advance integration
- Payroll exception center
- Automated payroll inputs from attendance/leave/overtime/commission
- Preserve existing payroll posting and accounting architecture

## Phase 4 — Employee & Manager Self-Service

Priority: P1

Objectives:

- Employee portal
- Manager portal
- Leave requests
- Shift views
- Shift swap requests
- Payroll document access
- Profile change requests
- Advance requests
- Expense requests
- Approval center

## Phase 5 — Talent & Lifecycle

Priority: P1/P2

Objectives:

- Recruitment / ATS
- Candidate pipeline
- Offer flow
- Onboarding
- Probation
- Offboarding
- Training
- Certification
- Competency management
- Contracts

## Phase 6 — Performance & Development

Priority: P2

Objectives:

- KPI engine
- Goals
- Performance reviews
- Beauty-specific operational performance
- Development plans
- Career paths
- Succession planning
- Recognition

## Phase 7 — HR Analytics & Intelligence

Priority: P2/P3

Objectives:

- Headcount analytics
- Turnover
- Absence analytics
- Workforce cost
- Revenue/FTE
- Capacity utilization
- Time-to-hire
- Training compliance
- Workforce planning
- Labor cost forecasting
- Scenario planning
- HR management insights

AI-based insights should come only after clean historical data and stable deterministic metrics exist.

---

# 67. Priority Backlog

## P0

- Employee master normalization
- Organization model
- Position / department / manager relations
- Employment history
- Employee 360
- Leave policy/balance foundation
- Shift foundation
- Attendance hardening
- HR audit foundation

## P1

- Overtime approvals
- Capacity planning
- Compensation history
- Commission engine
- Benefits
- Employee self-service
- Manager self-service
- Personnel document management
- Onboarding/offboarding
- Payroll exception center

## P2

- Recruitment ATS
- Training
- Competencies
- Certifications
- Performance reviews
- Goals
- Career
- Succession
- Employee case management
- Surveys
- Recognition

## P3

- Advanced workforce scenario planning
- Advanced succession
- sophisticated AI insights
- external attendance hardware integrations
- electronic signature provider integrations

---

# 68. Testing Requirements

Every HR development slice should include relevant tests.

Minimum considerations:

- tenant isolation
- company isolation
- branch isolation
- manager scope
- permissions
- employee self-service scope
- state transitions
- duplicate protection
- payroll idempotency
- approval concurrency
- audit log creation
- financial side-effect idempotency

Important HR flows should have service/integration tests.

Examples:

- employee hire
- transfer
- leave approval
- attendance correction
- payroll post
- payroll reverse
- commission generation
- employee termination
- offboarding access revocation

---

# 69. Concurrency and Integrity

High-risk operations must use transactions and appropriate locking/versioning.

Examples:

- payroll posting
- payroll reversal
- salary payment
- salary payment reversal
- commission finalization
- leave balance consumption
- employee transfer with schedule implications
- offboarding

Do not rely on frontend state to guarantee financial or HR integrity.

---

# 70. Observability

Track important HR workflow failures and health metrics.

Examples:

- failed payroll posting
- failed accounting handoff
- unprocessed HR events
- failed employee access revocation
- expired required certification
- unresolved payroll exceptions
- stale onboarding tasks

Use structured logs without leaking sensitive employee data.

---

# 71. Definition of HR Platform Completion

HR 2.0 is considered materially complete when the platform can support this journey end-to-end:

```text
Recruit Candidate
↓
Hire Employee
↓
Complete Onboarding
↓
Assign Organization / Branch / Position
↓
Assign Competencies / Training
↓
Schedule Shifts
↓
Track Attendance & Leave
↓
Measure Performance
↓
Calculate Salary / Commission
↓
Post Payroll
↓
Pay Salary & Liabilities
↓
Feed Finance / Profitability
↓
Manage Career / Transfer / Promotion
↓
Offboard Employee
↓
Archive with Full Audit Trail
```

And the system can answer reliably:

- Who works where?
- Who reports to whom?
- Who is available?
- Who is qualified for which services?
- Who is on leave?
- What is each employee's cost?
- What is each employee's economic contribution?
- What payroll obligations exist?
- What certifications are expiring?
- What approvals need action?
- Which branches are under/over staffed?

---

# 72. Development Rules

1. Never merge or push directly to `main` unless explicitly instructed.
2. Continue development on `feature/core-commerce-foundation` unless explicitly changed.
3. Inspect existing models, services, endpoints, migrations and UI before creating new ones.
4. Do not duplicate existing payroll/accounting capabilities.
5. Prefer incremental schema evolution.
6. Preserve tenant/company/branch isolation.
7. Treat HR information as sensitive by default.
8. Preserve idempotency and auditability for payroll/finance side effects.
9. Prefer effective-dated history over destructive overwrites for employment/compensation facts.
10. Keep legal policy values configurable where regulations may change.
11. Reuse common approval, document, audit and workflow infrastructure instead of creating module-specific duplicates.
12. Update this roadmap when major architecture or scope decisions materially change.

---

# 73. Continuation Protocol for Future Chats

At the beginning of a future HR development session, use the following context:

```text
Repository: kaanb-wiascode/beauty
Development branch: feature/core-commerce-foundation

Read /docs/HR-DEVELOPMENT-ROADMAP.md first.
Then inspect the current HR code, database schema, migrations, frontend routes, tests and recent commits before making changes.
Do not assume roadmap tasks are still incomplete; verify each item in code.
Continue from the first incomplete item in the current HR phase.
Preserve existing payroll/accounting capabilities unless a verified defect requires change.
Preserve tenant/company/branch isolation, permissions, idempotency, auditability and concurrency safety.
Do not create duplicate services, migrations, endpoints, workflows or UI if equivalents already exist.
After each logical increment, run relevant tests/typecheck/lint and commit to feature/core-commerce-foundation.
Do not merge to main unless explicitly instructed.
Update HR-DEVELOPMENT-ROADMAP.md when a phase, architectural decision or major task materially changes.
```

Suggested user prompt for a new conversation:

```text
kaanb-wiascode/beauty reposunda feature/core-commerce-foundation branch'ine eriş.
Önce /docs/HR-DEVELOPMENT-ROADMAP.md dosyasını oku.
Mevcut İK kodlarını, veritabanı şemasını ve son commitleri roadmap ile karşılaştır.
Tamamlanmış işleri tekrar yapma.
İlk tamamlanmamış HR maddesinden geliştirmeye devam et.
```

---

# 74. Roadmap Maintenance

This file is a living roadmap.

When implementation materially changes the HR architecture:

- update completed/in-progress scope
- record significant design decisions
- remove superseded recommendations
- add new dependencies
- keep the continuation protocol valid

The roadmap should remain detailed enough that a new development conversation can resume without relying on chat memory.
