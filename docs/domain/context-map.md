---
id: domain.context-map
type: architecture
status: proposed
owner: architecture/domain
summary: Proposed Platform bounded contexts, ownership boundaries, and materialization gates.
related:
  - ADR-0002
  - ADR-0003
  - ADR-0004
  - ADR-0005
  - architecture.platform-orchestrator-boundary
---

# Platform Strategic Context Map

This map proposes Platform model boundaries. It does not accept a bounded
context, aggregate shape, wire contract, or production package. Accepted ADRs
confirm only the narrow semantics cited by each dossier.

There is no target count for bounded contexts. A split or merge requires a real
difference in language, invariants, lifecycle, consistency, security, ownership,
or evolution. A business capability, process manager, integration adapter, and
workspace package are not automatically bounded contexts.

## Candidate contexts

| Bounded context | Classification | Boundary status | Evidence maturity | Primary responsibility | System of record | Dossier |
| --- | --- | --- | --- | --- | --- | --- |
| Customer Ownership | Supporting | `PROPOSED` | PersonalSpace and owner-reference semantics partially confirmed by ADR-0002 | Personal and customer-organization ownership identities without PII, tenancy, membership, or billing state | Customer-owner identity, lifecycle, and tombstone store | [Dossier](contexts/customer-ownership/README.md) |
| Tenancy | Supporting, security-critical | `PROPOSED` | TenantOwnerRef and selected retirement constraints partially confirmed by ADR-0002 and ADR-0004 | Product isolation boundary, owner binding, tenant admission, lifecycle epoch, and bounded Project fan-out | Tenant authority, lifecycle, admission, and retirement-process store | [Dossier](contexts/tenancy/README.md) |
| Platform Identity | Supporting, security-critical | `PROPOSED` | Principal separation and privacy constraints partially confirmed by ADR-0002 | Stable Platform principals, external identity bindings, explicit IdP migration, privacy erasure, and identity tombstones | Platform principal identity and binding store | [Dossier](contexts/identity/README.md) |
| Access and Authority | Supporting, security-critical | `PROPOSED` | Independent access ownership partially confirmed by ADR-0002; exact membership, grant, and delegation models remain open | Memberships, direct grants, delegations, revocation, and capability-specific product authority decisions | Product access and authority store | [Dossier](contexts/access-authority/README.md) |
| Project Management | Core | `PROPOSED` | ProductProject, admission, restriction, and retirement semantics confirmed by ADR-0004 | ProductProject identity, admission authority, managed scope-admission process, and product retirement coordination | ProductProject, admission, command-receipt, and owner-local process store | [Dossier](contexts/project-management/README.md) |
| Commercial Access | Supporting | `PROPOSED` | Direction only; subscription and entitlement model remains open | Commercial agreements, subscriptions, entitlements, and exact commercial restrictions without accounting or operational usage ownership | Commercial agreement, subscription, entitlement, and restriction store | [Dossier](contexts/commercial-access/README.md) |
| Deployment Management | Supporting, strategic enabling | `PROPOSED` | PlatformInstallation and immutable plan semantics confirmed by ADR-0005 | Managed deployment intent, placement policy, release policy, desired revision, and signed DeploymentPlan publication | Platform installation intent and immutable signed-plan chain | [Dossier](contexts/deployment-management/README.md) |

`PROPOSED` means no production package may be created. Evidence maturity does
not promote the whole boundary by implication.

## Relationship map

```text
Customer Ownership -- concrete owner facts ------> Tenancy-owned TenantOwnerRef
Platform Identity --- opaque principal refs -----> Access and Authority
Access and Authority -- scoped authority facts --> Tenancy
Access and Authority -- capability decisions ----> Project Management
Commercial Access --- exact restrictions --------> Project Management
Tenancy ------------ opaque TenantRef ------------> Project Management
Project Management -- managed lifecycle ACL ------> Orchestration Scope
Deployment Management -- signed desired plan ----> Customer Installation Control Plane
```

Relationships describe semantic flow, not source imports. The consuming context
owns a narrow port and local reference type. Provider DTOs terminate in an ACL.
One context never writes another context's tables, inbox, outbox, feed, or
projection.

## Dependency invariants

- Domain and application source may import only its own context, context-local
  primitives, or dependency-free technical primitives explicitly accepted for
  all consumers. A cross-context Shared Kernel requires its own accepted ADR and
  joint ownership; none exists today.
- A consuming context owns its port, local opaque reference, timeout, stale
  behavior, and reconciliation policy. An upstream adapter implements that port.
- Provider DTOs, generated clients, ORM rows, SDK models, and integration events
  terminate in adapters or ACLs and never become domain entities.
- No cross-context SQL, repository reuse, foreign-key ownership, Unit of Work,
  transaction, cache authority, or cascade delete is permitted.
- Process managers live in the context that owns the business outcome. They
  persist only bounded child identities, commands, receipts, and recovery state.
- Shared code may contain technical algorithms and exact value primitives, but
  never `Tenant`, `Project`, `Principal`, `Subscription`, `Installation`, or
  other business entities from these contexts.
- Cyclic synchronous calls and cyclic package imports are forbidden. Cyclic
  business collaboration must be an explicit asynchronous process with one
  owner and typed failure states.

## External ownership

Platform must not duplicate these authorities:

| External owner | Exclusive truth |
| --- | --- |
| Orchestrator Orchestration Scope | Stable orchestration tenant and Project identity, local admission, authority bindings, project-level RuntimeScopeBinding, and whole-Orchestrator disposition coordination |
| Orchestrator Run Orchestration | Run lifecycle, authority generation, participants, runtime target inventory, cutoff obligations, and participant-level ManagedRuntimeBinding |
| Orchestrator usage contexts | Operational usage observations, accounting, budgets, reservations, limits, and consumption decisions |
| Orchestrator Workspace Registry and Policy and Risk | Workspace materialization and product execution-isolation requirements |
| Orchestrator Agent Organization | Semantic organizations and arbitrary hierarchy of agent teams, distinct from CustomerOrganization |
| Agent Runtime | Runtime scopes, sessions, operations, provider effects, technical permissions, credentials, fencing, containment, and recovery |
| Customer Installation Control Plane | Customer-local plan acceptance, writer authority, installation operations, inventory, upgrades, rollback, and uninstall |

Platform consumes opaque references and versioned receipts. It never imports an
external aggregate or invents an unaccepted AR Published Language.

## First vertical slice

The recommended first slice remains inside Project Management:

```text
CreateProductProject
-> atomically commit ProductProject + initial DENIED ProjectAdmissionAuthority
   + command receipt + scope-admission process intent + outbox
-> run ManagedProjectScopeAdmissionProcess
-> invoke Project Management-owned OrchestrationScopeAdmissionPort
-> reconcile duplicate, lost, stale, and unknown outcomes by original identity
-> expose non-authoritative ScopeAdmissionReadiness
```

`ProductProject` exists before orchestration readiness and remains fail closed.
Readiness never changes its identity lifecycle and never grants Orchestrator
admission. Runtime-scope activation, technical grants, runtime dispatch, and AR
readiness are later slices blocked on the future AR Published Language.

The proposed first-slice Unit of Work is fail closed: all five owner-local records
commit in one Project Management transaction or no ProductProject is created.
Missing ProjectAdmissionAuthority always means denied. External calls occur only
after commit through durable dispatch. The superseding ADR must accept this
linearization point before materialization. The slice also requires accepted
consumer-owned ports for current Tenant admission and create-Project authority;
fakes implement those ports in package tests without creating speculative
upstream packages.

`ManagedProjectScopeAdmissionProcess` is proposed as a feature-owned process
manager in Project Management. It becomes a separate bounded context only after
independent language, lifecycle, ownership, and at least a second proven
consumer make extraction necessary.

## Product-owner decisions

These product-level forks block a broad Platform domain ADR:

1. `PO-PLAT-001`: whether CustomerOrganization and Tenant memberships both
   exist, and which permissions each scope controls.
2. `PO-PLAT-002`: whether transitive delegation exists, its maximum depth,
   renewal, expiry, and user-visible revocation behavior.
3. `PO-PLAT-003`: the user contract for partially prepared ProductProject:
   accepted asynchronously, cancellation semantics, operator recovery, and
   terminal blocked outcomes.
4. `PO-PLAT-004`: the commercial model for subscriptions, entitlements,
   credits, overage, invoices, and billing restrictions.
5. `PO-PLAT-005`: principal merge or split policy, PII erasure, audit
   tombstones, and IdP migration behavior.
6. `PO-PLAT-006`: CustomerOrganization and Tenant transfer, retirement,
   suspension, restoration, merge, and split policy for v1.
7. `PO-PLAT-007`: tenant-scoped ProductProject naming, uniqueness, rename, and
   reuse behavior after retirement.

Technical details below those policies are resolved by owning ADRs and
conformance evidence without escalating every field or class name.

## Explicit non-contexts

The following are not separate Platform bounded contexts in v1:

- Managed Project Scope Admission: process-manager feature in Project
  Management;
- customer onboarding: process managers over owning contexts;
- Data Governance: narrow policy ports and owner-local disposition until an
  independent business lifecycle appears;
- Commercial Accounting: credits, rating, invoicing, tax, and billing corrections
  are not reserved until an independent language and lifecycle are proven;
- Platform Usage Accounting: operational truth remains in Orchestrator;
- Qualification: evidence pipeline, not product domain;
- cross-system deletion: hierarchical owner-local disposition, not a global
  aggregate or service;
- Customer Installation Control Plane: independently owned customer-side
  technical control plane.

Commercial rating or invoicing may later justify a Commercial Accounting
context. It is not reserved until its language and lifecycle are proven.

## Materialization rule

The [package catalog](../../architecture/package-catalog.yaml) reserves package
identities only. Foundation scaffolding accepts only owner documents with
`status: accepted`. Every current dossier is `proposed`, so package creation is
fail closed. Status alone does not grant materialization authority. An immutable
accepted ADR must explicitly accept the target, and the dossier must bind that
ADR and name its first real feature. The accepted owner, implementation and
tests, content-addressed Foundation Plan, validated Apply Receipt, and generated
package envelope must land in the same reviewed change. The gate also rejects
symlinked or uncatalogued context packages and stale Plan authority inputs.
