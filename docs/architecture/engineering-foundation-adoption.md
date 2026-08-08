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

Foundation scaffolding becomes active only when an accepted first vertical
slice provides a real target ID, role, package path, package name, and owner
document. The same change creates the Platform target catalog and composition,
saves and reviews the deterministic Plan, applies it, and proves the resulting
package with the normal checks.

No target catalog or empty package is created in advance. Current Platform ADRs
define domain ownership but do not yet reserve concrete package identities, and
the repository hard rule forbids using scaffolding to guess them. This gate is
an intentional application of scaffolding authority, not a missing placeholder.
