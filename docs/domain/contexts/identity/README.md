---
id: domain.contexts.identity
type: bounded-context
status: proposed
owner: product/platform-identity
classification: supporting-security-critical
package_target: context.identity
summary: Proposed stable Platform principal, external identity binding, privacy, and migration boundary.
related:
  - ADR-0002
  - architecture.platform-orchestrator-review.principal-delegation
---

# Platform Identity

## Ubiquitous Language

- `PlatformPrincipal`: stable Platform identity distinct from every IdP subject.
- `PrincipalKind`: human, service, internal system, or another explicitly accepted
  identity kind; an OAuth client remains a separate client identity.
- `ExternalIdentityBinding`: issuer, external subject, source incarnation, and
  binding revision.
- `PrincipalTombstone`: minimal PII-free historical identity evidence.
- `PrincipalBindingMigration`: explicit proof-based IdP rebinding process.

## Ownership

Platform Identity owns stable principal identity, external identity bindings,
binding migration, disablement, privacy erasure, and identity tombstones. ADR-0002
confirms that identity is independent from customer ownership, tenancy, access,
billing, and data governance; the exact aggregate boundaries remain proposed.

## System of Record

The Platform Identity store is authoritative for principal identity and kind,
external binding revisions, migration evidence references, lifecycle revision,
and privacy-safe tombstones. Authentication sessions, OAuth tokens, memberships,
grants, delegations, and authority decisions are not stored here.

## Aggregates

Likely consistency boundaries are `PlatformPrincipal`, external binding
uniqueness, and `PrincipalBindingMigration`. A principal aggregate must not grow
collections of memberships, grants, sessions, audit records, or authored
resources. Exact split, indexing, and erasure transaction boundaries remain open.

## Invariants

- PlatformPrincipalId is stable within its authority realm and non-reusable;
  tenant-scoped relationships belong to Access and Authority.
- Email and display name never identify, merge, split, or rebind a principal.
- Actor, subject, client, service principal, AgentProfile, and OAuth client are
  never interchangeable identities.
- An external binding has one active source incarnation and monotonic revision.
- IdP migration requires explicit proof and never silently changes historical
  authorship or customer ownership.
- Tombstones contain no unnecessary PII and cannot restore access authority.
- Raw credentials, OAuth tokens, signing keys, and IdP secrets never enter domain.

## Lifecycle

Provisional, active, disabled, privacy-erased, and tombstoned semantics remain
proposed under `PO-PLAT-005`. Merge and split are not inferred from binding
changes. Disablement, PII erasure, external-binding removal, and historical
tombstone retention are separate facts.

## Commands and Events

Proposed command families are `RegisterPlatformPrincipal`,
`BindExternalIdentity`, `DisablePlatformPrincipal`,
`BeginPrincipalBindingMigration`, `ErasePrincipalPII`, and
`RecordPrincipalTombstone`. Proposed domain events describe exact identity and
binding transitions. Access revocation remains an Access and Authority command,
not an identity event interpreted as a grant mutation.

## Features

- register and inspect stable Platform principals;
- bind and explicitly migrate external identities;
- disable identity and publish exact lifecycle observations;
- erase PII while preserving approved historical references;
- retain non-reusable privacy-safe tombstones.

## Dependencies

Inbound authentication adapters provide verified external identity facts. KMS,
IdP, and privacy backends remain adapters behind narrow ports. Access and
Authority, Customer Ownership, and audit consumers store only opaque principal
references and their own observations.

## Integration

Platform Identity publishes minimal revisioned principal and binding lifecycle
facts. Consumers map them through ACLs and own the effect of disablement or
erasure on their state. It never exports a Principal aggregate snapshot or asks
another context to cascade-delete by database identity.

## Published Language

The proposed internal Published Language contains opaque `PlatformPrincipalRef`,
`PrincipalKind`, exact lifecycle and binding observations, source incarnation,
revision, and privacy-safe tombstone reference. It excludes PII payloads,
credentials, memberships, grants, delegations, authorization decisions, and
consumer-local resource history.

## Forbidden Dependencies

- no import of CustomerOwner, Tenant, Membership, Grant, Subscription, Project,
  Run, or AR aggregates;
- no email/display-name auto-link or implicit principal merge;
- no product authorization, role evaluation, or delegation policy;
- no cross-context PII cascade, database join, or Unit of Work;
- no raw secret, authentication session, or provider credential persistence.

## Not Owned

- login transport, authentication session, or token custody;
- memberships, invitations, grants, delegation, and authority decisions;
- CustomerOrganization, PersonalSpace, Tenant, or ProductProject lifecycle;
- OrchestrationPrincipal, AgentProfile, Run actor policy, or AR permissions;
- subscription, billing, usage, retention policy, or legal-hold case management.

## Materialization Gate

Materialization requires `PO-PLAT-005`, accepted principal and external-binding
aggregate boundaries, privacy/erasure lifecycle, migration concurrency rules,
an owning package-identity ADR, and one complete identity feature slice.

## Open Decisions

- `PO-PLAT-005`: merge/split, PII erasure, tombstones, and IdP migration.
- Exact principal kinds and service/internal identity lifecycle.
- Binding uniqueness, account recovery, proof, and privacy retention policy.
