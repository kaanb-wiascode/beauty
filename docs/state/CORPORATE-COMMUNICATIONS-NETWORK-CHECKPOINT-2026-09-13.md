# Kurumsal İletişim — External Network Checkpoint

Date: 2026-09-13
Branch: `feature/core-commerce-foundation`

This checkpoint extends `docs/state/CORPORATE-COMMUNICATIONS-CHECKPOINT-2026-09-13.md` and records the verified Agency / Marketing Vendor and Influencer / Creator CRM increments.

## Agency / Marketing Vendor Management

Implemented:

- `corporate_marketing_vendors` domain table with tenant/company/branch scope guard
- vendor types for social media agency, ad agency, production, photographer, influencer agency, freelancer, PR agency and other
- lifecycle states: ACTIVE / PAUSED / ENDED / BLACKLISTED
- contact information
- contract start/end dates
- service scope
- monthly fee and currency
- payment model: monthly retainer / project / performance / hourly / mixed / other
- KPI commitments JSON contract
- performance notes
- system-owned attributed revenue field
- list/create/update API
- read/manage permission separation
- branch isolation
- web workspace `Kurumsal İletişim -> Ajanslar & İş Ortakları`

Governance:

- `attributedRevenue` is not accepted from create/update request schemas;
- read-only communications users cannot mutate vendors;
- branch-scoped users cannot read or mutate another branch's vendor;
- vendor performance attribution remains system-owned for later campaign/revenue linkage.

Verified quality gate:

```text
Run #1466
Run ID: 34777889905
SUCCESS
```

## Influencer / Creator CRM

Implemented creator profile foundation:

- display/legal name and category
- lifecycle status
- primary social platform and unique platform handle
- profile URL
- follower count
- engagement rate
- audience profile metadata
- rate card metadata
- contact details
- notes
- system-owned attributed revenue
- tenant/company/branch scope guard

Implemented collaboration foundation:

- creator -> campaign collaboration link
- PLANNED / CONTRACTED / IN_PROGRESS / DELIVERED / COMPLETED / CANCELLED lifecycle
- fee and currency
- coupon code
- collaboration date range
- deliverables array
- performance metadata
- system-owned attributed revenue
- notes and audit ownership metadata
- creator/campaign/scope validation

Web workspace:

```text
Kurumsal İletişim -> Influencer / Creator
```

The workspace exposes creator portfolio metrics, follower/engagement/rate-card data and creator collaboration records.

A PostgreSQL `BIGINT` serialization defect surfaced during the first Creator CRM E2E run because `follower_count` was returned as JavaScript `bigint`. The API now normalizes that response to a JSON-safe number while keeping the database column as BIGINT.

Verified quality gate:

```text
Code checkpoint: c3e1dac4b38566425e7142f16143b5bc473aedfb
Run #1475
Run ID: 34778406845
SUCCESS
```

Verified blocking gates include:

- all 149 fresh database migrations
- Prisma validation/generation
- database typecheck/build
- shared contract typecheck/build
- API typecheck
- API unit test suite
- full API E2E suite including vendor and creator governance
- API production build
- web lint
- web typecheck
- web production build

## Current Kurumsal İletişim navigation

The module now exposes operational workspaces for:

- Genel Bakış
- Kampanyalar
- Lead & Dönüşüm
- İçerik Operasyonu
- Onay Merkezi
- Marka Merkezi
- Dijital Varlıklar
- Ajanslar & İş Ortakları
- Influencer / Creator
- Reklam Hesapları
- Lead Routing

## Next active implementation

The next domain increment is:

1. PR / Media / Sponsorship workspace
2. competitor intelligence
3. campaign/channel/creative analytics and anomaly detection
4. Meta provider OAuth + webhook + campaign/ad/lead synchronization
5. Google Ads adapter
6. TikTok adapter
7. offline conversion feedback and multi-touch attribution models

Provider passwords must never be collected. External platform access must use OAuth/provider tokens stored through encrypted credential infrastructure.
