---
id: architecture.shared-research-integration
type: architecture
status: proposed
owner: architecture/integration
summary: Proposed research follow-through for deployment convergence, commercial authority and authorized views.
related:
  - ADR-0005
  - ADR-0007
  - ADR-0010
  - architecture.platform-orchestrator-boundary
---

# Shared Research Integration Plan

## Context

Proposed follow-through dated 2026-11-03 for source-backed competitor research.
The planned central source is `agent-teams-ai/engineering-research`,
`docs/competitors/paperclip.md`. Publication is pending; this path is a plan,
not a published source or evidence of completed migration.

## Ownership and boundaries

[ADR-0007](../decisions/0007-platform-strategic-context-map-and-first-project-management-slice.md)
owns strategic Platform boundaries. Commercial Access owns entitlements;
Deployment Management owns installation intent; Access and Authority owns
product grants. Runtime owns technical execution and physical cleanup.

## Model

Map reusable findings into the existing deployment, authority and authorized-view
contracts. Specify desired, accepted and observed revisions; preserve truthful
pending state; qualify resource policy changes and revocation under load.
The detailed acceptance mapping remains proposed within the existing owners.

## Evidence and open decisions

Read [deployment profiles](deployment-profiles.md),
[managed installation control](managed-installation-control.md) and the
[Platform-Orchestrator boundary](platform-orchestrator-boundary.md) first.
No deployment profile is promoted and no production package is admitted here.
