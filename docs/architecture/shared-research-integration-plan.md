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
The shared [Paperclip source dossier](https://github.com/agent-teams-ai/engineering-research/blob/12c40892e805944719d6fbec14d2c26874803b2c/docs/competitors/paperclip.md)
was published in [Engineering Research PR #1](https://github.com/agent-teams-ai/engineering-research/pull/1) at commit
`12c40892e805944719d6fbec14d2c26874803b2c`. The [shared research index](https://github.com/agent-teams-ai/engineering-research/blob/main/docs/README.md)
is the maintained discovery route. Shared facts, comparisons and methods belong
centrally. The central corpus merged to `main` on 2026-11-05; publication accepts
no product policy. Platform retains its own architecture, decisions, integration
mapping and qualification.

The source review inspected Paperclip at
[`61e8d5c7eb097664958e00c30ccd88bb51359043`](https://github.com/paperclipai/paperclip/tree/61e8d5c7eb097664958e00c30ccd88bb51359043).
No competitor tests or fleet benchmark were executed for this documentation
change. Its resource quotas, execution ownership and bounded authorized viewer
delivery are positive evidence; a limitation in configuration reconciliation
or steady-state topology does not invalidate those protections.

## Ownership and boundaries

[ADR-0007](../decisions/0007-platform-strategic-context-map-and-first-project-management-slice.md)
owns strategic Platform boundaries. [Commercial Access](../domain/contexts/commercial-access/README.md)
owns entitlements and restrictions, not provider usage accounting or operational
budgets. [Deployment Management](../domain/contexts/deployment-management/README.md)
owns installation intent and signed plans. [Access and Authority](../domain/contexts/access-authority/README.md)
owns product grants, delegation and revocation semantics. Their detailed tactical
models remain proposed where the dossiers say so.

[ADR-0005](../decisions/0005-managed-customer-installation-control.md) owns the
split-control and fenced writer model. [ADR-0010](../decisions/0010-fully-local-v1-and-shared-backend-profiles.md)
owns Fully Local V1 and shared backend profiles. The current deployment manifest,
not research wording, records whether a profile is designed, implemented or
qualified. Orchestrator owns business coordination; Runtime owns technical
execution, capacity, physical cleanup and native custody.

## Model

The rows below propose detail within existing owners and acceptance. They do
not create a new controller, runtime quota service, operational budget domain,
production package or independent qualification gate.

| Priority and question | Existing owner and route | Proposed acceptance refinement |
| --- | --- | --- |
| Before entitlement integration: what does a commercial restriction mean? | Commercial Access and the receiving product capability | Map one exact entitlement/restriction revision into a narrow accepted capability. Distinguish commercial permission, technical resource quota and operational budget. Reducing an entitlement must not silently expand authority while its projection catches up. |
| Before deployment integration: which revision is authoritative? | Deployment Management and [managed installation control](managed-installation-control.md) | Show desired, customer-accepted and observed revisions separately. A stored configuration or successful create request does not establish applied policy. Retain signed plan, customer acceptance and fenced writer identities. |
| Before changing a live profile: is the field mutable? | Deployment profile and installation owner | Classify selected fields as immutable with deliberate replacement, or mutable through an explicitly supported reconciliation operation. Do not infer update semantics from create-if-absent behavior. Avoid a universal infrastructure controller. |
| During reconciliation: can stale work enlarge access? | Installation writer and Access and Authority | Race two reconcilers, change quota/network policy while work runs, lose an acknowledgement and restart on an older revision. Reject stale writer expansion; expose pending, degraded or reconciliation-required state honestly. |
| During view delivery: who may observe which detail? | Owning Platform query capability and client delivery edge | Separate bounded latest summaries from explicitly selected detailed streams. Check current authorization at the applicable boundary; qualify subscription bounds, slow viewers, revocation, replay gaps and resynchronization. Runtime receipts remain their own authority. |
| During cross-product integration: what is completed? | Existing [Platform-Orchestrator review](platform-orchestrator-review/README.md) | Keep installation reconciliation, scope admission, Run admission, runtime allocation, dispatch and physical cleanup distinct. Removal or revocation may complete its own boundary while cleanup remains pending elsewhere. |
| Before profile qualification: what fleet is actually supported? | Deployment manifest and existing qualification owner | Record one large tenant and multiple tenants, active executions, sessions, pending work/bytes, viewers, pools, hosts, provider limits, output and cleanup debt. Qualify local, self-hosted and managed deployment compositions separately. |

### Practical sequence for entitlement and deployment integration

For the selected entitlement or deployment slice, first freeze the meanings and
owner mapping of the fields that slice consumes. Then define one concrete
installation change with
its accepted/preconditioned state transition and failure outcomes. Add the
smallest disposable integration that can falsify stale-writer rejection and
truthful observed state. Reuse the existing review matrices and executable
specification where they cover the same invariant; record uncovered behavior
there instead of creating another model of the same authority.

Keep full local and self-hosted capability in scope under the accepted profiles.
A local deployment need not instantiate Kubernetes resources. Profile selection
and provider infrastructure remain composition/adapters; core use cases consume
narrow capabilities. Managed BYOC retains customer-side acceptance and short-lived
writer fencing. Platform has no standing customer-cloud administration or
decryption path; raw provider credentials stay out of Platform and Orchestrator,
with AR using the declared customer-owned secret reference or ephemeral injection
boundary.

For views, first deliver bounded summaries for a real product journey and one
selected transcript route where that journey needs it. Bound retained bytes,
item count and subscription cardinality, and make gaps explicit. A separate
presentation service is an implementation alternative only after measured load
or isolation needs justify its extra failure and deployment boundaries.

## Fleet and rollout follow-through (2026-11-27)

The [research action index](https://github.com/agent-teams-ai/engineering-research/blob/e2a5f6c47e008f93094dc88ed39ea9618722f28d/docs/lessons/preimplementation-decisions.md#priorities-before-the-affected-implementation)
routes the latest source-backed findings to existing owners. The commitments
below guide the affected design; exact multi-cell and compatibility choices
remain proposed. They do not promote a deployment profile or add a release gate.

The [managed installation contract](managed-installation-control.md#distinct-authority-dimensions)
already separates desired revision, enrollment incarnation, local authority
epoch, writer lease and product/runtime generations. Its acceptance, recovery
and custody rules close those baseline findings; retain them instead of creating
another authority model. [Deployment profiles](deployment-profiles.md#scaling-rules)
keep stable identities, standalone independence and evidence-backed qualification.

1. **Placement ownership.** Platform owns managed installation intent and
   deployment topology. Orchestration Scope retains Project-to-runtime binding
   authority under [Orchestrator ADR-0079](https://github.com/agent-teams-ai/agent-teams-orchestrator/blob/3dccf2c53bf11f3939a19734a58f5e64d96673d0/docs/decisions/0079-runtime-authority-binding-cutoff-and-disposition.md).
   A route directory or observation cannot become a second binding writer.
   Keep physical cell placement out of stable product identity and do not move
   an existing Run implicitly when a routing or installation revision changes.
2. **Future physical moves.** A separately selected cross-cell profile must
   preserve original command IDs/digests, receipts, deduplication/tombstones,
   pending outbox work and unresolved obligations through each owning transfer
   boundary; do not assume atomic commit across stores. Name source fencing,
   destination staging, the authority handoff and recovery at each durable step.
   AR retains physical execution custody;
   lease expiry, a copied database or a deployment status does not prove release.
   This is a future profile refinement, not first-slice migration implementation.
3. **Mixed-version rollout.** Keep desired, accepted, staged, active and observed
   states distinct. A deployment or readiness ACK does not prove useful work
   by the intended generation. The receiving owner checks actual contract and
   capability versions; retain compatible old recovery/cleanup paths until
   their obligations end. Rollback to compatible content uses fresh authority,
   never an old epoch. Reuse existing [upgrade and rollback](managed-installation-control.md#upgrade-and-rollback)
   policy and owner receipts rather than a second update controller.
4. **Partition and revocation.** Access and Authority and the receiving owner
   specify the applicable freshness/cutoff and fail-closed boundary. Test stale
   grants, lost Platform connectivity, delayed revocation and restored state;
   no layer may expand another owner's authority or silently weaken isolation.
   Preserve [bounded offline reconciliation](managed-installation-control.md#offline-and-recovery)
   under accepted unexpired evidence. Do not require a synchronous Platform
   lookup on every agent step; delegated/local evidence needs its declared
   freshness and receiver enforcement, and uncertain effects remain unresolved.

Reuse the existing [cross-repository review matrices and failure traces](platform-orchestrator-review/README.md)
for stale-writer rejection, lost ACK, mixed versions and one isolated tenant/cell
while unrelated admitted work continues. Add only uncovered cases for the
selected profile. These are documentation targets, not executed qualification,
a new shared scheduler, or permission to rewrite accepted ADRs.

## Evidence and open decisions

Read [deployment profiles](deployment-profiles.md),
[managed installation control](managed-installation-control.md), the
[Platform-Orchestrator boundary](platform-orchestrator-boundary.md) and its
[review index](platform-orchestrator-review/README.md) before applying these
lessons. Existing immutable research links and owner-specific matrices remain
valid historical evidence. Central publication cannot accept a proposed
cross-system wire contract or promote a deployment profile.

The shared [evaluation method](https://github.com/agent-teams-ai/engineering-research/blob/12c40892e805944719d6fbec14d2c26874803b2c/docs/methodology/evaluation-methodology.md)
and [decision cards](https://github.com/agent-teams-ai/engineering-research/blob/12c40892e805944719d6fbec14d2c26874803b2c/docs/lessons/preimplementation-decisions.md)
distinguish inspected source, existing upstream tests, reported component evidence
and unexecuted product qualification. The [source inventory](https://github.com/agent-teams-ai/engineering-research/blob/12c40892e805944719d6fbec14d2c26874803b2c/data/source-inventory.json)
retains original evidence identities; Platform's boundary and review matrices
remain local. Do not infer
active-fleet capacity from package/module counts, controller fixtures or
Runtime's ordinary S1-S5 program; its separate C0-C3 capacity delivery owns that
technical envelope. Cross-pool global/tenant/provider accounting needs one
explicit authority in the responsible product, not independent whole-allowance
counters in every pool.

This change adds documentation only: zero production implementation lines.
Future estimates subtract already-planned installation, authority and client
work and count the remaining slice once. Concrete alternatives receive the
repository's confidence, reliability and complexity scores with scoped
production, test and deployment costs when an implementation decision is needed.
No new production package or profile is admitted by this proposal.

## Evolution-readiness application (design guidance)

The organization [evolution-readiness proposal](https://github.com/agent-teams-ai/.github/blob/ea13fbfc7965fce16d9af3c4d7cf8dcca6ff6d29/docs/architecture/evolution-readiness.md)
supplies the common authoring and evidence baseline. These owner-local
applications are proposed design guidance, not new grants or adopted
deployment profiles.

- Deployment Management keeps desired/accepted/staged/active/observed
  revisions and rollout eligibility at its existing owner. Preserve mixed
  version and fresh-authority rollback semantics before implementing a
  cohort; use LMU only for the real qualified replacement operation, not
  another deployment controller.
- Project Management preserves stable logical identities and explicit
  authorized export/import and deletion epochs. Separate physical backup,
  installation transfer and mergeable offline drafts; do not introduce
  two authoritative writers for execution, grants or commercial state.
- Access and Authority retains subject, actor, audience, scope, expiry and
  current receiver enforcement; optional workload identity federation
  and delegated/local evidence must fit existing IAM decisions.
- Commercial Access and evaluation owners retain their own authoritative
  criteria and receipts; model quality/rollout eligibility cannot imply
  permission or a second budget authority.

Use existing review matrices and deployment/profile qualification for
stale grants, wrong cohort, incompatible rollback and restored/deleted data.
Reuse existing GM/EF/LMU mechanisms and Foundation evidence routes where
applicable; the local first profile does not require an extra flag server,
identity federation, sync engine, global version schema or new shared
scheduler. Select stronger guarantees only with a named consumer and
deliberately rejecting evidence.
