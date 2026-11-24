---
id: domain.contexts.deployment-management
type: bounded-context
status: proposed
owner: product/deployment-management
classification: supporting-strategic-enabling
package_target: context.deployment-management
summary: Proposed managed placement, installation intent, and signed deployment-plan boundary.
related:
  - ADR-0007
  - ADR-0001
  - ADR-0005
---

# Deployment Management

## Ubiquitous Language

- `PlatformInstallation`: Platform-owned desired installation identity.
- `DeploymentPlan`: immutable signed desired-state plan.
- `DesiredDeploymentRevision`: monotonic Platform intent revision.
- `DeploymentStamp`: managed placement target, not a Tenant or Project.
- `PlacementPolicy`: product policy selecting an eligible stamp or installation.
- `ReleasePolicy`: artifact/channel constraints for a deployment plan.

## Ownership

Deployment Management owns managed placement intent, PlatformInstallation,
desired revision, placement and release decisions constrained by typed commercial
inputs, and signed DeploymentPlan publication. Commercial Access remains the
owner of commercial entitlements and restrictions. ADR-0005 confirms deployment
intent ownership, and ADR-0007 accepts this strategic context boundary. Neither
decision accepts the complete tactical aggregate model, package, or wire schema.

## System of Record

The Deployment Management store is authoritative for PlatformInstallation
identity, desired revision, selected placement intent, release policy reference,
immutable signed-plan chain, and redacted reconciliation observations. Customer
writer authority, installation operation state, and AR runtime state remain in
their external owners.

## Aggregates

`PlatformInstallation` is the expected Platform Aggregate Root. Immutable plans
form a predecessor-linked publication chain. Exact placement aggregate,
multi-region model, and transaction boundaries remain proposed.

## Invariants

- PlatformInstallation never executes customer-local installation commands.
- DeploymentPlan binds installation, source incarnation, desired revision,
  predecessor digest, artifact/capability constraints, validity, and signature.
- Platform has no standing customer-cloud administrator or secret-decryption
  authority.
- Authority expansion requires Platform intent plus customer acceptance.
- KMS/HSM custody does not replace customer-side writer fencing.
- A process-alive observation never implies installation or runtime readiness.
- Deployment profile status does not branch domain or application behavior.

## Lifecycle

Platform desired intent, customer plan acceptance, local installation operation,
upgrade, rollback, uninstall, Orchestration Scope, and Run execution are separate
lifecycles. Managed BYOC remains `DESIGNED`, not implemented or qualified.

## Commands and Events

Proposed commands are `CreatePlatformInstallation`, `SelectDeploymentPlacement`,
`PublishDeploymentPlan`, `ReduceDeploymentAuthority`, and
`ReconcileInstallationCondition`. Proposed domain events cover installation
identity, desired revision, placement selection, plan publication/supersession,
and authority reduction. Customer plan-acceptance receipts are external
integration evidence, not Platform domain events.

## Features

- select managed placement from typed policy and capabilities;
- create PlatformInstallation desired state;
- publish immutable signed DeploymentPlan successors;
- revoke or reduce Platform deployment authority;
- consume redacted customer-local conditions and reconcile unknown outcomes;
- coordinate release and compatibility policy without executing installation.

## Dependencies

Tenancy supplies isolation/residency policy references. Commercial Access may
restrict eligible deployment tiers. Project Management consumes placement
results for managed scope admission. Customer Installation Control Plane is an
external upstream/downstream system with its own durable authority.

## Integration

The customer control protocol is mutually authenticated and customer-outbound
for steady-state BYOC. It returns typed conditions and opaque receipts. It never
exposes customer writer tokens, raw secrets, or cloud-admin credentials to
Platform. Lost plan-acceptance responses reconcile by plan identity and digest.

## Published Language

The proposed customer-control language contains immutable signed
`DeploymentPlan`, compatibility requirements, validity, predecessor digest, and
redacted typed conditions or opaque receipts. Platform-managed placement facts
use separate internal messages. Exact protocol, signature envelope, and artifact
manifest remain unqualified until their owning contract decision.

## Forbidden Dependencies

- no import of Tenant, ProductProject, OrchestrationProject, Run, runtime scope,
  or customer-control-plane aggregates;
- no cloud-provider SDK in domain or application policy;
- no customer writer token, cloud administrator credential, raw secret, or KMS
  plaintext path in Platform;
- no liveness-to-readiness inference or profile branch in domain/application;
- no direct installation command execution from the Platform aggregate.

## Not Owned

- customer-local InstallationEnrollment, writer lease, operation journal,
  inventory, upgrade, rollback, or uninstall mechanics;
- OrchestrationProject, Runs, scheduling, or RuntimeScopeBinding;
- AR runtime deployment identity, sessions, provider toolchains, credentials,
  effects, or technical authority;
- deployment profile qualification evidence owned by producer pipelines.

## Materialization Gate

ADR-0007 accepts the strategic context boundary but does not authorize this
package. Materialization requires an owning ADR for the first Managed Shared
SaaS placement/installation-intent slice, exact tactical boundaries, and
qualification evidence. Managed Dedicated, BYOC, and Hybrid remain design-only
until their exact compositions and gates exist. No cloud-specific package is
created speculatively.

## Foundation-first placement review, 2026-11-24

The [organization ecosystem vision](https://github.com/agent-teams-ai/.github/blob/bb7b1c00f18a8c532681f286afa51dda954469b4/docs/architecture/ecosystem-vision.md) prioritizes global architecture and qualified reusable foundations before main product implementation. The following design packet is proposed; ADR-0005/0007, Platform authority boundaries and the actual materialization gate remain in force.

Evaluate cell-ready placement before committing the tactical identity and storage contracts. Separate logical customer/project identity, desired placement, actual placement, deployment incarnation, authority and route revision. Platform owns managed placement intent and eligibility, not Orchestrator's scope binding or AR execution fencing.

| Alternative | Reliability /10 | Complexity /10 | Confidence /10 | Incremental implementation and test LOC |
| --- | ---: | ---: | ---: | ---: |
| Single initial stamp with cell-ready, location-independent contracts | 9 | 5 | 9 | 2,000–5,000 across owners |
| Multi-cell placement and transfer infrastructure immediately | 9 | 9 | 7 | 10,000–25,000 across owners |
| One permanently global deployment with horizontal replicas | 6 | 4 | 8 | 1,000–3,000 across owners |

Prefer the first hypothesis, subject to review. Before affected code, agree on an authority partition key, routing and transfer protocol, fencing/restore generations, eligibility and residency, large-tenant placement and independent failure/resource bounds. No physical shard ID becomes a business identifier. The old writer and external effects are fenced before activating a successor; uncertain transfer remains unavailable or reconciling. Define per-owner receipts and cross-store restore compatibility. A shared library can implement the mechanism, never the product decision.

Qualification should eventually exercise two placements, stale clients, a concentrated tenant, failed or ambiguous transfer, restore with newer external effects, and isolation of unrelated placements. Automatic rebalancing and multi-region deployment are later separately qualified profiles. Platform, Orchestrator and Runtime must agree on their interfaces before production implementation; none imports another owner's private data model.

## Open Decisions

- Managed Shared SaaS stamp/placement lifecycle and authority owner.
- Exact PlatformInstallation aggregate, plan publication transaction, and wire
  contract.
- First vertical slice, persistence and retention model, and package
  materialization decision.
- Cloud-specific external authority anchors and workload identities remain
  implementation qualification choices constrained by ADR-0005.
