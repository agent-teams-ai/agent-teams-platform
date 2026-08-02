---
id: docs.index
type: index
status: active
owner: architecture
summary: Canonical navigation and authority index for Platform documentation.
---

# Technical Documentation

Read documentation by responsibility instead of scanning the whole repository.

## Architecture

- [Architecture index](architecture/README.md)
- [Deployment profiles](architecture/deployment-profiles.md)
- [Managed installation control](architecture/managed-installation-control.md)
- [Platform-Orchestrator boundary direction](architecture/platform-orchestrator-boundary.md)
- [Platform-Orchestrator design review](architecture/platform-orchestrator-review/README.md)

## Decisions

- [Decision index](decisions/README.md)
- [ADR-0001: Deployment profile lifecycle and v1 scope](decisions/0001-deployment-profile-lifecycle-and-v1-scope.md)
- [ADR-0002: PersonalSpace tenant ownership](decisions/0002-personal-space-tenant-ownership.md)
- [ADR-0003: Subject-bound Run revocation policy](decisions/0003-subject-bound-run-revocation-policy.md)
- [ADR-0004: Project retirement authority and disposition](decisions/0004-project-retirement-authority-and-disposition.md)
- [ADR-0005: Managed customer installation control](decisions/0005-managed-customer-installation-control.md)

## Sources of truth

| Concern | Canonical source |
| --- | --- |
| Decision rationale | Accepted ADR |
| Current profile status and evidence | `architecture/deployment-profiles/deployment-profiles.yaml` |
| Exact manifest shape | `architecture/deployment-profiles/deployment-profiles.schema.json` |
| Managed BYOC installation invariants | `architecture/managed-installation/managed-installation-policy.yaml` |
| Current architecture rules | Architecture documents |
| Cross-system proposal under review | Proposed boundary document and its eight review artifacts |

The manifest is operational truth. A roadmap target in an ADR never upgrades a
profile's current status.
