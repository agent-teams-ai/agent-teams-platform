---
id: architecture.engineering-foundation-adoption
type: architecture
status: active
owner: architecture
summary: Define exact-version and capability-by-capability Engineering Foundation adoption for Platform.
---

# Engineering Foundation Adoption

Platform consumes `@agent-teams/engineering-foundation` only as an exact root
`devDependency`. The package supplies generic engineering mechanisms; Platform
continues to own deployment profiles, bounded contexts, source relationships,
security classifications, workflow inventory, exceptions, ADRs, and fixtures.
Production code cannot import Foundation.

## Version policy

The manifest and lockfile pin the latest reviewed version that actually exists
in the npm registry. The organization Renovate configuration opens an
exact-version update pull request after a new release appears. It never
automerge Foundation updates. `latest`, ranges, Git branches, unpublished
release branches, local links, and tarball overrides are forbidden in committed
or CI state.

A package update does not enable a capability. Capability configuration changes
are separate architecture changes with Platform-owned evidence.

## Current capability plan

| Capability | Platform status |
| --- | --- |
| `workspace.dependency-declarations` | Blocking now; validates generic workspace and exact dependency policy |
| `architecture.source-dependencies` | Deferred until production package topology exists and parity with Platform's local boundary fixtures is proven |
| `quality.suppression-governance` | Candidate after Foundation ADR-0003 and a Platform-owned waiver/protected-rule decision are accepted |
| `package.public-api-compatibility` | Deferred until Platform publishes a versioned TypeScript API or SDK with release-owned baselines |
| `repository.security-baseline` | Candidate after Foundation ADR-0005 and Platform's exact workflow, privileged-job, SBOM, and publishable-package inventory are accepted |

For every new capability, Platform pins its schema, supplies strict data-only
configuration, dual-runs any local donor check, and proves normalized diagnostic
parity on positive and adversarial fixtures. A local validator is deleted only
after the Foundation capability is blocking in registry-backed CI and rollback
is an exact dependency revert.

Foundation ADR status remains independent from Platform adoption. Publishing a
package containing candidate code does not make the policy accepted here.
