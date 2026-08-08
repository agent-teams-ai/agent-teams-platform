---
id: domain.contexts.commercial-access
type: bounded-context
status: proposed
owner: product/commercial-access
classification: supporting
package_target: context.commercial-access
summary: Proposed commercial agreement, subscription, entitlement, and restriction boundary.
related:
  - architecture.platform-orchestrator-review.authority-ownership
---

# Commercial Access

## Ubiquitous Language

- `Subscription`: commercial agreement state, not an authorization role.
- `Entitlement`: versioned commercial capability granted to a customer scope.
- `CommercialRestriction`: exact restriction emitted from commercial policy.

These names remain proposed until the product model is accepted.

## Ownership

Commercial Access owns product plans, subscriptions, commercial entitlements,
and commercial restrictions. It does not own credit, rating, invoicing, payment,
tax, Run, Work, provider, or operational budget truth.

## System of Record

The proposed commercial store is authoritative for agreements, subscription and
entitlement revisions, and exact commercial restrictions. Orchestrator remains
authoritative for operational usage and consumption governance. Any future
Commercial Accounting store requires a separately proven bounded context.

## Aggregates

No aggregate boundary is accepted. CommercialAgreement, Subscription, and
EntitlementGrant are candidates with potentially different consistency
boundaries. Credit ledger, rating, invoice, tax, and payment are deliberately
excluded rather than forced into one Billing aggregate or generic policy object.

## Invariants

- Plan and subscription names never cross into Orchestrator or AR domain.
- Commercial entitlement maps to capability-specific decisions, not a generic
  string capability bag.
- A commercial restriction cannot clear security, tenant, manual, or retirement
  restrictions.
- A missing or unavailable commercial decision never silently grants access.
- Future exact quantities and money never use JavaScript `number` or become
  fields of an Entitlement merely to avoid a separate accounting lifecycle.

## Lifecycle

Agreement, subscription, entitlement, and restriction lifecycles remain open
under `PO-PLAT-004`. Billing, credit, rating, correction, and invoice lifecycles
are outside this candidate context. Commercial-system outage behavior must be an
explicit capability-specific policy; no silent fallback is allowed.

## Commands and Events

Candidate command families create or change a Subscription, grant or revoke an
exact Entitlement, and apply or release a CommercialRestriction. Candidate events
describe only revisioned agreement, subscription, entitlement, and restriction
state. Credit, usage ingestion, rating, correction, payment, and invoice commands
belong to future independently modeled capabilities.

## Features

- subscription and entitlement administration;
- capability-specific commercial access decisions;
- exact commercial restrictions for Project admission;
- versioned agreement and entitlement observations.

## Dependencies

Customer Ownership and Tenancy supply opaque customer scope. Project Management
consumes exact CommercialRestriction records. A future Commercial Accounting ACL
may consume Orchestrator usage facts, but Commercial Access does not import its
ledger or payment/tax provider models.

## Integration

Cross-context contracts carry versioned capability outcomes and exact restriction
facts, not plan names, prices, invoices, usage facts, or shared tables. A future
accounting context consumes operational facts through its own ACL.

## Published Language

The proposed language contains capability-specific commercial outcomes,
`CommercialRestrictionFact`, and revisioned entitlement observations. Plan names,
payment-provider DTOs, usage facts, rating evidence, generic policy maps,
operational budget state, and floating-point money are excluded.

## Forbidden Dependencies

- no import of PlatformPrincipal, Tenant, ProductProject, Run, Work, or AR
  aggregates;
- no direct write into Project restrictions or Orchestrator usage ledgers;
- no plan or subscription vocabulary in Orchestrator and AR contracts;
- no shared transaction with payment, tax, Project admission, or usage owners;
- no temporary credit, rating, or invoice fields inside Subscription or
  Entitlement aggregates.

## Not Owned

- authentication, memberships, roles, or product-operation policy;
- Run/Work usage observations and operational attribution;
- user-configured budgets, alerts, reservations, and hard operational limits;
- credit ledger, usage rating, invoice, payment, tax, and billing corrections;
- AR CPU, memory, process, output, or execution limits;
- generic Project lifecycle or restriction aggregation.

## Materialization Gate

Materialization is forbidden until `PO-PLAT-004` defines agreement,
subscription, entitlement, restriction, outage behavior, and a first commercial
access slice. Commercial Accounting remains unreserved and may be introduced
later without a shared domain package.

## Open Decisions

- `PO-PLAT-004`: subscriptions, entitlements, credits, overage, invoices, and
  billing restrictions.
- Commercial authority during subscription or entitlement provider outage.
- Whether later credit/rating/invoicing language proves one or several
  independently evolving contexts.
