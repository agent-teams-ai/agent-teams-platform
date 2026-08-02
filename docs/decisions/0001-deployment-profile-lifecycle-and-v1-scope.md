---
id: ADR-0001
type: adr
status: accepted
owner: architecture/deployment
summary: Define evidence-backed deployment profile states and the v1 qualification scope.
approved_by: product-owner
accepted_at: 2026-08-01
---

# ADR-0001: Deployment Profile Lifecycle and V1 Scope

## Context

The product must run locally, on standalone servers, and as managed SaaS. Future
Dedicated, BYOC, and Hybrid profiles must not force a rewrite, but claiming them
as supported before their compositions and operational guarantees exist would be
unsafe.

## Decision

Use exactly three evidence-backed lifecycle states:

- `DESIGNED`: architecture and contracts admit the profile.
- `IMPLEMENTED`: composition and adapters exist with implementation evidence.
- `QUALIFIED`: conformance, security, identity, isolation, persistence, restore,
  fencing, offline behavior, and upgrade evidence passed.

The v1 qualification targets are Local Standalone Desktop, Standalone Server,
and Managed Shared SaaS. Managed Dedicated, Managed BYOC, and Hybrid Connected
Runtime remain design-only in v1.

All profiles use the same domain and application implementations. Profile
selection belongs to composition roots. Infrastructure differences enter through
typed capabilities, replaceable adapters, and explicit operational policies.
Silent fallback is forbidden.

The machine-readable manifest is the source of truth for current status and
evidence. At acceptance time every profile is `DESIGNED`; v1 targets do not imply
current implementation or qualification.

## Consequences

- Future profiles shape identity, binding, placement, provisioning, security,
  and failure design immediately without creating empty production packages.
- A runnable profile is not automatically production-qualified.
- Status promotion and downgrade are reviewable data changes with deterministic
  validation.
- Domain behavior cannot diverge by deployment profile.
- Qualification evidence can expire or fail, requiring explicit downgrade.

## Rejected alternatives

- Mark v1 targets as currently qualified before implementation.
- Create separate domain implementations for Desktop, SaaS, BYOC, or Dedicated.
- Pre-create production packages for future profiles.
- Permit silent fallback to a weaker placement, authority, or durability mode.
