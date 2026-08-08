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

Foundation-owned configuration and scaffolding contracts use the sole current
`schemaVersion: 1`. Platform updates that contract and all known consumers in
one coordinated change while independent compatibility is not required. A
parallel Foundation-owned v2 requires a new accepted Foundation ADR proving a
real non-atomic migration boundary. External formats retain their upstream
versions.

## Capability registry

| Capability | Applicable | Enabled | Platform evidence or gate |
| --- | --- | --- | --- |
| `workspace.dependency-declarations` | Yes | Yes | Root pnpm workspace, exact catalog, and dev-only dependency policy |
| `repository.agent-workflow` | Yes | Yes | Canonical instructions and changed, fast, and full checks are declared |
| `documentation.local-references` | Yes | Yes | `docs` is checked with GitHub-compatible anchors and containment |
| `governance.architecture-decisions` | Yes | Yes | Five accepted ADRs have a committed immutable baseline |
| `quality.suppression-governance` | Yes | Yes | Architecture tooling is governed; no waiver currently exists |
| `architecture.source-dependencies` | Later | No | No production package topology exists. Current scripts are development tooling whose runtime imports are intentionally dev-only |
| `contract.json-schema-releases` | Later | No | Current schemas are repository-internal architecture policy; no published release contract, release baseline, or consumer fixture set exists |
| `package.public-api-compatibility` | No | No | Platform publishes no versioned TypeScript API or SDK |
| `repository.security-baseline` | No | No | The repository currently publishes no package |
| `contract.protobuf-evolution` | No | No | Platform owns no Protobuf contract |

Capability presence in `foundation.config.yaml` means blocking. Deferred
capabilities are not represented by disabled placeholders or fabricated
evidence. When applicability changes, the enabling change adds consumer-owned
configuration, adversarial fixtures, and registry-backed CI evidence before it
deletes a donor check.

## Maintainability budgets

The shared Node and maintainability presets are blocking. Production code uses
500 effective lines per file, 150 per function, complexity 20, nesting depth 4,
and 5 parameters. Tests and fixtures use 800, 250, 30, 5, and 6. Generated and
vendored paths may disable only these five budgets. Any source suppression must
also satisfy the suppression-governance registry; an unregistered inline bypass
is not an exception mechanism.

## Scaffolding admission

The target catalog reserves reviewed package identities without creating package
directories. Its owner documents remain `proposed`, while the only Platform
composition accepts `status: accepted`. Planning, applying, and recovering a
current target therefore fail closed until the owning decision and first real
feature slice are accepted together.

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
5. apply that exact Plan and commit its validated Receipt at
   `architecture/scaffolding/receipts/<target-id>.json`;
6. prove current authority inputs still match the Plan read set, plus package,
   repository, crash-recovery, and idempotent re-run checks.

The package catalog is a plan, not architectural acceptance. Changing a proposed
boundary updates the catalog before materialization. Generated envelopes may be
extended by project-owned source in the same change, but generated files are not
hand-edited before Plan application. Context package directories and evidence
must be regular repository paths, never symlinks. The validator rejects both
uncatalogued context packages and accepted targets without complete evidence.
Foundation governance remains the sole owner of ADR canonicalization and
immutable-digest verification. The Platform materialization gate consumes the
Foundation-owned accepted baseline instead of reimplementing its digest
algorithm.
