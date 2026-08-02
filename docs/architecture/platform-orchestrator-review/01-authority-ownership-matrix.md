---
id: architecture.platform-orchestrator-review.authority-ownership
type: architecture
status: proposed
owner: architecture/integration
summary: Proposed semantic ownership boundaries for Platform, authorities, Orchestrator, and AR.
related:
  - architecture.platform-orchestrator-boundary
  - ADR-0002
  - ADR-0003
  - ADR-0004
  - ADR-0005
---

# Authority Ownership Matrix

| Status | Capability | Semantic owner | Writer | Persistence and source of truth |
| --- | --- | --- | --- | --- |
| `PROPOSED` | Customer organization lifecycle | Platform Customer Organization | Platform use case | Platform DB and aggregate |
| `PROPOSED` | Tenant isolation and lifecycle | Platform Tenancy or Standalone Authority | Owning authority use case | Owning authority store |
| `CONFIRMED` | Product project identity lifecycle | Platform Project Management | Platform use case | Platform DB and ProductProject `OPEN -> RETIRED` aggregate |
| `CONFIRMED` | Project admission restrictions and effective gate | Owning Platform authority capability plus Project Management gate | Typed source command and gate use case | Exact restriction records and Project admission authority |
| `CONFIRMED` | Product project retirement commitment | Platform Project Management | ProductProjectRetirementProcess | Commitment, policy/catalog revisions, obligations, and opaque receipts in Platform DB |
| `CONFIRMED` | Owner-local Project disposition | Each Platform, Orchestrator, or AR data owner | Owning disposition use case | Owner-local records, receipts, tombstones, and outbox |
| `PROPOSED` | Principal and membership lifecycle | Platform Identity and Access | Identity provisioning and membership use cases | Platform authority store |
| `PROPOSED` | Commercial entitlements | Platform Commercial Access | Platform entitlement use case | Platform commercial store |
| `CONFIRMED` | Personal customer ownership | Platform customer-ownership domain | PersonalSpace lifecycle use cases | Platform DB and PersonalSpace aggregate |
| `CONFIRMED` | Managed installation desired state and signed plan | Platform Deployment Management | Platform installation use case | Platform DB, `PlatformInstallation`, and immutable signed `DeploymentPlan` |
| `CONFIRMED` | Customer-side installation plan acceptance and writer authority | Customer Installation Control Plane | Customer installation use case | Customer authority store, `InstallationEnrollment`, local authority epoch, and short-lived fenced writer lease |
| `CONFIRMED` | Managed installation software reconciliation | Customer Installation Control Plane | Installation operation executor | Customer-side operation journal, verified artifacts, activation generation, and receipts |
| `PROPOSED` | Stable orchestration principal identity | Orchestration Principal Registry | Trusted binding and rebinding use cases | Orchestrator DB |
| `PROPOSED` | Stable orchestration scope and authority binding | Orchestration Scope | Trusted provisioning use case | Orchestrator DB |
| `CONFIRMED` | Teams, Work, Runs, Messages, product approvals | Owning Orchestrator BC | Owning use case | Owning Orchestrator persistence |
| `CONFIRMED` | Runtime scopes, execution, technical permissions, fencing | AR | AR use case | AR persistence |
| `CONFIRMED` | Provider toolchain and provider credential lifecycle | AR capability | AR-owned installer and secret adapters | AR-owned capability state and opaque secret references |

## Authority rules

- Platform and Standalone Authority are alternative product authority providers.
- Orchestrator rechecks its own aggregate revision, admission state, deletion
  epoch, and domain invariants. External evidence cannot decide them.
- AR never interprets SaaS plans, memberships, Platform principals, or Platform
  project IDs.
- Commercial entitlement may be mapped to a feature-specific capability, but
  cannot replace Consumption Governance or operational usage truth.
- Shared domain entities across repositories are forbidden.
- Orchestrator does not own customer installation, customer-cloud credentials,
  binary installation, or customer-side writer authority. Its installation role
  is limited to exposing typed scope and Run capabilities to composition.
- A stateless ACL translates representations only. Durable acceptance, epochs,
  leases, checkpoints, or binding state always belong to an owning capability.

## Consistency and failure

| Boundary | Linearization point | Revision or fence | Failure and reconciliation |
| --- | --- | --- | --- |
| Platform aggregate | State, receipt, and outbox commit | Aggregate revision and lifecycle epoch | Same semantic command replays receipt; Platform reconciles external steps |
| Project restriction and effective gate | Exact restriction mutation plus gate CAS | Source revision and admission revision | One source cannot clear another; stale or gapped authority fails closed |
| ProductProject retirement | ProductProject CAS plus receipt and outbox | Lifecycle revision and retirement epoch | Cancel or commit wins once; committed identity never reopens |
| Owner-local disposition | Local freeze or action-claim CAS | External retirement epoch plus owner revision | Unknown outcome is queried by original command; no global rollback |
| Read-only authority decision | Evaluation over one consistent authority snapshot and revision set | Authority, principal, delegation, entitlement revisions and validity | No mandatory write; `denied`, `indeterminate`, `stale`, and `unavailable` stay distinct |
| Authority reservation or state-consuming decision | Owning authority aggregate commit | Reservation revision, authority revisions, expiry, and idempotency fingerprint | Same semantic request replays its receipt; conflicting fingerprint is rejected |
| Decision audit or signed evidence issuance | Authority evaluation, or audit/evidence commit when policy gates release | Evidence digest, validity, audience, and relevant authority revisions | Durable evidence is required only when the capability policy requires it; audit failure follows that policy and never silently downgrades risk |
| Orchestrator mutation | Owning aggregate UoW commit | Aggregate revision, admission revision, deletion epoch | Stale evidence has no mutation; owning process reconciles |
| AR technical effect | AR dispatch CAS before effect | Scope revision, authority generation, private fence | Ambiguous acceptance enters reconciliation; blind retry forbidden |
| Platform installation plan publication | PlatformInstallation commit plus immutable plan and outbox | Desired revision, plan digest, chain predecessor, and validity | Same semantic request replays the plan reference; Platform reconciles delivery |
| Customer plan acceptance | One customer-authority transaction | Expected accepted revision, plan digest, local authority epoch, and predecessor lease | Invalid, stale, expired, or capability-expanding-without-consent plans have no side effect |
| Customer installation mutation | Operation claim CAS before local effect | Accepted plan revision, installation authority epoch, and short-lived writer lease | Unknown effect becomes `RECONCILE_REQUIRED`; replacement operation or blind retry is forbidden |

## Confirmed product decisions

- `CONFIRMED`: ADR-0002 models a Personal Account as the distinct
  `PersonalSpace` Aggregate Root, with `TenantOwnerRef =
  CustomerOrganizationRef | PersonalSpaceRef` owned by Tenancy.
- `CONFIRMED`: ADR-0003 suspends subject-bound Run authority, advances its
  generation, blocks new dispatch, requests cutoff and containment for active
  operations, and preserves the Run for reconciliation, explicit cancellation,
  retention disposition, or reauthorization.
- `CONFIRMED`: ADR-0004 separates terminal ProductProject identity, revisioned
  admission authority, retirement commitment, owner obligations, policy, export,
  and evidence. `RETIRED` never claims physical erasure.
- `CONFIRMED`: ADR-0005 separates Platform installation intent from customer-side
  acceptance and execution, requires a fenced single writer, forbids standing
  Platform cloud administration, and keeps installation authority independent
  from Orchestrator Run and AR execution authority.

## Open decisions

- `OPEN`: exact bounded contexts for Platform Identity, Tenancy, and Project
  Management.
- `OPEN`: cloud-specific external authority anchors, workload identities, and
  fencing mechanisms are qualification choices. Their required semantics are
  fixed by ADR-0005; no provider is selected by the domain.
- `OUT_OF_SCOPE`: each authority provider owns its `AuthorityRealm` lifecycle;
  Orchestrator owns only realm bindings and migration state. The cross-system
  lifecycle protocol is a jointly reviewed technical contract, never a jointly
  owned aggregate.
