---
id: domain.contexts.commercial-access
type: bounded-context
status: proposed
owner: product/commercial-access
classification: supporting
package_target: context.commercial-access
summary: Proposed subscription, entitlement, credit, and commercial-restriction boundary.
related:
  - architecture.platform-orchestrator-review.authority-ownership
---

# Commercial Access

## Ubiquitous Language

- `Subscription`: commercial agreement state, not an authorization role.
- `Entitlement`: versioned commercial capability granted to a customer scope.
- `CreditBalance`: exact commercial value with unit and revision.
- `CommercialRestriction`: exact restriction emitted from commercial policy.
- `CommercialUsageFact`: immutable downstream fact used for rating or billing.

These names remain proposed until the product model is accepted.

## Ownership

Commercial Access owns product plans, subscriptions, commercial entitlements,
credits, and commercial restrictions. It may consume operational usage facts,
but it never becomes the source of Run, Work, provider, or operational budget
truth.

## System of Record

The proposed commercial store is authoritative for agreements, subscription and
entitlement revisions, exact credit values, commercial restrictions, rating
inputs, immutable corrections, and future invoice evidence. Orchestrator remains
authoritative for operational usage and consumption governance.

## Aggregates

No aggregate boundary is accepted. Subscription, entitlement grant, credit
ledger, invoice, and rating may prove different lifecycles and future bounded
contexts. They must not be forced into one Billing aggregate or generic policy
object before discovery.

## Invariants

- Plan and subscription names never cross into Orchestrator or AR domain.
- Commercial entitlement maps to capability-specific decisions, not a generic
  string capability bag.
- A commercial restriction cannot clear security, tenant, manual, or retirement
  restrictions.
- Exact quantities and money never use JavaScript `number`.
- Usage observation, consumed quantity, rated quantity, cost, credit, and invoice
  are distinct facts with versioned correction semantics.
- Unknown price or missing usage evidence never becomes an exact zero cost.

## Lifecycle

Subscription, entitlement, credit, billing, correction, and invoice lifecycles
remain open under `PO-PLAT-004`. Operational usage continues independently during
commercial-system outages according to explicit fail-closed admission policy;
no silent fallback is allowed.

## Commands and Events

Candidate command families create or change a Subscription, grant or revoke an
exact Entitlement, apply or release a CommercialRestriction, record a usage fact,
append a rating correction, and reserve or consume credit only after its
consistency model is accepted. Candidate events describe revisioned commercial
state and immutable corrections. Names and aggregate routing remain proposed
under `PO-PLAT-004`.

## Features

- subscription and entitlement administration;
- capability-specific commercial access decisions;
- exact commercial restrictions for Project admission;
- credit reservation or balance only after its consistency model is accepted;
- downstream usage ingestion, correction, rating, and future invoicing.

## Dependencies

Customer Ownership and Tenancy supply opaque customer scope. Orchestrator Usage
Metering and Usage Accounting supply versioned downstream operational facts.
Project Management consumes exact CommercialRestriction records. Payment and tax
providers remain outbound adapters behind owning ports.

## Integration

Cross-repository contracts carry versioned capability outcomes and immutable
usage facts, not plan names or shared tables. Corrections append new evidence;
they do not rewrite another owner's operational accounting.

## Published Language

The proposed language contains capability-specific commercial outcomes,
`CommercialRestrictionFact`, immutable usage-fact acceptance, and append-only
rating/correction evidence with exact units and versions. Plan names, payment
provider DTOs, generic policy maps, operational budget state, and JavaScript
floating-point money are excluded.

## Forbidden Dependencies

- no import of PlatformPrincipal, Tenant, ProductProject, Run, Work, or AR
  aggregates;
- no direct write into Project restrictions or Orchestrator usage ledgers;
- no plan or subscription vocabulary in Orchestrator and AR contracts;
- no shared transaction with payment, tax, Project admission, or usage owners;
- no `number` for exact quantity, price, credit, tax, or monetary amount.

## Not Owned

- authentication, memberships, roles, or product-operation policy;
- Run/Work usage observations and operational attribution;
- user-configured budgets, alerts, reservations, and hard operational limits;
- AR CPU, memory, process, output, or execution limits;
- generic Project lifecycle or restriction aggregation.

## Materialization Gate

Materialization is forbidden until `PO-PLAT-004` defines the commercial product,
exact quantity and money model, failure policy, correction semantics, and first
vertical slice. A later Commercial Accounting split remains possible without a
shared domain package.

## Open Decisions

- `PO-PLAT-004`: subscriptions, entitlements, credits, overage, invoices, and
  billing restrictions.
- Commercial authority during billing outage and delayed usage correction.
- Whether rating/invoicing proves an independently evolving context.
