---
id: architecture.platform-orchestrator-review.freshness-failure
type: architecture
status: proposed
owner: architecture/authority
summary: Proposed freshness, revocation, failure, last-mile, and reconciliation policies by operation class.
related:
  - architecture.platform-orchestrator-boundary
  - ADR-0003
  - ADR-0004
  - ADR-0005
---

# Decision Freshness and Failure Matrix

| Status | Operation | Decision source | Unavailable behavior | Last-mile and revocation behavior |
| --- | --- | --- | --- | --- |
| `PROPOSED` | Create Run | Authoritative decision or unexpired capability | Fail closed before acceptance | Store authority basis; local preconditions checked in Run UoW |
| `PROPOSED` | Reversible mutation | Bounded local projection by declared freshness class | Typed unavailable or bounded denial | Recheck local aggregate revision before commit |
| `PROPOSED` | Queued runtime dispatch | Fresh authority plus local Run state | No dispatch | Revalidate immediately before effect; exact last-mile semantics remain owned by open Orchestrator `OD-032` |
| `CONFIRMED` | Active runtime operation | AR technical authority | Cutoff request may become uncertain | Output fence, containment, then effect reconciliation |
| `CONFIRMED` | Feed subscription | Short-lived access token | Refuse or terminate stream | Typed disconnect; resume only from authorized cursor |
| `PROPOSED` | Ordinary query | Bounded projection | Do not reveal existence on uncertainty | No state mutation; projection reconciliation |
| `PROPOSED` | Scope administration | Authoritative decision with step-up when needed | Fail closed | Recheck authority and deletion/admission revisions at lifecycle CAS |
| `CONFIRMED` | Clear Project restriction | Exact source-owned restriction and expected revision | Preserve restriction | Clear only the matching identity and source revision; atomically advance admission revision |
| `CONFIRMED` | Irreversible Project retirement commit | Fresh ProductProject authority, policy/catalog plan, and exact request digest | Remain reversibly closed | Cancel or commit wins the ProductProject CAS; commit advances retirement epoch and outbox |
| `CONFIRMED` | Irreversible owner erase | Immutable plan plus fresh typed erase authorization | Retain and reconcile | Local action-claim CAS binds Project epoch, category, owner revision, policy decision, and validity |
| `CONFIRMED` | Verified subject authority revocation or expiry | Applicable versioned authority fact | Preserve prior effective state on uncertainty; do not invent revocation | Authority CAS advances generation and suspends; runtime enforcement and reconciliation remain separate |
| `CONFIRMED` | Publish Managed BYOC installation plan | Platform installation authority | Keep prior desired revision | Commit immutable plan, digest, predecessor, validity, and outbox atomically |
| `CONFIRMED` | Accept installation plan | Customer installation authority and local policy | Preserve prior accepted plan and writer authority | Validate signature, chain, expiry, compatibility, and expansion consent before atomic epoch/lease transition |
| `CONFIRMED` | Reconcile installation | Accepted unexpired plan plus active customer writer lease | Report typed degraded or action-required condition | Claim one operation by CAS; unknown local effect is reconciled before another attempt |
| `CONFIRMED` | Reduce installation authority | Platform denial, customer denial, or AR safety cutoff | Fail closed for affected capability | Monotonic admission closure or fencing; no layer waits for every other deny source |
| `CONFIRMED` | Expand installation authority | Platform plan plus explicit customer acceptance | Keep prior capability set | Dual consent and a successor accepted revision are mandatory |

## Linearization and idempotency

| Capability | Linearization point | Revision or fence | Idempotency horizon | Reconciliation owner |
| --- | --- | --- | --- | --- |
| Run admission | Run UoW commit | Authority revision plus local deletion/admission revision | Run tombstone horizon | Run Orchestration |
| Run authority suspension | Atomic Run authority CAS plus cutoff outbox | Exact basis, revocation applicability, and RunAuthorityGeneration N -> N+1 | Run replay horizon | Run process manager |
| Run reauthorization | Atomic Run authority CAS | Suspended generation N+1 -> successor generation N+2 | Run replay horizon | Run process manager |
| Run authority cutoff fan-out | Per-target cutoff-record commit in bounded batches | Revoked generation, target binding revision, and idempotency fingerprint | Runtime-binding and restore horizon | RunAuthorityCutoffProcess |
| Authority ingestion | Inbox and transport-checkpoint commit | Stream identity, source incarnation, and cursor | Stream replay horizon | Run authority ingestion capability |
| Semantic revocation fence | Partition fence CAS under Run Orchestration persistence authority | Ordered proof revision, typed freshness vector, or explicit invalidation predicate | Authority and restore horizon | Run authority ingestion capability |
| Cutoff fan-out scan | Bounded snapshot page and scan-checkpoint commit | Snapshot boundary, scan cursor, revoked generation | Enforcement and reconciliation horizon | RunAuthorityCutoffProcess |
| Runtime dispatch | Orchestrator claim, then independent AR dispatch CAS | Run generation, binding generation, AR private fence | Effect retry and restore horizon | Orchestrator and AR independently |
| Approval resolution | Approval aggregate commit, then AR permission acceptance | Request revision, authority revision, expiry | Decision conflict horizon | Approval Management and AR |
| Scope administration | Scope lifecycle CAS | Authority revision, binding generation, deletion epoch | Resurrection-prevention horizon | Orchestration Scope |
| Project retirement | ProductProject terminal CAS | Lifecycle revision and retirement epoch | Maximum retry, callback, restore, and PITR horizon | ProductProjectRetirementProcess |
| Owner Project freeze | Owner-local freeze CAS | External retirement epoch and local revision | Owner data and restore horizon | Each data owner |
| Platform installation plan | PlatformInstallation UoW commit | Desired revision, plan digest, predecessor, validity | Plan-chain and installation-retention horizon | Platform Deployment Management |
| Customer plan acceptance | InstallationEnrollment transaction | Accepted plan head, authority epoch, predecessor writer lease | Installation restore and audit horizon | Customer Installation Control Plane |
| Installation operation | Operation claim before local effect and atomic generation publication | Accepted plan, authority epoch, writer lease, operation fingerprint | Artifact, rollback, and restore horizon | Customer Installation Control Plane |

## Revocation invariants

- Tenant-autonomous authority is not revoked by one principal's disablement.
- Subject-bound revocation suspends Run authority, blocks new actions and queued
  dispatch, and requests cutoff and containment for active operations without
  claiming synchronous enforcement.
- Refreshing short-lived evidence for the same semantic basis and authority
  revision does not advance `RunAuthorityGeneration`.
- Verified suspension and explicit reauthorization each advance
  `RunAuthorityGeneration`; unavailable or stale authority does neither.
- Reauthorization does not by itself reopen dispatch. A derived dispatch gate
  checks unresolved per-target enforcement and reconciliation receipts plus AR
  fencing for previous generations.
- Transport ingestion checkpoint, semantic revocation fence, and bounded fan-out
  scan checkpoint are distinct. A gap in the authority stream fails closed for
  SubjectBound admission and risky dispatch.
- Client credential revocation terminates client access but does not revoke the
  subject's authority automatically.
- `CLIENT_BOUND` sponsorship loss is evaluated independently.
- Any active ProductProject admission restriction and terminal retirement block
  new mutations and dispatch regardless of authority basis.
- `SUSPENDED` is a derived access label. Mutation authority comes from the
  current revisioned gate over exact restrictions; removing one cause never
  clears another.
- A policy snapshot cannot authorize a later irreversible erase by itself. A
  newly applied or unknown hold wins the last-mile erase authorization check.
- Unknown provider acceptance never permits blind retry.
- Operation cutoff is monotonic. Reauthorization may admit a new AR operation
  only after predecessor barriers allow it; it never reopens the cut operation.
- Runtime enforcement tracks admission, canonical-output fencing, provider
  containment, and effect reconciliation independently. A single scalar cannot
  claim all four have completed.
- An Orchestrator binding generation may be included in AR evidence for exact
  correlation, but AR stale-command decisions rely on AR-owned identities,
  revisions, deployment incarnation, and authority generation.
- UI or CLI disconnect does not cancel a durable installation operation. An
  explicit cancellation command races with operation claim through one CAS and
  returns a receipt.
- Installation cancellation, rollback, retry, reconciliation, and retirement
  are different intents. None is inferred from transport failure.
- Customer-side readiness is a projection over named conditions, never a single
  process-alive bit. Partial readiness and unknown outcome remain visible.
- Accepted plan expiry blocks authority expansion but does not silently stop a
  Run already governed by an Orchestrator authority snapshot and AR execution
  lease. Those owners apply their own cutoff policies.
