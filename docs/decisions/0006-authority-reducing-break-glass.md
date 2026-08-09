---
id: ADR-0006
type: adr
status: proposed
owner: security/operations
summary: Limit break-glass to owner-local authority reduction and keep recovery, reconciliation, containment retries, and successor attempts in their normal use cases.
related:
  - ADR-0003
  - ADR-0004
  - architecture.platform-orchestrator-boundary
---

# ADR-0006: Authority-Reducing Break-Glass

## Context

ADR-0004 correctly forbids break-glass from removing holds, rewriting evidence,
reopening retired identities, or claiming disposition completion. Its data-custody
summary also says that break-glass may retry or reconcile. That wording gives an
emergency operator path two unrelated responsibilities:

- urgently reduce authority when normal control paths are unavailable; and
- recover ordinary owner-local processes after timeouts, partial enforcement, or
  lost acknowledgement.

Combining them creates an authority-escalation risk. A generic emergency command
could become a second workflow engine, bypass ordinary admission and idempotency,
or make a successor attempt before the predecessor is safely fenced. Query,
exact replay, reconciliation, containment retry, and successor admission already
have different invariants and consistency boundaries.

## Decision

### Break-glass only reduces authority

Break-glass is a narrowly authorized owner-local use case for installing or
strengthening a restriction, revocation, fence, stop, or quarantine. It cannot:

- grant, restore, or widen authority;
- clear a restriction, hold, fence, revocation, or quarantine;
- reopen ordinary admission or a retired identity;
- dispatch workload, repeat a semantic effect, or create a successor attempt;
- erase data, rewrite evidence, or declare containment, reconciliation, or
  disposition complete;
- mutate another bounded context's aggregate or private fence.

An emergency operator session expiring never restores authority automatically.
Restoration is a separate normal owner use case with its own authorization,
preconditions, audit evidence, and compare-and-swap.

Each owner exposes only the reductions it can enforce atomically with its own
state. A cross-system emergency action is coordinated as independently receipted
owner-local reductions through ordinary ports. Platform does not define another
owner's command names, wire schema, aggregate state, or private fencing token.

### The reduction has an explicit linearization point

An owner-local break-glass request binds at least:

- a unique command identity and canonical request digest;
- the exact tenant, project, resource, and lifecycle scope being reduced;
- the requested closed reduction kind and narrow capability scope;
- expected owner revision, epoch, generation, or incarnation where applicable;
- operator authority evidence, reason, validity, and audit correlation;
- any predecessor restriction or receipt reference required by that owner.

The owner compare-and-swaps the expected authority state and durably records the
new reduction, receipt, audit reference, and outbox fact in one local
transaction. The successful CAS is the authority linearization point. A stale
request fails closed; break-glass does not mean `force latest`.

The same command identity and digest returns the original receipt. Reusing an
identity with different content is a hard conflict. Acceptance proves only that
the owner-local authority reduction committed. It does not by itself prove that
an external process stopped, an unknown effect was resolved, or all participants
converged.

### Recovery capabilities remain separate

The following capabilities are not break-glass and do not inherit emergency
operator authority:

| Capability | Owner-local purpose | Required boundary |
| --- | --- | --- |
| Query receipt or state | Observe the original durable result | Read model or authoritative receipt port; no mutation authority |
| Exact command replay | Recover a lost acknowledgement | Same command identity and digest; returns the original receipt |
| Reconciliation | Compare desired, observed, and receipted state and schedule typed repair | Dedicated owner-local process; uncertainty stays explicit |
| Containment retry | Re-attempt enforcement of an already committed cutoff, fence, stop, or quarantine | Original reduction/cutoff basis, a fresh attempt identity, bounded retry policy, and attempt receipt |
| Successor attempt | Start new authorized work after a predecessor | Normal admission, proved predecessor barriers, an owner-supplied effect identity, and a fresh attempt identity |

A containment retry may reinforce an existing reduction but cannot dispatch new
work, change the intended effect, or turn an unknown result into success. An
unreachable provider, exhausted retry policy, ambiguous external acceptance, or
missing evidence remains uncertain and enters reconciliation.

A successor attempt is never an emergency retry. It must satisfy the normal
admission policy and the owning runtime or orchestration predecessor barrier.
Technical fencing and canonical-output fencing must be proved where required.
Business-effect identity and equivalence remain with the feature that owns that
effect. A successor attempt for the same effect retains that effect identity;
Platform does not mint a replacement or infer equivalence from provider output.

### Observability does not collapse independent outcomes

Read projections may summarize an emergency operation, but authoritative
records keep separate facts for:

- owner-local authority reduction;
- downstream admission fencing;
- canonical-output fencing;
- provider or process containment;
- effect reconciliation; and
- disposition progress.

`accepted`, `partially enforced`, `uncertain`, and `reconcile required` are not
aliases for completion. A coordinator composes owner receipts without upgrading
their meaning. Policy may require stricter containment, but it cannot declare a
technically required containment action unnecessary.

## Consequences

- The emergency path stays small, monotonic, auditable, and fail-closed.
- Ordinary recovery remains testable through the same application ports used
  outside an incident instead of through a privileged parallel workflow.
- Each bounded context keeps its mutation authority and private fencing model.
- Lost acknowledgement does not justify issuing a replacement command.
- Operator tooling needs distinct controls and permissions for reduction,
  receipt query, reconciliation, containment retry, and normal restoration.
- Exact Published Language and wire names remain open until their owning
  contracts and conformance fixtures are reviewed.

## Supersession scope

If accepted, this ADR supersedes only ADR-0004 wording that permits break-glass
itself to retry or reconcile. ADR-0004's retirement, disposition, evidence, and
data-custody decisions otherwise remain unchanged.

## Acceptance gates

Before acceptance, architecture fixtures must prove at least:

1. stale break-glass cannot bypass an owner revision or generation fence;
2. exact replay returns one receipt and conflicting replay fails;
3. accepted authority reduction does not imply provider containment;
4. containment retry remains bound to the original reduction and cannot admit
   new work;
5. successor admission fails while a required predecessor barrier is missing;
6. reconciliation cannot clear uncertainty without typed owner evidence;
7. emergency credential expiry cannot restore authority; and
8. no break-glass request can remove a hold, reopen admission, erase data, or
   mutate another owner's aggregate.

## Rejected alternatives

- A generic operator command that can force any transition.
- Reusing break-glass as a retry or reconciliation workflow.
- Treating emergency acceptance as end-to-end containment or disposition proof.
- Restoring authority automatically when emergency access expires.
- Sharing one cross-system fence, transaction, or domain package.
