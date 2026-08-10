---
id: architecture.managed-scope-admission-executable-model
type: architecture
status: active
owner: project-management
summary: Define the internal executable model and its authority limits.
---

# Managed Scope-Admission Executable Model

The canonical executable specification is the repository-internal
`architecture/project-management/managed-scope-admission-process.json`. Its
strict JSON Schema sits beside it and the architecture gate validates both
shape and transition references with Ajv in strict mode.

The specification describes four separate axes: process lifecycle, authority,
reconciliation, and generation fencing. Transitions cover lost acknowledgement,
known non-acceptance and bounded retry, cancellation during an uncertain
outcome, receipt kinds, authority rechecks, successor generations, and stale
generation or revision commands. Guards, initial context, and every modeled
cross-axis effect are data in that JSON rather than parallel XState logic. A
state on one axis never implies progress on another.

## Authority

The persisted `ManagedScopeAdmissionProcess` domain aggregate remains the only
canonical process state. Existing public functions remain the production
transition authority. XState is a development-only conformance adapter: its
machine is derived from the internal JSON transition catalog, executes the
cross-axis model, and compares critical traces with those domain functions.
XState snapshots are temporary test data and must never be persisted, replayed
as domain truth, or exposed through a public API.

`fast-check` explores arbitrary bounded event histories. `@xstate/graph`
derives deterministic shortest paths from the same machine. The checks assert
cross-axis invariants, including:

- ambiguous dispatch stays in reconciliation until original-command evidence
  resolves it;
- retry cannot exceed its bounded attempt model;
- cancellation of an ambiguous dispatch reconciles before completion;
- a successor generation cannot be mutated by stale generation or revision
  commands;
- ready requires an admitted receipt and current admission-authority evidence.
  The original dispatch-authority basis is retained on the direct path, but a
  safe retained-receipt resume clears it and re-authorizes the admitted receipt
  without redispatch; both paths are parity-tested against the aggregate.

## Evidence Limits

These checks prove consistency between the internal catalog and the current
in-process aggregate semantics for the modeled paths. They do not qualify a
database, outbox, transport, Orchestrator adapter, provider effect, crash
recovery implementation, or deployment profile. The JSON is not a public wire
schema, compatibility promise, or `contract.json-schema-releases` artifact.
That Foundation capability remains disabled until a separately accepted
consumer contract and release policy exist.
