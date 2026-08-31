# Beauty ERP — Current State

> Bu dosya projenin mevcut teknik ve ürün durumunun ana referansıdır.
> Yeni bir çalışma oturumunda öncelikle bu dosya okunmalıdır.

---

## 1. Project

**Name:** Beauty ERP

**Repository:** beauty-erp

**Initial Market:** Türkiye

**Target:** Güzellik merkezleri, estetik merkezleri, medikal estetik merkezleri ve estetik klinikleri

**Product Type:** SaaS CRM + ERP

**Platforms:**

- Responsive Web Application
- iOS
- Android

---

# 2. Development Principle

Ana geliştirme prensibi:

> Önce sağlam çekirdek + gerçek müşterinin kullanabileceği MVP → sonra modüler büyüme.

İlk hedef tüm ERP modüllerini aynı anda geliştirmek değildir.

Öncelik:

1. Sağlam teknik altyapı
2. Güvenli multi-tenant mimari
3. Identity & Authorization
4. Organizasyon yapısı
5. Gerçek CRM
6. Randevu ve hizmet operasyonları
7. Satış ve ödeme
8. Temel stok
9. Temel finans / muhasebe
10. Müşteri portalı
11. Gerçek müşterinin kullanabileceği MVP

---

# 3. Current Phase

**Phase:** Foundation

**Current Milestone:** Foundation Infrastructure

**Current Checkpoint:** CHECKPOINT-003

**Checkpoint Name:** Redis Infrastructure

**Status:** COMPLETED

---

# 4. Completed Checkpoints

## CHECKPOINT-001 — Monorepo & Infrastructure

Status: COMPLETED

Tamamlananlar:

- Git repository
- pnpm workspace
- Monorepo structure
- apps/api
- apps/web
- apps/mobile
- packages/database
- packages/types
- packages/ui
- packages/config
- infrastructure
- Docker infrastructure
- PostgreSQL
- Redis

Git commit:

```text
8a00d8a6 chore: bootstrap beauty erp monorepo
CHECKPOINT-002 — API & Database Foundation

Status: COMPLETED

Tamamlananlar:

NestJS API
API configuration
Environment validation
Zod configuration validation
PostgreSQL connection
Prisma
Prisma Client
Database workspace package
PrismaService
DatabaseModule
Initial Tenant model
Initial Tenant migration
/health endpoint
Database health check
Redis health check

Git commit:

be428599 feat: establish api and database foundation
CHECKPOINT-003 — Redis Infrastructure

Status: COMPLETED

Tamamlananlar:

RedisService
RedisModule
Centralized Redis connection
Redis lifecycle management
HealthService Redis integration
Redis health check

Git commit:

0ca9d430 feat: add redis infrastructure
5. Verified Infrastructure
PostgreSQL

Status:

UP

Development environment:

localhost:5432

Database:

beauty_erp
Redis

Status:

UP

Development environment:

localhost:6379
API

Development server:

localhost:3000

Health endpoint:

GET /health

Last verified response:

{
  "status": "ok",
  "services": {
    "database": "up",
    "redis": "up"
  }
}
6. Current Repository State

Last verified Git state:

On branch main
nothing to commit, working tree clean

Current HEAD:

0ca9d430 feat: add redis infrastructure

Recent history:

0ca9d430 feat: add redis infrastructure
be428599 feat: establish api and database foundation
8a00d8a6 chore: bootstrap beauty erp monorepo
7. Current Architecture

Current high-level backend structure:

Beauty ERP API
│
├── ConfigModule
│
├── DatabaseModule
│   └── PrismaService
│       └── PostgreSQL
│
├── RedisModule
│   └── RedisService
│       └── Redis
│
└── HealthModule
    └── HealthService

Current dependency direction:

API
 │
 ├── DatabaseModule
 │       ↓
 │   PrismaService
 │       ↓
 │   PostgreSQL
 │
 ├── RedisModule
 │       ↓
 │   RedisService
 │       ↓
 │   Redis
 │
 └── HealthModule
8. Current Database State

Current Prisma schema contains:

Tenant

Tenant currently contains:

id
name
slug
createdAt
updatedAt

Database migration has been created and applied successfully.

The domain model is intentionally not yet complete.

9. Next Foundation Tasks

The next technical foundation tasks are:

Structured application logging
Request ID / Correlation ID
Global exception handling
Global validation pipeline
Security baseline
API documentation / OpenAPI
Authentication foundation
Authorization foundation

These tasks should be completed before beginning the main business-domain implementation.

10. Next Major Domain Phase

After foundation:

Identity & Authorization
        ↓
Tenant / Organization
        ↓
Legal Entity
        ↓
Region
        ↓
Branch
        ↓
Department
        ↓
Employee
        ↓
User
        ↓
Role
        ↓
Permission
        ↓
Scope / Assignment

The exact domain model must be documented and reviewed before final Prisma models are implemented.

11. Product Decisions Already Made

The product must support:

One tenant having multiple legal entities
Entity-based organizational structure
Region structure
Branch structure
Branch classification by size, revenue and location
Region manager qualification / adequacy checks
Central departments
Branch-level operational units
Employees working at multiple branches
Daily and hourly assignments
Primary branch
Secondary branches
Temporary assignments
Delegation / proxy
Management assignments
Leave-related authorization changes
Employee termination workflows
Trial-period related authorization
General Manager and HR controlled delegation / authorization
Customer user accounts
Customer self-service portal
Online payments
Payment links
Virtual POS integration infrastructure
Customer feedback collection
Quality department feedback workflows
Google review workflow
Data migration from previous systems
Multi-language support
Multi-currency support
Full accounting
Real payroll
Future integrations
Responsive web
iOS
Android
12. Customer Core Workflow

Core operational scenario:

Customer arrives at branch
        ↓
Service is performed
        ↓
Package session is deducted
        ↓
Payment is received
        ↓
Accounting record is created
        ↓
Inventory is reduced
        ↓
Customer notification is sent
        ↓
Customer feedback is requested
        ↓
Feedback is evaluated
        ↓
Quality workflow may be triggered
        ↓
Google review workflow may be triggered
        ↓
Reporting is updated

This workflow is one of the core business flows of Beauty ERP.

13. Data Migration Requirement

Beauty ERP must support migration from existing CRM / ERP systems.

Planned migration flow:

Existing System
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

Potential sources:

CSV
Excel
API
Database
Other CRM / ERP systems
14. Customer Portal Requirement

Customers should be able to access their own account after receiving a customer user account from the branch.

Planned customer capabilities:

Profile
Service history
Transaction history
Payment history
Service personnel history
Packages
Remaining sessions
Remaining balance
Campaigns
Opportunities
Appointments
Appointment rescheduling
Appointment advancement
Online payments
Payment links

Additional customer capabilities may be added later.

15. Important Architecture Rules

The following rules are currently established:

Employee and User are separate concepts.
A tenant may contain multiple legal entities.
An employee may work at multiple branches.
Primary and secondary branch relationships must be supported.
Temporary assignments must be supported.
Authorization must not depend only on role.
Tenant isolation is mandatory.
External integrations must use an integration architecture rather than being embedded directly into business logic.
Financial operations must be auditable.
Important architectural decisions must be recorded in docs/17-DECISIONS.md.
Current project state must be maintained in this file.
Important milestones must have Git checkpoints.
Domain models must be designed before implementing their final database structures.
16. Documentation Protocol

The project memory is maintained through:

docs/
├── 00-PROJECT-CONTEXT.md
├── 02-SYSTEM-ARCHITECTURE.md
├── 03-DOMAIN-MODEL.md
├── 17-DECISIONS.md
└── state/
    └── CURRENT-STATE.md

Additional documentation will be added as the project expands.

At every significant milestone:

Verify implementation
Run tests
Create Git checkpoint
Update CURRENT-STATE.md
Update relevant architecture documentation
Record important decisions
17. New Session Protocol

When continuing the project in a new conversation:

Read docs/state/CURRENT-STATE.md
Read docs/17-DECISIONS.md
Read the relevant architecture/domain documentation
Confirm the current Git checkpoint
Continue from the documented next step
Do not repeat completed work unless explicitly requested

The project should always continue from the documented state rather than from assumptions.

18. Current Next Action

NEXT ACTION:

Complete the remaining backend foundation:

Logger
   ↓
Request ID / Correlation ID
   ↓
Global Exception Handling
   ↓
Validation Pipeline
   ↓
Security Baseline
   ↓
OpenAPI

After foundation completion, begin Identity & Authorization design.

19. Current Status Summary
Monorepo                  ✅
Docker                    ✅
PostgreSQL                ✅
Redis                     ✅
Prisma                    ✅
Database Package          ✅
DatabaseModule            ✅
PrismaService             ✅
RedisModule               ✅
RedisService              ✅
Environment Validation    ✅
Health Endpoint           ✅
Database Health           ✅
Redis Health              ✅

Logger                    ⏳
Request ID                ⏳
Global Error Handling     ⏳
Validation Pipeline       ⏳
Security Baseline         ⏳
OpenAPI                   ⏳
Authentication            ⏳
Authorization             ⏳
Domain Model              ⏳
CRM                       ⏳
Operations                ⏳
Finance                   ⏳
HR / Payroll              ⏳
Inventory                 ⏳
Customer Portal           ⏳
Payments                  ⏳
Integrations              ⏳
Reporting                 ⏳