---
id: architecture.platform-orchestrator-review.project-provisioning
type: architecture
status: proposed
owner: architecture/provisioning
summary: Durable ProductProject creation, Scope binding, admission, retirement, and owner-local disposition model.
related:
  - architecture.platform-orchestrator-boundary
  - ADR-0004
  - ADR-0005
---

# Project Provisioning, Authority, and Retirement

Provisioning readiness, ProductProject identity, access authority, retirement
commitment, participant disposition, and evidence are deliberately separate.
No state in one axis asserts progress in another.

## Lifecycle vocabulary

This artifact models ProductProject creation and Orchestration Scope binding. It
does not model customer installation or Run execution. New designs use an
explicit lifecycle name:

| Lifecycle | Canonical terms | Owner |
| --- | --- | --- |
| Customer installation | `InstallationPlan`, `InstallationOperation`, `InstallationReconciliation`, `InstallationUpgrade`, `InstallationDisposition` | Platform Deployment Management for desired intent; Customer Installation Control Plane for local acceptance and execution |
| Orchestration scope | `ScopeAdmission`, `ScopeBinding` | Orchestration Scope |
| Run execution | `RunAdmission`, `RuntimeAllocation`, `ExecutionDispatch`, `RuntimeOperation`, `ExecutionRecovery` | Owning Orchestrator BC and AR across their published boundary |

The bare word `provisioning` must be qualified by the resource it creates. A
state or receipt from one lifecycle cannot serve as authority for another.

## ProductProject creation and Scope binding process

```mermaid
stateDiagram-v2
    [*] --> ProjectRecorded
    ProjectRecorded --> PlacementResolving
    PlacementResolving --> OrchestrationScopeProvisioning
    OrchestrationScopeProvisioning --> AuthorityBinding
    AuthorityBinding --> Verifying
    Verifying --> ScopeAdmissionOpening
    ScopeAdmissionOpening --> Ready
    ProjectRecorded --> ReconcileRequired
    PlacementResolving --> ReconcileRequired
    OrchestrationScopeProvisioning --> ReconcileRequired
    AuthorityBinding --> ReconcileRequired
    Verifying --> ReconcileRequired
    ScopeAdmissionOpening --> ReconcileRequired
    ReconcileRequired --> PlacementResolving
    ReconcileRequired --> OrchestrationScopeProvisioning
    ReconcileRequired --> AuthorityBinding
    ReconcileRequired --> Blocked
```

`ManagedProjectProvisioningProcess` owns these steps. ProductProject exists with
an `OPEN` identity before readiness, but admission remains closed until the
required Platform and Orchestrator authority gates allow it. Runtime provider
capacity is a separate readiness input. A read model may display
`PROVISIONING`, `READY`, or `BLOCKED`; those labels never mutate ProductProject.

The process name and state labels remain `PROPOSED`. Binding existence and scope
admission are separate facts. `ScopeAdmissionOpening` is an explicit
Orchestrator-owned CAS after binding verification; neither a binding receipt nor
a process-alive observation can open admission. A transition out of
`ReconcileRequired` first queries or replays the original step command and then
re-evaluates current preconditions. It is never a blind retry edge.

### Creation safety requirements

The proposed safety requirement is narrow: either ProductProject creation does
not commit, or the committed ProductProject is fail closed and has durable
owner-local recovery intent. Each owning context may atomically commit only its
own state, receipt, and outbox. Whether the Platform Project record, customer
command receipt, and managed scope-admission process share one bounded context
and transaction remains `OPEN`; implementation must not choose that aggregate
split silently.

`READY` is only a Platform read projection over current Platform-owned state and
the latest exact owner receipts. Its commit cannot compare-and-swap current
Orchestrator state and never grants admission. Every later operation still checks
the current Platform gate and obtains current Orchestration Scope authority from
that owner. A remote suspension may make the projection stale until observation
or reconciliation arrives without creating an authorization window.

The following identities are distinct and durable:

- the customer Platform create-command identity;
- the managed scope-admission process identity;
- one command identity and canonical digest for each downstream step;
- each owner-local receipt identity.

Reusing one identifier for all four concerns is forbidden. A retry reuses the
original step command identity and digest. A changed command requires a
successor attempt identity after fresh precondition evaluation.

## Authoritative resources and processes

| Status | Resource | Owner | Durable truth | Consistency and failure | Acceptance source and limit |
| --- | --- | --- | --- | --- | --- |
| `CONFIRMED` | ProductProject | Platform Project Management | `OPEN` or terminal `RETIRED`, lifecycle revision, retirement epoch | Aggregate CAS, receipt, audit, and outbox in one Platform transaction | Platform ADR-0004 |
| `CONFIRMED` | ProjectRestriction | Owning Platform authority capability through Project Management | Exact restriction identity, source, scope, revision, and status | One source clears only its exact restriction; stale or conflicting source revision fails closed | Platform ADR-0004 |
| `CONFIRMED` | ProjectAdmissionAuthority | Platform Project Management | Effective gate, admission revision, lifecycle epoch | Restriction mutation and gate revision commit atomically | Platform ADR-0004 |
| `PROPOSED` | Managed scope-admission process | Platform process owner remains to be accepted | Process identity, immutable request digest, and bounded step obligations with command and receipt refs | Eventual convergence; unknown steps queried by original stable identity | Review proposal; exact bounded context, aggregate, cancellation, and blocked semantics remain open |
| `CONFIRMED` | ProductProjectRetirementProcess | Platform Project Management | Commitment, policy and catalog revisions, participant obligations, opaque receipt refs | Cancel and commit race by ProductProject CAS; participant outcomes converge independently | Platform ADR-0004 |
| `CONFIRMED` | OrchestrationProject | Orchestration Scope | Stable identity, local admission authority, lifecycle and deletion epochs | Ownership and terminal lifecycle accepted; tactical aggregate split remains open | Orchestrator ADR-0080 and OD-006 |
| `CONFIRMED` | OrchestrationProjectDispositionProcess | Orchestration Scope | Versioned participant plan, owner obligations, exact receipt refs | Coordinates but never mutates another context's data | Orchestrator ADR-0080 |
| `CONFIRMED` | RuntimeScopeBinding | Orchestration Scope | Binding identity, generation, opaque AR references | Ownership and lifecycle accepted; activation contract and public shape remain proposed | Orchestrator ADR-0079 and ADR-0080 |
| `CONFIRMED` | ManagedRuntimeBinding | Run Orchestration | Participant and selected binding generation | Run-local commit; no unbounded operation or receipt collection | Orchestrator ADR-0079 |
| `CONFIRMED` | AR runtime-scope disposition semantics | AR | AR-owned scope, cutoff, inventory, category actions, and technical receipts | Immutable technical plan, owner-local execution, truthful unknown and reconciliation | AR ADR-0003; exact Published Language and implementation remain open |

## Product authority and retirement commitment

```text
ProductProject identity
  OPEN -> RETIRED

retirement commitment
  REVERSIBLE -> CANCELLED
  REVERSIBLE -> COMMITTED

participant obligation
  PENDING | EXECUTING | SATISFIED | POLICY_RETAINED
  | UNSUPPORTED | UNKNOWN | RECONCILE_REQUIRED
```

ProductProject creation, readiness, suspension, export, and disposition are not
ProductProject identity states. `SUSPENDED`, `Scheduled for deletion`, `Cleanup
in progress`, and `Deletion verified` are projections over separate sources.

A retirement request installs one exact retirement restriction. Cancellation is
allowed only while commitment is `REVERSIBLE` and removes only that restriction.
The irreversible commit compare-and-swaps the current ProductProject revision,
sets `RETIRED`, advances the retirement epoch, records the operation receipt,
and appends the outbox in one transaction. The same identity never returns to
`OPEN`, even if no downstream erase has started.

## Hierarchical disposition

```mermaid
sequenceDiagram
    participant Platform as Platform Retirement Process
    participant Scope as Orchestration Project Disposition
    participant Owners as Orchestrator Data Owners
    participant Runtime as Runtime Scope Disposition
    participant AR as AR Technical Disposition

    Platform->>Platform: close authority gate and pin policy/catalog
    Platform->>Platform: irreversible ProductProject retirement CAS
    Platform->>Scope: idempotent project disposition command
    Scope->>Scope: close local admission and pin participant catalog
    par Owner-local obligations
        Scope->>Owners: freeze Project epoch and dispose owned categories
        Scope->>Runtime: freeze all binding lineages and request runtime disposition
        Runtime->>AR: submit immutable TechnicalDispositionPlan per AR scope
    end
    Owners-->>Scope: exact owner receipts or reconcile required
    AR-->>Runtime: category and barrier receipts
    Runtime-->>Scope: runtime participant receipt
    Scope-->>Platform: Orchestrator project receipt
    Platform->>Platform: compose non-authoritative customer projection
```

Each arrow is a versioned idempotent boundary. Platform treats Orchestrator as
one participant and never imports its internal participant catalog. Orchestrator
treats each owning context and runtime-scope disposition as separate
participants. AR receives only its normalized technical plan.

There is no global `QUIESCING -> INVENTORY -> DISPOSING -> VERIFYING` authority.
Each owner first commits a local freeze against the supplied deletion epoch and
its own revision. The freeze closes delayed and queued writes that were admitted
earlier. Inventory and irreversible actions begin only after that owner's freeze
receipt.

All active and historical RuntimeScopeBinding generations and deployment
incarnations inside the resurrection horizon participate. Retirement closes
creation and rebind through the same OrchestrationProject lifecycle authority
and fixes the binding-index high-water mark used by bounded fan-out.

## Policy and evidence

The product policy snapshot pins intent, source, version, and opaque evidence.
It is not perpetual erase authority. Immediately before each irreversible owner
action, a fresh typed authorization binds resource epoch, category, action,
owner, expected revision, and validity. A new or unknown hold produces retention
plus reconciliation without reopening product or runtime access.

Detailed receipts stay owner-local. Coordinators retain only obligation state,
canonical command/digest identity, and opaque receipt references. Feeds may
announce progress but cannot prove completion; lost acknowledgement is recovered
by exact receipt query or replay.

`POLICY_RETAINED` requires positive policy evidence and a durable follow-up for
retention expiry. `UNKNOWN`, `UNSUPPORTED`, missing backup coverage, shared-key
uncertainty, and unknown provider residue do not become verified deletion.

## Catalog and upgrade rules

- Participant and data-category catalogs are static, typed, versioned, and
  release-governed; runtime plugin discovery is forbidden.
- A new writer cannot be released until it handles retired epochs, returns a
  disposition or verified-absence receipt, and is registered in the catalog.
- An in-flight process pins its catalog and plan revisions. A newly mandatory
  participant is added through an immutable append-only supplement.
- Rolling upgrades support prior plan, command, and receipt versions through the
  declared retirement and restore horizon.
- Minimal tombstones and retirement epochs outlive command retries, delayed
  events, callbacks, stale workers, backup restore, and PITR replay.
- Hosted restore checks a monotonic retirement anchor outside the restored
  backup domain before admission. Local Standalone documents its weaker full-
  machine rollback threat model.

## Workspace, credentials, and keys

- External user-owned source is `UNLINK_ONLY`.
- Workspace Registry alone may dispose a managed clone, worktree, snapshot, or
  execution allocation that the system owns. Managed clones and worktrees
  default to `RETAIN`; destructive disposition additionally requires dirty-state
  evidence, typed policy, and explicit authorization.
- Runtime sandboxes remain AR-owned.
- A shared credential is detached, not globally revoked.
- Private customer content is not cross-tenant deduplicated in v1.
- `crypto_erase` requires exclusive key scope and complete encrypted-copy
  coverage.
- Break-glass can only install or strengthen owner-local restrictions, revocation,
  fences, stops, or quarantine. Receipt query, exact replay, reconciliation,
  containment retry, restoration, and successor attempts remain separately
  authorized normal owner-local use cases. Proposed ADR-0006 defines the
  refinement without changing ADR-0004 until acceptance.

## Required failure evidence

The detailed [concurrency and failure traces](concurrency-failure-traces.md)
define the exact commit orders, crash windows, stale-event behavior, outcomes,
and conformance evidence for:

1. lost downstream response;
2. exact duplicate and conflicting command reuse;
3. stale revision or generation;
4. suspension racing scope binding and admission opening;
5. partial failure and reconciliation.

Additional qualification coverage remains mandatory:

1. Independent billing and security restrictions cannot clear each other.
2. Retirement cancellation racing irreversible commit has exactly one CAS
   winner.
3. A queued write accepted before upstream retirement loses against the local
   owner freeze or is included below its high-water mark.
4. A legal hold arriving after plan creation but before erase wins the last-mile
   authorization check.
5. Runtime rebind racing retirement is either rejected by the lifecycle CAS or
   included in the fixed binding lineage.
6. A new data-owning release is blocked until its catalog, tombstone, and
   disposition conformance exists.
7. Feed gap or lost acknowledgement recovers through exact receipt query, not a
    replacement command.
8. A restored backup cannot recreate Project admission, binding authority, or
    disposed payload.
9. Tenant retirement racing Project creation is serialized by the Tenant epoch
    and project-index high-water mark.
10. External workspace source survives Project retirement. Owned allocations
    follow typed disposition; managed clones and worktrees remain retained by
    default until destructive authorization and evidence exist.
11. Provider `not_found`, unreachable BYOC, missing backup evidence, or shared
    key scope cannot produce verified deletion.
12. UI or CLI disconnect leaves a durable Project or installation operation
    running; only an explicit idempotent cancellation command may stop it.
13. A process-alive observation cannot mark a scope, participant, provider, or
    installation ready. Required readiness lanes report independently.
14. Lost acknowledgement after AR or customer-control-plane acceptance is
    resolved by the original operation ID and semantic fingerprint, never by a
    replacement create, launch, install, or update command.
15. Relaunch, retry, rollback, recovery, cancellation, and disposition remain
    distinct typed commands with independent authorization and receipts.

Cross-tenant transfer remains `UNSUPPORTED_V1`. Standalone-to-managed migration
creates new product and orchestration identities by default. Managed Dedicated,
BYOC, Hybrid, multi-region active-active retirement, configurable retention,
legal-hold UI, compliance export, and deletion certificates remain profile- or
capability-specific follow-up work.
