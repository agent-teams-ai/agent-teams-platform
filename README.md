# Agent Teams Platform

Private SaaS control plane for Agent Teams identity, tenancy, authorization,
commercial access, and managed service delivery.

The repository is currently in architecture-foundation phase. Production
bounded contexts and applications are created only after their ownership,
invariants, and first real vertical slice are accepted.

Start with:

- [Agent guidance](AGENTS.md)
- [Technical documentation](docs/README.md)
- [Deployment profiles](docs/architecture/deployment-profiles.md)
- [Managed installation control](docs/architecture/managed-installation-control.md)
- [Platform-Orchestrator boundary direction](docs/architecture/platform-orchestrator-boundary.md)

Run all current deterministic checks with:

```bash
pnpm install --frozen-lockfile
pnpm check
```
