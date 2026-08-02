---
id: ADR-0002
type: adr
status: accepted
owner: product/customer-ownership
summary: Model personal customer ownership as a PersonalSpace aggregate distinct from identity, tenancy, and organizations.
approved_by: product-owner
accepted_at: 2026-08-01
---

# ADR-0002: PersonalSpace Tenant Ownership

## Context

Platform must support personal use and customer organizations without conflating
a login identity, billing account, tenant isolation boundary, and organization.
One customer owner may require multiple Tenant for residency, environment, or
isolation reasons. Principal deletion or IdP migration must not destroy tenancy
identity or silently transfer ownership.

## Decision

Model `PersonalSpace` and `CustomerOrganization` as separate Aggregate Roots in
the customer-ownership domain. Tenancy owns the authoritative closed reference:

```text
TenantOwnerRef =
  PersonalSpaceRef
  | CustomerOrganizationRef
```

The accepted product invariants are:

- one human `PlatformPrincipal` has at most one active `PersonalSpace` in one
  Platform authority realm;
- a service principal cannot own a `PersonalSpace`;
- one `PersonalSpace` may own zero or more Tenant;
- every active Tenant has exactly one active `TenantOwnerRef`;
- `Tenant` is the source of truth for its owner binding; owner aggregates do not
  contain a growing authoritative collection of Tenant;
- `PersonalSpace` has one owner and no owner-level memberships or invitations;
- scoped collaboration is modeled by Identity and Access grants, not by adding
  members to `PersonalSpace`;
- `PersonalSpaceId`, `PlatformPrincipalId`, `TenantId`, and
  `CustomerOrganizationId` are distinct, stable, non-reusable identities;
- `PersonalSpace` stores no email, display name, IdP subject, credential, billing
  state, or other identity-provider PII;
- disabling or deleting a principal does not synchronously delete Tenant;
- legal hold may delay physical erasure but cannot restore access or authority;
- Standalone Authority does not import the Platform `PersonalSpace` model.

Personal-to-organization conversion is designed as an explicit migration
process, not an aggregate type mutation. It is `UNSUPPORTED_V1`. No v1 contract
promises preservation of Tenant or Project identity through that future
migration.

## Consequences

- Customer ownership, identity, tenancy, access, billing, and data governance
  remain independently owned domains.
- IdP migration changes principal bindings without changing `PersonalSpaceId`.
- Email reuse or display-name equality can never transfer ownership.
- Recovery, owner rebinding, tombstones, legal hold, and conversion require
  explicit state machines and conformance tests before implementation.
- Orchestrator and AR receive only opaque tenant, project, principal, and
  authority references; `PersonalSpace` never enters their domain models.

## Rejected alternatives

- `CustomerOrganization { kind: PERSONAL }`, which introduces conditional
  organization invariants and unsafe aggregate type conversion.
- Direct `PlatformPrincipal -> Tenant` ownership, which couples tenancy to IdP,
  PII, recovery, and principal deletion lifecycle.
- Treating `PersonalSpace` as a Tenant, billing account, membership container, or
  generic organization.
