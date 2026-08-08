---
id: domain.contexts.customer-ownership
type: bounded-context
status: proposed
owner: product/customer-ownership
classification: supporting
package_target: context.customer-ownership
summary: Proposed owner identity boundary for PersonalSpace and CustomerOrganization.
related:
  - ADR-0002
---

# Customer Ownership

## Ubiquitous Language

- `PersonalSpace`: stable personal customer owner identity.
- `CustomerOrganization`: stable business customer owner identity.
- `CustomerOwnerRef`: closed reference to either owner kind.
- `OwnershipMigration`: explicit future process; never aggregate type mutation.

The bare term `Organization` is forbidden where it could mean either
`CustomerOrganization` or Orchestrator `AgentOrganization`.

## Ownership

This context owns customer-owner identity and owner-local lifecycle. ADR-0002
confirms `PersonalSpace` semantics, but the complete context boundary and
CustomerOrganization lifecycle remain proposed.

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

Exact owner lifecycle states, tombstone policy, recovery, and owner rebinding
remain open. Personal-to-organization conversion is `UNSUPPORTED_V1` and may
later use an explicit migration process with new authority evidence.

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

Identity and Access supplies opaque verified principal references. Tenancy owns
the authoritative `TenantOwnerRef` binding. This context does not synchronously
mutate either owner.

## Integration

Publishes versioned owner lifecycle facts. Tenancy stores its own opaque owner
reference and reconciles stale or missing observations through a consumer-owned
port. Cross-context imports of aggregates are forbidden.

## Published Language

The proposed internal Published Language contains the closed `CustomerOwnerRef`
and minimal revisioned `CustomerOwnerLifecycleFact`. It excludes PII, login
identities, memberships, Tenant lists, billing, and aggregate snapshots. Tenancy
maps these facts into its own owner-binding model through an ACL.

## Forbidden Dependencies

- no import of Identity and Access principals or external identity bindings;
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

Package materialization is forbidden until an accepted decision fixes the
CustomerOrganization lifecycle, owner tombstone/rebinding policy, first feature
slice, and transaction boundary. ADR-0002 alone does not accept the whole
package.

## Open Decisions

- `PO-PLAT-001`: organization-level versus Tenant-level membership semantics.
- `PO-PLAT-005`: merge/split, PII erasure, tombstones, and IdP migration.
- Organization creation, retirement, recovery, and owner-transfer policy.
