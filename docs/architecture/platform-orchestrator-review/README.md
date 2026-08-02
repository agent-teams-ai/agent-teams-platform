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
All remaining proposed rows stay review material, not permission to materialize
bounded contexts.

1. [Authority ownership matrix](01-authority-ownership-matrix.md)
2. [Resource identity and binding matrix](02-resource-identity-binding-matrix.md)
3. [Principal and delegation model](03-principal-delegation-model.md)
4. [Capability authorization-port catalog](04-capability-authorization-port-catalog.md)
5. [Decision freshness and failure matrix](05-decision-freshness-failure-matrix.md)
6. [Project provisioning and binding state machine](06-project-provisioning-binding-state-machine.md)
7. [Deployment and administration capability matrix](07-deployment-administration-capability-matrix.md)
8. [Cross-repository contract and conformance ownership](08-contract-conformance-ownership.md)

## Status discipline

- `CONFIRMED` means an existing accepted source already establishes the rule.
- `PROPOSED` means the review recommends it but no owning ADR has accepted it.
- `OPEN` means implementation must not choose silently.
- `OUT_OF_SCOPE` means another owner or design track decides it.

Every matrix uses the same ownership, consistency, failure, idempotency,
retention, stale-event, and conformance dimensions. A later accepted ADR may
reference these drafts but must state exactly which rows it accepts or changes.
