---
id: architecture.platform-orchestrator-boundary
type: architecture
status: proposed
owner: architecture/integration
summary: Product relationship, growth direction, and proposed integration boundary between Platform and Orchestrator.
related:
  - ADR-0001
  - ADR-0002
  - ADR-0003
  - ADR-0004
  - ADR-0005
  - ADR-0007
---

# Platform-Orchestrator Product Relationship and Boundary

This document remains `proposed` for exact Platform-Orchestrator contracts and
compatibility surfaces. ADR-0007 accepts Platform-side strategic ownership and
the seven product decisions, but it does not accept provider protocols, ACL
topology, wire schemas, or Orchestrator-owned models. Those rows still require
joint review and an owning cross-repository boundary decision.

## Product relationship and growth direction

Orchestrator is an open-source product designed for independent releases.
It can be self-hosted without the commercial Platform. It owns collaboration and
orchestration capabilities for standalone and managed customers. Platform is
the commercial hosted control plane around those capabilities: customer
administration, commercial access, managed delivery intent, and coordination of
managed Orchestrator deployments through explicit contracts. The broader
commercial product includes billing, but ADR-0007 leaves accounting, invoicing,
payments, and their future context boundaries unreserved.

The managed hosted product is intended to run agents on the service operator's
servers. This does not prescribe one dedicated Orchestrator instance per
customer. Customer ownership, semantic organizations, logical tenancy,
deployment boundaries, placement, and
physical isolation are separate dimensions. The
[deployment profiles](deployment-profiles.md) retain their own scope and
evidence requirements; Managed Shared SaaS is a v1 qualification target, while
Dedicated, BYOC, and Hybrid remain design-only scope.

The product should support a small human-and-AI team growing into a corporation,
with multiple semantic organizations, people and roles, collaborative Teams and
Tasks, and flexible organizational structures. Thousands of concurrently active
agents are a future scale objective, not a qualified capacity claim. Each
release and topology must establish measured admission, overload, cancellation,
recovery, and isolation limits before claiming support at that scale.

People and AI agents collaborate in the same visible Teams and Task system.
Tasks admit multiple views; Kanban is one presentation rather than the domain
model. Orchestrator owns Team, Work, and Run semantics. Human membership
in several Teams, one authorized personal-work query, and zero or more equal
executors on one Task are selected in [Orchestrator ADR-0111][collaboration-decision].
Assignment takes effect through an authorized command without a mandatory
offer, coordinator, or all-executor completion quorum. Work Coordination retains
one Task lifecycle and completion authority. Platform consumes these owner
contracts; it does not keep a second assignment or completion model.
Exact identities, persistence and successor contracts for the currently
Agent-specific roster remain open in [Orchestrator OD-048][mixed-participation].
Units or departments are possible structures for growth. This direction does
not accept a new human organization aggregate or automatic authorization
hierarchy, or replace existing Orchestrator Agent Organization decisions.

Task assignment does not grant access, approve a dangerous action, or start
an Agent or activate its runtime. Dangerous actions will need product approvals;
approver eligibility, exact action binding,
expiry, revocation and dispatch enforcement remain deferred research under
[Orchestrator OD-032][dangerous-action-approvals]. Product authorization, approval,
AR technical permission and Work completion retain separate owners. The exact
Platform authority and delegation mapping remains subject to the cross-repository
review below.

## Integration and reuse

Platform must consume Orchestrator-owned API and SDK contracts as they are
accepted and published. It must not implement a duplicate Task or orchestration
engine. Orchestrator owns those contracts and their semantic conformance;
Platform adapters map them into consumer-owned ports and local references.
Neither product imports the other's domain entities, accesses its database
directly, or joins the other's transaction.

The products are designed for independent releases. Managed delivery binds
compatible release and capability versions explicitly. Standalone Orchestrator core has no
mandatory commercial Platform or cloud-service dependency.

Concrete authentication, provider, transport, or relationship-projection
mechanisms already expected to serve both products follow the organization's
[library-first rule](https://github.com/agent-teams-ai/.github/blob/main/docs/engineering-quality-standard.md#library-first-design-and-deliberate-evolution):
design one reusable library from the start, with a deliberate owner and explicit
contract. Validate it with disposable consumers and at least one real consumer
in the same delivery; do not first duplicate the mechanism and wait for a second
implementation. A concrete repeated need still justifies the boundary, not
speculation about every possible future consumer. Share technical implementation
behind narrow ports and module contracts without merging product membership
policy, commercial decisions, Team composition, Task lifecycle, authorization
authority, or owner-local persistence.

Get Modular is the owner's mandatory TypeScript module composition foundation;
another homemade module framework is not the target. Each repository owns its
reviewed adoption, exact artifact pins, composition-seam inventory, nested
feature enforcement, and activation evidence. Orchestrator records its
foundation decision in [ADR-0110][modular-foundation]. Platform's
[local adoption record](feature-module-standard.md) distinguishes this required
direction from its current v1 profile. This document neither claims a completed
migration nor activates a new source topology.

The linked ADR-0110 belongs to the companion PR #86 history. Canonical
Orchestrator main separately accepts [ADR-0113][canonical-module-adoption], with
a different exact Consumer Module Standard pin and adoption scope. Reconcile
those sources before selecting a shared implementation baseline; this document
does not select a competing pin or adopt either profile for Platform by reference.

## Open mappings and future cooperation

An identity-provider organization, group, or project is an external
representation. It is not automatically a CustomerOrganization, product Tenant,
semantic AgentOrganization, Team, ProductProject, Orchestrator scope, or
deployment. Their bindings and lifecycle consequences require explicit owners.

Existing accepted constraints remain in force: a CustomerOrganization or
PersonalSpace may own multiple Tenant; each active Tenant has one owner binding;
each ProductProject belongs to one Tenant; and v1 has at most one active primary
managed orchestration-scope binding per ProductProject incarnation. These
constraints do not determine the complete organization-to-scope-to-deployment
mapping or physical isolation model. The
[resource identity and binding matrix](platform-orchestrator-review/02-resource-identity-binding-matrix.md)
retains the exact accepted and proposed distinctions.

Keycloak plus OpenFGA remains the owner's provisional IAM direction.
[Orchestrator OD-012][identity-decision] owns the provider decision; the
[identity-provider comparison][identity-research] archives the research and
qualification gaps. Neither establishes an accepted provider integration,
product hierarchy, or proof of revocation and provisioning behavior.

A shared visible Workspace may present authorized collaboration without owning
another Task or membership authority. **Execution Directory** is the selected
name for the managed filesystem resource used during agent execution, including
remote materializations; **Workspace** remains the UI collaboration and navigation
term. [Orchestrator ADR-0111][collaboration-decision] records this distinction
while preserving ADR-0062's registration, allocation and runtime-isolation
boundaries. Existing resource IDs and public contract names are unchanged;
exact contract spelling and any migration remain open in Orchestrator OD-019.

Cooperation between customers or independent installations is future work.
Accepted guest-access semantics require explicit membership, Tenant access,
delegation where applicable, scope, and current authorization under the owning
product's policy. Organization structure, shared hosting, a common identity
provider, or a shared view never grants inherited access to another customer.
Cross-installation work requires separately reviewed identity, trust,
authorization, data-sharing, lifecycle, and recovery contracts.

## IAM research follow-up

The [IAM critical-decisions review dated 2026-10-23][iam-critical-research]
records additional evidence for Platform Identity, Access and Authority, and
the cross-product authority adapters. Its recommendations remain unaccepted:
the report does not select production providers, accept exact contracts, or
authorize packages.

Platform-specific questions include shared-account login and recovery roots,
preserving B when A removes a person's membership, customer-scoped administration
and SCIM, and grant/revoke projection under stale writers, lost responses, and
restore. Membership removal alone cannot prove isolation if A still controls
a login or recovery root accepted for B. The owning review must qualify the
actual authentication and provisioning paths, not only membership deletion.

The report also evaluates managed, standalone, and personal-local authority
composition, browser/native credential custody, protected query disclosure, and
the minimum feature-owned dangerous-effect approval boundary. Existing ownership
remains intact: durable identity, membership, and grant facts belong to the
configured product authority; the Orchestrator ACL must not become a second
grant ledger. Commercial authority remains a separate capability, without
becoming a dependency of standalone Orchestrator.

Keycloak plus OpenFGA remains provisional. SpiceDB is a bounded consistency
comparator, not an accepted provider change. Personal single-owner local access,
neutral account recovery, fixed role templates, and a browser BFF are research
recommendations rather than selected Platform policy. The detailed options,
scores, estimates, primary sources, and qualification scenarios remain in the
linked report rather than a second research copy here.

## Cross-repository source records

The companion links below pin reviewed source at Orchestrator `51052e63`, from
[Orchestrator draft PR #86][orchestrator-pr]; the critical IAM report retains its
original publication snapshot. These are pending branch records, not merged
main-branch authority, implementation evidence, or deployment qualification.
Their owning accepted decisions and explicit open questions retain their status.
The PR link provides navigation to subsequent updates without changing these
reviewed source references.

- [Identity-provider comparison and source review][identity-research].
- [IAM critical decisions, adversarial review, and qualification questions][iam-critical-research].
- [Get Modular adoption and scale review][modular-research].
- [Collaboration, hierarchy, and Workspace review][collaboration-research].
- [Human collaboration and Execution Directory decision][collaboration-decision].

[mixed-participation]: https://github.com/agent-teams-ai/agent-teams-orchestrator/blob/51052e63cfefb372ad49af7a923185dcf0b00944/docs/open-decisions/OD-048-mixed-human-and-ai-team-participation.md
[collaboration-decision]: https://github.com/agent-teams-ai/agent-teams-orchestrator/blob/51052e63cfefb372ad49af7a923185dcf0b00944/docs/decisions/0111-human-collaboration-and-execution-directory-terminology.md
[dangerous-action-approvals]: https://github.com/agent-teams-ai/agent-teams-orchestrator/blob/51052e63cfefb372ad49af7a923185dcf0b00944/docs/open-decisions/OD-032-last-mile-side-effect-safety.md#deferred-dangerous-action-approval-research
[modular-foundation]: https://github.com/agent-teams-ai/agent-teams-orchestrator/blob/51052e63cfefb372ad49af7a923185dcf0b00944/docs/decisions/0110-mandatory-get-modular-and-nested-feature-foundation.md
[canonical-module-adoption]: https://github.com/agent-teams-ai/agent-teams-orchestrator/blob/94a480d004e8e6eaf79507feeae30428d372a3d3/docs/decisions/0113-canonical-module-and-composition-adoption.md
[identity-decision]: https://github.com/agent-teams-ai/agent-teams-orchestrator/blob/51052e63cfefb372ad49af7a923185dcf0b00944/docs/open-decisions/OD-012-identity-authorization-tenant-isolation.md
[identity-research]: https://github.com/agent-teams-ai/agent-teams-orchestrator/blob/51052e63cfefb372ad49af7a923185dcf0b00944/docs/research/identity-provider-comparison-2026-10-21.md
[iam-critical-research]: https://github.com/agent-teams-ai/agent-teams-orchestrator/blob/6564bfb21ff9e57fbbcd8d4b41eae209f813d7b8/docs/research/iam-critical-decisions-review-2026-10-23.md
[modular-research]: https://github.com/agent-teams-ai/agent-teams-orchestrator/blob/51052e63cfefb372ad49af7a923185dcf0b00944/docs/research/get-modular-adoption-and-scale-review-2026-10-21.md
[collaboration-research]: https://github.com/agent-teams-ai/agent-teams-orchestrator/blob/51052e63cfefb372ad49af7a923185dcf0b00944/docs/research/collaboration-hierarchy-and-workspace-review-2026-10-22.md
[orchestrator-pr]: https://github.com/agent-teams-ai/agent-teams-orchestrator/pull/86

## Agreed direction

```text
Platform or Standalone Authority identity
  -> stable Orchestrator identity and authority binding
  -> AR-owned runtime identity through a stateless Runtime ACL
```

- Platform semantic ownership covers customer organizations, product tenancy,
  product projects, principals, memberships, commercial entitlements,
  placement, and managed scope-admission intent. ADR-0007 accepts the seven
  strategic Platform boundaries and authorizes only the first Project Management
  tactical slice. The other six tactical aggregate models and package targets
  remain proposed. ADR-0005 separately confirms `PlatformInstallation`, desired
  installation revision, and signed immutable `DeploymentPlan` ownership for
  Managed BYOC.
- The Customer Installation Control Plane owns customer-side plan acceptance,
  `InstallationEnrollment`, the local authority epoch, the short-lived fenced
  writer lease, and installation reconciliation. It is not an Orchestrator
  adapter and it cannot grant product or runtime authority by itself.
- Orchestrator owns stable orchestration tenant and project identities,
  feature-specific decisions, and local aggregate preconditions. Stable
  orchestration principal identity remains a proposed supporting boundary under
  OD-012; teams, messages, and approval context boundaries also remain proposed.
- AR owns runtime scopes, sessions, operations, technical execution authority,
  execution fencing, provider effects, and recovery.
- AR's accepted cutoff and scope-disposition architecture closes the strategic
  ownership boundary. Exact Published Language names, fields, retention windows,
  and production HA mechanisms remain proposed or open until AR freezes them.
- AR ADR-0004 accepts the pre-materialization negative operation-intent guard.
  Deployment/scope authority, external authority-anchor leases, technical scope
  provisioning, and `TechnicalExecutionGrant` remain open follow-up contracts.
  They are not implementation authority until AR accepts them and publishes
  conformance fixtures.
- AR ADR-0005 accepts four private runtime context package identities. It does
  not accept a wire identity, Published Language artifact, runtime-scope API, or
  shared domain package.
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
  uses the AR-owned durable negative operation-intent guard accepted by AR
  ADR-0004. It serializes with operation acceptance and dispatch. A scoped
  `not_found` response or an Orchestrator-local tombstone is not equivalent
  proof. Exact wire schemas and producer fixtures remain implementation gates.
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

## Remaining cross-repository review gate

Before accepting the exact Platform-Orchestrator boundary, jointly review:

1. Authority ownership matrix.
2. Resource identity and binding matrix.
3. Principal and delegation model.
4. Capability authorization-port catalog.
5. Decision freshness and failure matrix.
6. Project provisioning and binding state machine.
7. Deployment and administration capability matrix.
8. Cross-repository contract and conformance ownership matrix.

Across the eight artifacts, every claim records its applicable semantic owner,
writer, persistence owner, public identity, external binding, source of truth,
consistency, failure behavior, reconciliation owner, retention/deletion owner,
consistency boundary, linearization point, revision or fence, idempotency scope
and horizon, stale-event behavior, and conformance owner. A row may link to the
owning matrix or failure trace instead of repeating dimensions that do not apply
to that surface.

The current proposed drafts are indexed in the
[Platform-Orchestrator design review](platform-orchestrator-review/README.md).
The review's
[managed scope admission and binding traces](platform-orchestrator-review/concurrency-failure-traces.md)
exercise lost responses, duplicate commands, stale revisions, concurrent
suspension, and partial failure without freezing unaccepted API names.
