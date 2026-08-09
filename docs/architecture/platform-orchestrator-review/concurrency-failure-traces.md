---
id: architecture.platform-orchestrator-review.concurrency-failure-traces
type: architecture
status: proposed
owner: architecture/integration
summary: Exact commit-order and recovery traces for managed scope admission, Run dispatch, cutoff, and reconciliation.
related:
  - architecture.platform-orchestrator-boundary
  - architecture.platform-orchestrator-review.resource-bindings
  - architecture.platform-orchestrator-review.freshness-failure
  - architecture.platform-orchestrator-review.project-provisioning
  - architecture.platform-orchestrator-review.contract-conformance
  - ADR-0004
  - ADR-0007
---

# Platform-Orchestrator-AR Concurrency and Failure Traces

These traces instantiate the proposed managed scope-admission process without
freezing a public API. Platform ADR-0004 confirms ProductProject lifecycle and
admission semantics. Orchestrator ADR-0079 and ADR-0080 confirm Orchestration
Scope ownership, binding generations, owner-local admission, receipts, and
reconciliation. Exact Platform process aggregates, Orchestrator methods, wire
schemas, status names, and retention durations remain proposed or open.

## Shared trace model

The names below describe distinct semantic identities, not accepted DTO fields:

```text
customerCreateCommandId
managedScopeAdmissionProcessId
processGeneration
stepCommandId + canonicalStepDigest
canonicalCommandScope + commandDescriptor + requestId
canonicalizationVersion + semanticFingerprint
ownerLocalReceiptRef
ProductProjectId + productProjectIncarnation
AuthorityBindingSlot.PRIMARY
expected owner-local revisions and generations
```

The following invariants apply to every trace:

1. Platform and Orchestrator commit independently. No distributed transaction or
   rollback spans them.
2. A state-changing step records its intent and outbox before an external call.
3. An accepted state-changing command atomically commits its owner-local
   mutation, command disposition, durable receipt, and owner outbox. A rejected
   command atomically retains its typed rejection receipt and disposition
   without the requested mutation or integration outbox.
4. A command is addressed by its complete owner-defined idempotency scope. For
   Orchestrator durable public commands this is `CanonicalCommandScope +
   CommandDescriptor + requestId`, plus canonicalization version and semantic
   fingerprint. The same scoped identity and fingerprint replays its original
   receipt; a conflict has no requested domain side effect. Request ID alone is
   never a lookup key.
5. Unknown outcome is resolved by exact query or replay. A replacement create,
   scope, binding, or activation command is forbidden.
6. Binding existence does not open scope admission. Opening admission is a
   separate Orchestration Scope CAS after current binding verification.
7. `READY` is a Platform projection for one process generation. Its owner-local
   CAS checks current Platform incarnation, lifecycle, admission revision,
   process generation, and the complete latest receipt set, including observed
   remote generations. It cannot atomically assert current Orchestrator state,
   runtime capacity, admission, or execution authority. Every later operation
   checks each current owner independently.
8. Delayed evidence can be retained for audit and reconciliation but cannot
   mutate a successor generation or clear an independent restriction.

## CF-01 Lost downstream response

### CF-01 preconditions

- ProductProject exists and its Platform admission gate is closed.
- The process has one current step with a stable command identity, canonical
  digest, expected ProductProject incarnation, binding slot, and owner-local
  preconditions.
- No receipt has yet been applied to the step.

### CF-01 commit order

| Order | Owner | Durable action |
| --- | --- | --- |
| 1 | Platform process | CAS the step to dispatchable and append its outbox record in one transaction |
| 2 | Dispatcher | Deliver the exact command and digest; no state authority is held by the transport |
| 3 | Orchestration Scope | Validate command identity, digest, trusted scope, lifecycle, admission, binding, and expected revisions |
| 4 | Orchestration Scope | **Linearization point:** atomically commit the owner mutation, command disposition, durable receipt, and outbox |
| 5 | Transport | Lose the response after the Orchestrator commit |
| 6 | Platform process | Keep the step outcome unknown; do not create a replacement command or infer failure |
| 7 | Reconciler | Query the original command/receipt identity or replay the same identity and digest |
| 8 | Platform process | Apply the recovered receipt only if process generation, step command, digest, Project incarnation, and expected step revision still match |

### Crash windows

| Window | Recovery |
| --- | --- |
| Before the Orchestrator commit | Replay the same command. No receiver mutation exists |
| After the Orchestrator commit and before response | Query or exact replay returns the durable receipt |
| After response delivery and before Platform receipt commit | Query or exact replay; applying the receipt is idempotent |
| After a successor Platform generation exists | Retain the old receipt as evidence; it cannot activate or mark the successor ready |

A receiver `not_found` is not terminal absence while the original producer
outbox can still deliver the command. Terminal absence requires an owner-defined
authoritative negative receipt that covers the original command identity and
restore horizon; that exact protocol remains `OPEN`.

### CF-01 conformance evidence

- fault injection at every crash window;
- response loss before and after receiver commit;
- restart of both participants before recovery;
- exact replay and receipt query returning one stable result;
- delayed receipt against a successor process generation;
- proof that no replacement OrchestrationProject or binding is created.

## CF-02 Duplicate command

### CF-02 preconditions

Two callers or dispatchers concurrently submit the same command identity. The
receiver's idempotency namespace includes trusted tenant/resource identity,
source incarnation, canonical command scope, command descriptor, request ID,
canonicalization version, and semantic fingerprint. The server-generated
Operation identity remains separate.

### CF-02 commit order

1. Both requests reach the same owner-local command authority.
2. The receiver serializes command-ledger admission and the requested mutation
   in one transaction.
3. For the same identity and digest, exactly one transaction creates or changes
   owner state. The loser reads or waits for the canonical receipt.
4. For the same identity with another digest, the receiver records or returns a
   typed conflict without the requested mutation or integration outbox.
5. Platform applies the canonical receipt once through its step revision CAS.

The same rule applies separately to the customer ProductProject create command
and every downstream scope-admission step. For an exact create-command replay,
either no ProductProject commit exists or one fail-closed ProductProject exists
with durable owner-local recovery intent. Each bounded context atomically commits
only its own state, receipt, and outbox. Exact aggregate placement remains
tactical. The accepted first-slice linearization point places ProductProject,
initial denied admission authority, customer receipt, managed-process intent,
and outbox in one Project Management transaction. Platform ADR-0007 accepts
this owner-local transaction without accepting a downstream wire contract.

Different command identities with the same business payload are not implicitly
equivalent. Whether a separate business fingerprint deduplicates distinct create
identities remains `OPEN`; retries must preserve the original identity.

### CF-02 conformance evidence

- concurrent exact duplicates before and after commit;
- same identity with conflicting digest;
- duplicate inbox and outbox delivery after restart and restore;
- stale duplicate receipt after successor process generation;
- wrong-tenant and wrong-incarnation substitution without an existence oracle;
- exactly one ProductProject, process, OrchestrationProject, binding mutation,
  and owner receipt for the exact command identity.

## CF-03 Stale revision or generation

### CF-03 preconditions

The command binds the Platform ProductProject identity/incarnation and the
expected Platform evidence relevant to the step. It also carries only the
published Orchestrator preconditions needed by the receiving use case.
Platform evidence never asserts an Orchestrator deletion epoch, aggregate
revision, or binding generation as Platform-owned truth.

### CF-03 commit order

1. Platform durably dispatches a command using an observed precondition set.
2. Before delivery, Orchestration Scope advances its lifecycle, admission
   revision, source incarnation, binding generation, or another applicable
   owner-local precondition.
3. The receiver transaction compares current owner state.
4. **Linearization point:** the receiver durably commits a typed `stale`
   rejection receipt for that exact scoped command and fingerprint. The
   requested domain mutation and its integration outbox do not occur. Exact
   replay returns that retained rejection even if owner state later changes.
5. Platform records the stale attempt receipt without changing readiness.
6. Reconciliation obtains a current owner snapshot or receipt, re-evaluates the
   original product intent and current ProductProject gate, and either stops or
   creates a successor step attempt.

A changed digest or precondition set uses a successor step command identity. The
old command identity cannot be reused with altered content. Revisions belonging
to different owners or source incarnations are opaque and incomparable; no
cross-system numeric maximum is computed.

### Stale-event behavior

- a generation N success cannot activate binding generation N+1;
- a stale success receipt may update a reconciliation observation, never the
  current desired state or `READY` projection;
- a stale or gapped authority source fails closed for admission-changing work;
- no retry occurs until the current snapshot and product intent are evaluated.

### CF-03 conformance evidence

- stale lifecycle, admission, deletion, binding, source-incarnation, and
  deployment-incarnation cases;
- delayed success and delayed stale receipts in both orders;
- conflicting revision dimensions proving no numeric cross-owner comparison;
- no receiver side effect or outbox for a failed mutation CAS;
- successor attempt uses a new identity while the predecessor remains replayable.

## CF-04 Suspension during scope binding and admission

Two owner-local linearization points exist:

```text
Platform suspension LP
  exact restriction mutation
  + effective gate CAS
  + admission revision advance
  + receipt and outbox commit

Orchestrator scope-admission LP
  current OrchestrationProject lifecycle and restriction check
  + binding generation and expected evidence check
  + admission-opening or admission-closing CAS
  + receipt and outbox commit
```

There is no global ordering transaction. The supported commit orders are:

### Suspension is observed before admission opening

1. Platform commits the restriction and suspension outbox.
2. Orchestrator ingests the exact restriction/evidence before opening admission.
3. An opening command carrying predecessor authority loses the owner-local CAS
   with `stale` or `denied` semantics.
4. A created scope or binding may remain as inactive reconciliation state; it is
   not deleted or activated implicitly.

### Admission opening commits before suspension is observed

1. Orchestrator commits admission opening under the then-current evidence.
2. Platform commits suspension and remains authoritative for denying new managed
   product actions.
3. The durable suspension command eventually closes Orchestrator admission by a
   successor CAS. Work accepted before closure is not represented as rolled back;
   each owning lifecycle applies its cutoff or reconciliation semantics.
4. A delayed binding or opening receipt cannot mark Platform `READY` because the
   final readiness CAS sees the newer Platform admission revision or restriction.

### Platform suspension commits while delivery is partitioned

Platform immediately fails closed for its own operations and preserves the
suspension outbox. Orchestrator cannot claim knowledge it has not received.
Configured authority freshness and high-risk last-mile policy bound the remote
exposure; exact propagation SLO and freshness duration remain `OPEN`. Once the
suspension is observed, closure is monotonic and recovery queries the original
receipt.

Clearing the Platform restriction never reopens Orchestrator admission
automatically. A fresh verification step and explicit successor admission CAS
are required; clearing one source cannot clear another active restriction.

### CF-04 conformance evidence

- every order of Platform suspension, binding commit, verification, and
  Orchestrator admission-opening CAS;
- lost and duplicate suspension delivery;
- partition followed by snapshot/feed reconciliation;
- delayed binding/opening success after Platform admission revision advances;
- clear racing suspension and independent restriction sources;
- proof that stale evidence never produces `READY` or silently reopens admission.

## CF-05 Partial failure and reconciliation

### CF-05 preconditions and durable model

The process stores an immutable request digest and a bounded set of step
obligations. Each obligation has its own command identity, digest, expected
preconditions, dispatch state, outcome classification, and opaque receipt
reference. A single global error scalar is not canonical truth.

### CF-05 trace

1. Platform commits ProductProject in a fail-closed state plus owner-local
   durable recovery intent before any downstream call. Exact aggregate and
   process transaction boundaries remain `OPEN`.
2. Placement resolution succeeds and its receipt is committed.
3. Orchestration scope creation or binding commits remotely, but a later binding,
   verification, or admission-opening step fails or becomes unknown.
4. Platform retains ProductProject and every proven receipt. It does not execute
   a distributed rollback or infer that remote resources were absent.
5. Admission remains closed. The process records the exact failed/unknown
   obligation and enters reconciliation.
6. For an unknown outcome, reconciliation queries or exactly replays the
   original command. For a proven non-acceptance retry, it reuses the original
   identity only when the producer contract allows it.
7. A stale or conflicting attempt triggers fresh intent evaluation and, when
   still eligible, a successor command identity. A permanent incompatibility or
   policy denial records a typed operational block without retiring the Project.
8. If forward repair is no longer allowed, an explicit separately authorized
   retirement or disposition process handles the retained resources. The setup
   process never disguises compensation as rollback.
9. The Platform `READY` projection CAS succeeds only from current Platform-owned
   state and complete receipts for the current process generation. It stores the
   observed binding/admission evidence but does not claim the remote gate remains
   open after observation. Subsequent use checks Platform and Orchestrator gates
   independently; remote change eventually marks the projection stale.

`RECONCILE_REQUIRED` is non-terminal. `BLOCKED` means automatic progress is not
currently possible; it is not ProductProject retirement or proof of cleanup.
The accepted Platform v1 semantics make cancellation generation-scoped: it stops new step
claims, reconciles ambiguous outcomes, preserves the `OPEN` fail-closed Project,
and yields `BLOCKED(reason=USER_CANCELLED)`. Resume creates a successor process
generation after fresh precondition evaluation. Platform ADR-0007 accepts these
product semantics; exact state names and external commands remain proposed.

### CF-05 conformance evidence

- fault injection before and after every Platform and Orchestrator commit;
- Platform commit while Orchestrator is unavailable;
- every partial-success combination across placement, scope creation, binding,
  verification, and admission opening;
- restart with duplicate and out-of-order receipts;
- stale events from a predecessor process or binding generation;
- remote suspension after the last observed receipt but before Platform projection
  commit, proving the projection cannot authorize later work;
- convergence by forward repair and explicit retirement/disposition fallback;
- no readiness while an obligation is missing, unknown, stale, or blocked.

## RT-01 Runtime target dispatch and cutoff race

### RT-01 shared preconditions

Before any AR call, Run Orchestration has a local target-intent identity, the
original AR command identity and canonical digest, exact Run authority and
binding generations, exact scope-admission evidence, semantic-owner effect
reference, and target revision.

### RT-01 target insertion wins first

1. The Run dispatch-admission transaction compares the semantic revocation
   fence, Run authority gate, binding generation, exact scope-admission evidence,
   and target revision.
2. Through that gate it allocates a target sequence and atomically records the
   inventory entry, original AR command identity/digest, dispatch state, receipt,
   and outbox.
3. Suspension later uses the same gate to close admission, advance
   `RunAuthorityGeneration`, capture the target-sequence high-water mark, and
   record one bounded cutoff trigger plus outbox.
4. The cutoff process scans through that mark. If the AR target ref is absent, it
   uses a non-mutating outcome query for the original scoped command identity; it
   never skips the target and never replays the original operation after
   suspension.
5. If AR accepted but the response was lost, the queried durable receipt supplies
   the opaque target ref and target-specific cutoff proceeds. If acceptance is
   absent or unresolved, cutoff first installs the durable negative
   operation-intent guard. Only that guard or an accepted-operation fence can
   close the obligation.

### RT-01 suspension wins first

1. Suspension closes the shared Run authority gate and captures its high-water
   mark before the target insertion CAS.
2. A new local target cannot commit under the revoked generation.
3. For a target already inside the captured inventory whose original AR command
   is delayed, cutoff submits the AR negative operation-intent guard bound to the
   original command identity, expected digest, runtime scope, deployment
   incarnation, and applicable authority preconditions.
4. If the guard wins before AR acceptance, a delayed original command is
   rejected before RuntimeOperation creation or provider effect. If acceptance
   or dispatch claim won first, AR returns the corresponding accepted-operation
   fence or monotonic cutoff outcome and reconciliation proceeds.
5. A scoped `not_found` without the durable negative-guard receipt is never
   terminal cutoff evidence.

### RT-01 conformance evidence

- target insertion and suspension in every commit order through one gate;
- crash after target commit before AR send and after AR accept before receipt;
- cutoff scan while the opaque AR target ref is missing;
- negative guard before original acceptance, after acceptance, and after
  dispatch claim;
- delayed and restored original outbox delivery against the retained guard;
- no provider call when the negative guard wins;
- no missed target above or below the captured sequence high-water mark.

## RT-02 Scope suspension and queued dispatch race

The exact Orchestration Scope evidence stored on a Run target binds:

```text
RuntimeScopeBinding identity and generation
scopeAdmissionRevision
deployment audience and incarnation
AR scope revision
evidence revision
validity deadline
```

### RT-02 suspension wins before evidence issuance or recheck

1. Orchestration Scope serializes admission suspension against evidence issuance.
2. A request for successor evidence fails closed or returns typed stale evidence.
3. If target intent was already committed, the dispatcher recheck blocks
   transmission and leaves durable reconciliation/cutoff work; it does not delete
   the target or infer that AR never observed the command.

### RT-02 dispatch admission wins before scope suspension

1. Run Orchestration commits target intent under then-current exact evidence.
2. Orchestration Scope then suspends and advances its admission revision.
3. Dispatcher recheck blocks an unsent command when it observes the successor
   revision. If transmission already crossed the boundary, the command is an
   admitted predecessor rather than a rolled-back mutation.
4. AR independently serializes delayed dispatch against its own runtime-scope
   admission fence and technical authority. Orchestrator evidence is opaque
   correlation to AR, not an AR fence.
5. Suspension/cutoff receipt recovery resolves unknown delivery; blind retry and
   replacement command identity remain forbidden.

### RT-02 recheck succeeds before suspension, send follows suspension

1. The dispatcher presents the exact stored evidence vector, including its
   evidence revision, to the Orchestration Scope port. Validation serializes
   against scope suspension and succeeds while that revision is still current.
   This successful owner-local validation is the last local dispatch-admission
   linearization point; it is not a distributed lease over the later network
   send.
2. Orchestration Scope then commits suspension and advances
   `scopeAdmissionRevision` before the dispatcher sends the already admitted
   predecessor command.
3. The dispatcher may still avoid transmission when it observes the new local
   fact before sending, but it cannot claim that the earlier admission was
   rolled back. A send or an unknown send outcome keeps the original command
   identity and enters cutoff/reconciliation.
4. AR independently serializes that delayed command against its runtime-scope
   admission fence and technical authority. If AR suspension wins, AR rejects or
   negatively guards the original operation intent. If AR dispatch claim won,
   monotonic cutoff, output fencing, containment, and reconciliation follow.
5. No Platform or Orchestrator receipt may assert technical prevention until the
   exact AR rejection, negative-guard, cutoff, or reconciliation receipt proves
   it.

### RT-02 conformance evidence

- scope-evidence issuance racing suspension in both orders;
- target commit, suspension, dispatcher recheck, network send, and AR dispatch
  claim in every meaningful commit order;
- successful recheck followed by suspension before network send, with both AR
  fence-before-dispatch and AR-dispatch-before-fence outcomes;
- expired, stale, gapped, and wrong-incarnation evidence;
- proof that a stale evidence vector cannot authorize transmission;
- proof that an admitted predecessor is fenced by AR rather than declared
  rolled back by Orchestrator.

## Remaining open decisions

- exact Project Management aggregate split after the proposed atomic
  fail-closed initialization;
- exact Project restriction representation after initial denied authority;
- managed Orchestrator command, query, receipt, and authoritative-negative
  schemas;
- terminal customer semantics for cancellation, abandonment, and `BLOCKED`;
- idempotency, receipt, tombstone, retry, and PITR retention horizons;
- authority freshness duration and suspension propagation SLO;
- exact readiness vector and whether runtime capacity participates in a separate
  product readiness view;
- cross-system recovery when Platform and Orchestrator restore to different
  timestamps;
- AR scope activation and technical-grant contracts, which do not block the
  ProductProject and Orchestration Scope traces above.
