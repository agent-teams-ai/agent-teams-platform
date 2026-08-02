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

| Status | Consumer-owned port | Semantic owner | Typed result |
| --- | --- | --- | --- |
| `PROPOSED` | `RunAdmissionAuthority` | Run Orchestration | `RunAdmissionConstraints` |
| `PROPOSED` | `RunContinuationAuthority` | Run Orchestration | `ContinuationConstraints` |
| `PROPOSED` | `RuntimeDispatchAuthority` | Run Orchestration | `RuntimeDispatchConstraints` |
| `PROPOSED` | `ApprovalDecisionAuthority` | Approval Management | `ApprovalAuthorityConstraints` |
| `PROPOSED` | `FeedSubscriptionAuthority` | Owning feed feature | `SubscriptionConstraints` |
| `PROPOSED` | `ScopeAdministrationAuthority` | Orchestration Scope | `ScopeTransitionConstraints` |

## Port rules

- Each port is owned by its consuming feature and speaks that feature's
  language.
- A shared outcome algebra may express `allowed`, `denied`, `indeterminate`,
  `stale`, and `unavailable`; constraints and reasons remain feature-specific.
- AuthorityProvider SPI is a public composition surface, not a domain service,
  SDK transport SPI, or export of internal feature ports.
- The concrete Managed ACL maps Platform Authority API DTOs to the
  provider-neutral SPI and keeps no durable binding state.
- Capability negotiation reports compatibility. It cannot grant permission.

## Proposed SPI topology

```text
Orchestrator feature-owned ports
  <- internal provider adapters
      <- public capability-specific AuthorityProvider SPI
          <- private Managed Authority ACL
              -> private Platform Authority API
```

The SPI requires its own Orchestrator ADR, package reservation, semantic version
policy, fake-provider suite, and adapter conformance suite before publication.

Runtime control and dispatch use separate AR-owned credentials. A short-lived
`TechnicalExecutionGrant` authorizes a concrete dispatch intent; a separately
scoped control grant authorizes AR runtime cutoff, technical suspension,
`RuntimeOperation` cancellation, or runtime-scope disposition.
Neither contract carries Platform principals, memberships, plans, billing IDs, or
free-form policy bags. Exact AR grant names and union variants remain proposed.

## Batch decisions

Batching is transport optimization only:

- one authority realm and Tenant partition per batch;
- independent identity, outcome, and evidence for every item;
- explicit partial responses;
- no cross-tenant batches;
- batching cannot extend validity or alter semantics;
- memoization key includes actor, subject, client, delegation, scope, action,
  revisions, and constraints digest.
