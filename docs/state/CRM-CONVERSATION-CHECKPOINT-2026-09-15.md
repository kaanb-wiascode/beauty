# CRM Conversation / Communication Checkpoint — 2026-09-15

## Scope

This checkpoint records the active state of CRM communication and unified conversation work on `feature/core-commerce-foundation`. It supplements the older `CURRENT-STATE.md`, whose communication/provider section predates the current implementation.

## Provider layer

The active branch contains real provider-agnostic CRM messaging with branch-scoped connections and fail-closed dispatch behavior.

- Meta WhatsApp Cloud adapter with encrypted credentials, signed webhook validation, provider message IDs and deterministic branch routing.
- Twilio SMS provider adapter using the existing provider connection/vault abstraction.
- Resend email provider adapter with branch-scoped sender configuration, encrypted API key storage and CRM idempotency propagation.
- Provider absence, disabled connections and missing credentials must not produce synthetic SENT success.
- Communication consent / opt-out enforcement remains mandatory before automated/provider dispatch.

## Inbound resolution

Inbound WhatsApp contact resolution remains deterministic and branch isolated.

- A single normalized Customer/Lead match can attach automatically.
- No match remains unresolved.
- Multiple candidates remain `AMBIGUOUS`; no guessed customer attachment is permitted.
- The unresolved inbound inbox/resolution workflow remains the authoritative manual resolution path.

## Unified conversation aggregate

The current architecture intentionally does **not** introduce a duplicate `crm_conversations` master table. A conversation is a branch-scoped subject aggregate derived from `crm_messages` plus durable operational state.

Supported subjects:

- Customer
- Lead
- Opportunity

Durable operational stores include:

- per-user conversation read state
- assignment / ownership
- lifecycle state with optimistic versioning
- branch SLA policy / breach queue infrastructure
- append-only lifecycle event history

Lifecycle statuses:

- `OPEN`
- `PENDING`
- `RESOLVED`
- `SNOOZED`
- `CLOSED`

Priorities:

- `LOW`
- `NORMAL`
- `HIGH`
- `URGENT`

Lifecycle mutations are tenant/company/branch scoped, use optimistic concurrency, and record immutable state-event history in the same transaction. Lifecycle audit foreign keys are restrictive so deleting a state or CRM subject cannot silently cascade-delete its audit history.

## Inbox API

`GET /crm/conversations` supports operational server-side filtering by:

- ownership mode: `ALL`, `MINE`, `UNASSIGNED`
- lifecycle: `ACTIVE`, `OPEN`, `PENDING`, `RESOLVED`, `SNOOZED`, `CLOSED`
- priority: `ALL`, `LOW`, `NORMAL`, `HIGH`, `URGENT`
- channel: `ALL`, `WHATSAPP`, `SMS`, `EMAIL`

`ACTIVE` means effective `OPEN` or `PENDING`. Expired snoozes resolve to effective `OPEN`. Future snoozes remain hidden from `ACTIVE` and are available through the `SNOOZED` filter.

Inbox ordering gives higher priority conversations precedence, then unread/awaiting-response signals and recency.

## Inbox UI

Route: `/crm/conversations`

The unified inbox exposes:

- team / mine / unassigned ownership modes
- unread and awaiting-response operational filters
- lifecycle filters
- priority filters
- channel filters
- lifecycle and priority badges in the conversation list
- assignee selection
- priority mutation
- reopen / pending / resolved / snooze / close actions
- thread message history
- navigation to the underlying CRM record

Outbound provider behavior remains governed by the existing CRM message/provider/compliance services; the inbox must never bypass consent or fake provider success.

## Integrity invariants

The following remain mandatory for future conversation work:

- tenant/company/branch isolation on every read and mutation
- permission guard enforcement (`crm.read` / `crm.manage` as applicable)
- optimistic version checks for mutable operational state
- append-only lifecycle history
- deterministic inbound subject resolution
- provider idempotency and fail-closed semantics
- no plaintext provider secrets and no credential echo in API responses
- no internet-banking credentials collected anywhere in the platform

## Next conversation increments

Recommended next increments after this checkpoint:

1. right-side Customer/Lead/Opportunity 360 context panel in the unified inbox
2. consent-aware in-thread composer that delegates to the existing CRM message dispatch service for WhatsApp/SMS/Email
3. tags and richer team routing if the existing schema still lacks them
4. communication analytics: inbound/outbound volume, first response, resolution time, unresolved/failed/opt-out rates, channel mix, owner workload, automation-vs-manual and branch comparison

Do not add a second conversation aggregate unless an explicit migration plan proves the current subject-derived model cannot satisfy a new invariant.
