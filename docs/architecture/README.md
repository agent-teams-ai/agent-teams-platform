---
id: architecture.index
type: index
status: active
owner: architecture
summary: Navigation for current and proposed Platform architecture.
---

# Architecture

- [Deployment profiles](deployment-profiles.md) defines accepted profile status
  semantics, v1 scope, composition boundaries, and qualification evidence.
- [Managed installation control](managed-installation-control.md) defines the
  accepted split-control, plan acceptance, fencing, offline, upgrade, and custody
  model for future customer-hosted installations.
- [Engineering Foundation adoption](engineering-foundation-adoption.md) records
  exact-version automation, active capabilities, and parity gates before local
  tooling can be replaced.
- [Platform-Orchestrator boundary direction](platform-orchestrator-boundary.md)
  records the proposed cross-system model that must be proven by matrices and
  failure traces before a superseding ADR.
- [Platform-Orchestrator design review](platform-orchestrator-review/README.md)
  contains the eight proposed matrices, models, and state machines required by
  that review gate.
- [Platform strategic context map](../domain/context-map.md) proposes Platform
  bounded contexts, relationships, explicit exclusions, and the first vertical
  slice without accepting production packages.
- [Bounded-context dossiers](../domain/contexts/README.md) hold substantial
  discovery evidence and materialization gates for each candidate.

Substantial proposed dossiers may precede code when they make language,
ownership, invariants, lifecycle, and open decisions reviewable. Empty dossiers
and empty production packages remain forbidden. Materialization requires an
accepted owner document and the first accepted domain slice in the same change.
