---
id: ADR-0005
type: adr
status: accepted
owner: product/deployment-management
summary: Use split control and customer-fenced plan acceptance for Managed BYOC installations.
approved_by: product-owner
accepted_at: 2026-08-02
related:
  - ADR-0001
  - architecture.managed-installation-control
  - architecture.platform-orchestrator-boundary
---

# ADR-0005: Managed Customer Installation Control

## Context

Managed BYOC places Orchestrator and Agent Runtime in customer infrastructure
while Platform remains the product authority and desired-state owner. Platform
must deliver releases and policy without receiving standing customer-cloud
administrator access, raw provider credentials, workspace contents, or the
ability to bypass customer policy.

A synchronous Platform check before every local mutation would make customer
infrastructure unavailable whenever Platform is unreachable. Giving the local
controller unilateral product authority would create the opposite problem. KMS
key custody alone does not fence concurrent writers or stale restored control
planes.

The legacy desktop product contributes useful operational cases: runtime
inventory, integrity-checked atomic installation, partial readiness, durable
launch evidence, cancellation cleanup, stale-generation fencing, diagnostics,
and resumable deletion. Its Electron services, process maps, SSH connection
manager, and overloaded `provisioning` vocabulary are not the target design.

## Decision

### Split semantic ownership

```text
Platform Deployment Management
  -> signed immutable DeploymentPlan
  -> customer Installation Control Plane
  -> accepted local plan + fenced writer lease
  -> component reconcilers

Orchestrator Run Orchestration
  -> runtime intent and technical grant
  -> Agent Runtime
  -> provider execution
```

- Platform owns `PlatformInstallation`, desired deployment revision, release
  policy, commercial authority, and signed `DeploymentPlan` publication.
- The customer Installation Control Plane owns `InstallationEnrollment`, local
  policy acceptance, installed inventory, local authority epoch, writer lease,
  reconciliation, upgrade, rollback, and uninstall mechanics.
- Orchestrator owns Project binding, Run admission, participant planning,
  scheduling, and durable orchestration operations. It does not install hosts or
  interpret customer-cloud credentials.
- AR owns runtime scopes, provider toolchains, provider authentication protocol,
  technical credentials enforcement, workspace containment, sessions,
  operations, effects, and recovery.
- A stateless ACL translates contracts. It owns no durable installation or
  runtime binding state.

`PlatformInstallation` never executes local installation commands. A local
controller is not an infrastructure adapter pretending to be stateless; it is a
technical control-plane subsystem with its own durable authority and lifecycle.

### Two-stage plan acceptance

Platform signs one immutable `DeploymentPlan` containing at least:

```text
planId
installationId
platformSourceIncarnation
desiredRevision
previousPlanDigest
planDigest
artifact and capability constraints
minimum controller version
issuedAt / notBefore / validUntil
platform deny or revocation epoch
```

The customer Installation Control Plane verifies Platform identity, signature,
chain continuity, expiry, local policy, customer approval when required, and
artifact constraints. Acceptance is one local transaction that records the
accepted digest, advances a monotonic `InstallationAuthorityEpoch`, revokes the
previous writer lease, and issues one short-lived fenced writer lease.

Authority expansion requires both valid Platform intent and customer acceptance.
Authority reduction may be initiated by Platform denial, customer denial, or an
AR safety cutoff. Reduction still has an explicit bounded propagation and
reconciliation path; it is never represented as instantaneous global success.

KMS or HSM provides key custody and signatures. It is not the writer-fencing
authority. The authority anchor and high-water marks live outside the ordinary
installation database backup domain.

### Connectivity and offline behavior

Steady-state Managed BYOC control is outbound-only from customer infrastructure
over mutually authenticated, challenge-bound channels. Platform has no standing
cloud-admin access and no decryption path for customer secrets.

Platform disconnect does not stop already accepted Runs. Existing execution is
governed by the Orchestrator authority snapshot and AR execution lease. The
customer controller may continue reconciling an accepted, unexpired plan, but
cannot expand authority from expired evidence. A successor plan is accepted only
when its own signature, validity, chain, compatibility, and consent evidence are
current.
New installation mutations fail closed when accepted-plan or writer-lease
authority is stale. Unknown state becomes `DEGRADED` or `ACTION_REQUIRED`, never
implicit success, downgrade, replacement deployment, or blind retry.

### Lifecycle and updates

Installation operations are durable, idempotent, generation-fenced, and
recoverable after process or host restart. Preflight proves OS and architecture,
disk, privilege, network, artifact provenance, compatibility, and drain
requirements before mutation. Install and update use staged artifacts, digest
verification, executable health checks, atomic publication, and explicit
rollback eligibility. A failed update preserves the last verified installation
when safety permits it; rollback never crosses an incompatible data or authority
boundary silently.

Component readiness is condition-based. The customer-facing summary may use
`SETTING_UP`, `OPERATIONAL`, `DEGRADED`, `ACTION_REQUIRED`, `DRAINING`,
`SUSPENDED`, `QUARANTINED`, and `RETIRED`, but those labels are projections over
typed conditions and do not authorize mutations.

### Installation and execution are different lifecycles

The design uses qualified terms:

- `InstallationPlan`, `InstallationOperation`, `InstallationReconciliation`,
  `InstallationUpgrade`, and `InstallationDisposition` for deployed software;
- `RunAdmission`, `RuntimeAllocation`, `ExecutionDispatch`, `RuntimeOperation`,
  and `ExecutionRecovery` for agent execution;
- `ScopeAdmission` and `ScopeBinding` for ProductProject-to-Orchestrator setup.

New design must not use bare `provisioning` to mean more than one of these
lifecycles. Installation state, Run state, participant readiness, runtime
session state, and provider effect state remain independently owned.

### Workspace, secrets, diagnostics, and support

- User-owned source is never deleted by installation or Project cleanup.
- Managed worktrees and clones default to `RETAIN`; destructive disposition
  requires exact ownership, dirty-state evidence, typed policy, and explicit
  authorization.
- Git initialization, staging, commit, or worktree removal is never an automatic
  preflight repair.
- Raw provider credentials do not enter Platform or Orchestrator. AR receives
  opaque secret references or ephemeral injection through customer-owned secret
  infrastructure.
- Diagnostics are generated and retained customer-side by default. Export uses a
  redacted preview, explicit customer approval, bounded scope, and expiry.
- SSH may be an explicit bootstrap or break-glass transport. It is not the
  steady-state Managed BYOC control plane.

## Consequences

- Managed BYOC remains `DESIGNED`, not `IMPLEMENTED` or `QUALIFIED`.
- Platform, customer policy, Orchestrator, and AR can deny unsafe work without
  sharing one god authority or distributed transaction.
- Customer outages and Platform outages have explicit bounded behavior instead
  of forcing either permanent connectivity or unsafe autonomous expansion.
- More durable plans, leases, receipts, conditions, and reconciliation paths are
  required, but each has one semantic and persistence owner.
- Exact cloud KMS, HA manager, artifact store, and controller packaging remain
  implementation and qualification decisions. They cannot weaken this ADR.
- Installation disposition drains and removes deployed components. It does not
  imply ProductProject retirement, Orchestration Scope deletion, AR effect
  completion, provider-account deletion, or worktree deletion; those remain
  separately authorized owner-local processes.

## Rejected alternatives

- Platform holding standing customer-cloud administrator credentials.
- A local controller with unilateral authority to expand product capabilities.
- Synchronous Platform authorization before every local reconciliation step.
- KMS key ownership as the only split-brain or rollback fence.
- SSH or an Electron connection manager as the permanent BYOC control channel.
- One global `READY`, `PROVISIONING`, or `DELETED` state across installation,
  orchestration, runtime, and provider effects.
- Automatic Git mutation or worktree deletion during launch, stop, or uninstall.
