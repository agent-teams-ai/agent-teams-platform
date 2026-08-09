---
id: domain.contexts.customer-ownership
type: bounded-context
status: proposed
owner: product/customer-ownership
classification: supporting
package_target: context.customer-ownership
summary: Proposed owner identity boundary for PersonalSpace and CustomerOrganization.
related:
  - ADR-0007
  - ADR-0002
---

# Customer Ownership

## Ubiquitous Language

- `PersonalSpace`: stable personal customer owner identity.
- `CustomerOrganization`: stable business customer owner identity.
- `PersonalSpaceRef` and `CustomerOrganizationRef`: concrete opaque owner
  identities consumed by Tenancy.
- `OwnershipMigration`: explicit future process; never aggregate type mutation.

The bare term `Organization` is forbidden where it could mean either
`CustomerOrganization` or Orchestrator `AgentOrganization`.

## Ownership

This context owns customer-owner identity and owner-local lifecycle. ADR-0002
confirms `PersonalSpace` semantics, and ADR-0007 accepts the strategic boundary
and v1 owner-lifecycle policy. Exact tactical aggregates and process boundaries
remain proposed.

## System of Record

The Customer Ownership store is authoritative for owner identity, owner kind,
lifecycle revision, non-reusable tombstone, and explicit migration process
references. Identity-provider profiles, Tenant bindings, memberships, billing,
and display projections are not part of this store.

## Aggregates

- `PersonalSpace` is a confirmed Aggregate Root candidate.
- `CustomerOrganization` is a separate Aggregate Root candidate.
- `OwnershipMigration` is a future process manager, not an entity shared by both
  aggregates.

Owner aggregates do not contain an authoritative growing collection of Tenant.

## Invariants

- One human Platform principal has at most one active PersonalSpace in one
  authority realm.
- A service principal cannot own a PersonalSpace.
- PersonalSpace has one owner and no memberships or invitations.
- PersonalSpaceId, CustomerOrganizationId, PlatformPrincipalId, and TenantId are
  distinct, stable, and non-reusable.
- Email, display name, IdP subject, credentials, billing state, and other PII do
  not enter PersonalSpace.
- Equality of email or display name never transfers or merges ownership.

## Lifecycle

ADR-0007 accepts reversible suspension, terminal retirement, non-reuse, and no
v1 transfer, merge, split, or resurrection. Exact state names, retirement
process, tombstone retention, legal-hold storage, recovery, and owner rebinding
remain tactical decisions. Personal-to-organization conversion is
`UNSUPPORTED_V1` and may later use an explicit migration process with new
authority evidence.

## Commands and Events

Proposed command families are `CreatePersonalSpace`,
`CreateCustomerOrganization`, `RetireCustomerOwner`,
`RecordCustomerOwnerTombstone`, and future `RequestOwnershipMigration`.
Proposed domain events describe exact owner creation, retirement, tombstone, and
migration-process transitions. Published lifecycle facts are separately shaped
and versioned; domain events are never exported directly.

## Features

- create and inspect PersonalSpace;
- create and administer CustomerOrganization after its model is accepted;
- owner tombstone and privacy-safe historical reference;
- future explicit ownership migration.

## Dependencies

Platform Identity supplies opaque verified principal references. Tenancy owns
the authoritative closed `TenantOwnerRef` binding. This context does not synchronously
mutate either owner.

## Integration

Publishes versioned owner lifecycle facts. Tenancy stores its own opaque owner
reference and reconciles stale or missing observations through a consumer-owned
port. Cross-context imports of aggregates are forbidden.

## Published Language

The proposed internal Published Language contains concrete typed
`PersonalSpaceRef` or `CustomerOrganizationRef` lifecycle facts. It never defines
the closed `TenantOwnerRef`; Tenancy constructs and owns that union. Lifecycle
facts exclude PII, login identities, memberships, Tenant lists, billing, and
aggregate snapshots.

## Forbidden Dependencies

- no import of Platform Identity principals or external identity bindings;
- no Tenant, ProductProject, subscription, or billing repository access;
- no ownership lookup by email, display name, workspace path, or IdP subject;
- no cross-context transaction that creates an owner and Tenant atomically;
- no shared `Organization` entity with Orchestrator Agent Organization.

## Not Owned

- Tenant isolation or lifecycle;
- memberships, invitations, roles, grants, or delegation;
- subscriptions, billing, credits, or usage;
- ProductProject, Orchestration Scope, AgentOrganization, or runtime identity.

## Materialization Gate

ADR-0007 accepts the strategic boundary and v1 product semantics, but does not
authorize this package. Materialization remains forbidden until an owning ADR
accepts the tactical CustomerOrganization aggregate, tombstone/rebinding and
retention policy, first feature slice, and transaction boundary.

## Open Decisions

- `PO-PLAT-001`, `PO-PLAT-005`, and `PO-PLAT-006` are accepted by ADR-0007:
  membership is distinct from Tenant access, v1 merge/split is unsupported, and
  retirement is terminal with explicit bounded obligations.
- Exact aggregate state machines, tombstone and legal-hold retention, recovery
  protocol, schemas, and first vertical slice.
