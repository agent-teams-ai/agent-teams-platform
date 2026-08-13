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
generation or revision commands. Guards, initial context, vocabulary, and every
modeled cross-axis effect are data in that JSON rather than parallel schema or
XState logic. A
state on one axis never implies progress on another.

The JSON's `witnessBounds` are deliberately small graph-exploration values, not
production policy. `policyBindings` maps the abstract attempt and generation
limits to `safeRetryPolicy.maxAttempts` and `maxPreparationGenerations`.
Property tests range across arbitrary positive bounds, including the default
four-generation fixture policy, and compare model guards with production
policy functions.

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
- integrity conflicts are non-resumable and authority-recheck exhaustion keeps
  the admitted receipt while remaining blocked without admission authority.

The checked-in Mermaid diagram under
`tooling/executable-specifications/fixtures/proof-artifacts` is a derived proof
artifact. The deterministic traces under
`tooling/executable-specifications/fixtures/conformance-witnesses` are curated,
human-owned conformance inputs; they are not generated artifacts. The model
gate compares the diagram byte-for-byte, proves every declared state and edge
is reachable, and verifies that every authoritative event appears, so dead
model declarations, transition drift, or freshness-fence drift fail the gate.

Foundation connects these artifacts through the consumer-owned executable
specification catalog. The catalog is data-only (`generatedTypes: []`) and
binds the three Foundation-required package gates: property histories, semantic
JSON mutation tests, and XState graph/model tests. A separate production
conformance suite records regression evidence against the domain aggregate.
Each suite is independently runnable, and passing one cannot stand in for
another. The mutation gate proves that its oracle rejects ready-without-
authority, retry-limit, premature reconciliation-clear, retained-receipt
authority, integrity-conflict, authority-exhaustion, vocabulary, and freshness
fence regressions.

The test harness lives in the development-only executable-specifications
workspace package. Its only access to domain trace fixtures is the private
`./testing/model-conformance` package subpath; no production surface imports
that subpath or any model-testing dependency.

The current private package and its composition/testing surfaces are a reference
implementation, not the reusable SaaS module or plugin system. Those physical
surfaces may change substantially after the independently designed open-source
module system is reviewed and adopted. The executable model protects the
Platform-owned behavioral invariants during such a migration; it does not make
the current package layout a compatibility contract.

## Evidence Limits

These checks prove consistency between the internal catalog and the current
in-process aggregate semantics for the modeled paths. They do not qualify a
database, outbox, transport, Orchestrator adapter, provider effect, crash
recovery implementation, or deployment profile. The JSON is not a public wire
schema, compatibility promise, or `contract.json-schema-releases` artifact.
That Foundation capability remains disabled until a separately accepted
consumer contract and release policy exist.
