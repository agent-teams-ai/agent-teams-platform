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

Feature tests map to `tests/features/managed-project-scope-admission`; package
boundary tests remain module-owned under `tests`. No production composition or
Consumer Module Standard adoption is introduced by this profile.
