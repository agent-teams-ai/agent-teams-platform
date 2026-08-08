---
id: domain.contexts.identity-access
type: bounded-context
status: proposed
owner: product/identity-access
classification: supporting-security-critical
package_target: context.identity-access
summary: Proposed principal, membership, grant, delegation, and authority-decision boundary.
related:
  - ADR-0003
  - architecture.platform-orchestrator-review.principal-delegation
---

# Identity and Access

## Ubiquitous Language

- `PlatformPrincipal`: stable Platform identity distinct from IdP subjects.
- `ExternalIdentityBinding`: issuer, external subject, incarnation, and revision.
- `Membership`: scoped relationship between a principal and customer resource.
- `Grant`: direct authority with exact scope, actions, revision, and validity.
- `Delegation`: bounded authority derived from a subject grant.
- `Actor`, `Subject`, and `Client`: orthogonal request identities.
- `AuthorityDecision`: capability-specific typed outcome and evidence.

## Ownership

This candidate owns Platform principal and product authority facts. It does not
own authentication transport, Orchestrator local invariants, runtime technical
enforcement, or commercial plan state.

Identity and Access remains one discovery boundary until independent language,
teams, lifecycle, and consistency prove a split. A future split must not create
a shared principal aggregate package.

## System of Record

The Platform identity and product-authority store is authoritative for stable
principal identity, external binding revisions, scoped memberships, direct
grants, delegations, revocation facts, and privacy-safe tombstones. Authentication
sessions, OAuth token custody, commercial entitlement state, and consumer-local
authorization decisions are not stored here.

## Aggregates

Exact aggregates are open. Likely consistency boundaries include principal
identity/bindings, scoped membership, direct grant, and delegation. They must
not be collapsed into one unbounded Principal aggregate or a generic policy bag.

## Invariants

- Human principal, service principal, OAuth client, delegated agent actor, and
  internal system actor are distinct kinds or bindings.
- Actor, subject, and client never substitute for each other.
- Email and display name never auto-link principals.
- Decisions bind authority realm, audience, typed scope, action, caller context,
  revisions, validity, constraints, outcome, and opaque audit evidence.
- Outcomes preserve `allowed`, `denied`, `indeterminate`, `stale`, and
  `unavailable`.
- Feature-owned consumers retain local aggregate and admission checks.

## Lifecycle

Principal provisional/active/disabled/tombstoned semantics, binding migration,
membership lifecycle, delegation depth and renewal, privacy erasure, and audit
retention remain proposed. ADR-0003 confirms downstream subject-bound Run
revocation behavior, not these Platform aggregate shapes.

## Commands and Events

Proposed command families register, disable, tombstone, and explicitly rebind a
PlatformPrincipal; create or end an exact scoped Membership; issue or revoke a
direct Grant; issue, renew, or revoke a bounded Delegation; and evaluate one
capability-specific authority request. Proposed events carry principal-binding,
membership, grant, delegation, and authority-revision changes. A decision is an
application result or signed evidence, not a mutable domain event.

## Features

- principal and external identity binding lifecycle;
- CustomerOrganization and Tenant membership administration;
- direct grants and bounded delegation;
- revocation and freshness observations;
- capability-specific authority decisions and optional signed evidence;
- privacy-safe tombstones and explicit identity migration.

## Dependencies

Authentication adapters produce verified transport facts. Customer Ownership,
Tenancy, Project Management, and Commercial Access supply opaque resource or
restriction references. Consumer features own narrow decision ports.

## Integration

The future Platform Authority API is a provider-owned Published Language.
Orchestrator owns consumer ports and ACL semantics. Internal feature ports are
not a cross-repository extension API, and generated DTOs never become domain
entities.

## Published Language

The proposed Platform Authority Published Language separates control requests
and queries from revisioned lifecycle and revocation observations. Every
`AuthorityDecisionEnvelope` has a typed outcome, tenant or project scope, action,
actor, subject, client, delegation evidence, revisions, validity, typed
constraints, and opaque audit reference. No generic property bag, role string,
plan name, Orchestrator deletion epoch, or AR fence is permitted.

## Forbidden Dependencies

- no import of CustomerOwner, Tenant, ProductProject, Subscription, or Run
  aggregates;
- no generic `AuthorizationService` or string-based capability god-interface;
- no email/display-name auto-link, implicit impersonation, or actor/subject/client
  substitution;
- no raw credentials, OAuth tokens, provider secrets, or signing keys in domain;
- no consumer-local aggregate precondition or AR technical permission decision.

## Not Owned

- credentials or login sessions inside product domain;
- ProductProject and Tenant local invariants;
- OrchestrationPrincipal identity or Orchestrator operation policy;
- AgentProfile identity;
- AR technical permissions, fences, provider credentials, or sandboxing;
- plans, subscriptions, billing, or consumption truth.

## Materialization Gate

Materialization requires product decisions `PO-PLAT-001`, `PO-PLAT-002`, and
`PO-PLAT-005`, accepted aggregate/concurrency boundaries, privacy lifecycle,
capability-specific ports, and one complete feature slice.

## Open Decisions

- `PO-PLAT-001`: CustomerOrganization and Tenant membership semantics.
- `PO-PLAT-002`: delegation depth, renewal, expiry, and revocation UX.
- `PO-PLAT-005`: merge/split, PII erasure, tombstones, and IdP migration.
- Whether independent evolution later proves separate Identity and Access BCs.
