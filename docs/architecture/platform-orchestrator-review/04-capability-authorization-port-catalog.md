---
id: architecture.platform-orchestrator-review.authorization-ports
type: architecture
status: proposed
owner: architecture/authority
summary: Proposed consumer-owned authority ports and feature-specific decision constraints.
related:
  - architecture.platform-orchestrator-boundary
---

# Capability Authorization-Port Catalog

| Status | Provisional consumer-owned port | Semantic owner | Typed result | Acceptance source and limit |
| --- | --- | --- | --- | --- |
| `PROPOSED` | `RunAdmissionAuthority` | Run Orchestration | `RunAdmissionConstraints` | Consumer-owned-port pattern is accepted; exact port remains under Orchestrator OD-012 |
| `PROPOSED` | `RunContinuationAuthority` | Run Orchestration | `ContinuationConstraints` | Platform ADR-0003 fixes revocation behavior, not this interface |
| `PROPOSED` | `RuntimeDispatchAuthority` | Run Orchestration | `RuntimeDispatchConstraints` | Orchestrator ADR-0079 fixes ownership and last-mile boundaries; exact port remains open |
| `PROPOSED` | `ApprovalDecisionAuthority` | Approval Management | `ApprovalAuthorityConstraints` | Review proposal; no owning approval ADR accepts this interface |
| `PROPOSED` | `FeedSubscriptionAuthority` | Owning feed feature | `SubscriptionConstraints` | Orchestrator security/realtime semantics are accepted; exact authority port remains open |
| `PROPOSED` | `ScopeAdministrationAuthority` | Orchestration Scope | `ScopeTransitionConstraints` | Orchestrator ADR-0080 fixes ownership; exact authority port remains under OD-012 |

## Port rules

- Each port is owned by its consuming feature and speaks that feature's
  language.
- A shared outcome algebra may express `allowed`, `denied`, `indeterminate`,
  `stale`, and `unavailable`; constraints and reasons remain feature-specific.
- If accepted, the AuthorityProvider SPI is a public composition surface, not a
  domain service, SDK transport SPI, or export of internal feature ports.
- In the proposed topology, the concrete Managed ACL maps Platform Authority API
  DTOs to the provider-neutral SPI and keeps no durable binding state.
- Capability negotiation reports compatibility. It cannot grant permission.

## Proposed SPI topology

```text
Orchestrator feature-owned ports
  <- internal provider adapters
      <- public capability-specific AuthorityProvider SPI
          <- private Managed Authority ACL
              -> private Platform Authority API
```

This topology remains `PROPOSED`. The SPI requires its own Orchestrator ADR,
package reservation, semantic version policy, fake-provider suite, and adapter
conformance suite before publication. No production package may be inferred from
this catalog.

`OPEN`: the future AR Published Language must define technical dispatch and
control authorization. `TechnicalExecutionGrant` and `control grant` are
provisional aliases, not accepted AR types. Exact names, signing, claim unions,
dispatch/control separation, handshake, and retention require an AR contract
decision. Any eventual contract must exclude Platform principals, memberships,
plans, billing IDs, and free-form policy bags.

## Batch decisions

Batching is transport optimization only:

- one authority realm and Tenant partition per batch;
- independent identity, outcome, and evidence for every item;
- explicit partial responses;
- no cross-tenant batches;
- batching cannot extend validity or alter semantics;
- memoization key includes actor, subject, client, delegation, scope, action,
  revisions, and constraints digest.
