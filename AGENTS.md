# Agent Navigation

This file is a navigation layer, not a second architecture source of truth.

<!-- agent-teams-docs:route/v1 begin -->
Use [.agents/skills/docs-authoring/SKILL.md](.agents/skills/docs-authoring/SKILL.md) for documentation.
<!-- agent-teams-docs:route/v1 end -->

Start here:

- [Documentation index](docs/README.md)
- [Deployment profile architecture](docs/architecture/deployment-profiles.md)
- [Managed installation control](docs/architecture/managed-installation-control.md)
- [Accepted decisions](docs/decisions/README.md)
- [Machine-readable deployment profile manifest](architecture/deployment-profiles/deployment-profiles.yaml)
- [Machine-readable managed installation policy](architecture/managed-installation/managed-installation-policy.yaml)

## Hard rules

- Keep Platform, Orchestrator, and Agent Runtime identities and domain models
  separate. Cross-system references are opaque and mapped by ACLs.
- Do not create empty bounded-context, feature, adapter, or application packages.
  Materialize a package with its first accepted vertical slice.
- For that first package slice, use the Foundation scaffolding Plan/Apply
  protocol only after the accepted owner document defines its target ID, role,
  package path, and package name. Commit the target catalog, reviewed Plan, and
  resulting package together; never invent placeholder targets.
- Domain and application code must not branch on deployment profile, cloud,
  provider, desktop, Dedicated, BYOC, or Hybrid mode unless profile vocabulary
  is part of an explicitly registered owning Platform context. Even that owner
  cannot select adapters or import provider infrastructure.
- Deployment profiles select composition roots, adapters, and operational
  policies. Core use cases receive narrow typed capabilities.
- Never describe a profile as supported from roadmap intent. Use only the
  evidence-backed `DESIGNED`, `IMPLEMENTED`, and `QUALIFIED` vocabulary.
- Do not silently fall back to a weaker adapter or deployment profile.
- Keep installation reconciliation, scope admission, Run admission, runtime
  allocation, and execution dispatch as distinct lifecycles. New design must not
  use bare `provisioning` to hide which lifecycle owns a transition.
- Managed BYOC uses a signed Platform plan plus customer-side acceptance and a
  short-lived fenced writer lease. KMS custody is not writer fencing.
- Platform must not receive standing customer-cloud administration, raw provider
  credentials, or workspace contents.
- User-owned workspace source is unlink-only. Git mutation and managed-worktree
  removal require explicit owning operations and cannot be preflight repair.
- Keep accepted ADR history immutable. Supersede a decision with a new ADR.
- Keep unresolved cross-system design in proposed documents until the required
  matrices, state machines, and failure traces have been reviewed.
- Documentation, ADR, package-catalog, scaffolding-plan, and design-review
  approval is not implementation approval. Do not create or expand a production
  package, executable domain specification, public schema, adapter, migration,
  or behavioral test for a new vertical slice until the product owner gives a
  fresh explicit `GO TO CODE: <scope>` in the active task. Read-only review and
  explicitly requested documentation work remain allowed. Approval is bounded
  to the named scope and does not implicitly authorize the next slice.

## Foundation source policy

Foundation `architecture.source-dependencies` is schema v3: `rootPackage: true`
and `packageRoots` for every workspace package. Required CI runs
`agent-teams-foundation check` on the installed registry package. When that
gate reports a boundary violation, fix the source rather than shrinking scope
or adding a baseline:

- forbidden domain/tooling dependency -> introduce a consumer-owned port and
  adapter; do not import filesystem, environment, network SDK, or a concrete
  adapter into Project Management domain/application;
- deep import -> use the public entrypoint listed for that boundary;
- cross-package relative import -> package export or a dynamic repo-root load
  of compiled dist from a development boundary;
- new root or package -> owner, `packageRoots`/`rootPackage`, and a
  non-overlapping boundary, never an exclusion;
- `includeRootPackage` in YAML is invalid; public v3 uses `rootPackage: true`;
- CI greening by dropping a governed root, pending a root silently, or adding
  an unbounded suppression is forbidden.

## Verification

Run `pnpm check:changed` during implementation, then `pnpm check:fast` before
handoff. Run the authoritative `pnpm check` before opening or merging a pull
request. A passing changed-file or fast check never replaces the complete gate.
The deployment profile validator is blocking and scans future `domain/` and
`application/` source for forbidden profile coupling.

<!-- agent-teams:quality-standard:start -->
Before planning, implementing, or reviewing changes, read and follow the
[organization Engineering Quality Standard](https://github.com/agent-teams-ai/.github/blob/main/docs/engineering-quality-standard.md).
Apply it with this repository's instructions, accepted decisions and local
adoption profiles. This reference does not change pinned architecture contracts
or certify existing code as conformant.
<!-- agent-teams:quality-standard:end -->
