---
id: architecture.feature-module-standard
type: architecture
status: active
owner: architecture
summary: Map Platform feature ownership to the organization Feature Module Standard v1.
---

# Feature module standard adoption

Platform adopts the organization feature module standard v1 for its bounded
project-management context. Production code is owned by the feature layers in
`architecture/foundation/feature-modules.json`; tests remain test-owned.

Run `pnpm architecture:features:check` and `pnpm quality:scope` before review.

The [immutable v1 text](feature-module-standard-v1.md) retains its pinned bytes.
Its catalog metadata lives in `architecture/foundation/document-metadata.yaml`;
that sidecar supplies local navigation metadata, not a second standard.

The feature checker validates the standard digest, source-policy package topology,
materialized package identities, declared roots, nonempty layers, test paths and
feature ownership. The current profile admits no generated roots or ownership
exceptions; adding either requires an owning decision and rejecting fixtures. Foundation's existing source
policy owns dependency direction and public import boundaries; Platform's domain
materialization gate owns accepted package topology. Run all of these gates:
the feature checker alone does not establish full standard conformance.

Feature tests map to the package-relative path
`tests/features/managed-project-scope-admission`; package
boundary tests remain module-owned under `tests`. No production composition or
Consumer Module Standard adoption is introduced by this profile.

## Required module foundation and pending adoption

The product owner requires Get Modular as Platform's TypeScript module
composition foundation. New composition must not introduce a competing homemade
framework. Orchestrator's corresponding decision and activation requirements are
preserved in historical [ADR-0110][orchestrator-modules] and reconciled by
ADR-0117 in [PR #86][orchestrator-pr], retaining the canonical ADR-0113 baseline; its
[adoption and scale research][module-research] retains the supporting evidence
and limitations. Both links point to the branch for
[draft PR #86][orchestrator-pr], not merged main-branch authority.

This framework direction does not silently migrate Platform's current v1 feature
profile or assert that Get Modular has been installed. Platform still needs its
own reviewed adoption binding the exact Consumer Module Standard, organization
Feature Module Standard, published module artifacts, composition-seam inventory,
nested source enforcement, lifecycle failures, and measured initial scale.
Qualify this foundation and account for current composition seams before broad
feature expansion; an adoption record alone does not establish readiness.
Preserve the retained immutable v1 bytes and current gates until that adoption
explicitly changes them. No profile migration or new topology is activated here.

[orchestrator-modules]: https://github.com/agent-teams-ai/agent-teams-orchestrator/blob/docs/mandatory-modules-and-collaboration/docs/decisions/0110-mandatory-get-modular-and-nested-feature-foundation.md
[module-research]: https://github.com/agent-teams-ai/agent-teams-orchestrator/blob/docs/mandatory-modules-and-collaboration/docs/research/get-modular-adoption-and-scale-review-2026-10-21.md
[orchestrator-pr]: https://github.com/agent-teams-ai/agent-teams-orchestrator/pull/86
