# VALOO — Healthcare Expansion Roadmap

> Status: Planned parallel roadmap
> Principle: does not replace or pause the existing CRM/ERP, Marketplace or Supplier roadmap.

## H0 — Architecture & Classification Foundation

Goals:
- OrganizationProfile model design
- sector/businessType/facilityType taxonomy
- Capability Engine contract
- RegulatoryProfile contract
- compatibility plan for existing Beauty tenants

Acceptance criteria:
- no current ERP flow changes
- no hard-coded hospital/clinic UI branching strategy
- backward-compatible default profile defined

## H1 — Capability Engine

Goals:
- central capability registry
- effective capability evaluation
- capability checks reusable by backend and frontend
- subscription and permission inputs supported

Acceptance criteria:
- navigation can be generated from capabilities
- backend services can enforce required capability
- existing tenants preserve current feature visibility

## H2 — Regulatory Profile & Rules Foundation

Goals:
- RegulatoryAuthority
- RegulationReference
- RequirementDefinition
- License/Document/Role requirements
- rule outcome model
- effective-date/version support

Acceptance criteria:
- policies are data-driven and versioned
- rule evaluation is auditable
- legal-source metadata can be recorded

## H3 — Dynamic Organization Onboarding

Goals:
- Organization Setup Wizard
- organization/facility classification
- document/license collection hooks
- capability-profile generation

Acceptance criteria:
- Beauty, Clinic, Hospital Ops and Supplier organizations can receive different initial capability sets
- onboarding does not expose unauthorized vertical features

## H4 — VALOO Clinic Foundation

Goals:
- PatientProfile boundary
- PractitionerProfile boundary
- Encounter
- ClinicalDocument
- Consent
- TreatmentPlan foundation
- sensitive-access audit model

Acceptance criteria:
- Customer and Patient are not conflated
- clinical data is not exposed in generic CRM/public projections
- tenant/company/branch/facility authorization is preserved

## H5 — Facility / Department Model

Goals:
- HealthcareFacility
- Department/Unit relationships
- location/facility scoping
- organization profile linkage

Acceptance criteria:
- healthcare organizational structure can exist without changing core Tenant/Company/Branch ownership

## H6 — Asset & Biomedical Equipment

Goals:
- Asset/Equipment registry
- serial/model/manufacturer
- warranty
- preventive maintenance
- calibration hooks
- work orders/service history
- procurement/supplier linkage

Acceptance criteria:
- PurchaseOrder/GoodsReceipt can seed asset creation for eligible equipment
- maintenance and service remain auditable

## H7 — Hospital Ops

Goals:
- advanced procurement profile
- biomedical/asset operations
- facility operations
- quality/compliance workflows
- workforce/finance integration

Acceptance criteria:
- hospitals can obtain operational value without VALOO becoming a full HBYS

## H8 — Integration Hub for Healthcare

Goals:
- connector contracts for external clinical/administrative systems
- event ingestion/export
- identity mapping
- idempotency/retry/audit

Acceptance criteria:
- external system integration does not bypass VALOO authorization/accounting invariants

## H9 — Advanced Clinical Extensions

Potential later scope:
- admission/discharge
- room/bed
- operating theatre
- orders
- lab/radiology integration workflows
- payer/claims/government integrations where permitted

These are explicitly deferred until Clinic/Hospital Ops foundations are proven.

## Execution Relationship to Main Roadmap

The main CRM/ERP roadmap remains authoritative for core reliability and production readiness.

Healthcare work should proceed in this pattern:

```text
Core ERP hardening continues
       +
H0/H1/H2 architecture foundations can progress incrementally
       +
Marketplace/Supplier milestones continue according to their own roadmap
```

Do not allow Healthcare scope to block P0 ERP reliability, financial integrity, tenant isolation, Marketplace publication safety or Supplier identity/verification work.

## Priority Guidance

Near-term:
- H0 documentation/design
- H1 capability contract design
- H2 regulatory data model design

After core stability:
- H3 onboarding
- H4 Clinic foundation
- H5/H6 facility and asset operations

Later:
- H7/H8 Hospital Ops + Integration Hub
- H9 advanced clinical scope
