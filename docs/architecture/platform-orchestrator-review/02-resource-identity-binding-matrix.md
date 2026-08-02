---
id: architecture.platform-orchestrator-review.resource-bindings
type: architecture
status: proposed
owner: architecture/integration
summary: Proposed identity, cardinality, binding generation, and lifecycle rules across systems.
related:
  - architecture.platform-orchestrator-boundary
  - ADR-0002
  - ADR-0004
  - ADR-0005
---

# Resource Identity and Binding Matrix

| Status | Resource | Public identity | External binding | Cardinality and truth |
| --- | --- | --- | --- | --- |
| `PROPOSED` | CustomerOrganization | `CustomerOrganizationId` | Legal and CRM references | One organization may own many Tenant; Platform is authoritative |
| `CONFIRMED` | PersonalSpace | `PersonalSpaceId` | One opaque human `PlatformPrincipalId` owner binding | At most one active PersonalSpace per human principal in a Platform authority realm; PersonalSpace may own many Tenant |
| `PROPOSED` | Tenant | `PlatformTenantId` | `AuthorityBindingSlot.PRIMARY` orchestration tenant binding | One owner may have many Tenant; Tenant is product isolation boundary |
| `CONFIRMED` | ProductProject | `ProductProjectId` | `AuthorityBindingSlot.PRIMARY` orchestration project binding | Exactly one Tenant; `OPEN -> RETIRED` identity and retirement epoch are Platform-authoritative |
| `CONFIRMED` | ProjectRestriction | Stable restriction identity scoped to ProductProject | Typed source, capability scope, and source revision | Independent sources coexist; one exact source revision clears only its own restriction |
| `CONFIRMED` | ProductProjectRetirementProcess | Stable retirement operation ID | Immutable command digest, policy/catalog revisions, and participant plan | One process per retirement request; obligations are bounded external records, not an aggregate collection |
| `CONFIRMED` | PlatformInstallation | `PlatformInstallationId` | Tenant, placement target, customer control-plane identity, and desired revision | Platform owns product identity and desired state; it does not own customer-local execution state |
| `CONFIRMED` | DeploymentPlan | Content-addressed plan ID and digest | Predecessor plan, target installation, capability requirements, validity, and signing identity | Immutable Platform-issued intent; acceptance is a separate customer-owned fact |
| `CONFIRMED` | InstallationEnrollment | Customer-local installation identity | PlatformInstallation ref, trust anchor, and accepted plan chain | Customer control plane owns lifecycle, local policy acceptance, and authority continuity |
| `CONFIRMED` | InstallationOperation | Stable customer-local operation ID | Accepted plan revision, immutable command digest, and target generation | One durable operation per semantic install, update, rollback, or disposition intent |
| `CONFIRMED` | InstallationWriterLease | Customer-local lease ID | Installation authority epoch, writer identity, plan revision, and expiry | At most one mutation-authoritative lease per installation authority epoch |
| `PROPOSED` | PlatformPrincipal | `PlatformPrincipalId` | IdP issuer, external subject, source incarnation | Many-to-many Tenant membership; Platform is authoritative |
| `PROPOSED` | OrchestrationPrincipal | Tenant-scoped `OrchestrationPrincipalId` | Authority realm, external principal, source incarnation | Orchestrator authorship identity remains stable across IdP migration |
| `CONFIRMED` | OrchestrationTenant | `OrchestrationTenantId` | Opaque Platform or Standalone scope | Orchestration Scope owns stable identity and binding lifecycle; public representation remains open |
| `CONFIRMED` | OrchestrationProject | `OrchestrationProjectId` | ProductProject identity and incarnation | Orchestration Scope owns stable identity, terminal lifecycle, and admission; public representation remains open |
| `CONFIRMED` | RuntimeScopeBinding | Stable Orchestrator-owned binding ID | Runtime authority realm, deployment, incarnation, and opaque AR scope refs | Orchestration Scope owns the lifecycle; multiple bindings are allowed and one generation is active per binding ID |
| `CONFIRMED` | ManagedRuntimeBinding | Run participant identity | RuntimeScopeBinding ID and expected generation | Run Orchestration owns the bounded participant-to-runtime association; it does not contain an unbounded operation or receipt collection |
| `PROPOSED` | Run runtime target inventory entry | Run-owned target-entry identity | Opaque AR operation/session target, authority generation, expected revisions, and effect identity | One durable entry per target; cutoff scans bounded pages and records per-target obligations |
| `OPEN` | AR RuntimeAuthorityRealm and RuntimeDeployment | AR-owned opaque IDs | Trust root, independently fenced authority cell, incarnation, and monotonic authority generation | Design direction exists, but AR has not accepted its public identity or provisioning contract; endpoint or host changes must not be assumed to rename a logical deployment |
| `PROPOSED` | AR RuntimeProjectScope | AR-owned opaque ID | Stable authenticated Orchestrator provisioning identity | AR owns scope identity and lifecycle; exact Published Language names and schemas are not frozen |

## Cardinality

```text
CustomerOrganization 1 -> 0..N Tenant
PlatformPrincipal    1 -> 0..1 active PersonalSpace
PersonalSpace        1 -> 0..N Tenant
Tenant               1 -> 0..N ProductProject
ProductProject       1 -> exactly one Tenant
PlatformPrincipal    N <-> N Tenant through Membership

Tenant         -> 0..1 active AuthorityBindingSlot.PRIMARY binding
ProductProject -> 0..1 active AuthorityBindingSlot.PRIMARY binding
OrchestrationProject -> 0..N RuntimeScopeBinding
RuntimeScopeBindingId -> exactly one active generation
ManagedRuntimeBinding -> bounded participant association
Run authority generation -> 0..N separately persisted target inventory entries

PlatformInstallation 1 -> 0..N immutable DeploymentPlan
InstallationEnrollment 1 -> exactly one accepted plan head
InstallationEnrollment 1 -> exactly one active authority epoch
Installation authority epoch -> 0..1 active InstallationWriterLease
InstallationOperation -> exactly one immutable semantic fingerprint
```

## Continuity rules

- IDs are never reused after terminal deletion.
- ProductProject provisioning and readiness do not change identity lifecycle.
  `SUSPENDED` and deletion-progress labels are read projections, not authority.
- Retirement cancellation and irreversible commit serialize through one
  ProductProject CAS. The commit advances the retirement epoch even if physical
  disposition has not begun.
- Tenant owns its closed `TenantOwnerRef`; owner aggregates do not maintain a
  second authoritative Tenant collection.
- PersonalSpace contains no IdP PII, membership collection, billing state, or
  service-principal ownership.
- Rename, normal restart, ordinary restore, and environment labels do not create
  a new incarnation.
- Recreation or inability to prove authority continuity creates a new
  incarnation.
- Different lifecycle, membership, or data policy creates another
  ProductProject. Placement-only differences create RuntimeScopeBindings.
- Cross-tenant project transfer, merge, and split return `UNSUPPORTED_V1`
  without side effects.
- Delayed observations from generation N cannot mutate generation N+1.
- Platform desired revision, customer installation authority epoch, installation
  enrollment incarnation, writer lease, RuntimeScopeBinding generation, AR
  deployment authority generation, Run authority generation, and execution
  authority lease are distinct dimensions. Equality or advancement in one
  implies nothing about another.
- A normal restart or rolling update preserves `InstallationEnrollment` only
  when authority continuity is proven. Destructive or ambiguous restore creates
  a successor epoch and requires reconciliation before mutation.

## Concurrency and recovery

| Binding | Linearization point | Fence | Idempotency and stale behavior |
| --- | --- | --- | --- |
| Principal binding | Binding CAS | Binding revision and realm migration epoch | External binding key remains unique through tombstone horizon |
| Project authority binding | Scope aggregate commit | Authority revision, source incarnation, deletion epoch | Old realm or source revisions are ignored and audited; the external binding key is write-unique |
| Product project admission | Restriction mutation and effective-gate CAS | Source revision, admission revision, lifecycle epoch | A source clears only its exact restriction; stale projection cannot reopen access |
| Product project retirement | ProductProject terminal CAS | Lifecycle revision and retirement epoch | Same request replays receipt; cancel and commit have one winner |
| Runtime scope binding | Desired-state commit, then activation CAS | Binding generation, deployment incarnation, AR scope revision | Ambiguous provisioning is queried by stable request ID |
| Run managed binding | Run-local commit | Run authority generation and expected binding generation | Stale binding blocks new dispatch, never rewrites the Run silently |
| Run runtime target entry | Per-target inventory commit before dispatch | Run authority generation, expected AR target revision, and effect identity | Cutoff materialization is idempotent per target; historical obligations survive reauthorization through the reconciliation horizon |
| Platform installation intent | PlatformInstallation commit | Desired revision, plan digest, predecessor digest, validity | Published plans are immutable; a replacement is a successor, never an in-place rewrite |
| Customer installation enrollment | Customer-local acceptance transaction | Accepted plan head and InstallationAuthorityEpoch | Timeout recovers by plan digest and acceptance receipt; no second enrollment is guessed |
| Installation writer authority | Customer-local lease issuance CAS | InstallationAuthorityEpoch, fencing token, expiry, and writer identity | Expired or predecessor leases cannot mutate; KMS possession alone is insufficient |
| Installation operation | Operation claim and atomic generation publication | Accepted plan revision, writer fence, operation fingerprint, activation generation | Lost acknowledgement is queried by operation ID; unknown artifact activation is reconciled before retry or rollback |

The authority reverse-binding key is the typed tuple of authority realm,
resource kind, external resource identity, source incarnation, and
`AuthorityBindingSlot`. At most one write-authoritative Orchestration scope may
hold that key. Historical tombstones may coexist but cannot admit mutations.
Creation and rebinding require a CAS against the Orchestrator-owned binding
index; restore conflicts enter quarantine and reconciliation instead of
selecting a winner automatically.

Orchestrator `bindingGeneration` is meaningful to AR only as opaque correlation or
signed evidence. AR decides `stale` from its own target identity, scope revision,
deployment incarnation, authority generation, and control-grant semantics.

AR ADR-0003 accepts the technical identity dimensions used by cutoff and
disposition but leaves their exact names open. AR ADR-0004 separately accepts the
pre-materialization negative operation-intent guard. The fuller realm,
deployment, incarnation, external-anchor lease, scope-provisioning, and
technical-grant model remains open and cannot be treated as a qualified
capability.

`OPEN`: the concrete recovery protocol when Platform, Orchestrator, and AR are
restored to different timestamps.
