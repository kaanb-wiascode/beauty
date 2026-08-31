# Beauty ERP — Development Workflow

> Bu doküman local development, Git workflow, commit düzeni, database migration, testing, CI/CD ve release süreçlerini tanımlar.

---

# 1. Core Principle

Development workflow:

```text
Predictable
Reproducible
Reviewable
Testable
Recoverable

olmalıdır.

Amaç yalnızca kod yazmak değil, güvenli şekilde değişiklik üretmektir.

2. Repository

Beauty ERP monorepo yapısındadır.

Temel yapı:

apps/
packages/
infrastructure/
docs/
3. Applications

Application code:

apps/

altında bulunur.

Örneğin:

apps/api

Beauty ERP backend API'sidir.

4. Shared Packages

Reusable code:

packages/

altında bulunur.

Örneğin:

packages/database

database infrastructure ve Prisma integration'ını içerir.

5. Infrastructure

Development infrastructure:

infrastructure/

altında bulunur.

Örneğin:

infrastructure/docker-compose.yml

PostgreSQL ve Redis gibi development dependency'lerini çalıştırır.

6. Documentation

Project memory:

docs/

altında tutulur.

Önemli kararlar ve architecture değişiklikleri documentation'a yansıtılmalıdır.

7. Current State

Current project state:

docs/state/CURRENT-STATE.md

dosyasında tutulur.

Bu dosya project'in o anki gerçek durumunu hızlı şekilde anlamak için kullanılır.

8. Documentation as Memory

Kod değişikliği project architecture'ını etkiliyorsa:

Code
+
Documentation

birlikte güncellenmelidir.

Documentation yalnızca sonradan yazılan açıklama değildir.

Project continuity mechanism'idir.

9. Local Development

Başlangıç:

pnpm install
10. Infrastructure Start

Development infrastructure:

docker compose -f infrastructure/docker-compose.yml up -d

ile başlatılabilir.

11. Infrastructure Status

Container'lar:

docker ps

ile kontrol edilebilir.

12. Redis Check

Redis:

docker exec beauty-erp-redis redis-cli ping

ile kontrol edilebilir.

Beklenen:

PONG
13. PostgreSQL Check

PostgreSQL health:

docker inspect --format='{{.State.Health.Status}}' beauty-erp-postgres

ile kontrol edilebilir.

14. Environment

Application environment:

.env

üzerinden sağlanabilir.

Repository'de:

.env.example

template olarak tutulmalıdır.

15. Environment Safety

Gerçek secret içeren:

.env
.env.local

gibi dosyalar Git'e commit edilmemelidir.

16. Dependency Installation

Dependency eklemek için workspace-aware pnpm kullanılır.

Örneğin API:

pnpm --filter api add package-name
17. Workspace Dependency

Workspace package:

pnpm --filter api add '@beauty-erp/database@workspace:*'

gibi explicit workspace dependency olarak eklenmelidir.

Shell globbing nedeniyle package spec'i quote etmek güvenlidir.

18. Install

Dependency değişikliklerinden sonra:

pnpm install

çalıştırılmalıdır.

Lockfile güncel tutulmalıdır.

19. Build

Database package:

pnpm --filter @beauty-erp/database build

API:

pnpm --filter api build
20. Prisma Generate

Prisma schema değişikliklerinden sonra:

pnpm --filter @beauty-erp/database generate

çalıştırılmalıdır.

21. Prisma Migration

Development migration:

pnpm --filter @beauty-erp/database migrate:dev --name migration_name

ile oluşturulabilir.

22. Migration Principle

Migration:

Schema Change
      ↓
Migration
      ↓
Database

sırasını takip eder.

Database'i manuel değiştirmek yerine migration tercih edilir.

23. Migration Commit

Migration dosyaları Git'e commit edilmelidir.

Örneğin:

packages/database/prisma/migrations/
24. Migration Immutability

Uygulanmış migration dosyaları sonradan değiştirilmemelidir.

Yeni değişiklik için yeni migration oluşturulmalıdır.

25. Production Migration

Production'da:

prisma migrate deploy

kullanılmalıdır.

Production'da migrate dev kullanılmamalıdır.

26. Prisma Generate

Migration deploy ile client generation birbirinden ayrı operasyonlardır.

Build/deployment pipeline gerektiğinde:

migrate deploy
+
prisma generate
+
build

sıralamasını açıkça yönetmelidir.

27. Database Reset

Development database gerektiğinde reset edilebilir.

Ancak:

WARNING

reset data kaybına neden olabilir.

Production database reset edilmemelidir.

28. Seed

Deterministic development/test data için seed mechanism kullanılabilir.

Örneğin:

Tenant
User
Branch
Customer
Appointment
29. Git Branch

Ana branch:

main

olarak kullanılır.

30. Feature Branch

Daha büyük feature'lar için:

feature/<name>

kullanılabilir.

Örneğin:

feature/authentication
feature/appointments
feature/payments
31. Fix Branch

Bug fix:

fix/<name>

formatında olabilir.

Örneğin:

fix/tenant-isolation
fix/redis-health
32. Documentation Branch

Documentation-only change için:

docs/<name>

kullanılabilir.

33. Branch Lifetime

Küçük feature branch'ler mümkün olduğunca kısa ömürlü tutulmalıdır.

Uzun süre divergence oluşması merge riskini artırır.

34. Main Stability

main mümkün olduğunca deploy edilebilir durumda tutulmalıdır.

Broken code uzun süre main üzerinde bırakılmamalıdır.

35. Commit Principle

Commit:

Small
Focused
Descriptive
Buildable

olmalıdır.

36. Commit Naming

Commit message:

<type>: <description>

formatında kullanılabilir.

Örnek:

feat: add tenant membership model
fix: prevent cross-tenant customer access
docs: update security model
refactor: extract appointment policy
test: add tenant isolation coverage
chore: update dependencies
37. Commit Types

Temel types:

feat
fix
docs
refactor
test
chore
perf
build
ci
38. Commit Scope

Gerekirse:

feat(auth): add session validation
fix(appointments): prevent double booking

gibi scope kullanılabilir.

39. Commit Atomicity

Bir commit:

one logical change

taşımalıdır.

Örneğin:

Redis infrastructure

ile:

Payment domain

aynı commit'e gereksiz yere karıştırılmamalıdır.

40. Generated Files

Generated files yalnızca project convention gerektiriyorsa commit edilmelidir.

Örneğin:

node_modules/

commit edilmez.

41. Lockfile
pnpm-lock.yaml

repository'de tutulmalıdır.

Dependency değişikliklerinde güncellenmelidir.

42. Gitignore

En azından:

node_modules/
.env
.env.*
dist/
coverage/

gibi generated/private dosyalar uygun şekilde ignore edilmelidir.

.env.example gibi template dosyaları tracked kalmalıdır.

43. Before Commit

Commit öncesi:

git status

kontrol edilmelidir.

44. Diff Review

Değişiklik:

git diff

ile gözden geçirilmelidir.

Staged changes:

git diff --cached

ile kontrol edilebilir.

45. Accidental Files

Commit öncesi özellikle:

.env
credentials
keys
node_modules
dist
coverage

kontrol edilmelidir.

46. Local Verification

Feature tamamlandığında minimum:

Typecheck
Unit Tests
Relevant Integration Tests
Build

çalıştırılmalıdır.

47. API Verification

API değişikliğinde:

curl http://localhost:3000/health

gibi smoke test yapılabilir.

48. Port Conflicts

API:

3000

portunda çalışıyorsa ikinci API process'i:

EADDRINUSE

hatası verebilir.

49. Port Diagnosis

Port kullanımını kontrol etmek için macOS'ta:

lsof -nP -iTCP:3000 -sTCP:LISTEN

kullanılabilir.

50. Process Cleanup

Eski development process'i sonlandırılmadan ikinci instance başlatılmamalıdır.

Örneğin:

kill <PID>
51. Watch Mode

Development:

pnpm --filter api start:dev

ile watch mode'da çalışabilir.

52. Watch Mode Principle

Watch process terminal'i meşgul eder.

Aynı API'yi ikinci terminalden başlatmadan önce mevcut process'in çalışıp çalışmadığı kontrol edilmelidir.

53. TypeScript

TypeScript strictness mümkün olduğunca yüksek tutulmalıdır.

Yeni code:

any

kullanımını gereksiz yere artırmamalıdır.

54. Type Safety

Runtime validation:

Zod / DTO validation

ile compile-time TypeScript validation birbirini tamamlar.

55. Formatting

Project-wide formatter kullanılmalıdır.

Örneğin:

pnpm prettier --write .

veya project-specific script.

Final command repository script'lerine göre belirlenmelidir.

56. Lint

Lint:

pnpm --filter api lint

gibi workspace-specific command ile çalıştırılabilir.

57. Test

API:

pnpm --filter api test

ile unit test çalıştırılabilir.

58. Build Before Merge

Merge öncesi production build başarısız olmamalıdır.

59. CI Principle

CI:

Install
 ↓
Lint
 ↓
Typecheck
 ↓
Unit
 ↓
Integration
 ↓
E2E
 ↓
Build

akışını doğrulamalıdır.

60. CI Environment

CI local developer machine'den bağımsız deterministic environment sağlamalıdır.

61. CI Infrastructure

Integration/E2E testler gerektiğinde:

PostgreSQL
Redis

service/container olarak CI içinde başlatılmalıdır.

62. CI Database

CI database:

Disposable
Isolated
Fresh

olmalıdır.

63. CI Migrations

CI test database:

migrate deploy

ile schema'yı oluşturabilmelidir.

64. CI Secrets

CI secrets:

Git repository

içine plaintext olarak yazılmamalıdır.

CI platform secret store kullanılmalıdır.

65. Pull Request

PR:

Small
Focused
Descriptive

olmalıdır.

66. PR Description

PR açıklaması:

What changed?
Why?
How tested?
Any migration?
Any security impact?

sorularını cevaplamalıdır.

67. Migration PR

Database migration varsa PR açıkça belirtmelidir:

Migration added
Backward compatibility
Data migration
Rollback considerations
68. Security PR

Security-sensitive değişikliklerde:

Authentication
Authorization
Tenant isolation
Secrets
Audit

etkisi açıklanmalıdır.

69. Documentation PR

Architecture değişiyorsa ilgili docs/ dosyaları da PR'a dahil edilmelidir.

70. Review Principle

Code review:

Correctness
Security
Data integrity
Tenant isolation
Performance
Maintainability

üzerinden yapılmalıdır.

71. Review Priority

Öncelik:

Security
Data loss
Financial correctness
Tenant isolation
Business correctness

olmalıdır.

72. Release

Release process:

Merge
 ↓
CI
 ↓
Build
 ↓
Migration
 ↓
Deploy
 ↓
Health Check

şeklinde olabilir.

73. Deployment Order

Application/database compatibility gerektiriyorsa:

Backward-compatible migration
 ↓
Application deploy
 ↓
Cleanup migration

yaklaşımı tercih edilebilir.

74. Destructive Migration

Column/table deletion gibi destructive migration'lar doğrudan deploy edilmemelidir.

Önce application dependency kaldırılmalıdır.

75. Expand / Contract

Breaking database changes için:

Expand
 ↓
Migrate
 ↓
Deploy
 ↓
Contract

yaklaşımı kullanılabilir.

76. Rollback

Application deployment rollback edilebilir olmalıdır.

Database migration rollback ise ayrıca değerlendirilmelidir.

Her migration otomatik rollback edilebilir kabul edilmemelidir.

77. Backup Before Risky Migration

Riskli production migration öncesinde database backup/restore strategy doğrulanmalıdır.

78. Health After Deployment

Deploy sonrası:

GET /health

ve kritik smoke tests çalıştırılmalıdır.

79. Logs After Deployment

Deploy sonrası:

startup errors
database errors
redis errors
5xx

kontrol edilmelidir.

80. Monitoring

Production'da en azından:

Availability
5xx
Latency
Database
Redis
Queue
External Providers

izlenebilir olmalıdır.

81. Incident

Production incident olduğunda:

Detect
 ↓
Contain
 ↓
Diagnose
 ↓
Recover
 ↓
Document
 ↓
Prevent

yaklaşımı kullanılmalıdır.

82. Incident Documentation

Önemli incident sonrası:

Root cause
Impact
Timeline
Resolution
Prevention

dokümante edilebilir.

83. Current State

Mevcut foundation:

Monorepo
NestJS API
Prisma
PostgreSQL
Redis
Health endpoint
Project memory docs

durumundadır.

CI/CD ve production deployment henüz tamamlanmış değildir.

84. Implementation Order

Önerilen sıra:

Local development baseline
 ↓
Testing baseline
 ↓
Git workflow
 ↓
CI
 ↓
Docker build
 ↓
Deployment environment
 ↓
Migration deployment
 ↓
Health checks
 ↓
Monitoring
85. First CI

İlk CI pipeline minimum:

[ ] pnpm install
[ ] lint
[ ] typecheck
[ ] unit tests
[ ] database integration tests
[ ] build

olmalıdır.

E2E infrastructure hazır olduğunda E2E eklenmelidir.

86. Current Development Rule

Yeni feature tamamlanmadan önce:

Code
Tests
Documentation
Migration

gerekiyorsa birlikte değerlendirilmelidir.

87. Final Principle

Beauty ERP development workflow:

Küçük ve izlenebilir değişiklikler üretir, migration'ları version control altında tutar, test ve build doğrulaması olmadan değişiklikleri ana branch'e taşımamaya çalışır ve architecture değişikliklerini project memory ile birlikte günceller.