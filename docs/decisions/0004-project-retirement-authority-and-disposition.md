---
id: ADR-0004
type: adr
status: accepted
owner: product/project-lifecycle
summary: Separate ProductProject identity, admission authority, retirement commitment, owner-local disposition, and deletion evidence.
approved_by: product-owner
accepted_at: 2026-08-02
related:
  - ADR-0002
  - ADR-0003
  - architecture.platform-orchestrator-boundary
---

# ADR-0004: Project Retirement Authority and Disposition

## Context

Platform must support Managed Shared SaaS, Standalone Authority, multiple runtime
deployments, and future Dedicated, BYOC, and Hybrid profiles without giving one
system authority over another system's domain state. A project may lose product
access before queued Orchestrator commands, active runtime operations, immutable
backups, provider residue, or policy-retained data have converged.

A scalar lifecycle such as `ACTIVE -> SUSPENDED -> DELETING -> DELETED` would
mix unrelated consistency boundaries:

- stable ProductProject identity;
- product access and admission authority;
- provisioning and readiness;
- a reversible retirement request and its irreversible commitment;
- owner-local quiescence, inventory, disposition, and verification;
- retention, legal-hold, export, and deletion-evidence outcomes.

The legacy desktop product proves useful failure cases, including durable
deletion intent, an explicit destructive boundary, crash recovery, target
identity fencing, and restore prevention. Its soft-delete vocabulary, fixed
backup duration, and local directory inventory do not define the new domain.

## Decision

### ProductProject identity is minimal

`ProductProject` owns exactly one terminal identity transition:

```text
OPEN -> RETIRED
```

`RETIRED` means that the product identity is permanently closed, its authority
cannot reopen, and its ID and incarnation cannot be reused. It does not claim
that every physical copy has been erased.

Provisioning, runtime readiness, access suspension, retirement preparation,
data disposition, and export are separate processes or projections. `ACTIVE`,
`SUSPENDED`, `DELETING`, and `DELETED` are permitted as user-facing derived
classifications, never as mutation authority.

`ProductProject` stores its lifecycle revision and monotonic retirement epoch.
The irreversible retirement commit compare-and-swaps the exact open revision,
sets `RETIRED`, advances the epoch, records the retirement operation, and appends
the outbox record in one Platform transaction.

### Admission authority is a separate consistency boundary

Independent owners may restrict different capabilities at the same time. The
Platform model therefore uses typed restriction facts instead of one suspension
boolean or an unbounded policy bag inside `ProductProject`:

```text
ProjectRestriction
  restrictionId
  ProductProjectId
  source
  capabilityScope
  sourceRevision
  status

ProjectAdmissionAuthority
  ProductProjectId
  effectiveGate
  admissionRevision
  lifecycleEpoch
```

Adding or clearing one exact restriction and advancing the authoritative gate
revision is atomic. A source can clear only the restriction identity and source
revision it owns. Removing a billing restriction cannot remove a security,
tenant, manual, or retirement restriction. An unavailable, stale, or gapped
restriction projection fails closed for affected mutations.

Authorization and dispatch consume the authoritative gate revision. A read
projection may display `Access paused`, but it never authorizes a mutation.
Narrow maintenance capabilities such as reconciliation, an authorized export,
or cancellation of a still-reversible retirement request are evaluated
separately and do not reopen ordinary access.

### Retirement commitment and disposition progress are orthogonal

`ProductProjectRetirementProcess` owns the product request, policy references,
commitment, downstream obligations, and opaque receipt references. Its
authoritative dimensions are:

```text
commitment
  REVERSIBLE | COMMITTED | CANCELLED

participant obligation
  PENDING
  | EXECUTING
  | SATISFIED
  | POLICY_RETAINED
  | UNSUPPORTED
  | UNKNOWN
  | RECONCILE_REQUIRED
```

There is no global `QUIESCING -> DISPOSING -> VERIFYING` state. Participants
progress independently and may legitimately be in different conditions. Any
overall status is a read projection over exact obligations and receipts.

A retirement request immediately installs its own access restriction. Before
commit, the owning use case resolves and pins:

- one immutable product policy decision and version;
- the current versioned participant and data-class catalog;
- required export preconditions, when explicitly requested;
- the exact ProductProject revision and retirement request digest.

Cancel and commit race through one ProductProject CAS. Cancellation removes
only the retirement restriction it owns. A winning commit makes the identity
terminal even if no physical erase has started; no compensation may restore the
old ProductProject afterward.

### Disposition is hierarchical and owner-local

Platform coordinates its own data owners and treats Orchestrator as one
downstream participant:

```text
Platform ProductProjectRetirementProcess
  -> Platform-local owner obligations
  -> Orchestrator project-disposition contract
       -> Orchestrator owner obligations
       -> Runtime-scope disposition participant
            -> AR TechnicalDispositionPlan
```

Platform never enumerates Orchestrator Runs, Work, Messages, runtime bindings,
AR sessions, operations, keys, or provider state. It observes typed receipts and
reconciles unknown outcomes by the original command identity.

Every owner first commits a local `FreezeProject(epoch)`-equivalent fence before
freezing its inventory or performing an irreversible action. This closes queued
and delayed writes that passed an upstream boundary earlier. Each owner then
disposes or retains only its own records, projections, inboxes, outboxes, feeds,
blobs, journals, credentials, keys, backups, and external residues.

Each local mutation records owner state, durable receipt, audit reference, and
outbox atomically. The same command ID and canonical digest replay the prior
receipt; the same ID with different content is a hard conflict. Feeds are
delivery mechanisms, not completion authority. Lost acknowledgement is recovered
through exact receipt query or replay.

### Policy snapshots do not authorize later erasure by themselves

The immutable policy snapshot defines the intended plan and its provenance. A
fresh typed erase authorization is also required immediately before each
irreversible owner action. This last-mile check binds the policy decision,
resource and lifecycle epoch, data category, action, owner, validity, and
expected revision.

An unknown or newly applied legal hold fails closed as retention plus
reconciliation. A hold may prevent an erase without reopening product access or
runtime authority. Policy correction creates a new immutable plan revision or
supplement; it does not rewrite completed receipts or undo an irreversible
action.

Legal-hold case management, jurisdiction rule authoring, and compliance export
do not justify a separate Data Governance bounded context in v1. Project
Management owns a narrow policy-resolution port. A future ADR may extract Data
Governance after those capabilities demonstrate independent language,
invariants, and lifecycle.

### Catalog, upgrades, and anti-resurrection

The participant catalog is static, typed, versioned, and release-governed. It is
not runtime plugin discovery. A new data-owning feature cannot be released until
it declares its categories, freeze behavior, disposition or verified-absence
receipt, tombstone checks, and compatibility with supported retirement-plan
revisions.

An in-flight process pins its catalog version. Newly required participation is
added through an append-only immutable supplement rather than mutating the old
plan. Rolling upgrades keep handlers for supported prior plan and receipt
versions through the declared retirement horizon.

Retirement epochs and minimal non-sensitive tombstones survive the maximum
command retry, delayed callback, feed replay, stale-worker, backup, and PITR
horizon. Hosted restore must compare restored state with a monotonic retirement
anchor outside the restored backup domain before admitting mutations. Local
Standalone uses protected installation state outside its ordinary database and
documents that rollback of the entire machine plus protected state cannot be
detected absolutely without an external witness or hardware monotonic counter.

No externally supplied tenant, project, command, or receipt identity may become
a cross-tenant existence oracle.

### Data custody rules

- External user-owned workspace source is `UNLINK_ONLY` and is never deleted by
  Project retirement.
- A system-owned managed clone, worktree, snapshot, or execution allocation may
  be disposed only by its owning Workspace capability and typed policy.
- Cross-tenant deduplication of private customer content is forbidden in v1.
- A shared credential is detached from the retiring Project; it is not revoked
  for unrelated consumers.
- Cryptographic erasure is allowed only with proven exclusive key scope and
  coverage of every required encrypted copy.
- Provider `not_found` is not deletion evidence. Unsupported or unreachable
  provider deletion remains explicit and non-successful.
- Break-glass may fence, revoke, stop, quarantine, retry, or reconcile. It may
  not remove a hold, rewrite a receipt, erase evidence, reopen a retired identity,
  or declare disposition complete.

### Tenant and principal separation

Principal disablement, PII erasure, and IdP migration do not retire Tenant or
ProductProject. Tenant retirement first closes tenant admission and Project
creation through one tenant authority CAS, fixes a project-index high-water
mark, and fans out Project retirement in bounded pages. It never stores an
unbounded authoritative Project collection or deletes Project-owned tables in a
Tenant transaction.

## V1 release boundary

Managed Shared SaaS qualification requires operational tenant and Project
offboarding, per-tenant disposition isolation, owner-local receipts,
anti-resurrection, workspace custody classification, fixed versioned retention
policy, and truthful `UNKNOWN`, `UNSUPPORTED`, and `POLICY_RETAINED` outcomes.

Self-service deletion UI, configurable retention, legal-hold UI, compliance
export, deletion certificates, multi-region active-active retirement, production
cryptographic erasure, Dedicated, BYOC, and Hybrid disposition are deferred until
their owning profile or product capability is enabled. Their absence cannot be
represented as verified deletion.

## Consequences

- Identity, access, product commitment, technical disposition, policy, and
  evidence can evolve independently without a shared lifecycle enum.
- Each bounded context keeps one mutation owner and one local transaction
  boundary while the end-to-end process remains recoverable.
- New data owners require explicit catalog and conformance work instead of being
  silently omitted from deletion.
- The model has more durable records and reconciliation paths than an immediate
  hard delete, but avoids false completion and later domain-boundary refactoring.
- DRY applies to narrow command, digest, inbox, outbox, receipt, and process-runner
  primitives. Domain states, actions, evidence, and ownership are not generalized
  into a lifecycle or workflow framework.

## Rejected alternatives

- One ProductProject lifecycle enum spanning suspension, deletion, retention,
  physical erase, and evidence.
- A generic cross-system deletion service or distributed transaction.
- A central canonical evidence aggregate that duplicates owner receipts.
- An unbounded restriction collection inside ProductProject.
- A dynamic participant registry or general-purpose policy/workflow engine in v1.
- Treating a fixed legacy grace or backup duration as an architecture invariant.
