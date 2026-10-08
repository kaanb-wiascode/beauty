# VALOO — Healthcare Capability & Regulatory Architecture

> Status: Canonical architectural baseline
> Scope: Organization classification, dynamic capabilities, healthcare verticals, regulatory profiles, workflow/UI adaptation and integration boundaries.

## 1. Objective

VALOO must support different organization types without forking the product or weakening the current ERP architecture. Beauty salons, spas, clinics, medical centers, hospitals and suppliers share a common platform core but require different capabilities, workflows, permissions, documents and compliance obligations.

The target architecture is:

```text
VALOO Core
  -> Organization Classification
  -> Regulatory Profile
  -> Capability Engine
  -> Authorization / Permissions
  -> Workflow Policies
  -> Dynamic UI / Navigation
```

The core rule is: organization type changes configuration and allowed behavior; it must not create duplicated ERP systems.

## 2. Product Surfaces

The same platform may present different vertical experiences:

- VALOO Beauty — beauty centers, salons, hairdressers, nail/lash/brow, spa/wellness.
- VALOO Clinic — medical aesthetic clinics, dermatology-oriented clinics, hair-transplant clinics, outpatient clinical organizations and similar permitted healthcare providers.
- VALOO Hospital Ops — hospital operational ERP layer, procurement, asset/biomedical equipment, workforce, finance, quality and integrations.
- VALOO Supplier — supplier organizations, manufacturers, distributors, importers and service providers.

These are product experiences over shared platform capabilities, not independent databases or unrelated products.

## 3. Shared Core Must Remain Stable

The following remain common platform domains unless a future architectural decision explicitly changes ownership:

- Tenant / Company / Branch
- Identity / RBAC / Audit
- CRM foundation
- Finance / Accounting
- HR / Payroll
- Inventory / Warehouse
- Procurement
- Payments
- Reporting
- Integrations
- Marketplace / Supplier Network boundaries already documented elsewhere

Healthcare-specific modules must extend these domains through explicit relationships and policies rather than replacing them.

## 4. Organization Classification

Organization classification must be explicit and versionable.

Recommended model:

```text
OrganizationProfile
  - sector
  - businessType
  - facilityType (optional)
  - countryCode
  - regulatoryProfileId
  - capabilityProfileId
  - effectiveFrom
  - effectiveTo (optional)
```

Initial sector examples:

- BEAUTY
- WELLNESS
- HEALTHCARE
- SUPPLIER

Initial business-type examples may include:

- BEAUTY_CENTER
- HAIR_SALON
- NAIL_STUDIO
- SPA
- WELLNESS_CENTER
- MEDICAL_AESTHETIC_CLINIC
- POLYCLINIC
- MEDICAL_CENTER
- PRIVATE_HOSPITAL
- LABORATORY
- SUPPLIER_ORGANIZATION

The exact legal taxonomy must be maintained from verified regulatory sources and must not be hard-coded permanently into UI conditionals.

## 5. Capability Engine

Capabilities are explicit product/operational abilities that can be activated by organization profile, subscription, license state, permission and policy.

Example capabilities:

```text
CRM
APPOINTMENTS
PACKAGES
SESSIONS
POS
INVENTORY
PROCUREMENT
ACCOUNTING
PATIENT_PROFILE
CLINICAL_ENCOUNTER
CLINICAL_DOCUMENTS
CONSENT_MANAGEMENT
TREATMENT_PLAN
ASSET_MANAGEMENT
BIOMEDICAL_MAINTENANCE
FACILITY_MANAGEMENT
QUALITY_MANAGEMENT
HOSPITAL_INTEGRATIONS
```

A capability result must be evaluated centrally. Avoid code such as:

```text
if businessType == HOSPITAL ...
```

scattered across controllers, services and screens.

Target evaluation:

```text
OrganizationProfile
+ RegulatoryProfile
+ SubscriptionEntitlements
+ UserPermissions
+ RuntimeConditions
= EffectiveCapabilities
```

## 6. Regulatory Profile

A RegulatoryProfile represents the policy context applicable to an organization/facility.

Suggested concepts:

```text
RegulatoryAuthority
RegulationReference
RequirementDefinition
LicenseRequirement
DocumentRequirement
RoleRequirement
ServiceEligibilityRule
EquipmentRequirement
DataHandlingRule
RetentionRule
InspectionRequirement
```

Regulatory data must be versioned with effective dates because laws, regulations, communiques and administrative requirements may change.

Do not embed legal conclusions directly into application code when they can be expressed as versioned policy data.

## 7. Regulatory Rules Engine

The Regulatory Rules Engine answers questions such as:

- Is this capability allowed for this organization type?
- Does this service require a healthcare facility profile?
- Is an eligible practitioner required?
- Is a license/document missing or expired?
- Does this transaction require consent?
- Does this device require maintenance/calibration evidence before use?
- Is this product/category restricted for this buyer/seller combination?

Rules should return structured outcomes:

```text
ALLOW
DENY
ALLOW_WITH_WARNING
REQUIRE_APPROVAL
REQUIRE_DOCUMENT
REQUIRE_ROLE
REQUIRE_LICENSE
```

All critical decisions must be auditable.

## 8. Dynamic Navigation and Screens

Frontend navigation must be generated from effective capabilities and permissions.

Example Beauty profile:

- CRM
- Appointments
- Services
- Packages/Sessions
- POS/Payments
- Inventory
- Procurement
- Finance

Example Clinic profile additionally exposes:

- Patient Profile
- Clinical Encounter
- Clinical Documents
- Consent
- Treatment Plan
- Practitioner-related workflows

Example Hospital Ops profile may additionally expose:

- Facility / Department
- Asset / Biomedical Equipment
- Maintenance
- Quality
- Advanced Procurement
- Integration Hub

A hidden screen is not a security control. Backend authorization and policy checks remain mandatory even when a menu item is not shown.

## 9. Workflow Policy Engine

Workflows may vary by organization type without duplicating entire services.

Examples:

Beauty:

```text
Customer -> Appointment -> Service -> Sale/Payment
```

Clinic:

```text
Patient -> Appointment -> Encounter -> Consent -> Procedure/Treatment -> Billing
```

Hospital Ops:

```text
Patient/External Clinical System -> Operational Event -> Department/Resource -> Billing/Procurement/Asset/Quality integrations
```

Workflows should be policy-driven where practical and state transitions must remain transaction-safe.

## 10. Customer vs Patient Boundary

Do not assume ERP `Customer` and healthcare `Patient` are identical concepts.

Recommended direction:

- keep existing Customer domain intact,
- introduce PatientProfile/ClinicalIdentity in Healthcare bounded context,
- link identities explicitly where required,
- keep clinical data out of generic CRM projections and public marketplace APIs.

Healthcare data requires stricter access-purpose auditing and should not become broadly visible merely because a user has ordinary CRM access.

## 11. Clinical Bounded Context — Planned

Planned entities may include:

- PatientProfile
- PractitionerProfile
- Encounter
- ClinicalNote
- DiagnosisReference
- ProcedureRecord
- TreatmentPlan
- ConsentRecord
- ClinicalDocument
- ClinicalAccessEvent

Exact clinical scope must be introduced incrementally and only after security, legal and workflow requirements are verified.

## 12. Facility / Hospital Operations Boundary

Hospital support should initially prioritize operational ERP capabilities rather than attempting immediate full HBYS replacement.

Potential structure:

```text
Company
  -> Branch
      -> HealthcareFacility
          -> Building
          -> Floor
          -> Department
          -> Unit
          -> Room
```

Bed/admission/operating-theatre/lab/radiology workflows are later extensions and should not block the initial Hospital Ops value proposition.

## 13. Asset and Biomedical Equipment

Healthcare organizations increase the importance of asset lifecycle management.

Target lifecycle:

```text
Purchase Order
 -> Goods Receipt
 -> Asset
 -> Serial Number
 -> Facility / Department Assignment
 -> Installation
 -> Warranty
 -> Preventive Maintenance
 -> Calibration (where applicable)
 -> Breakdown / Work Order
 -> Spare Part / Consumable
 -> Service History
 -> Disposal / Replacement
```

This domain should integrate Supplier Network and Procurement rather than create a disconnected equipment registry.

## 14. Integration-First Hospital Strategy

Hospitals may already use external clinical and administrative systems. VALOO should support integration instead of forcing replacement.

Planned Integration Hub may connect to systems such as:

- HBYS-class systems
- laboratory systems
- radiology/PACS/RIS systems
- payer/claims systems
- identity and directory services
- device/asset feeds
- approved government/health integrations where legally and technically permitted

Integration credentials and payloads follow the existing VALOO security, audit and idempotency rules.

## 15. Security and Audit

Healthcare adds stronger controls on top of the existing security baseline:

- purpose-aware access where required,
- immutable/auditable access events for sensitive clinical resources,
- least privilege,
- branch/facility/department scope,
- emergency/break-glass access as a future controlled capability,
- explicit consent where required,
- retention and deletion policies driven by applicable rules,
- no leakage into Marketplace/Supplier/public projections.

## 16. Onboarding / Organization Setup Wizard

Onboarding must classify the organization and create an OrganizationProfile before enabling vertical features.

Example flow:

1. Country
2. Sector
3. Business / facility type
4. Legal entity structure
5. Licenses/permits/documents
6. Services offered
7. Professional roles/specialties
8. Locations/facilities
9. Requested optional modules
10. Verification and capability activation

Output:

```text
OrganizationProfile
+ RegulatoryProfile
+ CapabilityProfile
+ SubscriptionEntitlements
= Initial VALOO Experience
```

## 17. Legal/Regulatory Source Governance

Regulatory requirements must have source metadata:

- jurisdiction
- authority
- official source/reference
- version/effective date
- review status
- last verified date
- superseded-by reference where applicable

The software must distinguish:

- platform policy,
- legal/regulatory requirement,
- customer-configurable policy.

Do not present unverified product configuration as legal advice.

## 18. Migration and Compatibility

Existing Beauty tenants must not be broken by introducing healthcare classification.

Migration principle:

- existing tenants receive a compatible default Beauty-oriented OrganizationProfile,
- current screens remain available according to existing capabilities,
- no existing domain record is silently reclassified as clinical data,
- healthcare modules remain disabled unless explicitly enabled and configured.

## 19. Non-Goals for Initial Healthcare Foundation

Initial architecture work does not mean immediate implementation of:

- complete HBYS,
- inpatient admission/bed management,
- operating theatre management,
- LIS/RIS/PACS replacements,
- prescriptions/e-prescription,
- government claims integrations,
- full hospital clinical workflows.

The first objective is a stable classification/capability/regulatory foundation that allows later modules without damaging the current product.

## 20. Required Engineering Invariants

1. Existing ERP transaction flows remain intact.
2. Capability checks do not replace authorization checks.
3. Regulatory policies are versioned and auditable.
4. UI visibility and backend permission are derived from the same effective policy model where practical.
5. Clinical data never enters public Marketplace projections by default.
6. Supplier Network cannot infer buyer clinical data.
7. Healthcare modules are additive bounded contexts, not forks of VALOO Core.
8. Existing Beauty tenants remain backwards compatible.
