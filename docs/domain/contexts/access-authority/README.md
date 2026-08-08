---
id: domain.contexts.access-authority
type: bounded-context
status: proposed
owner: product/access-authority
classification: supporting-security-critical
package_target: context.access-authority
summary: Proposed membership, grant, delegation, revocation, and product authority boundary.
related:
  - ADR-0002
  - ADR-0003
  - architecture.platform-orchestrator-review.principal-delegation
---

# Access and Authority

## Ubiquitous Language

- `Membership`: scoped customer relationship, not a login identity or role bag.
- `Grant`: direct product authority with exact subject, scope, actions, revision,
  and validity.
- `Delegation`: bounded authority derived from an exact subject grant.
- `Actor`, `Subject`, and `Client`: orthogonal request identities.
- `AuthorityDecision`: capability-specific typed outcome and evidence.
- `SemanticRevocation`: exact invalidation predicate or ordered authority revision.

## Ownership

Access and Authority owns customer memberships, direct grants, delegation,
revocation, freshness semantics, and capability-specific product authority
decisions. It consumes opaque principal and resource references and does not own
identity, authentication, consumer aggregate invariants, or runtime enforcement.

## System of Record

The product-authority store is authoritative for scoped membership, direct grant,
delegation chain, revocation facts, authority revisions, and evidence retention.
Platform principal bindings, subscription state, consumer-local restrictions,
and AR technical permissions remain in their owners.

## Aggregates

Membership, direct Grant, Delegation, and revocation/freshness authority are
candidate consistency boundaries. They must not be collapsed into one unbounded
Principal aggregate or generic authorization-policy object. Exact aggregate,
index, and transaction boundaries remain proposed.

## Invariants

- Actor, subject, client, and principal identity never substitute for each other.
- A decision binds authority realm, audience, typed scope, action, caller
  context, proof revisions, validity, typed constraints, outcome, and audit ref.
- Outcomes preserve `allowed`, `denied`, `indeterminate`, `stale`, and
  `unavailable`.
- One grant or delegation cannot broaden its source authority, audience, scope,
  validity, or action vocabulary.
- Revocation targets an exact proof or ordered partition and cannot invalidate a
  successor merely because an unrelated cursor advanced.
- Consumer use cases always enforce their own aggregate and admission invariants.

## Lifecycle

Organization membership, Tenant access, invitation, grant, and delegation
lifecycles remain proposed under `PO-PLAT-001` and `PO-PLAT-002`. ADR-0003
confirms downstream subject-bound Run revocation behavior, not Platform aggregate
shape. Membership end, grant revocation, delegation expiry, and principal
disablement are distinct source facts.

## Commands and Events

Proposed command families create, accept, suspend, or end an exact Membership;
issue or revoke a direct Grant; issue, renew, or revoke a bounded Delegation; and
evaluate one capability-specific authority request. Proposed integration events
carry exact membership, grant, delegation, revocation, and authority-revision
changes. A decision is an application result or signed evidence, not a mutable
event used as a universal policy state.

## Features

- CustomerOrganization membership and invitation administration;
- Tenant-scoped access assignments after product policy is accepted;
- direct grants and bounded delegation;
- revocation and freshness publication;
- capability-specific authority decisions and optional signed evidence;
- audit-safe decision references and privacy-aware subject observations.

## Dependencies

Platform Identity supplies opaque principal references. Customer Ownership,
Tenancy, and Project Management supply opaque resource references and exact
lifecycle facts. Commercial Access supplies capability-specific commercial
restrictions, never roles or plan names. Every consumer owns its narrow decision
port and local failure policy.

## Integration

The future Platform Authority API is a provider-owned Published Language.
Orchestrator owns its consumer ports and ACL semantics. Platform internal feature
ports are not a cross-repository extension API, and generated DTOs never become
domain entities.

## Published Language

The proposed Platform Authority Published Language separates control requests
and queries from revisioned lifecycle/revocation observations. Every
`AuthorityDecisionEnvelope` has a typed outcome, tenant or project scope, action,
actor, subject, client, proof or delegation evidence, revisions, validity, typed
constraints, and opaque audit reference. No generic property bag, role string,
plan name, Orchestrator deletion epoch, or AR fence is permitted.

## Forbidden Dependencies

- no import of PlatformPrincipal, CustomerOwner, Tenant, ProductProject,
  Subscription, Run, or AR aggregates;
- no generic `AuthorizationService`, role bag, or string capability interface;
- no actor/subject/client substitution, implicit impersonation, or email linking;
- no raw credentials, OAuth tokens, signing keys, or provider secrets in domain;
- no consumer-local aggregate precondition or AR technical enforcement decision.

## Not Owned

- stable Platform principal or external IdP binding lifecycle;
- authentication transport, login session, or credential custody;
- CustomerOwner, Tenant, ProductProject, subscription, or Run lifecycle;
- OrchestrationPrincipal identity or Orchestrator operation-specific invariants;
- AR technical grants, permissions, fences, provider credentials, or sandboxing;
- payment, billing, operational usage, or consumption-governance truth.

## Materialization Gate

Materialization requires `PO-PLAT-001` and `PO-PLAT-002`, accepted membership,
grant, delegation, revocation and decision consistency boundaries,
capability-specific ports, an owning package-identity ADR, and one complete
authority feature slice.

## Open Decisions

- `PO-PLAT-001`: CustomerOrganization membership versus Tenant access semantics.
- `PO-PLAT-002`: delegation depth, renewal, expiry, and revocation UX.
- Invitation, service-principal grant, batch-decision, and evidence-retention
  policy.
