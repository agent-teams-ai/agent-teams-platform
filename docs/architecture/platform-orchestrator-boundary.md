---
id: architecture.platform-orchestrator-boundary
type: architecture
status: proposed
owner: architecture/integration
summary: Proposed authority, identity, provisioning, and binding boundary between Platform and Orchestrator.
related:
  - ADR-0001
  - ADR-0002
  - ADR-0003
  - ADR-0004
  - ADR-0005
---

# Platform-Orchestrator Boundary Direction

This direction is intentionally `proposed`. It must not become a superseding ADR
until the required matrices, state machines, concurrency cases, and partial
failure traces have been reviewed by both repositories.

## Agreed direction

```text
Platform or Standalone Authority identity
  -> stable Orchestrator identity and authority binding
  -> AR-owned runtime identity through a stateless Runtime ACL
```

- Platform owns customer organizations, product tenancy, product projects,
  principals, memberships, commercial entitlements, placement, and managed
  scope-provisioning intent. Platform Deployment Management additionally owns
  `PlatformInstallation`, desired installation revision, and the signed
  immutable `DeploymentPlan` for Managed BYOC.
- The Customer Installation Control Plane owns customer-side plan acceptance,
  `InstallationEnrollment`, the local authority epoch, the short-lived fenced
  writer lease, and installation reconciliation. It is not an Orchestrator
  adapter and it cannot grant product or runtime authority by itself.
- Orchestrator owns stable orchestration tenant, project, and principal
  identities; feature-specific decisions; local aggregate preconditions; teams,
  work, runs, messages, and orchestration lifecycle.
- AR owns runtime scopes, sessions, operations, technical execution authority,
  execution fencing, provider effects, and recovery.
- AR's accepted cutoff and scope-disposition architecture closes the strategic
  ownership boundary. Exact Published Language names, fields, retention windows,
  and production HA mechanisms remain proposed or open until AR freezes them.
- AR deployment/scope authority, external authority-anchor leases, technical
  scope provisioning, and `TechnicalExecutionGrant` semantics remain a separate
  proposed AR ADR-0004. They are not implementation authority until AR accepts
  that decision and publishes conformance fixtures.
- Cross-system IDs remain opaque. Shared domain packages are forbidden.
- Platform authority evidence binds an explicit outcome to authority realm,
  audience, typed tenant or project scope, action, actor, subject, client,
  delegation, Platform revisions, validity, typed constraints, and an opaque
  audit reference. It cannot assert Orchestrator deletion epoch, admission
  revision, or aggregate state.
- Managed scope admission and binding is an internal service surface distinct
  from user-facing Platform administration and standalone scope administration.
- Installation lifecycle, orchestration-scope lifecycle, and Run execution
  lifecycle are separate. The bare word `provisioning` is not a sufficient
  name for a new operation, state machine, contract, or package.

## Decisions carried into the design artifacts

- Durable Runs require an immutable `AuthorityBasisSnapshot`. The preliminary
  tagged variants are `TenantAutonomousBasis` and `SubjectBoundBasis`.
  `actor`, `subject`, and OAuth `client` remain orthogonal; a client never
  replaces principal authority. `SubjectBoundBasis` must distinguish a direct
  subject grant from a delegation instead of inventing self-delegation. Product
  behavior follows ADR-0003, while exact contract variants remain subject to the
  principal/delegation and Orchestrator reviews.
- Platform-to-Orchestrator authority bindings use the closed
  `AuthorityBindingSlot` vocabulary. V1 contains only `PRIMARY`.
  Orchestrator-to-AR `RuntimeScopeBinding` has its own stable binding identity
  and generation; it does not inherit the authority-binding slot.
- `AuthorityBasisSnapshot` captures immutable semantic authority. Refreshing
  short-lived evidence for the same basis and authority revision neither
  rewrites that snapshot nor advances `RunAuthorityGeneration`. Per-action
  evidence remains separately bound to purpose, intent, validity, and basis.
- Verified subject revocation advances `RunAuthorityGeneration` and suspends Run
  authority in the same transaction that records one bounded cutoff trigger.
  Reauthorization advances the generation again and creates a successor basis,
  but does not reopen dispatch before predecessor enforcement and reconciliation
  gates pass. `SUSPENDED` is not evidence that runtime enforcement has completed.
- Platform personal ownership follows ADR-0002: `PersonalSpace` is a separate
  Aggregate Root, while Tenant owns the authoritative closed `TenantOwnerRef`.
- Product deletion intent, orchestration-scope disposition, and AR runtime-scope
  disposition are independently owned durable processes. Logical access
  closure, runtime containment, physical erasure, artifact disposition, and
  legal hold are separate stages and evidence sets.
- ADR-0004 fixes ProductProject identity as `OPEN -> RETIRED`. Provisioning,
  readiness, access restrictions, retirement commitment, disposition, export,
  and evidence are independent axes. `RETIRED` is terminal product identity,
  not a claim that every physical copy was erased.
- Platform Project admission is an authoritative revisioned gate over exact
  source-owned restrictions. `SUSPENDED` is a read classification; removing one
  restriction cannot remove another source's security, tenant, billing, manual,
  or retirement restriction.
- Cancel and irreversible retirement commit serialize through one ProductProject
  CAS. The winning commit advances the retirement epoch and outbox atomically.
  Every downstream owner then commits its own project freeze before inventory or
  irreversible disposition.
- Platform lifecycle policy is first translated into an Orchestrator-owned
  disposition intent by the managed lifecycle ACL. A separate stateless Runtime
  ACL then translates that normalized technical intent into AR-owned plan types.
  The Runtime ACL never imports Platform legal-policy DTOs.
- Run Orchestration owns a bounded participant binding and a durable per-target
  runtime inventory. It must not place an unbounded collection of RuntimeOperation
  references, effect identities, feed cursors, or receipts inside one binding
  aggregate.
- Run-specific cutoff that reaches AR before the original operation command
  requires an AR-owned durable negative operation-intent guard serialized with
  operation acceptance and dispatch. A scoped `not_found` response or an
  Orchestrator-local tombstone is not equivalent proof; this remains an explicit
  contract gate.
- In v1, sharing one RuntimeSession across unrelated Runs is disabled by default.
  A future profile may enable it only through an explicit, qualified operation-
  isolation capability and policy.
- Cross-tenant ProductProject transfer is unsupported in v1. A future transfer
  is a dedicated migration process with destination identity and source
  tombstone.
- `@agent-teams/platform-authority-contracts` starts as a private versioned
  artifact. Private managed composition owns the concrete Managed Authority ACL.
  A deliberately public, provider-neutral Orchestrator AuthorityProvider SPI may
  expose stable capability-specific composition interfaces, but never internal
  feature ports or Platform DTOs. Its exact topology requires an Orchestrator ADR.
- Different lifecycle, membership, or data policy requires a separate
  ProductProject. A placement-only difference uses a RuntimeScopeBinding. An
  incarnation means recreation or lost continuity, never merely dev, staging,
  or production environment naming.
- Standalone-to-managed migration creates a new scope by default. Identity
  preservation requires a later explicit migration contract.
- Managed BYOC uses two-stage plan acceptance. Platform signs an immutable plan;
  the customer control plane validates and atomically accepts it, advances its
  local authority epoch, revokes the predecessor writer lease, and issues one
  short-lived fenced writer lease. KMS key custody does not replace this fence.
- Authority expansion requires Platform intent and customer acceptance.
  Reduction can be caused independently by Platform denial, customer denial, or
  AR safety cutoff. No layer may silently broaden another layer's authority.
- Managed BYOC steady-state control is customer-outbound and mutually
  authenticated. Platform has neither standing customer-cloud administration
  nor a customer-secret decryption path. Offline reconciliation may continue
  only against an accepted unexpired plan; uncertainty becomes a typed degraded
  or reconciliation state, never an implicit fallback.

## Review gate

Before a superseding ADR, produce and review:

1. Authority ownership matrix.
2. Resource identity and binding matrix.
3. Principal and delegation model.
4. Capability authorization-port catalog.
5. Decision freshness and failure matrix.
6. Project provisioning and binding state machine.
7. Deployment and administration capability matrix.
8. Cross-repository contract and conformance ownership matrix.

Every row identifies semantic owner, writer, persistence owner, public identity,
external binding, source of truth, consistency, failure behavior,
reconciliation owner, retention/deletion owner, consistency boundary,
linearization point, revision or fence, idempotency scope and horizon,
stale-event behavior, and conformance owner.

The current proposed drafts are indexed in the
[Platform-Orchestrator design review](platform-orchestrator-review/README.md).
