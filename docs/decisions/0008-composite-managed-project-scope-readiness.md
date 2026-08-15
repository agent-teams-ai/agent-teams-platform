---
id: ADR-0008
type: adr
status: accepted
owner: project-management
summary: Keep ProductProject creation asynchronous and require composite Orchestrator scope readiness before Platform admission opens.
approved_by: product-owner
accepted_at: 2026-08-13
supersedes: []
superseded_by: []
related:
  - ADR-0007
  - architecture.platform-orchestrator-boundary
  - domain.contexts.project-management
---

# ADR-0008: Composite Managed Project Scope Readiness

## Context

ADR-0007 accepts ProductProject before its remote orchestration dependencies are
ready. The Project remains visible and recoverable while a durable Platform
process prepares its managed Orchestration scope. The exact receiving API is not
yet part of the Orchestrator Published Language.

Platform must not mistake an intermediate Orchestrator binding receipt for
complete readiness. It must also preserve its own process and command identity
without redefining the Orchestrator request identity or canonical fingerprint.

## Decision

### Product behavior

`CreateProductProject` durably accepts the ProductProject and returns its stable
identity plus a preparation Operation reference after the Platform-owned
transaction defined by ADR-0007.

The Project is immediately visible as `PREPARING`, but Run admission, Work,
agent execution, and other authority-bearing orchestration mutations remain
closed. The Project becomes `READY` only after current Platform authority and a
terminal composite Orchestrator scope-readiness receipt are both accepted.

A permanent failure or exhausted recovery budget leaves the ProductProject
`OPEN`, denied, and visibly `BLOCKED`. The user can invoke an explicitly allowed
recovery action or retire the Project. Failure never silently deletes the
ProductProject or reports readiness.

### Composite capability boundary

Platform consumes one capability-level managed Project scope operation. The
Orchestrator may implement it through several owner-local steps, including:

```text
resolve or create Orchestration scope identity
-> establish the required authority binding
-> open local Orchestration scope admission
-> produce terminal scope-readiness evidence
```

These are not Platform-owned subcommands and do not form a distributed
transaction with Platform. The Orchestrator owns their state, ordering,
reconciliation, and receipts. A binding receipt, process-liveness observation,
or scope identity alone is insufficient. The terminal capability result must
prove the exact Orchestrator-defined readiness condition for the requested
Project incarnation.

The current Platform-local receipt kind `admitted` is a tactical normalized
outcome. It may mean `READY` only when the future ACL has validated terminal
composite scope-readiness evidence. Its name and representation are not an
Orchestrator wire contract.

### Separate command identities

Project Management owns its durable process-step identity and canonical
Platform intent digest. They protect owner-local replay, successor generations,
and integrity.

The Orchestrator owns its request ID, command descriptor, canonicalization
version, semantic fingerprint, Operation identity, and outcome-resolution
semantics. A stateless Managed Lifecycle ACL translates representations and
validates provider receipts. Any durable opaque provider command reference or
original request envelope needed for recovery is persisted by Project
Management with its process or outbox, not by the ACL.

The two identities may use the same underlying bytes only as an adapter-local
mapping choice. They remain different semantic types, and Platform domain or
application code cannot import the Orchestrator contract type.

Exact request mapping, payload, receipt taxonomy, readiness evidence, replay
query, compatibility window, and conformance fixtures remain gated on the
Orchestrator Published Language.

## Consequences

- The user can see and recover a partially prepared Project without receiving
  premature execution authority.
- Platform consumes a stable business capability instead of orchestrating the
  Orchestrator's internal aggregate transitions.
- Existing Platform executable specifications remain valid evidence for its
  owner-local process semantics, but do not freeze the external receipt or wire
  vocabulary.
- The Managed Lifecycle ACL and production transport adapter cannot be
  implemented until the Orchestrator publishes the exact capability contract.
- This decision approves product and boundary semantics only. It is not
  implementation approval for production code, schemas, adapters, migrations,
  or new executable behavior.

## Rejected Alternatives

- Treat a scope identity or authority-binding receipt as complete readiness.
- Make Platform issue separate Orchestrator create, bind, and admit subcommands.
- Reuse one shared domain command type or canonical digest across repositories.
- Delete ProductProject automatically when asynchronous preparation fails.
