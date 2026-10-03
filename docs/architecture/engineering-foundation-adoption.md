---
id: architecture.engineering-foundation-adoption
type: architecture
status: active
owner: architecture
summary: Define exact-version and capability-by-capability Engineering Foundation adoption for Platform.
---

# Engineering Foundation Adoption

Platform consumes `@agent-teams/engineering-foundation` only as an exact root
`devDependency`. Foundation supplies generic engineering mechanisms; Platform
continues to own deployment profiles, bounded contexts, dependency rules,
security classifications, workflow inventory, exceptions, ADRs, and fixtures.
Production code cannot import Foundation.

## Version policy

The manifest and lockfile pin one reviewed registry version. Dependabot is
security-only; ordinary Foundation releases are reviewed and advanced through
manually coordinated, isolated exact-version changes. A version upgrade never
enables a capability implicitly. `latest`, ranges, Git refs, local links,
tarballs, lockfile overrides, and unpublished release branches are forbidden in
committed or CI state.

Foundation-owned capability configuration uses the current contract for that
capability. Source dependencies use schema v3 with `rootPackage: true` and
`packageRoots` for every workspace package. Other Foundation-owned contracts
remain on their current versions until a coordinated consumer update. A
parallel Foundation-owned replacement schema requires a new accepted Foundation
ADR proving a real non-atomic migration boundary. External formats retain their
upstream versions.

## Foundation 1.7.2 migration

The exact root development pin and regenerated frozen registry lock select
Foundation 1.7.2 after official stable31 migration. Installed Docs qualification
passed 7/7; changed/fast and the full local repository gate passed. Final GitHub
CI and ordinary observed admission remain pending. Repository tooling
uses Node 24.21.0 from `.node-version` and pnpm 11.18.0; required-test execution
needs Node >=24.21.0 <25. The architecture workflow consumes that tooling pin.
Product deployment qualifications and the Node 24 production family retain their
existing authority and evidence.

The shared nested `NODE_TEST_CONTEXT` CLI defect (Foundation#363) was fixed and
released in Foundation 1.7.2 by
[Foundation#365](https://github.com/agent-teams-ai/engineering-foundation/pull/365).
Publication and the public Docs adapter 0.3.2 audit are operator-supplied evidence;
this source change does not independently repeat them.

`lint:typed` also runs Foundation's default explicit-unknown assertion gate.
Creation authority now constructs its three-element evidence tuple with checked,
typed elements. Commercial routing conformance uses the existing complete
in-memory subject and observes its real store transitions. No bridge admission
or suppression is needed for these former assertion chains.

`pnpm architecture:test:required` binds an exact critical file selection before
calling the installed `agent-teams-node-test --contract ... -- ...` command.
The consumer contract lists exact entry-file, ancestry and test-kind identities
for source boundaries, quality coverage and runner regressions. Completion,
omission, skipped identities, OS exception scope and whole-file selection drift
were verified through real installed Foundation 1.7.2 commands in disposable
fixtures. All ten required identities completed successfully; this portable
critical scope has no OS exceptions. The existing comprehensive Node runner is
retained alongside this small mandatory subset in fast and full gates.

The public Docs adapter 0.3.2 migrated the authentic stable25 origin to
`docs-2026-10-03-stable31` against protected Central revision
`2b9bc7397b2548b933532b9861d0fcc2d54c1901`. Its after-check returned current,
and the regenerated lock passes frozen install. The current exact development
pins are Foundation 1.7.2, Docs 0.6.2 and adapter 0.3.2. Historical receipts retain
their original Foundation 1.4.0 authority; they do not qualify this migration.
The `DOCS_CONSUMER_LOCKFILE_COHORT_MISMATCH` rejecting gate remains active.
Installed Docs, critical execution, changed/fast and the full local repository
gate passed. Final GitHub CI and ordinary observed binding remain pending.
The clean-checkout specification gate snapshots current tracked and intended new
source bytes, including the candidate lock, and reuses the installed pnpm store
for four separate frozen offline installs. It can qualify an uncommitted candidate
without substituting HEAD's earlier dependency or source bytes.

Consumer Module Standard is not adopted by Platform's current feature profile.
The retained upstream review adds an optional dynamic lifecycle candidate and
Host custody requirements; this upgrade does not establish a Host wiring scope,
plugin mechanism or SDK authority. Feature Module Standard v1 stays pinned.

## Capability registry

| Capability | Applicable | Enabled | Platform evidence or gate |
| --- | --- | --- | --- |
| `workspace.dependency-declarations` | Yes | Yes | Root pnpm workspace, exact catalog, and dev-only dependency policy |
| `repository.agent-workflow` | Yes | Yes | Canonical instructions and changed, fast, and full checks are declared |
| `documentation.local-references` | Yes | Yes | `docs` is checked with GitHub-compatible anchors and containment |
| `governance.architecture-decisions` | Yes | Yes | Seven accepted ADRs have a committed immutable baseline |
| `quality.source-coverage` | Yes | Yes | `quality-source-coverage.yaml` binds source classification, feature ownership, suppression policy, compiler projects and typed lint; `quality:scope` checks scope and `lint:typed` runs typed checks |
| `quality.suppression-governance` | Yes | Yes | Package, architecture-script, and executable-specification source roots are governed; no waiver currently exists |
| `quality.executable-specifications` | Yes | Yes | The Project Management model, property, mutation, and production-conformance bindings are blocking |
| `architecture.source-dependencies` | Yes | Yes | Schema v3 covers Project Management, executable specifications, and root `scripts` with `rootPackage: true` |
| Mandatory Node execution | Yes | Yes | `architecture:test:required` uses the public installed CLI and exact consumer contract; gate DAG orchestration is not enabled |
| Native checks | No | No | Current declared production roots contain TypeScript; `quality:scope` rejects an unsupported or unrouted new language |
| Dynamic plugins and SDK growth authority | No | No | No accepted dynamic Host or published SDK scope; release eligibility remains false |
| `contract.json-schema-releases` | Later | No | Current schemas are repository-internal architecture policy; no published release contract, release baseline, or consumer fixture set exists |
| `package.public-api-compatibility` | No | No | Platform publishes no versioned TypeScript API or SDK |
| `repository.security-baseline` | No | No | The repository currently publishes no package |
| `contract.protobuf-evolution` | No | No | Platform owns no Protobuf contract |

Capability presence in `foundation.config.yaml` means blocking. Deferred
capabilities are not represented by disabled placeholders or fabricated
evidence. When applicability changes, the enabling change adds consumer-owned
configuration, adversarial fixtures, and registry-backed CI evidence before it
deletes a donor check.

The full repository gate runs for pull requests, merge-queue synthetic commits,
and pushes to `main`. The fast gate retains Foundation, Docs, architecture,
lint, type, package, and direct executable-specification checks, but leaves the
four isolated clean-checkout reruns to the authoritative full gate. Platform
also owns exact validators for both privileged ReviewRouter workflow callers;
their triggers, filters, immutable producer refs, permissions, OIDC inputs, and
secret forwarding must change together with their target-owned qualification.

## Maintainability budgets

The shared Node and maintainability presets are blocking. Production code uses
500 effective lines per file, 150 per function, complexity 20, nesting depth 4,
and 5 parameters. Tests and fixtures use 800, 250, 30, 5, and 6. Generated and
vendored paths may disable only these five budgets. Any source suppression must
also satisfy the suppression-governance registry; an unregistered inline bypass
is not an exception mechanism.

## Scaffolding admission

The target catalog reserves reviewed package identities without creating package
directories. ADR-0007 accepts only the Project Management owner dossier, target,
and first `managed-project-scope-admission` slice for materialization. The other
six tactical dossiers and package targets remain `proposed`. Planning, applying,
and recovering any proposed target fail closed until its owning decision and
first real feature slice are accepted together.

Foundation owns the generic private Node TypeScript package envelope and the
deterministic Plan, Apply, and Recover protocol. Platform owns target identities,
roles, paths, names, owner documents, and future feature composition. Foundation
does not know Platform bounded-context names or domain layers.

The materializing change must:

1. accept the owner document through an immutable accepted ADR whose
   `accepts_package_targets` explicitly names the catalog target;
2. record that ADR as `owner_decision` and the first real feature as
   `first_feature` in the dossier;
3. include implementation and focused tests for that feature rather than an
   empty DDD tree;
4. commit the content-addressed Plan at
   `architecture/scaffolding/plans/<target-id>.json`;
5. retain its canonical intent at
   `architecture/scaffolding/intents/<target-id>.yaml` as append-only evidence;
6. apply that exact Plan and commit its validated Receipt at
   `architecture/scaffolding/receipts/<target-id>.json`;
7. retain the Plan read set as immutable historical evidence, revalidate current
   owner and catalog semantics independently, and prove package, repository,
   exact pre-overlay re-run, and Foundation crash-recovery checks.

Committed Plans, Receipts and qualification records are append-only evidence.
Pull-request and push CI compare them with the base revision: an existing record
cannot be edited, renamed or removed; a successor is added under a new identity.
Reproduction binds the compiler identity and the semantic Plan projection, but
not the compiler package version: upgrading Foundation must reproduce the same
intent, definitions, resolution, operations, diagnostics, project, authority,
and target without rewriting historical evidence.
Every accepted package exposes separate public, composition and worker surfaces,
declares a non-empty `check` script, and is covered by the fail-closed source
dependency graph.

The package catalog is a plan, not architectural acceptance. Strategic Context
Map acceptance is also not package acceptance. Changing a proposed tactical
boundary updates the catalog before materialization. Generated envelopes may be
extended by project-owned source in the same change. The exact Plan is rerun
before those overlays; later source evolution is checked as project-owned code,
not misrepresented as unchanged Plan output. Generated files are not hand-edited
before Plan application. Context package directories and evidence
must be regular repository paths, never symlinks. The validator rejects both
uncatalogued context packages and accepted targets without complete evidence.
Foundation governance remains the sole owner of ADR canonicalization and
immutable-digest verification. The Platform materialization gate consumes the
Foundation-owned accepted baseline instead of reimplementing its digest
algorithm.
