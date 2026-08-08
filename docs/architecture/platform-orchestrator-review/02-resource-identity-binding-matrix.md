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

| Semantic status | Representation status | Resource | Owner-local identity or public representation | External binding | Cardinality and truth | Acceptance source and limit |
| --- | --- | --- | --- | --- | --- | --- |
| `PROPOSED` | `PROPOSED` | CustomerOrganization | `CustomerOrganizationId` | Legal and CRM references | One organization may own many Tenant; Platform is authoritative | Review proposal; exact Platform bounded context remains open |
| `CONFIRMED` | `CONFIRMED` | PersonalSpace | `PersonalSpaceId` | One opaque human `PlatformPrincipalId` owner binding | At most one active PersonalSpace per human principal in a Platform authority realm; PersonalSpace may own many Tenant | Platform ADR-0002 |
| `PROPOSED` | `PROPOSED` | Tenant | `PlatformTenantId` | `AuthorityBindingSlot.PRIMARY` orchestration tenant binding | One owner may have many Tenant; Tenant is product isolation boundary | Platform ADR-0002 confirms the closed owner union, not the full Tenant aggregate or binding contract |
| `CONFIRMED` | `PROPOSED` | ProductProject | Owner-local `ProductProjectId`; public resource representation remains proposed | `AuthorityBindingSlot.PRIMARY` orchestration project binding | Exactly one Tenant; `OPEN -> RETIRED` identity and retirement epoch are Platform-authoritative | Platform ADR-0004; binding and public representation remain proposed |
| `CONFIRMED` | `CONFIRMED` | ProjectRestriction | Stable owner-local restriction identity scoped to ProductProject | Typed source, capability scope, and source revision | Independent sources coexist; one exact source revision clears only its own restriction | Platform ADR-0004 |
| `CONFIRMED` | `CONFIRMED` | ProductProjectRetirementProcess | Stable owner-local retirement operation ID | Immutable command digest, policy/catalog revisions, and participant plan | One process per retirement request; obligations are bounded external records, not an aggregate collection | Platform ADR-0004 |
| `CONFIRMED` | `PROPOSED` | PlatformInstallation | Owner-local `PlatformInstallationId` | Tenant, placement target, customer control-plane identity, and desired revision | Platform owns product identity and desired state; it does not own customer-local execution state | Platform ADR-0005; public representation remains unqualified |
| `CONFIRMED` | `PROPOSED` | DeploymentPlan | Owner-local content-addressed plan ID and digest | Predecessor plan, target installation, capability requirements, validity, and signing identity | Immutable Platform-issued intent; acceptance is a separate customer-owned fact | Platform ADR-0005; exact schema remains unqualified |
| `CONFIRMED` | `PROPOSED` | InstallationEnrollment | Customer-local installation identity | PlatformInstallation ref, trust anchor, and accepted plan chain | Customer control plane owns lifecycle, local policy acceptance, and authority continuity | Platform ADR-0005; exact protocol remains unqualified |
| `CONFIRMED` | `PROPOSED` | InstallationOperation | Stable customer-local operation ID | Accepted plan revision, immutable command digest, and target generation | One durable operation per semantic install, update, rollback, or disposition intent | Platform ADR-0005; exact protocol remains unqualified |
| `CONFIRMED` | `PROPOSED` | InstallationWriterLease | Customer-local lease ID | Installation authority epoch, writer identity, plan revision, and expiry | At most one mutation-authoritative lease per installation authority epoch | Platform ADR-0005; exact protocol remains unqualified |
| `PROPOSED` | `PROPOSED` | PlatformPrincipal | `PlatformPrincipalId` | IdP issuer, external subject, source incarnation | Platform Identity owns principal and binding continuity; scoped memberships are separate Access and Authority records | Platform identity model remains open; Orchestrator OD-012 concerns a different identity |
| `PROPOSED` | `PROPOSED` | OrchestrationPrincipal | Tenant-scoped `OrchestrationPrincipalId` | Authority realm, external principal, source incarnation | Orchestrator authorship identity remains stable across IdP migration | Orchestrator OD-012 remains open |
| `CONFIRMED` | `OPEN` | OrchestrationTenant | Stable owner-local identity; exact public resource name remains open | Opaque Platform or Standalone scope | Orchestration Scope owns stable identity and binding lifecycle | Orchestrator ADR-0080; exact public identity remains under OD-019 |
| `CONFIRMED` | `OPEN` | OrchestrationProject | Stable owner-local identity; exact public resource name remains open | ProductProject identity and incarnation | Orchestration Scope owns stable identity, terminal lifecycle, and admission | Orchestrator ADR-0080; exact public identity remains under OD-019 |
| `CONFIRMED` | `PROPOSED` | RuntimeScopeBinding | Stable private Orchestrator-owned binding identity; no public API representation is accepted | Runtime authority realm, deployment, incarnation, and opaque AR scope refs | Orchestration Scope owns the lifecycle; multiple bindings are allowed and one generation is active per binding identity | Orchestrator ADR-0079 and ADR-0080; exact resource shape remains under OD-006 and OD-019 |
| `CONFIRMED` | `PROPOSED` | ManagedRuntimeBinding | Private `ManagedRuntimeBindingId`, distinct from `RunParticipantId` | RuntimeScopeBinding identity and expected generation | Run Orchestration owns the bounded participant-to-runtime association; it does not contain an unbounded operation or receipt collection | Orchestrator ADR-0079; binding remains a private implementation concept under OD-019 and exact aggregate shape remains under OD-006 |
| `CONFIRMED` | `PROPOSED` | Run runtime target inventory entry | Private Run-owned target-entry identity | Opaque AR operation/session target, authority generation, expected revisions, and effect identity | One durable entry per target; cutoff scans a fixed inventory high-water mark in bounded pages and records per-target obligations | Orchestrator ADR-0079 accepts the required semantics but leaves tactical aggregate shape under OD-006 |
| `CONFIRMED` | `OPEN` | AR technical mutation identity dimensions | Exact public identity names remain open | AR tenant and runtime-project scope, stable authority realm, logical deployment, incarnation, authority generation, and scope revision | Every accepted AR mutation is bound to applicable technical identities and preconditions | AR ADR-0003; this confirms semantics only, not a public identity or provisioning API |
| `OPEN` | `OPEN` | AR runtime deployment and scope Published Language | Not frozen | Future authenticated Orchestrator provisioning identity, handshake, attestation, and scope references | Exact identities, provisioning cardinality, schema, external anchor, and generated clients require an AR contract decision | AR ADR-0003 and ADR-0004 explicitly defer these details |

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
| Runtime scope binding | Desired-state commit, then activation CAS | Binding generation, deployment incarnation, AR scope revision | Ambiguous scope-admission work is resolved by `CanonicalCommandScope + CommandDescriptor + requestId`, canonicalization version, and semantic fingerprint; request ID alone is insufficient |
| Run managed binding | Run-local commit | Run authority generation and expected binding generation | Stale binding blocks new dispatch, never rewrites the Run silently |
| Run runtime target entry | Dispatch-admission transaction through the Run authority gate | Run authority generation, semantic revocation fence, exact scope-admission evidence, target sequence, original AR command identity and digest, and effect identity | Target insertion and suspension serialize through one gate. Suspension atomically closes admission, advances generation, captures the target-sequence high-water mark, and records one cutoff trigger; no committed target can cross the captured boundary unnoticed |
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
disposition but leaves their exact public names and transport open. AR ADR-0004
separately accepts the pre-materialization negative operation-intent guard. The
scope-provisioning API, handshake, attestation, external anchor, generated
client, and technical-grant model remain open and cannot be treated as an
implemented or qualified capability.

`OPEN`: the concrete recovery protocol when Platform, Orchestrator, and AR are
restored to different timestamps.
