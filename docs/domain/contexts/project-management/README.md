---
id: domain.contexts.project-management
type: bounded-context
status: proposed
owner: product/project-management
classification: core
package_target: context.project-management
summary: Proposed ProductProject identity, admission, scope-admission, and retirement boundary.
related:
  - ADR-0004
  - architecture.platform-orchestrator-review.project-provisioning
---

# Project Management

## Ubiquitous Language

- `ProductProject`: stable product identity with lifecycle `OPEN -> RETIRED`.
- `ProjectRestriction`: exact source-owned restriction fact.
- `ProjectAdmissionAuthority`: effective gate, revision, and lifecycle epoch.
- `ManagedProjectScopeAdmissionProcess`: durable Platform process for preparing
  an Orchestration Scope.
- `ProductProjectRetirementProcess`: product commitment and owner obligations.
- `ReadinessProjection`: non-authoritative view over current owner receipts.

The bare term `provisioning` is forbidden. Scope admission, customer
installation, Run execution, and runtime activation are different lifecycles.

## Ownership

Project Management owns ProductProject identity, Platform Project admission,
managed scope-admission intent, product retirement commitment, Platform-local
disposition coordination, and customer-facing readiness projection.

## System of Record

The Project Management store is authoritative for ProductProject identity and
epoch, exact restrictions, admission revision, command receipts, managed
scope-admission process state, retirement process state, owner-local obligations,
and readiness projection inputs. Orchestrator operation receipts remain
external evidence referenced opaquely.

## Aggregates

- `ProductProject` owns only stable identity, lifecycle revision, and monotonic
  retirement epoch.
- `ProjectRestriction` and `ProjectAdmissionAuthority` form a separate
  consistency boundary from ProductProject identity after initialization.
- `ProductProjectRetirementProcess` owns commitment, immutable policy/catalog
  references, bounded obligations, and opaque receipts.
- The proposed create Unit of Work atomically initializes ProductProject, a
  denied ProjectAdmissionAuthority, command receipt, scope-admission process
  intent, and outbox before any external call.

## Invariants

- ProductProject transitions only `OPEN -> RETIRED`; retirement is terminal and
  identity/incarnation is never reused.
- Missing ProjectAdmissionAuthority means denied; no read path defaults open.
- Project creation commits all initial owner-local authority and recovery records
  together or does not create ProductProject.
- Provisioning, readiness, suspension, export, and physical disposition are not
  ProductProject identity states.
- One restriction source can clear only its exact identity and source revision.
- Restriction mutation and effective admission revision advance atomically.
- Retirement cancel and irreversible commit race through one ProductProject CAS.
- A process records bounded obligations and opaque owner receipts, never an
  unbounded external resource inventory.
- Duplicate command identity plus identical digest replays its receipt; a
  conflicting digest is rejected.

## Lifecycle

ProductProject identity is confirmed as `OPEN -> RETIRED`. Managed scope
admission and retirement are independent process lifecycles. A partially
prepared Project remains fail closed and recoverable; `READY`, `BLOCKED`,
`SUSPENDED`, `DELETING`, and `DELETED` are derived classifications only.

## Commands and Events

Proposed commands are `CreateProductProject`, `AddProjectRestriction`,
`ClearProjectRestriction`, `RequestManagedScopeAdmission`,
`ReconcileManagedScopeAdmission`, `RequestProductProjectRetirement`,
`CancelProductProjectRetirement`, and `CommitProductProjectRetirement`.
Proposed domain events cover identity creation, exact restriction changes,
admission revision, retirement commitment, and local process transitions.
Orchestrator commands belong to the receiving Orchestrator Published Language.
Platform owns its intent and consumer port; the ACL maps between them. Receipts
and events belong to their publishers and are not ProductProject domain events.

## Features

- create ProductProject;
- maintain exact admission restrictions and gate revision;
- admit and reconcile managed Orchestration Scope;
- project readiness projection;
- request, cancel, and commit ProductProject retirement;
- coordinate Platform-local and Orchestrator disposition obligations;
- recover lost responses and unknown outcomes by original command identity.

## Dependencies

Tenancy supplies an opaque active TenantRef and lifecycle evidence. Access and
Authority supplies operation-specific authority. Commercial Access contributes
exact restriction facts. Deployment Management may supply placement intent.
Orchestration Scope is an external downstream owner behind the Project
Management-owned `OrchestrationScopeAdmissionPort`.

## Integration

The private Managed Lifecycle ACL implements the Project Management-owned
`OrchestrationScopeAdmissionPort` by mapping Platform intent into an
Orchestrator-owned provider contract. Platform treats Orchestrator as one
participant and never imports OrchestrationProject, RuntimeScopeBinding, Run,
Work, Workspace, or AR domain models. Lost acknowledgement is resolved through
the original request/Operation identity and exact receipt query.

## Published Language

Project Management publishes minimal revisioned ProductProject lifecycle and
admission facts for Platform consumers. The private managed lifecycle contract
contains Platform intent and opaque correlation only; the ACL maps it to the
future Orchestrator-owned scope-admission service. `TechnicalExecutionGrant`,
runtime scope identity, and AR readiness never enter this language.

## Forbidden Dependencies

- no import of Tenant, Principal, Subscription, PlatformInstallation,
  OrchestrationProject, Run, Workspace, or AR aggregates;
- no cross-context SQL, shared Unit of Work, or direct Orchestrator database
  access;
- no synchronous external call inside ProductProject, restriction, receipt, or
  process-state transaction;
- no global resource inventory or physical deletion of another owner's data;
- no readiness boolean used as identity lifecycle or authorization authority.

## Not Owned

- Tenant, principal, membership, subscription, or installation lifecycle;
- OrchestrationProject identity, local admission, runtime binding, or Runs;
- workspace materialization or execution isolation;
- runtime scopes, technical grants, provider effects, or readiness;
- physical deletion of another owner's data.

## Materialization Gate

This is the recommended first package, but materialization remains forbidden
until an accepted decision closes `PO-PLAT-003`, fixes the create transaction
boundary, accepts ManagedProjectScopeAdmissionProcess as a feature-owned process
manager, and defines Project Management-owned Tenant-admission,
create-Project-authority, and Orchestration-scope-admission ports with fake
conformance contracts. The first feature slice must land with the package.

## Open Decisions

- `PO-PLAT-003`: asynchronous acceptance, cancellation, recovery, and blocked UX.
- Whether create receipt and scope-admission process share one Project
  Management transaction boundary.
- Exact Project create input and uniqueness policy; names never become identity.
- `PO-PLAT-007`: Project name uniqueness, rename, and retired-name reuse.
- Orchestrator managed scope-admission service schema and compatibility window.
