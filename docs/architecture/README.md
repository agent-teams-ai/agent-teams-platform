---
id: architecture.index
type: index
status: active
owner: architecture
summary: Navigation for current and proposed Platform architecture.
---

# Architecture

- [Shared backend reference and Platform applicability](../decisions/0009-shared-backend-reference-and-public-api-hosting.md)
  records the reviewed central stack, public/private API boundary and capability
  scope without changing product ownership or release qualification.
- [Fully Local V1 and shared backend profiles](../decisions/0010-fully-local-v1-and-shared-backend-profiles.md)
  resolves the local V1 scope and preserves common owner code with separate
  composition, lifecycle and qualification responsibilities.
- [Feature module standard adoption](feature-module-standard.md) maps Platform
  ownership and enforcement to the [immutable v1 standard](feature-module-standard-v1.md).

- [Deployment profiles](deployment-profiles.md) defines accepted profile status
  semantics, v1 scope, composition boundaries, and qualification evidence.
- [Managed installation control](managed-installation-control.md) defines the
  accepted split-control, plan acceptance, fencing, offline, upgrade, and custody
  model for future customer-hosted installations.
- [Engineering Foundation adoption](engineering-foundation-adoption.md) records
  exact-version automation, active capabilities, and parity gates before local
  tooling can be replaced.
- [Managed scope-admission executable model](managed-scope-admission-executable-model.md)
  defines its internal test authority, modeled axes, and explicit evidence
  limits.
- [Platform-Orchestrator product relationship and boundary](platform-orchestrator-boundary.md)
  records the independent products, hosted relationship, growth direction,
  integration and reuse constraints, research navigation, and proposed exact
  cross-system contracts. ADR-0007 accepts the Platform-side strategic
  ownership, but not those external compatibility surfaces.
- [Platform-Orchestrator design review](platform-orchestrator-review/README.md)
  contains the eight proposed matrices, models, and state machines required by
  that review gate.
- [Platform strategic context map](../domain/context-map.md) defines the seven
  strategic boundaries, relationships, and explicit exclusions accepted by
  ADR-0007.
- [Bounded-context dossiers](../domain/contexts/README.md) hold tactical design
  and materialization gates. Only Project Management and its first
  `managed-project-scope-admission` slice are currently authorized; the other
  six dossiers and package targets remain proposed.

Strategic acceptance does not automatically accept a tactical aggregate model
or authorize a package. Substantial proposed dossiers may precede code when they
make language, ownership, invariants, lifecycle, and open decisions reviewable.
Empty dossiers and empty production packages remain forbidden. Materialization
requires an accepted owner document and the first accepted domain slice in the
same change.
