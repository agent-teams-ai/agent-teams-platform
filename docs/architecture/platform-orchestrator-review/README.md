---
id: architecture.platform-orchestrator-review.index
type: index
status: proposed
owner: architecture/integration
summary: Review index for the eight proposed Platform-Orchestrator boundary artifacts.
related:
  - architecture.platform-orchestrator-boundary
  - ADR-0004
  - ADR-0005
---

# Platform-Orchestrator Design Review

These drafts integrate independent read-only reviews of Platform, Orchestrator,
AR, and the legacy failure model. ADR-0004 accepts the ProductProject authority
and retirement rows explicitly. ADR-0005 accepts the managed installation
split-control, plan-acceptance, customer-fencing, custody, and lifecycle rows.
Orchestrator ADR-0058, ADR-0062, ADR-0071, ADR-0079, and ADR-0080 accept the
narrow realtime, workspace/security, operation-identity, runtime-binding, and
Orchestration Scope semantics cited below. AR ADR-0003 and ADR-0004 accept
cutoff, disposition, and
pre-materialization prevention semantics while deliberately leaving their wire
contract and implementation qualification open. All remaining proposed rows
stay review material, not permission to materialize bounded contexts.

1. [Authority ownership matrix](01-authority-ownership-matrix.md)
2. [Resource identity and binding matrix](02-resource-identity-binding-matrix.md)
3. [Principal and delegation model](03-principal-delegation-model.md)
4. [Capability authorization-port catalog](04-capability-authorization-port-catalog.md)
5. [Decision freshness and failure matrix](05-decision-freshness-failure-matrix.md)
6. [Project provisioning and binding state machine](06-project-provisioning-binding-state-machine.md)
7. [Deployment and administration capability matrix](07-deployment-administration-capability-matrix.md)
8. [Cross-repository contract and conformance ownership](08-contract-conformance-ownership.md)

Supporting concurrency evidence:

- [Managed scope admission and binding failure traces](concurrency-failure-traces.md)

## Reviewed authority baseline

| Repository | Accepted semantic sources | Still open or unqualified |
| --- | --- | --- |
| Platform | ADR-0001 through ADR-0005 | Exact Platform bounded-context split, authority wire schemas, and production packages |
| Orchestrator | ADR-0058, ADR-0062, ADR-0071, ADR-0079, and ADR-0080 | OD-006 tactical aggregates, OD-012 principal/provider topology, OD-019 public identity representation, and OD-032 generic last-mile safety |
| Agent Runtime | ADR-0001 through ADR-0004 | Exact Published Language identities, services, messages, fields, retention windows, implementation, and production qualification |

The matrices cite these accepted sources at the narrowest applicable semantic
boundary. A source accepted in another repository confirms only the stated
ownership or behavior. It never confirms a Platform aggregate, a cross-system
wire schema, an implementation, or production qualification by implication.

## Status discipline

- `CONFIRMED` means an existing accepted source already establishes the rule.
- `PROPOSED` means the review recommends it but no owning ADR has accepted it.
- `OPEN` means implementation must not choose silently.
- `OUT_OF_SCOPE` means another owner or design track decides it.

`CONFIRMED` is a semantic status, not an implementation status. Every confirmed
row names an accepted source and states any representation or qualification
limit. A row backed only by an open decision, design review, or proposed contract
cannot be confirmed.

The automated gate validates frontmatter, canonical status syntax, known source
citations, evidence maturity, review-input classification, and substantive trace
shape. It cannot prove that arbitrary prose is semantically entailed by an ADR.
That remains the responsibility of the owning-repository review and is why these
artifacts stay `proposed` until explicitly accepted.

Taken together, the matrices and linked traces cover ownership, consistency,
failure, idempotency, retention, stale-event, and conformance dimensions. Each
row states its applicable dimensions and links to the owning matrix or trace for
the rest; it does not repeat fields that do not apply to that surface. A later
accepted ADR may reference these drafts, but it must state exactly which rows it
accepts or changes and close the complete claim record for each accepted row.
