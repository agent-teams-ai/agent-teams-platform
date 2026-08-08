---
id: domain.contexts.tenancy
type: bounded-context
status: proposed
owner: product/tenancy
classification: supporting-security-critical
package_target: context.tenancy
summary: Proposed Platform isolation, owner-binding, admission, and Tenant lifecycle boundary.
related:
  - ADR-0002
  - ADR-0004
---

# Tenancy

## Ubiquitous Language

- `Tenant`: product isolation and lifecycle boundary, not a customer company.
- `TenantOwnerRef`: `PersonalSpaceRef | CustomerOrganizationRef`.
- `TenantAdmissionAuthority`: authoritative gate for Tenant-scoped mutations.
- `TenantLifecycleEpoch`: monotonic anti-resurrection generation.
- `ProjectIndexHighWaterMark`: fixed boundary for bounded retirement fan-out.

## Ownership

Tenancy owns Tenant identity, authoritative owner binding, admission, lifecycle
epoch, and bounded fan-out of ProductProject retirement. It does not own the
owner aggregate or ProductProject state.

## System of Record

The Tenancy store is authoritative for Tenant identity, exact owner binding,
admission revision, lifecycle epoch, retirement process, command receipts,
inbox/outbox, and anti-resurrection tombstone. Project and customer-owner detail
remains in its owning stores.

## Aggregates

`Tenant` is the expected Aggregate Root, but its complete state and commands are
not accepted. Tenant retirement is a durable process that coordinates exact
Project identities in bounded pages after closing creation authority.

## Invariants

- Every active Tenant has exactly one active TenantOwnerRef.
- One PersonalSpace or CustomerOrganization may own multiple Tenant.
- TenantId is stable, non-reusable, and independent of display name, region, or
  deployment stamp.
- Tenant does not store an unbounded authoritative collection of Projects.
- Tenant retirement first closes Tenant admission and Project creation through
  one Tenant authority CAS.
- Principal disablement, PII erasure, or IdP migration does not retire Tenant.
- Delayed events and restored backups cannot reopen a retired epoch.

## Lifecycle

Exact Tenant states, transfer, merge, split, restoration, and legal-hold behavior
remain open. Customer ownership, residency, isolation tier, and deployment
placement are independent dimensions even when one workflow presents them
together.

## Commands and Events

Proposed commands are `CreateTenant`, `BindTenantOwner`,
`CloseTenantAdmission`, `BeginTenantRetirement`, and
`ReconcileTenantRetirement`. Owner transfer, merge, split, and restoration have
no v1 command. Proposed domain events cover Tenant creation, owner-binding
revision, admission closure, retirement commitment, and terminal tombstone.
Bounded Project-retirement requests are integration commands, not Tenant domain
events replayed into another aggregate.

## Features

- create Tenant under an exact Tenancy-owned `TenantOwnerRef` built from one
  observed concrete owner reference;
- change owner only through an explicit future migration;
- close and inspect Tenant admission;
- coordinate Tenant retirement with a fixed Project index boundary;
- expose opaque Tenant references and revisioned lifecycle observations.

## Dependencies

Customer Ownership supplies concrete owner identity facts. Access and Authority
supplies scoped administrative authority. Project Management owns ProductProject
and performs owner-local retirement. Deployment Management owns placement intent.

## Integration

Consumers use opaque TenantRef values. Tenant retirement issues idempotent
Project retirement commands and reconciles exact receipts; it never deletes
Project-owned tables or calls Agent Runtime directly.

## Published Language

The proposed internal Published Language exposes opaque `TenantRef`, exact
`TenantLifecycleObservation`, and purpose-bound `TenantAdmissionEvidence` with
revision, validity, and source incarnation. It does not expose CustomerOwner,
membership, Project collections, placement, plan, or runtime scope models.

## Forbidden Dependencies

- no import of Customer Ownership or Project Management aggregates;
- no principal, membership, subscription, installation, or runtime repository;
- no unbounded Tenant-to-Project collection or cross-context cascade delete;
- no synchronous fan-out inside the Tenant admission or retirement transaction;
- no derivation of Tenant identity from customer company, region, stamp, or
  deployment profile.

## Not Owned

- CustomerOrganization or PersonalSpace lifecycle;
- Platform principals, memberships, grants, or delegation;
- ProductProject state, OrchestrationTenant identity, or runtime TenantId;
- commercial subscriptions or operational consumption limits;
- region infrastructure or customer installation mechanics.

## Materialization Gate

Materialization requires accepted Tenant lifecycle, owner rebinding, admission,
retirement concurrency, restore fencing, and a first slice. The accepted closed
TenantOwnerRef alone is insufficient.

## Open Decisions

- `PO-PLAT-001`: membership scopes and administrative inheritance.
- `PO-PLAT-006`: Tenant transfer, merge/split, suspension, retirement, and
  restoration policy.
- Region/residency policy reference and whether it changes Tenant identity.
