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

## Engineering Foundation

The repository pins the latest reviewed and published
`@agent-teams/engineering-foundation` as an exact root `devDependency`.
Production code never imports it. `pnpm foundation:check` runs declared
capabilities and proves both development-only placement and registry-backed
lockfile integrity.

Dependabot remains enabled for npm security alerts and security update pull
requests. Ordinary Foundation version upgrades are coordinated manually as
dedicated exact-version pull requests. They are never floating or automerged:
the pull request must pass Foundation and all Platform checks before the exact
pin advances. Adding a capability is a separate architecture change and is not
implied by a package-version update.
